const EventEmitter = require('events');
const { ListNode } = require("./internal/list.js");
const { SubscriptionClosedError } = require("./errors.js");

function ChannelSubscription(mpx, onMessage, onDisconnect, onActivation) {
	this.mpx = mpx;
	this.channels = {}
	this.onMessage = onMessage;
	this.onDisconnectBox = new ListNode({onDisconnect});
	this.onActivation = onActivation;
	this.closed = false;
	this.mpx.subscriptions.prepend(this.onDisconnectBox);
}

// TODO: errors?
ChannelSubscription.prototype.add = 
	function add(channel) {
		if (this.closed) throw Error("tried to use a closed ChannelSubscription");
		if (this.channels[channel]) {
			return
		}

		let box = new ListNode({onMessage: this.onMessage, onActivation: this.onActivation});
		this.channels[channel] = box;
		this.mpx._add_channel(channel, box);
	};

ChannelSubscription.prototype.remove = 
	function remove(channel) {
		if (this.closed) throw SubscriptionClosedError;
		if (!this.channels[channel]) {
			return
		}

		let box = this.channels[channel];
		delete this.channels[channel];
		this.mpx._remove_channel(channel, box);
	};


ChannelSubscription.prototype.clear = 
	function clear() {
		if (this.closed) throw SubscriptionClosedError;
		
		for (let ch in this.channels){
			let box = this.channels[ch];
			this.mpx._remove_channel(ch, box);
		}

		this.channels = {};
	};

ChannelSubscription.prototype.close = 
	function close() {
		if (this.closed) throw SubscriptionClosedError;
		this.clear();
		this.onDisconnectBox.removeFromList();
		this.closed = true;
	};

exports.ChannelSubscription = ChannelSubscription;