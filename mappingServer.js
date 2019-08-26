const net = require('net')
const Peer = require('simple-peer')
var wrtc = require('wrtc')
const EventEmitter = require('events')

class MappingServer extends EventEmitter {
  constructor(server_port, signalSocket) {
    super()
    let self = this
    self.server_id = undefined
    self.server_port = server_port // server port to be published to peer.
    self.clientDict = {}
    self.socket = signalSocket

    self.socket.on('connect', () => {
      self.socket.emit('server_register', {})
    })
    self.socket.on('server_registered', (data) => {
      console.log('server_registered:', data)
      self.server_id = data.server_id
      self.emit('server_registered', {server_id:self.server_id})
    })
    self.socket.on('client_signal', (data) => {
      console.log('client_signal:', data)
      let { client_id, signalData } = data
      if (!(client_id in self.clientDict)) {
        let server_peer = new Peer({ wrtc }) //create specific server_peer for this client.
        server_peer.signal(signalData)
        server_peer.on('signal', signalData => { // server response
          self.socket.emit('server_signal', { client_id, server_id:self.server_id, signalData })
        })
        // server_peer.on('connect', () => {  // no connect event for non-initiator
        //  self.clientDict[client_id].peer_connected = true
        // })
        server_peer.on('data', (buf) => {
          let {client_id, subClientId, data} = JSON.parse(buf.toString())
          data = Buffer.from(data.data)
          console.log('received peer data from client_id:', client_id, 'subClientId:', subClientId)
          console.log('data:', data)
          if (subClientId in self.clientDict[client_id].subClientDict &&
              self.clientDict[client_id].subClientDict[subClientId].connected2LocalServer) {
            self.clientDict[client_id].subClientDict[subClientId].socket2server.write(data)
          }
        })
        self.clientDict[client_id] = {
          subClientDict:{},
          server_peer,
        }
      }
    })
    self.socket.on('disconnectRemoteServer', ({ client_id, subClientId }) => {
      console.log('disconnectRemoteServer received, client_id:', client_id, 'subClientId:', subClientId)
      if (subClientId in self.clientDict[client_id].subClientDict[subClientId]) {
        self.clientDict[client_id].subClientDict[subClientId].socket2server.end() //close the socket to local server.
      }
    })
    self.socket.on('connectRemoteServer', ({ client_id, subClientId }) => {
      const socket2server = net.createConnection({ port: parseInt(self.server_port)}, () => {
        // 'connect' listener
        console.log('connected to server for client_id:', client_id, 'subClientId:', subClientId)
        self.clientDict[client_id].subClientDict[subClientId].connected2LocalServer = true
        self.socket.emit('remoteServer_connected', {server_id:self.server_id, client_id, subClientId})
      })
      socket2server.on('data', (data) => {
        server_peer.send(Buffer.from(JSON.stringify({client_id, subClientId, data})))
      })
      socket2server.on('end', () => {
        console.log('disconnected from server')
      })
      socket2server.on('close', err => {
        console.log('socket closed with local server, err:', err)
        self.socket.emit('remoteServer_disconnected', {server_id:self.server_id, client_id, subClientId})
        delete self.clientDict[client_id].subClientDict[subClientId]
      })
      socket2server.on('error', (err) => {
        console.log('error to connect to local server, err:', err)
        self.socket.emit('remoteServer_error_connect', {server_id:self.server_id, client_id, subClientId})
      })
      self.clientDict[client_id].subClientDict[subClientId] = {
        socket2server,
      }
    })
    self.socket.on('errMsg', (data) => {
      console.log('error:', data)
    })
  }
}

module.exports = MappingServer
