"use strict";
const assert = require("assert");
const Chess = require("../assets/web/chess.js");
const Pgn = require("../assets/web/pgn.js");
const Eng = require("../assets/web/engine.js");
const Trainer = require("../assets/web/trainer.js");
const {createClient} = require("../tools/stockfish-client.js");
const puzzles = require("../assets/web/puzzles.json").puzzles;

if (!process.env.REAL_STOCKFISH) {
  console.log("trainer engine: skipped (set REAL_STOCKFISH=1 and STOCKFISH to run)");
} else {
  run().catch(function (error) { console.error(error); process.exitCode=1; });
}
async function run() {
  const client=createClient(process.env.STOCKFISH || "stockfish");
  const opts={depth:18,movetime:600,skill:20,elo:0};
  try {
    await client.init();
    for (const id of ["00008","0000D","000Zo"]) {
      const puzzle=puzzles.find(p=>p.id===id);
      let state=Chess.fromFen(puzzle.fen);
      function apply(uci) { const move=Chess.legalMoves(state).find(m=>Chess.uci(m)===uci); assert(move,id+" legal "+uci); state=Chess.apply(state,move); }
      apply(puzzle.setup);
      const before=Eng.normalize(await client.search(Object.assign({},opts,{fen:Chess.toFen(state),multipv:3})));
      assert(before.lines[0].eval && !before.lines[0].score,"normalized eval field");
      assert(Chess.legalMoves(state).some(m=>Chess.uci(m)===before.bestmove));
      const canonical=before.lines.find(line=>line.move===puzzle.solution[0]);
      assert(canonical,id+" canonical move in top three: "+before.lines.map(l=>l.move));
      apply(puzzle.solution[0]);
      const after=Eng.normalize(await client.search(Object.assign({},opts,{fen:Chess.toFen(state),multipv:1})));
      assert(after.lines[0] && after.lines[0].eval,id+" after assessment");
      const actual={type:after.lines[0].eval.type,value:-after.lines[0].eval.value};
      assert(actual.value>0,id+" score is positive for the human after inversion");
      if(id==="000Zo") { assert.equal(before.lines[0].eval.type,"mate"); assert.equal(actual.type,"mate"); }
      assert(Trainer.isEquivalent(before.lines[0].eval,actual),id+" canonical score is equivalent");
      console.log("trainer engine "+id+": "+puzzle.solution[0]+" before="+JSON.stringify(before.lines[0].eval)+" after(human)="+JSON.stringify(actual));
      for(let i=1;i<puzzle.solution.length;i++) apply(puzzle.solution[i]);
      if(id==="000Zo") assert.equal(Pgn.gameStatus(state),"mate");
    }
  } finally { client.quit(); }
  console.log("trainer engine: real Stockfish normalization, three canonical before/after scores, and forced mate passed");
}
