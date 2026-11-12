import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,launchBattle,stepBattle} from '../public/assets/battle-physics.js';
import {surfaceHeight} from '../public/assets/rail-config.js';
import {applyLaunchPull} from '../public/assets/ripcord.js';
const players=[{id:'0',parts:{blade:0,ratchet:0,bit:0}},{id:'1',parts:{blade:1,ratchet:0,bit:1}}];
function contact(radial=5,tangent=-5,patch={}){
 const battle=createBattle(players,21),top=battle.tops[0],angle=.3,r=battle.railRadius,nx=Math.cos(angle),nz=Math.sin(angle);
 Object.assign(top,{x:r*nx,z:r*nz,y:surfaceHeight(r*nx,r*nz,battle.arenaRadius),vy:0,spin:angle,vx:radial*nx-tangent*nz,vz:radial*nz+tangent*nx,drag:0,...patch});
 Object.assign(battle.tops[1],{x:0,z:0,y:0,vx:0,vz:0,drag:0});return battle;
}
test('a grounded 45-degree oblique approach meshes without a forced position or speed',()=>{
 const battle=contact(),top=battle.tops[0],before={x:top.x,z:top.z,energy:top.energy};stepBattle(battle,.01);
 assert.ok(top.railActive&&battle.events.some(e=>e.type==='rail'&&e.phase==='enter'));
 assert.ok(top.energy<before.energy);assert.ok(Math.hypot(top.x-before.x,top.z-before.z)<.14);
 assert.equal(top.y,surfaceHeight(top.x,top.z,battle.arenaRadius));assert.ok(Math.hypot(top.vx,top.vz)<=14);
});
test('the wider approach still rejects square strikes, poor alignment, low speed, low spin and airborne contact',()=>{
 const cases=[contact(7,-5),contact(5,-5,{spin:.3+Math.PI/8}),contact(1,-1.8),contact(5,-5,{energy:25}),contact(5,-5,{y:2,vy:1})];
 for(const battle of cases){stepBattle(battle,.01);assert.equal(battle.tops[0].railActive,false);assert.ok(!battle.events.some(e=>e.phase==='enter'));}
 assert.ok(cases[0].events.some(e=>e.type==='rail-bounce'));
});
test('real mixed-part practice launches visibly reach the outlet without guaranteeing it',()=>{
 let withPort=0,playerPorts=0,dashHits=0;
 for(let seed=1;seed<=80;seed++){
  // Match practice.js: measured player pull plus the opponent's standard launch.
  const battle=launchBattle(players,seed,{'0':.5});applyLaunchPull(battle.tops[0],.5,0);
  let port=false,playerPort=false;
  while(!battle.done&&battle.t<60){stepBattle(battle);for(const e of battle.events){port ||= e.type==='rail'&&e.reason==='port';playerPort ||= e.type==='rail'&&e.reason==='port'&&e.id==='0';dashHits+=e.type==='hit'&&e.dashAttackerId!==undefined?1:0;}}
  assert.ok(battle.done);withPort+=port?1:0;playerPorts+=playerPort?1:0;
 }
 assert.ok(withPort>=50&&withPort<80,`${withPort}/80 practice rounds used the outlet`);
 assert.ok(playerPorts>=44&&playerPorts<72,`${playerPorts}/80 measured player launches used the outlet`);assert.ok(dashHits>=10);
});
