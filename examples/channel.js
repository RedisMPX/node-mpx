// You will have to do:
// const { Multiplexer } = require("redis-mpx");
const { Multiplexer } = require("..");
const redis = require('redis');
const WebSocket = require('ws');

let publish = redis.createClient({retry_strategy: () => 100});
let mpx = new Multiplexer();

let server = new WebSocket.Server({ port: 8080 });
server.on('connection', function connection(ws) {
    let sub = mpx.createChannelSubscription(
        (channel, message) => ws.send(`ch: [${channel}] msg: [${message}]`), 
        () => console.log("Disconnected!"),
        (c) => console.log("Channel active:", c.toString())
    );

    var send_to_channel = undefined;
    ws.on('close', function () {
        console.log("[ws] closing");
        sub.close();
    });
    ws.on('message', function incoming(message) {
        if (message.length == 0) {
            return
        }

        if (send_to_channel) {
            publish.publish(send_to_channel, message);
            send_to_channel = undefined;
        }

        let command = message[0];
        let channel = message.slice(1);
        switch(command) {
        case '+':
            sub.add(channel);
            break;
        case '-':
            sub.remove(channel);
            break;
        case '!':
            send_to_channel = channel;
            break;
        }
    });

    ws.send("// Sending `+hello` will subscribe you to channel `hello`, while `-hello` will do the opposite.");
    ws.send("// Sending `!hello` will broadcast the next message you send to `hello`.");
    ws.send("// You can subscribe to more channels than one.");
    ws.send("// If the server loses connection with Redis, it will automatically try to reconnect.");


});








