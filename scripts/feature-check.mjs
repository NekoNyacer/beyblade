import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {newRoom,joinRoom,prepare,start} from '../game.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
mkdirSync('.qa',{recursive:true});
const app=createApp({port:0,dataDir:mkdtempSync(path.resolve('.qa','features-'))});await app.listen();const base=`http://localhost:${app.server.address().port}`;
const room=newRoom();joinRoom(room,'紅色流星');joinRoom(room,'藍色旋風');app.rooms.set(room.roomId,room);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});const errors=[];
try{
 const phone=await browser.newPage({viewport:{width:390,height:844}});phone.on('pageerror',e=>errors.push(e.message));await phone.goto(`${base}/play?room=${room.roomId}&invite=${room.accessToken}`);await phone.locator('#name').fill('組裝選手');await phone.locator('#join-button').click();await phone.locator('#assembly').waitFor();await phone.getByRole('button',{name:'下一個 Blade',exact:true}).click();await phone.getByRole('button',{name:'下一個 Bit',exact:true}).click();await phone.screenshot({path:'.qa/mobile-assembly.png',fullPage:true});await phone.locator('#confirm-parts').click();await phone.locator('#assembly').waitFor({state:'hidden'});assert.equal(room.players[2].parts.blade,1);assert.equal(room.players[2].parts.bit,1);await phone.reload();await phone.locator('#launcher-screen').waitFor();assert.equal(await phone.locator('#assembly').isVisible(),false);
 const display=await browser.newPage({viewport:{width:1920,height:1080}});display.on('pageerror',e=>errors.push(e.message));prepare(room);start(room);await display.goto(`${base}/display?room=${room.roomId}&invite=${room.accessToken}`);await display.locator('canvas').waitFor();await display.waitForTimeout(500);assert.equal(await display.locator('.energy-track').count(),0);assert.ok((await display.locator('.display-player .status').first().textContent()).includes('RPM'));await display.screenshot({path:'.qa/display-battle.png'});
 Object.assign(room.battle.tops[0],{x:5.55,z:0,vx:8,vz:0,lastHit:room.battle.tick});await display.waitForFunction(()=>document.querySelector('#center-message').textContent.includes('慢動作'));await display.waitForTimeout(700);await display.screenshot({path:'.qa/display-ringout.png'});assert.ok(room.battle.eliminated.includes(room.players[0].id));await display.waitForFunction(()=>!document.querySelector('#center-message').textContent.includes('慢動作'));assert.deepEqual(errors,[]);
 const result={assemblyPersists:true,ringoutReplay:true,rpmWithoutBars:true,errors};writeFileSync('.qa/feature-results.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();await app.close();}
