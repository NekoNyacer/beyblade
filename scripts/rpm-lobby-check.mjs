import {chromium} from 'playwright-core';
import {WebSocket} from 'ws';
import {createApp} from '../server.mjs';
import {newRoom,joinRoom} from '../game.mjs';
import {mkdirSync,mkdtempSync,existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve('.qa/rpm-lobby');mkdirSync(out,{recursive:true});
const app=createApp({host:'127.0.0.1',port:0,dataDir:mkdtempSync(path.join(out,'data-'))});await app.listen();
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),headless:true});
const report={sizes:[],checks:[]},errors=[];
const wait=async fn=>{const end=Date.now()+12000;while(!fn()){assert.ok(Date.now()<end,'server condition');await new Promise(r=>setTimeout(r,20));}};
try{
 for(const [count,viewport] of [[2,[1920,1080]],[4,[1920,1080]],[10,[1920,1080]],[16,[1920,1080]],[2,[1280,720]],[10,[1280,720]],[2,[390,844]],[10,[390,844]],[16,[390,844]],[10,[844,390]],[16,[844,390]]]){
  const room=newRoom('tournament');app.rooms.set(room.roomId,room);
  for(let i=0;i<count;i++)joinRoom(room,i===1?'Eddie Liu 的房間':i===0?'113':'選手 '+String(i+1).padStart(2,'0'));
  const c=await browser.newContext({viewport:{width:viewport[0],height:viewport[1]}});
  await c.addInitScript(()=>{const Native=WebSocket;window.__sockets=[];window.WebSocket=class extends Native{constructor(...args){super(...args);window.__sockets.push(this);}};});
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/display?room='+room.roomId+'&invite='+room.accessToken);
  await p.waitForFunction(n=>document.querySelectorAll('.rpm-value').length===n,count);
  await p.evaluate(()=>document.fonts.ready);
  await p.waitForFunction(()=>document.querySelector('#qr').naturalWidth>0);
  assert.equal(await p.locator('#match-title').isVisible(),false);assert.equal(await p.locator('#mode-label').innerText(),'一對一淘汰賽');
  for(const selector of ['#room-code','#join-short','#invite p'])assert.equal(await p.locator(selector).isVisible(),false);
  assert.equal(await p.locator('#qr').isVisible(),true);
  assert.deepEqual(await p.locator('.rpm-value').allTextContents(),Array(count).fill('0'));
  assert.ok((await p.locator('.spin-state').allTextContents()).every(s=>s===''));
  const metrics=await p.locator('.rpm-value').evaluateAll(nodes=>nodes.map(el=>{
   const box=el.getBoundingClientRect(),plate=el.closest('.display-player').getBoundingClientRect(),unit=el.nextElementSibling.getBoundingClientRect();
   const fits=box.left>=plate.left&&box.right<=plate.right&&unit.right<=plate.right+1&&box.top>=plate.top&&box.bottom<=plate.bottom+1&&plate.top>=0&&plate.bottom<=innerHeight*.93;
   const normal=el.textContent;el.textContent='7,200';const wide=el.getBoundingClientRect(),wideUnit=el.nextElementSibling.getBoundingClientRect();const wideFits=wide.left>=plate.left&&wide.right<=plate.right+1&&wideUnit.right<=plate.right+1;el.textContent=normal;
   return {font:parseFloat(getComputedStyle(el).fontSize),fits,wideFits};
  }));
  const label='lobby-'+count+'-'+viewport.join('x');report.sizes.push({label,metrics});
  await p.screenshot({path:path.join(out,label+'.png')});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(count===2&&viewport[0]===1920){
   const joinUrl=new URL(new URL(await p.locator('#qr').getAttribute('src'),base).searchParams.get('text'));
   assert.equal(joinUrl.pathname,'/play');assert.equal(joinUrl.searchParams.get('room'),room.roomId);
   const entry=await c.newPage();await entry.goto(joinUrl.href);await entry.locator('#join-panel').waitFor();await entry.close();
   await c.setOffline(true);await p.evaluate(()=>window.__sockets.forEach(s=>s.close()));
   await p.waitForFunction(()=>document.querySelector('#connection').textContent.includes('中斷'));
   assert.equal(await p.locator('#connection').isVisible(),true);
   assert.deepEqual(await p.locator('.rpm-value').allTextContents(),['0','0']);
   await c.setOffline(false);await p.waitForFunction(()=>document.querySelector('#connection').classList.contains('online'));
   await p.reload();await p.waitForFunction(()=>document.querySelectorAll('.rpm-value').length===2);
   assert.deepEqual(await p.locator('.rpm-value').allTextContents(),['0','0']);
   const ws=new WebSocket(base.replace('http','ws')+'/ws?room='+room.roomId+'&role=host&token='+room.hostToken);
   await new Promise(r=>ws.once('open',r));ws.send(JSON.stringify({type:'action',action:'prepare'}));
   await wait(()=>room.phase==='ready');await p.waitForFunction(()=>document.body.dataset.phase==='ready');
   assert.equal(await p.locator('#match-title').isVisible(),true);assert.equal(await p.locator('#qr').isVisible(),false);
   assert.deepEqual(await p.locator('.rpm-value').allTextContents(),['0','0']);
   ws.send(JSON.stringify({type:'action',action:'start'}));
   await wait(()=>room.phase==='running');await p.waitForFunction(()=>[...document.querySelectorAll('.rpm-value')].every(n=>Number(n.textContent.replaceAll(',',''))>0));
   await p.screenshot({path:path.join(out,'after-lobby-launch.png')});ws.close();
   report.checks.push('lobby refresh and reconnect remain zero','connection failure stays visible','QR entry preserved','match title returns for ready/battle','normal countdown and fallback launch remain functional');
  }
  await c.close();
 }
 report.checks.push('marked lobby labels removed','zero RPM, names and mode retained','2/4/10/16-player and desktop/mobile layouts');
 assert.ok(report.sizes.every(s=>s.metrics.every(m=>m.fits&&m.wideFits)),'all values and units fit at zero and 7200 RPM');
 assert.deepEqual(errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await app.close();report.errors=errors;writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
