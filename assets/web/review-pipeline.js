(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./move-classification.js") : root.FisherMoveClassification,
    node ? require("./review.js") : root.MoveReview);
  if (node) module.exports = api;
  else root.FisherReviewPipeline = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Classification, MR) {
  "use strict";
  // Search callbacks identify their engine instance: never share evaluations across engines.
  const caches = new WeakMap();
  function run(rows, options) {
    const search = options.search, depth = options.depth || 14, deep = depth >= 18;
    const cancelled = options.isCancelled || function () { return false; };
    const engineKey = options.engineKey || search;
    let cache = caches.get(engineKey);
    if (!cache) { cache = new Map(); caches.set(engineKey, cache); }
    const evals = new Array(rows.length + 1), needed = new Set();
    rows.forEach(function (row, i) { if (!row.book && row.legalCount !== 1) { needed.add(i); needed.add(i + 1); } });
    if (rows.length) needed.add(rows.length);
    function evaluate(i, multipv, target, movetime) {
      if (cancelled()) return Promise.resolve(null);
      const fen = i === rows.length ? rows[i - 1].fenAfter : rows[i].fenBefore;
      const history = [rows[0].fenBefore].concat(rows.slice(0, i).map(function (row) { return row.fenAfter; }));
      const terminal = Classification.terminal(fen, history);
      const key = [fen, depth, deep ? "deep-v1" : "fast-v1", multipv, target, movetime].join("|");
      const saved = terminal || cache.get(key);
      return (saved ? Promise.resolve(saved) : search({fen:fen, multipv:multipv, depth:target, movetime:movetime})).then(function (result) {
        if (cancelled()) return null;
        if (!result || !result.lines || !result.lines[0] || !result.lines[0].eval) throw new Error("Движок не вернул оценку позиции");
        if (!saved) { if (cache.size >= 512) cache.delete(cache.keys().next().value); cache.set(key, result); }
        evals[i] = result;
        if (options.onPosition) options.onPosition(i, result);
        return result;
      });
    }
    function progress(done, total, stage) { if (options.onProgress) options.onProgress(done, total, stage); }
    function base(i) {
      if (cancelled()) return Promise.resolve(null);
      if (i > rows.length) return refine();
      const task = rows.length && needed.has(i) ? evaluate(i, deep ? 3 : 1, depth, deep ? 2000 : 120) : Promise.resolve(true);
      return task.then(function (res) {
        if (!res || cancelled()) return null;
        progress(i + 1, rows.length + 2, "base");
        return base(i + 1);
      });
    }
    function refine() {
      if (deep) { progress(rows.length + 1, rows.length + 1, "refine"); return Promise.resolve(evals); }
      const indexes = [];
      rows.forEach(function (row, i) {
        const before = evals[i], after = evals[i + 1];
        if (row.book || row.legalCount === 1 || !before || !after || before.terminal) return;
        const cp0 = MR.scoreToCp(before.lines[0].eval), cp1 = -MR.scoreToCp(after.lines[0].eval);
        const loss = Math.max(0, MR.winPercent(cp0) - MR.winPercent(cp1));
        if (row.sacrifice >= 2 || (loss > 8 && loss < 24) ||
            (/x/.test(row.san || "") && row.uci === before.bestmove && Math.abs(cp0) < 600) ||
            before.lines[0].eval.type === "mate" || after.lines[0].eval.type === "mate") indexes.push(i);
      });
      const total = rows.length + 1 + indexes.length;
      progress(rows.length + 1, total, "refine");
      function next(j) {
        if (cancelled()) return Promise.resolve(null);
        if (j >= indexes.length) return Promise.resolve(evals);
        const i = indexes[j], sacrifice = rows[i].sacrifice >= 2;
        return evaluate(i, 3, depth + (sacrifice ? 4 : 2), sacrifice ? 500 : 250).then(function (res) {
          if (!res || cancelled()) return null;
          const verified = res.lines.some(function (line) { return line.move === rows[i].uci; });
          if (sacrifice && !verified) return evaluate(i + 1, 1, depth + 4, 350);
          return res;
        }).then(function (res) {
          if (!res || cancelled()) return null;
          progress(rows.length + 2 + j, total, "refine");
          return next(j + 1);
        });
      }
      return next(0);
    }
    return Promise.resolve().then(function () { return cancelled() ? null : base(0); });
  }
  return {run};
});
