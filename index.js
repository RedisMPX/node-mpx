const redis = require('redis');
const EventEmitter = require('events');
const { Multiplexer } = require("./src/multiplexer.js");

const { SubscriptionClosedError } = require("./src/errors.js");
const { SubscriptionInactiveError, PromiseTimeoutError } = require("./src/promise.js");

exports.Multiplexer = Multiplexer;
exports.SubscriptionClosedError = SubscriptionClosedError;
exports.SubscriptionInactiveError = SubscriptionInactiveError;
exports.PromiseTimeoutError = PromiseTimeoutError;