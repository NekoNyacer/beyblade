import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {newRoom,joinRoom,prepare,start,finish,stepBattle} from '../game.mjs';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const output=path.resolve('.qa/champion-redesign');mkdirSync(output,{recursive:true});
const app=createApp({host:'127.0.0.1',port:0,dataDir:mkdtempSync(path.join(tmpdir(),'champion-'))});await app.listen();
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),headless:true});
const errors=[],checks=[];
function event(mode,count,long=false){const room=newRoom(mode);room.seed=124;for(let n=0;n<count;n++)joinRoom(room,long?'冠軍選手超級長名稱第'+n+'號測試參賽者':'選手 '+(n+1));prepare(room);start(room);while(!room.battle.done)stepBattle(room.battle);finish(room);app.rooms.set(room.roomId,room);return room;}
async function tab(room,viewport,host=false){const context=await browser.newContext({viewport,reducedMotion:'reduce'});if(host)await context.addInitScript(room=>localStorage.setItem('beyblade-host',JSON.stringify(room)),{roomId:room.roomId,hostToken:room.hostToken,accessToken:room.accessToken});await context.addInitScript(()=>{const WS=window.WebSocket;window.__testSockets=[];window.WebSocket=class extends WS{constructor(...args){super(...args);window.__testSockets.push(this);}};});const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base+(host?'/':'/display?room='+room.roomId+'&invite='+room.accessToken));if(!host)await page.locator('#result').waitFor({state:'visible',timeout:20000});return page;}
async function fits(page){assert.equal(await page.locator('#roster').isVisible(),false);const result=await page.locator('#result').evaluate(el=>{const r=el.getBoundingClientRect();return {scroll:el.scrollHeight,client:el.clientHeight,top:r.top,bottom:r.bottom,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth};});assert.equal(result.overflow,false);assert.ok(result.scroll<=result.client+1,JSON.stringify(result));assert.ok(result.top>=0&&result.bottom<=result.height,JSON.stringify(result));const name=page.locator('#result .result-name');if(await name.count()){const text=await name.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));assert.ok(text.scroll<=text.client+1,JSON.stringify(text));}}
try{
 const champion=event('tournament',2);const display=await tab(champion,{width:1920,height:1080});
 assert.equal(await display.locator('#result .champion-trophy').isVisible(),true);assert.equal(await display.locator('#display-schedule').isVisible(),false);assert.equal(await display.locator('#roster').isVisible(),false);
 assert.equal(await display.locator('#result h3').textContent(),champion.players.find(p=>p.id===champion.championId).name);
 await fits(display);await display.screenshot({path:path.join(output,'champion-desktop.png')});
 await display.locator('#result-bracket-toggle').focus();await display.locator('#result-bracket-toggle').click();assert.equal(await display.locator('#display-schedule').isVisible(),true);assert.equal(await display.locator('#result').isVisible(),false);
 assert.equal(await display.locator('.is-champion .bracket-trophy').count(),1);assert.equal(await display.locator('.is-champion .bracket-match-heading').count(),0);assert.equal(await display.locator('.is-champion .bracket-outcome').count(),0);
 await display.screenshot({path:path.join(output,'champion-projection-bracket.png')});await display.keyboard.press('Escape');assert.equal(await display.locator('#display-schedule').isVisible(),false);
 // Repeated toggle and refresh retain the correct result without stale bracket overlays.
 await display.locator('#result-bracket-toggle').click();await display.locator('#result-bracket-toggle').click();await display.reload();await display.locator('#result .champion-trophy').waitFor();await fits(display);
 await display.evaluate(()=>window.__testSockets.at(-1).close());await display.waitForFunction(()=>document.querySelector('#connection').textContent.includes('訊號中斷'));
 assert.equal(await display.locator('#connection').isVisible(),true);await display.waitForFunction(()=>document.querySelector('#connection').classList.contains('online'));assert.equal(await display.locator('#result h3').textContent(),champion.players.find(p=>p.id===champion.championId).name);checks.push('authoritative champion, bracket toggle, Escape, repeat, reload and reconnect');
 const host=await tab(champion,{width:1440,height:1000},true);await host.locator('#tab-schedule').click();await host.locator('#schedule .is-champion .winner').waitFor();await host.screenshot({path:path.join(output,'champion-host-bracket.png'),fullPage:true});await host.close();
 const long=event('brawl',10,true);const brawl=await tab(long,{width:1920,height:1080});await fits(brawl);assert.equal(await brawl.locator('.result-places>div').count(),2);await brawl.screenshot({path:path.join(output,'champion-long-desktop.png')});
 for(const [name,width,height] of [['1280',1280,720],['zoom-200',960,540],['mobile',390,844],['small',320,568],['landscape',844,390]]){await brawl.setViewportSize({width,height});await fits(brawl);await brawl.screenshot({path:path.join(output,'champion-'+name+'.png')});}checks.push('ten-player podium, 20-character names, 1920/1280/200% equivalent/390/320/844 viewports');
 const round=event('tournament',4);const intermediate=await tab(round,{width:1280,height:720});assert.equal(await intermediate.locator('#display-schedule').isVisible(),true);assert.equal(await intermediate.locator('#result .champion-trophy').count(),0);assert.match(await intermediate.locator('#result').textContent(),/本場勝者/);await intermediate.screenshot({path:path.join(output,'round-result.png')});checks.push('intermediate tournament retains next-round bracket');
 const missing=event('brawl',2);missing.round.winnerId=null;missing.championId=null;missing.battle=null;const empty=await tab(missing,{width:390,height:844});await fits(empty);assert.equal(await empty.locator('#result .champion-trophy').count(),0);assert.match(await empty.locator('#result').textContent(),/本場未有勝者/);await empty.screenshot({path:path.join(output,'missing-winner.png')});checks.push('missing winner has an explicit neutral result');
 assert.deepEqual(errors,[]);const report={passed:true,checks,errors};writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await app.close();}
