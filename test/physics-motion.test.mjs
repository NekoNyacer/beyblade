import test from 'node:test';
import {railConfigForCount,surfaceHeight,shoulderHeight} from '../public/assets/rail-config.js';
import assert from 'node:assert/strict';
import {createBattle,start,stepBattle} from '../game.mjs';
const players=n=>Array.from({length:n},(_,i)=>({id:String(i)}));

test('substeps preserve free motion across 40ms and 10ms callers',()=>{
 const a=createBattle(players(2),55),b=structuredClone(a);
 stepBattle(a,.04);for(let i=0;i<4;i++)stepBattle(b,.01);
 assert.deepEqual(a.tops,b.tops);assert.equal(a.t,b.t);
});

test('changing a distant opponent does not steer a top',()=>{
 const a=createBattle(players(2),55),b=structuredClone(a);
 Object.assign(b.tops[1],{x:0,z:0,vx:0,vz:0});
 stepBattle(a);stepBattle(b);assert.deepEqual(a.tops[0],b.tops[0]);
});

test('head-on contacts have real normals, impulse, symmetric loss and unique timed events',()=>{
 const b=createBattle(players(2),123);
 delete b.eventSequence;delete b.hitTimes;
 Object.assign(b.tops[0],{x:-.45,z:0,vx:8,vz:0,energy:100,drag:0});
 Object.assign(b.tops[1],{x:.45,z:0,vx:-8,vz:0,energy:100,drag:0});
 stepBattle(b);
 const hit=b.events.find(e=>e.type==='hit');
 assert.ok(hit);assert.equal(hit.aId,'0');assert.equal(hit.bId,'1');
 assert.ok(hit.nx>.99);assert.equal(hit.nz,0);assert.ok(hit.power>15);
 assert.ok(hit.t>0&&hit.t<=b.t);assert.equal(hit.eventId,'123:1');
 assert.ok(b.tops[0].vx<0&&b.tops[1].vx>0);
 assert.equal(b.tops[0].energy,b.tops[1].energy);
 assert.ok(b.tops[0].energy<100);
});

test('wall constrains top radius and reflects only outward velocity',()=>{
 for(const velocity of [-3,3]){
  const b=createBattle(players(2),1);Object.assign(b.tops[0],{x:0,z:b.arenaRadius-.08,y:surfaceHeight(0,b.arenaRadius-.08,b.arenaRadius),vx:0,vz:velocity,energy:40});
  stepBattle(b,.01);assert.ok(Math.hypot(b.tops[0].x,b.tops[0].z)<=b.railRadius+.07+1e-10);
  assert.ok(b.tops[0].vz<0);
 }
});

test('seed sweep sustains movement, produces strong physical contacts and resolves without overlap',()=>{
 for(const n of [2,10,16]){
  let totalHits=0,strong=0,midSpeed=0,samples=0;
  for(const seed of [1,7,55,123,999,32451,87123,20261110]){
   const b=createBattle(players(n),seed),events=new Set();let previousTime=0;
   while(!b.done&&b.t<35){
    stepBattle(b);const live=b.tops.filter(t=>t.alive);
    for(const t of live){
     assert.ok(t.energy>=0,'an impact can exhaust the remaining spin');
     const speed=Math.hypot(t.vx,t.vz);assert.ok(Number.isFinite(speed)&&speed<=14+1e-9);
     assert.ok(Math.hypot(t.x,t.z)<=b.arenaRadius+.61+1e-9);assert.ok(Number.isFinite(t.y)&&Number.isFinite(t.vy));
     if(!t.pocketActive&&t.energy>=85&&b.t>=.2&&b.t<=6){midSpeed+=speed;samples++;}
    }
    for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++)if(!live[i].pocketActive&&!live[j].pocketActive&&Math.abs(live[i].y-live[j].y)<.35)assert.ok(Math.hypot(live[i].x-live[j].x,live[i].z-live[j].z)>.84);
    for(const event of b.events){
     assert.ok(!events.has(event.eventId));events.add(event.eventId);
     assert.ok(event.t>previousTime&&event.t<=b.t+1e-9);
     if(event.type==='hit'){
      totalHits++;if(event.power>=4)strong++;
      assert.ok(event.aId!==event.bId);assert.ok(Math.abs(Math.hypot(event.nx,event.nz)-1)<1e-9);
     }else if(event.type==='out')assert.ok(b.eliminated.includes(event.id));
    }
    previousTime=b.t;
   }
   assert.ok(b.done);assert.ok(b.t<35);assert.equal(b.eliminated.length,n-1);
  }
  assert.ok(samples>0);assert.ok(midSpeed/samples>2,'high-spin velocity must not collapse');
  assert.ok(totalHits>=16);assert.ok(strong>=8,'contacts should include actual strong approaches');
 }
});

test('invalid time steps fail rather than corrupting a battle',()=>{
 for(const dt of [0,-.01,Infinity,NaN])assert.throws(()=>stepBattle(createBattle(players(2),1),dt),RangeError);
});

test('live duels produce repeated central encounters beyond the opening clash',()=>{
 const entrants=players(2),flatRadius=railConfigForCount(2).flatRadius;
 let repeatedDuels=0;
 for(let seed=1;seed<=24;seed++){
  const room={phase:'ready',players:entrants,round:{playerIds:entrants.map(p=>p.id),seed}};
  start(room);
  const battle=room.battle;
  let encounters=0,lastEncounter=-Infinity;
  while(!battle.done&&battle.t<15){
   stepBattle(battle);
   for(const event of battle.events){
    if(event.type!=='hit'||event.power<2||event.t<3||event.t-lastEncounter<1)continue;
    if(Math.hypot(event.x,event.z)>flatRadius)continue;
    encounters++;lastEncounter=event.t;
   }
  }
  if(encounters>=2)repeatedDuels++;
 }
 assert.ok(repeatedDuels>=16,`at least two separate central encounters in ${repeatedDuels}/24 duels`);
});

test('live launches keep moving and colliding through seconds 10–15 before slowing down',()=>{
 for(const count of [2,10,16]){
  const middle={speedSum:0,spinSum:0,samples:0},late={speedSum:0,spinSum:0,samples:0};
  let middleHits=0;
  for(const seed of [7,55,123]){
   const entrants=players(count);
   const room={phase:'ready',players:entrants,round:{playerIds:entrants.map(p=>p.id),seed}};
   start(room);
   const battle=room.battle;
   while(!battle.done&&battle.t<20){
    stepBattle(battle);
    if(battle.t<10)continue;
    const window=battle.t<15?middle:late;
    for(const top of battle.tops){
     if(!top.alive||top.pocketActive)continue;
     window.speedSum+=Math.hypot(top.vx,top.vz);
     window.spinSum+=top.angularSpeed;
     window.samples++;
    }
    if(window===middle)middleHits+=battle.events.filter(e=>e.type==='hit'&&e.power>=4).length;
   }
  }
  const middleSpeed=middle.speedSum/middle.samples,lateSpeed=late.speedSum/late.samples;
  assert.ok(middleSpeed>2,`${count}-top midgame mean speed: ${middleSpeed}`);
  assert.ok(middleHits>0,`${count}-top midgame needs a strong collision`);
  assert.ok(lateSpeed<middleSpeed*.8,`${count}-top late mean speed: ${lateSpeed}`);
  assert.ok(late.spinSum/late.samples<middle.spinSum/middle.samples);
 }
});

test('ground contact transfers spin to movement more gradually during the launch skid',()=>{
 function advanceTip(time,height){
  const battle=createBattle(players(2),7),top=battle.tops[0];
  battle.t=time;
  Object.assign(top,{x:0,z:0,y:height,vy:0,vx:3,vz:0,energy:95,drag:0});
  stepBattle(battle,.01);
  return top;
 }
 const opening=advanceTip(4.99,0),transition=advanceTip(5.5,0),rolling=advanceTip(12,0),airborne=advanceTip(12,.4);
 assert.equal(airborne.energy,95);
 const speed=top=>Math.hypot(top.vx,top.vz);
 assert.ok(speed(airborne)<speed(opening)&&speed(opening)<speed(transition)&&speed(transition)<speed(rolling));
 assert.ok(airborne.energy>opening.energy&&opening.energy>transition.energy&&transition.energy>rolling.energy);
});

test('late wall and top impacts take more spin head-on than in a glancing hit or separation',()=>{
 function wallLoss(normalSpeed){
  const battle=createBattle(players(2),7),top=battle.tops[0],x=battle.railRadius+.08;
  battle.t=12;
  // Just above the floor but below the crest, isolating the inner wall from tip traction.
  Object.assign(top,{x,z:0,y:surfaceHeight(x,0,battle.arenaRadius)+.1,vy:0,vx:normalSpeed,
   vz:Math.sqrt(64-normalSpeed**2),energy:95,drag:0});
  Object.assign(battle.tops[1],{x:-1.7,z:0,vx:0,vz:0});
  stepBattle(battle,.01);
  return 95-top.energy;
 }
 function pairLoss(normalSpeed){
  const battle=createBattle(players(2),7);
  battle.t=12;
  for(const [i,top] of battle.tops.entries()){
   const direction=i===0?1:-1;
   Object.assign(top,{x:-.45*direction,z:0,y:.4,vy:0,vx:normalSpeed*direction,
    vz:Math.sqrt(64-normalSpeed**2)*direction,energy:95,drag:0});
  }
  stepBattle(battle,.01);
  assert.equal(battle.events.some(event=>event.type==='hit'),normalSpeed>0);
  assert.equal(battle.tops[0].energy,battle.tops[1].energy);
  return 95-battle.tops[0].energy;
 }
 for(const loss of [wallLoss,pairLoss]){
  const direct=loss(8),glancing=loss(2.5);
  assert.ok(glancing>0&&direct>glancing*4);
  assert.equal(loss(-2.5),0);
 }
});


test('a top lands on the exterior shoulder and a saved sunken top regains that surface',()=>{
 const rail=railConfigForCount(2),r=rail.arenaRadius+.30;
 const deckHeight=rail.rimHeight-.085; // Halfway along the panel from +.12 to +.48.
 assert.ok(Math.abs(shoulderHeight(r,0,rail.arenaRadius)-deckHeight)<1e-9);
 for(const angle of rail.ringOutAngles){
  assert.equal(shoulderHeight(r*Math.cos(angle),r*Math.sin(angle),rail.arenaRadius),null);
 }
 for(const [y,vy] of [[1.8,-2],[.18,0]]){
  const b=createBattle(players(2),7),top=b.tops[0];
  Object.assign(top,{x:r,z:0,y,vy,vx:0,vz:0});
  Object.assign(b.tops[1],{x:0,z:0,y:0,vx:0,vz:0});
  for(let i=0;i<40;i++){
   stepBattle(b,.01);assert.ok(top.y>=deckHeight-1e-9);
   assert.equal(top.pocketActive,false);
  }
  assert.ok(Math.abs(top.y-deckHeight)<1e-9);assert.equal(top.vy,0);
 }
});

test('a flight into any external well impacts its wall and can rebound over the crest',()=>{
 const rail=railConfigForCount(2);
 for(const angle of rail.ringOutAngles){
  const b=createBattle(players(2),29),a=b.tops[0],nx=Math.cos(angle),nz=Math.sin(angle);
  Object.assign(a,{x:nx*(b.arenaRadius+.03),z:nz*(b.arenaRadius+.03),y:rail.rimHeight+.20,vy:0,vx:nx*8,vz:nz*8,drag:0,railCooldown:100});
  Object.assign(b.tops[1],{x:0,z:0,y:0,vx:0,vz:0,energy:10,drag:0});
  let entered=false,escaped=false,impacted=false;
  for(let i=0;i<400&&!escaped;i++){stepBattle(b,.01);for(const e of b.events){
   if(e.type==='pocket'&&e.id===a.id){if(e.phase==='enter')entered=true;else{escaped=true;assert.ok(e.y>=rail.rimHeight+.04);}}
   if(e.type==='pocket-impact'&&e.id===a.id)impacted=true;
   assert.notEqual(e.type,'ringout');
  }assert.ok(Math.hypot(a.x,a.z)<=b.arenaRadius+.61);}
  assert.ok(entered&&impacted&&escaped);assert.equal(a.alive,true);assert.ok(a.energy<95);assert.deepEqual(b.eliminated,[]);
 }
});

test('a weak airborne top sinks and settles in an external well before elimination',()=>{
 const b=createBattle(players(2),3),a=b.tops[0],angle=Math.PI/4,r=b.arenaRadius+.03;
 Object.assign(a,{x:Math.cos(angle)*r,z:Math.sin(angle)*r,y:1.5,vy:0,vx:Math.cos(angle)*.3,vz:Math.sin(angle)*.3,energy:16,angularSpeed:96,drag:0});
 Object.assign(b.tops[1],{x:0,z:0,y:0,vx:0,vz:0,energy:10,drag:0});
 const events=[];let minimumY=Infinity,sawSettling=false;
 while(!b.done&&b.t<10){stepBattle(b);events.push(...b.events);minimumY=Math.min(minimumY,a.y);if(a.alive&&a.energy===0)sawSettling=true;assert.ok(Math.hypot(a.x,a.z)<=b.arenaRadius+.61);}
 assert.ok(minimumY<0&&sawSettling);assert.equal(a.outReason,'pocket');assert.equal(a.energy,0);assert.equal(a.angularSpeed,0);assert.equal(b.winnerId,'1');assert.equal(events.filter(e=>e.type==='out'&&e.id==='0').length,1);assert.equal(events.filter(e=>e.type==='pocket'&&e.phase==='exit').length,0);
 const done=structuredClone(b);stepBattle(b);assert.deepEqual(b,done);
});

test('seeded duels collide and excess launch speed increases real over-crest flights',()=>{
 const totals=[];
 for(const power of [.5,1]){
  let hits=0,enters=0,exits=0,stalls=0;
  for(let seed=1;seed<=30;seed++){
   const b=createBattle(players(2),seed,{'0':power,'1':.5});
   while(!b.done&&b.t<35){stepBattle(b);for(const e of b.events){assert.notEqual(e.type,'ringout');if(e.type==='hit')hits++;if(e.type==='pocket'&&e.phase==='enter')enters++;if(e.type==='pocket'&&e.phase==='exit')exits++;if(e.type==='out'&&e.reason==='pocket')stalls++;}}
   assert.ok(b.done);assert.equal(b.eliminated.length,1);
  }
  assert.ok(hits>30);totals.push({enters,exits,stalls});
 }
 assert.ok(totals[1].enters>totals[0].enters);assert.ok(totals[1].exits>0&&totals[1].stalls>0);
});
