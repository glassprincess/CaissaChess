/* Собирает openings.json из TSV lichess-org/chess-openings (CC0). */
"use strict";
const fs = require("fs");
const path = require("path");
const Pgn = require("../assets/web/pgn.js");
const Chess = require("../assets/web/chess.js");

const cache = path.join(__dirname, "cache");
const out = path.join(__dirname, "..", "assets", "web", "openings.json");
const files = ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"];

function keyOf(fen) {
  return fen.split(" ").slice(0, 4).join(" ");
}

const byKey = new Map();
let total = 0;
let failed = 0;

for (const file of files) {
  const text = fs.readFileSync(path.join(cache, file), "utf8").trim().split(/\r?\n/);
  for (let i = 1; i < text.length; i++) {
    const row = text[i].split("\t");
    if (row.length < 3) continue;
    const eco = row[0].trim();
    const name = row[1].trim();
    const pgn = row[2].trim();
    const parsed = Pgn.parse(pgn);
    if (!parsed.games.length || !parsed.games[0].ok) { failed++; continue; }
    const g = parsed.games[0];
    const key = keyOf(g.finalFen);
    total++;
    const prev = byKey.get(key);
    if (!prev || name.length > prev.name.length) byKey.set(key, { k: key, eco, name });
  }
}

const lines = Array.from(byKey.values()).sort((a, b) => (a.eco + a.name).localeCompare(b.eco + b.name));
fs.writeFileSync(out, JSON.stringify({ v: 1, lines }));
console.log("lines:", lines.length, "parsed:", total, "failed:", failed, "bytes:", fs.statSync(out).size);
