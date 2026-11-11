import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';

// Rebuild local UI artwork from the same meshes and assembly offsets used by combat.
mkdirSync('.qa',{recursive:true});mkdirSync('public/assets/art',{recursive:true});
const app=createApp({port:0,dataDir:mkdtempSync(path.resolve('.qa','ui-art-'))});await app.listen();
const base='http://127.0.0.1:'+app.server.address().port;
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if(!executablePath)throw new Error('Set CHROME_PATH to an installed Chromium browser.');
const browser=await chromium.launch({executablePath,headless:true});
const document=`<!doctype html><html><body style="margin:0;background:transparent"><script type="module">
import * as THREE from '/vendor/three.module.js';
import {makePart,metalEnvironment,dispose} from '/assets/parts.js';
import {assemblyOffsets} from '/assets/part-catalog.js';
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1024,1024);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.environment=metalEnvironment(renderer).texture;scene.environmentIntensity=1.4;
scene.add(new THREE.HemisphereLight(0xe8f2ff,0x132037,.8));
for(const [color,intensity,position] of [[0xffffff,4,[-3,5,4]],[0xbcdfff,2,[4,2,-3]],[0xffd7bf,.7,[-3,-1,-2]]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(...position);scene.add(light);}
const camera=new THREE.PerspectiveCamera(30,1,.01,40);let object;
window.renderArt=(kind,index,parts,color)=>{
 if(object){scene.remove(object);dispose(object);}
 object=new THREE.Group();
 if(parts){for(const [piece,y] of Object.entries(assemblyOffsets(parts))){const mesh=makePart(piece,parts[piece],color);mesh.position.y=y;object.add(mesh);}}
 else object.add(makePart(kind,index,color));
 object.rotation.y=.48;scene.add(object);
 const box=new THREE.Box3().setFromObject(object),sphere=box.getBoundingSphere(new THREE.Sphere());
 const distance=sphere.radius/Math.sin(THREE.MathUtils.degToRad(15))*.94;
 const direction=new THREE.Vector3(.5,kind==='bit'?.40:.92,kind==='bit'?2.5:1.65).normalize();
 camera.position.copy(sphere.center).addScaledVector(direction,distance);camera.lookAt(sphere.center);camera.updateProjectionMatrix();
 renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');
};
</script></body></html>`;
try{
 const page=await browser.newPage({viewport:{width:1024,height:1024}});
 await page.route(base+'/ui-art',route=>route.fulfill({contentType:'text/html',body:document}));
 await page.goto(base+'/ui-art');await page.waitForFunction(()=>!!window.renderArt);
 let count=0;
 const save=async(file,kind,index,parts,color)=>{const url=await page.evaluate(args=>window.renderArt(...args),[kind,index,parts,color]);writeFileSync('public/assets/art/'+file,Buffer.from(url.split(',')[1],'base64'));count++;};
 for(const [prefix,color] of [['','#d91530'],['blue-','#087fe6']]){
 for(const kind of ['blade','ratchet','bit'])for(let index=0;index<3;index++)await save('part-'+prefix+kind+'-'+index+'.png',kind,index,null,color);
 for(let blade=0;blade<3;blade++)for(let ratchet=0;ratchet<3;ratchet++)for(let bit=0;bit<3;bit++)await save('top-'+prefix+blade+ratchet+bit+'.png',null,null,{blade,ratchet,bit},color);
 }
 writeFileSync('public/assets/art/component-origin.txt','All 72 transparent 1024px PNGs rendered locally from public/assets/parts.js makePart() and part-catalog.js assemblyOffsets(). Nine actual parts and all 27 assembled combinations, each rendered in red and blue without tinting the metal. Red/blue opponent colors are UI identification treatments. Rebuild with node scripts/render-ui-art.mjs after geometry changes.');
 console.log('Saved '+count+' verified-source UI render assets.');
}finally{await browser.close();await app.close();}
