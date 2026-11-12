import test from 'node:test';import assert from 'node:assert/strict';
import{appendRipcordEvent,measureRipcord}from'../public/assets/ripcord.js';
import{createBattle,stepBattle,newRoom,joinRoom,prepare,beginCountdown,advanceLaunch,pull}from'../game.mjs';
import{railConfigForCount,surfaceHeight}from'../public/assets/rail-config.js';
const stroke=(duration,distance=200)=>[{x:0,y:0,t:0},{x:distance,y:0,t:duration}];
test('rightward full strokes measure speed independent of screen size and pre-hold',()=>{const fast=measureRipcord(stroke(150),200),slow=measureRipcord(stroke(900),200);assert.ok(fast.accepted&&slow.accepted&&fast.power>.8&&slow.power<.1);assert.equal(fast.power,measureRipcord([{x:0,y:0,t:0},{x:0,y:0,t:1000},{x:200,y:0,t:1150}],200).power);assert.equal(fast.power,measureRipcord(stroke(150,300),300).power);});
test('taps, incomplete and leftward pulls cannot launch; diagonal pulls set bounded tilt',()=>{for(const distance of [0,40,190,-200])assert.equal(measureRipcord(stroke(100,distance),200).accepted,false);assert.equal(measureRipcord([{x:0,y:0,t:0},{x:200,y:0,t:100},{x:200,y:0,t:900}],200).power,measureRipcord(stroke(900),200).power);assert.equal(measureRipcord([{x:0,y:0,t:0},{x:200,y:200,t:150}],200).angle,25);assert.ok(measureRipcord([{x:0,y:0,t:0},{x:200,y:40,t:150}],200).angle>11);});
test('coalesced horizontal pointer samples retain a monotonic event clock',()=>{const points=[{x:0,y:0,t:0}];appendRipcordEvent(points,{clientX:200,clientY:0,timeStamp:100,getCoalescedEvents:()=>[{clientX:100,clientY:0,timeStamp:50},{clientX:200,clientY:0,timeStamp:100}]});assert.equal(points.length,3);assert.equal(measureRipcord(points,200).power,measureRipcord(stroke(100),200).power);});
test('launch angles validate before accepting a pull and are used by authoritative battle',()=>{const room=newRoom(),a=joinRoom(room,'A');joinRoom(room,'B');prepare(room);beginCountdown(room,0);advanceLaunch(room,3000);for(const angle of [NaN,Infinity,-1,26,'15'])assert.throws(()=>pull(room,a.id,room.round.id,.5,3001,angle));assert.equal(room.round.pulledIds.length,0);pull(room,a.id,room.round.id,.8,3001,20);advanceLaunch(room,11000);const top=room.battle.tops.find(t=>t.id===a.id);assert.equal(top.launchPower,.8);assert.equal(top.launchTilt,20*Math.PI/180);assert.ok(Math.abs(top.energy-113)<1e-9);});
test('tilt changes launch path without inventing extra initial energy',()=>{const players=[{id:'a'},{id:'b'}],flat=createBattle(players,12,{a:.5},{a:0}),tilted=createBattle(players,12,{a:.5},{a:25});assert.equal(flat.tops[0].energy,tilted.tops[0].energy);assert.notEqual(flat.tops[0].vx,tilted.tops[0].vx);assert.ok(Math.abs(Math.hypot(flat.tops[0].vx,flat.tops[0].vz)-Math.hypot(tilted.tops[0].vx,tilted.tops[0].vz))<1e-9);});
test('overdriven rail contact can strike the shield or reach the wide front catch',()=>{
 for(const [angle,target] of [[-.8,'shield'],[.7,'pocket']]){
  const b=createBattle([{id:'a'},{id:'b'}],21,{a:1}),a=b.tops[0],r=b.railRadius;
  const x=r*Math.cos(angle),z=r*Math.sin(angle);
  Object.assign(a,{x,z,y:surfaceHeight(x,z,b.arenaRadius),vy:0,vx:-12*Math.sin(angle),vz:12*Math.cos(angle),railActive:true,railDir:1,railEntered:-.3,railUntil:3});
  Object.assign(b.tops[1],{x:0,z:0,y:0,vx:0,vz:0,drag:0});
  const initial=a.energy,events=[];
  for(let i=0;i<180&&!b.done;i++){
   stepBattle(b,.01);events.push(...b.events);assert.ok(Math.hypot(a.x,a.z)<=b.arenaRadius+.61);
  }
  assert.ok(events.some(e=>e.id===a.id&&e.type==='rail'&&e.reason==='overload'));
  if(target==='shield')assert.ok(events.some(e=>e.id===a.id&&e.type==='shield'));
  else assert.ok(events.some(e=>e.id===a.id&&e.type==='pocket'&&e.phase==='enter'&&e.pocketIndex===1));
  assert.ok(a.energy<initial-5);
 }
});
test('very fast launches can lose to medium launches; shield events and long rail arcs occur',()=>{let fastWins=0,losses=0,shields=0,travel=0;for(let seed=1;seed<=30;seed++){const b=createBattle([{id:'a'},{id:'b'}],seed,{a:1,b:.5},{a:18});while(!b.done&&b.t<40){stepBattle(b);for(const e of b.events){if(e.type==='shield')shields++;travel=Math.max(travel,e.railTravel||0);}}assert.ok(b.done);if(b.winnerId==='a')fastWins++;else losses++;}assert.ok(fastWins>0&&losses>0&&shields>0&&travel>Math.PI);});

test('SHOOT opens a shared window, with neutral fallback at its deadline',()=>{const room=newRoom();joinRoom(room,'A');joinRoom(room,'B');prepare(room);beginCountdown(room,0);assert.equal(room.round.shootAt,3000);assert.equal(room.round.startsAt,4200);assert.equal(room.round.deadline,4200);advanceLaunch(room,2999);assert.equal(room.phase,'countdown');advanceLaunch(room,3000);assert.equal(room.phase,'shoot');assert.equal(room.battle,null);advanceLaunch(room,4199);assert.equal(room.battle,null);advanceLaunch(room,4200);assert.equal(room.phase,'running');assert.equal(room.battle.t,0);assert.equal(room.battle.tick,0);assert.deepEqual(room.round.autoReleasedIds,room.round.playerIds);for(const top of room.battle.tops){assert.equal(top.launchPower,.5);assert.ok(Math.abs(top.angularSpeed*60/(2*Math.PI)-7200)<1e-9);}const battle=room.battle;advanceLaunch(room,4300);assert.equal(room.battle,battle);});
test('all players release together early, from a single initial physics frame',()=>{const room=newRoom(),a=joinRoom(room,'A'),b=joinRoom(room,'B');prepare(room);beginCountdown(room,0);pull(room,a.id,room.round.id,1,3000,25);assert.equal(room.phase,'shoot');assert.equal(room.battle,null);assert.throws(()=>pull(room,a.id,room.round.id,.2,3001));pull(room,b.id,room.round.id,.5,3500,0);assert.equal(room.phase,'running');assert.equal(room.round.startsAt,3500);assert.equal(room.battle.tick,0);assert.equal(room.battle.t,0);assert.equal(room.battle.tops[0].launchPower,1);assert.equal(room.battle.tops[0].launchTilt,25*Math.PI/180);assert.deepEqual(room.round.autoReleasedIds,[]);const before=structuredClone(room.battle);assert.throws(()=>pull(room,a.id,room.round.id,.2,3501));assert.deepEqual(room.battle,before);});
test('late or disconnected phones fall back without changing timely input',()=>{const room=newRoom(),a=joinRoom(room,'A'),b=joinRoom(room,'B');prepare(room);beginCountdown(room,0);pull(room,a.id,room.round.id,.8,3400,10);b.connected=false;assert.throws(()=>pull(room,b.id,room.round.id,1,4200,25));advanceLaunch(room,4300);assert.equal(room.round.startsAt,4200);assert.deepEqual(room.round.autoReleasedIds,[b.id]);assert.equal(room.battle.tops[0].launchPower,.8);assert.equal(room.battle.tops[1].launchPower,.5);assert.equal(room.battle.tick,0);});
test('practice and demo opponents are ready without waiting for a phone',()=>{for(const flag of ['practice','demo']){const room=newRoom(),a=joinRoom(room,'A'),b=joinRoom(room,'B');b[flag]=true;prepare(room);beginCountdown(room,0);pull(room,a.id,room.round.id,.8,3100);assert.equal(room.phase,'running');assert.equal(room.round.startsAt,3100);assert.deepEqual(room.round.autoReleasedIds,[b.id]);assert.equal(room.battle.tops[1].launchPower,.5);}});
test('recovered battles resume without reopening input or resetting physics',()=>{const room=newRoom(),a=joinRoom(room,'A');joinRoom(room,'B');prepare(room);beginCountdown(room,0);advanceLaunch(room,4200);stepBattle(room.battle,.04);const battle=room.battle,before=structuredClone(battle);room.phase='ready';room.recovered=true;beginCountdown(room,8000);assert.equal(room.round.startsAt,11000);advanceLaunch(room,11000);assert.equal(room.battle,battle);assert.deepEqual(room.battle,before);assert.throws(()=>pull(room,a.id,room.round.id,1,11001,25));});
test('recovered unfinished window preserves submitted pulls and starts only once',()=>{const room=newRoom(),a=joinRoom(room,'A'),b=joinRoom(room,'B');prepare(room);beginCountdown(room,0);pull(room,a.id,room.round.id,.8,3100);room.phase='ready';room.recovered=true;beginCountdown(room,8000);assert.equal(room.round.launchResumed,false);assert.equal(room.battle,null);pull(room,b.id,room.round.id,.4,11100);assert.equal(room.battle.tick,0);assert.deepEqual(room.battle.tops.map(t=>t.launchPower),[.8,.4]);});

test('new live battles release airborne tops and gravity brings them down',()=>{const room=newRoom();joinRoom(room,'A');joinRoom(room,'B');prepare(room);beginCountdown(room,0);advanceLaunch(room,4200);const before=room.battle.tops.map(t=>t.y);for(const top of room.battle.tops){assert.ok(top.y>surfaceHeight(top.x,top.z,room.battle.arenaRadius)+.5);assert.ok(Math.hypot(top.x,top.z)<room.battle.arenaRadius*.6);}stepBattle(room.battle,.08);room.battle.tops.forEach((top,i)=>assert.ok(top.y<before[i]));});


test('7200 RPM fallback preserves valid zero and medium pulls and all parts',()=>{
 for(const count of [2,8,16]){
  const room=newRoom();
  for(let i=0;i<count;i++){const p=joinRoom(room,'P'+i);p.parts={blade:i%3,ratchet:(i+1)%3,bit:(i+2)%3};}
  prepare(room);beginCountdown(room,0);
  pull(room,room.players[0].id,room.round.id,0,3001,25);
  if(count>2)pull(room,room.players[1].id,room.round.id,.5,3002,0);
  advanceLaunch(room,4200);
  room.battle.tops.forEach((top,i)=>{
   const expected=i===0?65:i===1&&count>2?95:7200*2*Math.PI/60/6;
   assert.ok(Math.abs(top.energy-expected)<1e-9);
   assert.ok(Math.abs(top.angularSpeed-expected*6)<1e-9);
   assert.deepEqual(top.parts,room.players[i].parts);
  });
  const before=room.battle.tops.at(-1).angularSpeed;
  stepBattle(room.battle,.04);
  assert.ok(room.battle.tops.at(-1).angularSpeed>before*.99);
  for(let tick=0;tick<3000&&!room.battle.done;tick++)stepBattle(room.battle);
  assert.equal(room.battle.done,true);
  assert.equal(room.battle.tops.filter(top=>top.alive).length,1);
  assert.equal(room.battle.eliminated.length,count-1);
 }
});
