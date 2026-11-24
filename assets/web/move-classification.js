(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./chess.js") : root.ChessLogic,
    node ? require("./pgn.js") : root.FisherPgn,
    node ? require("./review.js") : root.MoveReview,
    node ? require("./analysis.js") : root.FisherAnalysis);
  if (node) module.exports = api;
  else root.FisherMoveClassification = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chess, Pgn, MR, An) {
  "use strict";
  function terminal(fen, history) {
    const status = Pgn.gameStatus(Chess.fromFen(fen), history);
    return status === "mate" || status === "stalemate" || status === "draw" ?
      { bestmove: "", terminal: status, lines: [{ eval: { type: status === "mate" ? "mate" : "cp", value: 0 } }] } : null;
  }
  function classifyRow(row, i, evals) {
    if (!row) return row;
    if (row.legalCount === 1) { row.key = "forced"; row.loss = 0; return row; }
    if (row.book) { row.key = "book"; row.loss = 0; }
    const e0 = evals[i];
    const detected = terminal(row.fenAfter) || (row.drawAfter ? {bestmove:"",terminal:"draw",lines:[{eval:{type:"cp",value:0}}]} : null);
    const e1 = detected || evals[i + 1];
    const end = detected || (e1 && e1.terminal ? e1 : null);
    if (!e0 || !e0.lines || !e0.lines[0] || !e1 || !e1.lines || !e1.lines[0]) return row;
    const lines = e0.lines, before = lines[0].eval, after = e1.lines[0].eval;
    if (!before || !after) return row;
    const playedLine = lines.find(l => l.move === row.uci && l.eval);
    // Terminal board truth takes precedence over a truncated principal variation.
    const playedCp = end ? -MR.scoreToCp(after) : playedLine ? MR.scoreToCp(playedLine.eval) : -MR.scoreToCp(after);
    row.loss = row.book ? 0 : Math.max(0, MR.winPercent(MR.scoreToCp(before)) - MR.winPercent(playedCp));
    row.bestUci = e0.bestmove || lines[0].move;
    row.bestSan = Pgn.sanOf(Chess.fromFen(row.fenBefore), row.bestUci) || "";
    row.evalText = MR.formatEval(after, row.color === "w" ? "b" : "w");
    const c = MR.classify({ played: row.uci, bestmove: row.bestUci, before, after,
      book: row.book, sacrifice: effectiveSacrifice(row, lines), lines: end ? [] : lines });
    row.key = end && end.terminal === "mate" ? "best" : c ? c.key : null;
    return An.normalize(row);
  }
  function effectiveSacrifice(row, lines) {
    if (!(row.sacrifice >= 2)) return 0;
    const before = Chess.fromFen(row.fenBefore), after = Chess.fromFen(row.fenAfter);
    const opponentBefore = Object.assign({}, before, {turn: after.turn, ep: -1});
    const oldGain = Chess.maxCaptureGain(opponentBefore);
    if (oldGain < 2) return row.sacrifice;
    const from = "abcdefgh".indexOf(row.uci[0]) + (Number(row.uci[1]) - 1) * 8;
    const to = "abcdefgh".indexOf(row.uci[2]) + (Number(row.uci[3]) - 1) * 8;
    // A fresh offer, or relocating the offered piece, can be a sacrifice in its own right.
    if (Chess.see(opponentBefore, from) >= 2 && Chess.see(after, to) >= 2) return row.sacrifice;
    // Keeping an old offer can be deliberate when this is the only move that holds the position.
    if (lines && lines.length >= 2 && lines[0].move === row.uci && lines[0].eval && lines[1].eval &&
        MR.winPercent(MR.scoreToCp(lines[0].eval)) - MR.winPercent(MR.scoreToCp(lines[1].eval)) >= 10) return row.sacrifice;
    // Maintaining an offer is voluntary only if a legal alternative can avoid the material loss.
    const alternatives = Chess.legalMoves(before);
    for (let i = 0; i < alternatives.length; i++) {
      const move = alternatives[i];
      const next = Chess.apply(before, move);
      if (Chess.sacrificeLoss(before, next, Chess.uci(move)) < 2) return row.sacrifice;
    }
    return Math.max(0, row.sacrifice - oldGain);
  }
  return {classifyRow, terminal, effectiveSacrifice};
});
