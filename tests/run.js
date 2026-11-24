/* Тесты без фреймворка: node tests/run.js */
"use strict";
const path = require("path");
const fs = require("fs");
const assert = require("assert");

const WEB = path.join(__dirname, "..", "assets", "web");
const Chess = require(path.join(WEB, "chess.js"));
const MR = require(path.join(WEB, "review.js"));
const An = require(path.join(WEB, "analysis.js"));
const Pgn = require(path.join(WEB, "pgn.js"));
const OL = require(path.join(WEB, "openings-lookup.js"));
const Eng = require(path.join(WEB, "engine.js"));

const openings = require(path.join(WEB, "openings.json"));
const guides = require(path.join(WEB, "opening-guides.json")).guides;

let failed = 0;
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("ok   " + name);
  } catch (e) {
    failed++;
    console.log("FAIL " + name);
    console.log("     " + (e && e.message ? e.message : e));
  }
}

function sanList(state, ucis) {
  const out = [];
  let st = state;
  for (const u of ucis) {
    const mv = Chess.legalMoves(st).find(function (m) { return Chess.uci(m) === u; });
    if (!mv) throw new Error("нет хода " + u);
    out.push(Pgn.sanOf(st, u));
    st = Chess.apply(st, mv);
  }
  return out;
}

const START = Chess.startState();

test("perft начальной позиции", function () {
  assert.strictEqual(Chess.perft(START, 1), 20);
  assert.strictEqual(Chess.perft(START, 2), 400);
  assert.strictEqual(Chess.perft(START, 3), 8902);
});

test("FEN туда и обратно", function () {
  const fen = Chess.toFen(START);
  assert.strictEqual(fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  assert.strictEqual(Chess.toFen(Chess.fromFen(fen)), fen);
});

test("SAN: рокировка, взятие, шах", function () {
  let st = Chess.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.strictEqual(Pgn.sanOf(st, "e1g1"), "O-O");
  assert.strictEqual(Pgn.sanOf(st, "e1c1"), "O-O-O");
  st = Chess.fromFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
  assert.strictEqual(Pgn.sanOf(st, "e2e4"), "e4");
});

test("SAN: шах и мат", function () {
  let st = Chess.fromFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
  assert.strictEqual(Pgn.sanOf(st, "a1a8"), "Ra8#");
  st = Chess.fromFen("4k3/8/8/8/8/8/8/4KR2 w - - 0 1");
  assert.strictEqual(Pgn.sanOf(st, "f1f8"), "Rf8+");
});

test("PGN: разбор партии и результат", function () {
  const text = [
    '[Event "Test"]',
    '[White "A"]',
    '[Black "B"]',
    '[Result "1-0"]',
    '',
    "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0"
  ].join("\n");
  const p = Pgn.parse(text);
  assert.strictEqual(p.errors.length, 0);
  assert.strictEqual(p.games.length, 1);
  assert.strictEqual(p.games[0].moves.length, 7);
  assert.strictEqual(p.games[0].moves[6].san, "Qxf7#");
  assert.strictEqual(Pgn.gameStatus(Chess.fromFen(p.games[0].finalFen)), "mate");
});

test("PGN: несколько партий в одном файле", function () {
  const one = '[White "A"]\n[Black "B"]\n\n1. e4 e5 *';
  const two = '[White "C"]\n[Black "D"]\n\n1. d4 d5 *';
  const p = Pgn.parse(one + "\n\n" + two);
  assert.strictEqual(p.games.length, 2);
  assert.strictEqual(p.games[0].moves[0].uci, "e2e4");
  assert.strictEqual(p.games[1].moves[0].uci, "d2d4");
});

test("PGN: комментарии, варианты и номера без пробелов", function () {
  const p = Pgn.parse("1.e4 {коммент} e5 (1...c5 2.Nf3) 2.Nf3 $1 Nc6 *");
  assert.strictEqual(p.errors.length, 0);
  assert.deepStrictEqual(p.games[0].moves.map(function (m) { return m.uci; }), ["e2e4", "e7e5", "g1f3", "b8c6"]);
});

test("PGN: неверный ход даёт ошибку, а не мусор", function () {
  const p = Pgn.parse("1. e4 e5 2. Qh5 Nf6 3. Qxz9 *");
  assert.strictEqual(p.games[0].ok, false);
  assert.ok(p.errors.length === 1);
});

test("PGN: запись в текст читается обратно", function () {
  const st = Chess.startState();
  const ucis = ["e2e4", "e7e5", "g1f3", "b8c6"];
  const sans = sanList(st, ucis);
  const rows = sans.map(function (s, i) { return { san: s, ply: i }; });
  const text = Pgn.toPgn({ White: "A", Black: "B" }, rows, "*");
  const p = Pgn.parse(text);
  assert.strictEqual(p.errors.length, 0);
  assert.deepStrictEqual(p.games[0].moves.map(function (m) { return m.uci; }), ucis);
});

test("review: оценки и вероятность победы", function () {
  assert.strictEqual(MR.scoreToCp({ type: "cp", value: 35 }), 35);
  assert.ok(MR.scoreToCp({ type: "mate", value: 1 }) > 90000);
  assert.ok(MR.scoreToCp({ type: "mate", value: -1 }) < -90000);
  assert.strictEqual(MR.whiteCp({ type: "cp", value: 50 }, "w"), 50);
  assert.strictEqual(MR.whiteCp({ type: "cp", value: 50 }, "b"), -50);
  assert.strictEqual(MR.winPercent(0), 50);
  assert.ok(MR.winPercent(300) > 50 && MR.winPercent(-300) < 50);
  assert.strictEqual(MR.formatEval({ type: "cp", value: 35 }, "w"), "+0.4");
  assert.strictEqual(MR.formatEval({ type: "mate", value: 2 }, "w"), "#2");
  assert.strictEqual(MR.formatEval({ type: "mate", value: 2 }, "b"), "#-2");
});

test("review: книги и зевки классифицируются", function () {
  assert.strictEqual(MR.classify({ played: "e2e4", bestmove: "e2e4", book: true }).key, "book");
  const blunder = MR.classify({
    played: "h2h3", bestmove: "e2e4",
    before: { type: "cp", value: 20 }, after: { type: "cp", value: 500 }
  });
  assert.strictEqual(blunder.key, "blunder");
  const best = MR.classify({
    played: "e2e4", bestmove: "e2e4",
    before: { type: "cp", value: 20 }, after: { type: "cp", value: -20 }
  });
  assert.strictEqual(best.key, "best");
});

test("analysis: sharp -> обычная категория, единственный ход -> forced", function () {
  const a = An.normalize({ key: "sharp", loss: 3 });
  assert.strictEqual(a.key, "good");
  const b = An.normalize({ key: "blunder", loss: 40, legalCount: 1 });
  assert.strictEqual(b.key, "forced");
  assert.strictEqual(b.loss, 0);
  assert.strictEqual(An.category("forced").label, "Единственный ход");
  assert.strictEqual(An.category("sharp"), null);
});

test("analysis: точность, счётчики и вердикт", function () {
  assert.ok(Math.abs(An.moveAccuracy(0) - 100) < 0.01);
  assert.ok(An.moveAccuracy(10) < An.moveAccuracy(0));
  assert.strictEqual(An.fmt(87.25), "87,3");
  const rows = [
    { color: "w", key: "best", loss: 0, ply: 0 },
    { color: "b", key: "blunder", loss: 40, ply: 1 },
    { color: "w", key: "good", loss: 4, ply: 2 }
  ];
  const s = An.sideStats(rows);
  assert.strictEqual(s.whiteMoves, 2);
  assert.strictEqual(s.blackMoves, 1);
  assert.strictEqual(s.counts.blunder, 1);
  assert.ok(s.white > s.black);
  assert.ok(An.verdict(s).indexOf("Белые") === 0);
  assert.ok(An.keyMoves(rows, 5).some(function (r) { return r.key === "blunder"; }));
});

test("analysis: нет оценок — не считаем ход", function () {
  const s = An.sideStats([{ color: "w", key: null, loss: undefined }]);
  assert.strictEqual(s.white, null);
  assert.strictEqual(An.verdict(s), "");
});

test("openings: индекс и поиск после 1. e4", function () {
  const index = OL.buildIndex(openings.lines);
  assert.ok(openings.lines.length > 3000);
  const afterE4 = Chess.apply(START, Chess.legalMoves(START).find(function (m) { return Chess.uci(m) === "e2e4"; }));
  const hit = OL.lookup(index, Chess.toFen(afterE4));
  assert.ok(hit && hit.name);
  assert.strictEqual(OL.fenKey("a b c d e f"), "a b c -");
  assert.strictEqual(OL.lookup(index, "8/8/8/8/8/8/8/8 w - - 0 1"), null);
});

test("openings: 50 семейств и их линии разбираются", function () {
  assert.ok(guides.length >= 50);
  for (const g of guides) {
    assert.ok(g.name && g.idea && g.white.length && g.black.length && g.mistakes.length, g.id);
    const p = Pgn.parse(g.mainline);
    assert.strictEqual(p.errors.length, 0, g.id + ": " + p.errors.join("; "));
    assert.ok(p.games[0].moves.length > 2, g.id);
    for (const v of g.variations) {
      const pv = Pgn.parse(v.line);
      assert.strictEqual(pv.errors.length, 0, g.id + " / " + v.name + ": " + pv.errors.join("; "));
    }
  }
});

test("openings: семейство и подпись", function () {
  const g = guides.find(function (x) { return x.id === "italian"; });
  const line = { name: "Italian Game: Giuoco Piano" };
  assert.strictEqual(OL.family(line, guides), g);
  assert.strictEqual(OL.label(line, guides), "Итальянская партия: Giuoco Piano");
  assert.strictEqual(OL.label({ name: "Unknown Line" }, guides), "Unknown Line");
});

test("engine.normalize: pv -> move, сортировка, bestmove", function () {
  const r = Eng.normalize({
    bestmove: "e2e4",
    lines: [
      { multipv: 2, depth: 8, score: { type: "cp", value: 10 }, pv: ["d2d4", "d7d5"] },
      { multipv: 1, depth: 8, score: { type: "cp", value: 30 }, pv: ["e2e4", "e7e5"] }
    ]
  });
  assert.strictEqual(r.bestmove, "e2e4");
  assert.strictEqual(r.lines[0].move, "e2e4");
  assert.strictEqual(r.lines[0].eval.value, 30);
  assert.strictEqual(r.lines[1].multipv, 2);
  const empty = Eng.normalize({ lines: [] });
  assert.strictEqual(empty.bestmove, "");
});

test("симуляция партии: мат в 4", function () {
  let st = Chess.startState();
  const moves = ["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"];
  for (const u of moves) {
    const mv = Chess.legalMoves(st).find(function (m) { return Chess.uci(m) === u; });
    assert.ok(mv, "нет хода " + u);
    st = Chess.apply(st, mv);
  }
  assert.strictEqual(Pgn.gameStatus(st), "mate");
});

test("форсированный ход: единственный выход из шаха", function () {
  const st = Chess.fromFen("k7/8/1K6/8/8/8/8/R7 b - - 0 1");
  assert.strictEqual(Chess.legalMoves(st).length, 1);
  assert.strictEqual(Pgn.gameStatus(st), "play");
  assert.strictEqual(Pgn.isCheck(st, "b"), true);
  assert.strictEqual(Chess.uci(Chess.legalMoves(st)[0]), "a8b8");
});

test("FEN: отклоняем повреждённую доску и поля", function () {
  const invalid = [
    "8/8/8/8/8/8/4k3/4K2X w - - 0 1",
    "8/8/8/8/8/8/4k3/4K2 w - - 0 1",
    "8/8/8/8/8/8/4k3/4K3 z - - 0 1",
    "8/8/8/8/8/8/4k3/4K3 w - z9 0 1",
    "8/8/8/8/8/8/4k3/4K3 w - - -1 0",
    "8/8/8/8/8/8/8/4K3 w - - 0 1",
    "8/8/8/8/8/8/4k3/3KK3 w - - 0 1"
  ];
  invalid.forEach(function (fen) { assert.throws(function () { Chess.fromFen(fen); }, /FEN/); });
});

test("PGN: комментарий до конца строки не съедает остальные ходы", function () {
  const p = Pgn.parse("1. e4 ; комментарий\ne5 2. Nf3 Nc6 *");
  assert.strictEqual(p.errors.length, 0);
  assert.strictEqual(p.games[0].moves.length, 4);
});

test("PGN: результат из текста попадает в заголовки", function () {
  assert.strictEqual(Pgn.parse("1. e4 e5 1/2-1/2").games[0].headers.Result, "1/2-1/2");
});

test("PGN: экспорт позиции с ходом чёрных сохраняет FEN и номер", function () {
  const fen = "4k3/8/8/8/8/8/8/4K2R b - - 7 23";
  const rows = [{san:"Kd7", color:"b", moveNumber:23, fenBefore:fen}];
  const text = Pgn.toPgn({}, rows, "*");
  assert.ok(text.indexOf('[SetUp "1"]') >= 0);
  assert.ok(text.indexOf('23... Kd7') >= 0);
  const parsed = Pgn.parse(text);
  assert.strictEqual(parsed.errors.length, 0);
  assert.strictEqual(parsed.games[0].startFen, fen);
  assert.strictEqual(parsed.games[0].moves[0].uci, "e8d7");
});

test("FEN: не отправляем движку невозможный шах и взятие на проходе", function () {
  ["8/8/8/8/8/8/4k3/4K3 w - - 0 1",
   "4k3/8/8/8/8/8/8/4K3 w - e6 0 1",
   "4k3/8/8/8/8/8/8/4K3 w K - 0 1"].forEach(function (fen) {
    assert.throws(function () { Chess.fromFen(fen); }, /FEN/);
  });
});

test("ничья: недостаточный материал и 75 ходов", function () {
  assert.strictEqual(Pgn.gameStatus(Chess.fromFen("7k/8/8/8/8/8/8/K7 w - - 0 1")), "draw");
  assert.strictEqual(Pgn.gameStatus(Chess.fromFen("7k/8/8/8/8/2N5/8/K7 w - - 0 1")), "draw");
  assert.strictEqual(Pgn.gameStatus(Chess.fromFen("7k/8/8/8/8/8/R7/K7 w - - 150 90")), "draw");
  assert.strictEqual(Pgn.gameStatus(Chess.fromFen("7k/8/8/8/8/8/R7/K7 w - - 100 60")), "play");
  assert.strictEqual(Pgn.gameStatus(Chess.fromFen("7k/6Q1/5K2/8/8/8/8/8 b - - 150 90")), "mate");
});

test("ничья: пятикратное повторение учитывает историю", function () {
  const game = Pgn.parse("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. Nf3 Nf6 6. Ng1 Ng8 7. Nf3 Nf6 8. Ng1 Ng8 *").games[0];
  const history = [game.startFen].concat(game.moves.map(function(m){return m.fenAfter;}));
  assert.strictEqual(Pgn.gameStatus(Chess.fromFen(game.finalFen), history), "draw");
  assert.strictEqual(Pgn.gameStatus(Chess.fromFen(game.moves[7].fenAfter), history.slice(0,9)), "play");
});

module.exports = { passed: passed, failed: failed };

console.log("");
console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
