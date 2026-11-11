import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {newRoom,joinRoom,prepare,beginCountdown} from '../game.mjs';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=6000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error('Timed out: '+fn);await sleep(10);}}
mkdirSync('.qa',{recursive:true});
const app=createApp({host:'127.0.0.1',port:0,dataDir:mkdtempSync(path.join(tmpdir(),'launch-integration-'))});await app.listen();
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[],results=[];
try{
 for(const scenario of ['all-ready','timeout-disconnect']){
  const room=newRoom(),players=['A','B'].map(n=>joinRoom(room,n));players.forEach(p=>p.parts={blade:0,ratchet:1,bit:0});app.rooms.set(room.roomId,room);
  const contexts=[],phones=[];
  for(const p of players){
   const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'});contexts.push(context);
   await context.addInitScript(({roomId,player})=>{
    localStorage.setItem('arena-player:'+roomId,JSON.stringify({playerId:player.id,token:player.token,name:player.name}));
    const send=WebSocket.prototype.send;
    WebSocket.prototype.send=function(raw){if(JSON.parse(raw).type==='pull'){window.sentAt=performance.now();queueMicrotask(()=>{window.releasedBeforeAck=document.querySelector('#ripcord').classList.contains('released');});setTimeout(()=>send.call(this,raw),180);}else send.call(this,raw);};
   },{roomId:room.roomId,player:p});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/play?room='+room.roomId+'&invite='+room.accessToken);
   await page.locator('.launch-screen-gate button').click();await page.waitForFunction(()=>document.querySelector('.launch-screen-gate').hidden&&document.querySelector('#connection').classList.contains('online'));phones.push(page);
  }
  prepare(room); // Publish ready/countdown through a host socket, keeping the real UI path.
  const {default:WebSocket}=await import('ws');const host=new WebSocket(base.replace('http','ws')+'/ws?room='+room.roomId+'&role=host&token='+room.hostToken);await new Promise(r=>host.once('open',r));
  host.send(JSON.stringify({type:'action',action:'start'}));await until(()=>room.phase==='countdown');
  const first=phones[0],second=phones[1];await first.bringToFront();
  const box=await first.locator('#handle').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  const stroke=await first.locator('#ripcord').evaluate(e=>parseFloat(e.style.getPropertyValue('--stroke')));
  const cdp=await contexts[0].newCDPSession(first),touch=(type,pos)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pos==null?[]:[{x:pos,y}]});
  await touch('touchStart',x);await touch('touchMove',x+2);
  await first.locator('#launch-cue.shoot-signal').waitFor();assert.equal(room.battle,null);assert.equal(await first.locator('#handle').getAttribute('aria-disabled'),'false');
  if(scenario==='timeout-disconnect')await contexts[1].setOffline(true);
  await first.screenshot({path:'.qa/integration-'+scenario+'-shoot.png'});
  await touch('touchMove',x+stroke*.45);await sleep(35);await touch('touchMove',x+stroke+3);
  await first.waitForFunction(()=>window.releasedBeforeAck,null,{polling:10,timeout:1000});assert.equal(room.round.pulledIds.length,0,'local release before network delivery');
  assert.equal(await first.locator('#launch-cue.shoot-signal').count(),0);
  await touch('touchEnd');await cdp.detach();await until(()=>room.round.pulledIds.length===1);assert.equal(room.battle,null,'early player cannot enter battle alone');
  if(scenario==='all-ready'){await second.locator('#handle').press('Enter');await until(()=>room.phase==='running');assert.ok(room.round.startsAt<room.round.deadline);assert.deepEqual(room.round.autoReleasedIds,[]);}
  else{await until(()=>room.phase==='running');assert.equal(room.round.startsAt,room.round.deadline);assert.deepEqual(room.round.autoReleasedIds,[players[1].id]);await contexts[1].setOffline(false);await second.reload();await second.waitForFunction(()=>document.querySelector('#ripcord').classList.contains('released'));assert.equal(await second.locator('#handle').getAttribute('aria-disabled'),'true');assert.match(await second.locator('#launch-help').textContent(),/標準力道/);}
  assert.equal(room.battle.tops.length,2);assert.equal(room.round.shootAt-room.round.countdownAt,3000);assert.equal(room.round.deadline-room.round.shootAt,1200);
  await first.evaluate(()=>document.exitFullscreen());await first.locator('.launch-screen-gate:not([hidden])').waitFor();assert.equal(await first.locator('#handle').getAttribute('aria-disabled'),'true');
  results.push({scenario,pulled:room.round.pulledIds.length,auto:room.round.autoReleasedIds.length,window:room.round.startsAt-room.round.shootAt,localReleaseBeforeAck:true,fullscreenExitBlocksInput:true});
  host.close();await Promise.all(contexts.map(c=>c.close()));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results,errors},null,2));writeFileSync('.qa/launch-integration-results.json',JSON.stringify({passed:true,results,errors},null,2));
}finally{await browser.close();await app.close();}
