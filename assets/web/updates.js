(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Updates = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var REPO = "https://github.com/glassprincess/CaissaChess/releases/";
  var ENDPOINT = "https://api.github.com/repos/glassprincess/CaissaChess/releases/latest";
  var KEY = "caissa.updates.v1", DAY = 86400000;

  function versionParts(value) {
    if (typeof value !== "string" || value.length > 100) return null;
    var match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
    return match ? [match[1],match[2],match[3],match[4] || "0"] : null;
  }
  function compareVersions(a, b) {
    var left = versionParts(a), right = versionParts(b);
    if (!left || !right) return null;
    for (var i = 0; i < 4; i++) {
      if (left[i].length !== right[i].length) return left[i].length > right[i].length ? 1 : -1;
      if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
    }
    return 0;
  }
  function summarizeNotes(body) {
    if (typeof body !== "string") return [];
    var lines = body.slice(0, 20000).replace(/```[\s\S]*?```/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]*>/g, "").split(/\r?\n/);
    var notes = [], remaining = 320;
    lines.some(function (line) {
      if (/^\s*(?:#{1,6}\s|[-=]{3,}\s*$|https?:\/\/)/.test(line)) return false;
      line = line.replace(/^\s*(?:[-*+>]\s+|\d+[.)]\s+|\[[ xX]\]\s*)+/, "")
        .replace(/[*_`~]/g, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
      if (!line) return false;
      if (line.length > remaining) line = line.slice(0, remaining - 1).trim() + "…";
      notes.push(line); remaining -= line.length;
      return notes.length === 3 || remaining < 4;
    });
    return notes;
  }
  function localizedNotes(body, language) {
    if (typeof body !== "string" || !/<!--\s*caissa:(ru|en)\s*-->/.test(body)) return body;
    var sections = body.split(/<!--\s*caissa:(ru|en)\s*-->/), wanted = language === "ru" ? "ru" : "en";
    for (var i = 1; i < sections.length; i += 2) {
      if (sections[i] === wanted && sections[i + 1].trim()) return sections[i + 1];
    }
    return sections[2] || body;
  }
  function normalizeRelease(data, currentVersion, abi, language) {
    if (!data || data.draft || data.prerelease || compareVersions(data.tag_name, currentVersion) !== 1) return null;
    var tag = encodeURIComponent(data.tag_name), url = REPO + "tag/" + tag;
    if (data.html_url !== url) return null;
    var assets = Array.isArray(data.assets) ? data.assets : [];
    var candidates = assets.filter(function (asset) {
      return asset && typeof asset.name === "string" && /^[\w.+-]+\.apk$/i.test(asset.name) &&
        asset.browser_download_url === REPO + "download/" + tag + "/" + encodeURIComponent(asset.name) &&
        (!asset.state || asset.state === "uploaded");
    });
    var selected = null, abis = ["arm64-v8a", "armeabi-v7a", "x86_64", "x86"];
    function assetAbi(asset) {
      return abis.find(function (arch) { return new RegExp("(?:^|[-_.])" + arch + "(?:[-_.]|$)", "i").test(asset.name); });
    }
    if (abis.indexOf(abi) !== -1) selected = candidates.find(function (asset) { return assetAbi(asset) === abi; });
    if (!selected) selected = candidates.find(function (asset) { return /(?:^|[-_.])universal(?:[-_.]|$)/i.test(asset.name); });
    if (!selected) {
      var generic = candidates.filter(function (asset) { return !assetAbi(asset); });
      if (generic.length === 1) selected = generic[0];
    }
    return { version: data.tag_name.replace(/^v/, ""),
      title: typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 160) : data.tag_name,
      notesByLanguage: {ru:summarizeNotes(localizedNotes(data.body,"ru")),en:summarizeNotes(localizedNotes(data.body,"en"))},
      notes: summarizeNotes(localizedNotes(data.body, language)), url: url, downloadUrl: selected ? selected.browser_download_url : null };
  }
  function create(options) {
    options = options || {};
    var now = options.now || Date.now, storage = options.storage, state = {}, pending = null;
    try { state = JSON.parse(storage.getItem(KEY) || "{}"); } catch (e) {}
    if (!state || typeof state !== "object" || Array.isArray(state)) state = {};
    function save() { try { storage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
    function isDisabled() { return state.disabled === true; }
    function result(status, release) { return { status: status, release: release || null }; }
    function check(settings) {
      var manual = settings && settings.manual, time = now();
      if (!manual && isDisabled()) return Promise.resolve(result("disabled"));
      if (Number(state.blockedUntil) > time || (!manual && Number(state.nextCheck) > time)) return Promise.resolve(result("throttled"));
      if (options.isOnline && !options.isOnline()) return Promise.resolve(result("offline"));
      if (pending) return pending;
      if (typeof options.fetch !== "function") return Promise.resolve(result("error"));
      state.nextCheck = time + DAY; save();
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer, timeout = Math.min(5000, Math.max(1, Number(options.timeoutMs) || 5000));
      var request = Promise.resolve().then(function () {
        return options.fetch(ENDPOINT, { headers: { Accept: "application/vnd.github+json" },
          credentials: "omit", signal: controller ? controller.signal : undefined });
      }).then(function (response) {
        if (response.status === 429 || response.status === 403) {
          var retry = response.headers && response.headers.get("Retry-After");
          var reset = response.headers && response.headers.get("X-RateLimit-Reset");
          var until = retry && /^\d+$/.test(retry) ? now() + Number(retry) * 1000 : Date.parse(retry);
          state.blockedUntil = Math.max(now() + 60000, isFinite(until) ? until : 0, Number(reset) * 1000 || 0);
          save(); return result("throttled");
        }
        if (!response.ok) return result("error");
        return response.json().then(function (data) {
          if (!data || typeof data !== "object" || data.draft || data.prerelease ||
              compareVersions(data.tag_name, options.currentVersion) === null ||
              data.html_url !== REPO + "tag/" + encodeURIComponent(data.tag_name)) return result("error");
          var release = normalizeRelease(data, options.currentVersion, options.abi, options.getLanguage ? options.getLanguage() : "en");
          return result(release ? "available" : "current", release);
        });
      });
      var expired = new Promise(function (resolve) {
        timer = setTimeout(function () { if (controller) controller.abort(); resolve(result("error")); }, timeout);
      });
      pending = Promise.race([request, expired]).catch(function () { return result("error"); }).then(function (value) {
        clearTimeout(timer); pending = null; return value;
      });
      return pending;
    }
    return { check: check, isDisabled: isDisabled,
      disable: function () { state.disabled = true; save(); },
      enable: function () { state.disabled = false; save(); } };
  }
  return { create: create, compareVersions: compareVersions, normalizeRelease: normalizeRelease, summarizeNotes: summarizeNotes };
});
