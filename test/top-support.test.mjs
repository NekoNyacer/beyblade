import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GROOVE_RADIUS_RATIO,GROOVE_HALF_WIDTH_RATIO,GROOVE_DEPTH,BOWL_SKIN_OFFSET,surfaceGradient} from '../public/assets/rail-config.js';
import {buildTopSupport,bowlSkinY,bowlSupportY,flatContactY,restingSupportY} from '../public/assets/top-support.js';
test('stopped asymmetric blades rest on their real vertices instead of the spinning envelope',()=>{
 const rotor=new THREE.Group();
 for(let i=0;i<3;i++){const blade=new THREE.Mesh(new THREE.BoxGeometry(.35,.10,.12));const angle=i*Math.PI*2/3;blade.position.set(Math.cos(angle)*.30,.45,Math.sin(angle)*.30);blade.rotation.y=-angle;rotor.add(blade);}
 const tip=new THREE.Mesh(new THREE.ConeGeometry(.10,.20,16));tip.rotation.z=Math.PI;rotor.add(tip);
 const support=buildTopSupport(rotor),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),1.2),heights=[];
 for(const spin of [0,.4,1.8]){
  const height=restingSupportY(support,q,spin,0,0,3.35,0),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),spin);
  let minimum=Infinity;
  for(const [x,y,z] of support.vertices){const p=new THREE.Vector3(x,y-support.tipY,z).applyQuaternion(rotation).applyQuaternion(q);minimum=Math.min(minimum,p.y+height);}
  assert.ok(Math.abs(minimum-.004)<1e-9);assert.ok(height<=flatContactY(support,q)+.004+1e-9);heights.push(height);
 }
 assert.equal(new Set(heights.map(h=>h.toFixed(5))).size,3);
});
test('a narrow tip reaches the groove floor while a broad flat tip spans its lips',()=>{
 const arenaRadius=3.35,center=arenaRadius*GROOVE_RADIUS_RATIO,half=arenaRadius*GROOVE_HALF_WIDTH_RATIO;
 const upright=new THREE.Quaternion();
 const heightFor=tipRadius=>{
  const rotor=new THREE.Group();
  rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(tipRadius,tipRadius,.12,48)));
  return bowlSupportY(buildTopSupport(rotor),upright,center,0,arenaRadius);
 };
 assert.ok(Math.abs(heightFor(.006)-(BOWL_SKIN_OFFSET-GROOVE_DEPTH))<.006);
 assert.ok(Math.abs(heightFor(half+.025)-BOWL_SKIN_OFFSET)<.006);
});

test('separate bit and blade meshes do not create phantom contact across the dash shoulder',()=>{
 const rotor=new THREE.Group(),tip=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.1,96)),blade=new THREE.Mesh(new THREE.CylinderGeometry(.53,.53,.08,96));
 tip.position.y=.05;blade.position.y=.66;rotor.add(tip,blade);
 const support=buildTopSupport(rotor),arenaRadius=3.35,radius=arenaRadius-.45;
 for(const offset of [-.14,.14]){
  const angle=1.5*Math.PI+offset,x=radius*Math.cos(angle),z=radius*Math.sin(angle);
  const gradient=surfaceGradient(x,z,arenaRadius),axis=new THREE.Vector3(-gradient.z,0,gradient.x).normalize();
  const q=new THREE.Quaternion().setFromAxisAngle(axis,.21),height=bowlSupportY(support,q,x,z,arenaRadius);
  let gap=Infinity;
  for(const [vx,vy,vz] of support.vertices){
   const point=new THREE.Vector3(vx,vy-support.tipY,vz).applyQuaternion(q);
   gap=Math.min(gap,height+point.y-bowlSkinY(x+point.x,z+point.z,arenaRadius));
  }
  assert.ok(gap>=-.002&&gap<.015,`actual mesh contact gap ${gap}`);
 }
});
