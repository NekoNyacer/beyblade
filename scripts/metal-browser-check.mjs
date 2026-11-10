import { chromium } from 'playwright-core';
import { WebSocket } from 'ws';
import { createApp } from '../server.mjs';
import { newRoom, joinRoom, pull } from '../game.mjs';
import { generateScenarios } from './generate-scenarios.mjs';
import { railConfigForCount, isRingOutAngle } from '../public/assets/rail-config.js';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Isolated integration QA: never contacts the operator's live room or browser profile.
assert.ok(existsSync('.qa/metal-source-baseline.json'), 'isolated copy baseline required');
mkdirSync('.qa', { recursive: true });
const app = createApp({ port: 0, dataDir: mkdtempSync(path.resolve('.qa', 'metal-check-')) });
await app.listen();
const base = `http://localhost:${app.server.address().port}`;
const executablePath = process.env.CHROME_PATH || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [], checks = [], recordings = [];
const captureOnly = process.argv.includes('--capture-only');
const noCapture = process.argv.includes('--no-capture');
let sockets = [];
async function check(name, run) {
  try { const detail = await run(); checks.push({ name, passed: true, detail }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, passed: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
  writeFileSync('.qa/metal-browser-results.json', JSON.stringify({ passed: checks.every(c => c.passed), checks, errors }, null, 2));
}
async function waitFor(predicate, ms = 10000) {
  const until = Date.now() + ms;
  while (!predicate()) { if (Date.now() > until) throw Error('Node condition timed out'); await new Promise(r => setTimeout(r, 40)); }
}
async function make(viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, reducedMotion });
  await context.addInitScript(() => {
    window.__qaEvents = []; window.__qaAudio = []; window.__qaRenders = []; window.__qaReplay = []; window.__qaStorage = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) { window.__qaStorage++; return setItem.apply(this, args); };
    for (const type of [OscillatorNode, AudioBufferSourceNode]) {
      const start = type.prototype.start;
      type.prototype.start = function (...args) { window.__qaAudio.push(performance.now()); return start.apply(this, args); };
    }
    window.__qaHook = arena => {
      window.__qaArena = arena;
      for (const name of ['onImpact', 'onRail', 'onRingout', 'onOut']) {
        let callback;
        Object.defineProperty(arena, name, { configurable: true, get() { return event => {
          const before = window.__qaAudio.length;
          const played = callback?.(event);
          window.__qaEvents.push({ ...event, callback: name, observedMs: performance.now(), played: Boolean(played), audioSources: window.__qaAudio.length - before, replaying: Boolean(arena.replaying) });
          return played;
        }; }, set(value) { callback = value; } });
      }
      let renderer;
      Object.defineProperty(arena, 'renderer', { configurable: true, get() { return renderer; }, set(value) {
        renderer = value;
        if (value?.render) { const render = value.render.bind(value); value.render = (...args) => { window.__qaRenders.push(performance.now()); const replaying = Boolean(arena.replaying); if (window.__qaReplay.at(-1)?.replaying !== replaying) window.__qaReplay.push({ at: performance.now(), replaying, resultHidden: document.querySelector('#result')?.hidden }); if (window.__qaRenders.length > 5000) window.__qaRenders.shift(); return render(...args); }; }
      } });
    };
  });
  await context.route('**/assets/arena.js', async route => {
    const response = await route.fetch(), original = await response.text();
    const body = original.replace(/constructor\(container\)\s*\{/, 'constructor(container) { window.__qaHook(this);');
    assert.notEqual(body, original, 'Arena constructor QA hook found');
    await route.fulfill({ response, body });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({ page: page.url(), error: error.message }));
  return page;
}
async function scene(page, name) {
  await page.goto(`${base}/scenarios?scene=${name}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#scene-frame')?.contentWindow.__qaArena?.renderer, null, { timeout: 15000 });
  return page.frames().find(f => f.url().includes('/display?'));
}
async function pose(frame) {
  return frame.evaluate(() => {
    const arena = window.__qaArena, objects = [];
    arena.scene.traverse(o => objects.push({ position: o.position.toArray(), rotation: o.rotation.toArray(), scale: o.scale.toArray(), visible: o.visible, opacity: Array.isArray(o.material) ? o.material.map(m => m.opacity) : o.material?.opacity }));
    return { clock: arena.clock, objects, camera: arena.camera.position.toArray(), timer: document.querySelector('#round-label').textContent, callbacks: window.__qaEvents.length };
  });
}
async function noOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow: ${page.url()}`); }
async function record(frame, name, duration = 10000) {
  const capture = await frame.evaluate(async duration => {
    const canvas = document.querySelector('canvas'), from = performance.now();
    if (!canvas.captureStream || !window.MediaRecorder) throw Error('Native canvas MediaRecorder unavailable');
    const stream = canvas.captureStream(30), chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: 3500000 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start(); await new Promise(resolve => setTimeout(resolve, duration)); recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
    const to = performance.now(), events = window.__qaEvents.filter(e => e.observedMs >= from && e.observedMs <= to);
    const renders = window.__qaRenders.filter(t => t >= from && t <= to), intervals = renders.slice(1).map((t, i) => t - renders[i]).sort((a, b) => a - b);
    const gl = window.__qaArena.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { from, to, events, replay: window.__qaReplay, renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER), renderCount: renders.length, medianRenderIntervalMs: intervals[Math.floor(intervals.length / 2)], p95RenderIntervalMs: intervals[Math.floor(intervals.length * .95)], width: canvas.width, height: canvas.height, bytes: Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())) };
  }, duration);
  assert.ok(capture.bytes.length > 10000, 'nonempty actual 3D recording');
  const file = `.qa/metal-${name}.webm`;
  writeFileSync(file, Buffer.from(capture.bytes));
  const result = { name, file, durationMs: capture.to - capture.from, ...capture, byteLength: capture.bytes.length }; delete result.bytes;
  writeFileSync(`.qa/metal-${name}-capture.json`, JSON.stringify(result, null, 2)); recordings.push(result);
  return result;
}
try {
  await check('Serialized preview uses production physics and three collision exits', async () => {
    const saved = JSON.parse(readFileSync('public/assets/scenario-data.json', 'utf8'));
    assert.equal(JSON.stringify(saved), JSON.stringify(generateScenarios()), 'fixture equals production generator output');
    const counts = [];
    for (const [name, count] of [['duel', 2], ['brawl', 10], ['dense', 16]]) {
      const clip = saved[name], rail = railConfigForCount(count), ringouts = [];
      assert.equal(rail.ringOutAngles.length, 3); assert.equal(rail.exitAngles.length, 6);
      for (const frame of clip.frames) {
        assert.equal(frame.tops.length, count); assert.equal(frame.arenaRadius, rail.arenaRadius);
        for (const event of frame.events.filter(e => e.type === 'ringout')) {
          const top = frame.tops.find(t => t.id === event.id);
          assert.equal(top.outReason, 'ringout'); assert.equal(top.alive, false);
          assert.ok(top.lastHitTime !== null && event.t - top.lastHitTime < 1.5, 'ringout follows genuine collision');
          assert.ok(isRingOutAngle(Math.atan2(event.z, event.x)), 'exit is one of three metal rim gaps'); ringouts.push(event);
        }
      }
      counts.push({ name, count, frames: clip.frames.length, ringouts: ringouts.length, radius: rail.arenaRadius });
    }
    return counts;
  });
  if (!captureOnly) await check('Live assembly, reconnect, 10-player SHOOT gate and winner', async () => {
    const room = newRoom('brawl'); room.seed = 76017;
    for (let i = 0; i < 9; i++) joinRoom(room, `QA Player ${i + 1}`);
    app.rooms.set(room.roomId, room);
    const phone = await make({ width: 390, height: 844 });
    await phone.goto(`${base}/play?room=${room.roomId}&invite=${room.accessToken}`);
    await phone.locator('#name').fill('組裝測試選手'); await phone.locator('#join-button').click(); await phone.locator('#assembly').waitFor();
    await phone.locator('.part-row').nth(0).locator('button').nth(1).click();
    await phone.locator('.part-row').nth(2).locator('button').nth(1).click();
    await noOverflow(phone); await phone.screenshot({ path: '.qa/metal-phone-assembly.png', fullPage: true });
    await phone.locator('#confirm-parts').click(); await phone.locator('#assembly').waitFor({ state: 'hidden' });
    const player = room.players.at(-1); assert.deepEqual(player.parts, { blade: 1, ratchet: 0, bit: 1 });
    await phone.locator('#edit-parts').click(); await phone.locator('#confirm-parts').click(); await phone.locator('#assembly').waitFor({ state: 'hidden' });
    await phone.reload(); await phone.locator('#player-panel').waitFor(); await phone.waitForFunction(() => document.querySelector('#connection').classList.contains('online'));
    assert.equal(await phone.locator('#assembly').isVisible(), false); assert.equal(room.players.length, 10);
    const display = await make({ width: 1920, height: 1080 });
    await display.goto(`${base}/display?room=${room.roomId}&invite=${room.accessToken}`); await display.waitForFunction(() => window.__qaArena?.renderer);
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/ws?${new URLSearchParams({ room: room.roomId, role: 'host', token: room.hostToken })}`); sockets.push(ws);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const action = action => ws.send(JSON.stringify({ type: 'action', action }));
    action('prepare'); await waitFor(() => room.phase === 'ready');
    assert.equal(await phone.locator('#neutral').isDisabled(), true);
    assert.throws(() => pull(room, player.id, room.round.id, .5));
    await display.evaluate(() => { window.__qaCues = []; window.__qaCueObserver = new MutationObserver(() => { const text = document.querySelector('#center-message').textContent; if (window.__qaCues.at(-1)?.text !== text) window.__qaCues.push({ text, at: performance.now() }); }); window.__qaCueObserver.observe(document.querySelector('#center-message'), { subtree: true, childList: true, characterData: true }); });
    action('start'); await waitFor(() => room.phase === 'countdown');
    await phone.waitForTimeout(3400); assert.equal(await phone.locator('#neutral').isDisabled(), true); assert.throws(() => pull(room, player.id, room.round.id, .5));
    await phone.waitForFunction(() => !document.querySelector('#neutral').disabled, null, { timeout: 5000 });
    await noOverflow(phone); await phone.screenshot({ path: '.qa/metal-phone-shoot.png', fullPage: true });
    await phone.locator('#neutral').click(); await waitFor(() => room.round.pulledIds.includes(player.id));
    assert.equal(await phone.locator('#neutral').isDisabled(), true); assert.throws(() => pull(room, player.id, room.round.id, .5));
    await phone.reload(); await phone.locator('#player-panel').waitFor(); assert.equal(room.players.length, 10);
    await waitFor(() => room.phase === 'running', 12000);
    await display.waitForFunction(() => [...document.querySelectorAll('.display-player .status')].some(e => e.textContent.includes('RPM')));
    assert.equal(await display.locator('.energy-track').count(), 0);
    const cues = await display.evaluate(() => window.__qaCues);
    for (const text of ['3', '2', '1']) assert.ok(cues.some(c => c.text === text), `countdown ${text}`);
    assert.ok(cues.some(c => c.text.startsWith('GO'))); assert.ok(cues.some(c => c.text.startsWith('SHOOT')));
    await display.screenshot({ path: '.qa/metal-live-battle.png' });
    await waitFor(() => ['result', 'finished'].includes(room.phase), 70000);
    await display.locator('#result:not([hidden])').waitFor({ timeout: 15000 });
    assert.equal(room.round.winnerId, room.battle.winnerId); assert.ok(await display.locator('#result h3').textContent());
    ws.close(); await phone.context().close(); await display.context().close();
    return { players: 10, assemblyPersisted: true, reconnectNoDuplicate: true, cues, onePullOnly: true, winnerMatchesSimulation: true };
  });
  if (!captureOnly) await check('16-player long names and result fit', async () => {
    const page = await make({ width: 1920, height: 1080 });
    await page.goto(`${base}/display?preview=dense`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('.display-player').length === 16);
    const overflows = await page.locator('.display-player').evaluateAll(els => els.filter(e => { const r = e.getBoundingClientRect(); return r.top < 0 || r.bottom > innerHeight || r.right > innerWidth; }).length);
    assert.equal(overflows, 0); await page.screenshot({ path: '.qa/metal-display16.png' });
    await page.goto(`${base}/display?preview=result`, { waitUntil: 'networkidle' }); await page.locator('#result:not([hidden])').waitFor();
    assert.equal(await page.locator('#result').evaluate(e => e.scrollHeight <= e.clientHeight), true);
    await page.screenshot({ path: '.qa/metal-result.png' }); await page.context().close(); return { players: 16, overflow: false };
  });
  for (const name of ['duel', 'battle']) await check(`${name}: actual renderer, rail/audio events and complete pause`, async () => {
    const page = await make({ width: 1440, height: 1000 }), requests = [], ws = [];
    page.context().on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) requests.push(r.url()); });
    page.on('websocket', s => ws.push(s.url()));
    let frame = await scene(page, name); await frame.locator('#sound').click();
    assert.equal(await frame.locator('.display-player').count(), name === 'duel' ? 2 : 10);
    const capture = noCapture ? (await page.waitForTimeout(10000), await frame.evaluate(() => ({ events: window.__qaEvents, replay: window.__qaReplay }))) : await Promise.all([
      record(frame, name),
      name === 'battle' ? (async () => { await frame.waitForFunction(() => window.__qaArena.replaying, null, { timeout: 15000 }); assert.equal(await frame.locator('#result').isVisible(), false); await page.screenshot({ path: '.qa/metal-ringout-desktop.png', fullPage: true }); })() : Promise.resolve()
    ]).then(results => results[0]);
    if (name === 'battle') {
      assert.ok(capture.events.some(e => e.type === 'ringout'), 'actual collision-driven brawl ringout callback');
      assert.ok(capture.replay.some(r => r.replaying && r.resultHidden), 'results hidden during natural slow-motion replay');
    }
    const events = capture.events, rails = events.filter(e => e.type === 'rail'), hits = events.filter(e => e.type === 'hit');
    assert.ok(rails.some(e => e.phase === 'enter'), 'rail entry observed'); assert.ok(rails.some(e => e.phase === 'exit'), 'rail release observed'); assert.ok(hits.length, 'actual impact observed');
    assert.ok(events.every(e => typeof e.eventId === 'string'), 'stable event IDs');
    assert.equal(new Set(events.map(e => e.eventId)).size, events.length, 'once-only callbacks');
    assert.ok(rails.some(e => e.audioSources > 0), 'rail sound scheduled from event'); assert.ok(hits.some(e => e.audioSources > 0), 'hit sound scheduled from event');
    // Native video-byte transfer can outlast a duel. Start fresh before testing animation resume.
    await page.locator('#restart').click();
    await page.waitForFunction(() => document.querySelector('#scene-frame')?.contentWindow.__qaArena?.playbackFrame?.t > .2);
    frame = page.frames().find(f => f.url().includes('/display?'));
    const activeBeforePause = await frame.evaluate(() => ({ t: window.__qaArena.playbackFrame?.t, done: window.__qaArena.playbackFrame?.done, paused: window.__qaArena.paused }));
    assert.equal(activeBeforePause.done, false, 'pause/resume tested during an active battle');
    await page.locator('#play-pause').click(); await page.waitForTimeout(120); const frozen = await pose(frame); await page.waitForTimeout(400); assert.deepEqual(await pose(frame), frozen, 'all geometry, effects, timer and callbacks freeze');
    await page.screenshot({ path: `.qa/metal-${name}-desktop.png`, fullPage: true });
    await page.locator('#play-pause').click(); await page.waitForTimeout(500); assert.notDeepEqual(await pose(frame), frozen, 'playback resumes');
    await frame.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(120); const hidden = await pose(frame); await page.waitForTimeout(400); assert.deepEqual(await pose(frame), hidden, 'synthetic hidden-document freezes renderer');
    await frame.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(500); assert.notDeepEqual(await pose(frame), hidden, 'visibility resumes');
    await page.locator('#restart').click(); await page.waitForTimeout(500);
    const replayFrame = page.frames().find(f => f.url().includes('/display?'));
    assert.ok(await replayFrame.evaluate(() => window.__qaArena.clock < 3), 'replay reset');
    assert.equal(await replayFrame.evaluate(() => window.__qaStorage), 0); assert.deepEqual(requests, []); assert.deepEqual(ws, []);
    const result = { activeBeforePause, railEvents: rails.length, impacts: hits.length, releasePorts: [...new Set(rails.filter(e => e.phase === 'exit').map(e => e.exitIndex))], pause: true, syntheticVisibility: true, onceOnlyAudioCallbacks: true, noPreviewStateWrites: true };
    await page.context().close(); return result;
  });
  if (!captureOnly) await check('Mobile gallery and reduced motion', async () => {
    const phone = await make({ width: 390, height: 844 }); await scene(phone, 'battle'); await noOverflow(phone);
    await phone.screenshot({ path: '.qa/metal-gallery-mobile.png', fullPage: true }); await phone.context().close();
    const reduced = await make({ width: 1440, height: 900 }, 'reduce');
    await reduced.goto(`${base}/display?preview=battle`, { waitUntil: 'networkidle' }); await reduced.waitForFunction(() => window.__qaArena?.renderer);
    assert.equal(await reduced.evaluate(() => window.__qaArena.reduced), true);
    await reduced.waitForTimeout(800); assert.equal(await reduced.evaluate(() => [...window.__qaArena.tops.values()].some(t => t.trail?.visible)), false);
    await reduced.screenshot({ path: '.qa/metal-reduced.png' }); await reduced.context().close(); return { mobileOverflow: false, reducedTrails: false };
  });
  if (!noCapture && recordings.length >= 2) await check('Combined authentic review reel', async () => {
    const page = await browser.newPage();
    await page.route('**/qa-metal-*.webm', route => { const name = route.request().url().includes('duel') ? 'duel' : route.request().url().includes('ringout') ? 'ringout' : 'battle'; return route.fulfill({ contentType: 'video/webm', body: readFileSync(`.qa/metal-${name}.webm`) }); });
    await page.goto(base + '/healthz');
    const sources = recordings.map(r => ({ name: r.name, duration: r.name === 'ringout' ? 7000 : 10000 }));
    const reel = await page.evaluate(async sources => {
      const videos = await Promise.all(sources.map(async ({ name }) => { const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.src = `/qa-metal-${name}.webm`; await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; }); return video; }));
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 800;
      const context = canvas.getContext('2d'), stream = canvas.captureStream(30), chunks = [], recorder = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: 4000000 });
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      let index = 0, drawing = true;
      function draw() { const video = videos[Math.min(index, videos.length - 1)], scale = Math.min(1280 / video.videoWidth, 736 / video.videoHeight); context.fillStyle = '#101728'; context.fillRect(0, 0, 1280, 800); context.drawImage(video, (1280 - video.videoWidth * scale) / 2, 64 + (736 - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale); context.fillStyle = '#ffcf56'; context.font = 'bold 26px sans-serif'; context.fillText(index === 0 ? 'METAL RAIL / 1v1 DUEL' : index === 1 ? 'METAL RAIL / 10 PLAYER BRAWL' : 'METAL RAIL / COLLISION RING-OUT REPLAY', 24, 41); if (drawing) requestAnimationFrame(draw); }
      draw(); recorder.start();
      for (index = 0; index < videos.length; index++) { await videos[index].play(); await new Promise(resolve => setTimeout(resolve, sources[index].duration)); videos[index].pause(); }
      drawing = false; recorder.stop(); await stopped; stream.getTracks().forEach(t => t.stop()); return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    }, sources);
    writeFileSync('.qa/metal-rail-review.webm', Buffer.from(reel)); await page.close(); assert.ok(reel.length > 10000);
    return { file: '.qa/metal-rail-review.webm', bytes: reel.length, durationSeconds: sources.reduce((sum, source) => sum + source.duration, 0) / 1000, audio: 'Silent actual canvas recordings; procedural audio scheduling checked separately', performance: 'Headless Chromium rendering only, not target hardware FPS' };
  });
  await check('Winner remains visible when WebGL is unavailable', async () => {
    const page = await make({ width: 1440, height: 900 });
    await page.context().addInitScript(() => { const context = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : context.call(this, type, ...args); }; });
    await page.goto(`${base}/display?preview=result`, { waitUntil: 'networkidle' });
    await page.locator('.webgl-error').waitFor(); await page.locator('#result:not([hidden])').waitFor({ timeout: 5000 });
    assert.ok(await page.locator('#result h3').textContent()); await page.context().close(); return { noWebGL: true, winnerVisible: true };
  });
  await check('No uncaught page errors', async () => { assert.deepEqual(errors, []); return { errors: 0 }; });
} finally {
  for (const socket of sockets) socket.close();
  await browser.close(); await app.close();
  const report = { passed: checks.every(c => c.passed), checks, errors, recordings: recordings.map(({ events, ...rest }) => rest), limits: ['Fresh isolated headless Chromium; no operator browser/profile or port 3210 touched', 'Visibility behavior tested with synthetic document visibility event', 'Native canvas videos are silent; event-linked procedural audio scheduling is separately instrumented', 'No claim of real projector/mobile hardware frame rate or subjective speaker quality'] };
  writeFileSync('.qa/metal-browser-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
}
