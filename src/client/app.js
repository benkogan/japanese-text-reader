/**
 * DOM-affecting operations.
 */
class UI {
  constructor() {
    this.textInput = document.getElementById('text-input');
    this.clickableText = document.getElementById('clickable-text');
    this.dictionaryContent = document.getElementById('dictionary-content');
    this.currentHighlight = null;
  }

  replaceClickableText(text) {
    this.clickableText.innerHTML = text;
  }

  clearHighlight() {
    if (this.currentHighlight) {
      const span = this.currentHighlight;
      const parent = span.parentNode;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
      this.currentHighlight = null;
    }
  }

  showHighlight(bounds) {
    const highlightRange = document.createRange();
    highlightRange.setStart(bounds.start.node, bounds.start.offset);
    highlightRange.setEnd(bounds.end.node, bounds.end.offset);

    const span = document.createElement('span');
    span.className = 'char-highlight';
    this.currentHighlight = span;
    span.appendChild(highlightRange.extractContents());
    highlightRange.insertNode(span);
    highlightRange.collapse();
  }

  showDefinition(entries, searchTerm) {
    let html = `<h4>Search term: ${searchTerm}</h4>`;

    if (entries && entries.length > 0) {
      entries.forEach(entry => {
        html += `<div class="dictionary-entry">`;
        html += `<h5>${entry.expression} (${entry.reading})</h5>`;
        html += `<ul>`;
        entry.definitions.forEach(def => {
          html += `<li>${def.gloss.join(', ')}</li>`;
        });
        html += `</ul>`;
        html += `</div>`;
      });
    } else {
      html += '<p>No dictionary entries found.</p>';
    }

    this.dictionaryContent.innerHTML = html;
  }

  showDictionaryError(message) {
    this.dictionaryContent.innerHTML = `<p class="dictionary-error">${message}</p>`;
  }

  resetDictionaryDisplay() {
    this.dictionaryContent.innerHTML = 'Click a word to look up the definition';
  }
}

class Shim {
  static caretRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        const range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset + 1);
        return range;
      }
    }
  }
}

const ui = new UI();

// Core app logic is attached to event handlers after initializing tokenizer.
kuromoji.builder({dicPath: './dictionary/kuromoji'}).build((err, tokenizer) => {
  if (err) throw err;

  ui.replaceClickableText(ui.textInput.value);

  ui.textInput.addEventListener('input', () => {
    const inputValue = ui.textInput.value;
    ui.replaceClickableText(inputValue);
  });

  document.addEventListener('click', async (e) => {
    const range = Shim.caretRangeFromPoint(e.clientX, e.clientY);

    ui.clearHighlight();

    const clicked = getClickedToken(tokenizer, ui.clickableText, range);

    if (!clicked) {
      // No token found at click position so we reset dictionary display.
      ui.resetDictionaryDisplay();
      return;
    }

    ui.showHighlight(clicked.bounds);

    try {
      const encodedTerm = encodeURIComponent(clicked.token.info.basic_form);
      const response = await fetch(`/dictionary/${encodedTerm}`);

      if (!response.ok) {
        throw new Error(`Received status code ${response.status}`)
      }

      const entries = await response.json();

      ui.showDefinition(entries, clicked.token.info.basic_form);
    } catch (error) {
      console.log(`Error: ${error}`);
      ui.showDictionaryError(`Error fetching dictionary data: ${error.message}`);
    }
  });
});

/**
 * Returns an object containing the clicked token (and its info from kuromoji
 * like deinflection), the text nodes in which the clicked token starts and
 * ends, as well as the token start and end offsets within those respective
 * nodes.
 */
function getClickedToken(tokenizer, textElement, clickedRange) {
  if (!clickedRange) return null;
  if (!(clickedRange.startContainer.nodeType === Node.TEXT_NODE)) return null;

  const nodeBounds = getNodeBounds(textElement);
  const text = nodeBounds.list.map(nb => nb.node.textContent).join('');

  // We use our own offset rather than kuromoji.js's `surface_form.
  // word_position` since the latter seems to have a bug when handling
  // the combination of a punctuation character + "。". (It's equally
  // possible that I just don't understand the meaning of this property.)
  //
  // Some illustrative examples:
  //
  //  tokenizer.tokenize("あ[.い").map(t => [t.surface_form, t.word_position])
  //  // -> [["あ", 1], ["[.", 2], ["い", 4]] (OK)
  //
  //  tokenizer.tokenize("あ[。い").map(t => [t.surface_form, t.word_position])
  //  // -> [["あ", 1], ["[。", 2], ["い", 3]] (weird!)
  //
  //  tokenizer.tokenize("あ|。い").map(t => [t.surface_form, t.word_position])
  //  // -> [["あ", 1], ["|。", 2], ["い", 3]] (weird!)
  //
  //  tokenizer.tokenize("あ。い").map(t => [t.surface_form, t.word_position])
  //  // -> [["あ", 1], ["。", 2], ["い", 3]] (OK)
  let offset = 0;
  const tokens = [];

  tokenizer
    .tokenize(text)
    .forEach(token => {
      tokens.push({
        surfaceForm: token.surface_form,
        start: offset,
        end: offset + token.surface_form.length,
        info: token
      });
      offset += token.surface_form.length;
    });

  const clickedNode = clickedRange.startContainer;
  const clickedOffsetInNode = clickedRange.startOffset;
  const clickedNodeBounds = nodeBounds.byNode.get(clickedNode);

  if (!clickedNodeBounds) return null;

  const clickedOffsetInText = clickedNodeBounds.start + clickedOffsetInNode;

  // Can just check that clicked is before end since tokens are
  // listed left-to-right.
  const clickedToken = tokens.find(t => clickedOffsetInText < t.end);

  if (!clickedToken) return null;

  const bounds = {};
  for (const nb of nodeBounds.list) {
    if (clickedToken.start <= nb.end) {
      bounds.start = {};
      bounds.start.node = nb.node;
      bounds.start.offset = clickedToken.start - nb.start;
    }
    if (clickedToken.end <= nb.end) {
      bounds.end = {};
      bounds.end.node = nb.node;
      bounds.end.offset = clickedToken.end - nb.start;
      break;
    }
  }

  if (!bounds.start || !bounds.end) {
    throw new Error(`Missing bounding info for clicked token ${clickedToken.surface_form}`);
  }

  return {token: clickedToken, bounds};
}

/**
 * For a given root element, returns all child text nodes and their start and
 * end offset bounds relative to the entirety of the text as both an ordered
 * list and a map by node.
 */
function getNodeBounds(rootElement) {
  const nodeBounds = {list: [], byNode: new Map()};
  let offset = 0;

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent.length;
      nodeBounds.list.push({node, start: offset, end: offset + length});
      nodeBounds.byNode.set(node, {start: offset, end: offset + length});
      offset += length;
    } else {
      for (let child of node.childNodes) walk(child);
    }
  }

  walk(rootElement);

  return nodeBounds;
}
