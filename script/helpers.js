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

/*
	return an array of the words in the passed
	string lowercased and stripped of punctuation

	edge cases and false positives:

	fail:
	crazy punctuation: interobang, etc.
	Dr. Drake (doesn't include period in word)
	fifty-five

	pass:
	Tennis, soccer, baseball, etc., are outdoor games.
	front-end
	He will win- it's obvious!
*/
var getWords = (function() {
	// word seperators: punctuation other than dash and period
	var re = /[,\/#!?$%\^&\*;:{}=\_—`~() ]+/g;

	return function getWords(phrase) {
		phrase = phrase.toLowerCase();

		var words = phrase.split(re).map(function(word) {
			// special handling of dash and period as they may appear mid-word
			return word.slice(-1) === '-' ? word.slice(0,-1) :
			word[0] === '-' ? word.slice(1) :
			word.split('.').length > 3 ? word :
			word.slice(-1) === '.' ? word.slice(0,-1) : word;
		});

		// don't include last empty word resulting from closing sentence punctuation
		return words[words.length - 1] === '' ? words.slice(0, -1) : words;
	};
})();