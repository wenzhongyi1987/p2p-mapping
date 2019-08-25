const EventEmitter = require('events')
var Peer = require('simple-peer')
var wrtc = require('wrtc')

class MappingClient extends EventEmitter {
  // const localServer = net.createServer()
  // const signalSocket = io('http://localhost:' + listenPort)
  constructor(server_id, localServer, signalSocket) {
    super()
    let self = this;
    self.server_id = server_id // process.argv[2]
    self.client_id = undefined
    self.peer_connected = false
    self.client_peer = undefined // = new Peer({ initiator: true })
    self.g_subClientId = 0
    self.subClientDict = {} // to save each clientSocket for subClient
    self.server = localServer
    self.socket = signalSocket
    self.listeners('errMsg')

    self.server.on('connection', c => { // local server which map to remote server.
      // 'connection' listener
      let subClientId = self.g_subClientId
      console.log('local client connected, subClientId:', subClientId)
      if (self.peer_connected) {
        self.socket.emit('connectRemoteServer', {
          server_id: self.server_id,
          client_id: self.client_id,
          subClientId})
      } else {
        console.log('peer not connected yet.')
        c.end()
        return
      }
      c.on('data', data => {
        if (self.peer_connected &&
            subClientId in self.subClientDict &&
            self.subClientDict[subClientId].remoteConnected) {
          self.client_peer.send({client_id: self.client_id, subClientId, data})
        } else {
          c.end() // close the socket.
        }
      })
      c.on('end', () => {
        console.log('client dispeer_connected, subClientId:', subClientId)
      })
      c.on('close', err => {
        console.log('subClientId:', subClientId, 'closed, err:', err)
        self.socket.emit('disconnectRemoteServer', {
          server_id: self.server_id,
          client_id: self.client_id,
          subClientId})
        delete self.subClientDict[subClientId]
      })
      self.subClientDict[subClientId] = {subClientSocket:c, remoteConnected:false, subClientId}
      self.emit('connection', { client_id:self.client_id, subClientId:self.subClientId })
      self.g_subClientId += 1
    })
    self.server.on('error', (err) => {
      // throw err
      console.log('emitting errMsg:', err)
      self.emit('errMsg', err)
    })

    self.socket.on('connect', () => {
      self.socket.emit('client-register', { server_id: self.server_id })
    })
    self.socket.on('client-registered', (data) => {
      console.log('client-registered:', data)
      self.client_id = data.client_id
      // self.socket.emit('client-signal', { self.server_id, self.client_id, signalData:'from client'})
      self.client_peer = new Peer({ initiator: true, wrtc})
      self.client_peer.on('signal', signalData => {
        self.socket.emit('client-signal', {
          client_id: self.client_id,
          server_id: self.server_id,
          signalData })
      })
      self.client_peer.on('connect', () => {
        self.peer_connected = true
      })
      self.client_peer.on('data', peer_data => {
        let { subClientId, data } = peer_data
        self.subClientDict[subClientId].subClientSocket.send(data)
      })
      self.emit('client-registered', data)
    })
    self.socket.on('server-signal', (data) => {
      console.log('server-signal:', data)
      let { server_id, signalData } = data
      self.client_peer.signal(signalData)
    })
    self.socket.on('errMsg', (data) => {
      console.log('error:', data)
      self.peer_connected = false
    })
    self.socket.on('remoteServer-connected', data => {
      let { subClientId } = data
      if (subClientId in self.subClientDict) {
        self.subClientDict[subClientId].remoteConnected = true
      }
      self.emit('remoteServer-connected', {client_id:self.client_id, subClientId})
    })
    self.socket.on('remoteServer-disconnected', data => {
      let { subClientId } = data
      if (subClientId in self.subClientDict) {
        self.subClientDict[subClientId].remoteConnected = false
        let c = self.subClientDict[subClientId].subClientSocket
        c.end()
      }
    })
    self.socket.on('remoteServer-error-connect', data => {
      let { subClientId } = data
      if (subClientId in self.subClientDict) {
        self.subClientDict[subClientId].remoteConnected = false
        let c = self.subClientDict[subClientId].subClientSocket
        c.end()
      }
      console.log('remoteServer-error-connect for subClientId:', subClientId)
    })
  }
}

module.exports = MappingClient
