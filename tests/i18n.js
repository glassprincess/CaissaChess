'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const I18n = require('../assets/web/i18n.js');
assert.strictEqual(I18n.getLanguage(), 'ru');
assert.strictEqual(I18n.t('Новая партия'), 'Новая партия');
I18n.setLanguage('en');
const cases = {
  'Новая партия': 'New game', ' Блестящий ход ': ' Brilliant move ',
  'Мат. Победа чёрных.': 'Checkmate. Black wins.',
  'Потеря 12% шансов. Лучше было Nf3': 'Lost 12% winning chances. Better was Nf3',
  'Точность: белые 98.4% · чёрные 82%': 'Accuracy: White 98.4% · Black 82%',
  'Партия 2, ход 8: не удалось разобрать «Qh7#»': 'Game 2, move 8: could not parse “Qh7#”',
  'Разбор: 37%': 'Review: 37%', 'Премув: e4': 'Premove: e4',
  '3 Блестящий ход': '3 Brilliant moves', '2 Зевок': '2 Blunders', '1 Неточность': '1 Inaccuracy', '0 Неточность': '0 Inaccuracies',
  'Движок: Движок не ответил': 'Engine: Engine did not respond',
  'Глубина 18 · 45 полуходов · Точность: белые 90% · чёрные 88% · 2.4 с': 'Depth 18 · 45 plies · Accuracy: White 90% · Black 88% · 2.4 s',
  'Лимит Lichess: подождите не менее минуты.': 'Lichess rate limit: wait at least a minute.',
  'Белые 10, ничьи 6, чёрные 7': 'White 10, draws 6, Black 7'
};
Object.keys(cases).forEach(source => assert.strictEqual(I18n.t(source), cases[source], source));
['Qh7#', '1. e4 e5 2. Nf3', 'Иван Петров', '[White "Белые"]', 'https://lichess.org'].forEach(value => assert.strictEqual(I18n.t(value), value));
const html = fs.readFileSync(path.join(__dirname, '../assets/web/index.html'), 'utf8');
const staticStrings = Array.from(html.matchAll(/>([^<>]+)</g), match => match[1].trim()).concat(Array.from(html.matchAll(/(?:title|aria-label|placeholder|alt)="([^"]+)"/g), match => match[1]));
staticStrings.filter(text => /[А-Яа-яЁё]/.test(text) && text !== 'Русский').forEach(text => assert.notStrictEqual(I18n.t(text), text, 'Static UI translation: ' + text));
I18n.setLanguage('ru');
assert.strictEqual(I18n.t('Настройки'), 'Настройки');
assert.strictEqual(I18n.setLanguage('invalid'), 'ru');
console.log('i18n catalogue/templates/preservation passed');

if (process.argv.indexOf('--browser') >= 0) {
  const http = require('http');
  const os = require('os');
  const spawn = require('child_process').spawn;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'caissa-i18n-'));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let server, browser, socket;
  async function browserTest() {
    server = http.createServer((req, res) => {
      if (req.url === '/i18n.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(fs.readFileSync(path.join(__dirname, '../assets/web/i18n.js'))); }
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><title>i18n test</title><body><button id="button" aria-label="Настройки" title="Сохранить">Новая партия</button><select id="select"><option value="w">Белые</option><option value="b">Чёрные</option></select><textarea id="text" placeholder="Поиск дебюта">[White "Белые"]</textarea><input id="field"><span class="who">Белые</span><p data-i18n-skip>Настройки</p><script src="i18n.js"></script><script>CaissaI18n.observe();CaissaI18n.setLanguage("en");var mutations=0;new MutationObserver(function(r){mutations+=r.length}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});</script></body></html>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = spawn(process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--no-first-run', '--remote-debugging-port=19371', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let tabs;
    for (let i = 0; i < 100; i++) { try { tabs = await (await fetch('http://127.0.0.1:19371/json')).json(); break; } catch (error) { await sleep(100); } }
    assert.ok(tabs, 'Browser launched');
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let seq = 0; const pending = new Map();
    socket.addEventListener('message', event => { const result = JSON.parse(event.data); if (!result.id) return; const action = pending.get(result.id); pending.delete(result.id); result.error ? action.reject(Error(result.error.message)) : action.resolve(result.result); });
    function cdp(method, params) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
    async function js(expression) { const result = await cdp('Runtime.evaluate', { expression, returnByValue: true }); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
    await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/' });
    await sleep(300);
    assert.deepStrictEqual(await js('[document.documentElement.lang,button.textContent,button.title,button.getAttribute("aria-label"),select.options[0].textContent,select.value,text.placeholder,text.value,document.querySelector(".who").textContent,document.querySelector("[data-i18n-skip]").textContent]'), ['en', 'New game', 'Save', 'Settings', 'White', 'w', 'Search openings', '[White "Белые"]', 'Белые', 'Настройки']);
    await js('button.textContent="Перевернуть";button.setAttribute("aria-label","Следующий ход");var late=document.createElement("div");late.id="late";late.textContent="Разбор: 27%";document.body.appendChild(late);field.setCustomValidity("Неверный FEN")');
    await sleep(50);
    assert.deepStrictEqual(await js('[button.textContent,button.getAttribute("aria-label"),late.textContent,field.validationMessage]'), ['Flip board', 'Next move', 'Review: 27%', 'Invalid FEN']);
    await js('CaissaI18n.setLanguage("ru")');
    assert.deepStrictEqual(await js('[button.textContent,button.title,button.getAttribute("aria-label"),late.textContent,field.validationMessage,text.placeholder,text.value]'), ['Перевернуть', 'Сохранить', 'Следующий ход', 'Разбор: 27%', 'Неверный FEN', 'Поиск дебюта', '[White "Белые"]']);
    await js('button.firstChild.nodeValue="Сохранить";CaissaI18n.setLanguage("en")');
    await sleep(50);
    assert.strictEqual(await js('button.textContent'), 'Save');
    const count = await js('mutations');
    await sleep(100);
    assert.strictEqual(await js('mutations'), count, 'Mutation observer reaches an idle state');
    await js('CaissaI18n.setLanguage("ru")');
    assert.strictEqual(await js('button.textContent'), 'Сохранить', 'Latest app-provided source survives language round trips');
    console.log('i18n browser passed: dynamic DOM/attributes/options, user data preserved, language round trips, custom validity, no observer loop');
  }
  browserTest().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (socket) socket.close(); if (browser) browser.kill();
    if (server) { server.closeAllConnections(); server.close(); }
    await sleep(300); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (error) {}
  });
}
