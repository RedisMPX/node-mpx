const EventEmitter = require('events');
const { ListNode } = require("./internal/list.js");
const { SubscriptionClosedError } = require("./errors.js");


function PatternSubscription(mpx, pattern, onMessage, onDisconnect, onActivation) {
	this.mpx = mpx;
	this.pattern = pattern;
	this.onDisconnectBox = new ListNode({onDisconnect});
	this.box = new ListNode({onMessage, onActivation});
	this.closed = false;

	this.mpx.subscriptions.prepend(this.onDisconnectBox);
	this.mpx._add_pattern(pattern, this.box);
}
	
PatternSubscription.prototype.close = function() {
	if (this.closed) throw SubscriptionClosedError;
	this.mpx._remove_pattern(this.pattern, this.box);
	this.onDisconnectBox.removeFromList();
	this.closed = true;
};

exports.PatternSubscription = PatternSubscription;