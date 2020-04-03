const EventEmitter = require('events');
const { List, ListNode } = require("./internal/list.js");
const { SubscriptionClosedError } = require("./errors.js");


function SubscriptionInactiveError(message) {
    this.name = "SubscriptionInactiveError";
    this.message = (message || "");
}
SubscriptionInactiveError.prototype = Error.prototype;

function PromiseTimeoutError(message) {
    this.name = "PromiseTimeoutError";
    this.message = (message || "");
}
PromiseTimeoutError.prototype = Error.prototype;

function PromiseSubscription(mpx, prefix) {
	this.mpx = mpx;
	this.prefix = prefix
	this.pattern = mpx.createPatternSubscription(prefix+"*", 
		this.onMessage.bind(this), this.onDisconnect.bind(this), this.onActivation.bind(this));
	this.channels = {}
	this.active = false;
	this.activeWaiters = new List(null);
	this.closed = false;
}

PromiseSubscription.prototype.waitForActivation = 
	function() {
		if (this.closed) throw new SubscriptionClosedError("subscription closed");
		if (this.active) return Promise.resolve();

		// We are not active
		let that = this;
		let promise = new Promise(function(resolve, reject) {
			that.activeWaiters.prepend(new ListNode({resolve, reject}));
		});

		return promise;
	}



PromiseSubscription.prototype.waitForNewPromise = 
	function (suffix, timeout) {
		if (!this.active) throw new SubscriptionInactiveError("the PromiseSubscription is not active");
		if (this.active) return Promise.resolve(this.newPromise(suffix, timeout));

		// We are not active
		let that = this;
		let promise = new Promise(function(resolve, reject) {
			this.waitForActivation()
			.then(() => resolve(this.newPromise(suffix, timeout)))
			.catch((e) => reject(e));
		});

		return promise;
	}


PromiseSubscription.prototype.newPromise = 
	function(suffix, timeout) {
		if (this.closed) throw new SubscriptionClosedError("subscription closed");
		if (!this.active) throw new SubscriptionInactiveError("the PromiseSubscription is not active");

		let channel = this.prefix + suffix;
		if (!this.channels[channel]) {
			this.channels[channel] =  new List(null);
		}

		var that = this;
		var list = this.channels[channel];
		let promise = new Promise(function(resolve, reject) {
			var listNode = new ListNode({resolve, reject});
			list.prepend(listNode);
			listNode.timeoutId = setTimeout(function (){
				let list = listNode.removeFromList();
				if (list) {
					reject(new PromiseTimeoutError("timeout"));
					if (list.isEmpty()){
						delete that.channels[channel];
					}
				}
			}, timeout);
		});

		return promise;
	}

PromiseSubscription.prototype.clear = 
	function(error) {
		if (this.closed) throw new SubscriptionClosedError("subscription closed");
		
		for (let ch in this.channels){
			let list = this.channels[ch];
			for (var box = list.getHead(); box !== null; box = box.getNext()) {
				clearTimeout(box.timeoutId);
				box.reject(error);
			}
		}

		this.channels = {};
	}

PromiseSubscription.prototype.close = 
	function() {
		if (this.closed) throw new SubscriptionClosedError("subscription closed");
		this.clear();
		this.pattern.close(new SubscriptionClosedError("subscription closed"));
		let list = this.activeWaiters;
		for (var box = list.getHead(); box !== null; box = box.getNext()) {
			box.reject(new SubscriptionClosedError("subscription closed"));
		}
		this.closed = true;
	}


PromiseSubscription.prototype.onDisconnect =
	function onDisconnect() {
		this.active = false;
		this.clear(new SubscriptionInactiveError("the PromiseSubscription is not active"));
	} 

PromiseSubscription.prototype.onActivation = 
	function onActivation() {
		this.active = true;
		let list = this.activeWaiters;
		for (var box = list.getHead(); box !== null; box = box.getNext()) {
			box.resolve();
		}
		this.activeWaiters = new List(null);
	}

PromiseSubscription.prototype.onMessage = 
	function(channel, message) {
		let list = this.channels[channel];
		if (list) {
			for (var box = list.getHead(); box !== null; box = box.getNext()) {
				clearTimeout(box.timeoutId);
				box.resolve(message);
			}
		}

		delete this.channels[channel];
	}

exports.PromiseSubscription = PromiseSubscription;
exports.PromiseTimeoutError = PromiseTimeoutError;
exports.SubscriptionInactiveError = SubscriptionInactiveError;