const express = require("express");
const knex = require("knex");
const config = require("./knexfile");

const app = express();
const db = knex(config.development);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Media Server is running!");
});

const PORT = process.env.PORT || 5435;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
