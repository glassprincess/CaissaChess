"use strict";
const fs = require("fs");
const path = require("path");
const Chess = require("../assets/web/chess.js");
const Pgn = require("../assets/web/pgn.js");
const OL = require("../assets/web/openings-lookup.js");
const Eng = require("../assets/web/engine.js");
const { createClient } = require("./stockfish-client.js");
const root = path.join(__dirname, "..");
const baseline = process.argv.includes("--baseline");
const saved = path.join(root, "work", "review-baseline");
const MR = require(baseline ? path.join(root,"tests/fixtures/review-1.1.0/review.js") : "../assets/web/review.js");
const An = require(baseline ? path.join(root,"tests/fixtures/review-1.1.0/analysis.js") : "../assets/web/analysis.js");
function rows() {
  const game = Pgn.parse(fs.readFileSync(path.join(root, "tests/fixtures/hikaru-mortimer-2018.pgn"), "utf8")).games[0];
  if (!game.ok) throw new Error(game.error);
  const index = OL.buildIndex(require("../assets/web/openings.json").lines);
  return game.moves.map((m, i) => Object.assign({}, m, {
    ply: i, legalCount: Chess.legalMoves(Chess.fromFen(m.fenBefore)).length,
    sacrifice: Chess.sacrificeLoss(Chess.fromFen(m.fenBefore), Chess.fromFen(m.fenAfter), m.uci),
    book: !!OL.lookup(index, m.fenAfter)
  }));
}
function oldClassify(row, i, evals) {
  if (row.legalCount === 1) { row.key = "forced"; row.loss = 0; return; }
  const e0 = evals[i], e1 = evals[i + 1];
  const lines = e0.lines, before = lines[0].eval, after = e1.lines[0].eval;
  const played = lines.find(l => l.move === row.uci);
  const cp = played ? MR.scoreToCp(played.eval) : -MR.scoreToCp(after);
  row.loss = Math.max(0, MR.winPercent(MR.scoreToCp(before)) - MR.winPercent(cp));
  row.key = MR.classify({ played: row.uci, bestmove: e0.bestmove, before, after, lines, book: row.book, sacrifice: row.sacrifice }).key;
  An.normalize(row);
}
async function main() {
  const client = createClient(process.env.STOCKFISH || "stockfish");
  try {
    await client.init();
    const list = rows(), started = Date.now();
    let searches = 0;
    const search = async opts => { searches++; return Eng.normalize(await client.search(opts)); };
    let evals;
    if (baseline) {
      evals = [];
      for (let i = 0; i <= list.length; i++) evals[i] = await search({ fen: i === list.length ? list[i - 1].fenAfter : list[i].fenBefore, multipv: 3, depth: 14, movetime: 800 });
      list.forEach((r, i) => oldClassify(r, i, evals));
    } else {
      evals = await require("../assets/web/review-pipeline.js").run(list, { search, depth: process.argv.includes("--deep") ? 18 : 14 });
      list.forEach((r, i) => require("../assets/web/move-classification.js").classifyRow(r, i, evals));
    }
    const elapsedMs = Date.now() - started;
    let cachedReplayMs = null, cachedReplaySearches = null;
    if (!baseline) {
      const countBefore = searches, replayStarted = Date.now();
      const replay=await require("../assets/web/review-pipeline.js").run(list,{search,depth:process.argv.includes("--deep") ? 18 : 14});
      list.forEach((r,i)=>require("../assets/web/move-classification.js").classifyRow(r,i,replay));
      cachedReplayMs = Date.now() - replayStarted;
      cachedReplaySearches = searches - countBefore;
    }
    const counts = side => list.filter(r => !side || r.color === side).reduce((a, r) => { a[r.key] = (a[r.key] || 0) + 1; return a; }, {});
    const report = { mode: baseline ? "baseline" : process.argv.includes("--deep") ? "deep" : "fast", elapsedMs, searches, cachedReplayMs, cachedReplaySearches,
      stats: An.sideStats(list), counts: { both: counts(), white: counts("w"), black: counts("b") },
      rows: list.map(r => ({ ply: r.ply, san: r.san, color: r.color, key: r.key, loss: r.loss, sacrifice: r.sacrifice })), evals };
    fs.mkdirSync(saved, { recursive: true });
    fs.writeFileSync(path.join(saved, report.mode + ".json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ mode: report.mode, elapsedMs, searches, cachedReplayMs, cachedReplaySearches, counts: report.counts }, null, 2));
  } finally { client.quit(); }
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { rows };
