'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const {spawn} = require('child_process');
const web = path.join(__dirname, '../assets/web');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'caissa-appearance-'));
let server, processHandle, socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
  server = http.createServer((request, response) => {
    if (request.method === 'POST') {
      request.resume();
      request.on('end', () => { response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true,"lines":[]}'); });
      return;
    }
    const filename = path.join(web, request.url === '/' ? 'index.html' : request.url);
    fs.readFile(filename, (error, data) => {
      response.setHeader('Content-Type', ({'.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(filename)] || 'text/html');
      response.statusCode = error ? 404 : 200;
      response.end(error ? 'missing' : data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = 19379;
  processHandle = spawn(process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'], {windowsHide:true, stdio:'ignore'});
  let tabs;
  for (let i=0; i<100; i++) { try { tabs=await (await fetch('http://127.0.0.1:'+port+'/json')).json(); break; } catch { await delay(100); } }
  assert(tabs, 'Browser starts');
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message=JSON.parse(event.data);
    if (!message.id) return;
    const promise=pending.get(message.id); pending.delete(message.id);
    message.error ? promise.reject(Error(message.error.message)) : promise.resolve(message.result);
  });
  const cdp = (method, params={}) => new Promise((resolve,reject) => { const id=++sequence; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params})); });
  const js = async expression => { const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}); if(result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  await delay(700);
  for (const width of [320,390,768]) {
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    for (const language of ['ru','en']) {
      await js(`CaissaI18n.setLanguage(${JSON.stringify(language)})`);
      await js("document.getElementById('settingsBtn').click()");
      const settings = await js(`(() => {
        const fields=[...document.querySelectorAll('.modal label.field')];
        const buttons=[document.getElementById('settingsCancel'),document.getElementById('setSave')].map(button=>button.getBoundingClientRect());
        const selects=fields.filter(field=>field.querySelector('select'));
        return {widths:buttons.map(rect=>rect.width), gap:buttons[1].left-buttons[0].right, labelGaps:selects.slice(0,-1).map((field,i)=>selects[i+1].getBoundingClientRect().top-field.getBoundingClientRect().bottom)};
      })()`);
      assert(Math.abs(settings.widths[0]-settings.widths[1])<1, 'Equal settings widths');
      assert(settings.gap>=16, 'Settings actions remain separated');
      assert(settings.labelGaps.every(gap=>gap>=14), 'Settings labels leave room for focus rings');
      await js("document.getElementById('settingsCancel').click()");
      await js(`(() => { document.getElementById('modalRoot').classList.remove('hidden'); document.getElementById('modalBox').innerHTML='<div class="modal-actions result-actions"><button id="resultNew" class="ghost">${language==='ru'?'Новая партия':'New game'}</button><button id="resultReview" class="primary">${language==='ru'?'Разобрать партию':'Review game'}</button></div><button class="ghost wide" data-close="1">${language==='ru'?'К доске':'Return to board'}</button>'; })()`);
      const result = await js(`(() => {const a=document.getElementById('resultNew').getBoundingClientRect(),b=document.getElementById('resultReview').getBoundingClientRect(),r=document.querySelector('.result-actions + button'),c=r.getBoundingClientRect(),m=r.parentNode.getBoundingClientRect();return {widths:[a.width,b.width],gap:b.left-a.right,height:[a.height,b.height],center:Math.abs((c.left+c.right)/2-(m.left+m.right)/2),text:getComputedStyle(r).textAlign};})()`);
      assert(Math.abs(result.widths[0]-result.widths[1])<1, 'Equal result widths');
      assert(result.gap>=16 && result.height[0]===result.height[1], 'Result actions align');
      assert(result.center<1 && result.text==='center', 'Return to board is centered');
      await js("document.getElementById('modalRoot').classList.add('hidden');document.getElementById('modalBox').innerHTML=''");
    }
  }
  for (const theme of ['classic','gruvbox','catppuccin']) {
    const icon = await js(`(() => {CaissaAppearance.apply({theme:${JSON.stringify(theme)}}); const header=getComputedStyle(document.querySelector('.brand'),'::before'),launch=getComputedStyle(document.getElementById('launch'),'::before'); return {header:header.backgroundColor,launch:launch.backgroundColor,mask:header.maskImage,accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()};})()`);
    const expected={classic:'#81b64c',gruvbox:'#fabd2f',catppuccin:'#cba6f7'}[theme];
    assert.strictEqual(icon.accent,expected);
    assert.strictEqual(icon.header,icon.launch, 'Header and launch share the theme color');
    assert(icon.mask.includes('caissa-queen.svg'), 'Use the selected queen and laurel silhouette');
  }
  console.log('ok appearance 1.5.1: RU/EN at 320, 390, 768px; settings spacing, equal actions, centered return, 3 themed queen silhouettes');
}
run().catch(error => {console.error(error); process.exitCode=1;}).finally(async () => {
  if(socket) socket.close();
  if(processHandle) processHandle.kill();
  if(server) await new Promise(resolve=>server.close(resolve));
});
