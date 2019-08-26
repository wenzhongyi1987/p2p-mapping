const io = require ('socket.io-client')
const MappingServer = require('./mappingServer')

let signalSocket = io('http://localhost:' + 9101);
let mapServer = new MappingServer(process.argv[2], signalSocket)

mapServer.on('server-registered', ({server_id}) => {
  console.log('server-registered, server_id:', server_id)
})