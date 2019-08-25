import MappingServer from './mappingServer'

let mapServer = new MappingServer(process.argv[2])

mapServer.on('server-registered', server_id => {
  console.log('server-registered, server_id:', server_id)
})