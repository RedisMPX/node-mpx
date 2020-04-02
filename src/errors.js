function SubscriptionClosedError(message) {
    this.name = "SubscriptionClosedError";
    this.message = (message || "");
}
SubscriptionClosedError.prototype = Error.prototype;

exports.SubscriptionClosedError = SubscriptionClosedError; 
