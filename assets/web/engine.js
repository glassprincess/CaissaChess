/* Движок: очередь запросов, транспорт Android (JavascriptInterface) или HTTP (PC).
 * Один запрос за раз. Ответ: {bestmove, lines:[{move, eval, pv, depth, multipv}]}. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FisherEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const TIMEOUT = 180000;
  let seq = 0;
  let queue = [];
  let busy = false;
  let currentJob = null;
  let transport = null;
  const pending = Object.create(null);

  root.Engine = root.Engine || {};

  function normalize(raw) {
    const lines = (raw.lines || []).map(function (l) {
      return {
        multipv: l.multipv || 1,
        depth: l.depth || 0,
        eval: l.eval || l.score || { type: "cp", value: 0 },
        pv: l.pv || [],
        move: (l.pv && l.pv[0]) || l.move || ""
      };
    }).sort(function (a, b) { return a.multipv - b.multipv; });
    return { bestmove: raw.bestmove || (lines[0] && lines[0].move) || "", lines: lines };
  }

  function detect() {
    if (root.AndroidEngine && typeof root.AndroidEngine.request === "function") return "android";
    return "http";
  }

  function httpPost(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function init() {
    transport = detect();
    if (transport === "http") {
      return httpPost("/health", {}).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(true);
  }

  function androidSearch(opts) {
    return new Promise(function (resolve, reject) {
      const id = "q" + (++seq);
      const timer = setTimeout(function () {
        delete pending[id];
        reject(new Error("Движок не ответил"));
      }, TIMEOUT);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      try {
        root.AndroidEngine.request(JSON.stringify(Object.assign({ id: id }, opts)));
      } catch (err) {
        clearTimeout(timer);
        delete pending[id];
        reject(err);
      }
    });
  }

  root.Engine.onResult = function (id, json) {
    const p = pending[id];
    if (!p) return;
    clearTimeout(p.timer);
    delete pending[id];
    let data;
    try { data = JSON.parse(json); } catch (e) { p.reject(e); return; }
    if (data.ok === false) p.reject(new Error(data.error || "Ошибка движка"));
    else p.resolve(data);
  };

  function doSearch(opts) {
    if (transport === "android") return androidSearch(opts);
    return httpPost("/search", opts);
  }

  function finish(job, value, err) {
    if (job.settled) return;
    job.settled = true;
    if (err) job.reject(err);
    else job.resolve(value);
  }

  function pump() {
    if (busy || !queue.length) return;
    const job = queue.shift();
    busy = true;
    currentJob = job;
    doSearch(job.opts).then(function (raw) {
      busy = false;
      currentJob = null;
      finish(job, job.cancelled ? null : normalize(raw));
      pump();
    }, function (err) {
      busy = false;
      currentJob = null;
      finish(job, null, err);
      pump();
    });
  }

  function search(opts, owner) {
    return new Promise(function (resolve, reject) {
      queue.push({ opts: opts, owner: owner, resolve: resolve, reject: reject, cancelled: false, settled: false });
      pump();
    });
  }

  function cancel(owner) {
    queue = queue.filter(function (job) {
      if (owner !== undefined && job.owner !== owner) return true;
      finish(job, null);
      return false;
    });
    if (!currentJob || (owner !== undefined && currentJob.owner !== owner)) return;
    currentJob.cancelled = true;
    finish(currentJob, null);
    if (transport === "android") {
      if (root.AndroidEngine && root.AndroidEngine.stop) root.AndroidEngine.stop();
    } else {
      httpPost("/stop", {}).then(function () {}, function () {});
    }
  }

  function cancelAll() { cancel(); }

  function isAndroid() {
    return transport === "android";
  }

  return { init: init, search: search, cancel: cancel, cancelAll: cancelAll, isAndroid: isAndroid, normalize: normalize };
});
