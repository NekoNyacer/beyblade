import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBattleAudio } from '../public/assets/battle-audio.js';
import { createMatchAudio } from '../public/assets/match-audio.js';
import { createLaunchAudio } from '../public/assets/launch-cue.js';

function harness() {
 const sources=[],gains=[],listeners=new Map();let ctx,fail='';
 globalThis.document={hidden:false,addEventListener:(type,fn)=>listeners.set(type,fn)};
 globalThis.fetch=async url=>({ok:!url.includes(fail||'NO_FAILURE'),arrayBuffer:async()=>url.split('/').at(-1).slice(0,-4)});
 const node=()=>({connect(){},disconnect(){}});
 globalThis.AudioContext=class {
  constructor(){ctx=this;this.currentTime=10;this.state='suspended';this.destination={};}
  async resume(){this.state='running';}
  createDynamicsCompressor(){return {...node(),threshold:{},ratio:{}};}
  async decodeAudioData(cue){return {cue,duration:cue==='go'?.5:3};}
  createBufferSource(){const s={...node(),playbackRate:{},stop(at){this.stoppedAt=at??ctx.currentTime;},start(at,offset){this.at=at;this.offset=offset;sources.push(this);}};return s;}
  createGain(){const gain={...node(),gain:{value:1,setTargetAtTime(value,at){this.fade={value,at};}}};gains.push(gain);return gain;}
  createStereoPanner(){return {...node(),pan:{}};}
 };
 return {sources,gains,listeners,get ctx(){return ctx;},set fail(value){fail=value;},crowds:()=>sources.filter(s=>/^(cheer-|applause)/.test(s.buffer.cue))};
}
const state=(id='a')=>({phase:'running',players:[{id:'winner'}],round:{id,shootAt:10000,startsAt:11200,winnerId:null}});

test('audience launches once, stays below announcer, and never stacks',async()=>{
 const h=harness(),sound=createMatchAudio(),s=state();await sound.enable();
 sound.updateClock(s,11200);sound.updateClock(s,11240);
 assert.deepEqual(h.crowds().map(x=>x.buffer.cue),['cheer-short']);
 assert.equal(h.crowds()[0].at,10.12);
 assert.ok(h.gains.at(-1).gain.value<=.13);
 assert.equal(sound.play('crowd-applause'),false);
});

test('winner celebration waits for replay, replaces the opening cheer, and fires once',async()=>{
 const h=harness(),sound=createMatchAudio(),s=state();await sound.enable();sound.updateClock(s,11200);
 const opening=h.crowds()[0];s.phase='result';s.championId='winner';s.round.winnerId='winner';
 sound.updateClock(s,13000,true);assert.equal(h.crowds().length,1);
 sound.updateClock(s,13000);sound.updateClock(s,13040);s.phase='finished';sound.updateClock(s,14000);
 assert.deepEqual(h.crowds().map(x=>x.buffer.cue),['cheer-short','cheer-medium']);
 assert.equal(h.crowds()[1].at,10.65);assert.equal(opening.stoppedAt,10.08);
});

test('round wins applaud; no winner or invalid winner cannot celebrate',async()=>{
 for(const winner of ['winner',null,'missing']){
  const h=harness(),sound=createMatchAudio(),s=state();await sound.enable();sound.updateClock(s,12000);
  s.phase='result';s.round.winnerId=winner;sound.updateClock(s,13000);sound.updateClock(s,13040);
  assert.deepEqual(h.crowds().map(x=>x.buffer.cue),winner==='winner'?['applause']:[]);
 }
});

test('late reconnect, disabled audio, suspend, resumed launch and old result stay crowd-silent',async()=>{
 for(const kind of ['result-reconnect','disabled','suspended','resumed']){
  const h=harness(),sound=createMatchAudio(),s=state();
  if(kind!=='disabled')await sound.enable();
  if(kind==='result-reconnect'){s.phase='result';s.championId='winner';}
  if(kind==='suspended')h.ctx.state='suspended';
  if(kind==='resumed')s.round.launchResumed=true;
  sound.updateClock(s,kind==='result-reconnect'?14000:11200);
  if(kind==='disabled'){
   s.phase='result';s.championId='winner';sound.updateClock(s,13000);await sound.enable();sound.updateClock(s,13040);
  }
  assert.equal(h.crowds().length,0,kind);
 }
 const h=harness(),sound=createMatchAudio(),s=state();await sound.enable();sound.updateClock(s,12000);
 assert.equal(h.crowds().length,0,'no launch cheer on late running reconnect');
});

test('hiding or resetting cancels audience audio; hidden results do not replay',async()=>{
 const h=harness(),sound=createMatchAudio(),s=state();await sound.enable();sound.updateClock(s,11200);
 document.hidden=true;h.listeners.get('visibilitychange')();assert.equal(h.crowds()[0].stoppedAt,10.08);
 s.phase='result';s.championId='winner';sound.updateClock(s,13000);document.hidden=false;sound.updateClock(s,14000);
 assert.equal(h.crowds().length,1);
 const next=state('b');h.ctx.currentTime=20;sound.updateClock(next,11200);
 sound.updateClock({phase:'lobby'},15000);assert.equal(h.crowds().at(-1).stoppedAt,20.08);
});

test('missing optional audience file does not disable the existing sound bank',async()=>{
 const h=harness(),sound=createBattleAudio();h.fail='audience';await sound.enable();
 assert.equal(sound.enabled,true);assert.equal(sound.play('shoot'),true);assert.equal(sound.play('crowd-cheer-short'),false);
});

test('GO preserves its whole repaired half-second and late join never cuts it short',()=>{
 const cues=[],sound={play:(cue,options={})=>{cues.push({cue,...options});return true;},cancelCall(){}};
 createLaunchAudio(sound)({phase:'countdown',round:{id:'a',shootAt:8000}},7400);
 const go=cues.find(x=>x.cue==='go'),shoot=cues.find(x=>x.cue==='shoot');
 assert.ok(Math.abs(shoot.delay-go.delay-.5)<1e-9);
 cues.length=0;createLaunchAudio(sound)({phase:'countdown',round:{id:'b',shootAt:8000}},7700);
 assert.ok(!cues.some(x=>x.cue==='go'));assert.equal(cues.filter(x=>x.cue==='shoot').length,1);
});

test('bundled crowd and repaired GO are valid bounded PCM WAV assets',()=>{
 for(const file of ['audience/cheer-short','audience/cheer-medium','audience/applause','sounds/go']){
  const b=readFileSync(new URL('../public/assets/'+file+'.wav',import.meta.url));
  assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');
  let at=12,format,data;
  while(at+8<=b.length){const size=b.readUInt32LE(at+4),type=b.toString('ascii',at,at+4);if(type==='fmt ')format=b.subarray(at+8,at+8+size);if(type==='data')data=b.subarray(at+8,at+8+size);at+=8+size+(size%2);}
  assert.equal(format.readUInt16LE(0),1);assert.equal(format.readUInt16LE(14),16);
  const seconds=data.length/format.readUInt32LE(8);assert.ok(seconds>0&&seconds<4);
  if(file==='sounds/go'){assert.equal(seconds,.5);assert.equal(data.readInt16LE(0),0);assert.equal(data.readInt16LE(data.length-2),0);}
 }
});
