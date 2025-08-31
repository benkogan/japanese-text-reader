# Japanese Text Reader

A web application for reading Japanese text with interactive dictionary lookups. Enter Japanese text for analysis and click any word to see its readings (in hiragana) and definition in English.

## Getting started

Clone this repository, install dependencies with `npm install`, and start the server with `npm start`. Then, open your browser to <http://localhost:3000>.

Requires a recent version of Node.js and NPM.

## How it works

### Client

Since Japanese doesn't have spaces to indicate word boundaries, we need to use a morphological analyzer ([kuromoji.js](https://github.com/takuyaa/kuromoji.js)) to tokenize sentences into words. Our analyzer also provides information on tokenized words such as deinflection, which is critical for dictionary lookup of verbs, adjectives, etc.

When a word is clicked, the app tokenizes the surrounding text, determines which token was clicked, highlights the clicked word, and then makes a request to the back end for dictionary data on that word. The dictionary lookup results are formatted and displayed for the user.

### Server

The server ([Express](https://expressjs.com)) indexes Japanese dictionary data on launch and provides an endpoint for looking up term definitions, in addition to serving static client resources.

For our Japanese dictionary, we use the freely-available [JMdict](https://github.com/yomidevs/jmdict-yomitan) in the simpler legacy format.

## Inspiration and notes

This application is loosely based on an Japanese e-reader iPadOS app I created as a side project (as my first mobile app ever): [video demo here](https://www.youtube.com/watch?v=dIf7cS4Xd-w).

In this web app version, the most interesting part of the code is probably the logic handling word tokenization and boundary setting (for highlighting the clicked word). It's probably a little over-engineered to handle elements with multiple child text nodes given that the input is a simple text box, though in practice this can be helpful for handling formatted text, including text with [furigana ruby markup](https://en.wikipedia.org/wiki/Ruby_character#Markup_examples]) (which I had to deal with in the iPad app version and even appears in the video demo).
