"use strict";
const assert = require("assert");
const EventEmitter = require("events");
const childProcess = require("child_process");
const commands = [];
const proc = new EventEmitter();
proc.stdout = new EventEmitter();
proc.stderr = new EventEmitter();
proc.kill = function () {};
proc.stdin = {
  writable: true,
  write: function (raw) {
    const line = raw.trim();
    commands.push(line);
    let reply = "";
    if (line === "uci") reply = "option name UCI_Elo type spin default 1400 min 1400 max 2800\nuciok\n";
    else if (line === "isready") reply = "readyok\n";
    else if (line.indexOf("go ") === 0) reply = "bestmove e2e4\n";
    if (reply) setImmediate(function () { proc.stdout.emit("data", Buffer.from(reply)); });
  }
};
const spawn = childProcess.spawn;
childProcess.spawn = function () { return proc; };
const client = require("../tools/stockfish-client").createClient("mock-stockfish");
childProcess.spawn = spawn;

client.init().then(function () {
  return client.search({elo: 500, depth: 1});
}).then(function () {
  return client.search({elo: 5000, depth: 1});
}).then(function () {
  return client.search({elo: 1800, depth: 1});
}).then(function () {
  return client.search({depth: 1});
}).then(function () {
  return client.search({elo: 0, skill: 20, depth: 1});
}).then(function () {
  assert.deepStrictEqual(commands.filter(function (line) {
    return line.indexOf("setoption name UCI_") === 0;
  }), [
    "setoption name UCI_LimitStrength value true", "setoption name UCI_Elo value 1400",
    "setoption name UCI_LimitStrength value true", "setoption name UCI_Elo value 2800",
    "setoption name UCI_LimitStrength value true", "setoption name UCI_Elo value 1800",
    "setoption name UCI_LimitStrength value false",
    "setoption name UCI_LimitStrength value false"
  ]);
  assert.strictEqual(commands.filter(function (line) { return line.indexOf("go ") === 0; }).length, 5);
  console.log("ok   advertised Elo clamp, rated to analysis reset, unrestricted hints");
  client.quit();
}).catch(function (error) {
  client.quit();
  console.error(error);
  process.exitCode = 1;
});
