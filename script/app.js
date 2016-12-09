var app = {
	DICTIONARY_VERSION: 0.7
};

// handle input form submit
on(qs('#input-form'), 'submit', function inputFormSubmit(event) {
	event.preventDefault();
	app.phrase = this['phrase-input'].value.trim();
	if (app.dictionary) {
		handlePhraseSubmission();
	}
});

function handlePhraseSubmission() {
	// get pronunciations for phrase
	app.phrasePronunciations = getPhrasePronunciations(app.phrase);
	console.log('Possible phrase pronunciations:', app.phrasePronunciations);

	// generate heterographs
	var phonemes = app.phrasePronunciations[0].split(' ');
	var wordMap = generateWordMap(phonemes);
	var heterographs = getHeterographsStartingAt(wordMap, phonemes, 0);
	console.log('heterographs:\n\n' + heterographs.join('\n'));
}

// fetch dictionary
var promiseOfDictionary = fetchDictionary().then(parseDictionary);

// build pronunciation tree
promiseOfDictionary.then(buildPronunciationTree);

// build dictionary
promiseOfDictionary.then(buildDictionary)
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

	return fetch('bower_components/cmudict/cmudict.dict').then(function(response) {
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
			var word = line.word;
			var phonemes = line.phonemes;
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

function buildDictionary(lines) {
	console.time('build dictionary');
	var dictionary = {};
	lines.forEach(function(line) {
		var word = line.word;
		var phonemes = line.phonemes;
		var pronunciation = phonemes.join(' ');
		// must use hasOwnProperty to avoid false positive on .constructor
		if (has(dictionary, word)) {
			// make sure the entry doesn't already have this pronunciation:
			// after removing the stress markers some pronunciations are identical
			if (dictionary[word].indexOf(pronunciation) < 0) {
				dictionary[word].push(pronunciation);
			}
		} else {
			dictionary[word] = [pronunciation];
		}
	});
	console.timeEnd('build dictionary');
	app.dictionary = dictionary;
	return dictionary;
}

// Keep a copy of the dictionary and its version in localstorage
function cacheDictionary(text) {
	localStorage.setItem('DICTIONARY_VERSION', app.DICTIONARY_VERSION);
	localStorage.setItem('DICTIONARY_CACHE', text);
}

/*
	parse the text passed and return an array with an object for each line
	
	sow S AW1
	sow(2) S OW1

	e.g., the two lines above would produce the following:

	{
	  word: 'sow',
	  phonemes: ['S', 'AW']
	}, {
	  word: 'sow',
	  phonemes: ['S', 'OW']
	}
*/
function parseDictionary(text) {
	// split lines
	var lines = text.trim().split(/\r?\n/).map(function(line) {
		// remove comments
		line = line.split('#')[0];

		// phonemes are seperated by spaces
		var phonemes = line.split(' ');

		return {
			// the word is before the first space and before the
			// (1), (2), etc. in entrys of alternate pronunciations
			word: phonemes.shift().split('(')[0],

			// remove the 0, 1, or 2 after phonemes denoting stress
			phonemes: removeStressMarkers(phonemes)
		};
	});

	console.log('# lines: ' + lines.length);

	return lines;
}


function generateHeterographsAtPosition(phonemes, position) {
	var words = [];

	// loop through each consecutive phoneme in the phrase until there
	// are no words in pronunciationTree starting with those phonemes
	var curBranch = app.pronunciationTree;
	for (var i = 0; i < phonemes.length; i++) {
		curBranch = curBranch[phonemes[position + i]];
		if (!curBranch) break;
		if (curBranch.words) {
			words.push({
				phonemeCount: i + 1,
				words: curBranch.words
			});
		}
	}

	return words;
}


/*
	// A break-down of the word 'amazing':

	// Each key in wordPositions points to an object.
	var wordPositions = {

	  // Each of these keys is the index in the phrase pronunciation
	  // of the first phoneme of the words listed in the object it points to
	  0: {

	    // Each key in these objects is the length of the words
	    // (number of phonemes) in the array they point to.
	    1: ['a', 'uh'],
	    2: ['uhm'],
	    4: ['amaze']
	  },

	  1: {
	    2: ['may'],
	    3: ['maze', 'maize']
	  },

	  3: {
	    3: ['zing']
	  }
	};
*/
function generateWordMap(phonemes) {
	var wordMap = {};

	// get an array of objects containing all the words that are pronounced at the
	// front of the phrase: each object contains words with a different phoneme count
	generateHeterographsAtPosition(phonemes, 0).forEach(function addWords(heterographsOfALength) {
		var position = this;
		var phonemeCount = heterographsOfALength.phonemeCount;
		var words = heterographsOfALength.words;

		// place each word in wordMap cataloged by their
		// position (index of first phoneme) and phoneme count
		if (!wordMap[position]) {
			wordMap[position] = {};
		}
		wordMap[position][phonemeCount] = words;

		// run again at the position following each word
		var newPosition = position + phonemeCount;
		if (newPosition < phonemes.length && !wordMap[newPosition]) {
			generateHeterographsAtPosition(phonemes, newPosition)
				// pass the index (in phonemes) of the next word as the this value
				.forEach(addWords, newPosition);
		}
	}, 0);

	console.log('Heterograph word map:', wordMap);
	return wordMap;
}


/*
*/
function getHeterographsStartingAt(wordMap, phonemes, position) {
	var phrases = [];

	// loop through the wordsOfLength arrays at position 0
	var wordsAtPos = wordMap[position];
	if (!wordsAtPos) return [];
	for (var phonemeCount in wordsAtPos) {
		phonemeCount = +phonemeCount;
		// get the words in each
		var words = wordsAtPos[phonemeCount];

		// if there are no more words
		var nextWordPos = position + phonemeCount;
		if (nextWordPos >= phonemes.length) return words;
		var heterographsAfterThis = getHeterographsStartingAt(wordMap, phonemes, nextWordPos);
		if (heterographsAfterThis.length)
		var newPhrases = combineStrings(words, heterographsAfterThis);
		phrases.push.apply(phrases, newPhrases);
	}

	return phrases;
}


// return an array of phoneme-combo strings each representing
// an alternate pronunciation of the passed phrase
function getPhrasePronunciations(phrase) {
	var wordsAfterFirst = getWords(phrase);
	console.log('Words entered: ', wordsAfterFirst);
	var firstWord = wordsAfterFirst.shift();
	var firstWordPronunciations = app.dictionary[firstWord];

	// seed the array of possible pronunciations of the
	// phrase with possible pronunciations of the first word
	var phrasePronunciations = firstWordPronunciations;

	// fill out the array of possible pronunciations of the
	// phrase with the rest of the words including every
	// combination of the different pronciations of each word
	wordsAfterFirst.forEach(function(word) {
		var wordPronunciations = app.dictionary[word] || [''];

		// concatenate the arrays of "possible pronunciations
		// of the phrase up to this word". Each array assumes
		// a different pronunciation for the current word
		phrasePronunciations = combineStrings(phrasePronunciations, wordPronunciations);
	});
	return phrasePronunciations;
}

// remove the digits 0, 1, and 2 from each
// of the phoneme strings in the passed array
function removeStressMarkers(phonemes) {
	return phonemes.map(function(phoneme) {
		var lastChar = phoneme[phoneme.length - 1];
		if ('012'.indexOf(lastChar) >= 0) {
			return phoneme.slice(0,-1);
		}
		return phoneme;
	});
}

// return all combinations of a string in firstStrings plus a string in secondStrings
function combineStrings(firstStrings, secondStrings) {
	return [].concat.apply([], firstStrings.map(function(aFristString) {
		// return strings that use this first string
		return secondStrings.map(function(aSecondString) {
			return aFristString + ' ' + aSecondString;
		});;
	}));
}