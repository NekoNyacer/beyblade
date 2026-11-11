import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {stepBattle} from '../game.mjs';
import {mkdirSync,mkdtempSync,existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const output=path.resolve('.qa/tournament');mkdirSync(output,{recursive:true});
const dataDir=mkdtempSync(path.join(output,'event-')),app=createApp({port:0,dataDir});await app.listen();
const base=`http://127.0.0.1:${app.server.address().port}`;
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
const errors=[];
const post=async(route,data)=>{const res=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.ok(res.ok);return res.json();};
async function tab(viewport,event,route='/'){
 const context=await browser.newContext({viewport,reducedMotion:'reduce'});
 if(event)await context.addInitScript(event=>localStorage.setItem('beyblade-host',JSON.stringify(event)),event);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+route);return page;
}
async function result(host,room){
 await host.locator('[data-action="start"]').click();
 await host.waitForFunction(()=>document.querySelector('#phase-heading').textContent==='準備發射');
 room.round.countdownAt=Date.now()-5001;room.round.shootAt=Date.now()-1;room.round.startsAt=room.round.shootAt;room.round.deadline=Date.now()+1200;
 await host.waitForFunction(()=>document.querySelector('#phase-heading').textContent==='激戰中');
 for(let i=0;i<1000&&!room.battle.done;i++)stepBattle(room.battle);
 assert.ok(room.battle.done);
 await host.locator('#winner-strip').waitFor({state:'visible'});
 const winner=room.players.find(p=>p.id===room.round.winnerId).name;
 assert.ok((await host.locator('#winner-strip').textContent()).includes(winner));return winner;
}
try{
 const event=await post('/api/create',{mode:'tournament'});
 for(let i=0;i<7;i++)await post('/api/join',{roomId:event.roomId,accessToken:event.accessToken,name:i===0?'甲 <測試> & 01':'選手 '+(i+1)});
 const room=app.rooms.get(event.roomId);room.seed=123;
 const host=await tab({width:1440,height:1000},event);
 const display=await tab({width:1920,height:1080},null,`/display?room=${event.roomId}&invite=${event.accessToken}`);
 await host.locator('[data-action="prepare"]').click();
 await host.waitForFunction(()=>document.querySelectorAll('#schedule [data-match-id]').length===4);
 assert.equal(room.matches.filter(m=>m.playerIds.length===1).length,1);
 assert.equal(await host.locator('#schedule .bracket-round').count(),4);
 assert.ok(await host.locator('#schedule .bracket-links path').count()>0);
 const first=room.round.matchId,winner=await result(host,room);
 await display.locator('#display-schedule').waitFor({state:'visible',timeout:15000});
 assert.ok((await display.locator('#display-bracket').textContent()).includes(winner));
 const winnerFeeds=await host.locator('#schedule [data-bracket-sources]').evaluateAll((els,id)=>els.filter(el=>JSON.parse(el.dataset.bracketSources).includes(id)).map(el=>el.textContent),first);
 assert.ok(winnerFeeds.some(text=>text.includes(winner)));
 await host.locator('#schedule').scrollIntoViewIfNeeded();
 await host.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
 await display.screenshot({path:path.join(output,'display.png'),fullPage:true});
 const mobile=await tab({width:390,height:844},event);
 await mobile.locator('#schedule [data-match-id]').first().waitFor();
 await mobile.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
 assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const overflow=await mobile.locator('.bracket-viewport').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert.ok(overflow.scroll>overflow.client);
 await mobile.locator('.bracket-viewport').evaluate(el=>el.scrollLeft=el.scrollWidth);
 assert.ok(await mobile.locator('.bracket-viewport').evaluate(el=>el.scrollLeft>0));
 await mobile.close();
 while(room.phase!=='finished'){
  await host.locator('[data-action="advance"]').click();await host.locator('[data-action="start"]').waitFor();await result(host,room);
 }
 assert.equal(room.matches.filter(m=>m.playerIds.length===2).length,6);
 await display.locator('#display-schedule').waitFor({state:'visible'});
 await host.locator('#schedule .is-champion .winner').waitFor();
 const champion=room.players.find(p=>p.id===room.championId).name;
 assert.ok((await host.locator('#schedule .is-champion').textContent()).includes(champion));
 await host.reload();await host.locator('#schedule .is-champion .winner').waitFor();
 assert.ok((await host.locator('#schedule .is-champion').textContent()).includes(champion));
 await host.screenshot({path:path.join(output,'champion.png'),fullPage:true});
 await display.screenshot({path:path.join(output,'display-champion.png'),fullPage:true});
 await host.close();await display.close();
 // Test the maximum roster and an odd draw pool in the actual shared UI.
 for(const n of [5,16]){
  const e=await post('/api/create',{mode:'tournament'});
  for(let i=0;i<n;i++)await post('/api/join',{roomId:e.roomId,accessToken:e.accessToken,name:'測試選手 '+(i+1)});
  const h=await tab({width:1440,height:1000},e);await h.locator('[data-action="prepare"]').click();await h.locator('#schedule [data-match-id]').first().waitFor();
  if(n===5)assert.equal(await h.locator('#schedule .is-draw').count(),1);
  if(n===16){
   assert.equal(app.rooms.get(e.roomId).matches.length,8);
   await result(h,app.rooms.get(e.roomId));
   const d=await tab({width:1920,height:1080},null,`/display?room=${e.roomId}&invite=${e.accessToken}`);
   await d.locator('#display-schedule').waitFor({state:'visible',timeout:15000});
   await d.screenshot({path:path.join(output,'display-16.png'),fullPage:true});
   const bounds=await d.locator('#display-schedule').evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight}));
   assert.ok(bounds.scroll<=bounds.client+2,'16-player projection fits vertically: '+JSON.stringify(bounds));
   await d.close();
  }
  await h.close();
 }
 assert.deepEqual(errors,[]);
 const summary={passed:true,realSevenPlayerGames:6,oddSeed:true,automaticFeeds:true,hostAndDisplaySync:true,reloadRetainsChampion:true,mobileContainedScroll:true,maxProjectionFits:true,errors};
 writeFileSync(path.join(output,'results.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{await browser.close();await app.close();}
