import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve('.qa/collision-sparks');mkdirSync(out,{recursive:true});
const app=createApp({port:0,host:'127.0.0.1',dataDir:mkdtempSync(path.join(out,'data-'))});await app.listen();
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),headless:true});
const errors=[],results={};
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error'&&!message.location().url.endsWith('/favicon.ico'))errors.push(message.text()+' '+message.location().url);});
 await page.goto(base+'/healthz');
 await page.evaluate(async()=>{
  document.body.innerHTML='<div id="arena" style="width:100vw;height:100vh"></div>';document.body.style='margin:0;background:#080f1c';
  window.requestAnimationFrame=()=>0;
  const {Arena}=await import('/assets/arena.js');window.a=new Arena(document.querySelector('#arena'));window.data=await fetch('/assets/scenario-data.json').then(r=>r.json());
  a.roster(data.players.slice(0,2));a.frame=structuredClone(data.rail.frames[0]);a.frame.tops=a.frame.tops.slice(0,2);a.setPaused(true);
  a.frame.tops.forEach((top,i)=>Object.assign(top,{x:i?-.54:.54,z:0,y:0,energy:100,angularSpeed:600,spin:0,alive:true,pocketActive:false,railActive:false}));
  window.show=(power,age,view='side')=>{a.clearEffects();a.clock=0;a.impact({type:'hit',x:0,y:0,z:0,nx:-1,nz:0,power,aId:a.players[0].id,bId:a.players[1].id,eventId:'qa-'+power},false);a.clock=age;a.camera.position.set(...(view==='top'?[0,8,.001]:[0,3.8,6]));a.camera.lookAt(0,.2,0);a.loop();};
  show(10,.22);
 });
 await page.screenshot({path:path.join(out,'strong-side.png')});
 results.initial=await page.evaluate(()=>({visible:a.effects.filter(e=>e.group.visible).length,instanced:a.effects[0].shards.isInstancedMesh,colors:a.effects[0].colors.map(c=>c.getHexString()),shader:a.effects[0].shards.material.isShaderMaterial,owners:[...new Set(a.effects[0].burst.particles.map(p=>p.ownerId))],expected:a.players.map(p=>p.color.slice(1).toLowerCase()),count:a.effects[0].shards.count,drawCalls:a.renderer.info.render.calls}));
 assert.ok(results.initial.instanced);assert.deepEqual(results.initial.colors,results.initial.expected);assert.equal(results.initial.owners.length,2);assert.equal(results.initial.shader,true);assert.equal(results.initial.count,24);
 await page.evaluate(()=>show(2,.28));await page.screenshot({path:path.join(out,'weak-side.png')});
 await page.evaluate(()=>show(10,.22,'top'));await page.screenshot({path:path.join(out,'strong-overhead.png')});
 await page.evaluate(()=>show(7,.53));await page.screenshot({path:path.join(out,'floor-bounce.png')});
 results.bounce=await page.evaluate(()=>({bounced:a.effects[0].burst.particles.filter(p=>p.bounces>0).length,visible:a.effects[0].burst.particles.filter(p=>p.active).length}));assert.ok(results.bounce.bounced>0);
 const frozen=await page.evaluate(()=>JSON.stringify(a.effects[0].burst));await page.evaluate(()=>{for(let i=0;i<5;i++)a.loop();});assert.equal(await page.evaluate(()=>JSON.stringify(a.effects[0].burst)),frozen);results.pause=true;
 results.performance=await page.evaluate(()=>{
  a.clearEffects();a.loop();const baseCalls=a.renderer.info.render.calls;
  for(let i=0;i<16;i++)a.impact({type:'hit',x:(i%4-1.5)*.4,z:(Math.floor(i/4)-1.5)*.4,y:0,nx:1,nz:0,power:10,aId:a.players[0].id,bId:a.players[1].id,eventId:i},false);
  a.clock+=.1;a.loop();const warm={...a.renderer.info.memory};for(const e of a.effects)e.group.visible=false;a.renderer.render(a.scene,a.camera);const hiddenCalls=a.renderer.info.render.calls;for(const e of a.effects)e.group.visible=true;a.renderer.render(a.scene,a.camera);const peakCalls=a.renderer.info.render.calls;
  const timings=[];
  for(let i=0;i<120;i++){const start=performance.now();a.clock+=1/120;a.drawEffects();timings.push(performance.now()-start);}
  for(let i=0;i<100;i++)a.impact({type:'hit',x:0,z:0,y:0,nx:1,nz:0,power:10,eventId:i},false);
  a.loop();const after={...a.renderer.info.memory},pool=a.effects.length,particles=a.effects.reduce((n,e)=>n+e.burst.particles.length,0);
  a.clock+=2;a.loop();const visible=a.effects.filter(e=>e.group.visible).length;
  timings.sort((a,b)=>a-b);return {baseCalls:hiddenCalls,peakCalls,addedCalls:peakCalls-hiddenCalls,warm,after,pool,particles,visible,cpuP95Ms:timings[Math.floor(timings.length*.95)],cpuMaxMs:timings.at(-1)};
 });
 assert.equal(results.performance.pool,16);assert.equal(results.performance.particles,384);assert.equal(results.performance.visible,0);assert.ok(results.performance.addedCalls<=80);assert.deepEqual(results.performance.after,results.performance.warm);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>a.reduced,null,{polling:50});await page.evaluate(()=>show(10,.1));
 results.reduced=await page.evaluate(()=>({particlesVisible:a.effects.some(e=>e.group.visible&&e.shards.visible),flash:a.effects.some(e=>e.group.visible&&e.flash.material.opacity>0),shake:a.shake}));assert.equal(results.reduced.particlesVisible,false);assert.equal(results.reduced.shake,null);assert.equal(results.reduced.flash,true);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!a.reduced,null,{polling:50});await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{a.fit();show(10,.22);});await page.screenshot({path:path.join(out,'mobile.png')});

 await page.setViewportSize({width:1200,height:700});await page.waitForTimeout(100);
 results.ownerColors=await page.evaluate(()=>{
  const saved=a.players;a.players=[{id:'green',color:'#27cc64'},{id:'purple',color:'#9d56ff'},{id:'orange',color:'#ff7829'},{id:'blue',color:'#167cff'}];
  const checks=[];for(const [aId,bId] of [['green','purple'],['orange','blue'],['blue','green']]){a.clearEffects();a.clock=0;a.impact({type:'hit',x:0,y:0,z:0,nx:1,nz:0,power:10,aId,bId},false);a.clock=.1;a.drawEffects();checks.push({ids:[aId,bId],colors:a.effects[0].colors.map(c=>'#'+c.getHexString())});}
  a.clearEffects();a.clock=0;a.impact({type:'land',id:'green',x:0,y:0,z:0,power:10},false);checks.push({ids:['green'],colors:a.effects[0].colors.map(c=>'#'+c.getHexString())});
  a.clearEffects();a.impact({type:'hit',x:0,y:0,z:0,power:10},false);checks.push({ids:[],colors:a.effects[0].colors.map(c=>'#'+c.getHexString())});a.players=saved;return checks;
 });
 assert.deepEqual(results.ownerColors.map(c=>c.colors),[['#27cc64','#9d56ff'],['#ff7829','#167cff'],['#167cff','#27cc64'],['#27cc64','#27cc64'],['#dfe8ee','#dfe8ee']]);
 await page.evaluate(()=>{show(10,.22);a.stage.visible=false;a.rails.visible=false;for(const top of a.tops.values()){top.group.visible=false;top.trail.visible=false;top.contact.visible=false;}a.camera.position.set(0,1.4,3.3);a.camera.lookAt(0,.3,0);a.renderer.setClearColor(0x080c14);a.renderer.render(a.scene,a.camera);});
 await page.screenshot({path:path.join(out,'glow-dark.png')});
 await page.evaluate(()=>{a.renderer.setClearColor(0xe5e8ef);a.renderer.render(a.scene,a.camera);});await page.screenshot({path:path.join(out,'glow-light.png')});
 results.errors=errors;assert.deepEqual(errors,[]);results.passed=true;
} finally {await browser.close();await app.close();writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));
