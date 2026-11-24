(function (root, factory) {
  const common = typeof module === "object" && module.exports;
  const api = factory(root, common ? require("./chess.js") : root.ChessLogic, common ? require("./pgn.js") : root.FisherPgn);
  if (common) module.exports = api;
  else root.OpeningExplorer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, Chess, Pgn) {
  "use strict";
  const prefix = "fisher.explorer.masters.v1:";
  const memory = new Map();
  const ttl = 7 * 24 * 60 * 60 * 1000;
  let queue = Promise.resolve(), blockedUntil = 0;

  function error(code, message) { const e = new Error(message); e.code = code; return e; }
  function cancelled() { return error("cancelled", "Запрос отменён."); }
  function count(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }
  function clean(raw, state) {
    if (!raw || !Array.isArray(raw.moves)) throw error("invalid-response", "Lichess вернул некорректный ответ.");
    const legal = Chess.legalMoves(state), seen = new Set();
    const moves = [];
    raw.moves.slice(0, 100).forEach(function (item) {
      if (!item || typeof item.uci !== "string" || seen.has(item.uci)) return;
      const move = legal.find(function (m) { return Chess.uci(m) === item.uci; });
      if (!move || moves.length >= 10) return;
      seen.add(item.uci);
      moves.push({uci: item.uci, san: Pgn.sanOf(state, item.uci), white: count(item.white), draws: count(item.draws), black: count(item.black)});
    });
    const opening = raw.opening && typeof raw.opening.name === "string" && /^[A-E][0-9]{2}$/.test(raw.opening.eco) ?
      {name: raw.opening.name.slice(0, 200), eco: raw.opening.eco} : null;
    return {moves: moves, opening: opening, white: count(raw.white), draws: count(raw.draws), black: count(raw.black), source: "masters"};
  }
  function read(key, state) {
    let entry = memory.get(key);
    if (!entry) {
      try { entry = JSON.parse(root.localStorage.getItem(prefix + key)); } catch (_) { return null; }
    }
    if (!entry || !Number.isFinite(entry.fetchedAt) || !entry.data) return null;
    try { return {data: clean(entry.data, state), fetchedAt: entry.fetchedAt}; } catch (_) { return null; }
  }
  function result(entry, cached, stale) {
    return Object.assign({}, entry.data, {moves: entry.data.moves.map(function (m) { return Object.assign({}, m); }), cached: cached, stale: stale, fetchedAt: entry.fetchedAt});
  }
  function write(key, entry) {
    memory.set(key, entry);
    if (memory.size > 100) memory.delete(memory.keys().next().value);
    try {
      root.localStorage.setItem(prefix + key, JSON.stringify(entry));
      const keys = [];
      for (let i = 0; i < root.localStorage.length; i++) {
        const storedKey = root.localStorage.key(i);
        if (storedKey && storedKey.indexOf(prefix) === 0) keys.push(storedKey);
      }
      while (keys.length > 100) root.localStorage.removeItem(keys.shift());
    } catch (_) { /* Private browsing and full storage still allow memory caching. */ }
  }
  function request(fen, options) {
    if (options.signal && options.signal.aborted) throw cancelled();
    const state = Chess.fromFen(fen), key = Chess.toFen(state).split(" ").slice(0, 4).join(" ");
    const saved = read(key, state), now = Date.now();
    if (saved && !options.refresh && now - saved.fetchedAt < ttl) return result(saved, true, false);
    const offline = root.navigator && root.navigator.onLine === false;
    if (offline || now < blockedUntil) {
      if (saved) return result(saved, true, now - saved.fetchedAt >= ttl);
      throw error(offline ? "network" : "rate-limit", offline ? "Нет сети. Встроенная база дебютов доступна офлайн." : "Лимит Lichess: подождите не менее минуты.");
    }
    const controller = typeof root.AbortController === "function" ? new root.AbortController() : null;
    const xhr = !controller && typeof root.XMLHttpRequest === "function" ? new root.XMLHttpRequest() : null;
    let timeout, abortListener, timedOut = false;
    function cleanup() {
      clearTimeout(timeout);
      if (options.signal && abortListener) options.signal.removeEventListener("abort", abortListener);
    }
    const interrupted = new Promise(function (_, reject) {
        timeout = setTimeout(function () { timedOut = true; if (controller) controller.abort(); if (xhr) xhr.abort(); reject(error("timeout", "Lichess не ответил за 12 секунд.")); }, 12000);
        if (options.signal) {
          abortListener = function () { if (controller) controller.abort(); if (xhr) xhr.abort(); reject(cancelled()); };
          options.signal.addEventListener("abort", abortListener);
        }
      });
    const task = Promise.resolve().then(function () {
        if (options.signal && options.signal.aborted) throw cancelled();
        const url = "https://explorer.lichess.ovh/masters?fen=" + encodeURIComponent(Chess.toFen(state)) + "&moves=10&topGames=0";
        if (xhr) return new Promise(function (resolve, reject) {
          xhr.open("GET", url, true); xhr.setRequestHeader("Accept", "application/json");
          xhr.onload = function () { resolve({status:xhr.status, ok:xhr.status >= 200 && xhr.status < 300,
            headers:{get:function(name){return xhr.getResponseHeader(name);}},
            json:function(){return Promise.resolve().then(function(){return JSON.parse(xhr.responseText);});}}); };
          xhr.onerror = function () { reject(error("network", "Нет связи с Lichess.")); };
          xhr.onabort = function () { reject(timedOut ? error("timeout", "Lichess не ответил за 12 секунд.") : cancelled()); };
          xhr.send();
        });
        return root.fetch(url, {method: "GET", credentials: "omit", headers: {Accept: "application/json"}, signal: controller ? controller.signal : undefined});
      }).then(function (response) {
        if (response.status === 429) {
          const retry = response.headers && response.headers.get("Retry-After");
          const seconds = Number(retry);
          blockedUntil = Date.now() + Math.max(60000, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : (Date.parse(retry) || 0) - Date.now());
          throw error("rate-limit", "Лимит Lichess: подождите не менее минуты.");
        }
        if (!response.ok) throw error("network", "Lichess временно недоступен (HTTP " + response.status + ").");
        return response.json();
      }).then(function (raw) {
        const entry = {data: clean(raw, state), fetchedAt: Date.now()};
        if (options.signal && options.signal.aborted) throw cancelled();
        if (!timedOut) write(key, entry);
        return result(entry, false, false);
      });
    return Promise.race([task, interrupted]).catch(function (e) {
      if (options.signal && options.signal.aborted) throw cancelled();
      if (saved) return Object.assign(result(saved, true, now - saved.fetchedAt >= ttl), {warning: e.message || "Нет связи с Lichess."});
      if (e.code) throw e;
      throw error("network", "Не удалось связаться с Lichess. Встроенная база работает офлайн.");
    }).then(function (value) {
      cleanup();
      return value;
    }, function (e) {
      cleanup();
      throw e;
    });
  }
  function lookup(fen, options) {
    const task = queue.then(function () { return request(fen, options || {}); });
    queue = task.catch(function () {});
    return task;
  }
  return {lookup: lookup};
});
