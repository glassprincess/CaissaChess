"use strict";
const assert = require("assert");
const Pgn = require("../assets/web/pgn.js");
const Lessons = require("../assets/web/opening-lessons.js");
const russian = require("../assets/web/opening-guides.json");
const english = require("../assets/web/opening-guides.en.json");
assert.strictEqual(english.guides.length, 50);
assert(!/[А-Яа-яЁё]/.test(JSON.stringify(english)), "English guide data contains Cyrillic");
let lines = 0, moves = 0;
english.guides.forEach(function (guide, i) {
  const original = russian.guides[i];
  assert.strictEqual(guide.id, original.id);
  assert.deepStrictEqual(guide.match, original.match);
  assert.strictEqual(guide.mainline, original.mainline);
  ["white", "black", "mistakes"].forEach(function (field) { assert.strictEqual(guide[field].length, original[field].length); });
  assert.strictEqual(guide.variations.length, original.variations.length);
  [{line: guide.mainline, notes: guide.notes}].concat(guide.variations).forEach(function (variation, j) {
    if (j) assert.strictEqual(variation.line, original.variations[j - 1].line);
    const parsed = Pgn.parse(variation.line);
    assert.deepStrictEqual(parsed.errors, []);
    const notes = Lessons.notes(parsed.games[0], variation.notes, "en");
    assert.strictEqual(notes.length, parsed.games[0].moves.length);
    notes.forEach(function (note) { assert(note.length > 25); assert(!/[А-Яа-яЁё]|undefined|NaN/.test(note), note); });
    if (variation.notes) assert.deepStrictEqual(notes, variation.notes);
    lines++; moves += notes.length;
  });
});
function notes(line) { return Lessons.notes(Pgn.parse(line).games[0], null, "en"); }
assert(/controls d5/.test(notes("1. e4")[0]));
assert(/captures the pawn/.test(notes("1. e4 d5 2. exd5")[2]));
assert(/castles kingside/.test(notes("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O")[6]));
assert(/Check:/.test(notes("1. e4 e5 2. Bc4 Nc6 3. Bxf7+")[4]));
assert(/Checkmate:/.test(notes("1. f3 e5 2. g4 Qh4#")[3]));
assert(/en passant/.test(notes("1. e4 a6 2. e5 d5 3. exd6")[4]));
assert(/promotes to a queen/.test(notes('[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n1. a8=Q+')[0]));
assert(!/[А-Яа-яЁё]/.test(Lessons.notes(Pgn.parse("1. e4").games[0], ["Русская заметка"], "en")[0]));
assert.strictEqual(lines, 445);
assert.strictEqual(moves, 3643);
console.log("ok English opening guides: 50 families, 445 unchanged legal lines, 3643 English notes");
