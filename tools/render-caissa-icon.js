'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const {spawn, spawnSync} = require('child_process');
const project = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(project, 'docs/branding/caissa-01.svg'), 'utf8');
const res = path.join(project, 'app/src/main/res');
const output = path.join(project, 'tests/build/queen-icon');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'caissa-icon-'));
const browser = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let proc, socket;
async function main() {
  fs.mkdirSync(output, {recursive:true});
  fs.copyFileSync(path.join(project, 'docs/branding/caissa-01.svg'), path.join(project, 'assets/web/caissa-queen.svg'));
  const paths = Array.from(source.matchAll(/<path d="([^"]+)"/g), match => match[1]);
  if (paths.length !== 2) throw Error('Expected queen and laurel paths');
  fs.writeFileSync(path.join(res, 'drawable/ic_launcher.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp" android:height="108dp"\n    android:viewportWidth="128" android:viewportHeight="128">\n' + paths.map(d => '    <path android:fillColor="#81B64C" android:pathData="' + d + '" />').join('\n') + '\n</vector>\n');
  fs.writeFileSync(path.join(res, 'drawable/ic_launcher_foreground.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<inset xmlns:android="http://schemas.android.com/apk/res/android"\n    android:drawable="@drawable/ic_launcher"\n    android:insetLeft="17dp" android:insetTop="17dp"\n    android:insetRight="17dp" android:insetBottom="17dp" />\n');
  proc=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=19372','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let tabs;
  for(let i=0;i<100;i++) {try {tabs=await (await fetch('http://127.0.0.1:19372/json')).json();break;} catch(e) {await delay(100);}}
  if(!tabs) throw Error('Icon renderer did not start');
  socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  let seq=0;const pending=new Map();
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}});
  function cdp(method,params) {return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
  await cdp('Emulation.setDeviceMetricsOverride',{width:1024,height:1024,deviceScaleFactor:1,mobile:false});
  await cdp('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  const document = '<html><body style="margin:0;background:transparent">'+source.replace('<svg ','<svg width="1024" height="1024" ')+'</body></html>';
  await cdp('Runtime.evaluate',{expression:'document.write('+JSON.stringify(document)+');document.close();'});
  const shape=await cdp('Runtime.evaluate',{expression:'Math.max.apply(null,Array.from(document.querySelectorAll("path")).map(function(p){var max=0;for(var t=0;t<=p.getTotalLength();t+=.05){var q=p.getPointAtLength(t);max=Math.max(max,Math.hypot(q.x-64,q.y-64)*74/128);}return max;}))',returnByValue:true});
  if(shape.result.value>33)throw Error('Adaptive paths exceed safe circle: '+shape.result.value);
  const shot=await cdp('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:1024,height:1024,scale:1}});
  fs.writeFileSync(path.join(output,'master.png'),Buffer.from(shot.data,'base64'));
  const python = String.raw`from PIL import Image, ImageDraw
from pathlib import Path
root=Path.cwd(); master=Image.open(root/'tests/build/queen-icon/master.png').convert('RGBA')
assert master.getpixel((0,0))[3]==0
for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    image=master.resize((size,size),Image.Resampling.LANCZOS)
    assert image.getextrema()[3]==(0,255)
    assert image.getbbox()[0]>0 and image.getbbox()[2]<size
    image.save(root/('app/src/main/res/mipmap-'+density)/'ic_launcher.png')
preview=Image.new('RGB',(600,230),'#262421')
for x,size in [(20,24),(90,48),(190,192)]:
    icon=master.resize((size,size),Image.Resampling.LANCZOS);preview.paste(icon,(x,20),icon)
    ImageDraw.Draw(preview).text((x,215),str(size)+'px',fill='white')
adaptive=master.resize((148,148),Image.Resampling.LANCZOS)
preview.paste(adaptive,(438,34),adaptive)
ImageDraw.Draw(preview).ellipse((446,42,578,174),outline='#555555')
preview.save(root/'tests/build/queen-icon/preview.png')
print('Transparent PNG icons: 48,72,96,144,192; previews:24,48,192; adaptive safe radius <=33dp')`;
  const result=spawnSync('python',['-c',python],{cwd:project,encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error(result.stderr||result.stdout);
  console.log(result.stdout.trim());
  console.log('Adaptive maximum path radius: '+shape.result.value.toFixed(3)+'dp');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(socket)socket.close();if(proc)proc.kill();});
