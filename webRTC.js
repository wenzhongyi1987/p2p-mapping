// Code modified from: https://github.com/shinyoshiaki/simple-datachannel/blob/master/src/WebRTC.js
const EventEmitter = require('events')
const { RTCPeerConnection, RTCSessionDescription } = require('wrtc')

class WebRTC extends EventEmitter {
  constructor() {
    super()
    this.rtc = null
    this.dataChannels = {}
    this.type = ''
    this.nodeId = ''
    this.isConnected = false
    this.onicecandidate = false
    this.isDisconnected = false
    this.events = {
      CONNECT: 'connect',
      DATA: 'data',
      DISCONNECT: 'disconnect',
      SIGNAL: 'signal'
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
      console.log('dc established error: ' + dce.message)
    }
  }

  _dataChannelEvents(channel) {
    channel.onopen = () => {
      console.log('dc opened')
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
        iceServers: [{ urls: 'stun:stun.webrtc.ecl.ntt.com:3478' }]
      })
    }

    peer.onicecandidate = evt => {
      if (!evt.candidate) {
        if (!this.onicecandidate) {
          this.onicecandidate = true
          this.emit(this.events.SIGNAL, peer.localDescription)
        }
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
      } catch (err) {
        console.error('setLocalDescription(offer) ERROR: ', err)
      }
    }
    this._createDatachannel('datachannel')
  }

  setAnswer(sdp) {
    try {
      this.rtc.setRemoteDescription(new RTCSessionDescription(sdp))
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
      } catch (err) {
        console.error(err)
      }
    } catch (err) {
      console.error('setRemoteDescription(offer) ERROR: ', err)
    }
  }

  send(data, label) {
    if (!(label in this.dataChannels)) {
      console.log('this.dataChannels:', Object.keys(this.dataChannels), ', label:', label)
      this._createDatachannel(label)
    }
    try {
      this.dataChannels[label].send(data)
    } catch (error) {
      console.log('dc send error', error)
      this.isDisconnected = true
    }
  }

  connected() {
    this.isConnected = true
  }

  connecting(nodeId) {
    this.nodeId = nodeId
  }
}

module.exports = WebRTC