(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GameSession = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const RATINGS = [250,500,1200,1800,2250,2800,3500,4000];
  const profiles = [
    [0,0,180,.65], [0,0,220,.35], [3,0,350,0], [20,1800,500,0],
    [20,2250,700,0], [20,2800,1000,0], [20,0,1500,0], [20,0,3000,0]
  ];
  function profile(elo) {
    let i = RATINGS.indexOf(Number(elo)); if (i < 0) i = 2;
    const p = profiles[i];
    return {elo:RATINGS[i],skill:p[0],engineElo:p[1],movetime:p[2],randomChance:p[3]};
  }
  function createClock(options) {
    const now = options.now || Date.now, base = Math.max(0, options.baseMs || 0);
    const increment = Math.max(0, options.incrementMs || 0);
    const left = {w:base,b:base};
    let turn = "w", running = false, started = false, stamp = 0, flag = null;
    function settle() {
      if (!running || !base) return;
      const time = now();
      left[turn] = Math.max(0,left[turn] - Math.max(0,time-stamp)); stamp = time;
      if (!left[turn]) { flag = turn; running = false; }
    }
    return {
      start:function (color) { if (started) return; started=true;turn=color;stamp=now();running=!!base; },
      move:function (next) { settle();if(flag)return false;if(base)left[turn]+=increment;turn=next;stamp=now();return true; },
      remaining:function (color) {settle();return left[color];},
      snapshot:function () {settle();return {w:left.w,b:left.b,turn:turn,running:running,flag:flag,timed:!!base};},
      restore:function (snapshot) {left.w=snapshot.w;left.b=snapshot.b;turn=snapshot.turn;flag=snapshot.flag;stamp=now();running=!!base&&!flag;},
      pause:function () {settle();running=false;},
      resume:function () {if(started && base && !flag){stamp=now();running=true;}}
    };
  }
  function estimate(accuracy, count, opponentElo) {
    if (accuracy === null || count < 6) return null;
    // A single-game indicator, deliberately bounded rather than a player rating.
    return Math.round(Math.max(250,Math.min(3500,Number(opponentElo)*.35 + 250 + Math.pow(Math.max(0,accuracy)/100,3)*2400))/50)*50;
  }
  function timeoutWinner(board,flag) {
    const winner=flag==="w"?"b":"w";
    return board.some(function(piece){return piece!=="." && piece.toLowerCase()!=="k" && (piece===piece.toUpperCase()?"w":"b")===winner;})?winner:null;
  }
  function premoveMoves(state,color) {
    if (color !== "w" && color !== "b") return [];
    const moves = [], ownKing = color === "w" ? "K" : "k", direction = color === "w" ? 1 : -1;
    // Occupancy and check can change on the opponent's move; execution must use actual legal moves.
    for (let from = 0; from < 64; from++) {
      const piece = state.board[from];
      if (piece === "." || (piece === piece.toUpperCase() ? "w" : "b") !== color) continue;
      const type = piece.toLowerCase(), file = from & 7, rank = from >> 3;
      for (let to = 0; to < 64; to++) {
        if (from === to || state.board[to] === ownKing) continue;
        const dx = (to & 7) - file, dy = (to >> 3) - rank, ax = Math.abs(dx), ay = Math.abs(dy);
        let candidate = false;
        if (type === "p") {
          candidate = (dy === direction && ax <= 1) ||
            (dx === 0 && dy === direction * 2 && rank === (color === "w" ? 1 : 6));
        } else if (type === "n") candidate = (ax === 1 && ay === 2) || (ax === 2 && ay === 1);
        else if (type === "b") candidate = ax === ay;
        else if (type === "r") candidate = dx === 0 || dy === 0;
        else if (type === "q") candidate = dx === 0 || dy === 0 || ax === ay;
        else if (type === "k") {
          candidate = ax <= 1 && ay <= 1;
          const home = color === "w" ? 4 : 60, rights = state.castle || {};
          if (from === home && dy === 0) {
            if (dx === 2 && rights[color === "w" ? "K" : "k"]) candidate = true;
            if (dx === -2 && rights[color === "w" ? "Q" : "q"]) candidate = true;
          }
        }
        if (!candidate) continue;
        if (type === "p" && (to >> 3) === (color === "w" ? 7 : 0)) {
          ["q","r","b","n"].forEach(function(promo){moves.push({from:from,to:to,promo:promo});});
        } else moves.push({from:from,to:to});
      }
    }
    return moves;
  }
  return {RATINGS:RATINGS,profile:profile,createClock:createClock,estimate:estimate,timeoutWinner:timeoutWinner,premoveMoves:premoveMoves};
});
