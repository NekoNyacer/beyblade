import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, stepBattle, isExit } from '../game.mjs';
import { railConfigForCount } from '../public/assets/rail-config.js';
const players=n=>Array.from({length:n},(_,i)=>({id:String(i)}));
function contact(angle=.3,radial=1,tangent=5){
 const b=createBattle(players(2),21),a=b.tops[0],r=b.railRadius;
 Object.assign(a,{x:r*Math.cos(angle),z:r*Math.sin(angle),vx:radial*Math.cos(angle)-tangent*Math.sin(angle),vz:radial*Math.sin(angle)+tangent*Math.cos(angle),drag:0});
 Object.assign(b.tops[1],{x:0,z:0,vx:0,vz:0,drag:0});return b;
}
test('rail entry depends on local contact and signed tangential approach, not an opponent',()=>{
 for(const direction of [-1,1]){
  const b=contact(.3,1,5*direction),a=b.tops[0],before=a.energy;
  stepBattle(b,.01);assert.equal(a.railActive,true);assert.equal(a.railDir,direction);
  assert.equal(b.events[0].phase,'enter');assert.ok(a.energy<before);
  const radial=(a.x*a.vx+a.z*a.vz)/Math.hypot(a.x,a.z),speed=Math.hypot(a.vx,a.vz);
  assert.ok(Math.abs(radial)/speed<.3,'boost follows local tangent');
 }
 for(const [radial,tangent] of [[-2,5],[1,0],[6,5]]){
  const b=contact(.3,radial,tangent);stepBattle(b,.01);assert.equal(b.tops[0].railActive,false);
 }
 const b=contact();b.tops[0].x=0;b.tops[0].z=1;stepBattle(b,.01);assert.equal(b.tops[0].railActive,false);
});
test('the main geometric ramp release in both directions and enforce cooldown',()=>{
 for(const angle of railConfigForCount(2).exitAngles)for(const dir of [-1,1]){
  const b=contact(angle,0,7*dir),a=b.tops[0];b.t=.5;
  Object.assign(a,{railActive:true,railDir:dir,railEntered:0,railUntil:2});
  stepBattle(b,.01);const e=b.events.find(e=>e.type==='rail');
  assert.equal(e.phase,'exit');assert.equal(e.reason,'port');assert.equal(e.exitIndex,railConfigForCount(2).exitAngles.indexOf(angle));
  assert.ok(a.x*a.vx+a.z*a.vz<0);assert.equal(a.railActive,false);
  const reset=contact(.3).tops[0];Object.assign(a,{x:reset.x,z:reset.z,vx:reset.vx,vz:reset.vz});
  stepBattle(b,.01);assert.equal(a.railActive,false);
  b.t=a.railCooldown+.01;Object.assign(a,{x:reset.x,z:reset.z,vx:reset.vx,vz:reset.vz});
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
  const ports=new Set();let entries=0,collisionExits=0,hits=0,speedSum=0,samples=0;
  for(let seed=1;seed<=30;seed++){
   const b=createBattle(players(n),seed),ids=new Set();let lastTime=0;
   while(!b.done&&b.t<35){stepBattle(b);const live=b.tops.filter(a=>a.alive);
    for(const a of live){const speed=Math.hypot(a.vx,a.vz);assert.ok(speed<=14+1e-9);assert.ok(Math.hypot(a.x,a.z)<=b.arenaRadius+.61+1e-9);assert.ok(Number.isFinite(a.y)&&Number.isFinite(a.vy));if(!a.pocketActive&&a.energy>=85&&b.t>=.2&&b.t<=6){speedSum+=speed;samples++;}}
    for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++)if(!live[i].pocketActive&&!live[j].pocketActive&&Math.abs(live[i].y-live[j].y)<.35)assert.ok(Math.hypot(live[i].x-live[j].x,live[i].z-live[j].z)>.84);
    for(const e of b.events){assert.ok(!ids.has(e.eventId));ids.add(e.eventId);assert.ok(e.t>lastTime&&e.t<=b.t+1e-9);
     if(e.type==='rail'){if(e.phase==='enter')entries++;if(e.reason==='collision')collisionExits++;if(e.exitIndex>=0)ports.add(e.exitIndex);}if(e.type==='hit')hits++;}
    lastTime=b.t;
   }
   assert.ok(b.done&&b.t<35);assert.equal(b.eliminated.length,n-1);
  }
  assert.equal(ports.size,1);assert.ok(entries>0);assert.ok(collisionExits>0);assert.ok(hits>60);assert.ok(samples>0);assert.ok(speedSum/samples>2);
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
  Object.assign(a,{x:r*Math.cos(angle),z:r*Math.sin(angle),vx:-7*Math.sin(angle),vz:7*Math.cos(angle),
   railActive:true,railDir:1,railEntered:0,railUntil:2,drag:0});
  for(let i=1;i<b.tops.length;i++)Object.assign(b.tops[i],{x:0,z:0,vx:0,vz:0,drag:0,alive:i===1});
  const before=a.energy;stepBattle(b,.01);
  assert.equal(a.alive,true);assert.equal(a.outReason,undefined);assert.equal(a.energy,before);
  assert.deepEqual(b.eliminated,[]);assert.ok(a.x*a.vx+a.z*a.vz<0);
  assert.ok(b.events.some(e=>e.type==='rail'&&e.reason==='port'));
  assert.ok(!b.events.some(e=>e.type==='ringout'));
 }
});
