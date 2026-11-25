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
  proc=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=19375','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let tabs;
  for(let i=0;i<100;i++){try{tabs=await (await fetch('http://127.0.0.1:19375/json')).json();break;}catch(e){await sleep(100);}}
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
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'onLine',{get:function(){return false;}});"});
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  await sleep(600);
  await js("document.getElementById('playTime').value='0:0'");
  await test('timed bot waits and pays from its clock',async()=>{
    await js(`document.querySelector('#colorSeg [data-color="b"]').click();document.querySelector('#levelSeg [data-level="4000"]').click();document.getElementById('playTime').value='1:0'`);
    replyDelay=900;const start=Date.now();await click('startGame');await sleep(120);
    assert.strictEqual(await js(`document.querySelectorAll('#playMoves .mv').length`),0);
    await until(`document.querySelectorAll('#playMoves .mv').length===1`);assert.ok(Date.now()-start>=350);
    assert.ok(await js(`!document.querySelector('#playTop .clock').classList.contains('ticking')`));
    replyDelay=30;
  });
  await test('double arrows jump ten plies rather than endpoints',async()=>{
    const pgn=fs.readFileSync(path.join(__dirname,'fixtures/hikaru-mortimer-2018.pgn'),'utf8');
    await js(`document.querySelector('[data-tab="analysis"]').click();document.querySelector('[data-mode="pgn"]').click();document.getElementById('pgnText').value=${JSON.stringify(pgn)}`);await click('pgnParse');
    await until(`!document.getElementById('pgnResult').classList.contains('hidden')`);
    const before=await js(`document.querySelector('#pgnMoves .mv.active').getAttribute('data-ply')`);
    await click('pgnFirst');const after=await js(`document.querySelector('#pgnMoves .mv.active').getAttribute('data-ply')`);
    const n=t=>Number(t.split('/')[0].trim());assert.strictEqual(n(before)-n(after),10);assert.ok(n(after)>0);
    await click('pgnLast');assert.strictEqual(await js(`document.querySelector('#pgnMoves .mv.active').getAttribute('data-ply')`),before);
  });
  await test('active training board fits a small phone',async()=>{
    await js(`document.querySelector('[data-tab="training"]').click()`);await until(`!document.querySelector('[data-trainer="start"]').disabled`);
    await js(`document.querySelector('[data-trainer="start"]').click()`);await sleep(600);
    await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:720,deviceScaleFactor:1,mobile:true});
    assert.ok(await js(`document.querySelector('.trainer-board').getBoundingClientRect().bottom<=document.getElementById('tabbar').getBoundingClientRect().top`));
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await screenshot('trainer-compact.png');
  });
  assert.deepStrictEqual(errors,[]);console.log(count+' focused 1.5 UI checks passed');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  if(socket)socket.close();if(proc)proc.kill();if(server)server.closeAllConnections();if(server)server.close();
  await sleep(300);try{fs.rmSync(profile,{recursive:true,force:true});}catch(e){}
});
