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
  let queue = Promise.resolve(), blockedUntil = 0, playersNeedAuth=false;

  function error(code, message) { const e = new Error(message); e.code = code; return e; }
  function cancelled() { return error("cancelled", "Запрос отменён."); }
  function count(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }
  function cleanGames(raw,source) {
    const seen=new Set();
    return (Array.isArray(raw)?raw:[]).filter(function(game){if(!game || !/^[a-zA-Z0-9]{8}$/.test(game.id) || seen.has(game.id))return false;seen.add(game.id);return true;}).slice(0,6).map(function(game){
      function player(value){return {name:value && typeof value.name==="string"?value.name.slice(0,80):"",rating:value && Number.isFinite(value.rating)?value.rating:null};}
      return {id:game.id,source:source,white:player(game.white),black:player(game.black),year:Number.isInteger(game.year)?game.year:null};
    });
  }
  function limited(response){
    const retry=response.headers && response.headers.get("Retry-After"), seconds=Number(retry);
    blockedUntil=Date.now()+Math.max(60000,Number.isFinite(seconds)&&seconds>0?seconds*1000:(Date.parse(retry)||0)-Date.now());
    return error("rate-limit","Лимит Lichess: подождите не менее минуты.");
  }
  function clean(raw, state, source) {
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
    return {moves: moves, opening: opening, white: count(raw.white), draws: count(raw.draws), black: count(raw.black), source:raw.source || source || "masters",games:cleanGames(raw.games || (raw.topGames || []).concat(raw.recentGames || []),raw.source || source || "masters")};
  }
  function read(key, state, source) {
    let entry = memory.get(key);
    if (!entry) {
      try { entry = JSON.parse(root.localStorage.getItem(prefix + key)); } catch (_) { return null; }
    }
    if (!entry || !Number.isFinite(entry.fetchedAt) || !entry.data) return null;
    try { return {data: clean(entry.data, state, source), gamesRequested:entry.gamesRequested===true, fetchedAt: entry.fetchedAt}; } catch (_) { return null; }
  }
  function result(entry, cached, stale) {
    return Object.assign({}, entry.data, {moves: entry.data.moves.map(function (m) { return Object.assign({}, m); }), games:entry.data.games.map(function(game){return Object.assign({},game,{white:Object.assign({},game.white),black:Object.assign({},game.black)});}),cached: cached, stale: stale, fetchedAt: entry.fetchedAt});
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
    const source=options.source==="lichess" && !playersNeedAuth?"lichess":"masters";
    const state = Chess.fromFen(fen), key = (source==="lichess"?"lichess:":"")+Chess.toFen(state).split(" ").slice(0, 4).join(" ");
    const saved = read(key, state, source), now = Date.now();
    if (saved && !options.refresh && (!options.games || saved.gamesRequested) && now - saved.fetchedAt < ttl) return result(saved, true, false);
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
        const url = "https://explorer.lichess.ovh/"+source+"?fen=" + encodeURIComponent(Chess.toFen(state)) + (source==="lichess"?"&moves=10&topGames=3&recentGames=3&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500":"&moves=10&topGames="+((options.games || options.source==="lichess")?6:0));
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
        if(response.status===401 && source==="lichess"){playersNeedAuth=true;return request(fen,Object.assign({},options,{source:"masters",games:true}));}
        if (response.status === 429) {
          throw limited(response);
        }
        if (!response.ok) throw error("network", "Lichess временно недоступен (HTTP " + response.status + ").");
        return response.json();
      }).then(function (raw) {
        const entry = {data: clean(raw, state, source), gamesRequested:options.games===true,fetchedAt: Date.now()};
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
  function game(id, options) {
    const task=queue.then(function(){return requestGame(id,options || {});});queue=task.catch(function(){});return task;
  }
  function requestGame(id,options){
    if(!/^[a-zA-Z0-9]{8}$/.test(id))throw error("invalid-game","Некорректная партия Lichess.");
    if(options.signal && options.signal.aborted)throw cancelled();
    const source=options.source==="masters"?"masters":"lichess";
    const key="fisher.explorer.games.v1:"+(source==="masters"?"masters:":"")+id;
    function validate(text){
      if(typeof text!=="string" || text.length>200000)throw error("invalid-game","Некорректная партия Lichess.");
      const parsed=Pgn.parse(text);
      if(parsed.errors.length || parsed.games.length!==1 || !parsed.games[0].ok || !parsed.games[0].moves.length)throw error("invalid-game","Некорректная партия Lichess.");
      return text;
    }
    try{const text=root.localStorage.getItem(key);if(text)return Promise.resolve(validate(text));}catch(_){}
    if((root.navigator && root.navigator.onLine===false) || Date.now()<blockedUntil)throw error("rate-limit","Нет связи с Lichess.");
    const controller=typeof root.AbortController==="function"?new root.AbortController():null;
    let timer,abort;
    const interrupted=new Promise(function(_,reject){
      timer=setTimeout(function(){if(controller)controller.abort();reject(error("timeout","Нет связи с Lichess."));},8000);
      if(options.signal){abort=function(){if(controller)controller.abort();reject(cancelled());};options.signal.addEventListener("abort",abort);}
    });
    const task=Promise.resolve().then(function(){return root.fetch(source==="masters"?"https://explorer.lichess.ovh/masters/pgn/"+id:"https://lichess.org/game/export/"+id+"?clocks=false&evals=false&opening=true",{credentials:"omit",headers:{Accept:"application/x-chess-pgn"},signal:controller?controller.signal:undefined});}).then(function(response){
      if(response.status===429)throw limited(response);
      if(!response.ok || (response.headers && Number(response.headers.get("Content-Length"))>200000))throw error("network","Нет связи с Lichess.");
      return response.text();
    }).then(function(text){
      validate(text);if(options.signal && options.signal.aborted)throw cancelled();
      try{root.localStorage.setItem(key,text);const keys=[];for(let i=0;i<root.localStorage.length;i++){const candidate=root.localStorage.key(i);if(candidate.indexOf("fisher.explorer.games.v1:")===0)keys.push(candidate);}while(keys.length>20)root.localStorage.removeItem(keys.shift());}catch(_){}
      return text;
    });
    function cleanup(){clearTimeout(timer);if(options.signal && abort)options.signal.removeEventListener("abort",abort);}
    return Promise.race([task,interrupted]).then(function(text){cleanup();return text;},function(err){cleanup();throw err;});
  }
  return {lookup: lookup,game:game};
});
