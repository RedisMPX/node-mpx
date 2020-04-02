const util = require('util');
const redis = require('redis');
const { List } = require("./internal/list.js");
const { ChannelSubscription } = require("./channel.js");
const { PatternSubscription } = require("./pattern.js");
const { PromiseSubscription } = require("./promise.js");


function Multiplexer (connectionSettings) {
	// TODO personalize settings
	let client = redis.createClient({
		...connectionSettings,
		return_buffers: true,
		no_ready_check: true, // TODO: confirm PUB/SUB works before the dataset is loaded in Redis
		enable_offline_queue: false,
		retry_unfulfilled_commands: false,
		disable_resubscribing: true,
		retry_strategy: function(options) {
		    // TODO: ask the user for extra options about min and max delay
		    return getRandomInt(0, Math.min(512, 8 * (2 ** options.attempt)));
		  },
	});


	// Attach event listeners
	client.on("connect", () => {
		this.connected = true;
		if (Object.keys(this.channels).length > 0) {
			setImmediate(() => this.client.subscribe(Object.keys(this.channels)));
		}
		if (Object.keys(this.patterns).length > 0) {
			setImmediate(() => this.client.psubscribe(Object.keys(this.patterns)));
		}
	});

	client.on("reconnecting", () => {
		// This event is going to fire multiple times 
		// during a disconnection event (potentially).
		// The guard lets us avoid useless work.
		if (this.connected){
			this.connected = false;
			this.activeChannels = new Set();
			this.activePatterns = new Set();
			let list = this.subscriptions;
			for (var box = list.getHead(); box !== null; box = box.getNext()) {
				if (box.onDisconnect) {
					if (util.types.isAsyncFunction(box.onDisconnect)) {
						setImmediate(box.onDisconnect);
					} else {
						box.onDisconnect();
					}
				}
			}
		}
	});

	client.on("subscribe", (channel) => {
		this.activeChannels.add(channel);
		let list = this.channels[channel];
		if (list) {
			for (var box = list.getHead(); box !== null; box = box.getNext()) {
				if (box.onActivation) {
					if (util.types.isAsyncFunction(box.onActivation)) {
						setImmediate(box.onActivation, channel);
					} else {
						box.onActivation(channel);
					}
				}
			}
		}
	});

	client.on("message", (channel, message) => {
		let list = this.channels[channel];
		if (list) {
			for (var box = list.getHead(); box != null; box = box.getNext()) {
				if (util.types.isAsyncFunction(box.onMessage)) {
					setImmediate(box.onMessage, channel, message);
				} else {
					box.onMessage(channel, message);
				}
			}
		}
	});

	client.on("psubscribe", (pattern) => {
		this.activePatterns.add(pattern);
		let list = this.patterns[pattern];
		if (list) {
			for (var box = list.getHead(); box !== null; box = box.getNext()) {
				if (box.onActivation) {
					if (util.types.isAsyncFunction(box.onActivation)) {
						setImmediate(box.onActivation, pattern);
					} else {
						box.onActivation(pattern);
					}
				}
			}
		}
	});

	client.on("pmessage", (pattern, channel, message) => {
		let list = this.patterns[pattern];
		if (list) {
			for (var box = list.getHead(); box !== null; box = box.getNext()) {
				if (util.types.isAsyncFunction(box.onMessage)) {
					setImmediate(box.onMessage, channel, message);
				} else {
					box.onMessage(channel, message);
				}
			}
		}
	});

	// Multiplexer state
	this.client = client;
	this.closed = false;
	this.connected = false;
	this.subscriptions = new List(null);
	this.channels = {};
	this.patterns = {};
	this.activeChannels = new Set();
	this.activePatterns = new Set();
}

Multiplexer.prototype.createChannelSubscription = 
	function createChannelSubscription(onMessage, onDisconnect, onActivation) {
		if (this.closed) throw Error("tried to use a closed multiplexer");
		if (!onMessage) throw Error("onMessage must be specified");
		return new ChannelSubscription(this, onMessage, onDisconnect, onActivation);
	};

Multiplexer.prototype.createPatternSubscription = 
	function createPatternSubscription(pattern, onMessage, onDisconnect, onActivation) {
		if (this.closed) throw Error("tried to use a closed multiplexer");
		if (!onMessage) throw Error("onMessage must be specified");
		return new PatternSubscription(this, pattern, onMessage, onDisconnect, onActivation);
	};

Multiplexer.prototype.createPromiseSubscription = 
	function createPromiseSubscription(prefix) {
		if (this.closed) throw Error("tried to use a closed multiplexer");
		return new PromiseSubscription(this, prefix);
	};

Multiplexer.prototype.close = 
	function close() {
		if (this.closed) throw Error("tried to use a closed multiplexer");
		this.client.quit();
		this.closed = true;
	};


Multiplexer.prototype._add_channel = function(channel, box) {
	if (!this.channels[channel]) {
		let list = new List(null);
		this.channels[channel] = list;
		this.client.subscribe(channel);
	}

	var list = this.channels[channel];
	list.prepend(box);
	if (this.activeChannels.has(channel)) {
		box.onActivation(channel);
	}
};


Multiplexer.prototype._remove_channel = function(channel, box) {
	// Detach box from its list.
	let list = box.removeFromList();
	if (list.isEmpty()) {
		this.client.unsubscribe(channel);
		delete this.channels[channel];
		this.activeChannels.delete(channel);
	}
};

Multiplexer.prototype._add_pattern = function(pattern, box) {
	if (!this.patterns[pattern]) {
		let list = new List(null);
		this.patterns[pattern] = list;
		this.client.psubscribe(pattern);
	}

	var list = this.patterns[pattern];
	list.prepend(box);
	if (this.activePatterns.has(pattern)) {
		box.onActivation(pattern);
	}
};


Multiplexer.prototype._remove_pattern = function(pattern, box) {
	// Detach box from its list.
	let list = box.removeFromList();
	if (list.isEmpty()) {
		this.client.punsubscribe(pattern);
		delete this.patterns[pattern];
		this.activePatterns.delete(pattern);
	}
};

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
}


exports.Multiplexer = Multiplexer;