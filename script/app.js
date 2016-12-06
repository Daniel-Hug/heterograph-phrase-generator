var app = {
	DICTIONARY_VERSION: 0.7
};

// handle input form submit
on(qs('#input-form'), 'submit', function inputFormSubmit(event) {
	event.preventDefault();
	app.phrase = this['phrase-input'].value.trim();
	if (app.wordMap) {
		handlePhraseSubmission();
	}
});

function handlePhraseSubmission() {
	app.phrasePronunciations = getPhrasePronunciations(app.phrase);
	console.log('Possible phrase pronunciations:', app.phrasePronunciations);
	generateHeterographs(app.phrasePronunciations[0]);
}

// fetch dictionary
var promiseOfDictionary = fetchDictionary().then(parseDictionary);

// build pronunciation tree
promiseOfDictionary.then(buildPronunciationTree);

// build word map
promiseOfDictionary.then(buildWordMap)
	// generate heterograph for the phrase if already submitted
	.then(function() {
		if (app.phrase) {
			handlePhraseSubmission();
		}
	});

function fetchDictionary() {
	// Is it in localStorage?
	if (has(localStorage, 'DICTIONARY_VERSION')) {
		// make sure cached version is latest
		var cachedVersion = localStorage.getItem('DICTIONARY_VERSION');
		if (cachedVersion >= app.DICTIONARY_VERSION) {
			// retrieve from localStorage
			console.time('dictionary from cache');
			return new Promise(function(resolve) {
				var text = localStorage.getItem('DICTIONARY_CACHE');
				console.timeEnd('dictionary from cache');
				resolve(text);
			});
		}
	}

	// fallback to ajax request
	console.log('fetching dictionary...');
	console.time('dictionary fetch');

	return fetch('cmudict/cmudict.dict').then(function(response) {
		// cache response in localStorage
		var promiseOfText = response.text();
		promiseOfText.then(cacheDictionary);

		console.timeEnd('dictionary fetch');
		return promiseOfText;
	}, function(reason) {
		console.log('dictionary fetch failed: ' + reason);
	});
}

function buildPronunciationTree(lines) {
	return new Promise(function (fulfill){
		console.time('generate pronunciation tree');
		var pronunciationTree = {};
		lines.forEach(function(line) {
			var phonemes = line.split(' ');
			var word = phonemes.shift();
			var pointer = pronunciationTree;

			// form a branch on pronunciationTree made up of a property for each phoneme
			var phoneme;
			for (var i = 0; i < phonemes.length - 1; i++) {
				phoneme = phonemes[i];
				if (!pointer[phoneme]) {
					pointer[phoneme] = {};
				}
				pointer = pointer[phoneme];
			}

			// treat the leaf node special
			phoneme = phonemes[i];
			if (!pointer[phoneme]) {
				pointer[phoneme] = {
					words: [word]
				};
			} else {
				if (!pointer[phoneme].words) {
					pointer[phoneme].words = [];
				}
				pointer[phoneme].words.push(word);
			}
		});
		console.timeEnd('generate pronunciation tree');
		app.pronunciationTree = pronunciationTree;
		fulfill(pronunciationTree);
	});
}

// FIX: some words end in (1), (2), etc. for alternate pronunciations
function buildWordMap(lines) {
	console.time('generate word map');
	var wordMap = {};
	lines.forEach(function(line) {
		var phonemes = line.split(' ');
		var word = phonemes.shift().split('(')[0];
		var pronunciation = phonemes.join(' ');
		// must use hasOwnProperty to avoid false positive on .constructor
		if (has(wordMap, word)) {
			wordMap[word].push(pronunciation);
		} else {
			wordMap[word] = [pronunciation];
		}
	});
	console.timeEnd('generate word map');
	app.wordMap = wordMap;
	return wordMap;
}

function cacheDictionary(text) {
	localStorage.setItem('DICTIONARY_VERSION', app.DICTIONARY_VERSION);
	localStorage.setItem('DICTIONARY_CACHE', text);
}

function parseDictionary(text) {
	// split lines
	var lines = text.trim().split(/\r?\n/).map(function(line) {
		// remove comments
		line = line.split('#')[0];

		return removeStressMarkers(line.split(' '));
	});

	console.log('# lines: ' + lines.length);

	return lines;
}

function generateHeterographs(pronunciation) {
	var phonemes = pronunciation.split(' ');
	var possibleStartingWords = [];

	// loop through each consecutive phoneme in the phrase
	var curBranch = app.pronunciationTree;
	for (var i = 0; i < phonemes.length; i++) {
		curBranch = curBranch[phonemes[i]];
		if (!curBranch) break;
		if (curBranch.words) {
			possibleStartingWords.push.apply(possibleStartingWords, curBranch.words)
		}
	}

	console.log('Possible words to start the rebus:', possibleStartingWords);
}

/*  edge cases and false positives:

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

function getPhrasePronunciations(phrase) {
	var wordsAfterFirst = getWords(phrase);
	console.log('Words entered: ', wordsAfterFirst);
	var firstWord = wordsAfterFirst.shift();
	var firstWordPronunciations = app.wordMap[firstWord]

	// seed the array of possible pronunciations of the
	// phrase with possible pronunciations of the first word
	var phrasePronunciations = firstWordPronunciations;

	// fill out the array of possible pronunciations of the
	// phrase with the rest of the words including every
	// combination of the different pronciations of each word
	wordsAfterFirst.forEach(function(word) {
		var wordPronunciations = app.wordMap[word] || [''];

		// concatenate the arrays of "possible pronunciations
		// of the phrase up to this word". Each array assumes
		// a different pronunciation for the current word
		phrasePronunciations = [].concat.apply([], wordPronunciations.map(function(wordPronunciation) {
			// add this pronunciation of the word to the end of every
			// possible pronunciation for the phrase up to this point in order
			// to get a new array of possible pronunciations of the phrase
			// up to this word assuming this pronunciation for the word
			var phrasePronunciationsWithThisWordPronunciation = 
				phrasePronunciations.map(function(phrasePronunciation) {
					return phrasePronunciation + ' ' + wordPronunciation;
				});
			return phrasePronunciationsWithThisWordPronunciation;
		}));
	});
	return phrasePronunciations;
}

function removeStressMarkers(phonemes) {
	return phonemes.map(function(phoneme) {
		var lastChar = phoneme[phoneme.length - 1];
		if ('012'.indexOf(lastChar) >= 0) {
			return phoneme.slice(0,-1);
		}
		return phoneme;
	}).join(' ');
}