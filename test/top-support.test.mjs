import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildTopSupport,flatContactY,restingSupportY} from '../public/assets/top-support.js';
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
