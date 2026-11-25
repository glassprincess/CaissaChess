'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const assert = require('assert');
const spawn = require('child_process').spawn;
const root = path.join(__dirname, '../assets/web');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fisher-board-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, socket, server;
async function run() {
  server = http.createServer((req, res) => {
    if (req.url === '/') return res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Board regression</title><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="board-fixes.css"><link rel="stylesheet" href="board-premove.css"><link rel="stylesheet" href="board-review.css"><div id="board" style="width:320px;height:320px;max-width:none"></div><script src="chess.js"></script><script src="game-session.js"></script><script src="board.js"></script><script>var moves=[],cancels=0;var board=FisherBoard.create(document.getElementById("board"),{onMove:function(from,to){moves.push([from,to]);},onCancelPremove:function(){cancels++;board.render(real,{premoves:[]});}});</script></html>');
    const file = path.join(root, req.url);
    fs.readFile(file, (err, data) => {
      res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : 'image/svg+xml');
      res.statusCode = err ? 404 : 200; res.end(err ? '' : data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--no-first-run', '--remote-debugging-port=19369', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let tabs;
  for (let i = 0; i < 100; i++) {
    try { tabs = await (await fetch('http://127.0.0.1:19369/json')).json(); break; } catch (e) { await sleep(100); }
  }
  assert.ok(tabs, 'Browser started');
  socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let seq = 0; const pending = new Map();
  socket.addEventListener('message', e => {
    const result = JSON.parse(e.data);
    if (result.method === 'Runtime.exceptionThrown') console.error('Browser exception: ' + JSON.stringify(result.params.exceptionDetails));
    if (!result.id) return;
    const action = pending.get(result.id); pending.delete(result.id);
    result.error ? action.reject(Error(result.error.message)) : action.resolve(result.result);
  });
  function cdp(method, params) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
  async function js(expression) { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
  await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/' });
  await sleep(400);
  await js('var state=ChessLogic.fromFen("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1");board.render(state)');
  assert.deepStrictEqual(await js('(function(){var s=document.querySelector(".sq.check"),r=s.getBoundingClientRect();return {margin:getComputedStyle(s).marginTop,height:r.height};})()'), { margin: '0px', height: 40 }, 'Checked square fills the grid cell without black gaps');
  assert.strictEqual(await js('getComputedStyle(document.querySelector(".king-aura"),"::before").filter'), 'none', 'Aura uses no GPU blur');
  await js('var badges=[{move:"h8h8",key:"mate",file:"mate.svg",label:"Мат"},{move:"f6f6",key:"winner",file:"winner.svg",label:"Победа"}];board.render(state,{annotation:badges});var mate=document.querySelectorAll(".move-badge")[0],winner=document.querySelectorAll(".move-badge")[1]');
  assert.strictEqual(await js('document.querySelectorAll(".move-badge").length'), 2);
  assert.strictEqual(await js('winner.firstChild.className'), 'brilliant-enter');
  await js('board.render(state,{annotation:badges});board.setOrientation("b")');
  assert.strictEqual(await js('mate===document.querySelectorAll(".move-badge")[0] && winner===document.querySelectorAll(".move-badge")[1]'), true, 'Renders and flips retain markers and animation state');
  assert.strictEqual(await js('winner.style.left'), '25%');
  await js('board.render(state,{annotations:[]})');
  assert.strictEqual(await js('document.querySelectorAll(".move-badge").length'), 0);
  await js('board.setOrientation("w");var hintState=ChessLogic.startState(),hintFen=ChessLogic.toFen(hintState),hint={move:"e2e4",key:"best",file:"best.svg",color:"#81b64c",animate:true};board.render(hintState,{annotation:hint});var hintSquare=document.querySelector(\'.sq[data-sq="28"]\'),hintBadge=document.querySelector(".move-badge")');
  assert.deepStrictEqual(await js('[ChessLogic.toFen(hintState)===hintFen,hintState.board[28],hintSquare.style.getPropertyValue("--review-tint"),getComputedStyle(hintSquare).backgroundColor,getComputedStyle(hintSquare).backgroundImage,hintBadge.firstChild.className]'), [true, '.', 'rgba(129, 182, 76, 0.26)', 'rgb(235, 236, 208)', 'linear-gradient(rgba(129, 182, 76, 0.26), rgba(129, 182, 76, 0.26))', ''], 'Hint marks the empty future target with subtle tint and corner star without moving');
  await js('board.render(hintState,{annotation:{move:"e2e4",key:"great",file:"great_find.svg",color:"#1bada6"}});var great=document.querySelector(".move-badge"),greatIcon=great.firstChild');
  assert.deepStrictEqual(await js('[hintSquare.style.getPropertyValue("--review-tint"),greatIcon.className,getComputedStyle(greatIcon).animationName,greatIcon.getAttribute("src")]'), ['rgba(93, 145, 178, 0.26)', 'brilliant-enter', 'brilliant-reveal', 'analysis-icons/great_find.svg'], 'Great uses muted slate blue and the existing full-piece-to-corner animation');
  await js('board.render(hintState);board.setOrientation("b")');
  assert.strictEqual(await js('great===document.querySelector(".move-badge") && greatIcon===great.firstChild'), true, 'Great marker survives rerender and flip without restarting');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.strictEqual(await js('getComputedStyle(greatIcon).animationName'), 'none', 'Great respects reduced motion');
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  await js('board.setOrientation("w");board.render(hintState,{annotation:{move:"e2e4",key:"brilliant",file:"brilliant.svg",color:"#1bada6"}})');
  assert.strictEqual(await js('hintSquare.style.getPropertyValue("--review-tint")'), 'rgba(27, 173, 166, 0.26)', 'Brilliant keeps a distinct teal tint');
  for (const [key, color, expected] of [['inaccuracy', '#f7c045', 'rgba(247, 192, 69, 0.26)'], ['blunder', '#fa412d', 'rgba(250, 65, 45, 0.26)']]) {
    await js('board.render(hintState,{annotation:{move:"e2e4",key:' + JSON.stringify(key) + ',color:' + JSON.stringify(color) + '}})');
    assert.strictEqual(await js('hintSquare.style.getPropertyValue("--review-tint")'), expected, key + ' preserves RGB at low alpha');
  }
  await js('var initialKnight=document.querySelector(\'.pc[data-sq="6"]\');window.CaissaAppearance={pieceUrl:function(code){return "pieces-test/"+code+".svg";}};board.render(hintState,{annotation:null})');
  assert.strictEqual(await js('initialKnight===document.querySelector(\'.pc[data-sq="6"]\') && initialKnight.firstChild.getAttribute("src")==="pieces-test/wN.svg"'), true, 'Appearance rerender refreshes existing sprites without a position change');
  await js('var previewPromotion=ChessLogic.fromFen("1r5k/P7/8/8/8/8/8/7K b - - 0 1");board.render(previewPromotion,{premove:{from:48,to:57,promo:"n"}})');
  assert.strictEqual(await js('document.querySelector(".pc.premove-piece img").getAttribute("src")'), 'pieces-test/wN.svg', 'Promotion preview uses chosen piece from appearance');
  await js('delete window.CaissaAppearance;board.render(previewPromotion,{premove:null})');
  await js(`board.setOrientation("w");var real=Object.assign({},ChessLogic.startState(),{turn:"b"}),realFen=ChessLogic.toFen(real);board.render(real,{annotation:null});var pawn=document.querySelector('.pc[data-sq="12"]');board.render(real,{premove:{from:12,to:28}})`);
  assert.deepStrictEqual(await js(`[ChessLogic.toFen(real)===realFen,real.turn,pawn.dataset.sq,pawn.style.left,pawn.style.top,document.querySelectorAll(".pc").length,document.querySelector('.sq[data-sq="28"]').classList.contains("premove-to")]`), [true, 'b', '28', '50%', '50%', 32, true], 'Premove visibly moves the existing pawn without changing actual position');
  assert.strictEqual(await js('getComputedStyle(document.querySelector(".sq.premove-to")).backgroundColor'), 'rgb(208, 132, 132)', 'Premove target is light red');
  await sleep(230);
  await js('board.render(real,{premove:null})');
  assert.strictEqual(await js('pawn.dataset.sq'), '12');
  assert.strictEqual(await js('!!pawn._fisherMotion'), true, 'Cancelling animates the same pawn back');
  await sleep(230);
  await js('board.render(real,{premove:{from:12,to:28}})');
  await sleep(230);
  await js('var botNext=ChessLogic.apply(real,ChessLogic.legalMoves(real).filter(function(m){return ChessLogic.uci(m)==="g8f6";})[0]);board.render(botNext,{premove:{from:12,to:28}});var played=ChessLogic.apply(botNext,ChessLogic.legalMoves(botNext).filter(function(m){return ChessLogic.uci(m)==="e2e4";})[0]);board.render(played,{premove:null})');
  assert.strictEqual(await js(`document.querySelector('.pc[data-sq="28"]')===pawn && !pawn._fisherMotion`), true, 'Bot update and actual premove commit do not bounce or duplicate the preview pawn');
  await js(`var castle=ChessLogic.fromFen("4k3/8/8/8/8/8/8/4KBNR b K - 0 1");board.render(castle,{premove:{from:4,to:6}});var king=document.querySelector('.pc.premove-piece[data-sq="6"]'),rook=document.querySelector('.pc.premove-piece[data-sq="5"]')`);
  assert.strictEqual(await js('!!king && !!rook && document.querySelectorAll(".pc.premove-hidden").length===2 && castle.board[4]==="K" && castle.board[7]==="R"'), true, 'Castling previews rook and king, hiding occupied future target squares');
  await js('board.setOrientation("b")');
  assert.strictEqual(await js('king.style.left'), '12.5%');
  await js('board.render(castle,{premove:null})');
  assert.strictEqual(await js('document.querySelectorAll(".pc.premove-hidden").length===0 && king.dataset.sq==="4" && rook.dataset.sq==="7"'), true, 'Cancelling castling restores both hidden pieces');
  await js('board.setOrientation("w");var promotion=ChessLogic.fromFen("1r5k/P7/8/8/8/8/8/7K b - - 0 1");board.render(promotion,{premove:{from:48,to:57,promo:"n"}});var promoted=document.querySelector(".pc.premove-piece")');
  assert.strictEqual(await js('promoted.dataset.sq==="57" && promoted.firstChild.getAttribute("src")==="pieces/wN.svg" && document.querySelectorAll(".pc.premove-hidden").length===1 && promotion.board[48]==="P" && promotion.board[57]==="r"'), true, 'Promotion capture previews requested sprite without mutating or removing captured piece');
  await js('board.render(promotion,{premove:null})');
  assert.strictEqual(await js('promoted.firstChild.getAttribute("src")==="pieces/wP.svg" && document.querySelectorAll(".pc.premove-hidden").length===0'), true, 'Promotion cancellation restores pawn sprite and captured rook');
  await js('var future=GameSession.projectPremoves(real,[{from:12,to:28},{from:28,to:36}],"w");board.render(real,{premoves:[{from:12,to:28},{from:28,to:36}],inputState:future.state,inputMoves:GameSession.premoveMoves(future.state,"w")});moves=[]');
  assert.strictEqual(await js('document.querySelector(".pc.premove-piece").dataset.sq'), '36' , 'Queued pawn previews final square after successive moves');
  await js('(function(){var b=document.getElementById("board"),r=b.getBoundingClientRect();[36,44].forEach(function(sq){var o={clientX:r.left+r.width*((sq&7)+.5)/8,clientY:r.top+r.height*(7-(sq>>3)+.5)/8,bubbles:true,isPrimary:true,pointerId:29};b.dispatchEvent(new PointerEvent("pointerdown",o));window.dispatchEvent(new PointerEvent("pointerup",o));});})()');
  assert.deepStrictEqual(await js('moves'), [[36,44]], 'Future pieces can be selected at projected locations');
  await js('var q=[{from:12,to:28},{from:28,to:36}];board.render(real,{premoves:q});window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));');
  assert.deepStrictEqual(await js('[cancels,document.querySelectorAll(".pc.premove-piece").length]'), [1,0], 'Escape clears the whole queue');
  await js('board.render(real,{premoves:q});window.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}));');
  assert.deepStrictEqual(await js('[cancels,document.querySelectorAll(".pc.premove-piece").length]'), [2,0], 'Right click anywhere clears the whole queue');
  await js('board.render(real,{premoves:q,inputState:future.state,inputMoves:GameSession.premoveMoves(future.state,"w")});var r=document.getElementById("board").getBoundingClientRect();document.getElementById("board").dispatchEvent(new PointerEvent("pointerdown",{clientX:r.left+r.width*.5/8,clientY:r.top+r.height*4.5/8,bubbles:true,isPrimary:true,pointerId:31}));');
  assert.deepStrictEqual(await js('[cancels,document.querySelectorAll(".pc.premove-piece").length]'), [3,0], 'Empty board tap clears the whole queue');
  await js('board.render(real,{premoves:[],inputState:null,inputMoves:null});board.render(botNext,{lastMove:"g8f6"});var botSprite=document.querySelector(\'.pc[data-sq="45"]\'),botAnimation=botSprite._fisherMotion;var r=document.getElementById("board").getBoundingClientRect();document.getElementById("board").dispatchEvent(new PointerEvent("pointerdown",{clientX:r.left+r.width*4.5/8,clientY:r.top+r.height*6.5/8,bubbles:true,isPrimary:true,pointerId:30}));');
  assert.strictEqual(await js('!!botAnimation && botSprite._fisherMotion===botAnimation'), true, 'Selecting own premove does not cancel opponent sliding animation');
  await js('window.dispatchEvent(new PointerEvent("pointercancel",{pointerId:30}));board.render(real,{premove:null,premoves:[],inputState:null,inputMoves:null})');
  await js('var ownTarget=ChessLogic.fromFen("7k/8/8/8/8/8/PP6/7K b - - 0 1");board.render(ownTarget,{premove:{from:8,to:9}})');
  assert.strictEqual(await js('document.querySelectorAll(".pc.premove-hidden").length'), 1, 'Potential recapture onto own occupied square hides its current occupant');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await js('board.render(ownTarget,{premove:null});board.render(ownTarget,{premove:{from:8,to:9}})');
  assert.strictEqual(await js('!document.querySelector(".pc.premove-piece")._fisherMotion'), true, 'Reduced motion keeps stable preview without animation');
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  await js('board.render(ownTarget,{premove:null,inputState:Object.assign({},ownTarget,{turn:"w"}),inputMoves:[{from:8,to:9}],interactive:true});moves=[]');
  await js('(function(){var b=document.getElementById("board"),r=b.getBoundingClientRect();[8,9].forEach(function(sq){var o={clientX:r.left+r.width*((sq&7)+.5)/8,clientY:r.top+r.height*(7-(sq>>3)+.5)/8,bubbles:true,isPrimary:true,pointerId:23};b.dispatchEvent(new PointerEvent("pointerdown",o));window.dispatchEvent(new PointerEvent("pointerup",o));});})()');
  assert.deepStrictEqual(await js('moves'), [[8, 9]], 'Explicit future inputMoves overrides current-position legality for potential recaptures');
  await js(`moves=[];board.render(ownTarget,{inputState:Object.assign({},ownTarget,{turn:"w"}),inputMoves:[{from:8,to:16}],interactive:true});var b=document.getElementById("board"),r=b.getBoundingClientRect(),dragOptions={clientX:r.left+r.width/16,clientY:r.top+r.height*6.5/8,bubbles:true,isPrimary:true,pointerId:25};b.dispatchEvent(new PointerEvent("pointerdown",dragOptions));window.dispatchEvent(new PointerEvent("pointermove",Object.assign({},dragOptions,{clientY:r.top+r.height*5.5/8})));var held=document.querySelector(".pc.dragging");var botReply=ChessLogic.apply(ownTarget,ChessLogic.legalMoves(ownTarget).filter(function(m){return ChessLogic.uci(m)==="h8g8";})[0]);board.render(botReply,{inputState:null,inputMoves:null})`);
  assert.strictEqual(await js('held.classList.contains("dragging") && held.isConnected'), true, 'Bot reply keeps the captured own-piece drag active');
  await js('window.dispatchEvent(new PointerEvent("pointerup",Object.assign({},dragOptions,{clientY:r.top+r.height*5.5/8})))');
  assert.deepStrictEqual(await js('moves'), [[8, 16]], 'Drag released after bot reply uses actual human-turn legality');
  await js(`moves=[];var threatened=ChessLogic.fromFen("r6k/8/8/8/8/8/P7/7K b - - 0 1");board.render(threatened,{inputState:Object.assign({},threatened,{turn:"w"}),inputMoves:[{from:8,to:16}]});b.dispatchEvent(new PointerEvent("pointerdown",dragOptions));var taken=ChessLogic.apply(threatened,ChessLogic.legalMoves(threatened).filter(function(m){return ChessLogic.uci(m)==="a8a2";})[0]);board.render(taken,{inputState:null,inputMoves:null});window.dispatchEvent(new PointerEvent("pointerup",Object.assign({},dragOptions,{clientY:r.top+r.height*5.5/8})))`);
  assert.deepStrictEqual(await js('[moves.length,document.querySelectorAll(".pc.dragging").length]'), [0, 0], 'Bot capturing dragged source cancels the gesture');
  await js('board.render(ownTarget,{inputState:null,inputMoves:null})');
  for (const orientation of ['w', 'b']) {
    for (const color of ['w', 'b']) {
      await js('moves=[];board.setOrientation(' + JSON.stringify(orientation) + ');board.render(ChessLogic.fromFen(' + JSON.stringify(color === 'w' ? '7k/P7/8/8/8/8/8/7K w - - 0 1' : '7k/8/8/8/8/8/p7/7K b - - 0 1') + '),{annotation:null})');
      const positions = await js('(function(){var r=document.getElementById("board").getBoundingClientRect();return {x:r.left,y:r.top};})()');
      const file = orientation === 'w' ? 0 : 7;
      const sourceRank = color === 'w' ? 6 : 1, targetRank = color === 'w' ? 7 : 0;
      for (const rank of [sourceRank, targetRank]) {
        const x = positions.x + (file + .5) * 40, y = positions.y + ((orientation === 'w' ? 7 - rank : rank) + .5) * 40;
        await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      assert.deepStrictEqual(await js('moves'), [[sourceRank * 8, targetRank * 8]], 'Tap promotion for ' + color + ' facing ' + orientation);
    }
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Runtime.enable', {});
  await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/index.html' });
  await sleep(500);
  await js('document.querySelector("[data-tab=analysis]").click();document.querySelector("[data-mode=live]").click()');
  async function touch(point) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  for (const color of ['w', 'b']) {
    for (const promo of ['q', 'r', 'b', 'n']) {
      const fen = color === 'w' ? '7k/P7/8/8/8/8/8/7K w - - 0 1' : '7k/8/8/8/8/8/p7/7K b - - 0 1';
      await js('document.getElementById("liveFen").click();document.getElementById("fenInput").value=' + JSON.stringify(fen) + ';document.getElementById("fenOk").click()');
      for (const row of color === 'w' ? [1, 0] : [6, 7]) {
        await touch(await js('(function(){var r=document.getElementById("liveBoard").getBoundingClientRect();return {x:r.left+r.width/16,y:r.top+r.height*' + (row + .5) + '/8};})()'));
      }
      assert.strictEqual(await js('!document.getElementById("modalRoot").classList.contains("hidden") && !!document.querySelector("[data-promo=q]")'), true, 'Tap destination keeps promotion modal open');
      await touch(await js('(function(){var r=document.querySelector("[data-promo=' + promo + ']").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()'));
      await sleep(60);
      assert.strictEqual(await js(`document.getElementById('modalRoot').classList.contains('hidden') && document.querySelector('#liveBoard .pc[data-sq="${color === 'w' ? 56 : 0}"] img').getAttribute('src') === 'pieces/${color + promo.toUpperCase()}.svg'`), true, 'Real touch commits ' + color + promo);
    }
  }
  await js('document.getElementById("liveFen").click()');
  await touch({ x: 4, y: 4 });
  assert.strictEqual(await js('document.getElementById("modalRoot").classList.contains("hidden")'), true, 'Fresh backdrop touch still dismisses modal');
  await js('document.getElementById("liveFen").click();document.querySelector("#modalBox [data-close]").click()');
  assert.strictEqual(await js('document.getElementById("modalRoot").classList.contains("hidden")'), true, 'Synthetic/keyboard close-button activation works');
  console.log('Board regression passed: premove preview/immutability/red target/cancel/no bounce/castling/promotion/occupied recapture/reduced motion/inputMoves/fast-bot drag; check geometry/aura/badges; full-app touch promotion and modal dismissal');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close(); if (browser) browser.kill();
  if (server) { server.closeAllConnections(); server.close(); }
  await sleep(300); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
});
