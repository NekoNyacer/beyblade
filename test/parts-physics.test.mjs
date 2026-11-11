import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,stepBattle} from '../game.mjs';
import {PART_CATALOG,physicsForParts,assemblyOffsets} from '../public/assets/part-catalog.js';
const selection=(kind,index)=>({blade:0,ratchet:0,bit:0,[kind]:index});
function free(kind,index,seconds=.3){
 const battle=createBattle([{id:'a',parts:selection(kind,index)},{id:'b'}],77),top=battle.tops[0];battle.t=7;
 Object.assign(top,{x:0,z:0,y:0,vy:0,vx:1.5,vz:0,energy:95,precessionPhase:1});
 Object.assign(battle.tops[1],{x:-2,z:0,y:2,vx:0,vz:0,drag:0});
 for(let j=0;j<Math.round(seconds*100);j++)stepBattle(battle,.01);
 return top;
}
test('nine original parts have distinct names, geometry traits and composed physics',()=>{
 for(const kind of ['blade','ratchet','bit']){
  assert.equal(PART_CATALOG[kind].length,3);
  assert.equal(new Set(PART_CATALOG[kind].map(p=>p.id)).size,3);
  assert.equal(new Set([0,1,2].map(i=>JSON.stringify(physicsForParts(selection(kind,i))))).size,3);
 }
 assert.deepEqual(PART_CATALOG.blade.map(p=>p.lobes),[3,6,0]);
 assert.deepEqual(PART_CATALOG.ratchet.map(p=>p.lobes),[3,6,9]);
 assert.deepEqual(PART_CATALOG.bit.map(p=>p.profile),['flat','ball','needle']);
 assert.ok(assemblyOffsets({ratchet:1}).blade>assemblyOffsets({ratchet:0}).blade);
 assert.ok(assemblyOffsets({ratchet:2}).blade<assemblyOffsets({ratchet:0}).blade);
});
test('one-part swaps preserve launch input but change measured spin loss',()=>{
 for(const kind of ['blade','ratchet','bit']){
  const battles=[0,1,2].map(index=>createBattle([{id:'a',parts:selection(kind,index)},{id:'b'}],77));
  assert.deepEqual(battles.map(b=>b.tops[0].energy),[95,95,95]);
  assert.equal(new Set(battles.map(b=>b.tops[0].vx)).size,1);
  const measured=[0,1,2].map(i=>free(kind,i));
  assert.equal(new Set(measured.map(t=>t.energy.toFixed(3))).size,3);
 }
 const blades=[0,1,2].map(i=>free('blade',i));assert.ok(blades[2].energy>blades[1].energy&&blades[1].energy>blades[0].energy);
});
test('flat, ball and needle have observable drive and endurance trade-offs',()=>{
 const tips=[0,1,2].map(i=>free('bit',i)),speeds=tips.map(t=>Math.hypot(t.vx,t.vz));
 assert.ok(speeds[0]>speeds[1]*1.1&&speeds[1]>speeds[2]*1.1,JSON.stringify(speeds));
 assert.ok(tips[2].energy>tips[1].energy&&tips[1].energy>tips[0].energy);
});
test('ratchet height and balance change precession under the same launch',()=>{
 const tops=[0,1,2].map(i=>free('ratchet',i));
 assert.ok(tops[1].z>tops[0].z*1.2&&tops[0].z>tops[2].z*1.2);
 assert.ok(tops[1].energy<tops[0].energy&&tops[0].energy<tops[2].energy);
});
test('a heavier shield recoils less and a smooth ring redirects less speed upward',()=>{
 function impact(index){const b=createBattle([{id:'a',parts:selection('blade',index)},{id:'b'}],77);
  Object.assign(b.tops[0],{x:-.45,z:0,y:.4,vy:0,vx:0,vz:0,energy:95,drag:0});
  Object.assign(b.tops[1],{x:.45,z:0,y:.4,vy:0,vx:-8,vz:0,energy:95,drag:0});stepBattle(b,.01);
  assert.ok(b.events.some(e=>e.type==='hit'));return b.tops[0];}
 const a=impact(0),b=impact(1),c=impact(2);
 assert.ok(Math.hypot(b.vx,b.vz,b.vy)<Math.hypot(a.vx,a.vz,a.vy));
 assert.ok(a.vy>b.vy&&b.vy>c.vy);
});
test('the three bit gears have distinct finite rail acceleration',()=>{
 const speeds=[];
 for(let i=0;i<3;i++){
  const b=createBattle([{id:'a',parts:selection('bit',i)},{id:'b'}],77),a=b.tops[0],angle=.3,r=b.railRadius;
  Object.assign(a,{x:r*Math.cos(angle),z:r*Math.sin(angle),spin:angle,vx:5*Math.sin(angle),vz:-5*Math.cos(angle),drag:0});
  Object.assign(b.tops[1],{x:0,z:0,y:0,vx:0,vz:0,drag:0});stepBattle(b,.01);assert.equal(a.railActive,true);speeds.push(Math.hypot(a.vx,a.vz));
 }
 assert.ok(speeds[0]>speeds[1]&&speeds[1]>speeds[2]);
});
test('all 27 combinations are deterministic, finite and finish; mixed 16-player bowls settle',()=>{
 const combinations=[];for(let blade=0;blade<3;blade++)for(let ratchet=0;ratchet<3;ratchet++)for(let bit=0;bit<3;bit++)combinations.push({blade,ratchet,bit});
 for(const [index,parts] of combinations.entries()){
  const players=[{id:'a',parts},{id:'b',parts:combinations[(index+13)%27]}],a=createBattle(players,200+index),b=structuredClone(a);
  while(!a.done&&a.t<60){stepBattle(a);stepBattle(b);assert.deepEqual(a,b);for(const top of a.tops){assert.ok(Number.isFinite(top.x+top.z+top.y+top.energy));assert.ok(top.energy>=0);assert.ok(Math.hypot(top.vx,top.vz)<=14+1e-8);}}
  assert.ok(a.done,'combination '+index+' resolves');assert.equal(a.eliminated.length,1);
 }
 for(const seed of [7,55,123]){const b=createBattle(Array.from({length:16},(_,i)=>({id:String(i),parts:combinations[(i+seed)%27]})),seed);
  while(!b.done&&b.t<60)stepBattle(b);assert.ok(b.done);assert.equal(b.eliminated.length,15);}
});
test('restored states derive physics from parts and ignore stale tuning fields',()=>{
 const a=createBattle([{id:'a',parts:{blade:2,ratchet:1,bit:2}},{id:'b'}],77),b=JSON.parse(JSON.stringify(a));
 for(const top of b.tops)top.physics={mass:NaN};stepBattle(a);stepBattle(b);assert.deepEqual(a,b);
});
