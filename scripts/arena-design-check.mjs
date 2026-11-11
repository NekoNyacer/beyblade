import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve('.qa/arena-redesign');mkdirSync(out,{recursive:true});
const app=createApp({port:0,host:'127.0.0.1',dataDir:mkdtempSync(path.join(out,'data-'))});await app.listen();
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),headless:true});
const errors=[],results={};
try {
 const context=await browser.newContext({viewport:{width:1600,height:1000}});
 await context.route('**/assets/arena.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('constructor(container) {','constructor(container) { window.__arena=this;')});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/healthz');
 await page.evaluate(async()=>{
  document.body.innerHTML='<div id="arena" style="width:100vw;height:100vh"></div>';document.body.style='margin:0;background:#080f1c';
  window.__now=0;Object.defineProperty(performance,'now',{value:()=>window.__now});window.requestAnimationFrame=()=>0;
  const {Arena}=await import('/assets/arena.js');window.a=new Arena(document.querySelector('#arena'));window.data=await fetch('/assets/scenario-data.json').then(r=>r.json());
  window.seek=(key,target)=>{a.idle();a.setPaused(false);const clip=data[key];a.roster(data.players.slice(0,clip.frames[0].tops.length));let i=0;for(let ms=0;ms<=target*1000+100;ms+=1000/60){window.__now=ms;while(i<clip.frames.length&&clip.frames[i].t<=ms/1000+.0001)a.update(clip.frames[i++]);a.loop();}a.setPaused(true);a.loop();};
  seek('rail',1.3);
 });
 await page.waitForTimeout(500);await page.evaluate(()=>a.loop());
 await page.screenshot({path:path.join(out,'desktop.png')});
 results.geometry=await page.evaluate(()=>({bowl:!!a.scene.getObjectByName('battle-bowl'),teeth:a.scene.getObjectByName('acceleration-gear-teeth').count,pockets:a.stage.children.filter(o=>o.name==='impact-pocket').length,drawCalls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles,radius:a.arenaRadius,housing:!!a.scene.getObjectByName('armored-arena-base'),floor:!!a.scene.getObjectByName('graphite-stage-floor'),seams:!!a.scene.getObjectByName('stage-panel-seams')}));
 assert.ok(results.geometry.bowl&&results.geometry.teeth>80&&results.geometry.pockets===6);assert.ok(results.geometry.housing&&results.geometry.floor&&results.geometry.seams);
 await page.evaluate(()=>{const memory=a.renderer.info.memory;window.__baselineTextures=memory.textures;for(let i=0;i<6;i++){a.setArena({arenaRadius:i%2?3.35:4.39,tops:Array(i%2?2:10)});a.loop();}a.setArena(data.rail.frames[0]);a.loop();});
 results.textureCount=await page.evaluate(()=>({before:window.__baselineTextures,after:a.renderer.info.memory.textures}));assert.ok(results.textureCount.after<=results.textureCount.before+2,'arena rebuilds release floor textures');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{a.fit();a.loop();});await page.screenshot({path:path.join(out,'mobile.png')});
 const display=await context.newPage();display.on('pageerror',e=>errors.push(e.message));
 await display.setViewportSize({width:1920,height:1080});await display.goto(base+'/display?preview=rail');
 await display.waitForFunction(()=>window.__arena?.renderer);await display.waitForFunction(()=>window.__arena?.playbackFrame?.t>.8);await display.evaluate(()=>window.__arena.setPaused(true));
 await display.screenshot({path:path.join(out,'broadcast.png')});
 results.overflow=await display.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 assert.equal(results.overflow,false);assert.deepEqual(errors,[]);results.errors=errors;results.passed=true;
} finally {await browser.close();await app.close();writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));
