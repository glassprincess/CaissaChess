"use strict";
const assert = require("assert"), fs = require("fs"), vm = require("vm");
const Chess = require("../assets/web/chess.js"), Pgn = require("../assets/web/pgn.js");
const source = fs.readFileSync(require.resolve("../assets/web/opening-explorer.js"), "utf8");
assert(!/\basync\s+function\b|\bawait\b|\.finally\s*\(/.test(source), "Browser module must stay compatible with ES2015 WebView");
const fen = Chess.toFen(Chess.startState());
const raw = {white: 10, draws: 5, black: 3, opening: {eco: "A00", name: "Start"}, moves: [{uci: "e2e4", san: "BAD", white: 3, draws: 2, black: 1}, {uci: "e2e5", white: 5}, {uci: "e2e4"}, {uci: "d2d4", white: -9}]};
function storage() {
  const data = new Map();
  return {getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k), key: i => Array.from(data.keys())[i], get length() { return data.size; }};
}
function environment(fetch, localStorage, extra) {
  const context = Object.assign({ChessLogic: Chess, FisherPgn: Pgn, fetch, localStorage: localStorage || storage(), navigator: {onLine: true}, AbortController, setTimeout, clearTimeout, Date}, extra);
  vm.runInNewContext(source, context);
  return context;
}
function response(data) { return {ok: true, status: 200, json: async () => data}; }
(async function () {
  let calls = 0;
  const disk = storage();
  const env = environment(async (url, options) => { calls++; assert(url.startsWith("https://explorer.lichess.ovh/masters?fen=")); assert(url.includes("moves=10&topGames=0")); assert.strictEqual(options.credentials, "omit"); return response(raw); }, disk);
  assert.strictEqual(calls, 0, "Loading module must never contact network");
  const found = await env.OpeningExplorer.lookup(fen);
  assert.strictEqual(found.moves.length, 2);
  assert.strictEqual(found.moves[0].san, "e4");
  assert.strictEqual(found.moves[1].white, 0);
  assert.strictEqual(found.cached, false);
  found.moves[0].white = 999;
  const cached = await env.OpeningExplorer.lookup(fen.replace("0 1", "7 9"));
  assert.strictEqual(cached.moves[0].white, 3);
  assert.strictEqual(calls, 1);
  const offline = environment(() => { throw Error("must not fetch"); }, disk, {navigator: {onLine: false}});
  assert.strictEqual((await offline.OpeningExplorer.lookup(fen)).cached, true);
  for (let i = 0; i < disk.length; i++) {
    const key = disk.key(i), saved = JSON.parse(disk.getItem(key));
    saved.fetchedAt -= 8 * 86400000; disk.setItem(key, JSON.stringify(saved));
  }
  const stale = environment(() => { throw Error("must not fetch"); }, disk, {navigator: {onLine: false}});
  assert.strictEqual((await stale.OpeningExplorer.lookup(fen)).stale, true);
  const broken = environment(async () => { throw Error("network failed"); }, disk);
  const fallback = await broken.OpeningExplorer.lookup(fen);
  assert(fallback.cached && fallback.stale && fallback.warning);
  let rateCalls = 0;
  const limited = environment(async () => { rateCalls++; return {status: 429, headers: {get: () => "60"}}; });
  await assert.rejects(limited.OpeningExplorer.lookup(fen), e => e.code === "rate-limit");
  await assert.rejects(limited.OpeningExplorer.lookup(fen), e => e.code === "rate-limit");
  assert.strictEqual(rateCalls, 1, "429 must not retry");
  const invalid = environment(async () => response({bad: true}));
  await assert.rejects(invalid.OpeningExplorer.lookup(fen), e => e.code === "invalid-response");
  let inFlight = 0, max = 0;
  const serialized = environment(async () => { inFlight++; max = Math.max(max, inFlight); await new Promise(r => setTimeout(r, 5)); inFlight--; return response(raw); });
  await Promise.all([serialized.OpeningExplorer.lookup(fen), serialized.OpeningExplorer.lookup(fen, {refresh: true})]);
  assert.strictEqual(max, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(serialized.OpeningExplorer.lookup(fen, {signal: controller.signal}), e => e.code === "cancelled");
  const pending = environment((_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Error("aborted")));
  }));
  const active = new AbortController();
  const job = pending.OpeningExplorer.lookup(fen, {signal: active.signal});
  await new Promise(r => setTimeout(r, 2)); active.abort();
  await assert.rejects(job, e => e.code === "cancelled");
  const timed = environment(() => new Promise(() => {}), null, {setTimeout: fn => setTimeout(fn, 2)});
  await assert.rejects(timed.OpeningExplorer.lookup(fen), e => e.code === "timeout");
  const legacy = environment(async () => response(raw), null, {AbortController: undefined});
  assert.strictEqual((await legacy.OpeningExplorer.lookup(fen)).moves[0].san, "e4");
  let xhrAborts = 0;
  function SilentXHR() {this.open=function(){};this.setRequestHeader=function(){};this.send=function(){};this.abort=function(){xhrAborts++;this.onabort();};}
  const legacyTimeout = environment(function(){throw Error("fetch must not run");},null,{AbortController:undefined,XMLHttpRequest:SilentXHR,setTimeout:fn=>setTimeout(fn,2)});
  await assert.rejects(legacyTimeout.OpeningExplorer.lookup(fen),e=>e.code==="timeout");
  assert.strictEqual(xhrAborts,1,"legacy transport aborts a timed out request");
  function WorkingXHR(){this.open=function(){};this.setRequestHeader=function(){};this.getResponseHeader=function(){return null;};this.send=function(){this.status=200;this.responseText=JSON.stringify(raw);this.onload();};}
  const legacyXHR=environment(function(){throw Error("fetch must not run");},null,{AbortController:undefined,XMLHttpRequest:WorkingXHR});
  assert.strictEqual((await legacyXHR.OpeningExplorer.lookup(fen)).moves[0].san,"e4");
  console.log("ok opening explorer: explicit requests, legal SAN, bounded moves, normalized counts, memory/disk cache, offline/stale fallback, 429 cooldown, serialization, cancellation, timeout, malformed data");
})().catch(e => { console.error(e); process.exitCode = 1; });
