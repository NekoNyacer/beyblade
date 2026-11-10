import {chromium} from 'playwright-core';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createApp} from '../server.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.qa',{recursive:true});
const app=createApp({port:0,dataDir:mkdtempSync(path.resolve('.qa','decode-'))});await app.listen();
const executablePath=process.env.CHROME_PATH||['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try {
 const page=await browser.newPage();
 await page.route('**/qa-review.webm',route=>route.fulfill({contentType:'video/webm',body:readFileSync('.qa/metal-rail-review.webm')}));
 await page.goto(`http://localhost:${app.server.address().port}/healthz`);
 const decoded=await page.evaluate(async()=>{
  const bytes=await fetch('/qa-review.webm').then(r=>r.arrayBuffer()),video=document.createElement('video');
  video.muted=true;video.src=URL.createObjectURL(new Blob([bytes],{type:'video/webm'}));video.preload='auto';document.body.append(video);
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const context=canvas.getContext('2d'),frames=[];
  for(const time of [2,7,12,14.5,18]){
   await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Seek timed out at '+time)),10000);video.onseeked=()=>{clearTimeout(timeout);resolve();};video.currentTime=time;});
   context.drawImage(video,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let colorful=0;
   for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>15&&Math.max(pixels[i],pixels[i+1],pixels[i+2])>45)colorful++;
   frames.push({time,decodedTime:video.currentTime,colorfulPixels:colorful,png:canvas.toDataURL('image/png').split(',')[1]});
  }
  const end=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Video did not end')),10000);video.onended=()=>{clearTimeout(timeout);resolve(video.currentTime);};video.playbackRate=2;video.play().catch(reject);});
  return {width:video.videoWidth,height:video.videoHeight,duration:end,frames};
 });
 assert.equal(decoded.width,1280);assert.equal(decoded.height,800);assert.ok(decoded.duration>=19.5&&decoded.duration<=21);
 for(const frame of decoded.frames){assert.ok(frame.colorfulPixels>10000,'real nonblank decoded frame');const png=Buffer.from(frame.png,'base64');frame.file=`.qa/metal-review-${String(frame.time).replace('.','_')}s.png`;writeFileSync(frame.file,png);frame.sha256=createHash('sha256').update(png).digest('hex');delete frame.png;}
 assert.equal(new Set(decoded.frames.map(f=>f.sha256)).size,decoded.frames.length,'both segments contain changing real scene frames');
 writeFileSync('.qa/metal-reel-decode.json',JSON.stringify({passed:true,...decoded},null,2));console.log(JSON.stringify({passed:true,...decoded},null,2));
}finally{await browser.close();await app.close();}
