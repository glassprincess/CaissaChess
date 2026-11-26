"use strict";
const assert = require("assert");
const Updates = require("../assets/web/updates.js");
const repo = "https://github.com/glassprincess/CaissaChess/releases/";
function release(tag, names) {
  return { tag_name: tag, html_url: repo + "tag/" + tag, name: "Caissa " + tag,
    body: "## Changes\n- **Faster** engine\n- [Fixed boards](https://example.org)\n- New puzzles\n- Fourth item",
    assets: (names || []).map(name => ({ name, browser_download_url: repo + "download/" + tag + "/" + name, state: "uploaded" })) };
}
function memory() {
  const values = {};
  return { getItem: key => values[key], setItem: (key, value) => { values[key] = value; } };
}
function response(data, status, headers) {
  return { ok: !status || status === 200, status: status || 200,
    json: () => Promise.resolve(data), headers: { get: key => (headers || {})[key] || null } };
}
(async function () {
  assert.strictEqual(Updates.compareVersions("1.10.0", "1.9.9"), 1);
  assert.strictEqual(Updates.compareVersions("v1.5.2.1", "1.5.2"), 1);
  assert.strictEqual(Updates.compareVersions("1.5.3", "1.5.2.1"), 1);
  assert.strictEqual(Updates.compareVersions("1.5.2.0", "1.5.2"), 0);
  assert.strictEqual(Updates.compareVersions("1.5.2.01", "1.5.2"), null);
  assert.strictEqual(Updates.compareVersions("v1.5.1+build.2", "1.5.1"), 0);
  ["1.5", "01.5.2", "1.5.2-beta", "v1.5.2/evil", "1.5.2\n"].forEach(tag => {
    assert.strictEqual(Updates.compareVersions(tag, "1.5.1"), null);
  });
  let data = release("v1.6.0", ["Caissa-arm64-v8a.apk", "Caissa-armeabi-v7a.apk"]);
  assert.strictEqual(Updates.normalizeRelease(data, "1.5.1").downloadUrl, null);
  assert.ok(Updates.normalizeRelease(data, "1.5.1", "arm64-v8a").downloadUrl.endsWith("Caissa-arm64-v8a.apk"));
  data.assets.push({ name: "Caissa-universal.apk", browser_download_url: repo + "download/v1.6.0/Caissa-universal.apk" });
  assert.ok(Updates.normalizeRelease(data, "1.5.1").downloadUrl.endsWith("Caissa-universal.apk"));
  assert.deepStrictEqual(Updates.normalizeRelease(data, "1.5.1").notes, ["Faster engine", "Fixed boards", "New puzzles"]);
  ["https://github.com.evil.test/glassprincess/CaissaChess/releases/tag/v1.6.0", "javascript:alert(1)", repo + "tag/v1.6.1", repo + "tag/v1.6.0?evil=1"].forEach(url => {
    assert.strictEqual(Updates.normalizeRelease(Object.assign({}, data, { html_url: url }), "1.5.1"), null);
  });
  assert.strictEqual(Updates.normalizeRelease(Object.assign({}, data, { draft: true }), "1.5.1"), null);
  assert.strictEqual(Updates.normalizeRelease(Object.assign({}, data, { prerelease: true }), "1.5.1"), null);
  assert.strictEqual(Updates.normalizeRelease(data, "2.0.0"), null);
  const poisoned = release("v1.6.0", ["Caissa.apk"]);
  poisoned.assets[0].browser_download_url = "https://evil.test/Caissa.apk";
  assert.strictEqual(Updates.normalizeRelease(poisoned, "1.5.1").downloadUrl, null);
  assert.ok(Updates.summarizeNotes("- " + "x".repeat(500)).join("").length <= 320);
  assert.deepStrictEqual(Updates.summarizeNotes("## Header\n```js\nalert(1)\n```\n- <b>Safe</b> `text`"), ["Safe text"]);
  const bilingual = Object.assign({}, data, { body: "<!-- caissa:ru -->\n- Исправлено\n<!-- caissa:en -->\n- Fixed" });
  assert.deepStrictEqual(Updates.normalizeRelease(bilingual, "1.5.1", null, "ru").notes, ["Исправлено"]);
  assert.deepStrictEqual(Updates.normalizeRelease(bilingual, "1.5.1", null, "en").notes, ["Fixed"]);
  assert.deepStrictEqual(Updates.normalizeRelease(bilingual, "1.5.1", null, "ru").notesByLanguage.en, ["Fixed"], "a deferred popup can follow a later language change");
  let time = 1000000000, calls = 0;
  const storage = memory();
  const options = { currentVersion: "1.5.1", storage, now: () => time, fetch: () => { calls++; return Promise.resolve(response(data)); } };
  let checker = Updates.create(options);
  assert.strictEqual((await checker.check()).status, "available");
  assert.strictEqual((await checker.check()).status, "throttled");
  checker = Updates.create(options);
  assert.strictEqual((await checker.check()).status, "throttled");
  time += 86400000;
  assert.strictEqual((await checker.check()).status, "available");
  checker.disable();
  assert.strictEqual(Updates.create(options).isDisabled(), true);
  assert.strictEqual((await checker.check()).status, "disabled");
  assert.strictEqual((await checker.check({ manual: true })).status, "available");
  assert.strictEqual(calls, 3);
  checker.enable(); assert.strictEqual(checker.isDisabled(), false);
  const offline = Updates.create(Object.assign({}, options, { storage: memory(), isOnline: () => false }));
  assert.strictEqual((await offline.check({ manual: true })).status, "offline");
  assert.strictEqual(calls, 3);
  const limited = Updates.create(Object.assign({}, options, { storage: memory(), fetch: () => { calls++; return Promise.resolve(response(null, 429, { "Retry-After": "120" })); } }));
  assert.strictEqual((await limited.check({ manual: true })).status, "throttled");
  const atLimit = calls;
  assert.strictEqual((await limited.check({ manual: true })).status, "throttled");
  assert.strictEqual(calls, atLimit);
  time += 120001;
  await limited.check({ manual: true }); assert.strictEqual(calls, atLimit + 1);
  const failure = Updates.create(Object.assign({}, options, { storage: memory(), fetch: () => Promise.reject(new Error("offline")) }));
  assert.strictEqual((await failure.check({ manual: true })).status, "error");
  for (const invalid of [null, {}, [], "v1.6.0", Object.assign({}, data, { tag_name: "not-semver" }),
    Object.assign({}, data, { draft: true }), Object.assign({}, data, { prerelease: true }),
    Object.assign({}, data, { html_url: "https://evil.test/releases/v1.6.0" })]) {
    const invalidChecker = Updates.create(Object.assign({}, options, { storage: memory(), fetch: () => Promise.resolve(response(invalid)) }));
    assert.strictEqual((await invalidChecker.check({ manual: true })).status, "error");
  }
  for (const tag of ["v1.5.1", "v1.4.0"]) {
    const currentChecker = Updates.create(Object.assign({}, options, { storage: memory(), fetch: () => Promise.resolve(response(release(tag))) }));
    assert.strictEqual((await currentChecker.check({ manual: true })).status, "current");
  }
  const hung = Updates.create(Object.assign({}, options, { storage: memory(), timeoutMs: 5, fetch: () => new Promise(() => {}) }));
  assert.strictEqual((await hung.check({ manual: true })).status, "error");
  const brokenStorage = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  checker = Updates.create(Object.assign({}, options, { storage: brokenStorage }));
  checker.disable(); assert.strictEqual((await checker.check()).status, "disabled");
  assert.strictEqual((await checker.check({ manual: true })).status, "available");
  console.log("Update checks passed: versions, trusted URLs, APK ABI, notes, daily cooldown, opt-out, rate limit, offline, failure, timeout, storage.");
})().catch(error => { console.error(error); process.exitCode = 1; });
