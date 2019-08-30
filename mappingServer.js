const debug = require('debug')
const debugSignal = debug('signal')
const errorLog = debug('errorLog')
const debugData = debug('data')
const net = require('net')
const EventEmitter = require('events')
const uuidv1 = require('uuid/v1')
const WebRTC = require('./webRTC')

const delayMs = ms => new Promise(res => setTimeout(res, ms))

class MappingServer extends EventEmitter {
  constructor(server_port, signalSocket) {
    super()
    let self = this
    self.serverId = undefined
    self.server_port = server_port // server port to be published to peer.
    self.clientDict = {}
    self.socket = signalSocket
    self.serverId = uuidv1()

    self.socket.on('connect', () => {
      self.socket.emit('server_register', { serverId:self.serverId })
    })
    self.socket.on('disconnect', () => {
      debugSignal('disconnected')
    })
    self.socket.on('server_registered', (data) => {
      console.log(debug.enabled('signal'))
      debugSignal('server_registered:', data)
      self.emit('server_registered', {serverId:self.serverId})
    })
    self.socket.on('clientSignal', ({ event, clientId, subClientId, buf }) => {
      debugSignal('clientId:', clientId, ', subClientId:', subClientId, event, buf)
      switch(event) {
        case 'client_signal_description': {
          let clientSignalData = buf
          if (clientId in self.clientDict) {
            self.clientDict[clientId].peerAnswer.makeAnswer(clientSignalData, { disable_stun: false})
          } else {
            const peerAnswer = new WebRTC()
            peerAnswer.makeAnswer(clientSignalData, { disable_stun: false})
            peerAnswer.on('signal_description', signalData => { // server response
              self.socket.emit('serverSignal', {
                event: 'server_signal_description',
                clientId, serverId:self.serverId,
                buf: signalData,
              })
            })
            peerAnswer.on('signal_candidate', signalData => { // server response
              self.socket.emit('serverSignal', {
                event: 'server_signal_candidate',
                clientId, serverId:self.serverId,
                buf: signalData,
              })
            })
            // peerAnswer.on('connect', () => {  // no connect event for non-initiator
            //  self.clientDict[clientId].peer_connected = true
            // })
            peerAnswer.on('data', async (buf) => {
              debugData('received peer data:', buf)
              let {label, data} = buf // JSON.parse(Uint8Array.from(buf.data).toString())
              let subClientId = label
              // data = Buffer.from(data.data)
              debugData('received peer data, data:', data, 'from clientId:', clientId, 'subClientId:', subClientId)
              if (!(subClientId in self.clientDict[clientId].subClientDict)) {
                self.clientDict[clientId].subClientDict[subClientId] = {dataList:[]}
              }
              self.clientDict[clientId].subClientDict[subClientId].dataList.push(data)
              let i = 0
              for (i=0; i<5; i++) {
                if (self.clientDict[clientId].subClientDict[subClientId].connected2LocalServer) {
                  break
                }
                await delayMs(1000)
              }
              if (i === 5) { //timeout
                errorLog('timeout. to connect local server...')
                self.socket.emit('serverSignal', {
                  event: 'remoteServer_disconnected',
                  serverId:self.serverId, clientId, subClientId
                })
                delete self.clientDict[clientId].subClientDict[subClientId]
                return
              }
              let buf2server = self.clientDict[clientId].subClientDict[subClientId].dataList.shift()
              debugData('i=', i, 'data sent to server. buf:', buf2server)
              self.clientDict[clientId].subClientDict[subClientId].socket2server.write(Buffer.from(buf2server))
            })
            self.clientDict[clientId] = {
              subClientDict:{},
              peerAnswer,
            }
          }
          break
        }
        case 'client_signal_candidate': {
          let peerAnswer = self.clientDict[clientId].peerAnswer
          peerAnswer.addIceCandidate(buf)
          break
        }
        case 'disconnectRemoteServer': {
          if (subClientId in self.clientDict[clientId].subClientDict) {
            self.clientDict[clientId].subClientDict[subClientId].socket2server.end() //close the socket to local server.
          }
          break
        }
        case 'connectRemoteServer': {
          const socket2server = net.createConnection({ port: parseInt(self.server_port)}, () => {
            // 'connect' listener
            debugSignal('connected to server for clientId:', clientId, 'subClientId:', subClientId)
            self.clientDict[clientId].subClientDict[subClientId].connected2LocalServer = true
            self.socket.emit('serverSignal', {
              event: 'remoteServer_connected',
              serverId:self.serverId, clientId, subClientId
            })
            self.clientDict[clientId].subClientDict[subClientId].intervalFunc = async () => {
              if (subClientId in self.clientDict[clientId].subClientDict) {
                // peer sending thread
                let sendBufList = self.clientDict[clientId].subClientDict[subClientId].sendBufList
                let buf = sendBufList.shift()
                if (buf) {
                  let peerAnswer = self.clientDict[clientId].peerAnswer
                  // debugData('bufferedAmount:', peerAnswer._channel.bufferedAmount)
                  if (buf.length > 200000) {
                    await delayMs(500)
                  }
                  debugData('sending data to peer, buf:', buf.buffer)
                  peerAnswer.send(buf.buffer, subClientId)
                }
                setTimeout(self.clientDict[clientId].subClientDict[subClientId].intervalFunc, 10)
              }
            }
            self.clientDict[clientId].subClientDict[subClientId].intervalFunc()
          })
          socket2server.on('data', async (data) => {
            // let buf = Buffer.from(JSON.stringify({clientId, subClientId, data}))
            self.clientDict[clientId].subClientDict[subClientId].sendBufList.push(data)
          })
          socket2server.on('end', () => {
            debugSignal('disconnected from server')
          })
          socket2server.on('close', err => {
            debugSignal('socket closed with local server, err:', err)
            self.socket.emit('serverSignal', {
              event: 'remoteServer_disconnected',
              serverId:self.serverId, clientId, subClientId
            })
            clearInterval(self.clientDict[clientId].subClientDict[subClientId].intervalObj)
            delete self.clientDict[clientId].subClientDict[subClientId]
          })
          socket2server.on('error', (err) => {
            errorLog('error to connect to local server, err:', err)
            self.socket.emit('serverSignal', {
              event: 'remoteServer_error_connect',
              serverId:self.serverId, clientId, subClientId,
            })
          })
          if (!(subClientId in self.clientDict[clientId].subClientDict)) {
            self.clientDict[clientId].subClientDict[subClientId] = {
              socket2server,
              dataList:[],
              sendBufList:[],
            }
          } else {
            self.clientDict[clientId].subClientDict[subClientId].socket2server = socket2server
            self.clientDict[clientId].subClientDict[subClientId].sendBufList = []
          }
          break
        }
        case 'errMsg': {
          errorLog('error:', buf)
          break
        }
        default: {
          errorLog('unknown event:', event)
          break
        }
      }
    })
  }
}

module.exports = MappingServer
