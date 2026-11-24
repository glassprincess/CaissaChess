/* PGN: разбор текста в проверенные ходы, SAN из UCI, статус партии.
 * Без зависимостей. Браузер: window.FisherPgn, Node: module.exports. */
(function (root, factory) {
  const Chess = (typeof module === "object" && module.exports) ? require("./chess.js") : root.ChessLogic;
  const api = factory(Chess);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FisherPgn = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chess) {
  "use strict";

  const FILES = "abcdefgh";
  const RESULTS = ["1-0", "0-1", "1/2-1/2", "*"];

  function isCheck(state, color) {
    const k = state.board.indexOf(color === "w" ? "K" : "k");
    return k >= 0 && Chess.attacked(state.board, k, color === "w" ? "b" : "w");
  }

  function insufficientMaterial(state) {
    const pieces = [];
    for (let sq = 0; sq < 64; sq++) {
      const piece = state.board[sq].toLowerCase();
      if (piece !== "." && piece !== "k") pieces.push({piece:piece, square:sq});
    }
    if (!pieces.length) return true;
    if (pieces.length === 1 && /[bn]/.test(pieces[0].piece)) return true;
    if (!pieces.every(function (p) { return p.piece === "b"; })) return false;
    const color = function (sq) { return ((sq & 7) + (sq >> 3)) & 1; };
    return pieces.every(function (p) { return color(p.square) === color(pieces[0].square); });
  }

  function repetitionKey(fen) {
    const fields = fen.split(/\s+/);
    if (fields[3] !== "-") {
      const st = Chess.fromFen(fen);
      if (!Chess.legalMoves(st).some(function (move) { return move.enpassant; })) fields[3] = "-";
    }
    return fields.slice(0, 4).join(" ");
  }

  function drawReason(state, history) {
    if (insufficientMaterial(state)) return "Недостаточно материала для мата";
    if (state.half >= 150) return "75 ходов без взятий и ходов пешками";
    if (history && history.length >= 5) {
      const key = repetitionKey(Chess.toFen(state));
      let count = 0;
      for (let i = 0; i < history.length; i++) if (repetitionKey(history[i]) === key) count++;
      if (count >= 5) return "Пятикратное повторение позиции";
    }
    return "";
  }

  function gameStatus(state, history) {
    if (!Chess.legalMoves(state).length) return isCheck(state, state.turn) ? "mate" : "stalemate";
    return drawReason(state, history) ? "draw" : "play";
  }

  function sanOf(state, uciStr) {
    const legal = Chess.legalMoves(state);
    let mv = null;
    for (let i = 0; i < legal.length; i++) if (Chess.uci(legal[i]) === uciStr) mv = legal[i];
    if (!mv) return null;
    const piece = state.board[mv.from];
    const t = piece.toLowerCase();
    let san;
    if (mv.castle) {
      san = mv.castle === "K" ? "O-O" : "O-O-O";
    } else {
      const capture = state.board[mv.to] !== "." || mv.enpassant;
      if (t === "p") {
        san = capture ? FILES[mv.from & 7] + "x" + Chess.sqName(mv.to) : Chess.sqName(mv.to);
        if (mv.promo) san += "=" + mv.promo.toUpperCase();
      } else {
        san = piece.toUpperCase();
        const same = legal.filter(function (m) {
          return m.to === mv.to && m.from !== mv.from && state.board[m.from].toLowerCase() === t;
        });
        if (same.length) {
          const sameFile = same.some(function (m) { return (m.from & 7) === (mv.from & 7); });
          const sameRank = same.some(function (m) { return (m.from >> 3) === (mv.from >> 3); });
          if (!sameFile) san += FILES[mv.from & 7];
          else if (!sameRank) san += String((mv.from >> 3) + 1);
          else san += FILES[mv.from & 7] + String((mv.from >> 3) + 1);
        }
        if (capture) san += "x";
        san += Chess.sqName(mv.to);
      }
    }
    const after = Chess.apply(state, mv);
    if (isCheck(after, after.turn)) san += Chess.legalMoves(after).length === 0 ? "#" : "+";
    return san;
  }

  function splitGames(text) {
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    const games = [];
    let cur = [];
    let inMoves = false;
    const tagRe = /^\s*\[[A-Za-z0-9_]+\s+"/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*%/.test(line)) continue;
      if (tagRe.test(line)) {
        if (inMoves && cur.length) {
          games.push(cur.join("\n"));
          cur = [];
          inMoves = false;
        }
        cur.push(line);
      } else if (line.trim()) {
        inMoves = true;
        cur.push(line);
      } else if (cur.length) {
        cur.push("");
      }
    }
    if (cur.length) games.push(cur.join("\n"));
    return games.filter(function (g) { return g.trim(); });
  }

  function tokenize(text) {
    const tokens = [];
    let buf = "";
    let i = 0;
    const n = text.length;
    function flush() { if (buf) { tokens.push(buf); buf = ""; } }
    while (i < n) {
      const c = text[i];
      if (c === "{") {
        flush();
        const j = text.indexOf("}", i + 1);
        i = j < 0 ? n : j + 1;
      } else if (c === ";") {
        flush();
        const j = text.indexOf("\n", i);
        i = j < 0 ? n : j + 1;
      } else if (c === "(") {
        flush();
        let depth = 1;
        i++;
        while (i < n && depth > 0) {
          if (text[i] === "(") depth++;
          else if (text[i] === ")") depth--;
          i++;
        }
      } else if (c === "$") {
        flush();
        i++;
        while (i < n && /\d/.test(text[i])) i++;
      } else if (/\s/.test(c)) {
        flush();
        i++;
      } else {
        buf += c;
        i++;
      }
    }
    flush();
    return tokens;
  }

  function parseOne(raw, index) {
    const tagRe = /\[([A-Za-z0-9_]+)\s+"([^"]*)"\]/g;
    const headers = {};
    let m;
    while ((m = tagRe.exec(raw))) headers[m[1]] = m[2];
    const movetext = raw.split("\n").filter(function (l) { return !/^\s*\[[A-Za-z0-9_]+\s+"/.test(l); }).join("\n");

    let state;
    try {
      state = headers.FEN ? Chess.fromFen(headers.FEN) : Chess.startState();
    } catch (e) {
      return { ok: false, headers: headers, moves: [], error: "Партия " + (index + 1) + ": неверный FEN" };
    }
    const startFen = Chess.toFen(state);
    const moves = [];
    let result = headers.Result || "*";
    const tokens = tokenize(movetext);
    for (let i = 0; i < tokens.length; i++) {
      let tok = tokens[i];
      const num = /^(\d+)\.(\.\.)?/.exec(tok);
      if (num) {
        if (tok === num[0]) continue;
        tok = tok.slice(num[0].length);
      }
      if (RESULTS.indexOf(tok) >= 0) { result = tok; break; }
      if (tok === "--" || tok === "Z0") continue;
      const mv = Chess.findMove(state, tok);
      if (!mv) {
        return {
          ok: false, headers: headers, moves: moves, result: result,
          error: "Партия " + (index + 1) + ", ход " + (moves.length + 1) + ": не удалось разобрать «" + tok + "»"
        };
      }
      const fenBefore = Chess.toFen(state);
      const uci = Chess.uci(mv);
      const san = sanOf(state, uci) || tok;
      const mover = state.turn;
      const moveNumber = state.full;
      state = Chess.apply(state, mv);
      moves.push({
        san: san, uci: uci, fenBefore: fenBefore, fenAfter: Chess.toFen(state),
        color: mover, moveNumber: moveNumber
      });
    }
    headers.Result = result;
    return {
      ok: true, headers: headers, moves: moves, result: result, startFen: startFen,
      finalFen: Chess.toFen(state), status: gameStatus(state, [startFen].concat(moves.map(function (move) { return move.fenAfter; })))
    };
  }

  function parse(text) {
    const chunks = splitGames(text);
    if (!chunks.length) return { games: [], errors: ["Пустой PGN"] };
    const games = [];
    const errors = [];
    for (let i = 0; i < chunks.length; i++) {
      const g = parseOne(chunks[i], i);
      games.push(g);
      if (!g.ok) errors.push(g.error);
    }
    return { games: games, errors: errors };
  }

  function toPgn(headers, moves, result) {
    const h = Object.assign({ Event: "Fisher", Site: "Fisher", Date: "????.??.??", Round: "-" }, headers || {});
    h.Result = result || "*";
    const startFen = moves.length && moves[0].fenBefore;
    if (startFen && startFen !== Chess.toFen(Chess.startState())) {
      h.SetUp = "1";
      h.FEN = startFen;
    }
    const lines = [];
    Object.keys(h).forEach(function (k) { lines.push("[" + k + ' "' + String(h[k]).replace(/"/g, "'") + '"]'); });
    const parts = [];
    for (let i = 0; i < moves.length; i++) {
      const color = moves[i].color || (i % 2 === 0 ? "w" : "b");
      const number = moves[i].moveNumber || (Math.floor(i / 2) + 1);
      if (color === "w") parts.push(number + ".");
      else if (i === 0) parts.push(number + "...");
      parts.push(moves[i].san || moves[i]);
    }
    parts.push(h.Result);
    return lines.join("\n") + "\n\n" + parts.join(" ") + "\n";
  }

  return { parse: parse, sanOf: sanOf, gameStatus: gameStatus, drawReason: drawReason, isCheck: isCheck, toPgn: toPgn, splitGames: splitGames };
});
