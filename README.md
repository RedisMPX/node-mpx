# RedisMPX
RedisMPX is a Redis Pub/Sub multiplexer library written in multiple languages and [live coded on Twitch](https://twitch.tv/kristoff_it).

## Abstract
When bridging multiple application instances through Redis Pub/Sub it's easy to end up needing
support for multiplexing. RedisMPX streamlines this process in a consistent way across multiple
languages by offering a consistent set of features that cover the most common use cases.

The library works under the assumption that you are going to create separate subscriptions
for each client connected to your service (e.g. WebSockets clients):

- ChannelSubscription allows you to add and remove individual Redis
  PubSub channels similarly to how a multi-room chat application would need to.
- PatternSubscription allows you to subscribe to a single Redis Pub/Sub pattern.
- PromiseSubscription allows you to create a networked promise system.


## Installation
`npm install redis-mpx`

## Features
- Simple channel subscriptions
- Pattern subscriptions
- **Networked promise system**
- Automatic reconnection with exponetial backoff + jitter

## Networked Promise System
A Promise represents a timed, uninterrupted, single-message subscription to a Redis Pub/Sub channel. If network connectivity gets lost, thus causing an interruption, the Promise will be failed (unless already fullfilled). See `Multiplexer.createPromiseSubscription()` for more info.

## Documentation
- [Examples](/examples/)

## Usage
```js
const { Multiplexer } = require("redis-mpx"); 

// Pass to Multiplexer the same connection options that
// node-redis' redis.createClient() would accept.
// For more info: https://github.com/NodeRedis/node-redis#rediscreateclient
let mpx = new Multiplexer();

// onMessage is a callback (can be async)
// that accepts a channel name and a message.
// Bott channel name and message will be given to you
// as Buffer instances, use `.toString()` to decode their 
// contents if necessary.
async function onMessage(channel, message){
    console.log("ch:", channel.toString(), "msg:", message.toString());
}

// onDisconnect is a callback (can be async) 
// that that accepts no parameters.
function onDisconnect(){
    console.log("connection lost!");
}

// onActivation is a callback (can be async)
// that accepts the name of the channel or pattern
// whose subscription just became active (depends
// on whether it's attached to a ChannelSubscription
// or a PatternSubscription). The function will receive
// `name` as a Buffer. Use `.toString()` to decode it if
// necessary.
function onActivation(name){
    console.log("activated:", name);
}

// Both `onDisconnected` and `onActivation` are optional.

// Use `mpx` to create new subscriptions:
let channelSub = mpx.createChannelSubcription(onMessage, null, null);
let patternSub = mpx.createPatternSubscription("hello-*", onMessage, null, onActivation);
let promiseSub = mpx.createPromiseSubscription("hello-");


// Close the multiplexer once you're done with it.
mpx.close();
```

### ChannelSubscription
```js
// Create the ChannelSubscription.
let channelSub = mpx.createChannelSubcription(
    (ch, msg) => console.log(`Message @ ${ch}: ${msg}`),
    e => console.log(`Network Error: ${typeof e}: ${e}`),
    s => console.log(`Subscription now active: ${s}`));

// Add channels
channelSub.add("chan1");
channelSub.add("chan2");
channelSub.add("chan3");

// Remove a channel
channelSub.remove("chan2");

// Clear the subscription (remove all channels)
channelSub.clear();

// Close the subscription
channelSub.close();
```

### PatternSubscription
```js
// Create the PatternSubscription.
// Note how it also requires the pattern.
let patternSub = mpx.createPatternSubscription(
    "notifications:*",
    (ch, msg) => console.log(`Message @ ${ch}: ${msg}`),
    e => console.log(`Network Error: ${typeof e}: ${e}`),
    s => console.log(`Subscription now active: ${s}`));

// PatternSubscriptions can only be closed
patternSub.close()
```

### PromiseSubscription
```js
// Create the subscription. 
// Note how it doesn't accept any callback.
let promiseSub = mpx.createPromiseSubscription("hello-");

// When first created (and after a network error that causes 
// a reconnection), a PromiseSubscription is not immediately 
// able to create new promises as it first needs the underlying
// PatternSubscription to become active. This async function
// waits for that event.
await promiseSub.waitForActivation();


// Create a new promise. It might fail if the subscription is 
// not active.
var promise = null;
try {
    promise = promiseSub.newPromise("world", 10000); // 10000ms = 10s
    // The provided suffix will be composed with the subscription's
    // prefix to create the final Redis Pub/Sub channel from which
    // the message is expected to come. In this example, to fullfill
    // the promise you could send, using redis-cli (or any other client):
    //
    //   > PUBLISH hello-world "your-promise-payload"
    //
} catch (e) {
    if (e instanceof redismpx.SubscriptionInactiveError){
        // Wait and then Retry? Return an error to the user? Up to you.
    }
}

// A way of creating a promise that ensures no SubscriptionInactiveError
// will trigger.
promise = promiseSub.waitForNewPromise("world", 10000); // 10000ms = 10s

// A Promise represents a timed, uninterrupted, single-message 
// subscription to a Redis Pub/Sub channel. If network 
// connectivity gets lost, thus causing an interruption, 
// the Promise will be failed (unless already fullfilled). 

// Resolve the promise
try {
    let result = await promise
    console.log(result.toString()) // prints your-promise-payload
} catch (e) {
    if (e instanceof redismpx.PromiseTimeoutError){
        // The promise timed out.
    } else if (e instanceof redismpx.SubscriptionInactiveError) {
        // The subscription became inactive while the promise was
        // still pending.
    } else if (e instanceof redismpx.SubscriptionClosedError) {
        // The subscription was closed while the promise was
        // still pending.
    }
}

// Clear the subscription (will reject all outstanding
// promises and unlock all `waitFor*` waiters)
promiseSub.clear();

// Close the subscription (will call clear()).
promiseSub.close();
```

## WebSocket Example
This is a more realistic example of how to use RedisMPX.

### Code
This code is also available in [examples/channel.js](/examples/channel.js).

```js
# channel.js

const { Multiplexer } = require("redis-mpx");
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
    ws.send("Sending `!hello` will broadcast the next message you send to `hello`.");
    ws.send("You can subscribe to more channels than one.");

});
```

### Interacting with the example
The application works like a simple WebSocket chat application that 
expects commands from the user.

- Sending `+hello` will subscribe you to channel `hello`, while `-hello` will do the opposite.
- Sending `!hello` will broadcast the next message you send to `hello`.
- You can use whatever channel name you like.

To send those commands you can use a browser:
```js
// To create a websocket connection to localhost
// you will need to deal with the browser's security
// policies. Opening a file on the local filesystem
// and typing these commands in the console should
// do the trick.
let ws = new WebSocket("ws://localhost:8000/ws")
ws.onmessage = (x) => console.log("message:", x.data)
ws.send("+test")
ws.send("!test")
ws.send("hello world!")
```
A more handy way of interacting with websockets are command-line clients:
- https://github.com/hashrocket/ws (recommended)
- https://github.com/esphen/wsta
