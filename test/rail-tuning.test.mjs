import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,stepBattle} from '../public/assets/battle-physics.js';
import {railConfigForCount,surfaceHeight,surfaceSlope,shoulderHeightAtOffset,BOWL_SKIN_OFFSET} from '../public/assets/rail-config.js';
import {bowlSkinY} from '../public/assets/top-support.js';

function contact(direction,{radial=3,tangent=4,radius,bit=0,phase=0}={}){
 const battle=createBattle([{id:'0',parts:{blade:0,ratchet:0,bit}},{id:'1'}],21);
 const config=railConfigForCount(2),top=battle.tops[0],angle=.3,r=radius??config.railRadius;
 const nx=Math.cos(angle),nz=Math.sin(angle);
 Object.assign(top,{x:r*nx,z:r*nz,y:surfaceHeight(r*nx,r*nz,config.arenaRadius),vy:0,
  vx:radial*nx-direction*tangent*nz,vz:radial*nz+direction*tangent*nx,
  spin:angle+phase/top.physics.gearTeeth,drag:0,energy:95,angularSpeed:570});
 Object.assign(battle.tops[1],{x:0,z:0,y:0,vx:0,vz:0,drag:0});
 return battle;
}

test('duel slope is gentler, with unchanged footprint, central groove and large-arena heights',()=>{
 const duel=railConfigForCount(2),large=railConfigForCount(10);
 assert.equal(duel.arenaRadius,3.35);assert.equal(duel.flatRadius,2.01);assert.equal(duel.rimHeight,1.05);
 const angle=Math.atan(surfaceSlope(duel.railRadius-duel.captureWidth,0,duel.arenaRadius))*180/Math.PI;
 assert.ok(angle>41&&angle<43,`contact slope ${angle}`);
 assert.equal(large.rimHeight,1.3);assert.equal(railConfigForCount(16).rimHeight,1.3);
 assert.ok(duel.bankFriction<large.bankFriction&&duel.bankRadialDrag<large.bankRadialDrag);
 assert.equal(large.bankFriction,.95);assert.equal(large.bankRadialDrag,.35);
 for(let count=3;count<=10;count++)assert.ok(railConfigForCount(count).rimHeight>=railConfigForCount(count-1).rimHeight);
});

test('the lowered rim, shoulders, pocket floor and rendered support remain consistent',()=>{
 for(const count of [2,3,6,10,16]){
  const c=railConfigForCount(count),r=c.arenaRadius;
  assert.equal(shoulderHeightAtOffset(0,r),c.rimHeight+BOWL_SKIN_OFFSET);
  assert.ok(Math.abs(bowlSkinY(r+.000001,0,r)-(surfaceHeight(r,0,r)+BOWL_SKIN_OFFSET))<.00001);
  assert.ok(Math.abs(c.rimHeight-c.pocketFloor-c.pocketDepth)<1e-10);
  assert.ok(Math.abs(c.shieldHeight-c.rimHeight-1.12)<1e-10);
  assert.ok(Math.abs(shoulderHeightAtOffset(.97,r)+.74)<1e-10);
 }
});

test('moderate oblique contact meshes in both directions, without teleporting or free energy',()=>{
 for(const direction of [-1,1])for(const radial of [3,4.9]){
  const battle=contact(direction,{radial}),top=battle.tops[0],before={...top};
  stepBattle(battle,.01);
  assert.ok(top.railActive);assert.equal(top.railDir,direction);
  assert.ok(battle.events.some(e=>e.type==='rail'&&e.phase==='enter'));
  assert.ok(Math.hypot(top.x-before.x,top.z-before.z)<=.14);
  assert.ok(top.energy<before.energy);assert.ok(Math.hypot(top.vx,top.vz)<=14);
 }
});

test('head-on and misaligned tooth strikes still rebound for every bit in both directions',()=>{
 for(const direction of [-1,1])for(const bit of [0,1,2])for(const patch of [{radial:7},{phase:Math.PI}]){
  const battle=contact(direction,{bit,...patch}),top=battle.tops[0];
  stepBattle(battle,.01);
  assert.equal(top.railActive,false);assert.ok(battle.events.some(e=>e.type==='rail-bounce'));
  assert.ok(top.vx*Math.cos(.3)+top.vz*Math.sin(.3)<0);
 }
});

test('the rail exerts no attraction before contact and cannot capture a departing top',()=>{
 const c=railConfigForCount(2);
 for(const direction of [-1,1]){
  const battle=contact(direction,{radius:c.railRadius-c.captureWidth-.08,radial:1});
  const control=structuredClone(battle);control.tops[0].railCooldown=100;
  stepBattle(battle,.01);stepBattle(control,.01);
  for(const key of ['x','z','y','vx','vz','energy'])assert.equal(battle.tops[0][key],control.tops[0][key]);
  assert.equal(battle.tops[0].railActive,false);assert.ok(!battle.events.some(e=>e.type.startsWith('rail')));
  const departing=contact(direction,{radial:-2});stepBattle(departing,.01);
  assert.equal(departing.tops[0].railActive,false);assert.ok(!departing.events.some(e=>e.type.startsWith('rail')));
 }
});
