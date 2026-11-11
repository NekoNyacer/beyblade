import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,launchBattle,stepBattle} from '../public/assets/battle-physics.js';
import {railConfigForCount,surfaceHeight,surfaceGradient} from '../public/assets/rail-config.js';
const players=[{id:'0'},{id:'1'}];
function impact(spin){
 const b=createBattle(players,7);
 for(const [i,t] of b.tops.entries())Object.assign(t,{x:i?.45:-.45,z:0,y:.4,vy:0,vx:i?-6:6,vz:0,energy:100,angularSpeed:600,spin:spin+(i?Math.PI:0),drag:0});
 stepBattle(b,.00001);return b;
}
test('blade phase makes identical high-RPM contacts glance or lift without changing parts',()=>{
 const bite=impact(0),glance=impact(Math.PI/3);
 assert.ok(bite.events.find(e=>e.type==='hit').power>2*glance.events.find(e=>e.type==='hit').power);
 assert.ok(bite.tops[0].vy>5&&glance.tops[0].vy<1.5);
 for(const b of [bite,glance]){assert.equal(b.tops[0].energy,b.tops[1].energy);assert.ok(b.tops[0].energy<100);}
});
test('lowered outlet joins the old rim and keeps a finite shared surface gradient',()=>{
 for(const n of [2,10,16]){
  const r=railConfigForCount(n),a=r.exitAngles[0];
  assert.ok(Math.abs(surfaceHeight(r.railRadius*Math.cos(a),r.railRadius*Math.sin(a),r.arenaRadius)-.74)<.001);
  assert.equal(surfaceHeight(r.arenaRadius*Math.cos(a),r.arenaRadius*Math.sin(a),r.arenaRadius),r.rimHeight);
  for(let i=0;i<100;i++){const radius=r.flatRadius+(r.arenaRadius-r.flatRadius)*i/100,g=surfaceGradient(radius*Math.cos(a),radius*Math.sin(a),r.arenaRadius);assert.ok(Number.isFinite(g.x+g.z));}
 }
});
test('a grounded exit crosses the central quarter at contact height, not above a waiting opponent',()=>{
 for(const direction of [-1,1]){
  const b=createBattle(players,21),t=b.tops[0],r=railConfigForCount(2),angle=r.exitAngles[0];
  Object.assign(t,{x:r.railRadius*Math.cos(angle),z:r.railRadius*Math.sin(angle),y:.74,vy:0,vx:-7*Math.sin(angle)*direction,vz:7*Math.cos(angle)*direction,railActive:true,railDir:direction,railEntered:0,railUntil:2,drag:0});
  Object.assign(b.tops[1],{x:0,z:0,y:4,vx:0,vz:0,drag:0});
  let crossed=false,rolled=false;
  for(let i=0;i<130;i++){stepBattle(b,.01);if(Math.hypot(t.x,t.z)<r.arenaRadius*.25){crossed=true;assert.ok(t.y-surfaceHeight(t.x,t.z,r.arenaRadius)<.42);}rolled ||= t.centerRollUntil>b.t;}
  assert.ok(crossed&&rolled);
 }
});
test('center rolling is local: moving a distant opponent cannot change the returning top',()=>{
 const b=createBattle(players,13),t=b.tops[0];
 Object.assign(t,{x:.4,z:0,y:0,vy:0,vx:4,vz:0,centerRollUntil:2,energy:80});
 Object.assign(b.tops[1],{x:2,z:0,y:4,vx:0,vz:0});const c=structuredClone(b);c.tops[1].x=-2;
 stepBattle(b,.01);stepBattle(c,.01);assert.deepEqual(b.tops[0],c.tops[0]);
});
test('the side shield ends a dash and returns finite momentum inward',()=>{
 const b=createBattle(players,13),t=b.tops[0],r=railConfigForCount(2);
 Object.assign(t,{x:r.arenaRadius+.59,z:0,y:1.6,vy:0,vx:8,vz:2,dashUntil:10,centerRollUntil:10,onApron:true});
 Object.assign(b.tops[1],{x:0,z:0,y:0,vx:0,vz:0});stepBattle(b,.001);
 assert.ok(b.events.some(e=>e.type==='shield'&&e.id===t.id));assert.ok(t.vx<0);assert.equal(t.dashUntil,0);assert.equal(t.centerRollUntil,0);
});
test('seed 124 reproduces a real dash hit, shield return, remesh and counterattack',()=>{
 const b=launchBattle(players,124,{'0':.5,'1':.5}),defender=b.tops[1];let stage=0;
 while(!b.done&&b.t<6){
  stepBattle(b);
  for(const e of b.events){
   if(stage===0&&e.type==='hit'&&e.dashAttackerId==='0')stage=1;
   else if(stage===1&&e.type==='shield'&&e.id==='1'&&(e.nx||e.nz))stage=2;
   else if(stage===3&&e.type==='rail'&&e.id==='1'&&e.phase==='enter')stage=4;
   else if(stage===4&&e.type==='rail'&&e.id==='1'&&e.reason==='port')stage=5;
   else if(stage===5&&e.type==='hit'&&e.dashAttackerId==='1')stage=6;
  }
  if(stage===2&&Math.hypot(defender.x,defender.z)<.6*b.arenaRadius)stage=3;
 }
 assert.equal(stage,6);
});
