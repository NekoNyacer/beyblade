import test from 'node:test';
import {railConfigForCount,surfaceHeight} from '../public/assets/rail-config.js';
import assert from 'node:assert/strict';
import {createBattle,stepBattle,newRoom,joinRoom,prepare,pull,start,finish,publicState,reset,assemble,beginCountdown,advanceLaunch,isExit} from '../game.mjs';
function players(n){return Array.from({length:n},(_,i)=>({id:String(i)}));}
function settle(b){for(let i=0;i<1000&&!b.done;i++)stepBattle(b);assert.ok(b.done,'battle resolves in 40 seconds');return b;}
test('seeded physical simulation is reproducible and bounded for 2–16 players',()=>{for(let n=2;n<=16;n++){const a=settle(createBattle(players(n),123));const b=settle(createBattle(players(n),123));assert.deepEqual(a,b);assert.equal(a.tops.filter(t=>t.alive).length,1);assert.equal(a.eliminated.length,n-1);assert.ok(a.t<35);}});
test('measured pull speed sets initial energy, defaults neutral',()=>{const b=createBattle(players(3),1,{'0':0,'1':1});assert.deepEqual(b.tops.map(t=>t.energy),[65,125,95]);});
test('one pull per eligible player and round; deadline enforced',()=>{const r=newRoom();const a=joinRoom(r,'A'),b=joinRoom(r,'B');prepare(r,100);beginCountdown(r,100);advanceLaunch(r,5100);pull(r,a.id,r.round.id,1,5101);assert.throws(()=>pull(r,a.id,r.round.id,0,5102));assert.throws(()=>pull(r,b.id,'old',.5,5102));assert.throws(()=>pull(r,b.id,r.round.id,NaN,5102));assert.throws(()=>pull(r,b.id,r.round.id,.5,20000));});
test('lobby caps, locking, identity reconnect and secrets',()=>{const r=newRoom();const p=joinRoom(r,'A');for(let i=1;i<16;i++)joinRoom(r,'P'+i);assert.throws(()=>joinRoom(r,'extra'));prepare(r);assert.equal(joinRoom(r,'ignored',p.token).id,p.id);assert.throws(()=>joinRoom(r,'other'));const s=JSON.stringify(publicState(r));assert.ok(!s.includes(r.hostToken));assert.ok(!s.includes(p.token));assert.ok(!s.includes('pulls'));});
test('all tournament sizes have n-1 real matches and exactly one champion',()=>{for(let n=2;n<=16;n++){const r=newRoom('tournament');for(let i=0;i<n;i++)joinRoom(r,'P'+i);let played=0;while(r.phase!=='finished'){prepare(r);if(r.phase==='finished')break;assert.equal(r.round.playerIds.length,2);start(r);settle(r.battle);finish(r);played++;assert.ok(played<16);}assert.equal(played,n-1);assert.ok(r.players.some(p=>p.id===r.championId));assert.equal(r.matches.filter(m=>m.playerIds.length===2).length,n-1);}});
test('repeated start/prepare cannot duplicate a round; reset keeps players',()=>{const r=newRoom();joinRoom(r,'A');joinRoom(r,'B');prepare(r);assert.throws(()=>prepare(r));start(r);assert.throws(()=>start(r));reset(r);assert.equal(r.players.length,2);assert.equal(r.phase,'lobby');assert.equal(r.round,null);});

test('duel and brawl have genuine collision events',()=>{for(const n of [2,10]){const b=createBattle(players(n),123);let hits=0;while(!b.done){stepBattle(b);hits+=b.events.filter(e=>e.type==='hit').length;}assert.ok(hits>0);}});
test('removing a middle player then joining preserves unique colors',()=>{const r=newRoom();for(let i=0;i<5;i++)joinRoom(r,'P'+i);r.players.splice(1,1);joinRoom(r,'New');assert.equal(new Set(r.players.map(p=>p.color)).size,5);});

test('an equal-energy collision applies symmetric loss',()=>{const b=createBattle(players(2),123);Object.assign(b.tops[0],{x:-.3,z:0,vx:1,vz:0,energy:100,drag:0});Object.assign(b.tops[1],{x:.3,z:0,vx:-1,vz:0,energy:100,drag:0});stepBattle(b);assert.ok(b.tops[0].energy<100);assert.equal(b.tops[0].energy,b.tops[1].energy);});

test('SHOOT alone unlocks pulls; GO lasts two seconds and late pulls fail',()=>{const r=newRoom();const p=joinRoom(r,'A');joinRoom(r,'B');prepare(r,0);assert.throws(()=>pull(r,p.id,r.round.id,.5,1));beginCountdown(r,100);advanceLaunch(r,5099);assert.equal(r.phase,'countdown');assert.throws(()=>pull(r,p.id,r.round.id,.5,5099));advanceLaunch(r,5100);assert.equal(r.phase,'running');pull(r,p.id,r.round.id,.5,5100);advanceLaunch(r,11100);assert.equal(r.phase,'running');assert.throws(()=>pull(r,p.id,r.round.id,.5,11101));});
test('assembly validates indices and locks during countdown, survives state publication',()=>{const r=newRoom();const p=joinRoom(r,'A');joinRoom(r,'B');assemble(r,p.id,{blade:2,ratchet:1,bit:0});assert.deepEqual(publicState(r).players[0].parts,{blade:2,ratchet:1,bit:0});assert.throws(()=>assemble(r,p.id,{blade:3,ratchet:0,bit:0}));prepare(r);beginCountdown(r,0);assert.throws(()=>assemble(r,p.id,{blade:0,ratchet:0,bit:0}));advanceLaunch(r,11000);assert.equal(r.battle.tops[0].parts.blade,2);});
test('all six external wells reject grounded motion and admit a real flight over the crest',()=>{
 const rail=railConfigForCount(2);
 for(const angle of rail.ringOutAngles)for(const airborne of [false,true]){
  assert.ok(isExit(Math.cos(angle),Math.sin(angle)));
  const b=createBattle(players(2),7),a=b.tops[0],nx=Math.cos(angle),nz=Math.sin(angle),r=b.arenaRadius+(airborne?.03:-.05);
  Object.assign(a,{x:nx*r,z:nz*r,y:airborne?rail.rimHeight+.20:surfaceHeight(r,0,b.arenaRadius),vy:0,vx:nx*4,vz:nz*4,energy:40,drag:0,railCooldown:100});
  Object.assign(b.tops[1],{x:0,z:0,y:0,vx:0,vz:0,energy:10,drag:0});
  stepBattle(b,.01);
  assert.equal(a.pocketActive,airborne);assert.equal(b.events.some(e=>e.type==='pocket'),airborne);
  assert.equal(a.alive,true);assert.equal(b.done,false);
  if(!airborne)assert.ok(Math.hypot(a.x,a.z)<=rail.railRadius+.07+1e-9);
 }
});

test('public battle frames retain approved parts, six pockets, one dash ramp and timed state',async()=>{
 const {battleFrame}=await import('../battle-frame.mjs');
 for(const n of [2,10,16]){
  const list=players(n).map((p,i)=>({...p,parts:{blade:i%3,ratchet:(i+1)%3,bit:(i+2)%3}})),b=createBattle(list,123);
  Object.assign(b.tops[0],{lastHit:5,lastHitTime:.2,railActive:true,railDir:-1,railEntered:.1,railUntil:1.2,railCooldown:2.5});
  const frame=battleFrame(b,'round', [{type:'ringout',eventId:'123:1',t:.3,id:'0',x:6,z:0,vx:4,vz:0}]);
  assert.equal(frame.arenaRadius,3.35+Math.min(1.65,(n-2)*.13));assert.equal(frame.railRadius,frame.arenaRadius-.20);
  assert.equal(frame.exitAngles.length,1);assert.equal(frame.ringOutAngles.length,6);assert.equal(frame.ringOutHalfWidth,.16);
  assert.deepEqual(frame.tops[0].parts,list[0].parts);assert.equal(frame.tops[0].lastHitTime,.2);
  assert.equal(frame.tops[0].railUntil,1.2);assert.equal(frame.events[0].eventId,'123:1');
  frame.tops[0].parts.blade=99;assert.equal(b.tops[0].parts.blade,0);
  b.tops[0].outReason='ringout';b.tops[0].alive=false;const restored=battleFrame(JSON.parse(JSON.stringify(b)),'restored');
  assert.equal(restored.tops[0].outReason,'ringout');assert.equal(restored.tops[0].alive,false);
 }
});
