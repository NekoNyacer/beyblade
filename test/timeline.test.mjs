import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameTimeline, FrameCursor } from '../public/assets/motion.js';
import { battleFrame } from '../battle-frame.mjs';
import { createBattle, stepBattle } from '../game.mjs';
import { clip } from '../scripts/generate-scenarios.mjs';
const top = (t, alive = true) => ({id:'a',x:t*3,z:t*2,vx:3,vz:2,spin:t*25,energy:100-t,alive});
const snapshot = (t, events = [], roundId = 'r') => ({roundId,t,tops:[top(t)],events});
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('30/60/120Hz sample the same continuous translation and unwrapped spin',()=>{
  for(const hz of [30,60,120])for(const interval of [40,80]){
    const timeline=new FrameTimeline();let next=0;
    for(let tick=0;tick<=hz*2;tick++){
      const now=tick*1000/hz;
      while(next<=now+1e-7){timeline.push(snapshot(next/1000),next);next+=interval;}
      const frame=timeline.sample(now),t=Math.max(0,now/1000-.1);
      close(frame.t,t);close(frame.tops[0].x,t*3);close(frame.tops[0].spin,t*25);
    }
  }
});
test('duplicate snapshots cannot reset interpolation or repeat a contact',()=>{
  const timeline=new FrameTimeline();timeline.push(snapshot(0),0);
  timeline.push(snapshot(.08,[{type:'hit',eventId:'hit',t:.06}]),80);
  close(timeline.sample(120).tops[0].x,.06);
  assert.equal(timeline.push(snapshot(.08,[{type:'hit',eventId:'hit',t:.06}]),120),false);
  close(timeline.sample(140).tops[0].x,.12);
  assert.equal(timeline.sample(160).events.length,1);
  assert.equal(timeline.sample(170).events.length,0);
});
test('pause freezes time and resumes without a jump; stale snapshots do not roll back',()=>{
  const timeline=new FrameTimeline();timeline.push(snapshot(0),0);timeline.push(snapshot(.08),80);
  const before=timeline.sample(140);timeline.setPaused(true,140);
  assert.deepEqual(timeline.sample(900),{...before,events:[]});
  timeline.setPaused(false,900);close(timeline.sample(900).t,before.t);close(timeline.sample(920).t,before.t+.02);
  assert.equal(timeline.push(snapshot(.04),920),false);
  timeline.push(snapshot(0,[],'next-round'),920);close(timeline.sample(920).t,0);
});
test('alive switches only on the authoritative timestamp, and events are emitted at contact time',()=>{
  const timeline=new FrameTimeline();timeline.push(snapshot(0),0);
  timeline.push({...snapshot(.08,[{eventId:'hit',type:'hit',t:.05},{eventId:'out',type:'out',t:.08}]),tops:[top(.08,false)]},80);
  const early=timeline.sample(140);assert.equal(early.tops[0].alive,true);assert.deepEqual(early.events,[]);
  assert.equal(timeline.sample(150).events[0].eventId,'hit');
  const last=timeline.sample(180);assert.equal(last.tops[0].alive,false);assert.equal(last.events[0].eventId,'out');
});
test('cursor includes all crossed snapshots and explicitly resets when a clip loops',()=>{
  const frames=[0,.08,.16,.24].map(t=>snapshot(t));const cursor=new FrameCursor(frames);
  assert.equal(cursor.advance(0).frames.length,1);assert.equal(cursor.advance(.2).frames.length,2);
  assert.equal(cursor.advance(.21).frames.length,0);const loop=cursor.advance(.01);
  assert.equal(loop.reset,true);assert.equal(loop.frames.length,1);
});
test('sampled clips retain every live event, time and winner over 2/10/16 players and seeds',()=>{
  for(const count of [2,10,16])for(const seed of [123,32451,87123]){
    const players=Array.from({length:count},(_,i)=>({id:String(i)})),battle=createBattle(players,seed),events=[];
    while(!battle.done){stepBattle(battle);events.push(...battle.events);}
    const replay=clip(players,seed),recorded=replay.frames.flatMap(frame=>frame.events);
    assert.deepEqual(recorded,events);assert.equal(new Set(recorded.map(event=>event.eventId)).size,recorded.length);
    assert.equal(replay.winnerId,battle.winnerId);assert.deepEqual(replay.frames.at(-1),battleFrame(battle,'demo-round',replay.frames.at(-1).events));
    for(const hz of [30,60,120]){
      const timeline=new FrameTimeline(),cursor=new FrameCursor(replay.frames),observed=[];
      for(let tick=0;tick<Math.ceil((battle.t+.3)*hz);tick++){
        const now=tick*1000/hz;
        for(const frame of cursor.advance(now/1000).frames)timeline.push(frame,frame.t*1000);
        observed.push(...(timeline.sample(now)?.events||[]));
      }
      assert.deepEqual(observed,recorded,`${count} players, seed ${seed}, ${hz}Hz`);
    }
  }
});

test('rail state changes at enter/release events between snapshots, once at any refresh rate',()=>{
  for(const hz of [30,60,120]){
    const timeline=new FrameTimeline(),events=[
      {type:'rail',phase:'enter',eventId:'rail-1',t:.02,id:'a',direction:1},
      {type:'rail',phase:'exit',eventId:'rail-2',t:.06,id:'a',direction:1}
    ];
    timeline.push({...snapshot(0),tops:[{...top(0),railActive:false,railDir:0}]},0);
    timeline.push({...snapshot(.08,events),tops:[{...top(.08),railActive:false,railDir:1}]},80);
    const observed=[];
    for(let tick=0;tick<=Math.ceil(.22*hz);tick++){
      const frame=timeline.sample(tick*1000/hz);
      observed.push(...frame.events);
      assert.equal(frame.tops[0].railActive,frame.t>=.02-1e-8&&frame.t<.06-1e-8);
    }
    assert.deepEqual(observed,events);
  }
});
