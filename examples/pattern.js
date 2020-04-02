// You will have to do:
// const { Multiplexer } = require("redis-mpx");
const { Multiplexer } = require("..");
const redis = require('redis');
const WebSocket = require('ws');

let publish = redis.createClient({retry_strategy: () => 100});
let mpx = new Multiplexer();

let server = new WebSocket.Server({ port: 8080 });
server.on('connection', function connection(ws) {
    let sub = mpx.createPatternSubscription( "pattern:*",
        (channel, message) => ws.send(`ch: [${channel}] msg: [${message}]`), 
        () => console.log("Disconnected!"),
        (c) => console.log("Pattern active:", c.toString())
    );

    ws.on('close', function () {
        console.log("[ws] closing");
        sub.close();
    });

    ws.send(`// publish a message on "pattern:<anything>" to receive it`);
});


