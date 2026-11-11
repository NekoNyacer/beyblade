import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, rmdirSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { WebSocket } from 'ws';
import { joinRoom, newRoom, prepare } from '../game.mjs';
import { createApp } from '../server.mjs';

const executablePath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const dataDir = mkdtempSync(path.join(tmpdir(), 'beyblade-sound-'));
const app = createApp({ port: 0, host: '127.0.0.1', dataDir });
const errors = [];
const impactTiers = [
  ['hit', 'ping-light-2', 'ping-light-3'],
  ['ping-mid-1', 'ping-mid-2', 'ping-mid-3'],
  ['heavyHit', 'ping-heavy-2', 'ping-heavy-3'],
];
try {
  await app.listen();
  const base = 'http://localhost:' + app.server.address().port;
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
  await context.addInitScript(() => {
    const signature = buffer => {
      const pcm = buffer.getChannelData(0);
      const samples = [.07, .23, .47, .69].map(t => pcm[Math.floor(pcm.length * t)]);
      return [buffer.length, ...samples].join(',');
    };
    window.startedSamples = [];
    window.cueTimes = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const result = start.apply(this, args);
      window.startedSamples.push(signature(this.buffer));
      window.cueTimes.push(performance.now()+Math.max(0,(args[0]||0)-this.context.currentTime)*1000);
      window.playbackRateHz = this.buffer.sampleRate;
      return result;
    };
    window.identifySamples = async files => {
      const decoder = new OfflineAudioContext(1, 1, window.playbackRateHz);
      const namesBySignature = new Map();
      for (const file of files) {
        const response = await fetch('/assets/sounds/' + file);
        if (!response.ok) throw Error('Missing sound ' + file);
        const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
        namesBySignature.set(signature(buffer), file.split('/').at(-1).slice(0, -4));
      }
      return window.startedSamples.map(key => namesBySignature.get(key) ?? 'unknown');
    };
  });
  const files = readdirSync(new URL('../public/assets/sounds/', import.meta.url)).filter(name => name.endsWith('.wav')).concat(['../audience/cheer-short.wav', '../audience/cheer-medium.wav', '../audience/applause.wav']);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/display?preview=countdown');
  await page.locator('#center-message', { hasText: /2|1|GO/ }).waitFor();
  assert.equal(await page.evaluate(() => window.startedSamples.length), 0, 'silent countdown before gesture');
  await page.locator('#sound').click();
  await page.locator('#sound', { hasText: '已開啟' }).waitFor();
  const previewCues = await page.evaluate(files => window.identifySamples(files), files);
  assert.ok(previewCues.some(cue => ['two', 'one', 'go'].includes(cue)), 'sound control enables current countdown callout');

  const room = newRoom('brawl');
  room.seed = 4;
  for (const name of ['A', 'B', 'C', 'D']) joinRoom(room, name);
  prepare(room);
  app.rooms.set(room.roomId, room);
  await page.goto(base + '/display?room=' + room.roomId + '&invite=' + room.accessToken);
  await page.locator('#center-message', { hasText: '準備開戰' }).waitFor();
  await page.locator('#sound').click();
  await page.waitForFunction(() => window.startedSamples.length > 0);
  const host = new WebSocket(base.replace('http:', 'ws:') + '/ws?role=host&room=' + room.roomId + '&token=' + room.hostToken);
  await once(host, 'open');
  host.send(JSON.stringify({ type: 'action', action: 'start' }));
  await page.locator('#result h3').waitFor({ timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('#result').hidden === false);
  const cues = await page.evaluate(files => window.identifySamples(files), files);
  const opening = ['three', 'two', 'one', 'go', 'shoot', 'launch'];
  assert.deepEqual(cues.filter(cue => opening.includes(cue)), opening, 'countdown and launch exactly once in order');
  const times = await page.evaluate(() => window.cueTimes);
  const hold = times[cues.indexOf('shoot')] - times[cues.indexOf('go')];
  assert.ok(hold >= 490 && hold <= 560, 'GO immediately leads into Shoot on the audio clock');
  const liveTiers = impactTiers.filter(tier => tier.some(name => cues.includes(name)));
  assert.ok(liveTiers.length >= 2, 'the seeded match uses more than one impact strength');
  assert.ok(!cues.some(name => ['wall', 'land', 'rail', 'stop', 'unknown'].includes(name)), 'legacy contact samples stayed silent');
  assert.ok(cues.includes('victory'), 'champion announcement played');
  const testedImpacts = await page.evaluate(async files => {
    const { createBattleAudio } = await import('/assets/battle-audio.js');
    const audio = createBattleAudio();
    await audio.enable();
    const first = window.startedSamples.length;
    for (const strength of [.1, .5, .9]) {
      for (let i = 0; i < 6; i++) {
        audio.impact(strength);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    return (await window.identifySamples(files)).slice(first);
  }, files);
  assert.equal(testedImpacts.length, 18, 'each spaced contact plays exactly one sample');
  for (const [index, tier] of impactTiers.entries()) {
    const played = testedImpacts.slice(index * 6, index * 6 + 6);
    assert.deepEqual(new Set(played.slice(0, 3)), new Set(tier), 'each strength cycles through all three recordings');
    assert.deepEqual(new Set(played.slice(3)), new Set(tier), 'the second cycle includes every recording again');
    assert.ok(played.every((name, i) => name !== played[i - 1]), 'consecutive impacts vary within a tier');
  }
  assert.deepEqual(errors, []);
  mkdirSync('.qa',{recursive:true});
  writeFileSync('.qa/sound-check-results.json',JSON.stringify({passed:true,decoded:files.length,cues:[...new Set(cues)],hold,impactTiers:liveTiers.length,rotationChecks:testedImpacts,errors},null,2));
  await page.screenshot({path:'.qa/integration-sound-result.png',fullPage:true});
  console.log('Decoded ' + files.length + ' sounds. Played on the projection: ' + [...new Set(cues)].join(', '));
} finally {
  await browser.close();
  await app.close();
  unlinkSync(path.join(dataDir, 'events.json'));
  rmdirSync(dataDir);
}
