# p2p-mappig
Mapping tcp port of local server to another machine across NAT, share your servers across NAT! using webrtc data channel.

```
                          firewall  firewall
                              +      +
                              |      |
                              |      |
  +------------------------+  |      |    +-----------------------+
  |                        |  |      |    |                       |
  |                        |  |      |    |    server listening   |
  |             port 9102<----mapping+-------- on port 22         |
  |                        |  |      |    |                       |
  |                        |  |      |    |                       |
  |                        |  |      |    |                       |
  +------------------------+  |      |    +-----------------------+
          machine A           |      |           machine B
                              |      |
                              +      +

  Now we can do 'ssh user@localhost -p 9102'
  on A, which is actually ssh to B.
```

## features

- p2p port mapping, no data relay server is needed.
- NAT traversal without router configuration.
- unique random serverId is generated, to secure your tunnel.
- support multiple clients and multiple connections for each client.
- windows/linux server port mapping tested.
- it's actually a tunnel, imagine use cases: proxy server, vnc server, etc. you can share your servers across NAT!

## windows安装使用方法
- 下载并解压 https://github.com/yuanzhanghu/p2p-mapping/releases
- 进入解压目录
- 服务器端：p2p-mapping-server.exe ___server_port___ // 比如5900是vnc server的端口，这个命令将产生一个serverId
- 客户端：p2p-mapping-client.exe ___serverId___ //服务器端产生的serverId，提示peer connected说明mapping成功
- 现在我们在客户端访问127.0.0.1:9102， 就可以直接访问到服务器

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
                                # which will generate a serverId for the port
```
#### client side:
```
# establish p2p tunnel between client and server.
node p2p-mapping-client.js <serverId>
```
now we can access remote ssh server by:
```
ssh user@localhost -p 9102      # mapped to local port 9102 by default.
```
## contact
QQ交流群: 872893118
