import test from 'node:test';
import assert from 'node:assert/strict';
import * as server from '../game.mjs';
import * as browser from '../public/assets/battle-physics.js';
import {battleFrame as serverFrame} from '../battle-frame.mjs';
import {battleFrame as browserFrame} from '../public/assets/battle-frame.js';
import {railConfigForCount,surfaceHeight} from '../public/assets/rail-config.js';
const players=[{id:'a',parts:{blade:1,ratchet:2,bit:1}},{id:'b',parts:{blade:2,ratchet:1,bit:2}}];
test('server and browser share physics and frame implementations, including part variants',()=>{
 for(const name of ['createBattle','stepBattle','launchBattle','rng'])assert.equal(server[name],browser[name]);
 assert.equal(serverFrame,browserFrame);
 const battle=browser.launchBattle(players,412),expected=browser.createBattle(players,412);
 for(let i=0;i<players.length;i++){
  const top=battle.tops[i];
  assert.deepEqual(top.parts,players[i].parts);
  assert.deepEqual(top.physics,expected.tops[i].physics);
  assert.ok(Math.abs(Math.hypot(top.x,top.z)-battle.arenaRadius*.55)<1e-12);
  assert.equal(top.y,surfaceHeight(top.x,top.z,battle.arenaRadius)+1.3);
  assert.equal(top.vy,-.5);
 }
 const copy=structuredClone(battle);
 for(let i=0;i<100;i++){browser.stepBattle(battle);server.stepBattle(copy);assert.deepEqual(battle,copy);}
 const frame=browserFrame(battle,'practice');
 assert.deepEqual(frame.ringOutHalfWidths,railConfigForCount(2).ringOutHalfWidths);
 assert.deepEqual(frame.tops.map(top=>top.parts),players.map(player=>player.parts));
});
test('gear exit uses the central inward component in both directions',()=>{
 for(const direction of [-1,1]){
  const battle=browser.createBattle(players,21),top=battle.tops[0],rail=railConfigForCount(2),angle=rail.exitAngles[0];
  const nx=Math.cos(angle),nz=Math.sin(angle);
  Object.assign(top,{x:rail.railRadius*nx,z:rail.railRadius*nz,y:surfaceHeight(rail.railRadius*nx,rail.railRadius*nz,rail.arenaRadius),vx:-nz*7*direction,vz:nx*7*direction,railActive:true,railDir:direction,railEntered:0,railUntil:2,drag:0});
  Object.assign(battle.tops[1],{x:0,z:0,vx:0,vz:0,drag:0});
  battle.t=.5;browser.stepBattle(battle,.000001);
  assert.ok(battle.events.some(event=>event.type==='rail'&&event.reason==='port'));
  const speed=Math.hypot(top.vx,top.vz);
  assert.ok(Math.abs(-(top.vx*nx+top.vz*nz)/speed-Math.sqrt(1-(.12+.48*Math.abs(top.tilt))**2))<1e-5);
  assert.ok((-top.vx*nz+top.vz*nx)*direction>0);
 }
});
