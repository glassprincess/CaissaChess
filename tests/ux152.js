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
let puzzleSubset=null;
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
    if(req.url==='/puzzles.json'&&puzzleSubset){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({puzzles:puzzleSubset}));}
    const file=path.join(root, req.url === '/' ? 'index.html' : req.url);
    fs.readFile(file,(err,data)=>{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':'text/html');res.statusCode=err?404:200;res.end(err?'missing':data);});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  proc=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=19379','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let tabs;
  for(let i=0;i<250;i++){try{tabs=await (await fetch('http://127.0.0.1:19379/json')).json();break;}catch(e){await sleep(100);}}
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
  async function until(expression){for(let i=0;i<250;i++){if(await js(expression))return;await sleep(40);}throw Error('Timeout: '+expression);}
  async function test(name,fn){try{await fn();console.log('ok   '+name);count++;}catch(e){console.error('FAIL '+name+'\n'+e.message);process.exitCode=1;}finally{failEngine=false;}}
  await cdp('Runtime.enable',{});
  await cdp('Page.enable',{});
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:"window.AndroidEngine={getAbi:function(){window.__abiReads=(window.__abiReads||0)+1;return 'arm64-v8a';},vibrate:function(kind){(window.__haptics||(window.__haptics=[])).push(kind);}};Object.defineProperty(navigator,'onLine',{get:function(){return !!window.__online;}});if(!localStorage.getItem('ux152.seeded')){localStorage.setItem('fisher.settings',JSON.stringify({level:3500,showArrow:true}));localStorage.setItem('ux152.seeded','1');}"});
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  await sleep(600);
  assert.strictEqual(await js(`window.__abiReads`),1,'native ABI is read at startup');
  await js("document.getElementById('playTime').value='0:0'");
  await test('arrows default off on upgrade and an explicit choice survives reload',async()=>{
    assert.ok(await js(`['liveArrow','pgnArrow','openingArrow'].every(function(id){return document.getElementById(id).getAttribute('aria-pressed')==='false';})`));
    assert.ok(await js(`document.querySelector('#levelSeg [data-level="4000"]').classList.contains('active')`));
    await click('settingsBtn');assert.ok(await js(`document.getElementById('setVibration').checked`));await js(`document.getElementById('setArrow').checked=true`);await click('setSave');
    await cdp('Page.reload',{});await sleep(650);assert.strictEqual(await js(`document.getElementById('liveArrow').getAttribute('aria-pressed')`),'true');
    await click('settingsBtn');await js(`document.getElementById('setArrow').checked=false`);await click('setSave');
    assert.deepStrictEqual(await js(`Array.from(document.querySelectorAll('#levelSeg [data-level]')).map(function(b){return Number(b.dataset.level);})`),[250,500,800,1200,1800,2250,2800,4000]);
  });
  await test('PGN is visible immediately and Paste reads browser or native clipboard without clearing on failure',async()=>{
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="pgn"]').click()`);
    assert.ok(await js(`document.getElementById('pgnText').getBoundingClientRect().height>0&&!document.getElementById('pgnParse').classList.contains('hidden')`));
    await js(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:function(){return Promise.resolve('1. e4 e5 *');}}});`);await click('pgnPasteBtn');
    assert.strictEqual(await js(`document.getElementById('pgnText').value`),'1. e4 e5 *');
    await js(`navigator.clipboard.readText=function(){return Promise.reject(Error('denied'));}`);await click('pgnPasteBtn');assert.strictEqual(await js(`document.getElementById('pgnText').value`),'1. e4 e5 *');
    await js(`window.AndroidEngine.pastePgn=function(){window.Files.onClipboardPgn('1. d4 d5 *');}`);await click('pgnPasteBtn');assert.strictEqual(await js(`document.getElementById('pgnText').value`),'1. d4 d5 *');
    await js(`delete window.AndroidEngine.pastePgn`);
  });
  await test('vibration setting gates actual checkmate effects',async()=>{
    await click('settingsBtn');await js(`document.getElementById('setVibration').checked=false`);await click('setSave');
    async function mate(number){
      await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="live"]').click()`);await click('liveFen');
      await js(`document.getElementById('fenInput').value='k7/8/1QK5/8/8/8/8/8 w - - 0 ${number}'`);await click('fenOk');
      await js(`(function(){var b=document.getElementById('liveBoard'),r=b.getBoundingClientRect();function tap(f,k){var o={clientX:r.left+r.width*(f+.5)/8,clientY:r.top+r.height*(7-k+.5)/8,bubbles:true,isPrimary:true};b.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',o));}tap(1,5);tap(1,6);})()`);await sleep(100);
    }
    await js(`window.__haptics=[]`);await mate(1);assert.deepStrictEqual(await js(`window.__haptics`),[]);
    await click('settingsBtn');await js(`document.getElementById('setVibration').checked=true`);await click('setSave');await mate(2);assert.deepStrictEqual(await js(`window.__haptics`),['mate']);
  });
  await test('confirmed opening theory keeps book badges while full-strength searches evaluate the position',async()=>{
    await js(`window.__openingRequests=[];window.__beforeOpeningFetch=window.fetch;window.fetch=function(url,opts){if(url==='/search')window.__openingRequests.push(JSON.parse(opts.body));return window.__beforeOpeningFetch(url,opts);};document.querySelector('[data-tab="openings"]').click();document.getElementById('openingSearch').value='Гроб';document.getElementById('openingSearch').dispatchEvent(new Event('input'));document.querySelector('.opening-card').click();`);await click('openingNext');
    await until(`document.querySelector('#openingBoard .move-badge img')!==null`);
    assert.ok(await js(`document.querySelector('#openingBoard .move-badge img[src="analysis-icons/book.svg"]')&&document.querySelector('#openingBoard .arrow-layer').children.length===0`));
    assert.ok(await js(`window.__openingRequests.filter(function(o){return o.skill===20&&o.elo===0&&o.multipv===3;}).length>=2`));
    await js(`window.fetch=window.__beforeOpeningFetch`);
  });
  await test('opening review animates brilliant and great grades and plays checkmate effects once per navigation',async()=>{
    await cdp('Page.reload',{});await sleep(650);
    await js(`document.querySelector('[data-tab="openings"]').click();document.getElementById('openingSearch').value='Гроб';document.getElementById('openingSearch').dispatchEvent(new Event('input'));document.querySelector('.opening-card').click()`);
    await js(`window.__grade=OpeningReview.grade;OpeningReview.grade=function(row){return Object.assign({},row,{key:'brilliant'});};document.getElementById('openingNext').click()`);
    assert.ok(await js(`!!document.querySelector('#openingBoard img.brilliant-enter[src="analysis-icons/brilliant.svg"]')`));
    await js(`OpeningReview.grade=function(row){return Object.assign({},row,{key:'great'});};document.getElementById('openingNext').click()`);
    assert.ok(await js(`!!document.querySelector('#openingBoard img.brilliant-enter[src="analysis-icons/great_find.svg"]')`));
    await js(`OpeningReview.grade=window.__grade;window.__sounds=[];window.__haptics=[];CaissaSounds.play=function(name){window.__sounds.push(name);return Promise.resolve();};document.getElementById('openingBack').click();document.getElementById('openingSearch').value='';document.getElementById('openingSearch').dispatchEvent(new Event('input'));document.querySelector('.opening-card[data-id="basic-mates"]').click();var t=document.getElementById('openingTimeline');t.value=t.max;t.dispatchEvent(new Event('input'))`);
    await until(`window.__sounds.indexOf('game-end')>=0`);
    assert.deepStrictEqual(await js(`window.__haptics`),['mate']);
    assert.ok(await js(`!!document.querySelector('#openingBoard img[src="analysis-icons/winner.svg"]')`));
    await sleep(800);assert.strictEqual(await js(`window.__sounds.filter(function(s){return s==='game-end';}).length`),1);
    await js(`document.getElementById('openingBack').click();document.getElementById('openingSearch').value='Гроб';document.getElementById('openingSearch').dispatchEvent(new Event('input'));document.querySelector('.opening-card').click()`);
  });
  await test('online continuations load automatically and an example game imports into analysis',async()=>{
    await js(String.raw`window.__online=true;window.__netCalls=0;window.__beforeExplorerFetch=window.fetch;window.fetch=function(url,opts){if(String(url).indexOf('https://explorer.lichess.ovh/masters?')===0){window.__netCalls++;return Promise.resolve({ok:true,status:200,headers:{get:function(){return null;}},json:function(){return Promise.resolve({white:1,draws:0,black:0,moves:[{uci:'a2a3',white:1,draws:0,black:0}],recentGames:[{id:'abcd1234',white:{name:'Alpha'},black:{name:'Beta'},year:2026}]});}});}if(String(url).indexOf('https://explorer.lichess.ovh/masters/pgn/abcd1234')===0)return Promise.resolve({ok:true,status:200,headers:{get:function(){return null;}},text:function(){return Promise.resolve('[Event "Online example"]\n[White "Alpha"]\n[Black "Beta"]\n1. e4 e5 2. Nf3 Nc6 *');}});return window.__beforeExplorerFetch(url,opts);};document.getElementById('openingBack').click();document.getElementById('openingSearch').value='';document.getElementById('openingSearch').dispatchEvent(new Event('input'));document.querySelector('.opening-card').click();`);
    await js(`window.dispatchEvent(new Event('online'))`);
    await until(`document.querySelector('[data-game="abcd1234"]')!==null`);assert.ok(await js(`window.__netCalls>0`));
    await js(`document.querySelector('[data-game="abcd1234"]').click()`);await until(`!document.getElementById('pgnResult').classList.contains('hidden')`);
    assert.ok(await js(`document.getElementById('pgnResultTitle').textContent.includes('Alpha')`));await js(`window.fetch=window.__beforeExplorerFetch;window.__online=false`);
  });
  await test('offline training traverses many puzzles in a selected rating range',async()=>{
    await js(`document.querySelector('[data-tab="training"]').click()`);await until(`!document.querySelector('[data-trainer="start"]').disabled`);
    await js(`document.querySelector('[data-trainer="rating"]').value='medium';document.querySelector('[data-trainer="start"]').click()`);
    const ids=[];
    for(let i=0;i<12;i++){await until(`document.querySelector('[data-trainer="feedback"]').textContent.includes('Найдите')`);ids.push(await js(`document.querySelector('[data-trainer="position"]').textContent`));if(i<11)await js(`document.querySelector('[data-trainer="skip"]').click()`);}
    assert.strictEqual(new Set(ids).size,12);await screenshot('trainer-offline.png');await js(`document.querySelector('[data-trainer="end"]').click()`);
  });
  await test('trainer checkmate plays end audio and king badges exactly once',async()=>{
    const C=Chess,P=require('../assets/web/pgn');
    const p=require('../assets/web/puzzles.json').puzzles.find(p=>{if(p.solution.length!==1)return false;let s=C.fromFen(p.fen);s=C.apply(s,C.legalMoves(s).find(m=>C.uci(m)===p.setup));return P.gameStatus(C.apply(s,C.legalMoves(s).find(m=>C.uci(m)===p.solution[0])))==='mate';});assert(p);
    puzzleSubset=[p];await js(`localStorage.removeItem('caissa.trainer.puzzles.v1');localStorage.removeItem('caissa.trainer.recent.v1')`);await cdp('Page.reload',{});await sleep(650);
    await js(`window.__sounds=[];window.__haptics=[];CaissaSounds.play=function(name){window.__sounds.push(name);return Promise.resolve();};document.querySelector('[data-tab="training"]').click()`);await until(`!document.querySelector('[data-trainer="start"]').disabled`);await js(`document.querySelector('[data-trainer="start"]').click()`);await until(`document.querySelector('[data-trainer="feedback"]').textContent.includes('Найдите')`);
    let st=C.fromFen(p.fen);st=C.apply(st,C.legalMoves(st).find(m=>C.uci(m)===p.setup));
    await js(`(function(){var b=document.querySelector('[data-trainer="board"]'),r=b.getBoundingClientRect(),black=${st.turn==='b'};function tap(s){var f=s.charCodeAt(0)-97,k=Number(s[1])-1,o={clientX:r.left+r.width*((black?7-f:f)+.5)/8,clientY:r.top+r.height*((black?k:7-k)+.5)/8,bubbles:true,isPrimary:true};b.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',o));}tap('${p.solution[0].slice(0,2)}');tap('${p.solution[0].slice(2,4)}');})()`);
    await until(`window.__sounds.indexOf('game-end')>=0`);assert.ok(await js(`document.querySelector('#trainerRoot img[src="analysis-icons/mate.svg"]')!==null&&document.querySelector('#trainerRoot img[src="analysis-icons/winner.svg"]')!==null`));
    assert.deepStrictEqual(await js(`window.__haptics`),['mate']);await screenshot('trainer-mate.png');await js(`document.querySelector('[data-trainer="back"]').click();document.querySelector('[data-trainer="current"]').click()`);assert.strictEqual(await js(`window.__sounds.filter(function(s){return s==='game-end';}).length`),1);
  });
  await test('trainer promotion uses the shared piece picker and Escape restores input',async()=>{
    const p=require('../assets/web/puzzles.json').puzzles.find(p=>p.solution[0].length===5);assert(p);
    puzzleSubset=[p];await js(`localStorage.removeItem('caissa.trainer.puzzles.v1');localStorage.removeItem('caissa.trainer.recent.v1')`);await cdp('Page.reload',{});await sleep(650);
    await js(`document.querySelector('[data-tab="training"]').click()`);await until(`!document.querySelector('[data-trainer="start"]').disabled`);await js(`document.querySelector('[data-trainer="start"]').click()`);await until(`document.querySelector('[data-trainer="feedback"]').textContent.includes('Найдите')`);
    let s=Chess.fromFen(p.fen);s=Chess.apply(s,Chess.legalMoves(s).find(m=>Chess.uci(m)===p.setup));
    const tap=`(function(){var b=document.querySelector('[data-trainer="board"]'),r=b.getBoundingClientRect(),black=${s.turn==='b'};function tap(s){var f=s.charCodeAt(0)-97,k=Number(s[1])-1,o={clientX:r.left+r.width*((black?7-f:f)+.5)/8,clientY:r.top+r.height*((black?k:7-k)+.5)/8,bubbles:true,isPrimary:true};b.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',o));}tap('${p.solution[0].slice(0,2)}');tap('${p.solution[0].slice(2,4)}');})()`;
    await js(tap);assert.strictEqual(await js(`document.querySelectorAll('#modalBox .promo-grid img').length`),4);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);assert.ok(await js(`document.getElementById('modalRoot').classList.contains('hidden')`));
    await js(tap);await js(`document.querySelector('#modalBox [data-promo="${p.solution[0][4]}"]').click()`);assert.ok(await js(`document.getElementById('modalRoot').classList.contains('hidden')`));
    await js(`document.querySelector('[data-trainer="end"]').click()`);
  });
  await test('revealed solution plays every 2.5 seconds and remains browsable with history arrows',async()=>{
    puzzleSubset=[require('../assets/web/puzzles.json').puzzles.find(p=>p.id==='00008')];await js(`localStorage.removeItem('caissa.trainer.puzzles.v1');localStorage.removeItem('caissa.trainer.recent.v1')`);await cdp('Page.reload',{});await sleep(650);
    await js(`document.querySelector('[data-tab="training"]').click()`);await until(`!document.querySelector('[data-trainer="start"]').disabled`);await js(`document.querySelector('[data-trainer="start"]').click()`);await until(`document.querySelector('[data-trainer="feedback"]').textContent.includes('Найдите')`);
    await js(`document.querySelector('[data-trainer="solution"]').click()`);const first=await js(`document.querySelector('[data-trainer="historyStatus"]').textContent`);assert(first.startsWith('2 / '),first);
    await sleep(1200);assert.strictEqual(await js(`document.querySelector('[data-trainer="historyStatus"]').textContent`),first);await sleep(1450);
    assert.ok((await js(`document.querySelector('[data-trainer="historyStatus"]').textContent`)).startsWith('3 / '));
    await js(`document.querySelector('[data-trainer="back"]').click()`);const paused=await js(`document.querySelector('[data-trainer="historyStatus"]').textContent`);await sleep(2600);assert.strictEqual(await js(`document.querySelector('[data-trainer="historyStatus"]').textContent`),paused);
    await js(`document.querySelector('[data-trainer="current"]').click()`);assert.ok(await js(`!document.querySelector('[data-trainer="next"]').hidden`));await js(`document.querySelector('[data-trainer="end"]').click()`);
  });
  await test('PGN report opens before refinement and keeps the selected move when refinement completes',async()=>{
    await js(String.raw`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="pgn"]').click();window.__pgnFetch=window.fetch;window.fetch=function(url,opts){if(url==='/search'){var o=JSON.parse(opts.body);if(o.fen==='4k3/8/8/8/8/8/4q3/3QK3 w - - 0 1'){var response={ok:true,status:200,json:function(){return Promise.resolve({bestmove:'d1e2',lines:[{pv:['d1e2'],eval:{type:'cp',value:0}}]});}};if(o.multipv===3)return new Promise(function(resolve){window.__releaseRefine=function(){resolve(response);};});return Promise.resolve(response);}}return window.__pgnFetch(url,opts);};document.querySelector('#pgnDepth [data-depth="14"]').click();document.getElementById('pgnText').value='[FEN "4k3/8/8/8/8/8/4q3/3QK3 w - - 0 1"]\n\n1. Qxe2+ Kf7 *';document.getElementById('pgnParse').click()`);
    await until(`!!window.__releaseRefine`);assert.ok(await js(`!document.getElementById('pgnResult').classList.contains('hidden')&&document.getElementById('pgnDeepen').disabled&&document.getElementById('pgnReviewNote').textContent.includes('фоне')`));
    await click('pgnPrev');const selected=await js(`document.querySelector('#pgnMoves .active').getAttribute('data-ply')`);await js(`window.__releaseRefine()`);await until(`!document.getElementById('pgnDeepen').disabled`);assert.strictEqual(await js(`document.querySelector('#pgnMoves .active').getAttribute('data-ply')`),selected);await js(`window.fetch=window.__pgnFetch`);
  });
  assert.deepStrictEqual(errors,[]);console.log(count+' 1.5.2 UI checks passed');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  if(socket)socket.close();if(proc)proc.kill();if(server)server.closeAllConnections();if(server)server.close();
  await sleep(300);try{fs.rmSync(profile,{recursive:true,force:true});}catch(e){}
});
