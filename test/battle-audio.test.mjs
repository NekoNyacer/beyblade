import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createBattleAudio } from '../public/assets/battle-audio.js';

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
  createBufferSource(){return {...node(),playbackRate:{},stop(){this.onended?.();},start(at,offset){played.push({cue:this.buffer.cue,offset,rate:this.playbackRate.value});this.onended?.();}};}
  createGain(){return {...node(),gain:{setTargetAtTime(){}}};}
  createStereoPanner(){return {...node(),pan:{}};}
 };
 return {played,fetched,get ctx(){return ctx;},set fail(value){fail=value;}};
}

test('sample set contains exactly twenty valid WAV files and nine metal alternatives',()=>{
 const dir=new URL('../public/assets/sounds/',import.meta.url),files=readdirSync(dir);
 assert.equal(files.length,20);
 for(const file of files){const bytes=readFileSync(new URL(file,dir));assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert.ok(bytes.length>1000);}
 for(const legacy of ['wall','land','rail','stop'])assert.ok(!files.includes(legacy+'.wav'));
});

test('audio needs explicit enable, decodes once, and respects hidden/stale cues',async()=>{
 const h=harness(),audio=createBattleAudio();assert.equal(audio.enabled,false);assert.equal(audio.play('go'),false);
 await audio.enable();await audio.enable();assert.equal(h.fetched.length,23);assert.equal(audio.enabled,true);
 assert.equal(audio.play('go',{offset:1.2}),true);assert.equal(h.played.at(-1).offset,1.2);
 assert.equal(audio.play('go',{offset:3}),false);document.hidden=true;assert.equal(audio.play('shoot'),false);
 document.hidden=false;h.ctx.state='suspended';assert.equal(audio.play('shoot'),false);
});

test('each impact tier cycles all three clips without consecutive repeats',async()=>{
 const h=harness(),audio=createBattleAudio();await audio.enable();
 const tiers=[['hit','ping-light-2','ping-light-3'],['ping-mid-1','ping-mid-2','ping-mid-3'],['heavyHit','ping-heavy-2','ping-heavy-3']];
 for(const [i,strength] of [.1,.5,.9].entries()){
  const start=h.played.length;
  for(let n=0;n<9;n++){h.ctx.currentTime+=.3;assert.equal(audio.impact(strength),true);}
  const cues=h.played.slice(start).map(x=>x.cue);
  for(let n=0;n<9;n+=3)assert.deepEqual(new Set(cues.slice(n,n+3)),new Set(tiers[i]));
  assert.ok(cues.every((cue,n)=>!n||cue!==cues[n-1]));
 }
 assert.equal(audio.impact(NaN),false);
});

test('strong collision can replace a simultaneous graze but not flood audio',async()=>{
 const h=harness(),audio=createBattleAudio();await audio.enable();
 assert.equal(audio.impact(.1),true);assert.equal(audio.impact(.1),false);assert.equal(audio.impact(.9),true);assert.equal(audio.impact(.5),false);
 assert.equal(h.played.length,2);
});

test('failed decoding can be retried without enabling incomplete sound bank',async()=>{
 const h=harness(),audio=createBattleAudio();h.fail='shoot';await assert.rejects(audio.enable());assert.equal(audio.enabled,false);
 h.fail='';await audio.enable();assert.equal(audio.enabled,true);
});
