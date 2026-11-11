import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,joinRoom,prepare,start,stepBattle,finish,publicState,reset,beginCountdown,advanceLaunch} from '../game.mjs';
import {bracketRounds} from '../public/assets/bracket.js';

function roomWith(n,seed=123){const room=newRoom('tournament');room.seed=seed;for(let i=0;i<n;i++)joinRoom(room,'選手 '+(i+1));return room;}
function resolve(room){start(room);for(let i=0;i<1000&&!room.battle.done;i++)stepBattle(room.battle);assert.ok(room.battle.done);finish(room);}

test('duel introduction precedes the synchronized countdown and launch',()=>{
 const room=roomWith(2);prepare(room);beginCountdown(room,1000);
 assert.equal(room.round.countdownAt,5000);assert.equal(room.round.shootAt,10000);
 advanceLaunch(room,9999);assert.equal(room.phase,'countdown');assert.equal(room.battle,null);
 advanceLaunch(room,10000);assert.equal(room.phase,'running');assert.ok(room.battle);
});

test('all sizes use exactly one bye per odd stage, two-player games and n-1 real results',()=>{
 for(let n=2;n<=16;n++){
  const room=roomWith(n),seen=new Set();let played=0;
  prepare(room);
  while(room.phase!=='finished'){
   assert.equal(room.round.playerIds.length,2);assert.ok(!seen.has(room.round.matchId));seen.add(room.round.matchId);
   resolve(room);played++;
   if(room.phase!=='finished')prepare(room);
  }
  assert.equal(played,n-1);assert.ok(room.championId);
  const stages=Math.max(...room.matches.map(m=>m.stage));
  let entrants=new Set(room.players.map(p=>p.id));
  for(let stage=1;stage<=stages;stage++){
   const matches=room.matches.filter(m=>m.stage===stage),ids=matches.flatMap(m=>m.playerIds);
   assert.equal(matches.filter(m=>m.playerIds.length===1).length,entrants.size%2);
   assert.equal(ids.length,entrants.size);assert.equal(new Set(ids).size,entrants.size);
   assert.ok(ids.every(p=>entrants.has(p)));assert.ok(matches.every(m=>m.playerIds.includes(m.winnerId)));
   if(stage>1)for(const m of matches)assert.deepEqual(m.sourceMatchIds.map(id=>room.matches.find(x=>x.id===id).winnerId),m.playerIds);
   entrants=new Set(matches.map(m=>m.winnerId));
  }
  assert.deepEqual([...entrants],[room.championId]);
 }
});

test('result immediately populates future slots and stage creation does not wait for host advance',()=>{
 const room=roomWith(7);prepare(room);
 assert.equal(room.matches.filter(m=>m.stage===1).length,4);
 const first=room.round.matchId;resolve(room);
 const state=publicState(room),next=bracketRounds(state).find(r=>r.stage===2);
 assert.ok(next.nodes.flatMap(m=>m.slots).some(s=>s.playerId===room.round.winnerId));
 assert.equal(next.nodes.find(n=>n.sources.includes(first)).slots[0].playerId,room.round.winnerId);
 while(room.matches.filter(m=>m.stage===1).some(m=>!m.winnerId)){prepare(room);resolve(room);}
 assert.equal(room.phase,'result');assert.equal(room.matches.filter(m=>m.stage===2).length,2);
 const ids=room.matches.map(m=>m.id);finish(room);assert.deepEqual(room.matches.map(m=>m.id),ids);
 const restored=JSON.parse(JSON.stringify(room));prepare(restored);assert.equal(restored.matches.length,room.matches.length);assert.equal(restored.round.playerIds.length,2);
});

test('odd future draw pools never present undrawn pairings; seeds favor fewest previous byes',()=>{
 const room=roomWith(9);prepare(room);
 const view=bracketRounds(publicState(room));
 assert.equal(view[1].nodes[0].pool,true);assert.equal(view[1].nodes[0].slots.length,5);
 assert.equal(view[2].nodes[0].pool,true);assert.equal(view[2].nodes[0].slots.length,3);
 assert.ok(view[2].nodes[0].slots.every(s=>s.playerId===null));
 while(room.phase!=='finished'){resolve(room);if(room.phase!=='finished')prepare(room);}
 const byeCounts=new Map();
 for(let stage=1;stage<=Math.max(...room.matches.map(m=>m.stage));stage++){
  const matches=room.matches.filter(m=>m.stage===stage),bye=matches.find(m=>m.playerIds.length===1);
  if(bye){const ids=matches.flatMap(m=>m.playerIds),fewest=Math.min(...ids.map(id=>byeCounts.get(id)||0));assert.equal(byeCounts.get(bye.winnerId)||0,fewest);byeCounts.set(bye.winnerId,fewest+1);}
 }
});

test('initial odd seed is randomized across event seeds; even field has no padding byes',()=>{
 const positions=new Set();
 for(let seed=0;seed<40;seed++){const room=roomWith(5,seed);prepare(room);const bye=room.matches.find(m=>m.playerIds.length===1);positions.add(room.players.findIndex(p=>p.id===bye.winnerId));}
 assert.equal(positions.size,5);
 const room=roomWith(10);prepare(room);assert.equal(room.matches.length,5);assert.ok(room.matches.every(m=>m.playerIds.length===2));
});

test('saved legacy brackets retain results and infer feeds; resetting clears tournament',()=>{
 const room=roomWith(4);prepare(room);resolve(room);prepare(room);resolve(room);
 for(const m of room.matches)delete m.sourceMatchIds;
 const before=room.matches.map(m=>[m.id,m.winnerId]);
 const view=bracketRounds(publicState(room));assert.equal(view[1].nodes[0].sources.length,2);
 prepare(room);resolve(room);assert.ok(room.championId);assert.deepEqual(room.matches.slice(0,before.length-1).map(m=>[m.id,m.winnerId]),before.slice(0,-1));
 reset(room);assert.equal(room.matches.length,0);assert.equal(room.championId,null);assert.equal(room.players.length,4);
});
