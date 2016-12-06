// Get element by CSS selector
function qs(selector, scope) {
	return (scope || document).querySelector(selector);
}

// Add event listeners
function on(target, type, callback, useCapture) {
	target.addEventListener(type, callback, !!useCapture);
}

// safe hasOwnProperty: has(obj, prop)
var has = Function.prototype.call.bind(Object.prototype.hasOwnProperty);