import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameTimeline,RingoutReplay,sampleFrames} from '../public/assets/motion.js';
const top=(t,alive=true)=>({id:'a',x:t,z:0,vx:1,vz:0,spin:t*25,energy:100,alive,outReason:alive?null:'ringout'});
const frame=(t,events=[],alive=true)=>({roundId:'test',t,tops:[top(t,alive)],events,done:!alive,winnerId:alive?null:'b'});
test('out and ringout become discrete at their exact event timestamp',()=>{
 for(const type of ['out','ringout']){
  const event={type,t:.05,eventId:type,id:'a'},frames=[frame(0),frame(.08,[event],false)];
  assert.equal(sampleFrames(frames,.049).tops[0].alive,true);
  assert.equal(sampleFrames(frames,.05).tops[0].alive,false);
  assert.equal(sampleFrames(frames,.05).done,false);
  assert.equal(sampleFrames(frames,.08).done,true);
  if(type==='ringout')assert.equal(sampleFrames(frames,.05).tops[0].outReason,'ringout');
 }
});
test('a pause never consumes undisplayed events or moves with newly received frames',()=>{
 const timeline=new FrameTimeline();timeline.push(frame(0),0);
 timeline.push(frame(.08,[{type:'hit',eventId:'contact',t:.05}]),80);
 timeline.sample(140);timeline.setPaused(true,145);
 const frozen=timeline.sample(145);timeline.push(frame(.16),160);
 assert.deepEqual(timeline.sample(900),frozen);
 timeline.setPaused(false,900);
 assert.equal(timeline.sample(900).events.filter(event=>event.eventId==='contact').length,1);
});
test('ringout replay samples only real buffered movement and emits visual events once',()=>{
 const event={type:'ringout',eventId:'exit',id:'a',t:.72,x:.72,z:0,vx:1,vz:0};
 const frames=Array.from({length:11},(_,i)=>frame(i*.08,i===9?[event]:[],i<9));
 const replay=new RingoutReplay(frames,event),events=[];
 for(let tick=0;tick<=144;tick++){
  const sampled=replay.sample(tick/60);events.push(...sampled.events);
  assert.ok(sampled.t>=replay.start&&sampled.t<=replay.end);
  assert.equal(sampled.tops[0].x,sampled.t);
  assert.equal(sampled.tops[0].alive,sampled.t<.72-1e-8);
 }
 assert.equal(replay.duration,2.4);assert.equal(replay.rate,.35);
 assert.equal(events.filter(event=>event.eventId==='exit').length,1);
 assert.deepEqual(replay.sample(10),{...sampleFrames(frames,replay.end),events:[]});
 assert.equal(frames.at(-1).winnerId,'b');
});

test('elimination reaches the recorded contact point at event time, never after it',()=>{
 const event={type:'ringout',eventId:'exit',id:'a',t:.05,x:5.8,z:.2};
 const frames=[{...frame(0),tops:[{...top(0),x:5.5,z:0}]},{...frame(.08,[event],false),tops:[{...top(.08,false),x:5.8,z:.2}]}];
 assert.equal(sampleFrames(frames,.05).tops[0].x,5.8);
 assert.equal(sampleFrames(frames,.07).tops[0].x,5.8);
 assert.equal(sampleFrames(frames,.05).tops[0].z,.2);
});

test('pocket entry never sinks before its event and escape clears depth at the event',()=>{
 const before=frame(0),after=frame(.08,[{type:'pocket',phase:'enter',id:'a',pocketIndex:1,t:.04}]);
 Object.assign(before.tops[0],{pocketActive:false,pocketIndex:null,pocketDepth:0});Object.assign(after.tops[0],{pocketActive:true,pocketIndex:1,pocketDepth:.4});
 assert.equal(sampleFrames([before,after],.039).tops[0].pocketDepth,0);const entering=sampleFrames([before,after],.06).tops[0];assert.equal(entering.pocketActive,true);assert.ok(Math.abs(entering.pocketDepth-.2)<1e-8);
 const out=frame(.16,[{type:'pocket',phase:'exit',id:'a',pocketIndex:1,t:.12}]);Object.assign(out.tops[0],{pocketActive:false,pocketIndex:null,pocketDepth:0});const escaped=sampleFrames([after,out],.12).tops[0];assert.equal(escaped.pocketActive,false);assert.equal(escaped.pocketDepth,0);assert.equal(escaped.pocketIndex,null);
});
