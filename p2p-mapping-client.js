const debug = require('debug')
const net = require('net')
const io = require ('socket.io-client')
const MappingClient = require('./mappingClient')

let serverId = process.argv[2]

const localServer = net.createServer()
localServer.listen(9102, '127.0.0.1', () => {
  console.log('server bound on', 9102)
})

const signalSeverUrl = 'http://p2p.ai1to1.com:9101' // backup server: 'http://mapping.ai1to1.com:9101'
const signalSocket = io(signalSeverUrl) // signal server
console.log('trying to connect signal server:', signalSeverUrl)

debug.enable('data,signal,errorLog')
var client = new MappingClient(serverId, localServer, signalSocket)
client.on('error', err => {
  console.log('err:', err)
})

process.on('SIGINT', () => {
  console.log("Caught interrupt signal");
  client.close()
});
