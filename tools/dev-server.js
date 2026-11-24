/* PC-превью: статика assets/web + Stockfish по HTTP. */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { createClient } = require("./stockfish-client");

const ROOT = path.join(__dirname, "..", "assets", "web");
const PORT = Number(process.env.PORT || 8765);
const BIN = process.env.STOCKFISH || "stockfish";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".webm": "audio/webm",
  ".txt": "text/plain; charset=utf-8"
};

const client = createClient(BIN);

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let data = "";
    req.on("data", function (c) {
      data += c;
      if (data.length > 2 * 1024 * 1024) reject(new Error("too large"));
    });
    req.on("end", function () {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(function (req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST") {
    if (url.pathname === "/health") return sendJson(res, 200, { ok: true });
    if (url.pathname === "/stop") { client.stop(); return sendJson(res, 200, { ok: true }); }
    if (url.pathname === "/search") {
      readBody(req).then(function (opts) {
        return client.search(opts);
      }).then(function (r) {
        sendJson(res, 200, { ok: true, bestmove: r.bestmove, lines: r.lines });
      }, function (err) {
        sendJson(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
      });
      return;
    }
    return sendJson(res, 404, { ok: false, error: "not found" });
  }

  let rel;
  try { rel = decodeURIComponent(url.pathname); }
  catch (e) { res.writeHead(400); return res.end("bad URL"); }
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(ROOT, rel));
  const relative = path.relative(ROOT, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});

client.init().then(function () {
  server.listen(PORT, "127.0.0.1", function () {
    console.log("Caissa PC: http://127.0.0.1:" + PORT + "/");
  });
}, function (err) {
  console.error("Stockfish не запустился:", err.message);
  process.exit(1);
});

process.on("SIGINT", function () { client.quit(); process.exit(0); });
