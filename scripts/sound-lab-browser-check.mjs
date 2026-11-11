import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const publicRoot = path.resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wav': 'audio/wav', '.json': 'application/json', '.ttf': 'font/ttf' };
const server = createServer((request, response) => {
  const target = path.resolve(publicRoot, `.${new URL(request.url, 'http://localhost').pathname}`);
  if (!target.startsWith(publicRoot + path.sep)) { response.writeHead(403); response.end(); return; }
  try { const bytes = readFileSync(target); response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }); response.end(bytes); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.SOUND_LAB_TEST_URL || `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
if (!executablePath) { server.close(); throw new Error('Set CHROME_PATH to an installed Chromium browser.'); }
const browser = await chromium.launch({ executablePath, headless: true });

const requests=[],errors=[];
try {
 const page=await browser.newPage();
 page.on('request', request=>requests.push(request.url()));
 page.on('pageerror', error=>errors.push(error.message));
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  await page.goto(base+'/sound-lab.html');
  assert.equal(await page.locator('h1').textContent(),'音效比較已移除');
  assert.equal(await page.locator('button,input,select,audio,script').count(),0);
  assert.equal(await page.locator('a[href="/#settings"]').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 assert.ok(!requests.some(url=>/sound-packs|sound-lab\.js|\.wav/.test(url)));
 assert.deepEqual(errors,[]);
 mkdirSync('.qa',{recursive:true});
 const result={passed:true,comparisonRemoved:true,noPreviewAudioLoaded:true,mobile:true};
 writeFileSync('.qa/sound-lab-removal-results.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
