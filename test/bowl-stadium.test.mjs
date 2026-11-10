import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,stepBattle} from '../game.mjs';
import {battleFrame} from '../battle-frame.mjs';
import {railConfigForCount,surfaceHeight,surfaceSlope} from '../public/assets/rail-config.js';
const players=[{id:'0'},{id:'1'}];
function solo(energy,x=2.5,speed=6){
 const b=createBattle(players,15),a=b.tops[0],rail=railConfigForCount(2),angle=rail.ringOutAngles[0];
 Object.assign(a,{x,z:0,y:surfaceHeight(x,0,b.arenaRadius),vy:0,vx:0,vz:speed,energy,angularSpeed:energy*6,drag:0,railCooldown:100});
 Object.assign(b.tops[1],{x:Math.cos(angle)*(b.arenaRadius+.3),z:Math.sin(angle)*(b.arenaRadius+.3),y:rail.pocketFloor,vy:0,vx:0,vz:0,energy:1000,drag:0,pocketActive:true,pocketIndex:0});return b;
}
test('the floor is exactly flat centrally and rises continuously to the gear crest',()=>{
 for(const n of [2,10,16]){
  const c=railConfigForCount(n);
  for(const r of [0,c.flatRadius/2,c.flatRadius])assert.equal(surfaceHeight(r,0,c.arenaRadius),0);
  let previous=0;
  for(let i=1;i<=20;i++){const r=c.flatRadius+(c.arenaRadius-c.flatRadius)*i/20,h=surfaceHeight(r,0,c.arenaRadius);assert.ok(h>previous);assert.ok(surfaceSlope(r,0,c.arenaRadius)>0);previous=h;}
  assert.equal(previous,c.rimHeight);assert.equal(c.railRadius,c.arenaRadius-.20);
  for(const angle of c.ringOutAngles)assert.ok(Math.abs(surfaceHeight(Math.cos(angle)*c.arenaRadius,Math.sin(angle)*c.arenaRadius,c.arenaRadius)-c.rimHeight)<1e-9);
 }
});
test('high spin favors outer circular travel and low spin remains nearly stationary',()=>{
 const high=solo(95),a=high.tops[0];let path=0,radialTravel=0,turn=0;
 for(let i=0;i<200;i++){const x=a.x,z=a.z,r=Math.hypot(x,z),angle=Math.atan2(z,x);stepBattle(high,.01);path+=Math.hypot(a.x-x,a.z-z);radialTravel+=Math.abs((a.x-x)*x+(a.z-z)*z)/r;const delta=Math.atan2(a.z,a.x)-angle;turn+=Math.atan2(Math.sin(delta),Math.cos(delta));assert.equal(a.pocketActive,false);}
 assert.ok(path>7);assert.ok(Math.abs(turn)>2);assert.ok(radialTravel/path<.25);
 const low=solo(10,1.2,.4),c=low.tops[0];for(let i=0;i<200;i++)stepBattle(low,.01);
 assert.ok(Math.hypot(c.x-1.2,c.z)<.3);assert.ok(Math.hypot(c.vx,c.vz)<.05);
});
test('medium spin leaves the outer circle and traverses the central flat',()=>{
 const b=solo(50),a=b.tops[0];let minimumRadius=Infinity;
 for(let i=0;i<600;i++){stepBattle(b,.01);minimumRadius=Math.min(minimumRadius,Math.hypot(a.x,a.z));assert.equal(a.pocketActive,false);}
 assert.ok(minimumRadius<b.arenaRadius*.45,'medium-speed crossings enter the central flat');
});
test('contact accelerates along the gear and the upper exit sends the top into the flat center',()=>{
 const b=solo(95),a=b.tops[0],c=railConfigForCount(2),angle=c.exitAngles[0]-.3;
 Object.assign(a,{x:Math.cos(angle)*c.railRadius,z:Math.sin(angle)*c.railRadius,y:surfaceHeight(c.railRadius,0,c.arenaRadius),vx:-Math.sin(angle)*7,vz:Math.cos(angle)*7,railCooldown:0});
 const events=[];let crossed=false,exit;
 for(let i=0;i<120;i++){stepBattle(b,.01);events.push(...b.events);exit??=b.events.find(e=>e.type==='rail'&&e.reason==='port');if(exit&&Math.hypot(a.x,a.z)<c.flatRadius)crossed=true;}
 const entry=events.find(e=>e.type==='rail'&&e.phase==='enter');assert.ok(entry&&exit);assert.equal(exit.exitIndex,0);assert.ok(exit.z<0);assert.ok(exit.speedBefore>entry.speedBefore);assert.ok(crossed);assert.equal(a.pocketActive,false);
});
test('zero energy preserves residual turns until the defeated top is nearly motionless',()=>{
 const b=createBattle(players,4),a=b.tops[0];Object.assign(a,{x:1.2,z:0,y:0,vy:0,vx:0,vz:0,energy:0,angularSpeed:9,drag:0});Object.assign(b.tops[1],{x:0,z:0,y:0,vy:0,vx:0,vz:0,energy:10,angularSpeed:60,drag:0});
 const spin=a.spin;stepBattle(b,.04);assert.equal(a.energy,0);assert.equal(a.settling,true);assert.equal(a.alive,true);assert.equal(b.done,false);assert.ok(a.spin>spin&&a.angularSpeed>0);
 const frame=battleFrame(b,'settle');assert.equal(frame.tops[0].settling,true);assert.ok(frame.tops[0].angularSpeed>0);
 let elapsed=0;while(!b.done&&elapsed<5){stepBattle(b,.01);elapsed+=.01;}
 assert.ok(b.done&&elapsed>1);assert.equal(b.winnerId,'1');assert.equal(a.alive,false);assert.equal(a.angularSpeed,0);assert.ok(Math.hypot(a.vx,a.vz)<.08);
});
test('simultaneous empty energy resolves by actual residual stop time',()=>{
 const b=createBattle(players,4);
 b.tops.forEach((a,i)=>Object.assign(a,{x:i?1.2:-1.2,z:0,y:0,vy:0,vx:0,vz:0,energy:0,angularSpeed:i?18:8,drag:0}));
 stepBattle(b,.04);assert.equal(b.done,false);assert.ok(b.tops.every(a=>a.alive));
 for(let i=0;i<500&&!b.done;i++)stepBattle(b,.01);
 assert.ok(b.done);assert.equal(b.winnerId,'1');assert.equal(b.tops[0].angularSpeed,0);assert.ok(b.tops[1].angularSpeed>0);
});
