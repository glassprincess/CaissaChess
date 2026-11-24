/* Точность, вердикт и ключевые ходы. Опирается на review.js. */
(function (root, factory) {
  const MR = (typeof module === "object" && module.exports) ? require("./review.js") : root.MoveReview;
  const api = factory(MR);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FisherAnalysis = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (MR) {
  "use strict";

  function moveAccuracy(loss) {
    const v = 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669;
    return Math.max(0, Math.min(100, v));
  }

  const EXTRA = {
    forced: { label: "Единственный ход", color: "#81B64C", glyph: "→", file:"forced.svg" }
  };

  function category(key) {
    return MR.ICONS[key] || EXTRA[key] || null;
  }

  /* Приводит строку хода к финальному виду:
   * - единственный легальный ход -> forced, просадка 0 (виноват не игрок);
   * Старые сохранённые sharp/eval получают обычную категорию по потере. */
  function normalize(row) {
    if (!row) return row;
    if (row.legalCount === 1) {
      row.key = "forced";
      row.loss = 0;
    } else if (row.key === "sharp" || row.key === "eval") {
      row.key = row.loss <= 2 ? "excellent" : row.loss <= 5 ? "good" :
        row.loss <= 10 ? "inaccuracy" : row.loss <= 20 ? "mistake" : "blunder";
    }
    return row;
  }

  function fmt(v) {
    return (Math.round(v * 10) / 10).toString().replace(".", ",");
  }

  function sideStats(rows) {
    const acc = { w: [], b: [] };
    const counts = {};
    const countsBySide = { w: {}, b: {} };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !Number.isFinite(r.loss) || !r.key || !acc[r.color]) continue;
      acc[r.color].push(moveAccuracy(r.loss));
      counts[r.key] = (counts[r.key] || 0) + 1;
      countsBySide[r.color][r.key] = (countsBySide[r.color][r.key] || 0) + 1;
    }
    const avg = function (a) {
      if (!a.length) return null;
      let s = 0;
      for (let i = 0; i < a.length; i++) s += a[i];
      return s / a.length;
    };
    return {
      white: avg(acc.w), black: avg(acc.b),
      whiteMoves: acc.w.length, blackMoves: acc.b.length,
      counts: counts, countsBySide: countsBySide
    };
  }

  function verdict(stats) {
    if (stats.white === null || stats.black === null) return "";
    const w = fmt(stats.white), b = fmt(stats.black);
    if (Math.abs(stats.white - stats.black) < 2) {
      return "Примерно равная игра: " + w + "% против " + b + "%.";
    }
    if (stats.white > stats.black) return "Белые сыграли точнее: " + w + "% против " + b + "%.";
    return "Чёрные сыграли точнее: " + b + "% против " + w + "%.";
  }

  function describe(row) {
    if (!row || !row.key) return "Считаю…";
    if (row.key === "forced") return "Единственный ход";
    if (row.key === "book") return "Книжный ход";
    if (row.key === "best") return "Лучший ход";
    if (row.loss > 0.5) {
      return "Потеря " + Math.round(row.loss) + "% шансов." +
        (row.bestSan ? " Лучше было " + row.bestSan : "");
    }
    const icon = MR.ICONS[row.key];
    return icon ? icon.label : "Хороший ход";
  }

  function keyMoves(rows, n) {
    n = n || 5;
    const scored = rows.filter(function (r) { return typeof r.loss === "number" && r.key; });
    const worst = scored.slice().sort(function (a, b) { return b.loss - a.loss; })
      .filter(function (r) { return r.loss > 8; }).slice(0, 3);
    const finds = scored.filter(function (r) {
      return r.loss <= 1 && (r.key === "brilliant" || r.key === "great" || r.key === "best");
    }).slice(0, 2);
    const out = worst.concat(finds);
    if (out.length < n) {
      const used = out.map(function (r) { return r.ply; });
      scored.slice().sort(function (a, b) { return b.loss - a.loss; }).forEach(function (r) {
        if (out.length < n && used.indexOf(r.ply) < 0) out.push(r);
      });
    }
    return out.sort(function (a, b) { return a.ply - b.ply; }).slice(0, n);
  }

  function accuracyText(stats) {
    const w = stats.white === null ? "—" : fmt(stats.white) + "%";
    const b = stats.black === null ? "—" : fmt(stats.black) + "%";
    return "Точность: белые " + w + " · чёрные " + b;
  }

  return {
    moveAccuracy: moveAccuracy, sideStats: sideStats, verdict: verdict,
    describe: describe, keyMoves: keyMoves, accuracyText: accuracyText, fmt: fmt,
    normalize: normalize, category: category, EXTRA: EXTRA
  };
});
