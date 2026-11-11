import test from 'node:test';
import assert from 'node:assert/strict';
import {launchPractice} from '../launch-practice.mjs';
import {measurePracticePull} from '../public/assets/pull-input.js';
const gesture=(duration,angle=0)=>Array.from({length:9},(_,i)=>({x:100+i*20,y:200+i*20*Math.tan(angle*Math.PI/180),t:i*duration/8}));
test('real stroke timing and signed angle drive practice measurements',()=>{
 const slow=measurePracticePull(gesture(900,-20),160),fast=measurePracticePull(gesture(150,20),160);
 assert.ok(slow.accepted&&fast.accepted);assert.ok(fast.power>slow.power+.5);assert.ok(slow.angle<0&&fast.angle>0);
 assert.equal(measurePracticePull(gesture(150).slice(0,5),160).accepted,false);
 assert.equal(measurePracticePull([{x:200,y:0,t:0},{x:0,y:0,t:200}],160).accepted,false);
});
test('input changes actual airborne velocities, spin and later physics, repeatably',()=>{
 const slow=launchPractice(0,0),fast=launchPractice(1,0),up=launchPractice(.5,-20),down=launchPractice(.5,20);
 assert.deepEqual(slow,launchPractice(0,0));assert.equal(slow.initial.speed,3);assert.equal(fast.initial.speed,12);
 assert.ok(fast.frames[0].tops[0].angularSpeed>slow.frames[0].tops[0].angularSpeed);
 assert.notEqual(up.frames[0].tops[0].vz,down.frames[0].tops[0].vz);
 assert.notEqual(up.frames[10].tops[0].z,down.frames[10].tops[0].z);
 assert.notEqual(fast.frames[10].tops[0].x,slow.frames[10].tops[0].x);
 assert.ok(slow.frames[0].tops[0].y>1);assert.ok(slow.frames.some(f=>f.events.some(e=>e.type==='land'))||slow.frames.some(f=>f.tops[0].y<.1));
 for(const run of [slow,fast,up,down])for(const frame of run.frames)for(const top of frame.tops)for(const key of ['x','y','z','vx','vy','vz','angularSpeed'])assert.ok(Number.isFinite(top[key]),key);
});
test('malformed and out of range inputs cannot seed physics',()=>{for(const args of [[NaN,0],[.5,Infinity],[-1,0],[.5,26],['.5',0]])assert.throws(()=>launchPractice(...args),RangeError);});


test('feel test runs beyond 16 seconds until both tops physically stop',()=>{
 for(const [power,angle] of [[0,0],[.5,-25],[1,25]]){
  const run=launchPractice(power,angle),last=run.frames.at(-1);
  assert.ok(last.t>16&&last.t<120);
  assert.ok(run.frames.length<=3001);
  assert.equal(last.done,true);
  assert.ok(last.tops.every(top=>top.angularSpeed===0&&top.energy===0&&top.vx===0&&top.vz===0&&top.vy===0));
  assert.ok(run.frames.some(frame=>frame.winnerId&&!frame.done&&frame.tops.some(top=>top.alive&&top.angularSpeed>1)));
  assert.ok(run.frames.some(frame=>frame.t>16&&frame.tops.some(top=>top.angularSpeed>1)));
  assert.ok(JSON.stringify(run).length<4000000);
 }
});

test('practice standard launch and reference use 7200 RPM; each pull resets the run',()=>{
 const standard=launchPractice(.5,0,'first',true),measured=launchPractice(.5,0,'second');
 assert.ok(Math.abs(standard.initial.rpm-7200)<1e-9);
 assert.ok(standard.frames[0].tops.every(top=>Math.abs(top.angularSpeed*60/(2*Math.PI)-7200)<.001));
 assert.ok(Math.abs(measured.initial.rpm-85*6*60/(2*Math.PI))<1e-9);
 assert.equal(measured.frames[0].t,0);assert.equal(measured.frames[0].tick,0);
 assert.equal(measured.frames[0].roundId,'second');
 assert.notEqual(standard.frames[0].roundId,measured.frames[0].roundId);
 assert.ok(measured.frames[0].tops.every(top=>top.alive));
});
