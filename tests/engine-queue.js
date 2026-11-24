'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
async function run() {
  const requests = []; let stops = 0;
  const timers = new Set();
  const root = {setTimeout: function (fn,ms) {const t=setTimeout(fn,ms);t.unref();timers.add(t);return t;},
    clearTimeout: function(t) {timers.delete(t);clearTimeout(t);}, AndroidEngine: {
    request: function (json) { requests.push(JSON.parse(json)); },
    stop: function () { stops++; }
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/web/engine.js'), 'utf8'), root);
  const eng = root.FisherEngine;
  await eng.init();
  const first = eng.search({fen:'first'}, 'play');
  const live = eng.search({fen:'live'}, 'live');
  const batch = eng.search({fen:'batch'}, 'batch');
  eng.cancel('live');
  assert.strictEqual(await live, null);
  assert.strictEqual(stops, 0, 'чужой поиск продолжает работу');
  root.Engine.onResult(requests[0].id, JSON.stringify({ok:true,bestmove:'e2e4',lines:[]}));
  assert.strictEqual((await first).bestmove, 'e2e4');
  await Promise.resolve();
  assert.strictEqual(requests[1].fen, 'batch');
  eng.cancel('batch');
  assert.strictEqual(await batch, null);
  assert.strictEqual(stops, 1);
  const next = eng.search({fen:'next'}, 'play');
  assert.strictEqual(requests.length, 2, 'новый поиск ждёт завершения stop');
  root.Engine.onResult(requests[1].id, JSON.stringify({ok:true,bestmove:'d2d4',lines:[]}));
  await Promise.resolve();
  assert.strictEqual(requests[2].fen, 'next');
  root.Engine.onResult(requests[2].id, JSON.stringify({ok:true,bestmove:'g1f3',lines:[]}));
  assert.strictEqual((await next).bestmove, 'g1f3');
  root.AndroidEngine.request = function () {throw Error('bridge unavailable');};
  await assert.rejects(eng.search({fen:'failed'}, 'play'), /bridge unavailable/);
  assert.strictEqual(timers.size, 0, 'синхронный сбой моста не оставляет таймер');
  console.log('ok   отмена по владельцу, очередь и запоздалый ответ');
}
run().catch(function (err) { console.error(err); process.exitCode = 1; });
