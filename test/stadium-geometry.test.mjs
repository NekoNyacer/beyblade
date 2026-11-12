import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {railConfigForCount,surfaceHeight,shoulderHeightAtOffset,BOWL_SKIN_OFFSET} from '../public/assets/rail-config.js';

// Run the actual production geometry builder in Node. Only resolve the browser
// import map and stub the logo texture download; do not substitute the meshes.
const source=(await readFile(new URL('../public/assets/stadium.js',import.meta.url),'utf8'))
 .replace("'/vendor/three.module.js'",JSON.stringify(import.meta.resolve('three')))
 .replace("'./rail-config.js'",JSON.stringify(new URL('../public/assets/rail-config.js',import.meta.url).href));
const {buildStadium}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('production meshes match the resized physical bank, all catch floors and shoulder support',()=>{
 const load=THREE.TextureLoader.prototype.load;
 THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
 try {
  for(const count of [2,6,10,16]){
   const c=railConfigForCount(count),r=c.arenaRadius,stage=new THREE.Group(),rails=new THREE.Group();
   stage.add(rails);buildStadium(stage,rails,c);stage.updateMatrixWorld(true);
   const bowl=stage.getObjectByName('battle-bowl'),ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
   const sample=(object,radius,angle)=>{
    ray.set(new THREE.Vector3(radius*Math.cos(angle),4,radius*Math.sin(angle)),down);
    return ray.intersectObject(object,true)[0]?.point.y;
   };
   assert.equal(bowl.userData.rimHeight,c.rimHeight);
   for(const radius of [c.flatRadius,c.railRadius-c.captureWidth,c.railRadius,r-.01]){
    for(const angle of [.2,1.2,3.2,...[-.20,0,.20].map(offset=>c.exitAngles[0]+offset)]){
     const y=sample(bowl,radius,angle),expected=surfaceHeight(radius*Math.cos(angle),radius*Math.sin(angle),r)+BOWL_SKIN_OFFSET;
     assert.ok(Number.isFinite(y)&&Math.abs(y-expected)<.012,`${count}-player bank: ${y} vs ${expected}`);
    }
   }
   const pockets=[];stage.traverse(mesh=>{if(mesh.name==='impact-pocket')pockets[mesh.userData.index]=mesh;});
   assert.equal(pockets.length,6);
   pockets.forEach((mesh,i)=>assert.ok(Math.abs(sample(mesh,r+.40,c.ringOutAngles[i])-c.pocketFloor)<.0001));
   // An uncut apron sector must agree with the height used by top support.
   const shoulderMeshes=stage.children.filter(mesh=>mesh.isMesh&&mesh.geometry.type==='LatheGeometry'&&!mesh.name);
   ray.set(new THREE.Vector3(r+.48,4,0),down);
   const heights=ray.intersectObjects(shoulderMeshes).map(hit=>hit.point.y);
   assert.ok(heights.some(y=>Math.abs(y-shoulderHeightAtOffset(.48,r))<.001));
   stage.traverse(mesh=>{mesh.geometry?.dispose();if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose());else mesh.material?.dispose();});
  }
 } finally { THREE.TextureLoader.prototype.load=load; }
});
