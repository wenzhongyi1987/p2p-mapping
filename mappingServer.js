const net = require('net')
const io = require ('socket.io-client')
const Peer = require('simple-peer')
const EventEmitter = require('events')

class MappingServer extends EventEmitter {
  constructor(server_port) {
    let self = this
    self.server_id = undefined
    self.his.server_port = server_port // server port to be published to peer.
    self.clientDict = {}

    let socket = io('http://localhost:' + listenPort);
    socket.on('connect', () => {
      socket.emit('server-register', {})
    })
    socket.on('server-registered', (data) => {
      console.log('server-registered:', data)
      self.server_id = data.server_id
      self.emit('server-registered', server_id)
    })
    socket.on('client-signal', (data) => {
      console.log('client-signal:', data)
      let { client_id, signalData } = data
      if (!(client_id in self.clientDict)) {
        let server_peer = new Peer({ initiator: true }) //create specific server_peer for this client.
        server_peer.signal(signalData)
        server_peer.on('signal', signalData => { // server response
          socket.emit('server-signal', { client_id, server_id:self.server_id, signalData })
        })
        server_peer.on('connect', () => {
          self.clientDict[client_id].peer_connected = true
        })
        server_peer.on('data', ({client_id, subClientId, data}) => {
          if (self.clientDict[client_id].peer_connected &&
              subClientId in self.clientDict[client_id].subClientDict &&
              self.clientDict[client_id].subClientDict[subClientId].connected2LocalServer) {
            self.clientDict[client_id].subClientDict[subClientId].socket2server.send(data)
          }
        })
        self.clientDict[client_id] = {
          subClientDict:{},
          server_peer,
        }
      }
    })
    socket.on('disconnectRemoteServer', ({ client_id, subClientId }) => {
      console.log('disconnectRemoteServer received, client_id:', client_id, 'subClientId:', subClientId)
      if (subClientId in self.clientDict[client_id].subClientDict[subClientId]) {
        self.clientDict[client_id].subClientDict[subClientId].socket2server.end() //close the socket to local server.
      }
    })
    socket.on('connectRemoteServer', ({ client_id, subClientId }) => {
      const socket2server = net.createConnection({ port: parseInt(self.server_port)}, () => {
        // 'connect' listener
        console.log('connected to server!')
        self.clientDict[client_id].subClientDict[subClientId].connected2LocalServer = true
        socket.emit('remoteServer-connected', {server_id:self.server_id, client_id, subClientId})
      })
      socket2server.on('data', (data) => {
        server_peer.send({ client_id, subClientId, data})
      })
      socket2server.on('end', () => {
        console.log('disconnected from server')
      })
      socket2server.on('close', err => {
        console.log('socket closed with local server, err:', err)
        socket.emit('remoteServer-disconnected', {server_id:self.server_id, client_id, subClientId})
        delete self.clientDict[client_id].subClientDict[subClientId]
      })
      socket2server.on('error', (err) => {
        console.log('error to connect to local server, err:', err)
        socket.emit('remoteServer-error-connect', {server_id:self.server_id, client_id, subClientId})
      })
      self.clientDict[client_id].subClientDict[subClientId] = {
        socket2server,
      }
    })
    socket.on('errMsg', (data) => {
      console.log('error:', data)
    })
  }
}

module.exports = MappingServer
