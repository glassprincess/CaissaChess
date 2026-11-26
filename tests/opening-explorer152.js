'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const Chess=require('../assets/web/chess'),Pgn=require('../assets/web/pgn');
const code=fs.readFileSync(require.resolve('../assets/web/opening-explorer'),'utf8');
const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),key:i=>Array.from(values.keys())[i],get length(){return values.size;}};
const fen=Chess.toFen(Chess.startState());let calls=[];
const data={white:100,draws:50,black:60,moves:[{uci:'e2e4',white:100,draws:50,black:60}],recentGames:[{id:'abcd1234',white:{name:'White player',rating:1700},black:{name:'Black player',rating:1800},year:2025},{id:'../../evil'},{id:'abcd1234'}]};
function env(fetch,extra){const root=Object.assign({ChessLogic:Chess,FisherPgn:Pgn,localStorage:storage,navigator:{onLine:true},AbortController,setTimeout,clearTimeout,Date,fetch},extra);vm.runInNewContext(code,root);return root.OpeningExplorer;}
(async()=>{
 const explorer=env(async url=>{calls.push(url);return {ok:true,status:200,headers:{get:()=>null},json:async()=>data,text:async()=> '[Event "Example"]\n1. e4 e5 2. Nf3 Nc6 *'};});
 const players=await explorer.lookup(fen,{source:'lichess'});
 assert(calls[0].startsWith('https://explorer.lichess.ovh/lichess?'));
 assert(calls[0].includes('recentGames=3'));assert.strictEqual(players.source,'lichess');assert.strictEqual(players.games.length,1);
 assert.strictEqual(players.games[0].id,'abcd1234');assert.strictEqual(players.moves[0].san,'e4');
 await explorer.lookup(fen);assert(calls[1].includes('/masters?'),'players and masters never share cache entries');
 const game=await explorer.game('abcd1234');assert(game.includes('e4 e5'));assert(calls[2].startsWith('https://lichess.org/game/export/abcd1234?'));
 await assert.rejects(explorer.game('../../evil'));assert.strictEqual(calls.length,3);
 const offline=env(()=>{throw Error('offline');},{navigator:{onLine:false}});
 assert.strictEqual((await offline.lookup(fen,{source:'lichess'})).games[0].id,'abcd1234');assert.strictEqual(await offline.game('abcd1234'),game);
 const invalid=env(async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>'<html>not PGN</html>'}));await assert.rejects(invalid.game('invalid1'));
 let clock=0,requests=0;class Clock extends Date{static now(){return clock;}}
 const limited=env(async()=>{requests++;return {status:429,ok:false,headers:{get:()=>null}};},{Date:Clock});
 await assert.rejects(limited.game('rate1234'));await assert.rejects(limited.game('rate5678'));assert.strictEqual(requests,1);
 let playerCalls=0,masterCalls=0;
 const fallback=env(async url=>{if(url.includes('/lichess?')){playerCalls++;return {ok:false,status:401};}masterCalls++;return {ok:true,status:200,json:async()=>Object.assign({},data,{recentGames:undefined,topGames:data.recentGames})};});
 const reserve=await fallback.lookup(fen,{source:'lichess',refresh:true});assert.equal(reserve.source,'masters');assert.equal(reserve.games[0].source,'masters');
 await fallback.lookup(Chess.toFen(Chess.apply(Chess.startState(),Chess.legalMoves(Chess.startState()).find(m=>Chess.uci(m)==='d2d4'))),{source:'lichess',refresh:true});assert.equal(playerCalls,1,'401 must not repeat for every position');assert(masterCalls>=2);
 let upgrades=0;
 const upgrade=env(async()=>{upgrades++;return {ok:true,status:200,json:async()=>data};});
 await upgrade.lookup(fen,{refresh:true});const old=upgrades;
 await upgrade.lookup(fen,{games:true});assert.equal(upgrades,old+1,'old cache without game metadata is refreshed once for the new game list');
 await upgrade.lookup(fen,{games:true});assert.equal(upgrades,old+1,'a current game-aware cache is reused');
 console.log('ok opening explorer152: player games, separate cache, safe PGN import, offline reuse, malformed PGN and shared rate cooldown');
})().catch(e=>{console.error(e);process.exitCode=1;});
