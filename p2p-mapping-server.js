const io = require('socket.io-client')
const MappingServer = require('./mappingServer')

const signalSeverUrl = 'http://p2p.ai1to1.com:9101' // backup server: 'http://mapping.ai1to1.com:9101'
const signalSocket = io(signalSeverUrl) // signal server
console.log('trying to connect signal server:', signalSeverUrl)
let mapServer = new MappingServer(process.argv[2], signalSocket)

mapServer.on('server-registered', ({server_id}) => {
  // console.log('server-registered, server_id:', server_id)
})
