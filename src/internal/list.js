function List(head) {
	this._head = head;
	if(head) {
		head._list = this;
	}
}

List.prototype.isEmpty = function() {
	return this._head === null;
};

List.prototype.prepend = function(listNode) {
	listNode._list = this;
	if (this._head) {
		this._head._prev = listNode;
		this._next = this._head;
		this._head = listNode;
	} else {
		this._head = listNode;
	}
};

List.prototype.getHead = function() {
	return this._head;
};


function ListNode(payload) {
	this._list = null;
	this._prev = null; 
	this._next = null
	Object.assign(this, payload);
}

ListNode.prototype.getNext = function() {
	return this._next;
};

ListNode.prototype.removeFromList = function() {
	var list = this._list;
	if (list) {
		if (list._head === this) {
			list._head = this._next;
		}
		if (this._prev){
			this._prev._next = this._next;
		}
		if (this._next){
			this._next._prev = this._prev;
		}
		this._list = null;
		this._next = null;
		this._prev = null;
	}
	return list;
};

exports.List = List;
exports.ListNode = ListNode;