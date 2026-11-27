"use strict";
const assert = require("assert");
const Trainer = require("../assets/web/trainer.js");
const Chess = require("../assets/web/chess.js");
const data = require("../assets/web/puzzles.json");
assert(data.puzzles.length >= 500);
const ids = new Set();
data.puzzles.forEach(function (puzzle) {
  assert(!ids.has(puzzle.id)); ids.add(puzzle.id);
  let state = Chess.fromFen(puzzle.fen);
  [puzzle.setup].concat(puzzle.solution).forEach(function (uci) {
    const move = Chess.legalMoves(state).find(function (m) { return Chess.uci(m) === uci; });
    assert(move, puzzle.id + " illegal " + uci); state = Chess.apply(state, move);
  });
});
const clock = Trainer.createClock(180000);
clock.start(1000); assert.equal(clock.remaining(6000), 175000);
clock.pause(6000); assert.equal(clock.remaining(20000), 175000);
clock.start(20000); assert.equal(clock.remaining(22000), 173000);
clock.penalty(10000, 22000); assert.equal(clock.remaining(23000), 162000);
assert.equal(clock.remaining(400000), 0);
const deck = Trainer.createDeck(data.puzzles, function () { return 0.3; });
const drawn = new Set();
for (let i=0; i<60; i++) { const id = deck.next().id; assert(!drawn.has(id)); drawn.add(id); }
assert(deck.next());
assert(Trainer.isEquivalent({type:"cp",value:300},{type:"cp",value:275}));
assert(!Trainer.isEquivalent({type:"cp",value:300},{type:"cp",value:100}));
assert(Trainer.isEquivalent({type:"mate",value:3},{type:"mate",value:2}));
assert(!Trainer.isEquivalent({type:"mate",value:3},{type:"cp",value:900}));
assert(!Trainer.isEquivalent({type:"cp",value:300},{type:"mate",value:-2}));
assert(Trainer.isEquivalent({type:"cp",value:300},{type:"mate",value:2}));
console.log("trainer: 600 legal Lichess puzzle lines, unique deck, active thinking clock, score equivalence passed");

async function controllerChecks() {
  const Pgn = require("../assets/web/pgn.js"), elements = {}, requests = [], pending = [];
  let boardState, boardOptions, onMove, language="en", defer=false, cancelled=0, override=null;
  const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
  function element() { return {textContent:"",hidden:false,disabled:false,value:"",children:[],appendChild:function (child) { this.children.push(child); },setAttribute:function () {}}; }
  const names="title intro modeLabel ratingLabel mode rating start rules stats position board promotion feedback analysis explanation retry hint solution next skip end result source settings summary content backTen back forward forwardTen current historyStatus".split(" ");
  names.forEach(name => elements[name]=element());
  elements.mode.value="practice"; elements.rating.value="all"; elements.mode.options=[element(),element(),element()];
  const root={innerHTML:"",querySelector:function (selector) { return elements[selector.match(/"([^"]+)"/)[1]]; }};
  root.setAttribute=function () {};
  global.document={createElement:element}; global.localStorage={getItem:()=>null,setItem:()=>{}};
  global.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve(data)});
  global.FisherBoard={create:function (el,options) { onMove=options.onMove; return {render:function (s,o) { boardState=s; boardOptions=o; },setOrientation:function () {}}; }};
  const solutions={};
  data.puzzles.forEach(p => {
    let s=Chess.fromFen(p.fen); s=Chess.apply(s,Chess.legalMoves(s).find(m=>Chess.uci(m)===p.setup));
    p.solution.forEach((uci,i) => {
      solutions[Chess.toFen(s)]={bestmove:uci,lines:[{pv:p.solution.slice(i),eval:{type:"cp",value:i%2===0?400:-400}}]};
      s=Chess.apply(s,Chess.legalMoves(s).find(m=>Chess.uci(m)===uci));
    });
    solutions[Chess.toFen(s)]={bestmove:"",lines:[{pv:[],eval:{type:"cp",value:-400}}]};
  });
  const engine={cancel:function (owner) { assert.equal(owner,"trainer"); cancelled++; },search:function (options,owner) {
    assert.equal(owner,"trainer"); assert.equal(options.skill,20); assert.equal(options.elo,0); assert.equal(options.depth,18);
    requests.push(options);
    if(override) return override(options);
    if(defer) return new Promise(resolve=>pending.push(resolve));
    return Promise.resolve(solutions[options.fen] || {bestmove:Chess.uci(Chess.legalMoves(Chess.fromFen(options.fen))[0]),lines:[{pv:[],eval:{type:"cp",value:0}}]});
  }};
  const controller=Trainer.create(root,{Chess:Chess,Pgn:Pgn,Eng:engine,I18n:{getLanguage:()=>language},isReady:()=>true});
  controller.show(); await delay(0); assert(!elements.start.disabled); assert(elements.content.hidden); assert(!elements.settings.hidden); assert(!/moveForm|moveInput/.test(root.innerHTML));
  elements.start.onclick(); assert(elements.settings.hidden); assert(!elements.summary.hidden); assert(!elements.content.hidden); await delay(0); assert.equal(boardOptions.interactive,false); await delay(480); assert(boardOptions.interactive);
  const initial=Chess.toFen(boardState), entry=solutions[initial];
  const wrong=Chess.legalMoves(boardState).find(m=>Chess.uci(m)!==entry.bestmove && Pgn.gameStatus(Chess.apply(boardState,m))!=="mate");
  onMove(wrong.from,wrong.to); await delay(10); assert.equal(elements.retry.hidden,true); assert(boardOptions.interactive);
  assert.equal(Chess.toFen(boardState),initial,"wrong attempt returns directly to actual position");
  assert(!/Best move:|Line:/.test(elements.analysis.textContent+elements.explanation.textContent),"wrong attempts cannot leak a solution");
  elements.back.onclick(); assert(!boardOptions.interactive); assert.notEqual(Chess.toFen(boardState),initial,"setup move appears in history");
  const searchesBeforeHistory=requests.length, statsBeforeHistory=elements.stats.textContent;
  onMove(wrong.from,wrong.to); await delay(0); assert.equal(requests.length,searchesBeforeHistory); assert.equal(elements.stats.textContent,statsBeforeHistory);
  assert(!elements.current.hidden); elements.current.onclick(); assert.equal(Chess.toFen(boardState),initial); assert(boardOptions.interactive);
  elements.hint.onclick(); assert(/Start with/.test(elements.feedback.textContent));
  elements.solution.onclick(); assert(/Line:/.test(elements.explanation.textContent));
  assert(!boardOptions.interactive);const replayPosition=Chess.toFen(boardState);
  if(elements.next.hidden){await delay(2600);assert.notEqual(Chess.toFen(boardState),replayPosition,'solution advances after about 2.5 seconds');}
  elements.current.onclick();assert.equal(elements.next.hidden,false);const replayFinal=Chess.toFen(boardState);elements.back.onclick();assert.notEqual(Chess.toFen(boardState),replayFinal);elements.current.onclick();
  assert.equal(boardOptions.arrow,null,'automatic solution arrows stay off by default');
  elements.next.onclick(); await delay(480);
  // Resolve every required human ply, including automatic opponent replies.
  for(let turns=0; turns<8 && elements.next.hidden; turns++) {
    const bestMove=solutions[Chess.toFen(boardState)].bestmove;
    const move=Chess.legalMoves(boardState).find(m=>Chess.uci(m)===bestMove);
    const searchesBeforeAttempt=requests.length;onMove(move.from,move.to);await delay(10);
    assert.equal(requests.length,searchesBeforeAttempt,'prefetched canonical assessments need no new search after the click');
    await delay(750);
    if (elements.next.hidden) assert(!/Line:/.test(elements.explanation.textContent),"continuation stays hidden until puzzle solved");
  }
  assert(!elements.next.hidden); assert(/Solved: 1/.test(elements.stats.textContent));
  assert(requests.length>=4);
  elements.next.onclick(); await delay(480); defer=true;
  const move=Chess.legalMoves(boardState).find(m=>Chess.uci(m)!==solutions[Chess.toFen(boardState)].bestmove),expectedImmediate=Chess.toFen(Chess.apply(boardState,move)); onMove(move.from,move.to);
  assert.equal(Chess.toFen(boardState),expectedImmediate,'piece moves synchronously before either engine search completes');
  assert.equal(boardOptions.lastMove,Chess.uci(move),'the immediate board uses the attempted move highlight');
  assert(!boardOptions.interactive,'a second attempt cannot overlap evaluation');
  await delay(0); assert(pending.length);
  const count=requests.length; controller.hide();
  pending.shift()({bestmove:"",lines:[]}); await delay(10);
  assert.equal(requests.length,count,"hiding must prevent the second engine job"); assert(cancelled>=3); assert(!boardOptions.interactive);
  assert(/left training/.test(elements.feedback.textContent));
  controller.show(); elements.mode.value="survival"; elements.start.onclick(); await delay(480);
  elements.hint.onclick(); elements.hint.onclick(); elements.hint.onclick(); assert(!elements.result.hidden);
  assert(/Lives: 0/.test(elements.stats.textContent));
  language="ru"; controller.refreshLanguage(); assert.equal(elements.title.textContent,"Найдите лучший ход");
  controller.hide();
  // Credit survives two errors, but never the third; browsing cannot change it.
  language="en"; defer=false; elements.mode.value="practice";
  const shortPuzzle=data.puzzles.find(p=>p.id==="0000H");
  global.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({puzzles:[shortPuzzle]})});
  const sounds=[], vibrations=[]; let haptics=true;
  const credits=Trainer.create(root,{Chess:Chess,Pgn:Pgn,Eng:engine,I18n:{getLanguage:()=>language},isReady:()=>true,
    Sounds:{eventForMove:()=>"move",play:event=>{sounds.push(event);return Promise.resolve();}},getSettings:()=>({haptics:haptics,showArrow:false}),vibrate:kind=>vibrations.push(kind)});
  credits.show(); await delay(0);
  async function shortRun(errors) {
    elements.start.onclick(); await delay(480);
    const position=Chess.toFen(boardState), expected=shortPuzzle.solution[0];
    const bad=Chess.legalMoves(boardState).find(m=>Chess.uci(m)!==expected && Pgn.gameStatus(Chess.apply(boardState,m))!=="mate");
    for (let i=0;i<errors;i++) {
      onMove(bad.from,bad.to); await delay(10);
      assert.equal(Chess.toFen(boardState),position); assert(boardOptions.interactive);
      assert(!/Best move:|Line:/.test(elements.analysis.textContent+elements.explanation.textContent));
    }
    const good=Chess.legalMoves(boardState).find(m=>Chess.uci(m)===expected);
    onMove(good.from,good.to); await delay(10); assert(!elements.next.hidden);
    assert.deepEqual(boardOptions.annotations.map(a=>a.key),['mate','winner'],'checkmate decorates both kings');
    assert(boardOptions.annotations.every(a=>a.animate),'new checkmate animates');
    const endCount=sounds.filter(s=>s==='game-end').length, vibrationCount=vibrations.length;
    assert.equal(endCount,errors===2?1:2,'one ending sound per completed mate');
    assert.equal(vibrationCount,1,'disabled haptics must suppress mate vibration');
    assert(new RegExp("Solved: "+(errors<3?1:0)).test(elements.stats.textContent));
    const score=elements.stats.textContent;
    elements.backTen.onclick(); assert.equal(elements.historyStatus.textContent,"0 / 2"); assert(!boardOptions.interactive);
    elements.forward.onclick(); assert.equal(elements.historyStatus.textContent,"1 / 2");
    elements.forwardTen.onclick(); assert.equal(elements.historyStatus.textContent,"2 / 2"); assert.equal(elements.stats.textContent,score);
    credits.refreshAppearance(); await delay(0);
    assert(boardOptions.annotations.every(a=>a.animate===false),'history/appearance cannot restart mate animation');
    assert.equal(sounds.filter(s=>s==='game-end').length,endCount); assert.equal(vibrations.length,vibrationCount);
    elements.end.onclick(); assert(!elements.settings.hidden); assert(elements.summary.hidden);
  }
  await shortRun(2); haptics=false; await shortRun(3); credits.hide();
  // A failed engine reply on an accepted alternative must never hand the
  // opponent's pieces to the human, and retry must resume that same reply.
  language="en"; defer=false; elements.mode.value="practice";
  const single=data.puzzles.find(p=>p.id==="00008");
  global.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({puzzles:[single]})});
  const alternate=Trainer.create(root,{Chess:Chess,Pgn:Pgn,Eng:engine,I18n:{getLanguage:()=>language},isReady:()=>true});
  alternate.show(); await delay(0); elements.start.onclick(); await delay(480);
  const human=boardState.turn;
  const altMove=Chess.legalMoves(boardState).find(m=>Chess.uci(m)!==single.solution[0] && Pgn.gameStatus(Chess.apply(boardState,m))==="play");
  let replyRequests=0;
  override=function(options) {
    replyRequests++;
    const s=Chess.fromFen(options.fen), moves=Chess.legalMoves(s), best=Chess.uci(moves[0]);
    const next=Chess.apply(s,moves.find(m=>Chess.uci(m)===best)), nextMove=Chess.legalMoves(next)[0];
    return Promise.resolve({bestmove:best,lines:[{pv:[best].concat(nextMove?[Chess.uci(nextMove)]:[]),eval:{type:"cp",value:s.turn===human?400:-400}}]});
  };
  onMove(altMove.from,altMove.to); await delay(20);
  assert(elements.retry.hidden); assert.equal(boardOptions.interactive,false); assert.equal(boardState.turn,human==="w"?"b":"w");
  assert.equal(replyRequests,1,'assessment already provides the opponent reply, without another identical search');
  await delay(760);
  assert(boardOptions.interactive); assert.equal(boardState.turn,human);
  language="ru"; alternate.refreshLanguage(); assert(/Верно/.test(elements.feedback.textContent));
  assert(!/Evaluation|Best move|Line:/.test(elements.analysis.textContent+elements.explanation.textContent));
  alternate.hide();
  console.log("trainer controller: setup, wrong/retry, hint/reveal, full solution, assessment strength, hide cancellation, survival lives, RU/EN passed");
}
controllerChecks().catch(error=>{console.error(error);process.exitCode=1;});
