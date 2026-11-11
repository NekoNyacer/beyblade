import { chromium } from 'playwright-core';
import { createApp } from '../server.mjs';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = path.resolve('.qa/logo-transparent');
mkdirSync(out, { recursive: true });
const app = createApp({ port: 0, host: '127.0.0.1', dataDir: mkdtempSync(path.join(out, 'event-')) });
await app.listen();
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync) });
const errors = [], report = { layouts: [] };
try {
const lightSource = readFileSync('public/assets/cathayblade-on-light.svg', 'utf8');
const darkSource = readFileSync('public/assets/cathayblade.svg', 'utf8');
assert.equal(darkSource.replaceAll('#f4f6fa', '#123d36').replaceAll('#56d889', '#087d40'), lightSource, 'preserve original geometry, embedded tree pixels and transparent canvas');
assert.ok(readFileSync('public/assets/stadium.js', 'utf8').includes("load('/assets/cathayblade-on-light.svg')"), 'light bowl uses the dark-green variant');
const contrast = (a, b) => {
  const luminance = hex => hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
report.contrast = { whiteOnDark: contrast('f4f6fa', '233443'), greenOnDark: contrast('56d889', '233443'), cathayOnBowl: contrast('123d36', 'e5e8ef'), bladeOnBowl: contrast('087d40', 'e5e8ef') };
assert.ok(report.contrast.whiteOnDark >= 4.5 && report.contrast.greenOnDark >= 4.5, 'UI wordmark colors meet 4.5:1');
assert.ok(report.contrast.cathayOnBowl >= 3 && report.contrast.bladeOnBowl >= 3, 'preserved floor artwork meets 3:1 for its large graphic');
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/healthz');
  report.alpha = await page.evaluate(async () => {
    const data = [];
    for (const file of ['cathayblade.svg', 'cathayblade-on-light.svg']) {
      const img = new Image(); img.src = '/assets/' + file; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 248;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 1600, 248);
      data.push(ctx.getImageData(0, 0, 1600, 248).data);
    }
    let clear = 0, opaque = 0, alphaDifferences = 0, treeDifferences = 0, boundaryOpaque = 0;
    for (let y = 0; y < 248; y++) for (let x = 0; x < 1600; x++) {
      const i = (y * 1600 + x) * 4;
      if (data[0][i+3] === 0) clear++;
      if (data[0][i+3] === 255) opaque++;
      if (data[0][i+3] !== data[1][i+3]) alphaDifferences++;
      if (x < 288 && [0,1,2,3].some(c => data[0][i+c] !== data[1][i+c])) treeDifferences++;
      if ((x === 0 || x === 1599 || y === 0 || y === 247) && data[0][i+3] !== 0) boundaryOpaque++;
    }
    return { clearFraction: clear/(1600*248), opaque, alphaDifferences, treeDifferences, boundaryOpaque };
  });
  assert.ok(report.alpha.clearFraction > .5 && report.alpha.opaque > 10000);
  assert.equal(report.alpha.alphaDifferences, 0); assert.equal(report.alpha.treeDifferences, 0); assert.equal(report.alpha.boundaryOpaque, 0);
  await page.setContent(`<html lang="en"><meta charset="utf-8"><style>body{margin:0;background:#111a22;font:16px system-ui;color:#f4f6fa}section{padding:36px 48px;display:flex;align-items:center;justify-content:space-between}img{width:440px;height:auto}p{margin:0;font-weight:600}</style><section style="background:#0c151d"><p>Dark broadcast interface</p><img src="${base}/assets/cathayblade.svg" alt="CathayBlade"></section><section style="background:#233443"><p>Steel-blue interface</p><img src="${base}/assets/cathayblade.svg" alt="CathayBlade"></section><section style="background:#e5e8ef;color:#123d36"><p>Light arena floor</p><img src="${base}/assets/cathayblade-on-light.svg" alt="CathayBlade"></section></html>`);
  await page.setViewportSize({ width: 1080, height: 450 });
  await page.locator('img').evaluateAll(images => Promise.all(images.map(i => i.decode())));
  await page.screenshot({ path: path.join(out, 'logo-variants.png'), fullPage: true });

  for (const [route, name] of [['/', 'host'], ['/guide','guide'], ['/display?preview=rail','display'], ['/scenarios','scenarios'], ['/scenarios-diagnostics.html','diagnostics'], ['/pull-test','pull-test'], ['/launch-test','launch-test'], ['/play','phone'], ['/pull-phone','pull-phone']]) {
    for (const [width, height] of [[1920,1080],[390,844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base + route);
      await page.locator('.broadcast-brand img').first().waitFor({state:'attached'});
      await page.locator('.broadcast-brand img').evaluateAll(images => Promise.all(images.map(i => i.decode())));
      if (name === 'host') {
        if (await page.getByRole('button', { name: '建立活動', exact: false }).isVisible()) await page.getByRole('button', { name: '建立活動', exact: false }).click();
        await page.getByRole('tab', { name: '設定', exact: true }).click();
      }
      const logos = await page.locator('.broadcast-brand img').evaluateAll(images => images.map(img => {
        const style = getComputedStyle(img), r = img.getBoundingClientRect();
        return { loaded: img.complete && img.naturalWidth > 0, background: style.backgroundColor, padding: style.padding, visible: r.width > 0 && r.height > 0, fits: r.width === 0 || (r.left >= -1 && r.right <= innerWidth + 1), alt: img.alt };
      }));
      assert.ok(logos.every(l => l.loaded && l.background === 'rgba(0, 0, 0, 0)' && l.padding === '0px' && l.fits && l.alt === 'CathayBlade'), JSON.stringify({ route, width, logos }));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `${route} at ${width}px must not overflow`);
      report.layouts.push({ route, width, logos: logos.length, visible: logos.filter(l => l.visible).length, overflow });
      if (['host','scenarios','display','phone'].includes(name)) await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
    }
  }
  assert.deepEqual(errors, []); report.passed = true;
} finally {
  await browser.close(); await app.close(); report.errors = errors;
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
