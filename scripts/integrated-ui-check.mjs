import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {newRoom} from '../game.mjs';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.qa',{recursive:true});
const app=createApp({host:'127.0.0.1',port:0,dataDir:mkdtempSync(path.join(tmpdir(),'integrated-ui-'))});await app.listen();
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),headless:true});
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const room=newRoom();app.rooms.set(room.roomId,room);
 await page.goto(base+'/play?room='+room.roomId+'&invite='+room.accessToken);
 assert.equal(await page.locator('main').isVisible(),true);assert.equal(await page.locator('#name').isVisible(),true);assert.equal(await page.locator('.launch-screen-gate').isVisible(),false);
 await page.screenshot({path:'.qa/integrated-portrait.png'});
 await page.screenshot({path:'.qa/integrated-join.png'});
 await page.fill('#name','整合檢查');await page.click('#join-button');await page.locator('#assembly').waitFor();
 for(const row of await page.locator('.part-row').all()){
   const texts=[];for(let i=0;i<3;i++){texts.push(await row.locator('output').textContent());await row.locator('button').last().click();}assert.equal(new Set(texts).size,3);
 }
 await page.locator('.part-row').nth(0).locator('button').last().click();
 const before=await page.locator('#combination-summary').textContent();
 await page.setViewportSize({width:844,height:390});assert.equal(await page.locator('.launch-screen-gate').isVisible(),true);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.launch-screen-gate').isVisible(),false);assert.equal(await page.locator('#combination-summary').textContent(),before);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'.qa/integrated-assembly.png',fullPage:true});
 await page.click('#confirm-parts');await page.waitForFunction(()=>document.querySelector('#assembly').hidden);
 assert.equal(room.players[0].parts.blade,1);
 await page.locator('.launch-screen-gate button').click();await page.waitForFunction(()=>!!document.fullscreenElement);await page.setViewportSize({width:844,height:390});await page.waitForFunction(()=>document.querySelector('.launch-screen-gate').hidden);
 await page.waitForTimeout(250);await page.screenshot({path:'.qa/integrated-launcher.png'});
 assert.equal(await page.locator('#ripcord').getAttribute('data-kit'),'red');
 for(const img of await page.locator('#ripcord img').all())assert.equal(await img.evaluate(i=>i.complete&&i.naturalWidth>0),true);
 await page.reload();await page.waitForSelector('#launcher-screen:not([hidden])');assert.equal(room.players[0].parts.blade,1);
 const practice=await browser.newPage({viewport:{width:1440,height:1000}});practice.on('pageerror',e=>errors.push(e.message));
 await practice.route('**/assets/display.js',async route=>{const response=await route.fetch(),source=await response.text();assert.equal(source.split('const arena=').length,2,'exactly one display arena hook');await route.fulfill({response,body:source.replace('const arena=','const arena=window.__arena=')});});
 const waitArmed=()=>practice.waitForFunction(()=>{const handle=document.querySelector('#handle'),ripcord=document.querySelector('#ripcord');return handle?.getAttribute('aria-disabled')==='false'&&ripcord?.classList.contains('active')&&!ripcord.classList.contains('released')&&!document.querySelector('#practice-start').disabled;},undefined,{timeout:5000});
 await practice.goto(base+'/scenarios');await waitArmed();
 await practice.locator('#handle').press('Enter');const arenaFrame=practice.frames().find(f=>f.url().includes('/display?practice'));await arenaFrame.waitForFunction(()=>window.__arena?.playbackFrame?.t>.5);const firstRound=await arenaFrame.evaluate(()=>window.__arena.playbackFrame.roundId);
 await practice.screenshot({path:'.qa/integrated-practice.png'});
 await waitArmed();
 await practice.locator('#handle').press('Enter');await arenaFrame.waitForFunction(id=>window.__arena?.playbackFrame?.roundId!==id&&window.__arena?.playbackFrame?.t>.5,firstRound);console.log('Practice repeated',firstRound,await arenaFrame.evaluate(()=>window.__arena.playbackFrame.roundId));
 await waitArmed();assert.equal(await practice.locator('#handle').getAttribute('aria-disabled'),'false');
 const diagnostics=await browser.newPage();await diagnostics.goto(base+'/scenarios?scene=rail');await diagnostics.waitForURL('**/scenarios-diagnostics.html?scene=rail');assert.ok(await diagnostics.locator('[data-scene]').count()>4);
 assert.deepEqual(errors,[]);writeFileSync('.qa/integrated-ui-results.json',JSON.stringify({passed:true,portraitNameAndAssembly:true,landscapePreparationGuard:true,nineChoices:true,rotationPreservesSelection:true,serverAssemblyPersists:true,fullscreenLauncher:true,practiceRounds:2,diagnosticsCompatible:true,errors},null,2));console.log('PASS: portrait name and assembly, horizontal preparation guard, nine choices, rotation persistence, saved assembly, fullscreen launcher art, repeat practice and diagnostic compatibility');
}finally{await browser.close();await app.close();}
