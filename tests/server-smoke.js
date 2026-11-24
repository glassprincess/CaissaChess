'use strict';
const {spawn}=require('child_process');
const path=require('path'),fs=require('fs'),assert=require('assert');
const port=19367, base='http://127.0.0.1:'+port;
const secretDir=path.join(__dirname,'../assets/web-private-smoke');
fs.mkdirSync(secretDir,{recursive:true});fs.writeFileSync(path.join(secretDir,'secret.txt'),'private');
const proc=spawn(process.execPath,[path.join(__dirname,'../tools/dev-server.js')],{env:Object.assign({},process.env,{PORT:String(port)}),windowsHide:true});
async function run(){
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server start timeout')),25000);proc.stdout.once('data',()=>{clearTimeout(timer);resolve();});proc.once('error',reject);});
 const traversal=await fetch(base+'/..%2fweb-private-smoke/secret.txt');
 assert.strictEqual(traversal.status,403,'не отдаём соседнюю папку с общим префиксом');
 const malformed=await fetch(base+'/%ZZ');assert.strictEqual(malformed.status,400);
 assert.strictEqual((await fetch(base+'/')).status,200,'сервер продолжает работать');
 console.log('ok   PC server: path boundary, malformed URL, continued service');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{proc.kill();fs.rmSync(secretDir,{recursive:true,force:true});});
