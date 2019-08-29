const debug = require('debug')
const debugSignal = debug('signal')
const errorLog = debug('errorLog')
const debugData = debug('data')
const EventEmitter = require('events')
var wrtc = require('wrtc')
const WebRTC = require('./webRTC');

class MappingClient extends EventEmitter {
  // const localServer = net.createServer()
  // const signalSocket = io('http://localhost:' + listenPort)
  constructor(server_id, localServer, signalSocket) {
    super()
    let self = this;
    self.server_id = server_id // process.argv[2]
    self.client_id = undefined
    self.peer_connected = false
    self.peerOffer = undefined // = new Peer({ initiator: true })
    self.g_subClientId = 0
    self.subClientDict = {} // to save each clientSocket for subClient
    self.server = localServer
    self.socket = signalSocket
    self.listeners('errMsg')

    self.server.on('connection', c => { // local server which map to remote server.
      // 'connection' listener
      let subClientId = self.g_subClientId
      debugSignal('local client connected, subClientId:', subClientId)
      if (self.peer_connected) {
        self.socket.emit('connectRemoteServer', {
          server_id: self.server_id,
          client_id: self.client_id,
          subClientId})
      } else {
        errorLog('peer not connected yet.')
        c.end()
        return
      }
      c.on('data', data => {
        if (self.peer_connected) {
          // let buf = Uint8Array.from(JSON.stringify({client_id: self.client_id, subClientId, data}))
          debugData('send data to peer, data length:', data.length)
          self.peerOffer.send(data.buffer, subClientId)
        } else {
          errorLog('peer not connected, shutdown local socket for subClientId:', subClientId)
          c.end() // close the socket.
        }
      })
      c.on('end', () => {
        debugSignal('client dispeer_connected, subClientId:', subClientId)
      })
      c.on('close', err => {
        debugSignal('subClientId:', subClientId, 'closed, err:', err)
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
      errorLog('emitting errMsg:', err)
      self.emit('errMsg', err)
    })

    self.socket.on('connect', () => {
      self.socket.emit('client_register', { server_id: self.server_id })
    })
    self.socket.on('client_registered', (data) => {
      debugSignal('client_registered:', data)
      self.client_id = data.client_id
      // self.socket.emit('client_signal', { self.server_id, self.client_id, signalData:'from client'})
      self.peerOffer = new WebRTC();
      self.peerOffer.makeOffer({ disable_stun: false });
      self.peerOffer.on('signal', signalData => {
        debugSignal('offer generated.')
        self.socket.emit('client_signal', {
          client_id: self.client_id,
          server_id: self.server_id,
          signalData })
      })
      self.peerOffer.once('connect', () => {
        debugSignal('peer connected.')
        self.peer_connected = true
      })
      self.peerOffer.on('data', buf => {
        let {label, data} = buf
        let subClientId = label
        debugData('received peer data:', data)
        self.subClientDict[subClientId].subClientSocket.write(Buffer.from(data))
      })
      self.emit('client_registered', data)
    })
    self.socket.on('server_signal', (data) => {
      debugSignal('server_signal:', data)
      let { server_id, signalData } = data
      self.peerOffer.setAnswer(signalData)
    })
    self.socket.on('errMsg', (data) => {
      errorLog('error:', data)
      self.peer_connected = false
    })
    self.socket.on('remoteServer_connected', data => {
      let { subClientId } = data
      debugSignal('remoteServer_connected for subClientId:', subClientId)
      if (subClientId in self.subClientDict) {
        self.subClientDict[subClientId].remoteConnected = true
      }
      self.emit('remoteServer_connected', {client_id:self.client_id, subClientId})
    })
    self.socket.on('remoteServer_disconnected', data => {
      let { subClientId } = data
      if (subClientId in self.subClientDict) {
        self.subClientDict[subClientId].remoteConnected = false
        let c = self.subClientDict[subClientId].subClientSocket
        c.end()
      }
    })
    self.socket.on('remoteServer_error_connect', data => {
      let { subClientId } = data
      if (subClientId in self.subClientDict) {
        self.subClientDict[subClientId].remoteConnected = false
        let c = self.subClientDict[subClientId].subClientSocket
        c.end()
      }
      errorLog('remoteServer_error_connect for subClientId:', subClientId)
    })
  }
}

module.exports = MappingClient
