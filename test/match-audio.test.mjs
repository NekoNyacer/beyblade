import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchAudio,launchCue} from '../public/assets/match-audio.js';
import {createLaunchAudio} from '../public/assets/launch-cue.js';
import {serverClockOffset} from '../public/assets/server-clock.js';
function harness(){
 const played=[],fetched=[];let ctx,fail='';
 globalThis.document={hidden:false};
 globalThis.fetch=async url=>{const cue=url.split('/').at(-1).slice(0,-4);fetched.push(cue);return {ok:cue!==fail,arrayBuffer:async()=>cue};};
 const node=()=>({connect(){},disconnect(){}});
 globalThis.AudioContext=class{
  constructor(){ctx=this;this.currentTime=0;this.state='suspended';this.destination={};}
  async resume(){this.state='running';}
  createDynamicsCompressor(){return {...node(),threshold:{},ratio:{}};}
  async decodeAudioData(cue){return {cue,duration:cue==='go'?2.2:.8};}
  createBufferSource(){return {...node(),playbackRate:{},stop(){this.onended?.();},start(at,offset){played.push({cue:this.buffer.cue,at,offset,rate:this.playbackRate.value});this.onended?.();}};}
  createGain(){return {...node(),gain:{setTargetAtTime(){}}};}
  createStereoPanner(){return {...node(),pan:{}};}
 };
 return {played,fetched,get ctx(){return ctx;},set fail(value){fail=value;}};
}


test('countdown honors tournament intro and SHOOT opens the shared window',()=>{
 const state={phase:'countdown',round:{id:'a',countdownAt:5000,shootAt:8000,startsAt:9200}};
 for(const [now,cue] of [[1000,''],[4999,''],[5000,'3'],[6000,'2'],[7000,'1'],[8000,'SHOOT!'],[9199,'SHOOT!'],[9200,'']])assert.equal(launchCue(state,now),cue);
 state.phase='shoot';assert.equal(launchCue(state,8100),'SHOOT!');state.phase='running';assert.equal(launchCue(state,8300),'SHOOT!');
});
test('GO and SHOOT are scheduled 500ms apart; launch waits for synchronized entry',()=>{
 const played=[];const sound={play:(cue,options={})=>{played.push({cue,...options});return true;},cancelCall(){}};
 const update=createLaunchAudio(sound),state={phase:'countdown',round:{id:'a',shootAt:8000,startsAt:9200}};
 update(state,7400);update(state,7500);assert.deepEqual(played.map(x=>x.cue),['one','go','shoot']);
 assert.ok(Math.abs(played[2].delay-played[1].delay-.5)<1e-9);
 state.phase='shoot';update(state,8100);assert.ok(!played.some(x=>x.cue==='launch'));
 state.phase='running';state.round.startsAt=8500;update(state,8500);update(state,8550);assert.equal(played.filter(x=>x.cue==='launch').length,1);
});
test('late reconnect is silent, free practice works, and results wait for replay',async()=>{
 const h=harness(),sound=createMatchAudio(),state={phase:'running',round:{id:'a',shootAt:8000,startsAt:9200}};
 await sound.enable();sound.updateClock(state,10000);assert.equal(h.played.length,0);
 state.phase='result';sound.updateClock(state,12000,true);assert.equal(h.played.length,0);sound.updateClock(state,12000);sound.updateClock(state,12050);assert.deepEqual(h.played.map(x=>x.cue),['finish']);
 state.phase='running';state.round={id:'practice',startsAt:13000};h.ctx.currentTime+=1;sound.updateClock(state,13000);assert.deepEqual(h.played.slice(-2).map(x=>x.cue),['launch','cheer-short']);
});
test('queued state cannot move host, display or phone clock backward',()=>{
 let offset=serverClockOffset(null,10000,11000);assert.equal(offset,-1000);
 offset=serverClockOffset(offset,12000,13600);assert.equal(offset,-1000);
 assert.equal(serverClockOffset(offset,16000,17001),-1000);assert.equal(serverClockOffset(null,11000,10000),1000);
});
test('scheduled audio starts on the audio clock, not a delayed render timer',async()=>{
 const h=harness(),sound=createMatchAudio();await sound.enable();h.ctx.currentTime=5;
 sound.updateClock({phase:'countdown',round:{id:'a',shootAt:10000,startsAt:11200}},9400);
 const go=h.played.find(x=>x.cue==='go'),shoot=h.played.find(x=>x.cue==='shoot');assert.ok(Math.abs(go.at-5.1)<1e-9);assert.ok(Math.abs(shoot.at-5.6)<1e-9);
});
