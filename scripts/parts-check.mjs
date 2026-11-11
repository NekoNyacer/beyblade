import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.qa',{recursive:true});
const app=createApp({port:0,dataDir:mkdtempSync(path.resolve('.qa','parts-check-'))});await app.listen();
const base='http://127.0.0.1:'+app.server.address().port;
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
let browser;
try{
 browser=await chromium.launch({executablePath,headless:true});
 const page=await browser.newPage({viewport:{width:1080,height:930}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/healthz');
 const metrics=await page.evaluate(async()=>{
  document.body.innerHTML='<h1>零件對照 · 相同材質、相同視角</h1><p>上蓋、固鎖、軸心，各三款。實際遊戲幾何，顏色不作為區分依據。</p><main></main>';
  document.head.insertAdjacentHTML('beforeend','<style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#eef1f5;color:#182538;font:14px sans-serif}h1{margin:0 0 8px;font-size:25px}p{margin:0 0 18px}main{position:relative;width:1032px;height:804px;background:white}canvas{display:block}label{position:absolute;text-align:center;width:344px;height:36px;font-size:18px;font-weight:bold}</style>');
  const THREE=await import('/vendor/three.module.js'),{makePart,metalEnvironment}=await import('/assets/parts.js'),{PART_CATALOG,assemblyOffsets}=await import('/assets/part-catalog.js');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1032,804);renderer.setClearColor('#f8fafc');renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;document.querySelector('main').append(renderer.domElement);
  const env=metalEnvironment(renderer),metrics=[];renderer.setScissorTest(true);
  for(const [row,kind] of ['blade','ratchet','bit'].entries())for(let index=0;index<3;index++){
   const scene=new THREE.Scene();scene.environment=env.texture;scene.add(new THREE.HemisphereLight(0xffffff,0x637589,2));const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(-2,4,3);scene.add(light);
   const part=makePart(kind,index,'#d84c43');part.rotation.y=.4;part.scale.setScalar(kind==='blade'?1:kind==='ratchet'?1.35:1.5);scene.add(part);
   const box=new THREE.Box3().setFromObject(part),center=box.getCenter(new THREE.Vector3());
   const camera=new THREE.PerspectiveCamera(32,344/268,.1,20);camera.position.set(0,kind==='bit'?.45:1.35,2.5);camera.lookAt(center);const y=(2-row)*268;
   renderer.setViewport(index*344,y,344,268);renderer.setScissor(index*344,y,344,268);renderer.render(scene,camera);
   const label=document.createElement('label');label.textContent=PART_CATALOG[kind][index].name;label.style.cssText='left:'+index*344+'px;top:'+(row*268+238)+'px';document.querySelector('main').append(label);
   const vertices=[];let meshes=0;part.traverse(o=>{if(o.isMesh){meshes++;vertices.push(o.geometry.attributes.position.count)}});
   metrics.push({kind,index,partId:part.userData.partId,meshes,vertices:vertices.join(','),bounds:box.getSize(new THREE.Vector3()).toArray()});
  }
  const assemblies=[];for(let blade=0;blade<3;blade++)for(let ratchet=0;ratchet<3;ratchet++)for(let bit=0;bit<3;bit++){
   const group=new THREE.Group(),parts={blade,ratchet,bit};for(const [kind,y] of Object.entries(assemblyOffsets(parts))){const piece=makePart(kind,parts[kind]);piece.position.y=y;group.add(piece);}assemblies.push(new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray());
  }
  return {parts:metrics,assemblies};
 });
 for(const kind of ['blade','ratchet','bit'])assert.equal(new Set(metrics.parts.filter(p=>p.kind===kind).map(p=>JSON.stringify([p.meshes,p.vertices,p.bounds]))).size,3);
 assert.equal(metrics.assemblies.length,27);assert.ok(metrics.assemblies.every(size=>size.every(n=>Number.isFinite(n)&&n>0)));
 assert.deepEqual(errors,[]);await page.screenshot({path:'.qa/parts-review.png',fullPage:true});
 writeFileSync('.qa/parts-review.json',JSON.stringify({passed:true,...metrics,errors},null,2));console.log('PASS: nine distinct geometries and 27 finite assemblies; .qa/parts-review.png');
}finally{await browser?.close();await app.close();}
