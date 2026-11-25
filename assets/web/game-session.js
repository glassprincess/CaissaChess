(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./chess.js"));
  else root.GameSession = factory(root.ChessLogic);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chess) {
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
  function jumpIndex(index,direction,last,min) {
    return Math.max(min === undefined ? -1 : min,Math.min(last,index + direction * 10));
  }
  function botThinkDelay(remainingMs,random) {
    const range = remainingMs > 10000 ? [350,1000] : remainingMs > 1500 ? [200,650] : [120,300];
    const draw = Math.max(0,Math.min(1 - Number.EPSILON,(random || Math.random)()));
    return range[0] + Math.floor(draw * (range[1] - range[0] + 1));
  }
  function botTiming(profile,remainingMs,incrementMs,random) {
    if(remainingMs===null)return {movetime:profile.movetime,totalMs:profile.movetime};
    const draw=Math.max(0,Math.min(1,(random || Math.random)()));
    const cap=Math.max(1,Math.min(Math.floor(remainingMs*.2),Math.floor(remainingMs/70+Math.max(0,incrementMs||0)*.65)));
    const total=Math.max(1,Math.floor(Math.min(cap*(.75+draw*.25),profile.movetime+botThinkDelay(remainingMs,function(){return draw;}))));
    return {movetime:Math.max(1,Math.min(profile.movetime,Math.floor(total*.78))),totalMs:total};
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
  function projectPremoves(state, queue, color) {
    const projected = Object.assign({}, state, {board:state.board.slice(), castle:Object.assign({}, state.castle), turn:color || state.turn, ep:-1});
    const origins = state.board.map(function (piece, sq) { return piece === "." ? -1 : sq; });
    const moved = Object.create(null);
    function place(from, to, piece) {
      const origin = origins[from];
      if (origin < 0) return;
      projected.board[from] = "."; origins[from] = -1;
      projected.board[to] = piece; origins[to] = origin; moved[origin] = true;
    }
    (queue || []).forEach(function (move) {
      if (!move || move.from < 0 || move.from > 63 || move.to < 0 || move.to > 63 || move.from === move.to) return;
      const piece = projected.board[move.from];
      if (!piece || piece === ".") return;
      const white = piece === piece.toUpperCase(), side = white ? "w" : "b", home = white ? 0 : 56;
      if (color && side !== color) return;
      let sprite = piece;
      if (piece.toLowerCase() === "p" && (move.to >> 3) === (white ? 7 : 0) && "qrbn".indexOf(move.promo || "-") >= 0)
        sprite = white ? move.promo.toUpperCase() : move.promo;
      place(move.from, move.to, sprite);
      if (piece.toLowerCase() === "k") {
        if (move.from === home + 4 && Math.abs(move.to - move.from) === 2) {
          const rookFrom = home + (move.to > move.from ? 7 : 0), rookTo = home + (move.to > move.from ? 5 : 3);
          if (projected.board[rookFrom] === (white ? "R" : "r")) place(rookFrom, rookTo, projected.board[rookFrom]);
        }
        projected.castle[white ? "K" : "k"] = false; projected.castle[white ? "Q" : "q"] = false;
      }
      [move.from,move.to].forEach(function (sq) {
        const right = {0:"Q",7:"K",56:"q",63:"k"}[sq];
        if (right) projected.castle[right] = false;
      });
    });
    const placements = [];
    origins.forEach(function (origin, to) {
      if (origin >= 0 && moved[origin]) placements.push({from:origin,to:to,piece:projected.board[to]});
    });
    return {state:projected,placements:placements,hidden:state.board.map(function (piece, sq) { return piece !== "." && origins.indexOf(sq) < 0 ? sq : -1; }).filter(function (sq) { return sq >= 0; })};
  }
  function nextPremove(state, queue, color) {
    if (!queue || !queue.length) return {move:null,queue:[]};
    const head = queue[0], piece = state.board[head.from];
    const owner = color || (piece && piece !== "." ? (piece === piece.toUpperCase() ? "w" : "b") : state.turn);
    if (state.turn !== owner) return {move:null,queue:queue};
    const move = Chess.legalMoves(state).filter(function (candidate) {
      return candidate.from === head.from && candidate.to === head.to && (candidate.promo || "") === (head.promo || "");
    })[0];
    return {move:move || null,queue:move ? queue.slice(1) : []};
  }
  return {projectPremoves:projectPremoves,nextPremove:nextPremove,RATINGS:RATINGS,profile:profile,createClock:createClock,estimate:estimate,timeoutWinner:timeoutWinner,premoveMoves:premoveMoves,jumpIndex:jumpIndex,botThinkDelay:botThinkDelay,botTiming:botTiming};
});
