const debug = require('debug')
const debugSignal = debug('signal')
const errorLog = debug('errorLog')
const debugData = debug('data')
const EventEmitter = require('events')
const uuidv1 = require('uuid/v1')
const WebRTC = require('./webRTC');

class MappingClient extends EventEmitter {
  // const localServer = net.createServer()
  // const signalSocket = io('http://localhost:' + listenPort)
  constructor(serverId, localServer, signalSocket) {
    super()
    let self = this;
    self.serverId = serverId // process.argv[2]
    self.clientId = undefined
    self.peer_connected = false
    self.peerOffer = undefined
    self.g_subClientId = 0
    self.subClientDict = {} // to save each clientSocket for subClient
    self.server = localServer
    self.socket = signalSocket
    self.clientId = uuidv1()
    self.listeners('errMsg')

    self.server.on('connection', c => { // local server which map to remote server.
      // 'connection' listener
      let subClientId = self.g_subClientId
      debugSignal('local client connected, subClientId:', subClientId)
      if (self.peer_connected) {
        self.socket.emit('clientSignal', {
          event:'connectRemoteServer',
          serverId: self.serverId,
          clientId: self.clientId,
          subClientId
        })
      } else {
        errorLog('peer not connected yet.')
        c.end()
        return
      }
      c.on('data', data => {
        if (self.peer_connected) {
          // let buf = Uint8Array.from(JSON.stringify({clientId: self.clientId, subClientId, data}))
          debugData('send data to peer, data.length:', data.length)
          self.peerOffer.send(data.buffer, subClientId) //ArrayBuffer
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
        self.socket.emit('clientSignal', {
          event:'disconnectRemoteServer',
          serverId: self.serverId,
          clientId: self.clientId,
          subClientId
        })
        delete self.subClientDict[subClientId]
      })
      self.subClientDict[subClientId] = {subClientSocket:c, remoteConnected:false, subClientId}
      self.emit('connection', { clientId:self.clientId, subClientId:self.subClientId })
      self.g_subClientId += 1
    })
    self.server.on('error', (err) => {
      // throw err
      errorLog('emitting errMsg:', err)
      self.emit('errMsg', err)
    })

    self.socket.on('connect', () => {
      self.socket.emit('client_register', {serverId:self.serverId, clientId:self.clientId})
    })
    self.socket.on('client_registered', (data) => {
      debugSignal('client_registered:', data)
      self.clientId = data.clientId
      // self.socket.emit('client_signal_description', { self.serverId, self.clientId, signalData:'from client'})
      self.peerOffer = new WebRTC();
      self.peerOffer.makeOffer({ disable_stun: false });
      self.peerOffer.on('signal_description', signalData => {
        debugSignal('offer generated.')
        self.socket.emit('clientSignal', {
          event: 'client_signal_description',
          clientId: self.clientId,
          serverId: self.serverId,
          buf: signalData
        })
      })
      self.peerOffer.on('signal_candidate', signalData => {
        self.socket.emit('clientSignal', {
          event: 'client_signal_candidate',
          clientId: self.clientId,
          serverId: self.serverId,
          buf: signalData
        })
      })
      self.peerOffer.once('connect', () => {
        debugSignal('peer connected.')
        self.peer_connected = true
      })
      self.peerOffer.on('data', buf => {
        let {label, data} = buf
        let subClientId = label
        debugData('received peer data:', data)
        if (subClientId in self.subClientDict) { // don't send after local socket closed.
          self.subClientDict[subClientId].subClientSocket.write(Buffer.from(data))
        }
      })
      self.emit('client_registered', data)
    })
    self.socket.on('serverSignal', ({ event, serverId, clientId, subClientId, buf }) => {
      debugSignal('subClientId:', subClientId, event, buf)
      switch (event) {
        case 'server_signal_description': {
          self.peerOffer.setAnswer(buf)
          break
        }
        case 'server_signal_candidate': {
          self.peerOffer.addIceCandidate(buf)
          break
        }
        case 'errMsg': {
          errorLog('error:', data)
          self.peer_connected = false
          break
        }
        case 'remoteServer_connected': {
          if (subClientId in self.subClientDict) {
            self.subClientDict[subClientId].remoteConnected = true
          }
          self.emit('remoteServer_connected', {clientId:self.clientId, subClientId})
          break
        }
        case 'remoteServer_disconnected': {
          if (subClientId in self.subClientDict) {
            self.subClientDict[subClientId].remoteConnected = false
            let c = self.subClientDict[subClientId].subClientSocket
            c.end()
          }
          break
        }
        case 'remoteServer_error_connect': {
          if (subClientId in self.subClientDict) {
            self.subClientDict[subClientId].remoteConnected = false
            let c = self.subClientDict[subClientId].subClientSocket
            c.end()
          }
          errorLog('remoteServer_error_connect for subClientId:', subClientId)
          break
        }
        default: {
          errorLog('unknown event:', event)
        }
      }
    })
  }
}

module.exports = MappingClient
