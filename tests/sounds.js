const assert=require('assert');
const Audio=require('../assets/web/sounds.js');
let started=[],gains=[],resume=0,settings={sound:true,volume:75};
const ctx={state:'suspended',destination:{},currentTime:0,resume(){resume++;this.state='running';return Promise.resolve();},
 decodeAudioData(bytes,done){done({duration:.3,key:new Uint8Array(bytes)[0]});},
 createGain(){const g={gain:{value:0},connect(){}};gains.push(g);return g;},
 createBufferSource(){return {connect(){},start(){started.push(this.buffer.key);setTimeout(()=>this.onended(),1);}};}};
const requests=[];
const sound=Audio.create({context:ctx,getSettings:()=>settings,fetch:url=>{requests.push(url);return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new Uint8Array([requests.length]).buffer)});}});
(async()=>{
 await sound.preload();await sound.unlock();
 assert.strictEqual(requests.length,9);assert.strictEqual(new Set(requests).size,9);
 assert.ok(requests.includes('sounds/capture.mp3'));
 await sound.play('castle');assert.strictEqual(started.length,1);assert.strictEqual(gains[0].gain.value,.75);
 await sound.play('game-end');assert.strictEqual(started.length,2);
 settings.volume=0;await sound.play('move');assert.strictEqual(started.length,2);
 await sound.play('move',60);assert.strictEqual(started.length,3);assert.strictEqual(gains[2].gain.value,.6);
 settings.volume=100;settings.sound=false;await sound.play('check');assert.strictEqual(started.length,3);
 assert.ok(resume>0);
 assert.strictEqual(sound.eventForMove({san:'O-O+'}),'check');
 assert.strictEqual(sound.eventForMove({san:'O-O'}),'castle');
 assert.strictEqual(sound.eventForMove({san:'a8=Q'}),'promote');
 assert.strictEqual(sound.eventForMove({san:'Nxe5'}),'capture');
 assert.strictEqual(sound.eventForMove({san:'exd6'}),'capture');
 assert.strictEqual(sound.eventForMove({san:'e4'}),'move');
 console.log('ok nine original sounds, capture/en passant, preload/cache, ended promise, volume/mute, move priorities');
})().catch(e=>{console.error(e);process.exitCode=1;});
