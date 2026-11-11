import {chromium} from 'playwright-core';
import {WebSocket} from 'ws';
import {createApp} from '../server.mjs';
import {newRoom,joinRoom} from '../game.mjs';
import {mkdirSync,mkdtempSync,existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve('.qa/rpm-display');mkdirSync(out,{recursive:true});
const app=createApp({host:'127.0.0.1',port:0,dataDir:mkdtempSync(path.join(out,'data-'))});await app.listen();
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),headless:true});
const errors=[],report={checks:[],sizes:[]};
const wait=async fn=>{const end=Date.now()+12000;while(!fn()){assert.ok(Date.now()<end,'server condition timed out');await new Promise(r=>setTimeout(r,10));}};
const num=s=>Number(s.replaceAll(',',''));
async function context(viewport={width:1920,height:1080},reduce=false){
 const c=await browser.newContext({viewport,reducedMotion:reduce?'reduce':'no-preference'});
 await c.addInitScript(()=>{const Native=WebSocket;window.__sockets=[];window.WebSocket=class extends Native{constructor(...args){super(...args);window.__sockets.push(this);}};});
 await c.route('**/assets/display.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+`
window.__rpmQA=()=>{updateFrame();return {state,frame:arena.playbackFrame||frame,values:[...document.querySelectorAll('.rpm-value')].map(el=>el.textContent)}};
window.__arena=arena;
`});});
 await c.route('**/assets/host.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+`
window.__rpmQA=()=>{updateFeaturedSpeeds();return {state,frame:arena.playbackFrame||lastFrame,values:[...document.querySelectorAll('[data-speed-id]')].map(el=>el.textContent)}};
`});});
 c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c;
}
async function layout(p,label){
 await p.evaluate(()=>document.fonts.ready);
 const metrics=await p.locator('.rpm-value').evaluateAll(nodes=>nodes.map(el=>{
  const b=el.getBoundingClientRect(),parent=el.closest('.display-player').getBoundingClientRect(),small=el.nextElementSibling.getBoundingClientRect();
  return {font:parseFloat(getComputedStyle(el).fontSize),fits:b.left>=parent.left-1&&small.right<=parent.right+1&&b.top>=parent.top-1&&b.bottom<=parent.bottom+1};
 }));
 assert.ok(metrics.every(m=>m.fits),label+' RPM fits its plate');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+' no horizontal overflow');
 report.sizes.push({label,...p.viewportSize(),metrics});
}
try{
 const room=newRoom('brawl');app.rooms.set(room.roomId,room);const a=joinRoom(room,'紅焰'),b=joinRoom(room,'藍霆');
 for(const p of room.players)p.parts={blade:0,ratchet:0,bit:0};
 const c=await context(),host=await c.newPage();
 await c.addInitScript(event=>{if(location.protocol.startsWith('http'))localStorage.setItem('beyblade-host',JSON.stringify(event));},{roomId:room.roomId,hostToken:room.hostToken,accessToken:room.accessToken});
 await host.goto(base);await host.locator('[data-action=prepare]').waitFor();
 const display=await c.newPage();await display.goto(base+'/display?room='+room.roomId+'&invite='+room.accessToken);
 await display.waitForFunction(()=>window.__rpmQA?.().values.length===2);
 await host.locator('[data-action=prepare]').click();await display.waitForFunction(()=>window.__rpmQA?.().state.phase==='ready');
 assert.deepEqual((await display.evaluate(()=>window.__rpmQA())).values,['0','0']);
 assert.deepEqual((await host.evaluate(()=>window.__rpmQA())).values,['0','0']);
 await display.screenshot({path:path.join(out,'duel-zero.png')});await layout(display,'duel 1920');
 const ws=new WebSocket(base.replace('http','ws')+'/ws?room='+room.roomId+'&role=player&token='+a.token);await new Promise(r=>ws.once('open',r));
 await host.locator('[data-action=start]').click();await display.waitForFunction(()=>window.__rpmQA?.().state.phase==='countdown');
 assert.deepEqual((await display.evaluate(()=>window.__rpmQA())).values,['0','0']);
 await wait(()=>room.phase==='shoot');ws.send(JSON.stringify({type:'pull',roundId:room.round.id,power:.9,angle:3}));
 await wait(()=>room.round.pulledIds.includes(a.id));
 assert.equal(room.phase,'shoot','one player waits for missing pull');
 assert.deepEqual((await display.evaluate(()=>window.__rpmQA())).values,['0','0']);
 const samples=[];
 for(let i=0;i<85;i++){const x=await display.evaluate(()=>window.__rpmQA());if(x.state.phase==='running'&&x.frame)samples.push(x);await new Promise(r=>setTimeout(r,20));}
 assert.ok(room.round.autoReleasedIds.includes(b.id),'missing player uses existing neutral fallback');
 assert.ok(samples.some(x=>x.frame.t>0&&x.frame.t<.45&&num(x.values[0])>0&&num(x.values[0])<Math.round(x.frame.tops[0].angularSpeed*60/(2*Math.PI))*.99),'fresh launch visibly counts up');
 const checkExact=x=>{assert.ok(x.frame.t>=.48);x.values.forEach((s,i)=>assert.equal(num(s),Math.round(x.frame.tops[i].angularSpeed*60/(2*Math.PI))));};
 checkExact(samples.at(-1));checkExact(await host.evaluate(()=>window.__rpmQA()));
 await display.screenshot({path:path.join(out,'duel-live.png')});await host.screenshot({path:path.join(out,'host-live.png'),fullPage:true});
 await host.setViewportSize({width:390,height:844});await host.screenshot({path:path.join(out,'host-mobile.png'),fullPage:true});assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await display.reload();await display.waitForFunction(()=>window.__rpmQA?.().frame?.t>1);checkExact(await display.evaluate(()=>window.__rpmQA()));
 await c.setOffline(true);await display.evaluate(()=>window.__sockets.forEach(ws=>ws.close()));await c.setOffline(false);await display.waitForFunction(()=>document.querySelector('#connection').classList.contains('online'));checkExact(await display.evaluate(()=>window.__rpmQA()));
 report.checks.push('network reconnect preserves actual RPM','ready/countdown/partial pull show zero','0.48s count-up after authoritative launch','unpulled fallback labeled and counted','live display and host exactly follow playback frame','refresh does not replay');
 ws.close();await c.close();
 for(const [scenario,viewport,label] of [
  ['rail',{width:1920,height:1080},'duel-1920'],['battle',{width:1920,height:1080},'brawl-10'],
  ['dense',{width:1920,height:1080},'brawl-16'],['battle',{width:1280,height:720},'brawl-1280'],
  ['rail',{width:960,height:540},'duel-embedded'],['rail',{width:390,height:844},'duel-mobile'],
  ['battle',{width:390,height:844},'brawl-mobile'],['battle',{width:844,height:390},'brawl-landscape']]){
  const ctx=await context(viewport),p=await ctx.newPage();await p.goto(base+'/display?preview='+scenario);
  await p.waitForFunction(()=>window.__arena?.playbackFrame?.t>.8);await p.evaluate(()=>window.__arena.setPaused(true));
  await layout(p,label);await p.screenshot({path:path.join(out,label+'.png')});await ctx.close();
 }
 const reduced=await context({width:1920,height:1080},true),p=await reduced.newPage();await p.goto(base+'/display?practice=1');
 await p.waitForFunction(()=>window.__rpmQA?.().state.phase==='ready');
 await p.evaluate(()=>window.postMessage({type:'practice-launch',power:.8,angle:3},location.origin));
 await p.waitForFunction(()=>window.__rpmQA?.().frame?.t>0);
 const r=await p.evaluate(()=>window.__rpmQA());r.values.forEach((s,i)=>assert.equal(num(s),Math.round(r.frame.tops[i].angularSpeed*60/(2*Math.PI))));
 await reduced.close();report.checks.push('10/16-player, embedded and mobile layouts','reduced motion skips count-up');assert.deepEqual(errors,[]);report.passed=true;report.errors=errors;
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await app.close();writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
