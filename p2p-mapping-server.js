const io = require('socket.io-client')
const MappingServer = require('./mappingServer')

const signalSocket = io('http://p2p.ai1to1.com:' + 9101) // signal server
let mapServer = new MappingServer(process.argv[2], signalSocket)

mapServer.on('server-registered', ({server_id}) => {
  // console.log('server-registered, server_id:', server_id)
})
