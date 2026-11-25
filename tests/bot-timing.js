'use strict';
const assert=require('assert');
const Game=require('../assets/web/game-session.js');
const strongest=Game.profile(4000);
assert.deepStrictEqual(Game.botTiming(strongest,null,0,()=>.5),{movetime:3000,totalMs:3000});
let remaining=60000;
for(let turn=0;turn<100;turn++){
  const plan=Game.botTiming(strongest,remaining,0,()=>.99);
  assert.ok(plan.movetime>0 && plan.movetime<=plan.totalMs);
  assert.ok(plan.totalMs<=remaining/50,'bullet budget adapts to remaining clock');
  remaining-=plan.totalMs+15;
}
assert.ok(remaining>10000,'strong bot survives a long bullet game without free time');
const fast=Game.botTiming(strongest,900,0,()=>.99);
assert.ok(fast.totalMs<30 && fast.movetime<=fast.totalMs);
assert.ok(Game.botTiming(strongest,60000,0,()=>0).totalMs<Game.botTiming(strongest,60000,0,()=>.99).totalMs);
assert.ok(Game.botTiming(strongest,60000,2000,()=>.99).totalMs>Game.botTiming(strongest,60000,0,()=>.99).totalMs);
assert.ok(Game.botTiming(Game.profile(250),180000,0,()=>.5).movetime<=180);
console.log('ok bot timing: bullet survival, low-clock pace, increment, jitter, rating and unrestricted untimed search');
