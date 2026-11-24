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
    if (req.url === '/') return res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Board regression</title><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="board-fixes.css"><div id="board" style="width:320px;height:320px;max-width:none"></div><script src="chess.js"></script><script src="board.js"></script><script>var moves=[];var board=FisherBoard.create(document.getElementById("board"),{onMove:function(from,to){moves.push([from,to]);}});</script></html>');
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
  console.log('Board regression passed: checked-square geometry, filter-free aura, dual badges, stable animations, both orientations; full-app touch promotion for both colors/all four choices; modal dismissal');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close(); if (browser) browser.kill();
  if (server) { server.closeAllConnections(); server.close(); }
  await sleep(300); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
});
