/* Пояснения учебных линий: авторские заметки и проверяемые свойства хода. */
(function (root, factory) {
  const Chess = typeof module === "object" && module.exports ? require("./chess.js") : root.ChessLogic;
  const api = factory(Chess);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OpeningLessons = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chess) {
  "use strict";
  const names = { p: "пешка", n: "конь", b: "слон", r: "ладья", q: "ферзь", k: "король" };
  const center = [27, 28, 35, 36];

  function reaches(board, from, to, piece, color) {
    const df = (to & 7) - (from & 7), dr = (to >> 3) - (from >> 3);
    const af = Math.abs(df), ar = Math.abs(dr);
    if (piece === "p") return af === 1 && dr === (color === "w" ? 1 : -1);
    if (piece === "n") return af * ar === 2;
    if (piece === "k") return Math.max(af, ar) === 1;
    if (!df && !dr) return false;
    const diagonal = af === ar, straight = !df || !dr;
    if (!(piece === "b" && diagonal || piece === "r" && straight || piece === "q" && (diagonal || straight))) return false;
    const step = Math.sign(df) + 8 * Math.sign(dr);
    for (let square = from + step; square !== to; square += step) if (board[square] !== ".") return false;
    return true;
  }

  function explainEnglish(move) {
    const before = Chess.fromFen(move.fenBefore), after = Chess.fromFen(move.fenAfter);
    const from = (move.uci.charCodeAt(0) - 97) + 8 * (Number(move.uci[1]) - 1);
    const to = (move.uci.charCodeAt(2) - 97) + 8 * (Number(move.uci[3]) - 1);
    const pieces = {p:"pawn", n:"knight", b:"bishop", r:"rook", q:"queen", k:"king"};
    const piece = before.board[from].toLowerCase(), side = move.color === "w" ? "White" : "Black";
    let text;
    if (/^O-O/.test(move.san)) {
      text = side + " castles " + (/^O-O-O/.test(move.san) ? "queenside" : "kingside") + ": the king leaves the e-file and the rook enters play.";
    } else {
      text = side + " moves the " + pieces[piece] + " from " + Chess.sqName(from) + " to " + Chess.sqName(to);
      if (move.san.indexOf("x") >= 0) {
        const victim = before.board[to].toLowerCase();
        text += " and " + (victim === "." ? "captures the pawn en passant" : "captures the " + pieces[victim]);
      }
      text += ".";
      if ((piece === "n" || piece === "b") && (from >> 3) === (move.color === "w" ? 0 : 7)) text += " This develops a piece from its starting rank.";
      if (center.indexOf(to) >= 0) text += " The move occupies the central square " + Chess.sqName(to) + ".";
      const activePiece = after.board[to].toLowerCase();
      const controlled = center.filter(function (sq) { return reaches(after.board, to, sq, activePiece, move.color); });
      if (controlled.length) text += " From " + Chess.sqName(to) + ", it controls " + controlled.map(Chess.sqName).join(", ") + ".";
      else {
        const squares = [];
        for (let sq = 0; sq < 64; sq++) if (reaches(after.board, to, sq, activePiece, move.color)) squares.push(Chess.sqName(sq));
        if (squares.length) text += " From its new square, it controls " + squares.slice(0, 4).join(", ") + (squares.length > 4 ? " and other squares." : ".");
      }
      const targets = [];
      for (let sq = 0; sq < 64; sq++) {
        const target = after.board[sq];
        if (target !== "." && (target === target.toUpperCase()) !== (move.color === "w") && target.toLowerCase() !== "k" && reaches(after.board, to, sq, activePiece, move.color)) targets.push(Chess.sqName(sq));
      }
      if (targets.length) text += " It attacks enemy pieces or pawns on " + targets.join(", ") + "; whether a capture is possible depends on the reply and any pins.";
      if (piece === "p" && (from === 11 || from === 12 || from === 51 || from === 52)) {
        const bishopSquare = {11:2, 12:5, 51:58, 52:61}[from];
        if (before.board[bishopSquare].toLowerCase() === "b") text += " It opens a diagonal for the bishop on " + Chess.sqName(bishopSquare) + ".";
      }
      if (move.uci.length === 5) text += " The pawn promotes to a " + pieces[move.uci[4]] + ".";
    }
    if (/#$/.test(move.san)) text += " Checkmate: the king has no legal way to escape check.";
    else if (/\+$/.test(move.san)) text += " Check: the opponent must make the king safe.";
    return text;
  }

  function explain(move, language) {
    if (language === "en") return explainEnglish(move);
    const before = Chess.fromFen(move.fenBefore), after = Chess.fromFen(move.fenAfter);
    const from = (move.uci.charCodeAt(0) - 97) + 8 * (Number(move.uci[1]) - 1);
    const to = (move.uci.charCodeAt(2) - 97) + 8 * (Number(move.uci[3]) - 1);
    const piece = before.board[from].toLowerCase();
    const side = move.color === "w" ? "Белые" : "Чёрные";
    let text;
    if (/^O-O/.test(move.san)) {
      text = side + " рокируют в " + (/^O-O-O/.test(move.san) ? "длинную" : "короткую") + " сторону: король уходит с линии e, ладья включается в игру.";
    } else {
      const capture = move.san.indexOf("x") >= 0;
      const victim = before.board[to].toLowerCase();
      text = side + ": " + names[piece] + " " + Chess.sqName(from) + "–" + Chess.sqName(to);
      if (capture) text += " берёт " + (victim === "." ? "пешку на проходе" : names[victim] === "пешка" ? "пешку" : { n: "коня", b: "слона", r: "ладью", q: "ферзя", k: "короля" }[victim]);
      text += ".";
      if ((piece === "n" || piece === "b") && (from >> 3) === (move.color === "w" ? 0 : 7)) text += " Фигура выходит с исходной горизонтали.";
      if (center.indexOf(to) >= 0) text += " Ход занимает центральное поле " + Chess.sqName(to) + ".";
      const activePiece = after.board[to].toLowerCase();
      const controlled = center.filter(function (sq) { return reaches(after.board, to, sq, activePiece, move.color); });
      if (controlled.length) text += " С " + Chess.sqName(to) + " контролирует " + controlled.map(Chess.sqName).join(", ") + ".";
      else {
        const squares = [];
        for (let sq = 0; sq < 64; sq++) if (reaches(after.board, to, sq, activePiece, move.color)) squares.push(Chess.sqName(sq));
        if (squares.length) text += " С нового поля контролирует " + squares.slice(0, 4).join(", ") + (squares.length > 4 ? " и другие поля." : ".");
      }
      const targets = [];
      for (let sq = 0; sq < 64; sq++) {
        const target = after.board[sq];
        if (target !== "." && (target === target.toUpperCase()) !== (move.color === "w") && target.toLowerCase() !== "k" && reaches(after.board, to, sq, activePiece, move.color)) targets.push(Chess.sqName(sq));
      }
      if (targets.length) text += " Направлен на неприятельские фигуры и пешки: " + targets.join(", ") + "; возможность взятия зависит от ответного хода и связок.";
      if (piece === "p" && (from === 11 || from === 12 || from === 51 || from === 52)) {
        const bishopSquare = { 11: 2, 12: 5, 51: 58, 52: 61 }[from];
        if (before.board[bishopSquare].toLowerCase() === "b") text += " Освобождает диагональ слону " + Chess.sqName(bishopSquare) + ".";
      }
      if (move.uci.length === 5) text += " Пешка превращается: " + names[move.uci[4]] + ".";
    }
    if (/#$/.test(move.san)) text += " Мат: у короля нет защиты от шаха.";
    else if (/\+$/.test(move.san)) text += " Шах: сопернику нужно защитить короля.";
    return text;
  }

  function notes(game, explicitNotes, language) {
    return game.moves.map(function (move, i) {
      const note = explicitNotes && explicitNotes[i];
      return typeof note === "string" && note.trim() && !(language === "en" && /[А-Яа-яЁё]/.test(note)) ? note : explain(move, language);
    });
  }
  function tags(item) {
    const text = [item.name || "", (item.match || []).join(" ")].join(" ");
    const result = (item.tags || []).slice();
    if (/attack|атак/i.test(text)) result.push("attack");
    if (/counter|контр/i.test(text)) result.push("counter");
    if (/gambit|гамбит/i.test(text)) result.push("gambit");
    return result.filter(function (tag, i) { return result.indexOf(tag) === i; });
  }
  function matchesFilter(item, filter) {
    return !filter || filter === "all" || tags(item).indexOf(filter) >= 0 ||
      (item.variations || []).some(function (variation) { return tags(variation).indexOf(filter) >= 0; });
  }
  return { explain: explain, notes: notes, tags: tags, matchesFilter: matchesFilter };
});
