"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const appearance = require("../assets/web/appearance.js");
const web = path.join(__dirname, "../assets/web");

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(function (channel) {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const light = luminance(a), dark = luminance(b);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

assert.equal(appearance.pieceUrl("wN"), "pieces/wN.svg");
assert.equal(appearance.pieceUrl("wN", "celtic"), "pieces/celtic/wN.svg");
assert.equal(appearance.pieceUrl("wN"), "pieces/wN.svg");
assert.equal(appearance.pieceUrl("bK", "../celtic"), "pieces/bK.svg");
assert.equal(appearance.pieceUrl("../bK"), "");
assert.deepEqual(appearance.normalize({ theme: "__proto__", pieces: "../merida" }), { theme: "classic", pieces: "cburnett" });
assert.deepEqual(appearance.apply(null), { theme: "classic", pieces: "cburnett" });
const attrs = {}, styles = {};
const browser = { document: { documentElement: {
  setAttribute: function (key, value) { attrs[key] = value; },
  style: { setProperty: function (key, value) { styles[key] = value; } }
} } };
vm.runInNewContext(fs.readFileSync(path.join(web, "appearance.js"), "utf8"), browser);
assert(browser.CaissaAppearance);
appearance.themes.forEach(function (theme) {
  const palette = appearance.palettes[theme.id];
  ["bg", "panel", "panel2", "line"].forEach(function (surface) {
    assert(contrast(palette.text, palette[surface]) >= 4.5, theme.id + " text on " + surface);
    assert(contrast(palette.muted, palette[surface]) >= 3, theme.id + " muted on " + surface);
  });
  ["bg", "panel", "panel2"].forEach(function (surface) {
    assert(contrast(palette.muted, palette[surface]) >= 4.5, theme.id + " secondary text on " + surface);
    assert(contrast(palette.accent, palette[surface]) >= 4.5, theme.id + " accent on " + surface);
  });
  assert(contrast(palette.panel2, palette.accent) >= 4.5, theme.id + " button text");
  if (theme.id !== "classic") {
    ["light", "dark"].forEach(function (square) { assert(contrast(palette.panel2, palette[square]) >= 4.5, theme.id + " board coordinates"); });
  }
  browser.CaissaAppearance.apply({ theme: theme.id, pieces: "merida" });
  assert.equal(attrs["data-theme"], theme.id);
  assert.equal(attrs["data-pieces"], "merida");
  Object.keys(palette).forEach(function (key) { assert.equal(styles["--" + key], palette[key]); });
});
browser.CaissaAppearance.apply({ theme: "catppuccin", pieces: "celtic" });
browser.CaissaAppearance.apply({ theme: "classic", pieces: "cburnett" });
assert.equal(styles["--bg"], "#302e2b");
assert.equal(browser.CaissaAppearance.pieceUrl("bK"), "pieces/bK.svg");

let bytes = 0;
appearance.pieceSets.forEach(function (set) {
  appearance.apply({ theme: "classic", pieces: set.id });
  const directory = set.id === "cburnett" ? "pieces" : "pieces/" + set.id;
  const files = fs.readdirSync(path.join(web, directory)).filter(function (file) { return file.endsWith(".svg"); });
  assert.equal(files.length, 12, set.id + " has a complete family");
  ["w", "b"].forEach(function (color) {
    "PNBRQK".split("").forEach(function (piece) {
      const filename = path.join(web, appearance.pieceUrl(color + piece));
      const svg = fs.readFileSync(filename, "utf8");
      assert(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
      assert(/<svg\b/.test(svg) && /<\/svg>\s*$/.test(svg));
      assert(!/<(?:script|foreignObject|text|image)\b|<!DOCTYPE|\bon\w+\s*=/i.test(svg), filename);
      const references = svg.matchAll(/(?:href\s*=\s*["']([^"']+)|url\(\s*["']?([^)'"\s]+))/g);
      for (const reference of references) assert((reference[1] || reference[2]).startsWith("#"), filename + " uses local references only");
      if (set.id !== "cburnett") bytes += Buffer.byteLength(svg);
    });
  });
});
assert(bytes < 150000, "piece assets stay small");
console.log("Appearance: theme roundtrip, text contrast, 48 pieces, local SVG references passed (" + bytes + " added SVG bytes).");
