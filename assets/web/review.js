/* Оценка позиции и классификация ходов в стиле chess.com.
 * Чистые функции без DOM: работают и в браузере (globalThis.MoveReview), и в Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MoveReview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MATE_CP = 100000;
  // Модель вероятности победы Lichess: 0 cp = 50%, мат = 100/0.
  const WIN_K = 0.00368208;

  // Оценка Stockfish приходит от лица того, чей сейчас ход.
  // Мат переводим в большое число: 97000/98000/99000..., чтобы его перекрывал любой cp.
  // mate 0 — это уже поставленный мат тому, чей ход, поэтому он отрицательный.
  function scoreToCp(score) {
    if (!score) return 0;
    if (score.type === "mate") {
      const n = Math.min(Math.abs(score.value), 99);
      const magnitude = MATE_CP - n * 1000;
      return score.value > 0 ? magnitude : -magnitude;
    }
    return score.value;
  }

  // Оценка всегда с точки зрения белых: после хода чёрных знак переворачивается.
  function whiteCp(score, turn) {
    const cp = scoreToCp(score);
    return turn === "b" ? -cp : cp;
  }

  // Вероятность победы (0..100): по ней просадка в 2 пешки в выигранной
  // позиции почти не меняет исход, а в равной — меняет сильно.
  function winPercent(cp) {
    if (cp >= MATE_CP) return 100;
    if (cp <= -MATE_CP) return 0;
    return 50 + 50 * (2 / (1 + Math.exp(-WIN_K * cp)) - 1);
  }

  // Доля полосы перевеса белых в процентах.
  function barPercent(cp) {
    return Math.round(winPercent(cp));
  }

  function formatEval(score, turn) {
    if (!score) return "";
    if (score.type === "mate") {
      const v = turn === "b" ? -score.value : score.value;
      return v === 0 ? "#" : "#" + v;
    }
    const cp = turn === "b" ? -score.value : score.value;
    const v = (Math.sign(cp) * Math.round(Math.abs(cp) / 10)) / 10;
    return (cp > 0 ? "+" : "") + v.toFixed(1);
  }

  // Пороги по просадке вероятности победы, а не по сантипешкам.
  const EXCELLENT_MAX_WIN = 2;
  const GOOD_MAX_WIN = 5;
  const INACCURACY_MAX_WIN = 10;
  const MISTAKE_MAX_WIN = 20;
  // Блестящий ход — настоящая жертва фигуры/качества в невыигранной позиции.
  const BRILLIANT_MIN_SACRIFICE = 2; // отдано минимум на 2 пешки
  const BRILLIANT_MAX_LOSS_WIN = 2;  // лучший или почти лучший ход
  const BRILLIANT_MAX_BEFORE_WIN = 90; // до хода ещё не было подавляющего перевеса
  const BRILLIANT_MIN_AFTER_WIN = 50;  // после хода не попал в плохую позицию
  // Великолепный ход — единственный, который держит оценку.
  const GREAT_MIN_GAP_WIN = 10;
  // Упущенный шанс — был большой перевес/мат, стал невыигранный.
  const MISSED_MIN_BEFORE_WIN = 90;
  const MISSED_MAX_AFTER_WIN = 70;

  const ICONS = {
    brilliant: { file: "brilliant.svg", color: "#1bada6", label: "Блестящий ход" },
    great: { file: "great_find.svg", color: "#1bada6", label: "Великолепный ход" },
    best: { file: "best.svg", color: "#96bc4b", label: "Лучший ход" },
    excellent: { file: "excellent.svg", color: "#96bc4b", label: "Прекрасный ход" },
    good: { file: "good.svg", color: "#96af8b", label: "Хороший ход" },
    book: { file: "book.svg", color: "#a88865", label: "Книжный ход" },
    inaccuracy: { file: "inaccuracy.svg", color: "#f7c045", label: "Неточность" },
    mistake: { file: "mistake.svg", color: "#e58f2a", label: "Ошибка" },
    missed: { file: "missed_win.svg", color: "#dbac16", label: "Упущенный шанс" },
    blunder: { file: "blunder.svg", color: "#ca3431", label: "Зевок" },
  };

  // Оценка сыгранного хода с точки зрения сделавшего ход.
  // Если ход есть в MultiPV-линиях позиции до хода, берём его оценку
  // из того же поиска: это убирает шум от сравнения двух разных поисков.
  function playedCp(played, after, lines) {
    if (Array.isArray(lines)) {
      const line = lines.find((l) => l && l.move === played && l.eval);
      if (line) return scoreToCp(line.eval);
    }
    return after ? -scoreToCp(after) : null;
  }

  // Остался ли мат за сделавшего ход. В MultiPV-линии мат положительный,
  // в оценке позиции после хода — отрицательный (мат сопернику).
  function mateForMover(played, after, lines) {
    if (Array.isArray(lines)) {
      const line = lines.find((l) => l && l.move === played && l.eval);
      if (line && line.eval.type === "mate") return line.eval.value > 0;
    }
    return !!after && after.type === "mate" && after.value <= 0;
  }

  /* played/bestmove — UCI, before — оценка до хода (от лица ходящего),
   * after — оценка после хода (от лица соперника), book — позиция есть в теории,
   * sacrifice — сколько пешек отдаёт ход (0 — не жертва), lines — MultiPV
   * позиции до хода. Книга важнее оценки: её можно определить без движка. */
  function classify({ played, bestmove, before, after, book, sacrifice = 0, lines = [] }) {
    if (book) return { key: "book" };
    if (!before || !after) return null;
    const beforeCp = scoreToCp(before);
    const afterCp = playedCp(played, after, lines);
    if (afterCp === null) return null;
    const beforeWin = winPercent(beforeCp);
    const afterWin = winPercent(afterCp);
    const lossWin = Math.max(0, beforeWin - afterWin);
    const top = lines[0];
    const sameSearch = lines.find(function (line) { return line.move === played && line.eval; });
    const tied = top && top.eval && sameSearch && top.depth === sameSearch.depth &&
      top.eval.type === sameSearch.eval.type && top.eval.value === sameSearch.eval.value;
    const isBest = played === bestmove || tied;
    const keepsMate = mateForMover(played, after, lines);

    if (sacrifice >= BRILLIANT_MIN_SACRIFICE && lossWin <= BRILLIANT_MAX_LOSS_WIN &&
        beforeWin < BRILLIANT_MAX_BEFORE_WIN && afterWin >= BRILLIANT_MIN_AFTER_WIN) {
      return { key: "brilliant" };
    }
    // Великолепный — лучший ход, когда второй по силе вариант заметно хуже.
    if (isBest && lines.length >= 2 && lines[0].depth === lines[1].depth) {
      const second = lines[1];
      const secondWin = second && second.eval ? winPercent(scoreToCp(second.eval)) : beforeWin;
      if (beforeWin < BRILLIANT_MAX_BEFORE_WIN && beforeWin - secondWin >= GREAT_MIN_GAP_WIN) {
        return { key: "great" };
      }
    }
    if (isBest) return { key: "best" };
    if (keepsMate) return { key: "excellent" }; // мат остался, даже если дальше
    if (before.type === "mate" && before.value > 0) return { key: "missed" };
    if (beforeWin >= MISSED_MIN_BEFORE_WIN && afterWin < MISSED_MAX_AFTER_WIN) return { key: "missed" };
    if (lossWin <= EXCELLENT_MAX_WIN) return { key: "excellent" };
    if (lossWin <= GOOD_MAX_WIN) return { key: "good" };
    if (lossWin <= INACCURACY_MAX_WIN) return { key: "inaccuracy" };
    if (lossWin <= MISTAKE_MAX_WIN) return { key: "mistake" };
    return { key: "blunder" };
  }

  return { scoreToCp, whiteCp, barPercent, formatEval, winPercent, classify, ICONS };
});
