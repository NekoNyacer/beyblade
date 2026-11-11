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
test('a slowly climbing high-spin top loses outward speed and rolls back down the slope',()=>{
 const battle=solo(95,2.4,0),top=battle.tops[0];
 top.vx=.5;
 const initialRadius=top.x,initialHeight=top.y;
 let maxRadius=initialRadius;
 for(let i=0;i<50;i++){
  stepBattle(battle,.01);
  maxRadius=Math.max(maxRadius,Math.hypot(top.x,top.z));
  if(i===0)assert.ok(top.vx<.5,'the slope opposes uphill travel immediately');
 }
 assert.ok(maxRadius<initialRadius+.08,'a slow approach climbs only a short distance');
 assert.ok(Math.hypot(top.x,top.z)<initialRadius&&top.y<initialHeight);
});
test('a freely circling high-spin top sweeps into the central flat',()=>{
 for(const direction of [-1,1]){
  const battle=solo(95,2.5,direction*4.5),top=battle.tops[0],rail=railConfigForCount(2);
  let path=0,insideFlat=0;
  for(let i=0;i<400;i++){
   const x=top.x,z=top.z;
   stepBattle(battle,.01);
   path+=Math.hypot(top.x-x,top.z-z);
   const radius=Math.hypot(top.x,top.z);
   assert.ok(radius<rail.railRadius-rail.captureWidth,'free travel stays clear of the teeth');
   assert.ok(!top.railActive&&!top.pocketActive);
   if(radius<rail.flatRadius)insideFlat+=.01;
  }
  assert.ok(path>7,'the top keeps travelling after it turns inward');
  assert.ok(insideFlat>.5,'the orbit spends time on the central flat');
 }
});
test('a tooth rebound can cross the bowl without repeatedly shuttling along a diameter',()=>{
 for(const direction of [-1,1]){
  const rail=railConfigForCount(2),battle=solo(95,rail.railRadius,2*direction),top=battle.tops[0];
  Object.assign(top,{vx:7,spin:Math.PI/8,orbitDir:direction,railCooldown:0});
  let previousAngle,closest=rail.railRadius,consecutive=0,longest=0,path=0,firstBounce=false;
  for(let i=0;i<800;i++){
   const x=top.x,z=top.z;
   stepBattle(battle,.01);
   path+=Math.hypot(top.x-x,top.z-z);
   closest=Math.min(closest,Math.hypot(top.x,top.z));
   for(const event of battle.events){
    if(event.id!==top.id)continue;
    if(event.type==='rail'){previousAngle=undefined;consecutive=0;}
    if(event.type!=='rail-bounce')continue;
    if(i===0)firstBounce=true;
    const angle=Math.atan2(event.z,event.x);
    if(previousAngle!==undefined){
     const opposite=Math.cos(angle-previousAngle)<Math.cos(5*Math.PI/6);
     consecutive=opposite&&closest<rail.railRadius*.3?consecutive+1:0;
     longest=Math.max(longest,consecutive);
    }
    previousAngle=angle;closest=rail.railRadius;
   }
  }
  assert.ok(firstBounce&&path>2*rail.arenaRadius,'the top rebounds and keeps travelling');
  assert.ok(longest<=2,`the isolated top made ${longest} consecutive near-diameter crossings`);
 }
});
test('successive complete laps can widen and tighten without touching the teeth',()=>{
 const rail=railConfigForCount(2),fullTurn=2*Math.PI;
 for(const direction of [-1,1]){
  const battle=solo(95,2.5,4.5*direction),top=battle.tops[0];
  top.orbitDir=direction;
  const meanRadii=[];
  let swept=0,radiusIntegral=0;
  for(let i=0;i<2200;i++){
   const x=top.x,z=top.z;
   stepBattle(battle,.01);
   const radius=Math.hypot(top.x,top.z);
   const advance=direction*Math.atan2(x*top.z-z*top.x,x*top.x+z*top.z);
   if(advance<=0||radius>=rail.railRadius-rail.captureWidth)break;
   // Average radius by angle so a slow section of the lap has the same weight as a fast one.
   radiusIntegral+=radius*Math.min(advance,fullTurn-swept);
   swept+=advance;
   if(swept>=fullTurn){
    meanRadii.push(radiusIntegral/fullTurn);
    swept-=fullTurn;
    radiusIntegral=radius*swept;
   }
  }
  const changes=meanRadii.slice(1).map((radius,i)=>radius-meanRadii[i]);
  assert.ok(changes.some(delta=>delta>.15)&&changes.some(delta=>delta<-.15),
   `the same top should make both wider and tighter laps: ${meanRadii}`);
 }
});
test('low spin remains nearly stationary',()=>{
 const low=solo(10,1.2,.4),c=low.tops[0];for(let i=0;i<200;i++)stepBattle(low,.01);
 assert.ok(Math.hypot(c.x-1.2,c.z)<.3);assert.ok(Math.hypot(c.vx,c.vz)<.05);
});
test('mass offset bends free travel smoothly in the direction of the precession phase',()=>{
 const launch=solo(95,2.6,4.5);
 const rail=railConfigForCount(launch.tops.length);
 function heading(massOffset,phase,direction){
  const battle=structuredClone(launch),top=battle.tops[0];
  top.massOffset=massOffset;top.precessionPhase=phase;top.vz*=direction;
  for(let step=0;step<15;step++){
   const vx=top.vx,vz=top.vz;
   stepBattle(battle,.01);
   assert.ok(Math.hypot(top.x,top.z)<rail.railRadius-rail.captureWidth);
   assert.ok(Math.hypot(top.vx-vx,top.vz-vz)<.5,'no sudden turn within a 10ms step');
  }
  return Math.atan2(top.vz,top.vx);
 }
 for(const direction of [-1,1]){
  const balanced=heading(0,0,direction);
  for(const sign of [-1,1]){
   const phase=sign*Math.PI/2;
   const slight=sign*(heading(.025,phase,direction)-balanced);
   const offset=sign*(heading(.05,phase,direction)-balanced);
   assert.ok(slight>.005&&offset>slight,'the offset increases turning at the same phase');
  }
 }
});
test('older saved battles recover individual mass offsets and reproduce their resumed tracks',()=>{
 const original=solo(95);
 for(let i=0;i<20;i++)stepBattle(original);
 const offsets=original.tops.map(t=>t.massOffset);
 assert.ok(offsets.every(value=>value>0));
 assert.notEqual(offsets[0],offsets[1]);
 const legacy=structuredClone(original);
 for(const top of legacy.tops){delete top.massOffset;delete top.precessionPhase;}
 const replay=JSON.parse(JSON.stringify(legacy));
 for(let i=0;i<50;i++){stepBattle(legacy);stepBattle(replay);}
 assert.deepEqual(legacy.tops.map(t=>t.massOffset),offsets);
 assert.ok(legacy.tops.every(t=>Number.isFinite(t.precessionPhase)));
 assert.deepEqual(legacy,replay);
});
test('medium spin leaves the outer circle and traverses the central flat',()=>{
 const b=solo(50),a=b.tops[0];let minimumRadius=Infinity;
 for(let i=0;i<600;i++){stepBattle(b,.01);minimumRadius=Math.min(minimumRadius,Math.hypot(a.x,a.z));assert.equal(a.pocketActive,false);}
 assert.ok(minimumRadius<b.arenaRadius*.45,'medium-speed crossings enter the central flat');
});
test('contact accelerates along the gear and the upper exit sends the top into the flat center',()=>{
 const b=solo(95),a=b.tops[0],c=railConfigForCount(2),angle=c.exitAngles[0]-.3;
 Object.assign(a,{x:Math.cos(angle)*c.railRadius,z:Math.sin(angle)*c.railRadius,y:surfaceHeight(c.railRadius,0,c.arenaRadius),vx:-Math.sin(angle)*7,vz:Math.cos(angle)*7,spin:angle,railCooldown:0});
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
