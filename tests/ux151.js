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
  proc=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=19377','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let tabs;
  for(let i=0;i<250;i++){try{tabs=await (await fetch('http://127.0.0.1:19377/json')).json();break;}catch(e){await sleep(100);}}
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
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:"window.AndroidEngine={getAbi:function(){window.__abiReads=(window.__abiReads||0)+1;return 'arm64-v8a';}};Object.defineProperty(navigator,'onLine',{get:function(){return !!window.__online;}});"});
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  await sleep(600);
  assert.strictEqual(await js(`window.__abiReads`),1,'native ABI is read at startup');
  await js("document.getElementById('playTime').value='0:0'");
  await test('queued premoves execute five consecutive planned moves',async()=>{
    replyDelay=650;botLine=['a7a6','a6a5','b7b6','b6b5','c7c6','c6c5'];
    await click('startGame');await playTap('e2','e4');
    for(const [from,to] of [['g1','f3'],['f3','g5'],['g5','f3'],['b1','c3'],['c3','b1']])await playTap(from,to);
    assert.ok(await js(`document.getElementById('playStatus').textContent.includes('5')`));
    await until(`document.querySelectorAll('#playMoves .mv').length===12`);
    assert.ok(await js(`document.getElementById('playCancelPremove').classList.contains('hidden')`));
    assert.strictEqual(await js(`document.querySelectorAll('#playMoves .mv').length`),12);replyDelay=30;
  });
  await test('mates filter opens real checkmate lesson',async()=>{
    await js(`document.querySelector('[data-tab="openings"]').click();document.querySelector('[data-filter="mates"]').click()`);
    assert.ok(await js(`document.querySelectorAll('.opening-card').length===1`));
    await js(`document.querySelector('.opening-card').click()`);
    assert.ok(await js(`document.querySelectorAll('#openingVariantSelect option').length>=11`));
    for(let i=0;i<12;i++)await click('openingLast');
    assert.ok(await js(`document.getElementById('openingCurrentMove').textContent.includes('#')`));
  });
  await test('trainer setup locks cleanly, history preserves position and finish unlocks settings',async()=>{
    await js(`document.querySelector('[data-tab="training"]').click()`);await until(`!document.querySelector('[data-trainer="start"]').disabled`);
    assert.ok(await js(`document.querySelector('[data-trainer="content"]').hidden`));
    const width=await js(`document.querySelector('[data-trainer="settings"]').getBoundingClientRect().width-document.querySelector('[data-trainer="start"]').getBoundingClientRect().width`);assert.ok(Math.abs(width)<1);await screenshot('trainer-setup.png');
    await js(`document.querySelector('[data-trainer="start"]').click()`);await until(`document.querySelector('[data-trainer="feedback"]').textContent.includes('Найдите')`);
    assert.ok(await js(`document.querySelector('[data-trainer="settings"]').hidden&&!document.querySelector('[data-trainer="summary"]').hidden`));
    await screenshot('trainer-session.png');
    await js(`document.querySelector('[data-trainer="back"]').click()`);assert.ok(await js(`document.querySelector('[data-trainer="historyStatus"]').textContent==='0 / 1'&&!document.querySelector('[data-trainer="current"]').hidden`));
    await js(`document.querySelector('[data-trainer="current"]').click();document.querySelector('[data-trainer="end"]').click()`);
    assert.ok(await js(`!document.querySelector('[data-trainer="settings"]').hidden`));
    assert.ok(await js(`document.querySelector('[data-trainer="moveInput"]')===null`));
  });
  await test('GitHub update dialog has notes, trusted APK, persistent opt-out and manual recheck',async()=>{
    await js(String.raw`window.__online=true;window.__realFetch=window.fetch;window.fetch=function(url,opts){if(url.indexOf('api.github.com/repos/glassprincess/CaissaChess/releases/latest')>=0)return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve({tag_name:'v1.5.3',name:'Caissa 1.5.3',html_url:'https://github.com/glassprincess/CaissaChess/releases/tag/v1.5.3',body:'<!-- caissa:ru -->\n- Новые задачи\n- Исправлены часы\n<!-- caissa:en -->\n- New puzzles\n- Clock fixes',assets:[{name:'Caissa-1.5.3-arm64-v8a-debug.apk',state:'uploaded',browser_download_url:'https://github.com/glassprincess/CaissaChess/releases/download/v1.5.3/Caissa-1.5.3-arm64-v8a-debug.apk'}]});}});return window.__realFetch(url,opts);}`);
    await click('settingsBtn');await click('checkUpdates');await until(`!!document.getElementById('updateYes')`);
    assert.ok(await js(`document.querySelector('.update-version').textContent.includes('1.5.3')&&document.querySelector('.update-notes').textContent.includes('Новые задачи')`));
    assert.strictEqual(await js(`document.getElementById('updateYes').href`),'https://github.com/glassprincess/CaissaChess/releases/download/v1.5.3/Caissa-1.5.3-arm64-v8a-debug.apk');
    await screenshot('update-mobile.png');await click('updateNever');await click('settingsBtn');assert.ok(await js(`!document.getElementById('setUpdates').checked`));
    await click('checkUpdates');await until(`!!document.getElementById('updateYes')`);await click('updateNever');
    await js(`window.__immediateUpdate=window.fetch;window.fetch=function(url,opts){if(url.indexOf('api.github.com')>=0)return new Promise(function(resolve){window.__finishUpdate=function(){resolve(window.__immediateUpdate(url,opts));};});return window.__immediateUpdate(url,opts);};`);
    await click('settingsBtn');await click('checkUpdates');await js(`window.FisherBack();window.__finishUpdate()`);await sleep(100);
    assert.ok(await js(`document.getElementById('modalRoot').classList.contains('hidden')`),'late update response cannot replace resumed play or another screen');
    await js(`window.fetch=window.__immediateUpdate`);await click('settingsBtn');await js(`document.getElementById('setLanguage').value='en'`);await click('setSave');
    await click('settingsBtn');await click('checkUpdates');await until(`!!document.getElementById('updateYes')`);
    assert.ok(await js(`document.querySelector('.update-notes').textContent.includes('New puzzles')&&document.getElementById('updateYes').textContent==='Yes'`));
    await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:720,deviceScaleFactor:1,mobile:true});
    const sizes=await js(`(function(){var yes=document.getElementById('updateYes'),no=document.getElementById('updateNever'),a=yes.getBoundingClientRect(),b=no.getBoundingClientRect();return {widths:Math.abs(a.width-b.width),heights:Math.abs(a.height-b.height),different:getComputedStyle(yes).backgroundColor!==getComputedStyle(no).backgroundColor,overflow:document.documentElement.scrollWidth>320};})()`);
    assert.ok(sizes.widths<1&&sizes.heights<1&&sizes.different&&!sizes.overflow);await screenshot('update-en-mobile.png');
    await click('updateNever');await js(`window.fetch=window.__realFetch;window.__online=false`);

  });
  assert.deepStrictEqual(errors,[]);console.log(count+' 1.5.1 UI checks passed');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  if(socket)socket.close();if(proc)proc.kill();if(server)server.closeAllConnections();if(server)server.close();
  await sleep(300);try{fs.rmSync(profile,{recursive:true,force:true});}catch(e){}
});
