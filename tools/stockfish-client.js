/* Постоянный процесс Stockfish и разбор UCI-вывода. Для PC-тестов. */
"use strict";
const { spawn } = require("child_process");

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function createClient(binPath) {
  const proc = spawn(binPath, [], { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  let queue = Promise.resolve();
  let current = null;
  const waiters = [];
  let eloMin = 1320, eloMax = 3190;

  function command(s) {
    if (!proc.stdin.writable) return;
    proc.stdin.write(s + "\n");
  }

  function waitFor(token, ms) {
    return new Promise(function (resolve, reject) {
      const w = { token: token, resolve: resolve, reject: reject };
      const timer = setTimeout(function () {
        const i = waiters.indexOf(w);
        if (i >= 0) waiters.splice(i, 1);
        reject(new Error("timeout: " + token));
      }, ms);
      w.timer = timer;
      waiters.push(w);
    });
  }

  function parseInfo(line) {
    const t = line.split(/\s+/);
    let multipv = 1, depth = 0, type = "cp", value = 0, pvAt = -1;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "multipv") multipv = parseInt(t[i + 1], 10) || 1;
      else if (t[i] === "depth") depth = parseInt(t[i + 1], 10) || 0;
      else if (t[i] === "score") { type = t[i + 1] || "cp"; value = parseInt(t[i + 2], 10) || 0; }
      else if (t[i] === "pv") { pvAt = i + 1; break; }
    }
    if (pvAt < 0) return null;
    return { multipv: multipv, depth: depth, score: { type: type, value: value }, pv: t.slice(pvAt) };
  }

  function handle(line) {
    const eloRange = /^option name UCI_Elo .* min (\d+) max (\d+)/.exec(line);
    if (eloRange) {
      eloMin = Number(eloRange[1]);
      eloMax = Math.max(eloMin, Number(eloRange[2]));
    }
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].token === line.trim()) {
        clearTimeout(waiters[i].timer);
        waiters[i].resolve();
        waiters.splice(i, 1);
      }
    }
    if (!current) return;
    if (line.indexOf("bestmove") === 0) {
      const best = line.split(" ")[1] || "";
      clearTimeout(current.timer);
      const done = current;
      current = null;
      done.resolve({
        bestmove: best === "(none)" ? "" : best,
        lines: Array.from(done.lines.values()).sort(function (a, b) { return a.multipv - b.multipv; })
      });
      return;
    }
    if (line.indexOf("info") === 0 && line.indexOf(" pv ") >= 0) {
      const info = parseInfo(line);
      if (info) current.lines.set(info.multipv, info);
    }
  }

  proc.stdout.on("data", function (chunk) {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
      handle(line);
    }
  });
  proc.stderr.on("data", function () {});
  proc.on("exit", function () {
    if (current) {
      clearTimeout(current.timer);
      const done = current;
      current = null;
      done.reject(new Error("engine exited"));
    }
  });

  async function init() {
    command("uci");
    await waitFor("uciok", 20000);
    command("setoption name Threads value 2");
    command("setoption name Hash value 64");
    command("isready");
    await waitFor("readyok", 20000);
  }

  function search(opts) {
    const run = function () {
      return new Promise(function (resolve, reject) {
        const multipv = opts.multipv || 1;
        const elo = Number(opts.elo);
        const limited = Number.isFinite(elo) && elo > 0;
        command("setoption name UCI_LimitStrength value " + limited);
        if (limited) command("setoption name UCI_Elo value " + Math.max(eloMin, Math.min(eloMax, Math.round(elo))));
        command("setoption name Skill Level value " + (opts.skill === undefined ? 20 : opts.skill));
        command("setoption name MultiPV value " + multipv);
        command("position fen " + (opts.fen || START));
        current = { lines: new Map(), resolve: resolve, reject: reject };
        current.timer = setTimeout(function () {
          if (current) command("stop");
        }, 180000);
        const depth = opts.depth || 0;
        const movetime = opts.movetime || 0;
        let go = "go ";
        if (depth) go += "depth " + depth + " ";
        if (movetime) go += "movetime " + movetime;
        if (!depth && !movetime) go += "depth 12";
        command(go);
      });
    };
    const p = queue.then(run, run);
    queue = p.then(function () {}, function () {});
    return p;
  }

  function stop() {
    if (current) command("stop");
  }

  function quit() {
    try { command("quit"); } catch (e) {}
    setTimeout(function () { try { proc.kill(); } catch (e) {} }, 300);
  }

  return { init: init, search: search, stop: stop, quit: quit };
}

module.exports = { createClient: createClient, START: START };
