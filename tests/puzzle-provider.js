'use strict';
const assert=require('assert'), Provider=require('../assets/web/puzzle-provider.js'), Chess=require('../assets/web/chess.js'), Pgn=require('../assets/web/pgn.js');
const fixture={game:{id:'test',pgn:'e4 e5 Nf3 Nc6 Bb5 a6'},puzzle:{id:'abc12',rating:1500,solution:['b5c6'],themes:['advantage']}};
const stored={}, storage={getItem:k=>stored[k]||null,setItem:(k,v)=>stored[k]=v};
async function run(){
 const offlineData=require('../assets/web/puzzles.json').puzzles;
 const mixedStored={}, mixedStorage={getItem:k=>mixedStored[k]||null,setItem:(k,v)=>mixedStored[k]=v};
 const cachedPair=offlineData.filter(p=>p.rating>=1400 && p.rating<1900).slice(0,2).map(p=>Object.assign({},p,{online:true}));
 mixedStorage.setItem('caissa.trainer.puzzles.v1',JSON.stringify(cachedPair.concat(Provider.normalize(fixture,Chess,Pgn))));
 let mixed=Provider.create({Chess,Pgn,storage:mixedStorage,isOnline:()=>false,random:()=>0.37});
 const rangePool=offlineData.filter(p=>p.rating>=1400 && p.rating<1900).concat(Provider.normalize(fixture,Chess,Pgn)), cycle=new Set();
 for(let i=0;i<rangePool.length;i++) {
   if(i===17) mixed=Provider.create({Chess,Pgn,storage:mixedStorage,isOnline:()=>false,random:()=>0.37});
   const item=await mixed.next('medium',offlineData);
   assert(item && item.rating>=1400 && item.rating<1900,'offline deck respects selected rating');
   assert(!cycle.has(item.id),'cached pair must not repeat before the full offline range is exhausted'); cycle.add(item.id);
 }
 assert.equal(cycle.size,rangePool.length);
 assert(await mixed.next('medium',offlineData),'full cycle starts another shuffled cycle');
 const allCycle=new Set();
 for(let i=0;i<offlineData.length+1;i++) {
   const item=await mixed.next('all',offlineData);
   assert(!allCycle.has(item.id),'all 600 offline puzzles participate before a repeat'); allCycle.add(item.id);
 }
 assert.equal(allCycle.size,601,'all 600 offline items and the distinct cached puzzle participate');
 let repeatedCalls=0;
 const repeated=Provider.create({Chess,Pgn,storage:{getItem:()=>null,setItem:()=>{}},fetch:async()=>{repeatedCalls++;return {ok:true,status:200,json:async()=>fixture};}});
 const firstOnline=await repeated.next('medium',offlineData), secondOnline=await repeated.next('medium',offlineData);
 assert.equal(firstOnline.id,'abc12','fresh online puzzle is preferred');
 assert.notEqual(secondOnline.id,firstOnline.id,'duplicate API answer falls into the unseen combined deck');
 assert.equal(repeatedCalls,2,'each next action makes at most one official API call');
 let calls=0, fail=true, status=200, now=0;
 const provider=Provider.create({Chess,Pgn,storage,now:()=>now,fetch:async()=>{calls++;if(fail)throw Error('offline');return {ok:status===200,status,json:async()=>fixture};}});
 assert.equal(await provider.next('all'),null); assert.equal(calls,1);
 fail=false; now=30001; const puzzle=await provider.next('all'); assert.equal(puzzle.id,'abc12'); assert.equal(puzzle.setup,'a7a6'); assert(puzzle.online);
 assert.equal(Chess.toFen(Chess.apply(Chess.fromFen(puzzle.fen),Chess.legalMoves(Chess.fromFen(puzzle.fen)).find(m=>Chess.uci(m)===puzzle.setup))).split(' ')[1],'w');
 fail=true; now+=30001; assert.equal((await provider.next('all')).id,'abc12','network errors reuse validated cached puzzles');
 fail=false;status=429;now+=30001;await provider.next('all');const requests=calls; now+=30001;await provider.next('all');assert.equal(calls,requests,'429 stops requests for at least one minute');
 now+=60001; status=200; await provider.next('all');assert(calls>requests,'network is retried after cooldown');
 const invalid=JSON.parse(JSON.stringify(fixture));invalid.puzzle.solution=['a1a8'];assert.equal(Provider.normalize(invalid,Chess,Pgn),null);
 const cached=Provider.create({Chess,Pgn,storage,fetch:async()=>{throw Error('offline');}}); assert.equal((await cached.next('all')).id,'abc12');
 assert.equal(await cached.next('hard'),null,'cached puzzles respect selected rating');
 let offlineCalls=0;
 const offline=Provider.create({Chess,Pgn,storage,isOnline:()=>false,fetch:async()=>{offlineCalls++; throw Error('must not request offline');}});
 assert.equal((await offline.next('all')).id,'abc12'); assert.equal(offlineCalls,0,'known offline state returns without a network timeout');
 let concurrent=0, finish;
 const shared=Provider.create({Chess,Pgn,fetch:()=>{concurrent++;return new Promise(r=>finish=r);}});
 const first=shared.next('all'), second=shared.next('all'); await Promise.resolve();
 assert.equal(concurrent,1); finish({ok:true,status:200,json:async()=>fixture});
 assert.equal((await first).id,'abc12'); assert.equal((await second).id,'abc12');
 const serverError=Provider.create({Chess,Pgn,fetch:async()=>({ok:false,status:503})}); assert.equal(await serverError.next('all'),null);
 const timedOut=Provider.create({Chess,Pgn,fetch:()=>new Promise(()=>{})}); const began=Date.now();
 assert.equal(await timedOut.next('all'),null); assert(Date.now()-began<4500,'hung API request cannot strand training');
 console.log('puzzle provider: legal normalization, online preference, persisted cache, failure recovery, 429 cooldown passed');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
