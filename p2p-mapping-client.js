const net = require('net')
const io = require ('socket.io-client')
const MappingClient = require('./mappingClient')

let server_id = process.argv[2]

const localServer = net.createServer()
localServer.listen(9102, '127.0.0.1', () => {
  console.log('server bound on', 9102)
})
const signalSocket = io('http://localhost:' + 9101)

var client = new MappingClient(server_id, localServer, signalSocket)
client.on('error', err => {
  console.log('err:', err)
})