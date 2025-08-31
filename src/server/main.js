const express = require("express");
const path = require("path");
const { Dictionary } = require("./dictionary");

const PORT = 3000;
const PATHS = {
  jmdict: path.join(__dirname, "..", "..", "dictionary", "jmdict"),
  kuromoji: path.join(__dirname, "..", "..", "dictionary", "kuromoji"),
  client: path.join(__dirname, "..", "client")
}

const dictionary = Dictionary.load(PATHS.jmdict);
const app = express();

app.use(express.static(PATHS.client));
app.use("/dictionary/kuromoji", express.static(PATHS.kuromoji));

app.get("/dictionary/:term", (req, res) => {
  const { term } = req.params;
  const results = dictionary.lookup(term);

  console.log(`Sending definitions for ${results.map(r => r.expression)}`);

  res.json(results);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
