(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CaissaPuzzleProvider = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KEY = "caissa.trainer.puzzles.v1";
  function matches(p, range) { return range === "easy" ? p.rating < 1400 : range === "medium" ? p.rating >= 1400 && p.rating < 1900 : range === "hard" ? p.rating >= 1900 : true; }
  function valid(p, Chess) {
    try {
      if (!p || !/^[a-zA-Z0-9]{5}$/.test(p.id) || typeof p.fen !== "string" || !Number.isFinite(p.rating) || p.rating < 600 || p.rating > 2400 || !Array.isArray(p.solution) || !p.solution.length || p.solution.length > 40 || !Array.isArray(p.themes)) return false;
      let state = Chess.fromFen(p.fen);
      return [p.setup].concat(p.solution).every(function (uci) {
        if (typeof uci !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return false;
        const move = Chess.legalMoves(state).find(function (m) { return Chess.uci(m) === uci; });
        if (!move) return false; state = Chess.apply(state, move); return true;
      });
    } catch (e) { return false; }
  }
  function normalize(json, Chess, Pgn) {
    try {
      if (!json || !json.game || !json.puzzle || typeof json.game.pgn !== "string" || json.game.pgn.length > 30000) return null;
      const parsed = Pgn.parse(json.game.pgn), game = parsed.games[0];
      if (parsed.errors.length || !game || !game.moves.length) return null;
      const last = game.moves[game.moves.length-1], p = json.puzzle;
      const item = {id:p.id,fen:last.fenBefore,setup:last.uci,solution:p.solution,rating:p.rating,themes:p.themes,sourceURL:"https://lichess.org/training/"+p.id,gameURL:"https://lichess.org/"+json.game.id,online:true};
      return valid(item,Chess) ? item : null;
    } catch (e) { return null; }
  }
  function create(options) {
    const Chess = options.Chess, Pgn = options.Pgn, now = options.now || Date.now;
    let cache = [], blockedUntil = 0, pending = null, previous = "";
    try { const saved=JSON.parse(options.storage.getItem(KEY) || "[]"); if (Array.isArray(saved)) cache=saved.slice(0,100).filter(function (p) { return valid(p,Chess); }); } catch (e) {}
    function fallback(range) {
      const pool=cache.filter(function (p) { return matches(p,range); });
      const item=pool.find(function (p) { return p.id !== previous; }) || pool[0] || null;
      if (item) previous=item.id;
      return item;
    }
    function remember(item) {
      cache=cache.filter(function (p) { return p.id !== item.id; }); cache.unshift(item); cache=cache.slice(0,100);
      try { options.storage.setItem(KEY,JSON.stringify(cache)); } catch (e) {}
    }
    return {next:function (range) {
      if (!options.fetch || (options.isOnline && !options.isOnline()) || now() < blockedUntil) return Promise.resolve(fallback(range));
      if (pending) return pending.then(function (p) { return p && matches(p,range) ? p : fallback(range); });
      const abort = typeof AbortController !== "undefined" ? new AbortController() : null;
      const difficulty = range === "easy" ? "easier" : range === "hard" ? "harder" : "normal";
      let timeout;
      const expired = new Promise(function (_, reject) { timeout=setTimeout(function () { if (abort) abort.abort(); reject(new Error("timeout")); },4000); });
      // One request per requested puzzle; anonymous difficulty is relative to 1500.
      const request = Promise.resolve().then(function () { return options.fetch("https://lichess.org/api/puzzle/next?difficulty="+difficulty,{signal:abort ? abort.signal : undefined,credentials:"omit",headers:{Accept:"application/json"}}); }).then(function (response) {
        if (response.status === 429) { blockedUntil=now()+60000; throw new Error("rate limit"); }
        if (!response.ok) throw new Error("puzzle request");
        const length=response.headers && response.headers.get("content-length");
        if (length && Number(length)>100000) throw new Error("oversize puzzle");
        return response.json();
      }).then(function (json) {
        if (JSON.stringify(json).length>100000) throw new Error("oversize puzzle");
        const item=normalize(json,Chess,Pgn); if (!item) throw new Error("invalid puzzle");
        remember(item); return item;
      });
      pending=Promise.race([request,expired]).then(function (item) {
        if (!matches(item,range)) return fallback(range);
        previous=item.id; return item;
      }).catch(function () {
        blockedUntil=Math.max(blockedUntil,now()+30000); return fallback(range);
      }).then(function (item) { clearTimeout(timeout); pending=null; return item; });
      return pending;
    }};
  }
  return {create:create,normalize:normalize};
});
