import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { joinRoom, newRoom, prepare } from '../game.mjs';
import { createApp } from '../server.mjs';

mkdirSync('.qa', { recursive: true });
const app = createApp({ port: 0, dataDir: mkdtempSync(path.resolve('.qa', 'sound-')) });
const executablePath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const files = readdirSync(new URL('../public/assets/sounds/', import.meta.url)).filter(name => name.endsWith('.wav')).concat(['../audience/cheer-short.wav', '../audience/cheer-medium.wav', '../audience/applause.wav']);
const impactNames = files.map(file => file.split('/').at(-1).slice(0, -4)).filter(name => /^(hit|heavyHit|ping-)/.test(name));
try {
  await app.listen();
  const base = 'http://localhost:' + app.server.address().port;
  const room = newRoom('brawl');
  room.seed = 4;
  for (const name of ['A', 'B', 'C', 'D']) joinRoom(room, name);
  prepare(room);
  app.rooms.set(room.roomId, room);
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
  await context.addInitScript(() => {
    const signature = buffer => {
      const pcm = buffer.getChannelData(0);
      return [buffer.length, ...[.07, .23, .47, .69].map(t => pcm[Math.floor(pcm.length * t)])].join(',');
    };
    window.matchStates = [];
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          const message = JSON.parse(event.data);
          if(message.type !== 'state')return;
          window.matchStates.push({phase:message.state.phase,serverTime:message.state.serverTime,receivedAt:Date.now(),startsAt:message.state.round?.startsAt,countdownAt:message.state.round?.countdownAt});
        });
      }
    };
    window.startedSamples = [];
    window.cueTimes = [];
    window.cueDetails = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const result = start.apply(this, args);
      window.startedSamples.push(signature(this.buffer));
      window.cueTimes.push(performance.now()+Math.max(0,(args[0]||0)-this.context.currentTime)*1000);
      window.cueDetails.push({time:performance.now()+Math.max(0,(args[0]||0)-this.context.currentTime)*1000,wallTime:Date.now(),audioTime:this.context.currentTime,when:args[0]||0,offset:args[1]||0,hidden:document.hidden});
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
  const host = await context.newPage();
  host.on('pageerror', error => errors.push(error.message));
  await host.goto(base);
  await host.evaluate(entry => localStorage.setItem('beyblade-host', JSON.stringify(entry)), {
    roomId: room.roomId, hostToken: room.hostToken, accessToken: room.accessToken,
  });
  await host.reload();
  await host.locator('[data-action="start"]').waitFor();
  const popup = host.waitForEvent('popup');
  await host.locator('#open-display').click();
  const display = await popup;
  display.on('pageerror', error => errors.push(error.message));
  await display.locator('#center-message', { hasText: '準備開戰' }).waitFor();
  for (const page of [host, display]) {
    assert.equal(await page.evaluate(() => window.startedSamples.length), 0, 'silent before enabling audio');
    await page.locator('#sound').click();
    await page.locator('#sound', { hasText: '已開啟' }).waitFor();
  }
  await host.locator('[data-action="start"]').click();
  await display.locator('#result h3').waitFor({ timeout: 60000 });
  await display.waitForFunction(() => !document.querySelector('#result').hidden);
  const report = {};
  const opening = ['three', 'two', 'one', 'go', 'shoot', 'launch'];
  for (const [name, page] of [['host', host], ['display', display]]) {
    await page.waitForFunction(async files => (await window.identifySamples(files)).includes('victory'), files, {timeout:90000});
    const cues = await page.evaluate(files => window.identifySamples(files), files);
    const details = await page.evaluate(() => window.cueDetails);
    const goIndex = cues.indexOf('go'), shootIndex = cues.indexOf('shoot');
    const rawHold = details[shootIndex]?.time - details[goIndex]?.time;
    const correctedHold = rawHold + (details[goIndex]?.offset || 0) * 1000;
    const states = await page.evaluate(() => window.matchStates);
    const diagnostic = { name, states, rawHold, correctedHold, cues: cues.map((cue,i)=>({cue,...details[i]})), errors };
    writeFileSync('.qa/formal-audio-timing-' + runId + '-' + name + '.json', JSON.stringify(diagnostic,null,2));
    console.log(JSON.stringify({name,rawHold,correctedHold,goOffset:details[goIndex]?.offset}));
    assert.deepEqual(cues.filter(cue => opening.includes(cue)), opening, name + ': countdown and launch once in order');
    assert.ok(rawHold>=490 && rawHold<=560, name + ': GO immediately leads into SHOOT (' + rawHold + 'ms)');
    const launchGap=details[cues.indexOf('launch')].time-details[shootIndex].time;
    assert.ok(launchGap>=900 && launchGap<1700,name+': default pulls enter together after the 1.2s window ('+launchGap+'ms)');
    assert.ok(cues.some(cue => impactNames.includes(cue)), name + ': live collisions play metal samples');
    assert.ok(cues.includes('out'), name + ': elimination plays a sound');
    assert.equal(cues.filter(cue => cue === 'victory').length, 1, name + ': victory plays once');
    assert.equal(cues.filter(cue => cue === 'cheer-short').length, 1, name + ': live entry cheers once');
    assert.equal(cues.filter(cue => cue === 'cheer-medium').length, 1, name + ': champion cheers once');
    const launchCheerGap = details[cues.indexOf('cheer-short')].time - details[cues.indexOf('launch')].time;
    const resultCheerGap = details[cues.indexOf('cheer-medium')].time - details[cues.indexOf('victory')].time;
    assert.ok(launchCheerGap >= 100 && launchCheerGap <= 160, name + ': crowd follows synchronized arena entry');
    assert.ok(resultCheerGap >= 630 && resultCheerGap <= 690, name + ': crowd stays behind the result call');
    assert.ok(!cues.includes('unknown'), name + ': every source uses a bundled sound');
    report[name] = [...new Set(cues)];
  }
  // Exercise late reconnect cues, deferred results and later rounds using real decoded audio.
  const edgeCues = await host.evaluate(async files => {
    const {createMatchAudio}=await import('/assets/match-audio.js');
    const sound=createMatchAudio();await sound.enable();const first=window.startedSamples.length;
    const state={phase:'running',round:{id:'a',shootAt:10000,startsAt:11200}};
    sound.updateClock(state,11900);
    state.phase='result';sound.updateClock(state,13000,true);sound.updateClock(state,13000);sound.updateClock(state,13050);
    state.phase='countdown';state.round={id:'b',shootAt:20000,startsAt:21200};sound.updateClock(state,19400);sound.updateClock(state,19450);
    state.phase='shoot';sound.updateClock(state,20100);
    state.phase='running';sound.updateClock(state,21200);sound.updateClock(state,21250);
    state.phase='finished';state.championId='winner';sound.updateClock(state,22000);sound.updateClock(state,22100);
    return (await window.identifySamples(files)).slice(first);
  },files);
  assert.deepEqual(edgeCues,['finish','one','go','shoot','launch','cheer-short','victory','cheer-medium']);
  assert.deepEqual(errors, []);
  report.passed = true;
  report.reconnectDeferredResultAndNextRound = true;
  writeFileSync('.qa/sound-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await app.close();
}
