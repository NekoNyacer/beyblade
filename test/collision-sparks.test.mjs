import test from 'node:test';
import assert from 'node:assert/strict';
import {SPARK_CAPACITY,NEUTRAL_SPARK_COLOR,sparkColorsForEvent,SPARK_CLEARANCE,createSparkBurst,resetSparkBurst,advanceSparkBurst,sparkFloorHeight} from '../public/assets/collision-sparks.js';
import {surfaceHeight,BOWL_SKIN_OFFSET,RING_OUT_ANGLES,RING_OUT_HALF_WIDTHS,shoulderHeightAtOffset} from '../public/assets/rail-config.js';
const event={type:'hit',x:0,y:0,z:0,nx:1,nz:0,power:8,eventId:'spark-test',aId:'red',bId:'blue'};
const burst=(strength=.8,e=event,origin={x:0,y:.48,z:0})=>resetSparkBurst(createSparkBurst(),e,origin,strength);

test('sparks are colored, strength-scaled, directional and deterministic without changing their event',()=>{
 const source=structuredClone(event),weak=burst(.12),strong=burst(1),repeat=burst(1);
 assert.deepEqual(strong,repeat);assert.deepEqual(event,source);
 assert.ok(strong.count>weak.count&&strong.count<=SPARK_CAPACITY);
 assert.equal(new Set(strong.particles.slice(0,strong.count).map(p=>p.color)).size,2);
 const spread=b=>b.particles.slice(0,b.count).reduce((n,p)=>n+Math.hypot(p.vx,p.vz),0)/b.count;
 assert.ok(spread(strong)>spread(weak)*1.8);
 assert.ok(strong.particles.filter(p=>Math.abs(p.vx)>Math.abs(p.vz)).length>=18);
 const turned=burst(1,{...event,nx:0,nz:1});
 for(let i=0;i<strong.count;i++){assert.ok(Math.abs(turned.particles[i].vx+strong.particles[i].vz)<1e-10);assert.ok(Math.abs(turned.particles[i].vz-strong.particles[i].vx)<1e-10);}
});

test('sparks arc, bounce slightly upward, lose energy, then disappear',()=>{
 const b=burst(.8);let rebound=0,maxBounceRise=0;
 for(let t=1/120;t<1.3;t+=1/120){
  const previous=b.particles.map(p=>({...p}));advanceSparkBurst(b,t,3.35);
  b.particles.forEach((p,i)=>{
   if(!p.active)return;const floor=sparkFloorHeight(p.x,p.z,3.35);
   assert.ok(p.y>=floor+SPARK_CLEARANCE-1e-9);
   if(p.bounces>previous[i].bounces){
    rebound++;assert.ok(Math.hypot(p.vx,p.vy,p.vz)<Math.hypot(previous[i].vx,previous[i].vy,previous[i].vz)+.16);
    if(Math.hypot(p.x,p.z)<1.5){assert.ok(p.vy>=0);maxBounceRise=Math.max(maxBounceRise,p.vy*p.vy/36);}
   }
  });
 }
 assert.ok(rebound>8);assert.ok(maxBounceRise>0&&maxBounceRise<.2);assert.ok(b.particles.every(p=>!p.active));
});

test('curved bowl, groove, shoulder and catch surfaces never leave active particles underneath',()=>{
 for(const [x,z] of [[1.81,0],[2.7,0],[0,-2.9],[3.5,0],[0,3.75],[3.8*Math.cos(Math.PI/4+.15),3.8*Math.sin(Math.PI/4+.15)]]){
  const e={...event,x,z},b=burst(1,e,{x,y:sparkFloorHeight(x,z,3.35)+.06,z});
  for(let t=0;t<1.2;t+=1/30){advanceSparkBurst(b,t,3.35);for(const p of b.particles){if(p.active)assert.ok(p.y>=sparkFloorHeight(p.x,p.z,3.35)+SPARK_CLEARANCE-1e-9);}}
 }
 assert.equal(sparkFloorHeight(1.8,0,3.35),surfaceHeight(1.8,0,3.35)+BOWL_SKIN_OFFSET);
 assert.equal(sparkFloorHeight(3.65,0,3.35),shoulderHeightAtOffset(.3));
 for(const angle of RING_OUT_ANGLES)assert.ok(Math.abs(sparkFloorHeight(3.75*Math.cos(angle),3.75*Math.sin(angle),3.35)-.85)<1e-9);
 const angle=RING_OUT_ANGLES[0]+RING_OUT_HALF_WIDTHS[0]*.9;
 assert.ok(sparkFloorHeight(3.75*Math.cos(angle),3.75*Math.sin(angle),3.35)>.85);
 assert.equal(sparkFloorHeight(10,0,3.35),null);
});

test('pause, slow replay, large time steps and reuse keep a bounded stable pool',()=>{
 const b=burst(1),references=[...b.particles];advanceSparkBurst(b,.25,3.35);const frozen=structuredClone(b);
 advanceSparkBurst(b,.25,3.35);assert.deepEqual(b,frozen);
 const steps=burst(1);for(let t=1/120;t<=.25+1e-8;t+=1/120)advanceSparkBurst(steps,t,3.35);
 for(let i=0;i<b.count;i++)for(const key of ['x','y','z'])assert.ok(Math.abs(b.particles[i][key]-steps.particles[i][key])<1e-9);
 advanceSparkBurst(b,1000,3.35);assert.ok(b.particles.every(p=>!p.active));
 for(let i=0;i<1000;i++)resetSparkBurst(b,{...event,eventId:i},{x:0,y:.48,z:0},i%2?.12:1);
 assert.equal(b.particles.length,SPARK_CAPACITY);assert.ok(b.particles.every((p,i)=>p===references[i]));assert.ok(b.particles.every(p=>Number.isFinite(p.vx)&&p.bounces===0));
});


test('spark hues follow collision owner IDs, never roster order or a rainbow palette',()=>{
 const players=[{id:'blue',color:'#167cff'},{id:'green',color:'#22ca67'},{id:'red',color:'#ef243d'},{id:'purple',color:'#9346f2'}];
 assert.deepEqual(sparkColorsForEvent(event,players),['#ef243d','#167cff']);
 const b=burst(1);
 for(let i=0;i<b.count;i++){assert.equal(b.particles[i].ownerId,i%2?'blue':'red');assert.equal(b.particles[i].color,i%2);}
 for(const a of players)for(const b of players){
  assert.deepEqual(sparkColorsForEvent({type:'hit',aId:a.id,bId:b.id},players),[a.color,b.color]);
 }
 for(const type of ['land','rail-bounce','pocket-impact','shield'])assert.deepEqual(sparkColorsForEvent({type,id:'green'},players),['#22ca67','#22ca67']);
 assert.deepEqual(sparkColorsForEvent({type:'hit'},players),[NEUTRAL_SPARK_COLOR,NEUTRAL_SPARK_COLOR]);
 assert.deepEqual(sparkColorsForEvent({type:'hit',aId:'red',bId:'missing'},players),['#ef243d',NEUTRAL_SPARK_COLOR]);
 assert.deepEqual(sparkColorsForEvent({type:'land',id:'missing'},players),[NEUTRAL_SPARK_COLOR,NEUTRAL_SPARK_COLOR]);
 const same=resetSparkBurst(b,{...event,aId:'green',bId:'purple'},{x:0,y:.48,z:0},1);
 assert.equal(same,b);assert.ok(b.particles.every((p,i)=>p.ownerId===(i%2?'purple':'green')));
});
