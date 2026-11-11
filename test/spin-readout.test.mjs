import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpinReadout,rpmText,rpmValue} from '../public/assets/spin-readout.js';
const top={id:'a',alive:true,angularSpeed:600};
const frame=t=>({roundId:'round',t,tops:[top]});
const state=phase=>({phase,round:{id:'round',pulledIds:[],autoReleasedIds:['a']}});
test('RPM uses authoritative angular speed, including residual spin',()=>{
 assert.equal(rpmText(top),'5,730');assert.equal(rpmText({energy:100}),'5,730');
 assert.equal(rpmText({energy:0,angularSpeed:2}),'19');assert.equal(rpmText({angularSpeed:0}),'0');
 assert.equal(rpmValue({angularSpeed:NaN}),null);assert.equal(rpmText(null),'—');
});
test('prelaunch is zero, fresh launch counts up on the arena clock, then exactly tracks RPM',()=>{
 const read=createSpinReadout();
 for(const phase of ['ready','countdown','shoot']){read.update(state(phase));assert.equal(read.text(top,frame(8)),'0');}
 read.update(state('running'));assert.equal(read.text(top,frame(0)),'0');
 const early=Number(read.text(top,frame(.1)).replaceAll(',',''));assert.ok(early>0&&early<5730);
 assert.equal(read.text(top,frame(.48)),rpmText(top));
 assert.equal(read.text({...top,angularSpeed:250},frame(1)),rpmText({angularSpeed:250}));
 read.update(state('running'));assert.equal(read.text(top,frame(2)),'5,730');
 read.update({phase:'ready',round:{id:'next'}});assert.equal(read.text(top,frame(8)),'0');
 read.update({phase:'running',round:{id:'next'}});assert.equal(read.text(top,frame(8)),'0','stale previous round is excluded');
});
test('late join, refresh, delayed frames, replay and resumed rounds do not replay count-up',()=>{
 const join=createSpinReadout();join.update(state('running'));assert.equal(join.text(top,frame(.1)),'5,730');
 const delayed=createSpinReadout();delayed.update(state('ready'));delayed.update(state('running'));assert.equal(delayed.text(top,frame(.3)),'5,730');
 const resumed=createSpinReadout();resumed.update(state('ready'));resumed.update({...state('running'),round:{id:'round',launchResumed:true}});assert.equal(resumed.text(top,frame(.1)),'5,730');
 const replay=createSpinReadout();replay.update(state('ready'));replay.update(state('running'));assert.equal(replay.text(top,frame(.1),{replaying:true}),'5,730');
 assert.equal(replay.text(top,frame(.2)),'5,730');
});
test('reduced motion and final states immediately show the authoritative number',()=>{
 const read=createSpinReadout();read.update(state('ready'));read.update(state('running'));
 assert.equal(read.text(top,frame(.1),{reducedMotion:true}),'5,730');
 assert.equal(read.text({...top,alive:false},frame(.2)),'5,730');
 read.update(state('result'));assert.equal(read.text({...top,angularSpeed:0},frame(.2)),'0');
});
