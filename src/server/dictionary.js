const fs = require("fs");
const path = require("path");

const TERM_BANK_PATTERN = /^term_bank_\d+\.json$/

// The term bank schema loaded from disk and used below is described here:
// <https://github.com/yomidevs/yomitan/blob/3970918e05949d3f3191156c3a7fbef094b3f6bb/ext/data/schemas/dictionary-term-bank-v3-schema.json>.
//
// The key structure is:
//
//   Term (array, 8 items)
//   │
//   ├─ [0] expression : string
//   ├─ [1] reading : string
//   ├─ [2] definition tags : string | null
//   ├─ [3] rule identifiers : string
//   ├─ [4] popularity score (higher = more popular) : number
//   ├─ [5] definitions : array of items
//   │   ├─ string → simple definition text
//   │   └─ (the other kinds are not used by our dictionary)
//   ├─ [6] sequence number : integer
//   └─ [7] term tags : string

class Dictionary {
  constructor(expressionBank, readingBank) {
    this.expressionBank = expressionBank;
    this.readingBank = readingBank;
  }

  /**
   * Returns a list of dictionary matches for the given term by expression or
   * reading.
   */
  lookup(term) {
    const byExpression = this.expressionBank.get(term) || [];
    const byReading = this.readingBank.get(term) || [];

    // Deduplicate results between expression and reading results by ID.
    const seenIDs = new Set();
    const uniqueEntries = [];
    for (const match of byExpression) {
      if (!seenIDs.has(match.id)) {
        seenIDs.add(match.id);
        uniqueEntries.push(match.entry);
      }
    }
    for (const match of byReading) {
      if (!seenIDs.has(match.id)) {
        seenIDs.add(match.id);
        uniqueEntries.push(match.entry);
      }
    }

    // Sort by popularity score, descending.
    uniqueEntries.sort((a, b) => b[4] - a[4])

    // Merge entry data by sequence number.
    const mergedBySeqNum = new Map();
    for (const entry of uniqueEntries) {
      // The sequence number identifies terms with identical headwords.
      const {
        [0]: expression,
        [1]: reading,
        [2]: tags,
        [5]: gloss,
        [6]: sequenceNumber
      } = entry;

      if (!mergedBySeqNum.has(sequenceNumber)) {
        const data = {
          expression,
          reading,
          definitions: [{tags, gloss}]
        }

        mergedBySeqNum.set(sequenceNumber, data);
      } else {
        const data = mergedBySeqNum.get(sequenceNumber)

        // If sequence number is the same but expressions don't match, this is
        // likely an archaic or alternate spelling (e.g. これ vs 此れ). The
        // definitions for the archaism will be identical, so we can just
        // ignore them and prevent duplicates.
        //
        // At some future point, we could add the alternate expressions to the
        // payload if desired.
        //
        // Note that the pre-sort above also helps us here, since arhaisms will
        // have lower scores than non-archaic expressions and so we'll end up
        // ignoring/using the correct respective expressions.
        if (expression === data['expression']) {
          data['definitions'].push({tags, gloss});
        }
      }
    }

    // Convert to array of values. Note that Map maintains insertion order, so
    // our entries stay sorted by popularity per above.
    return Array.from(mergedBySeqNum.values());
  }

  /**
   * Loads all terms from filesystem and returns a Dictionary instance.
   */
  static load(dictionaryDir) {
    const files =
      fs.readdirSync(dictionaryDir)
        .filter(filename => TERM_BANK_PATTERN.test(filename));

    // The banks index term data by expression and by reading, respectively,
    // since there can be multiple entries with matching expressions/readings.
    const expressionBank = new Map();
    const readingBank = new Map();

    // We assign each entry a unique sequential ID.
    let currentID = 0;

    for (const file of files) {
      const filePath = path.join(dictionaryDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const entries = JSON.parse(content);

      for (const entry of entries) {
        if (!Array.isArray(entry)) {
          throw new Error(`Got non-array entity (${typeof entry}) for entry: ${entry}`);
        } else {
          const [expression, reading] = entry;

          if (!expressionBank.has(expression)) {
            expressionBank.set(expression, []);
          }

          if (!readingBank.has(reading)) {
            readingBank.set(reading, []);
          }

          const entryWithID = {id: currentID, entry};

          expressionBank.get(expression).push(entryWithID);
          readingBank.get(reading).push(entryWithID);

          currentID++;
        }
      }
    }

    return new Dictionary(expressionBank, readingBank);
  }
}

module.exports = { Dictionary };
