import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {newRoom} from '../game.mjs';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const app=createApp({host:'127.0.0.1',port:0,dataDir:mkdtempSync(path.join(tmpdir(),'portrait-preparation-'))});await app.listen();
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],results=[];mkdirSync('.qa',{recursive:true});
async function phone(mode='success'){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36"});
 await context.addInitScript(mode=>{
  window.__calls=[];window.__full=false;window.__landscape=false;
  Object.defineProperty(screen.orientation,'type',{configurable:true,get:()=>mode==='legacy'?'':__landscape?'landscape-primary':'portrait-primary'});
  if(mode==='legacy')Object.defineProperty(window,'orientation',{configurable:true,get:()=>__landscape?90:0});
  Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>__full?document.documentElement:null});
  Object.defineProperty(document,'exitFullscreen',{configurable:true,value:async()=>{__calls.push('exit');__full=false;document.dispatchEvent(new Event('fullscreenchange'));}});
  Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:mode==='unsupported'?undefined:async function(){__calls.push('fullscreen');if(mode==='denied')throw Error('denied');__full=true;document.dispatchEvent(new Event('fullscreenchange'));}});
  Object.defineProperty(Element.prototype,'webkitRequestFullscreen',{configurable:true,value:undefined});
  Object.defineProperty(screen.orientation,'unlock',{configurable:true,value:()=>__calls.push('unlock')});
  Object.defineProperty(screen.orientation,'lock',{configurable:true,value:mode==='unsupported'?undefined:async value=>{__calls.push(value);if(mode==='lock-denied')throw Error('lock denied');}});
 },mode);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page;
}
async function rotate(page,landscape){await page.setViewportSize(landscape?{width:844,height:390}:{width:390,height:844});await page.evaluate(value=>{__landscape=value;dispatchEvent(new Event('orientationchange'));},landscape);}
try{
 const room=newRoom();app.rooms.set(room.roomId,room);const url=base+'/play?room='+room.roomId+'&invite='+room.accessToken;
 // A slow module download must never render the obsolete landscape-only gate.
 const cold=await phone();let releaseModule,markModule;const moduleReady=new Promise(resolve=>markModule=resolve),moduleHold=new Promise(resolve=>releaseModule=resolve);
 await cold.route('**/assets/play.js',async route=>{markModule();await moduleHold;await route.continue();});
 await cold.goto(url,{waitUntil:'commit'});await moduleReady;
 await cold.waitForFunction(()=>document.querySelector('#name')&&document.styleSheets.length===document.querySelectorAll('link[rel="stylesheet"]').length);
 for(let i=0;i<3;i++){assert.equal(await cold.locator('#name').isVisible(),true);assert.equal(await cold.locator('.rotate-phone').count(),0);assert.equal(await cold.locator('.launch-screen-gate:not([hidden])').count(),0);await cold.waitForTimeout(100);}
 await cold.screenshot({path:'.qa/portrait-cold-entry.png'});releaseModule();await cold.locator('.launch-screen-gate').waitFor({state:'attached'});
 assert.equal(await cold.locator('.launch-screen-gate').isVisible(),false);assert.equal(await cold.locator('#join-form .intro, #name-hint').count(),0);assert.equal(await cold.locator('#name').getAttribute('aria-describedby'),null);assert.equal(await cold.locator('footer').textContent(),'競技場 '+room.roomId);await cold.close();
 results.push('cold HTML and delayed module: no rotation flash; concise accessible name form');
 const page=await phone();await page.goto(url);await page.locator('#name').waitFor();assert.equal(await page.locator('.launch-screen-gate').isVisible(),false);
 await page.click('#join-button');assert.equal(room.players.length,0);assert.deepEqual(await page.evaluate(()=>__calls),[]);
 await page.fill('#name','直向名字');
 // Emulate a keyboard shrinking layout viewport without rotating the physical screen.
 await page.setViewportSize({width:390,height:300});assert.equal(await page.locator('#name').isVisible(),true);assert.equal(await page.locator('.launch-screen-gate').isVisible(),false);await page.setViewportSize({width:390,height:844});
 await page.route('**/api/join',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'測試暫時失敗'})}));await page.click('#join-button');await page.waitForFunction(()=>document.querySelector('#join-error').textContent.includes('測試暫時失敗'));assert.equal(await page.inputValue('#name'),'直向名字');assert.deepEqual(await page.evaluate(()=>__calls),[]);await page.unroute('**/api/join');
 await rotate(page,true);await page.locator('.launch-screen-gate:not([hidden])').waitFor();assert.equal(await page.locator('#name').isVisible(),false);await page.evaluate(()=>{__full=true;});await page.locator('.launch-screen-gate button').click();assert.deepEqual(await page.evaluate(()=>__calls),['unlock','exit']);await rotate(page,false);assert.equal(await page.inputValue('#name'),'直向名字');await page.screenshot({path:'.qa/portrait-name-form.png',fullPage:true});
 await page.click('#join-button');await page.locator('#assembly').waitFor();assert.equal(await page.locator('.launch-screen-gate').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'');
 await page.locator('.part-row').first().locator('button').last().click();const draft=await page.locator('#combination-summary').textContent();await rotate(page,true);assert.match(await page.locator('.launch-screen-gate h2').textContent(),/組裝/);await rotate(page,false);assert.equal(await page.locator('#combination-summary').textContent(),draft);assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflowY),'hidden');await page.screenshot({path:'.qa/portrait-assembly.png',fullPage:true});
 await page.click('#confirm-parts');await page.waitForFunction(()=>document.querySelector('#assembly').hidden);assert.equal(room.players[0].parts.blade,1);await page.locator('.launch-screen-gate:not([hidden]) button').waitFor();await page.screenshot({path:'.qa/portrait-fullscreen-button.png'});assert.deepEqual(await page.evaluate(()=>__calls),['unlock','exit']);
 await page.locator('.launch-screen-gate button').click();assert.deepEqual(await page.evaluate(()=>__calls),['unlock','exit','fullscreen','landscape']);await rotate(page,true);await page.waitForFunction(()=>document.querySelector('.launch-screen-gate').hidden);
 await page.reload();await page.waitForSelector('#launcher-screen:not([hidden])');assert.equal(await page.locator('#join-panel').isVisible(),false);assert.equal(room.players.length,1);assert.equal(room.players[0].parts.blade,1);
 await rotate(page,true);await page.locator('.launch-screen-gate button').click();await page.waitForFunction(()=>document.querySelector('.launch-screen-gate').hidden);await page.evaluate(()=>document.exitFullscreen());await page.locator('.launch-screen-gate:not([hidden])').waitFor();assert.equal(await page.locator('#handle').getAttribute('aria-disabled'),'true');
 // Saved identity stays unblocked until the server identifies the next screen.
 const recovery=await page.context().newPage();recovery.on('pageerror',e=>errors.push(e.message));let releaseJoin,markJoin;
 const joinHold=new Promise(resolve=>releaseJoin=resolve),joinReady=new Promise(resolve=>markJoin=resolve);
 await recovery.route('**/api/join',async route=>{markJoin();await joinHold;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'測試重連暫時失敗'})});});
 await recovery.goto(url);await joinReady;assert.equal(await recovery.locator('.launch-screen-gate').isVisible(),false);assert.equal(await recovery.locator('#name').isVisible(),true);assert.equal(await recovery.locator('#join-button').isDisabled(),true);
 await rotate(recovery,true);assert.equal(await recovery.locator('.launch-screen-gate').isVisible(),false);await rotate(recovery,false);
 releaseJoin();await recovery.waitForFunction(()=>document.querySelector('#join-error').textContent.includes('測試重連暫時失敗'));assert.equal(await recovery.locator('.launch-screen-gate').isVisible(),false);assert.equal(await recovery.locator('#join-button').isEnabled(),true);
 assert.ok(await recovery.evaluate(key=>JSON.parse(localStorage.getItem(key))?.token,'arena-player:'+room.roomId));await recovery.unroute('**/api/join');
 await recovery.click('#join-button');await recovery.waitForSelector('#launcher-screen:not([hidden])',{state:'attached'});await recovery.locator('.launch-screen-gate:not([hidden])').waitFor();assert.equal(room.players.length,1);await recovery.close();
 const expired=await phone();await expired.addInitScript(roomId=>localStorage.setItem('arena-player:'+roomId,JSON.stringify({playerId:'expired',token:'expired',name:'保留名字'})),room.roomId);await expired.goto(url);
 await expired.waitForFunction(()=>document.querySelector('#join-error').textContent.includes('連線身分已失效'));assert.equal(await expired.locator('.launch-screen-gate').isVisible(),false);assert.equal(await expired.inputValue('#name'),'保留名字');assert.equal(await expired.evaluate(key=>localStorage.getItem(key),'arena-player:'+room.roomId),null);await expired.close();
 const invalid=await phone();await invalid.goto(base+'/play');await invalid.waitForFunction(()=>document.querySelector('#join-error').textContent.includes('有效的房間編號'));assert.equal(await invalid.locator('.launch-screen-gate').isVisible(),false);assert.equal(await invalid.locator('#join-button').isDisabled(),true);await invalid.close();
 results.push('slow saved-identity recovery in both orientations; retryable failure; confirmed launcher only after recovery; expired identity and invalid room errors remain visible');
 results.push('portrait name and assembly; no fullscreen requests before confirmed assembly; keyboard shrink; empty/failed submit; landscape recovery; draft preservation; saved identity and confirmed parts');
 const desktop=await browser.newPage({viewport:{width:600,height:900}});await desktop.goto(url);await desktop.locator('#name').waitFor();assert.equal(await desktop.locator('.launch-screen-gate').isVisible(),false);results.push('desktop portrait name form remains available');await desktop.close();
 const legacy=await phone('legacy');await legacy.goto(url);await legacy.locator('#name').waitFor();await legacy.setViewportSize({width:390,height:300});assert.equal(await legacy.locator('#name').isVisible(),true);assert.equal(await legacy.locator('.launch-screen-gate').isVisible(),false);results.push('legacy iOS orientation survives keyboard viewport shrink');await legacy.close();
 const pair=await (await fetch(base+'/api/practice-session',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json();const pairedUrl=base+'/pull-phone?session='+pair.session+'&token='+pair.phoneToken;
 for(const mode of ['denied','lock-denied','unsupported']){const p=await phone(mode);await p.goto(pairedUrl);await p.locator('.launch-screen-gate:not([hidden]) button').click();assert.match(await p.locator('.launch-gate-error').textContent(),mode==='denied'?/無法進入全螢幕/:mode==='lock-denied'?/手動將手機橫放/:/加入主畫面/);results.push(mode+': actionable guidance');await p.close();}
 const practice=await phone();await practice.goto(base+'/scenarios');await practice.locator('.launch-screen-gate:not([hidden]) button').waitFor();await rotate(practice,true);await practice.waitForFunction(()=>document.querySelector('.launch-screen-gate').hidden);await practice.waitForSelector('#handle[aria-disabled="false"]');assert.equal(await practice.evaluate(()=>__full),false);results.push('paired phone has no name step; scenarios landscape still needs no fullscreen');
 assert.deepEqual(errors,[]);const report={passed:true,capabilityMocks:true,results,errors};writeFileSync('.qa/portrait-launch-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await app.close();}
