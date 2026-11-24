/* Дымовой тест движка: node tests/engine-smoke.js */
"use strict";
const path = require("path");
const assert = require("assert");
const { createClient, START } = require("../tools/stockfish-client.js");
const Eng = require("../assets/web/engine.js");
const Chess = require("../assets/web/chess.js");

const BIN = process.env.STOCKFISH || "stockfish";

async function main() {
  const client = createClient(BIN);
  await client.init();

  const raw = await client.search({ fen: START, multipv: 3, depth: 8 });
  const res = Eng.normalize(raw);
  assert.ok(res.bestmove, "нет bestmove");
  const legal = Chess.legalMoves(Chess.startState()).map(Chess.uci);
  assert.ok(legal.indexOf(res.bestmove) >= 0, "bestmove вне правил: " + res.bestmove);
  assert.strictEqual(res.lines.length, 3);
  assert.ok(res.lines[0].move);
  assert.strictEqual(res.lines[0].eval.type, "cp");

  const forced = await client.search({ fen: "k7/8/1K6/8/8/8/8/R7 b - - 0 1", multipv: 1, depth: 6 });
  assert.strictEqual(Eng.normalize(forced).bestmove, "a8b8");

  client.quit();
  console.log("engine smoke ok: " + res.bestmove + " / " + res.lines[0].eval.value);
}

main().catch(function (e) {
  console.error("engine smoke FAIL:", e.message);
  process.exit(1);
});
