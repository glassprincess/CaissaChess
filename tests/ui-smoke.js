'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const assert = require('assert');
const {spawn} = require('child_process');
const Chess = require('../assets/web/chess.js');
const root = path.join(__dirname, '../assets/web');
const browser = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fisher-ui-'));
let failEngine = false, proc, socket, server, count = 0, searchRequests = 0;
let botLine = [];
let replyDelay = 30;
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function run() {
  server = http.createServer((req,res) => {
    if (req.method === 'POST') {
      let body=''; req.on('data', c=>body+=c); req.on('end', ()=> {
        res.setHeader('Content-Type','application/json');
        if (req.url !== '/search') return res.end('{"ok":true}');
        searchRequests++;
        if (failEngine) {res.statusCode=500; return res.end('{"error":"test failure"}');}
        const opts=JSON.parse(body); const moves=Chess.legalMoves(Chess.fromFen(opts.fen));
        let best=moves.length ? Chess.uci(moves[0]) : '';let value=30;
        if(opts.skill===3 && botLine.length)best=botLine.shift();
        if(opts.fen==='k7/8/1QK5/8/8/8/8/8 w - - 0 1'){best='b6b7';value=1000;}
        setTimeout(()=>res.end(JSON.stringify({ok:true,bestmove:best,lines:best ? [{multipv:1,depth:14,score:{type:'cp',value:value},pv:[best]}] : []})), replyDelay);
      }); return;
    }
    const file=path.join(root, req.url === '/' ? 'index.html' : req.url);
    fs.readFile(file,(err,data)=>{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':'text/html');res.statusCode=err?404:200;res.end(err?'missing':data);});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  proc=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=19365','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let tabs;
  for(let i=0;i<100;i++){try{tabs=await (await fetch('http://127.0.0.1:19365/json')).json();break;}catch(e){await sleep(100);}}
  if(!tabs) throw Error('Браузер не запустился');
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  let seq=0; const pending=new Map();
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
  function cdp(method,params){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
  async function js(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  async function click(id){await js(`document.getElementById(${JSON.stringify(id)}).click()`);await sleep(80);}
  async function newGame(){if(await js("!document.getElementById('playSetup').classList.contains('hidden')"))return;await click('playNew');if(await js("!!document.getElementById('confirmResign')")){await click('confirmResign');await until("!!document.getElementById('resultNew')");}if(await js("!!document.getElementById('resultNew')"))await click('resultNew');}
  async function playTap(from,to){await js(`(function(){var b=document.getElementById('playBoard'),r=b.getBoundingClientRect();function tap(s){var o={clientX:r.left+r.width*(s.charCodeAt(0)-97+.5)/8,clientY:r.top+r.height*(8-Number(s[1])+.5)/8,bubbles:true,isPrimary:true};b.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',o));}tap(${JSON.stringify(from)});tap(${JSON.stringify(to)});})()`);}
  async function screenshot(name){if(!process.env.SCREENSHOT_DIR)return;fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});const shot=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SCREENSHOT_DIR,name),Buffer.from(shot.data,'base64'));}
  async function until(expression){for(let i=0;i<100;i++){if(await js(expression))return;await sleep(40);}throw Error('Timeout: '+expression);}
  async function test(name,fn){try{await fn();console.log('ok   '+name);count++;}catch(e){console.error('FAIL '+name+'\n'+e.message);process.exitCode=1;}finally{failEngine=false;}}
  await cdp('Runtime.enable',{});
  await cdp('Page.enable',{});
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'onLine',{get:function(){return !!window.__online;}});"});
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  await sleep(600);
  await js("document.getElementById('playTime').value='0:0'");
  await test('глубина выбирается до запуска PGN',async()=>{
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="pgn"]').click()`);
    assert.ok(await js(`document.getElementById('pgnDepth').getBoundingClientRect().height > 0`));
  });
  await test('перетаскивание следует за указателем',async()=>{
    await js(`document.querySelector('[data-mode="live"]').click()`);
    const transform=await js(`(function(){var b=document.getElementById('liveBoard'),r=b.getBoundingClientRect();b.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+r.width*4.5/8,clientY:r.top+r.height*6.5/8,bubbles:true,isPrimary:true}));window.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+r.width*5.5/8,clientY:r.top+r.height*6.5/8}));var pc=b.querySelector('.dragging').getBoundingClientRect();return {left:pc.left,expected:r.left+r.width*5/8};})()`);
    assert.ok(Math.abs(transform.left-transform.expected)<1,JSON.stringify(transform));
    await js(`window.dispatchEvent(new PointerEvent('pointercancel'))`);
  });
  await test('ошибка FEN оставляет ввод открытым',async()=>{
    await click('liveFen');await js(`document.getElementById('fenInput').value='broken'`);await click('fenOk');
    assert.ok(await js(`!document.getElementById('modalRoot').classList.contains('hidden')`));
    await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,isPrimary:true}))`);
  });
  await test('повторные уведомления не остаются поверх экрана',async()=>{
    await click('liveFen');await js(`document.getElementById('fenInput').value='bad'`);await click('fenOk');await click('fenOk');
    assert.strictEqual(await js("document.querySelectorAll('.toast').length"),1);
    await js('window.FisherBack()');
  });
  await test('после мата полоса показывает #',async()=>{
    await click('liveFen');await js(`document.getElementById('fenInput').value='7k/6Q1/5K2/8/8/8/8/8 b - - 0 1'`);await click('fenOk');await sleep(150);
    assert.strictEqual(await js(`document.querySelector('#liveEval .evalnum').textContent`),'#');
    assert.strictEqual(await js(`document.querySelector('#liveEval .fill').style.height`),'100%');
  });
  await test('ошибка движка даёт повтор хода',async()=>{
    await js(`document.querySelector('[data-tab="play"]').click();document.querySelector('[data-color="b"]').click()`);
    failEngine=true;await click('startGame');await sleep(150);
    assert.ok(await js(`document.getElementById('playRetry') && !document.getElementById('playRetry').classList.contains('hidden')`));
    failEngine=false;await click('playRetry');await sleep(150);
    assert.ok((await js(`document.getElementById('playStatus').textContent`)).includes('Ваш ход'));
  });
  await test('откат после сбоя не отдаёт ход человека движку',async()=>{
    await newGame();await click('startGame');failEngine=true;
    await js(`(function(){var b=document.getElementById('playBoard'),r=b.getBoundingClientRect();function tap(file,rank){var opts={clientX:r.left+r.width*(file+0.5)/8,clientY:r.top+r.height*(7-rank+0.5)/8,bubbles:true,isPrimary:true};b.dispatchEvent(new PointerEvent('pointerdown',opts));window.dispatchEvent(new PointerEvent('pointerup',opts));}tap(4,1);tap(4,3);})()`);
    await sleep(150);await click('playUndo');
    assert.ok(await js("document.getElementById('playRetry').classList.contains('hidden')"));
    failEngine=false;await click('playRetry');await sleep(100);
    assert.strictEqual(await js("document.querySelectorAll('#playMoves .mv').length"),0);
    assert.ok((await js("document.getElementById('playStatus').textContent")).includes('Ваш ход'));
  });
  await test('PGN: выбранная глубина и результат партии',async()=>{
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="pgn"]').click();document.querySelector('#pgnDepth [data-depth="18"]').click();document.getElementById('pgnText').value='1. e4 e5 1/2-1/2';document.getElementById('pgnParse').click()`);
    await sleep(300);
    assert.ok((await js("document.getElementById('pgnResultTitle').textContent")).includes('1/2-1/2'));
    assert.ok((await js("document.getElementById('pgnResultSub').textContent")).includes('18'));
  });
  await test('PGN: сбой прерывает разбор без ложного результата',async()=>{
    await click('pgnNew');failEngine=true;
    await js(`document.getElementById('pgnText').value='1. d4 d5 *';document.getElementById('pgnParse').click()`);await sleep(150);failEngine=false;
    assert.ok(await js("!document.getElementById('pgnImport').classList.contains('hidden')"));
    assert.ok((await js("document.getElementById('pgnErrors').textContent")).includes('прерван'));
    await js(`document.querySelector('[data-tab="play"]').click()`);
  });
  await test('пат из выигранной позиции снижает точность',async()=>{
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="pgn"]').click();document.getElementById('pgnText').value='[FEN "k7/8/1QK5/8/8/8/8/8 w - - 0 1"]\\n\\n1. Qc7 1/2-1/2';document.getElementById('pgnParse').click()`);
    await sleep(250);
    assert.ok((await js("document.getElementById('pgnChips').textContent")).includes('Упущенный шанс'));
    await js(`document.querySelector('[data-tab="play"]').click()`);
  });
  await test('узкий экран без горизонтальной прокрутки',async()=>{
    await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:640,deviceScaleFactor:1,mobile:true});
    assert.ok(await js('document.documentElement.scrollWidth <= window.innerWidth'));
  });
  await test('ландшафт: подписи игроков не перекрывают доску',async()=>{
    await cdp('Emulation.setDeviceMetricsOverride',{width:900,height:500,deviceScaleFactor:1,mobile:false});
    assert.ok(await js("(function(){var t=document.getElementById('playTop').getBoundingClientRect(),b=document.getElementById('playBoard').getBoundingClientRect();return t.bottom <= b.top || t.left >= b.right || t.right <= b.left || t.top >= b.bottom;})()"));
  });
  await test('Назад закрывает диалог и карточку дебюта',async()=>{
    await click('settingsBtn');assert.strictEqual(await js('window.FisherBack()'),true);
    assert.ok(await js("document.getElementById('modalRoot').classList.contains('hidden')"));
    await js(`document.querySelector('[data-tab="openings"]').click();document.querySelector('.opening-card').click()`);
    assert.strictEqual(await js('window.FisherBack()'),true);
    assert.ok(await js("!document.getElementById('openingListView').classList.contains('hidden')"));
  });
  await test('расчёт не обрывает перетаскивание и не пересоздаёт фигуру',async()=>{
    assert.ok(await js(`(function(){var host=document.createElement('div');host.style.width='320px';document.body.appendChild(host);var st=ChessLogic.startState(),b=FisherBoard.create(host,{});b.render(st);var r=host.getBoundingClientRect(),opts={clientX:r.left+r.width*4.5/8,clientY:r.top+r.height*6.5/8,bubbles:true,isPrimary:true};host.dispatchEvent(new PointerEvent('pointerdown',opts));var piece=host.querySelector('.dragging');b.render(st,{arrow:'e2e4'});var stable=piece===host.querySelector('.dragging')&&piece.isConnected;window.dispatchEvent(new PointerEvent('pointercancel'));host.remove();return stable;})()`));
  });
  await test('бейдж хода и цвет клетки используют готовые SVG',async()=>{
    assert.ok(await js(`(function(){var host=document.createElement('div');document.body.appendChild(host);var st=ChessLogic.startState(),mv=ChessLogic.legalMoves(st).filter(function(m){return ChessLogic.uci(m)==='e2e4';})[0];var b=FisherBoard.create(host,{});b.render(ChessLogic.apply(st,mv),{lastMove:'e2e4',annotation:{move:'e2e4',key:'brilliant',file:'brilliant.svg',color:'#1bada6',label:'Блестящий ход',animate:true}});var mark=host.querySelector('.move-badge img'),sq=host.querySelector('.sq[data-sq="28"]');var ok=mark&&mark.getAttribute('src')==='analysis-icons/brilliant.svg'&&sq.style.getPropertyValue('--review-tint')==='rgba(27, 173, 166, 0.26)'&&mark.classList.contains('brilliant-enter');host.remove();return !!ok;})()`));
  });
  await test('стрелки выключаются в PGN и настройка сохраняется',async()=>{
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="pgn"]').click();document.getElementById('pgnText').value='1. e4 e5 *';document.getElementById('pgnParse').click()`);await sleep(250);await click('pgnFirst');
    await click('settingsBtn');await js(`document.getElementById('setArrow').checked=false`);await click('setSave');
    assert.strictEqual(await js(`document.querySelector('#pgnBoard .arrow-layer').children.length`),0);
    assert.strictEqual(await js(`JSON.parse(localStorage.getItem('fisher.settings')).showArrow`),false);
  });
  await test('быстрый откат и возврат находятся прямо под живой доской',async()=>{
    await js(`document.querySelector('[data-mode="live"]').click()`);await click('liveReset');
    await js(`(function(){var b=document.getElementById('liveBoard'),r=b.getBoundingClientRect();function tap(f,k){var o={clientX:r.left+r.width*(f+.5)/8,clientY:r.top+r.height*(7-k+.5)/8,bubbles:true,isPrimary:true};b.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',o));}tap(4,1);tap(4,3);})()`);
    await click('liveUndo');assert.strictEqual(await js(`document.querySelectorAll('#liveMoves .mv').length`),1);assert.strictEqual(await js(`document.getElementById('livePosition').textContent`),'0 / 1');
    assert.ok(await js(`document.getElementById('liveRedo')&&!document.getElementById('liveRedo').disabled`));await click('liveRedo');
    assert.strictEqual(await js(`document.querySelectorAll('#liveMoves .mv').length`),1);
    const gap=await js(`(function(){var b=document.getElementById('liveBoard').getBoundingClientRect(),u=document.getElementById('liveUndo').getBoundingClientRect();return {boardBottom:b.bottom,undoTop:u.top,gap:u.top-b.bottom};})()`);assert.ok(gap.gap>=0&&gap.gap<20,JSON.stringify(gap));
  });
  await test('вариант дебюта открывается у развилки, не в конце',async()=>{
    await js(`document.querySelector('[data-tab="openings"]').click();document.querySelector('.opening-card').click();document.querySelector('[data-vi="1"]').click()`);
    const step=await js(`document.getElementById('openingStep').textContent`);const parts=step.match(/(\d+)\s*\/\s*(\d+)/);assert.ok(parts&&Number(parts[1])<Number(parts[2]),step);
    assert.ok(await js(`document.getElementById('openingVariantSelect')&&document.getElementById('openingExplain').textContent.length>20`));
  });
  await test('настоящий touch сохраняет захват во время расчёта',async()=>{
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="live"]').click()`);await click('liveReset');
    const r=await js(`(function(){var r=document.getElementById('liveBoard').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);
    const from={x:r.x+r.w*4.5/8,y:r.y+r.h*6.5/8,id:1};
    const to={x:from.x,y:r.y+r.h*4.5/8,id:1};
    await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
    await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[to]});await sleep(120);
    assert.strictEqual(await js(`document.querySelectorAll('#liveBoard .dragging').length`),1);
    await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await until(`document.querySelectorAll('#liveMoves .mv').length===1`);
    assert.ok((await js(`document.getElementById('liveMoves').textContent`)).includes('e4'));
  });
  await test('блестящий ход раскрывается и сворачивается один раз',async()=>{
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    const result=await js(`(function(){var host=document.createElement('div');host.style.cssText='position:fixed;top:0;left:0;width:320px;z-index:500';document.body.appendChild(host);var st=ChessLogic.startState(),mv=ChessLogic.legalMoves(st).filter(function(m){return ChessLogic.uci(m)==='e2e4';})[0],after=ChessLogic.apply(st,mv),b=FisherBoard.create(host,{}),o={lastMove:'e2e4',annotation:{move:'e2e4',key:'brilliant',file:'brilliant.svg',color:'#1bada6',label:'Блестящий ход',animate:true}};b.render(after,o);var icon=host.querySelector('.move-badge img'),cell=host.getBoundingClientRect().width/8,anim=icon.getAnimations()[0];anim.pause();anim.currentTime=450;var large=icon.getBoundingClientRect().width;b.render(after,o);var stable=icon===host.querySelector('.move-badge img')&&anim===icon.getAnimations()[0];anim.currentTime=1100;var small=icon.getBoundingClientRect().width;host.remove();return {large:large/cell,small:small/cell,stable:stable};})()`);
    assert.ok(result.large>.85&&result.small>.36&&result.small<.40&&result.stable,JSON.stringify(result));
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.strictEqual(await js(`(function(){var n=document.createElement('img');n.className='brilliant-enter';var h=document.createElement('div');h.className='move-badge';h.appendChild(n);document.body.appendChild(h);var v=getComputedStyle(n).animationName;h.remove();return v;})()`),'none');
    await cdp('Emulation.setEmulatedMedia',{features:[]});
  });
  await test('во время игры нет оценок ходов, отмена сохраняет рабочую доску',async()=>{
    await js(`document.querySelector('[data-tab="play"]').click()`);await newGame();await click('startGame');
    async function move(file){await js(`(function(){var b=document.getElementById('playBoard'),r=b.getBoundingClientRect();function tap(k){var o={clientX:r.left+r.width*(${file}+.5)/8,clientY:r.top+r.height*(7-k+.5)/8,bubbles:true,isPrimary:true};b.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',o));}tap(1);tap(3);})()`);}
    await move(4);await until(`document.querySelectorAll('#playMoves .mv').length===2&&document.querySelector('#playBoard .move-badge img')===null`);
    await click('playUndo');assert.strictEqual(await js(`document.querySelectorAll('#playMoves .mv').length`),0);
    await move(3);await until(`document.querySelectorAll('#playMoves .mv').length===2&&document.querySelector('#playBoard .move-badge img')===null`);
  });
  await test('принятый ферзевый гамбит находится по русскому запросу',async()=>{
    await js(`document.querySelector('[data-tab="openings"]').click();document.getElementById('openingBack').click();document.getElementById('openingSearch').value='принятый ферзевый гамбит';document.getElementById('openingSearch').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.opening-card').click();var s=document.getElementById('openingVariantSelect');s.value=Array.from(s.options).filter(function(o){return o.textContent.indexOf('Принятый ферзевый гамбит: Classical')>=0;})[0].value;s.dispatchEvent(new Event('change',{bubbles:true}));`);
    await click('openingNext');
    assert.ok((await js(`document.getElementById('openingExplain').textContent`)).includes('принимают ферзевый гамбит'));
    assert.ok((await js(`document.getElementById('openingCurrentMove').textContent`)).includes('dxc4'));
  });
  await test('после выбора тапом фигуру можно сразу перетащить',async()=>{
    assert.ok(await js(`(function(){var host=document.createElement('div');host.style.width='320px';document.body.appendChild(host);var moved=false,b=FisherBoard.create(host,{onMove:function(from,to){moved=from===12&&to===28;}});b.render(ChessLogic.startState());var r=host.getBoundingClientRect(),from={clientX:r.left+r.width*4.5/8,clientY:r.top+r.height*6.5/8,bubbles:true,isPrimary:true},to={clientX:from.clientX,clientY:r.top+r.height*4.5/8,bubbles:true,isPrimary:true};host.dispatchEvent(new PointerEvent('pointerdown',from));window.dispatchEvent(new PointerEvent('pointerup',from));host.dispatchEvent(new PointerEvent('pointerdown',from));window.dispatchEvent(new PointerEvent('pointermove',to));window.dispatchEvent(new PointerEvent('pointerup',to));host.remove();return moved;})()`));
  });
  await test('альбомная панель шагов видна над нижней навигацией',async()=>{
    await cdp('Emulation.setDeviceMetricsOverride',{width:900,height:500,deviceScaleFactor:1,mobile:false});
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="live"]').click()`);
    const r=await js(`({bottom:document.getElementById('liveQuickTools').getBoundingClientRect().bottom,nav:document.getElementById('tabbar').getBoundingClientRect().top})`);
    assert.ok(r.bottom<=r.nav,JSON.stringify(r));
    await js(`document.querySelector('[data-mode="pgn"]').click()`);
    const pg=await js(`({bottom:document.querySelector('#pgnResult .board-tools').getBoundingClientRect().bottom,nav:document.getElementById('tabbar').getBoundingClientRect().top})`);assert.ok(pg.bottom<=pg.nav,JSON.stringify(pg));
    await js(`document.querySelector('[data-tab="openings"]').click()`);
    const op=await js(`({bottom:document.querySelector('#openingDetailView .board-tools').getBoundingClientRect().bottom,nav:document.getElementById('tabbar').getBoundingClientRect().top})`);assert.ok(op.bottom<=op.nav,JSON.stringify(op));
  });
  await test('обычный ход плавно переносит ту же фигуру',async()=>{
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    assert.ok(await js(`(function(){var host=document.createElement('div');host.style.cssText='position:fixed;top:0;left:0;width:320px';document.body.appendChild(host);var st=ChessLogic.startState(),b=FisherBoard.create(host,{});b.render(st);var pawn=host.querySelector('.pc[data-sq="12"]'),start=pawn.getBoundingClientRect().top,m=ChessLogic.legalMoves(st).filter(function(m){return ChessLogic.uci(m)==='e2e4';})[0];b.render(ChessLogic.apply(st,m),{lastMove:'e2e4'});var next=host.querySelector('.pc[data-sq="28"]'),an=next.getAnimations()[0];if(!an){host.remove();return false;}an.pause();an.currentTime=90;var middle=next.getBoundingClientRect().top;an.currentTime=200;var end=next.getBoundingClientRect().top;var good=pawn===next&&start>middle&&middle>end;host.remove();return good;})()`));
  });
  await test('шах подсвечивает ауру именно у короля',async()=>{
    assert.ok(await js(`(function(){var host=document.createElement('div');document.body.appendChild(host);var b=FisherBoard.create(host,{});b.render(ChessLogic.fromFen('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1'));var aura=host.querySelector('.king-aura[data-sq="60"]'),square=host.querySelector('.sq[data-sq="60"]');var ok=aura&&getComputedStyle(square).backgroundImage==='none';host.remove();return !!ok;})()`));
  });
  await test('стрелки игры просматривают историю и сохраняют все ходы',async()=>{
    await js(`document.querySelector('[data-tab="play"]').click()`);
    const before=await js(`document.getElementById('playMoves').textContent`);
    await click('playPrev');assert.ok(await js(`!document.getElementById('playReturn').classList.contains('hidden')`));
    assert.ok(await js(`document.getElementById('playUndo').disabled&&document.getElementById('playHint').disabled`));
    assert.strictEqual(await js(`document.getElementById('playMoves').textContent`),before);
    assert.ok(await js(`document.getElementById('playTimeline').getBoundingClientRect().bottom<=document.getElementById('tabbar').getBoundingClientRect().top`));
    await click('playLast');assert.ok(await js(`document.getElementById('playReturn').classList.contains('hidden')`));
    assert.strictEqual(await js(`document.getElementById('playMoves').textContent`),before);
  });
  await test('партия Хикару: раздельные 37/36 ходов и повтор без новых поисков',async()=>{
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="pgn"]').click()`);await click('pgnNew');
    const fixture=fs.readFileSync(path.join(__dirname,'fixtures/hikaru-mortimer-2018.pgn'),'utf8');
    await js(`document.querySelector('#pgnDepth [data-depth="14"]').click();document.getElementById('pgnText').value=${JSON.stringify(fixture)};document.getElementById('pgnParse').click()`);
    await until(`!document.getElementById('pgnResult').classList.contains('hidden')&&document.getElementById('pgnResultTitle').textContent.includes('Hikaru')`);
    assert.ok((await js(`document.getElementById('pgnCountsTitle').textContent`)).includes('37'));
    assert.strictEqual(await js(`Array.from(document.querySelectorAll('#pgnChips .chip b')).reduce(function(n,e){return n+Number(e.textContent);},0)`),37);
    await js(`document.querySelector('#pgnSides [data-side="b"]').click()`);assert.ok((await js(`document.getElementById('pgnCountsTitle').textContent`)).includes('36'));
    await until(`!document.getElementById('pgnDeepen').disabled`);
    const warm=searchRequests;await click('pgnNew');await js(`document.getElementById('pgnParse').click()`);
    await until(`!document.getElementById('pgnResult').classList.contains('hidden')`);
    assert.strictEqual(searchRequests,warm,'повторный разбор использует оценки той же партии');
    assert.ok(!(await js(`document.getElementById('pgnChips').textContent`)).includes('Оценка движка'));
  });
  await test('мат и ничья используют архивные значки и оригинальный звук окончания',async()=>{
    await js(`window.__sounds=[];window.__originalSound=CaissaSounds.play;CaissaSounds.play=function(name){window.__sounds.push(name);return window.__originalSound.apply(this,arguments);};`);
    await js(`document.querySelector('[data-mode="live"]').click()`);
    async function fen(text){await click('liveFen');await js(`document.getElementById('fenInput').value=${JSON.stringify(text)}`);await click('fenOk');}
    async function move(from,to){await js(`(function(){var b=document.getElementById('liveBoard'),r=b.getBoundingClientRect();function tap(s){var f=s.charCodeAt(0)-97,k=Number(s[1])-1,o={clientX:r.left+r.width*(f+.5)/8,clientY:r.top+r.height*(7-k+.5)/8,bubbles:true,isPrimary:true};b.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',o));}tap(${JSON.stringify(from)});tap(${JSON.stringify(to)});})()`);}
    await fen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');await move('a1','a8');await sleep(650);
    assert.ok((await js(`document.getElementById('liveExplain').textContent`)).includes('Мат'));
    assert.ok(await js(`document.querySelector('#liveBoard .move-badge img[src="analysis-icons/mate.svg"].brilliant-enter')!==null`));
    assert.ok(await js(`window.__sounds.indexOf('game-end')>=0`));
    await js(`window.__sounds=[]`);await fen('8/7k/8/8/8/2n5/1B6/K7 w - - 0 1');await move('b2','c3');await sleep(500);
    assert.ok((await js(`document.getElementById('liveExplain').textContent`)).includes('Ничья'));
    assert.ok(await js(`document.querySelector('#liveBoard .move-badge img[src="analysis-icons/draw_white.svg"].brilliant-enter')!==null`));
    assert.ok(await js(`window.__sounds.indexOf('game-end')>=0`));
  });
  await test('Lichess запрашивается по кнопке и продолжение остаётся доступным из кеша',async()=>{
    await js(`window.__online=true;window.__explorerCalls=0;window.__realFetch=window.fetch;window.fetch=function(url,opts){if(String(url).indexOf('https://explorer.lichess.ovh/')===0){window.__explorerCalls++;return Promise.resolve(new Response(JSON.stringify({white:70,draws:20,black:10,moves:[{uci:'e2e4',white:70,draws:20,black:10}]}),{status:200,headers:{'Content-Type':'application/json'}}));}return window.__realFetch(url,opts);};document.querySelector('[data-tab="openings"]').click();document.getElementById('openingBack').click();document.getElementById('openingSearch').value='';document.getElementById('openingSearch').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.opening-card').click()`);
    assert.strictEqual(await js(`window.__explorerCalls`),0);
    await click('explorerLoad');await until(`document.querySelectorAll('#explorerMoves [data-uci]').length===1`);
    await js(`document.querySelector('#explorerMoves [data-uci]').click()`);await until(`window.__explorerCalls===2`);
    assert.ok((await js(`document.getElementById('openingCurrentMove').textContent`)).includes('e4'));
    await click('openingFirst');await click('explorerLoad');await until(`document.querySelectorAll('#explorerMoves [data-uci]').length===1`);
    assert.strictEqual(await js(`window.__explorerCalls`),2);await js(`window.fetch=window.__realFetch;window.__online=false`);
  });
  await test('Caissa: рейтинги, время и отсутствие переключателя стрелок в игре',async()=>{
    assert.strictEqual(await js(`document.title`),'Caissa');
    assert.ok(await js(`getComputedStyle(document.querySelector('.brand'),'::before').maskImage.includes('caissa-queen.svg')`));
    assert.deepStrictEqual(await js(`Array.from(document.querySelectorAll('#levelSeg button')).map(function(b){return Number(b.dataset.level);})`),[250,500,800,1200,1800,2250,2800,4000]);
    assert.strictEqual(await js(`document.getElementById('playArrows')`),null);
    assert.ok(await js(`document.querySelector('#playTime option[value="3:2"]')!==null`));
  });
  await test('подсказка рисует стрелку при выключенных стрелках анализа и не ослабляет движок',async()=>{
    await js(`document.querySelector('[data-tab="play"]').click()`);await newGame();
    await js(`document.querySelector('#levelSeg [data-level="250"]').click()`);await click('startGame');
    await click('settingsBtn');await js(`document.getElementById('setArrow').checked=false;document.getElementById('setVolume').value='95';document.getElementById('setVolume').dispatchEvent(new Event('input'))`);
    assert.strictEqual(await js(`document.getElementById('volumeValue').textContent`),'95%');await click('setSave');
    await js(`window.__searchOpts=[];window.__savedFetch=window.fetch;window.fetch=function(url,opts){if(url==='/search'){window.__searchOpts.push(JSON.parse(opts.body));return new Promise(function(resolve){setTimeout(function(){resolve(window.__savedFetch(url,opts));},180);});}return window.__savedFetch(url,opts);};for(var i=0;i<5;i++)document.getElementById('playHint').click();`);
    assert.ok(await js(`document.getElementById('playHint').disabled`));
    await until(`document.querySelector('#playBoard .arrow-layer').children.length>0`);
    assert.strictEqual(await js(`window.__searchOpts.length`),1);
    assert.ok((await js(`document.getElementById('playStatus').textContent`)).includes('Лучший ход:'));
    assert.ok(await js(`window.__searchOpts.some(function(o){return o.skill===20&&o.elo===0&&o.depth===18;})`));
    assert.ok(await js(`getComputedStyle(document.querySelector('#playTop .dot.b')).backgroundColor==='rgb(23, 23, 23)'`));
    await js(`window.fetch=window.__savedFetch`);
  });
  await test('сдача завершает партию, предлагает разбор и показывает только личные итоги',async()=>{
    await click('playNew');assert.ok(await js(`document.getElementById('confirmResign')!==null`),'Сдача требует подтверждения');
    await click('confirmResign');await until(`document.getElementById('modalBox').textContent.includes('Вы проиграли')`);
    assert.ok(await js(`document.getElementById('resultReview')!==null`));
    await until(`document.getElementById('resultReport').textContent.includes('Ваша точность')`);
    assert.ok((await js(`document.getElementById('resultReport').textContent`)).includes('Для оценки Elo нужно хотя бы 6'));
    const requests=searchRequests;await sleep(150);assert.strictEqual(searchRequests,requests);
    await click('resultNew');assert.ok(await js(`!document.getElementById('playSetup').classList.contains('hidden')`));
  });
  await test('лицензии содержат автора и исходники Caissa',async()=>{
    await click('settingsBtn');assert.ok((await js(`document.getElementById('modalBox').textContent`)).includes('GlassPrincess'));
    assert.strictEqual(await js(`document.querySelector('#modalBox .source-link').href`),'https://github.com/glassprincess/CaissaChess');await click('showLicenses');await sleep(100);
    assert.ok((await js(`document.getElementById('modalBox').textContent`)).includes('GlassPrincess'));await js('window.FisherBack()');
  });
  await test('мат боту: окно победы, значок над своим королём и ровно двойная вибрация',async()=>{
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await js(`window.__haptics=[];window.AndroidEngine={vibrate:function(kind){window.__haptics.push(kind);}};document.querySelector('[data-tab="play"]').click();document.querySelector('#levelSeg [data-level="1200"]').click();document.getElementById('playTime').value='3:2'`);
    botLine=['e7e5','b8c6','g8f6'];await click('startGame');
    async function human(from,to){await js(`(function(){var b=document.getElementById('playBoard'),r=b.getBoundingClientRect();function tap(s){var o={clientX:r.left+r.width*(s.charCodeAt(0)-97+.5)/8,clientY:r.top+r.height*(8-Number(s[1])+.5)/8,bubbles:true,isPrimary:true};b.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',o));}tap(${JSON.stringify(from)});tap(${JSON.stringify(to)});})()`);}
    for(const [from,to,n] of [['e2','e4',2],['d1','h5',4],['f1','c4',6]]){await human(from,to);await until(`document.querySelectorAll('#playMoves .mv').length===${n}`);}
    const endedAt=Date.now();await human('h5','f7');assert.ok(await js(`document.getElementById('modalRoot').classList.contains('hidden')`));await until(`document.getElementById('modalBox').textContent.includes('Вы победили')`);assert.ok(Date.now()-endedAt>=1800,'Итог ждёт звук/вибрацию и 1.5 с');
    assert.ok(await js(`document.querySelector('#playBoard .move-badge img[src="analysis-icons/winner.svg"]')!==null`));
    assert.ok(await js(`document.querySelector('#playBoard .move-badge img[src="analysis-icons/mate.svg"]')!==null`));
    assert.deepStrictEqual(await js(`window.__haptics`),['mate']);
    await until(`document.getElementById('resultReport').textContent.includes('Ваша точность')`);
    if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});const shot=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SCREENSHOT_DIR,'victory-mobile.png'),Buffer.from(shot.data,'base64'));}
    const reviewedRequests=searchRequests;await click('resultReview');await until(`!document.getElementById('pgnResult').classList.contains('hidden')`);assert.strictEqual(searchRequests,reviewedRequests,'Готовый отчёт открывается без повторного поиска');
    await js(`document.querySelector('[data-tab="play"]').click()`);assert.ok(await js(`!document.getElementById('playReport').classList.contains('hidden')`));await click('playReport');assert.ok((await js(`document.getElementById('modalBox').textContent`)).includes('Вы победили'));await click('resultNew');
  });
  await test('часы учитывают время в фоне и завершают партию единожды',async()=>{
    await js(`window.__realNow=Date.now;window.__timeOffset=0;Date.now=function(){return window.__realNow()+window.__timeOffset;};document.getElementById('playTime').value='1:0'`);await click('startGame');
    await js(`window.__sounds=[];window.__timeOffset=51000;document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'))`);
    assert.strictEqual(await js(`window.__sounds.filter(function(name){return name==='tenseconds';}).length`),1);
    await js(`window.__timeOffset=61000;document.dispatchEvent(new Event('visibilitychange'))`);
    assert.ok(await js(`document.querySelector('#playBoard img[src="analysis-icons/clock_white.svg"]')!==null`));await until(`document.getElementById('modalBox').textContent.includes('Время вышло')`);
    assert.ok((await js(`document.getElementById('modalBox').textContent`)).includes('Вы проиграли'));
    const requests=searchRequests;await sleep(300);assert.strictEqual(searchRequests,requests);
    await js(`Date.now=window.__realNow`);await click('resultNew');
  });
  await test('шах вибрирует один раз, просмотр и переворот не повторяют вибрацию',async()=>{
    await js(`window.__haptics=[];document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="live"]').click()`);await click('liveFen');
    await js(`document.getElementById('fenInput').value='4k3/8/8/8/8/8/R7/4K3 w - - 0 1'`);await click('fenOk');
    await js(`(function(){var b=document.getElementById('liveBoard'),r=b.getBoundingClientRect();function tap(f,k){var o={clientX:r.left+r.width*(f+.5)/8,clientY:r.top+r.height*(7-k+.5)/8,bubbles:true,isPrimary:true};b.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',o));}tap(0,1);tap(4,1);})()`);
    assert.deepStrictEqual(await js(`window.__haptics`),['check']);await click('liveFlip');await click('liveUndo');await click('liveRedo');
    assert.deepStrictEqual(await js(`window.__haptics`),['check']);await click('liveFlip');
  });
  await test('главное меню: конь у названия, кнопка начала отделена от времени',async()=>{
    await js(`document.querySelector('[data-tab="play"]').click()`);await newGame();
    const spacing=await js(`(function(){var image=getComputedStyle(document.querySelector('.brand'),'::before'),brand=document.querySelector('.brand').getBoundingClientRect(),time=document.getElementById('playTime').getBoundingClientRect(),start=document.getElementById('startGame').getBoundingClientRect();return {gap:parseFloat(getComputedStyle(document.querySelector('.brand')).gap),imageWidth:parseFloat(image.width),imageHeight:parseFloat(image.height),align:getComputedStyle(document.querySelector('.brand')).alignItems,space:start.top-time.bottom};})()`);
    assert.ok(spacing.gap<=4&&spacing.imageWidth===28&&spacing.imageHeight===32&&spacing.align==='center'&&spacing.space>=16,JSON.stringify(spacing));await screenshot('setup-mobile.png');
  });
  await test('английский охватывает меню, настройки, дебюты, пояснения и ошибки',async()=>{
    await click('settingsBtn');await js(`document.getElementById('setLanguage').value='en'`);await click('setSave');
    assert.strictEqual(await js(`document.documentElement.lang`),'en');assert.ok(await js(`document.getElementById('startGame').textContent.includes('Start')`));
    async function noRussian(selector){const leftovers=await js(`(function(){var root=document.querySelector(${JSON.stringify(selector)}),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),out=[],n;while(n=walker.nextNode()){if(/[А-Яа-яЁё]/.test(n.nodeValue)&&n.parentElement.getClientRects().length&&getComputedStyle(n.parentElement).visibility!=='hidden')out.push(n.nodeValue.trim());}return out;})()`);assert.deepStrictEqual(leftovers,[],leftovers.join(' | '));}
    await noRussian('#screen-play');await click('settingsBtn');await noRussian('#modalBox');await screenshot('settings-en.png');
    const footer=await js(`(function(){var l=document.getElementById('showLicenses').getBoundingClientRect(),a=document.querySelector('.source-link').getBoundingClientRect(),box=document.getElementById('modalBox').getBoundingClientRect();return {center:l.left+l.width/2,box:box.left+box.width/2,order:a.top>=l.bottom};})()`);assert.ok(Math.abs(footer.center-footer.box)<2&&footer.order,JSON.stringify(footer));
    await click('showLicenses');await sleep(100);await noRussian('#modalBox');await js('window.FisherBack()');
    await js(`document.querySelector('[data-tab="openings"]').click();document.getElementById('openingBack').click();document.getElementById('openingSearch').value='';document.getElementById('openingSearch').dispatchEvent(new Event('input'));document.querySelector('.opening-card').click()`);await noRussian('#screen-openings');
    await click('openingNext');await noRussian('#screen-openings');assert.ok((await js(`document.getElementById('openingExplain').textContent`)).length>30);
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="live"]').click()`);await noRussian('#screen-analysis');
    await click('liveFen');await js(`document.getElementById('fenInput').value='invalid'`);await click('fenOk');await noRussian('#modalBox');await noRussian('body');await js('window.FisherBack()');
    await js(`document.querySelector('[data-tab="play"]').click()`);await click('startGame');await playTap('e2','e4');await until(`document.querySelectorAll('#playMoves .mv').length===2`);await noRussian('#screen-play');await screenshot('game-en.png');
    await click('playNew');await noRussian('#modalBox');await click('confirmResign');await until(`!!document.getElementById('resultNew')`);await noRussian('#modalBox');
    await until(`document.getElementById('resultReport').textContent.includes('accuracy')`);await noRussian('#modalBox');await click('resultReview');await noRussian('#pgnResult');
    assert.ok((await js(`document.getElementById('pgnResultTitle').textContent`)).includes('You'));
    await click('settingsBtn');await js(`document.getElementById('setLanguage').value='ru'`);await click('setSave');assert.strictEqual(await js(`document.documentElement.lang`),'ru');
    assert.ok((await js(`document.getElementById('pgnResultTitle').textContent`)).includes('Вы'));
  });
  await test('премув звучит, исполняется после бота и может быть отменён',async()=>{
    await js(`document.querySelector('[data-tab="play"]').click()`);await newGame();
    await js(`document.querySelector('#levelSeg [data-level="1200"]').click();window.__sounds=[]`);botLine=['e7e5','g8f6','b8c6'];replyDelay=600;await click('startGame');
    await playTap('e2','e4');await playTap('g1','f3');assert.ok(await js(`!document.getElementById('playCancelPremove').classList.contains('hidden')`));
    await sleep(230);
    const preview=await js(`(function(){var piece=document.querySelector('#playBoard .pc.premove-piece[data-sq="21"]'),square=document.querySelector('#playBoard .sq[data-sq="21"]'),p=piece&&piece.getBoundingClientRect(),r=square.getBoundingClientRect(),color=getComputedStyle(square).backgroundColor.match(/[0-9]+/g).map(Number);return {shown:!!p&&Math.abs(p.left-r.left)<1&&Math.abs(p.top-r.top)<1,red:square.classList.contains('premove-to')&&color[0]>color[1],moves:document.querySelectorAll('#playMoves .mv').length};})()`);
    assert.ok(preview.shown&&preview.red&&preview.moves===1,JSON.stringify(preview));
    await until(`document.querySelectorAll('#playMoves .mv').length===4`);assert.ok((await js(`document.getElementById('playMoves').textContent`)).includes('Nf3'));
    assert.ok(await js(`window.__sounds.indexOf('game-start')>=0&&window.__sounds.indexOf('premove')>=0`));
    await playTap('f1','c4');await playTap('b1','c3');await click('playCancelPremove');await until(`document.querySelectorAll('#playMoves .mv').length===6`);await sleep(100);
    assert.strictEqual(await js(`document.querySelectorAll('#playMoves .mv').length`),6);replyDelay=30;
  });
  await test('переход к ещё работающему отчёту продолжает тот же разбор',async()=>{
    replyDelay=400;await click('playNew');await click('confirmResign');
    assert.ok(await js(`document.getElementById('playReview').click();!document.getElementById('pgnRun').classList.contains('hidden')`));
    await until(`!document.getElementById('pgnResult').classList.contains('hidden')`);
    replyDelay=30;const requests=searchRequests;
    await js(`document.querySelector('[data-tab="play"]').click()`);await until(`!document.getElementById('playReport').classList.contains('hidden')`);await click('playReport');await click('resultReview');
    assert.strictEqual(searchRequests,requests,'Повторное открытие не запускает новые поиски');
  });
  await test('взятие играет capture.mp3, исходный файл декодируется браузером',async()=>{
    const duration=await js(`fetch('sounds/capture.mp3').then(function(r){return r.arrayBuffer();}).then(function(bytes){var ctx=new AudioContext();return ctx.decodeAudioData(bytes).then(function(buffer){var seconds=buffer.duration;return ctx.close().then(function(){return seconds;});});})`);assert.ok(duration>0&&duration<3);
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="live"]').click()`);await click('liveFen');await js(`document.getElementById('fenInput').value='7k/8/8/8/b7/8/8/R6K w - - 0 1'`);await click('fenOk');
    await js(`window.__sounds=[];(function(){var b=document.getElementById('liveBoard'),r=b.getBoundingClientRect();function tap(f,k){var o={clientX:r.left+r.width*(f+.5)/8,clientY:r.top+r.height*(7-k+.5)/8,bubbles:true,isPrimary:true};b.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',o));}tap(0,0);tap(0,3);})()`);
    assert.strictEqual(await js(`window.__sounds.filter(function(name){return name==='capture';}).length`),1);
  });
  await test('листание дебюта звучит вперёд и назад, расчёт не повторяет звук',async()=>{
    await js(`document.querySelector('[data-tab="openings"]').click();document.getElementById('openingBack').click();document.getElementById('openingSearch').value='принятый ферзевый гамбит';document.getElementById('openingSearch').dispatchEvent(new Event('input'));document.querySelector('.opening-card').click();var select=document.getElementById('openingVariantSelect');select.value=Array.from(select.options).filter(function(o){return o.textContent.indexOf('Принятый ферзевый гамбит: Classical')>=0;})[0].value;select.dispatchEvent(new Event('change'))`);await click('openingFirst');await js(`window.__sounds=[]`);
    for(let i=0;i<4;i++)await click('openingNext');
    assert.deepStrictEqual(await js(`window.__sounds`),['move','move','move','capture']);await click('openingPrev');
    assert.strictEqual(await js(`window.__sounds[4]`),'capture');const count=await js(`window.__sounds.length`);await sleep(450);assert.strictEqual(await js(`window.__sounds.length`),count);
    assert.strictEqual(await js(`document.querySelector('.brand img').getAttribute('src')`),'caissa-queen.svg');
  });
  await test('темы и фигуры сохраняются, отмена не применяет предпросмотр',async()=>{
    await click('settingsBtn');
    await js(`document.getElementById('setPieces').value='merida';document.getElementById('setPieces').dispatchEvent(new Event('change'));document.getElementById('setTheme').value='gruvbox'`);
    assert.ok(await js(`document.querySelector('#piecePreview img').getAttribute('src').includes('merida')`));
    const gap=await js(`document.getElementById('setSave').getBoundingClientRect().left-document.getElementById('settingsCancel').getBoundingClientRect().right`);assert.ok(gap>=16);
    await click('settingsCancel');assert.strictEqual(await js(`document.documentElement.dataset.theme`),'classic');
    await click('settingsBtn');await js(`document.getElementById('setTheme').value='catppuccin';document.getElementById('setPieces').value='chessnut'`);await click('setSave');
    assert.strictEqual(await js(`document.documentElement.dataset.theme`),'catppuccin');
    assert.ok(await js(`Array.from(document.querySelectorAll('#openingBoard .pc img')).every(function(img){return img.src.includes('chessnut');})`));
    await screenshot('catppuccin-mobile.png');
    await click('settingsBtn');assert.strictEqual(await js(`document.getElementById('setPieces').value`),'chessnut');
    await js(`document.getElementById('setTheme').value='classic';document.getElementById('setPieces').value='cburnett'`);await click('setSave');
  });
  await test('три подсказки помечают клетку и не восстанавливаются после отката',async()=>{
    await js(`document.querySelector('[data-tab="play"]').click()`);await newGame();
    await js(`document.getElementById('playTime').value='0:0'`);await click('startGame');
    for(let i=0;i<3;i++){await click('playHint');await until(`document.getElementById('playHint').textContent.includes('${2-i}/3')`);}
    assert.ok(await js(`document.getElementById('playHint').disabled`));
    assert.ok(await js(`document.querySelector('#playBoard .move-badge img[src="analysis-icons/best.svg"]')!==null&&document.querySelector('#playBoard .review-square')!==null`));
    await playTap('e2','e4');await until(`document.querySelectorAll('#playMoves .mv').length>=2`);
    assert.ok(await js(`document.querySelector('#playBoard .review-square')===null`));
    await click('playUndo');assert.ok(await js(`document.getElementById('playHint').disabled&&document.getElementById('playHint').textContent.includes('0/3')`));
  });
  await test('тренажёр загружает позиции, показывает решение и помещается на узком экране',async()=>{
    await js(`document.querySelector('[data-tab="training"]').click()`);
    await until(`!document.querySelector('[data-trainer="start"]').disabled`);
    await js(`document.querySelector('[data-trainer="start"]').click()`);
    await until(`document.querySelector('[data-trainer="feedback"]').textContent.includes('Найдите')`);
    assert.ok(await js(`document.querySelectorAll('#trainerRoot .pc').length>2`));
    await js(`document.querySelector('[data-trainer="solution"]').click()`);
    assert.ok(await js(`document.querySelector('[data-trainer="explanation"]').textContent.includes('Линия:')`));
    await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:720,deviceScaleFactor:1,mobile:true});
    assert.ok(await js(`document.documentElement.scrollWidth<=320`));
    await screenshot('training-mobile.png');
    await js(`document.querySelector('[data-tab="play"]').click()`);
  });
  if (process.env.SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await js(`document.querySelector('[data-tab="openings"]').click()`);
    await js('window.scrollTo(0,0)');
    let shot=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SCREENSHOT_DIR,'opening-mobile.png'),Buffer.from(shot.data,'base64'));
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="live"]').click();window.scrollTo(0,0)`);
    shot=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SCREENSHOT_DIR,'analysis-mobile.png'),Buffer.from(shot.data,'base64'));
    await cdp('Emulation.setDeviceMetricsOverride',{width:900,height:500,deviceScaleFactor:1,mobile:false});
    shot=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SCREENSHOT_DIR,'analysis-landscape.png'),Buffer.from(shot.data,'base64'));
  }
  if (process.env.SCREENSHOT) {
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="live"]').click()`);
    const shot=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.SCREENSHOT,Buffer.from(shot.data,'base64'));
  }
  assert.deepStrictEqual(errors,[]);
  console.log(count+' UI checks passed');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  if(socket)socket.close();if(proc)proc.kill();if(server)server.closeAllConnections();if(server)server.close();
  await sleep(300);try{fs.rmSync(profile,{recursive:true,force:true});}catch(e){}
});
