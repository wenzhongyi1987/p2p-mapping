# p2p-mappig
Mapping tcp port of local server to another machine across NAT, using webrtc data channel.

## features

- p2p port mapping, no data relay server is needed.

## install

```
git clone https://github.com/yuanzhanghu/p2p-mapping.git
cd p2p-mapping
npm install
```

## usage
#### server side:
```
node p2p-mapping-server.js 22   # mapping port 22/ssh to another machine
                                # which will generate a server_id for the port
```
#### client side:
```
# establish p2p tunnel between client and server.
node p2p-mapping-client.js <server_id>
```
now we can access remote ssh server by:
```
ssh user@localhost -p 9102      # mapped to local port 9102 by default.
```