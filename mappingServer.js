const debug = require('debug')
const debugSignal = debug('signal')
const errorLog = debug('errorLog')
const debugData = debug('data')
const net = require('net')
const wrtc = require("wrtc");
const EventEmitter = require('events')
const WebRTC = require('./webRTC');

const delayMs = ms => new Promise(res => setTimeout(res, ms));

debug.enable('signal')
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
      debugSignal('server_registered:', data)
      self.server_id = data.server_id
      self.emit('server_registered', {server_id:self.server_id})
    })
    self.socket.on('client_signal', (data) => {
      debugSignal('client_signal:', data)
      let { client_id, signalData } = data
      let clientSignalData = signalData
      if (client_id in self.clientDict) {
        self.clientDict[client_id].peerAnswer.makeAnswer(sdp, { disable_stun: false});
      } else {
        const peerAnswer = new WebRTC();
        peerAnswer.makeAnswer(clientSignalData, { disable_stun: false});
        peerAnswer.on('signal', signalData => { // server response
          self.socket.emit('server_signal', { client_id, server_id:self.server_id, signalData })
        })
        // peerAnswer.on('connect', () => {  // no connect event for non-initiator
        //  self.clientDict[client_id].peer_connected = true
        // })
        peerAnswer.on('data', async (buf) => {
          debugData('received peer data:', buf)
          let {label, data} = buf // JSON.parse(Uint8Array.from(buf.data).toString())
          let subClientId = label
          // data = Buffer.from(data.data)
          debugData('received peer data, data:', data, 'from client_id:', client_id, 'subClientId:', subClientId)
          if (!(subClientId in self.clientDict[client_id].subClientDict)) {
            self.clientDict[client_id].subClientDict[subClientId] = {dataList:[]}
          }
          self.clientDict[client_id].subClientDict[subClientId].dataList.push(data)
          let i = 0;
          for (i=0; i<5; i++) {
            if (self.clientDict[client_id].subClientDict[subClientId].connected2LocalServer) {
              break;
            }
            await delayMs(1000)
          }
          if (i === 5) { //timeout
            errorLog('timeout. to connect local server...')
            self.socket.emit('remoteServer_disconnected', {server_id:self.server_id, client_id, subClientId})
            delete self.clientDict[client_id].subClientDict[subClientId]
            return;
          }
          let buf2server = self.clientDict[client_id].subClientDict[subClientId].dataList.shift()
          debugData('i=', i, 'data sent to server. buf:', buf2server)
          self.clientDict[client_id].subClientDict[subClientId].socket2server.write(Buffer.from(buf2server))
        })
        self.clientDict[client_id] = {
          subClientDict:{},
          peerAnswer,
        }
      }
    })
    self.socket.on('disconnectRemoteServer', ({ client_id, subClientId }) => {
      debugSignal('disconnectRemoteServer received, client_id:', client_id, 'subClientId:', subClientId)
      if (subClientId in self.clientDict[client_id].subClientDict) {
        self.clientDict[client_id].subClientDict[subClientId].socket2server.end() //close the socket to local server.
      }
    })
    self.socket.on('connectRemoteServer', ({ client_id, subClientId }) => {
      const socket2server = net.createConnection({ port: parseInt(self.server_port)}, () => {
        // 'connect' listener
        debugSignal('connected to server for client_id:', client_id, 'subClientId:', subClientId)
        self.clientDict[client_id].subClientDict[subClientId].connected2LocalServer = true
        self.socket.emit('remoteServer_connected', {server_id:self.server_id, client_id, subClientId})
        self.clientDict[client_id].subClientDict[subClientId].intervalFunc = async () => {
          if (subClientId in self.clientDict[client_id].subClientDict) {
            // peer sending thread
            let sendBufList = self.clientDict[client_id].subClientDict[subClientId].sendBufList
            let buf = sendBufList.shift()
            if (buf) {
              let peerAnswer = self.clientDict[client_id].peerAnswer
              // debugData('bufferedAmount:', peerAnswer._channel.bufferedAmount)
              if (buf.length > 200000) {
                await delayMs(500)
              }
              debugData('sending data to peer, buf:', buf.buffer)
              peerAnswer.send(buf.buffer, subClientId)
            }
            setTimeout(self.clientDict[client_id].subClientDict[subClientId].intervalFunc, 10)
          }
        }
        self.clientDict[client_id].subClientDict[subClientId].intervalFunc()
      })
      socket2server.on('data', async (data) => {
        // let buf = Buffer.from(JSON.stringify({client_id, subClientId, data}))
        self.clientDict[client_id].subClientDict[subClientId].sendBufList.push(data)
      })
      socket2server.on('end', () => {
        debugSignal('disconnected from server')
      })
      socket2server.on('close', err => {
        debugSignal('socket closed with local server, err:', err)
        self.socket.emit('remoteServer_disconnected', {server_id:self.server_id, client_id, subClientId})
        clearInterval(self.clientDict[client_id].subClientDict[subClientId].intervalObj)
        delete self.clientDict[client_id].subClientDict[subClientId]
      })
      socket2server.on('error', (err) => {
        errorLog('error to connect to local server, err:', err)
        self.socket.emit('remoteServer_error_connect', {server_id:self.server_id, client_id, subClientId})
      })
      if (!(subClientId in self.clientDict[client_id].subClientDict)) {
        self.clientDict[client_id].subClientDict[subClientId] = {
          socket2server,
          dataList:[],
          sendBufList:[],
        }
      } else {
        self.clientDict[client_id].subClientDict[subClientId].socket2server = socket2server
        self.clientDict[client_id].subClientDict[subClientId].sendBufList = []
      }
    })
    self.socket.on('errMsg', (data) => {
      errorLog('error:', data)
    })
  }
}

module.exports = MappingServer
