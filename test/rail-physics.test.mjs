import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, stepBattle } from '../game.mjs';
import { railConfigForCount, surfaceHeight } from '../public/assets/rail-config.js';
const players=n=>Array.from({length:n},(_,i)=>({id:String(i)}));
function contact(angle=.3,radial=1,tangent=-5){
 const b=createBattle(players(2),21),a=b.tops[0],r=b.railRadius;
 Object.assign(a,{x:r*Math.cos(angle),z:r*Math.sin(angle),y:surfaceHeight(r*Math.cos(angle),r*Math.sin(angle),b.arenaRadius),spin:angle,vx:radial*Math.cos(angle)-tangent*Math.sin(angle),vz:radial*Math.sin(angle)+tangent*Math.cos(angle),drag:0});
 Object.assign(b.tops[1],{x:0,z:0,vx:0,vz:0,drag:0});return b;
}
test('rail entry depends on local contact and signed tangential approach, not an opponent',()=>{
 for(const direction of [-1,1]){
  const b=contact(.3,.5,7*direction),a=b.tops[0],before=a.energy;
  stepBattle(b,.01);assert.equal(a.railActive,true);assert.equal(a.railDir,direction);
  assert.equal(b.events[0].phase,'enter');assert.ok(a.energy<before);
  const radial=(a.x*a.vx+a.z*a.vz)/Math.hypot(a.x,a.z),speed=Math.hypot(a.vx,a.vz);
  assert.ok(Math.abs(radial)/speed<.3,'boost follows local tangent');
 }
 for(const [radial,tangent] of [[-2,5],[1,0],[7,5]]){
  const b=contact(.3,radial,tangent);stepBattle(b,.01);assert.equal(b.tops[0].railActive,false);
 }
 const b=contact();b.tops[0].x=0;b.tops[0].z=1;stepBattle(b,.01);assert.equal(b.tops[0].railActive,false);
});
test('a tooth-face strike rebounds once; a fresh aligned approach can mesh',()=>{
 const angle=.3,nx=Math.cos(angle),nz=Math.sin(angle);
 const battle=contact(angle,1,-5),top=battle.tops[0],approach={x:top.x,z:top.z,vx:top.vx,vz:top.vz};
 top.spin=angle+Math.PI/8;
 const speed=Math.hypot(top.vx,top.vz),energy=top.energy;
 stepBattle(battle,.01);
 assert.deepEqual(battle.events.map(e=>e.type),['rail-bounce']);
 assert.equal(top.railActive,false);assert.ok(top.vx*nx+top.vz*nz<0);
 assert.ok(Math.hypot(top.vx,top.vz)<speed&&top.energy<energy);
 // A new orientation during the same contact, even across a save, cannot retry the bite.
 const restored=JSON.parse(JSON.stringify(battle)),savedTop=restored.tops[0];
 Object.assign(savedTop,approach,{spin:angle});stepBattle(restored,.01);
 assert.equal(savedTop.railActive,false);assert.equal(restored.events.length,0);
 Object.assign(savedTop,{x:nx*(battle.railRadius-.5),z:nz*(battle.railRadius-.5),y:0});
 stepBattle(restored,.01);
 Object.assign(savedTop,approach,{spin:angle,y:0});stepBattle(restored,.01);
 assert.equal(savedTop.railActive,true);
});

test('a head-on strike rebounds even when the tooth orientation matches',()=>{
 const angle=.3,battle=contact(angle,6,2),top=battle.tops[0];
 stepBattle(battle,.01);
 assert.ok(battle.events.some(e=>e.type==='rail-bounce'));
 assert.equal(top.railActive,false);
 assert.ok(top.vx*Math.cos(angle)+top.vz*Math.sin(angle)<-2);
});

test('the main geometric ramp release in both directions and enforce cooldown',()=>{
 for(const angle of railConfigForCount(2).exitAngles)for(const dir of [-1,1]){
  const b=contact(angle,0,7*dir),a=b.tops[0];b.t=.5;
  Object.assign(a,{railActive:true,railDir:dir,railEntered:0,railUntil:2});
  stepBattle(b,.01);const e=b.events.find(e=>e.type==='rail');
  assert.equal(e.phase,'exit');assert.equal(e.reason,'port');assert.equal(e.exitIndex,railConfigForCount(2).exitAngles.indexOf(angle));
  assert.ok(a.x*a.vx+a.z*a.vz<0);assert.equal(a.railActive,false);
  const reset=contact(.3).tops[0];Object.assign(a,{x:reset.x,z:reset.z,y:reset.y,vx:reset.vx,vz:reset.vz,spin:reset.spin});
  stepBattle(b,.01);assert.equal(a.railActive,false);
  b.t=a.railCooldown+.01;Object.assign(a,{x:reset.x,z:reset.z,y:reset.y,vx:reset.vx,vz:reset.vz,spin:reset.spin});
  stepBattle(b,.01);assert.equal(a.railActive,true);
 }
});
test('a real collision interrupts rail retention without a forced target',()=>{
 const b=contact(.3,0,5),a=b.tops[0],c=b.tops[1];
 Object.assign(a,{railActive:true,railDir:1,railEntered:0,railUntil:2});
 const nx=Math.cos(.3),nz=Math.sin(.3);
 Object.assign(c,{x:a.x-.85*nx,z:a.z-.85*nz,vx:9*nx,vz:9*nz});
 stepBattle(b,.01);
 assert.ok(b.events.some(e=>e.type==='hit'));assert.ok(b.events.some(e=>e.type==='rail'&&e.reason==='collision'));
 assert.equal(a.railActive,false);
});
test('a strong outward blade hit clears the crest, while a weak or glancing hit stays inside',()=>{
 const rail=railConfigForCount(2);
 for(const [slot,angle] of [[0,Math.PI/4],[1,-Math.PI/4]]){
  const nx=Math.cos(angle),nz=Math.sin(angle);
  for(const [speed,tangentFraction,clears] of [[11,0,true],[5,0,false],[11,.9,false]]){
   const battle=createBattle(players(2),4),struck=battle.tops[slot],attacker=battle.tops[1-slot];
   for(const [top,radius] of [[struck,2.74],[attacker,1.71]]){
    Object.assign(top,{x:nx*radius,z:nz*radius,y:surfaceHeight(radius,0,rail.arenaRadius),vy:0,vx:0,vz:0});
   }
   const radialSpeed=speed*Math.sqrt(1-tangentFraction**2),tangentialSpeed=speed*tangentFraction;
   attacker.vx=nx*radialSpeed-nz*tangentialSpeed;attacker.vz=nz*radialSpeed+nx*tangentialSpeed;
   let hit=false,crossed=false,entered=false;
   for(let i=0;i<40;i++){
    stepBattle(battle,.01);
    hit ||= battle.events.some(e=>e.type==='hit');
    if(Math.hypot(struck.x,struck.z)>rail.arenaRadius&&!crossed){
     assert.ok(hit&&struck.y>=rail.rimHeight+.04);crossed=true;
    }
    entered ||= battle.events.some(e=>e.type==='pocket'&&e.id===struck.id&&e.phase==='enter');
   }
   assert.ok(hit);assert.equal(crossed,clears);assert.equal(entered,clears);
  }
 }
});
test('rail has finite drive, spin cost, bounded duration and speed',()=>{
 const b=contact(.3,0,9.9),a=b.tops[0],start=a.energy;let exited=false;
 for(let i=0;i<300;i++){stepBattle(b,.01);assert.ok(Math.hypot(a.vx,a.vz)<=14+1e-9);if(b.events.some(e=>e.phase==='exit')){exited=true;break;}}
 assert.ok(exited);assert.ok(a.energy<start-.5);assert.ok(b.t<2.9);
 assert.ok(railConfigForCount(10).maxDuration<railConfigForCount(2).maxDuration);
});
test('identical seeds reproduce events; renaming IDs does not change physical outcomes',()=>{
 const a=createBattle(players(10),912),b=createBattle(players(10),912),c=createBattle(players(10).map(p=>({id:`renamed-${9-Number(p.id)}`})),912);
 while(!a.done){stepBattle(a);stepBattle(b);stepBattle(c);assert.deepEqual(a,b);
  assert.deepEqual(a.tops.map(({id,...p})=>p),c.tops.map(({id,...p})=>p));
 }
 assert.equal(a.tops.findIndex(t=>t.id===a.winnerId),c.tops.findIndex(t=>t.id===c.winnerId));
});
test('multi-seed 2/10/16 battles stay bounded, move, use the dash ramp and finish',()=>{
 for(const n of [2,10,16]){
  const ports=new Set();let entries=0,bounces=0,collisionExits=0,hits=0,speedSum=0,samples=0;
  const launches=Array.from({length:30},(_,i)=>({seed:i+1}));
  // At full power a duel can meet at the teeth while one top is still meshed.
  if(n===2)launches.push({seed:245},{seed:5,pulls:{'0':1,'1':1}});
  for(const {seed,pulls} of launches){
   const b=createBattle(players(n),seed,pulls),ids=new Set();let lastTime=0;
   while(!b.done&&b.t<35){stepBattle(b);const live=b.tops.filter(a=>a.alive);
    for(const a of live){const speed=Math.hypot(a.vx,a.vz);assert.ok(speed<=14+1e-9);assert.ok(Math.hypot(a.x,a.z)<=b.arenaRadius+.61+1e-9);assert.ok(Number.isFinite(a.y)&&Number.isFinite(a.vy));if(!a.pocketActive&&a.energy>=85&&b.t>=.2&&b.t<=6){speedSum+=speed;samples++;}}
    for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++)if(!live[i].pocketActive&&!live[j].pocketActive&&Math.abs(live[i].y-live[j].y)<.35)assert.ok(Math.hypot(live[i].x-live[j].x,live[i].z-live[j].z)>.84);
    for(const e of b.events){assert.ok(!ids.has(e.eventId));ids.add(e.eventId);assert.ok(e.t>lastTime&&e.t<=b.t+1e-9);
     if(e.type==='rail-bounce')bounces++;
     if(e.type==='rail'){if(e.phase==='enter')entries++;if(e.reason==='collision')collisionExits++;if(e.exitIndex>=0)ports.add(e.exitIndex);}if(e.type==='hit')hits++;}
    lastTime=b.t;
   }
   assert.ok(b.done&&b.t<35);assert.equal(b.eliminated.length,n-1);
  }
  assert.equal(ports.size,1);assert.ok(entries>0&&bounces>entries,'more tooth strikes should rebound than mesh');
  assert.ok(collisionExits>0);assert.ok(hits>60);assert.ok(samples>0);assert.ok(speedSum/samples>2);
 }
});

test('toothless exit gaps cannot capture in either direction',()=>{
 for(const port of railConfigForCount(2).exitAngles)for(const offset of [-.09,0,.09])for(const direction of [-1,1]){
  const b=contact(port+offset,1,5*direction);stepBattle(b,.01);
  assert.equal(b.tops[0].railActive,false);assert.ok(!b.events.some(e=>e.phase==='enter'));
 }
});
test('timeout removes drive without applying an unmarked exit ramp',()=>{
 const b=contact(.3,0,7),a=b.tops[0],free=structuredClone(b);
 Object.assign(a,{railActive:true,railDir:1,railEntered:-.2,railUntil:0});
 free.tops[0].railCooldown=10;
 stepBattle(b,.01);stepBattle(free,.01);
 const e=b.events.find(e=>e.type==='rail');assert.equal(e.reason,'timeout');assert.equal(e.speedBefore,e.speedAfter);
 for(const key of ['x','z','vx','vz','energy'])assert.equal(a[key],free.tops[0][key]);
});
test('restored legacy states initialize absent rail fields and can capture',()=>{
 const b=contact();delete b.arenaRadius;delete b.railRadius;
 for(const a of b.tops)for(const key of ['railActive','railDir','railCooldown','railEntered','railUntil'])delete a[key];
 stepBattle(b,.01);assert.equal(b.arenaRadius,3.35);assert.equal(b.railRadius,3.15);
 assert.equal(b.tops[0].railActive,true);assert.ok(b.events.some(e=>e.phase==='enter'));
 for(const a of b.tops){assert.ok(Number.isFinite(a.railCooldown));assert.ok(Number.isFinite(a.railUntil));}
});

test('newly captured tops release at the very next toothless gap without a dwell time',()=>{
 for(const direction of [-1,1]){
  const b=contact(railConfigForCount(2).exitAngles[0]-direction*.13,0,7*direction),a=b.tops[0];
  stepBattle(b,.01);assert.equal(a.railActive,true);
  let exit;
  for(let i=0;i<12&&!exit;i++){stepBattle(b,.01);exit=b.events.find(e=>e.type==='rail'&&e.phase==='exit');}
  assert.ok(exit);assert.equal(exit.reason,'port');assert.equal(exit.exitIndex,0);
  assert.ok(exit.t<.20);assert.equal(a.railActive,false);
  const angle=Math.atan2(exit.z,exit.x);
  assert.ok(Math.abs(Math.atan2(Math.sin(angle-railConfigForCount(2).exitAngles[0]),Math.cos(angle-railConfigForCount(2).exitAngles[0])))<railConfigForCount(2).exitHalfWidth);
 }
});


test('the inward rail ramp preserve life, energy and the elimination list',()=>{
 for(const n of [2,10,16])for(const angle of railConfigForCount(n).exitAngles){
  const b=createBattle(players(n),21),a=b.tops[0],r=b.railRadius;
  Object.assign(a,{x:r*Math.cos(angle),z:r*Math.sin(angle),y:surfaceHeight(r*Math.cos(angle),r*Math.sin(angle),b.arenaRadius),vx:-7*Math.sin(angle),vz:7*Math.cos(angle),
   railActive:true,railDir:1,railEntered:0,railUntil:2,drag:0});
  for(let i=1;i<b.tops.length;i++)Object.assign(b.tops[i],{x:0,z:0,vx:0,vz:0,drag:0,alive:i===1});
  const before=a.energy;stepBattle(b,.01);
  assert.equal(a.alive,true);assert.equal(a.outReason,undefined);assert.equal(a.energy,before);
  assert.deepEqual(b.eliminated,[]);assert.ok(a.x*a.vx+a.z*a.vz<0);
  assert.ok(b.events.some(e=>e.type==='rail'&&e.reason==='port'));
  assert.ok(!b.events.some(e=>e.type==='ringout'));
 }
});
