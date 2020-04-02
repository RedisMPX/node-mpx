// You will have to do:
// const { Multiplexer } = require("redis-mpx");
const { Multiplexer, PromiseTimeoutError } = require("..");
const redis = require('redis');
const WebSocket = require('ws');

let publish = redis.createClient({retry_strategy: () => 100});
let mpx = new Multiplexer();

var sub = null;

let server = new WebSocket.Server({ port: 8080 });
server.on('connection', function connection(ws) {
    if (sub === null) {
        sub = mpx.createPromiseSubscription(new Buffer.from([66]));
    }

    ws.on('close', function () {
        console.log("[ws] closing");
        sub.close();
    });
    ws.on('message', async function incoming(suffix) {
        if (suffix.length == 0) {
            return
        }

        ws.send(`// publish a message on "promise:${suffix}" to resolve the promise.`);
        ws.send("// the promise will timeout in 5 seconds.\n");

        try {
            let msg = await sub.waitForNewPromise(suffix, 5000);
            ws.send(msg);
        } catch (e) {
            if (e instanceof PromiseTimeoutError) {
                console.log("the promise timed out");
            } else {
                console.log("rejected:", e);
            }
        }
        
    });

    ws.send("// Create a new promise by typing its suffix.\n");
});


