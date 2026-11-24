"use strict";
const assert = require("assert");
const Pgn = require("../assets/web/pgn.js");
const Lessons = require("../assets/web/opening-lessons.js");
const guides = require("../assets/web/opening-guides.json").guides;

function game(line) {
  const parsed = Pgn.parse(line);
  assert.deepStrictEqual(parsed.errors, [], line);
  return parsed.games[0];
}

let lines = 0, moves = 0;
guides.forEach(function (guide) {
  assert(guide.variations.length >= 5, guide.id + ": insufficient variations");
  [{ line: guide.mainline, notes: guide.notes }].concat(guide.variations).forEach(function (variation) {
    const parsed = game(variation.line), notes = Lessons.notes(parsed, variation.notes);
    assert.strictEqual(notes.length, parsed.moves.length);
    notes.forEach(function (note) { assert(typeof note === "string" && note.trim().length > 25); assert(!/undefined|NaN/.test(note)); });
    if (variation.notes) assert.strictEqual(variation.notes.length, parsed.moves.length);
    lines++;
    moves += parsed.moves.length;
  });
});

const qga = guides.find(function (g) { return g.id === "qgd"; }).variations.filter(function (v) { return v.name.indexOf("Queen's Gambit Accepted:") === 0 && v.notes; });
assert.strictEqual(qga.length, 3);
qga.forEach(function (variation) {
  const notes = Lessons.notes(game(variation.line), variation.notes);
  assert(/принимают ферзевый гамбит/.test(notes[3]));
  assert(/покидает центр/.test(notes[3]));
  assert(notes.every(function (note, i) { return note === variation.notes[i]; }));
});
assert(/подрывают/.test(qga[0].notes[9]));
assert(/центр d4–e4/.test(qga[1].notes[4]));
assert(/изолированная пешка d4/.test(qga[2].notes[8]));

const partial = Lessons.notes(game("1. e4 e5"), ["Авторское пояснение"]);
assert.strictEqual(partial[0], "Авторское пояснение");
assert(/e7–e5/.test(partial[1]));
assert(/контролирует d5/.test(Lessons.notes(game("1. e4"))[0]));
assert(/пешку/.test(Lessons.notes(game("1. e4 d5 2. exd5"))[2]));
assert(/рокируют/.test(Lessons.notes(game("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O"))[6]));
assert(/Шах/.test(Lessons.notes(game("1. e4 e5 2. Bc4 Nc6 3. Bxf7+"))[4]));
assert(/Мат/.test(Lessons.notes(game("1. f3 e5 2. g4 Qh4#"))[3]));
const ep = Lessons.notes(game("1. e4 a6 2. e5 d5 3. exd6"));
assert(/на проходе/.test(ep[4]));
const promotion = Lessons.notes(game('[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n1. a8=Q+'));
assert(/превращается: ферзь/.test(promotion[0]));
assert.strictEqual(Lessons.notes({ moves: [] }).length, 0);
assert.strictEqual(guides.length, 50);
assert.strictEqual(lines, 445);
assert(Lessons.matchesFilter(guides.find(g => g.id === "torre"), "attack"));
assert(Lessons.matchesFilter({variations: [{name: "Falkbeer Countergambit"}]}, "counter"));
assert(!Lessons.matchesFilter({name: "Quiet system"}, "attack"));
assert(guides.some(g => Lessons.matchesFilter(g, "counter")));
console.log("ok opening lessons: " + guides.length + " families, " + lines + " lines, " + moves + " move explanations; 3 curated QGA continuations; capture, castling, check, mate, en passant, promotion");
