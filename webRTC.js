// Code modified from: https://github.com/shinyoshiaki/simple-datachannel/blob/master/src/WebRTC.js
const EventEmitter = require('events')
const { RTCPeerConnection, RTCSessionDescription } = require('wrtc')

const delayMs = ms => new Promise(res => setTimeout(res, ms))

class WebRTC extends EventEmitter {
  constructor() {
    super()
    this.rtc = null
    this.dataChannels = {}
    this.type = ''
    this.nodeId = ''
    this.isConnected = false
    this.candidates = [] // candidates to be sent
    this.isDisconnected = false
    this.setAnswerFlag = false
    this.events = {
      CONNECT: 'connect',
      DATA: 'data',
      DISCONNECT: 'disconnect',
      SIGNAL_DESCR: 'signal_description',
      SIGNAL_CANDIDATE: 'signal_candidate',
    }
  }

  _createDatachannel(label) {
    try {
      const dc = this.rtc.createDataChannel(label, {
        reliable: true
      })
      this._dataChannelEvents(dc)
      this.dataChannels[label] = dc
      return dc
    } catch (dce) {
      console.log('datachannel established error: ' + dce.message)
    }
  }

  _dataChannelEvents(channel) {
    channel.onopen = () => {
      console.log('data channel opened')
      this.emit(this.events.CONNECT)
    }
    channel.onmessage = event => {
      this.emit(this.events.DATA, {
        label: channel.label,
        data: event.data,
        nodeId: this.nodeId
      })
    }
    channel.onerror = err => {
      console.log('Datachannel Error: ' + err)
    }
    channel.onclose = () => {
      console.log('DataChannel is closed')
      this.emit(this.events.DISCONNECT)
      this.isDisconnected = true
    }
  }

  _prepareNewConnection(opt) {
    let peer
    if (opt.disable_stun) {
      console.log('disable stun')
      peer = new RTCPeerConnection({
        iceServers: []
      })
    } else {
      peer = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.webrtc.ecl.ntt.com:3478' }],
      })
    }

    peer.onicecandidate = async (evt) => {
      console.log('onicecandidate, evt:', JSON.stringify(evt))
      if (evt.candidate) { // we have candidate to signal
        if (this.type === 'offer') {
          let i
          for ( i = 0; i < 20; i++) {
            if (this.setAnswerFlag === true) {
              break
            }
            await delayMs(1000)
          }
        }
        console.log('sent candidate')
        this.emit(this.events.SIGNAL_CANDIDATE, evt.candidate)
      }
    }

    peer.ondatachannel = evt => {
      const dataChannel = evt.channel
      this.dataChannels[dataChannel.label] = dataChannel
      this._dataChannelEvents(dataChannel)
    }
    return peer
  }

  makeOffer(opt = { disable_stun: false }) {
    this.type = 'offer'
    this.rtc = this._prepareNewConnection(opt)
    this.rtc.onnegotiationneeded = async () => {
      try {
        let offer = await this.rtc.createOffer()
        await this.rtc.setLocalDescription(offer)
        this.emit(this.events.SIGNAL_DESCR, this.rtc.localDescription)
      } catch (err) {
        console.error('setLocalDescription(offer) ERROR: ', err)
      }
    }
    this._createDatachannel('datachannel')
  }

  setAnswer(sdp) {
    try {
      this.rtc.setRemoteDescription(new RTCSessionDescription(sdp))
      this.setAnswerFlag = true
    } catch (err) {
      console.error('setRemoteDescription(answer) ERROR: ', err)
    }
  }

  async makeAnswer(sdp, opt = { disable_stun: false }) {
    this.type = 'answer'
    this.rtc = this._prepareNewConnection(opt)
    try {
      await this.rtc.setRemoteDescription(new RTCSessionDescription(sdp))
      try {
        const answer = await this.rtc.createAnswer()
        await this.rtc.setLocalDescription(answer)
        this.emit(this.events.SIGNAL_DESCR, this.rtc.localDescription)
      } catch (err) {
        console.error(err)
      }
    } catch (err) {
      console.error('setRemoteDescription(offer) ERROR: ', err)
    }
  }

  addIceCandidate(candidate) {
    return this.rtc.addIceCandidate(candidate)
  }

  send(data, label) {
    if (!(label in this.dataChannels)) {
      console.log('this.dataChannels:', Object.keys(this.dataChannels), ', label:', label)
      this._createDatachannel(label)
    }
    try {
      this.dataChannels[label].send(data)
    } catch (error) {
      console.log('datachannel send error', error)
      this.isDisconnected = true
    }
  }

  connected() {
    this.isConnected = true
  }

  connecting(nodeId) {
    this.nodeId = nodeId
  }

  close() {
    for (let label in this.dataChannels) {
      this.dataChannels[label].close()
    }
    this.rtc.close()
  }
}

module.exports = WebRTC