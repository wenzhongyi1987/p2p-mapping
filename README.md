# p2p-mappig
Mapping local server port to another machine across NAT, using webrtc data channel.

## features

- p2p port mapping, no data relay server is needed.

## install

```
git clone https://github.com/yuanzhanghu/p2p-mapping.git
```

## usage
#### server side:
```
node p2p-mapping-server.js 23          # mapping port 23/telnet to another machine
                                       # which will generate a server_id for the port
```
#### client side:
```
node p2p-mapping-client.js <server_id> # establish tunnel between client and server.
```
now we can access remote telnet server by:
```
telnet localhost 9102   # mapped to local port 9102 by default.
```