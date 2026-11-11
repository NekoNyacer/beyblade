import { chromium } from 'playwright-core';
import { createApp } from '../server.mjs';
import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const output = path.resolve('.qa/host-tabs-proof');
mkdirSync(output, { recursive: true });
const app = createApp({ port: 0, host: '127.0.0.1', dataDir: mkdtempSync(path.join(output, 'event-')) });
await app.listen();
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync) });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('button', { name: '建立活動', exact: false }).click();
  await page.locator('#room-code').waitFor();
  await page.locator('#demo').click();
  await page.waitForFunction(() => document.querySelector('#player-count').textContent === '10');
  const panelCount = () => page.getByRole('tabpanel').count();
  assert.equal(await panelCount(), 1);
        assert.equal(await page.locator('#settings-panel a[href*="sound-lab"]').count(), 0);
  assert.equal(await page.locator('.wordmark img').getAttribute('alt'), 'CathayBlade');
  assert.equal(await page.locator('.fighter-speed').first().innerText().then(s => s.replace(/\s/g, '')), '0RPM');
  await page.getByRole('tab', { name: '選手', exact: true }).click();
  assert.equal(await page.locator('#roster .player-row').count(), 10);
  assert.ok(await page.locator('#roster').isVisible());
  assert.equal(await page.locator('#match-panel').isVisible(), false);
  await page.getByRole('tab', { name: '選手', exact: true }).press('ArrowRight');
  assert.equal(await page.locator('#tab-schedule').getAttribute('aria-selected'), 'true');
  await page.getByRole('tab', { name: '賽程', exact: true }).press('End');
  assert.ok(await page.locator('#switch-mode').isVisible());
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#open-test-page').click();
  const testPage = await popupPromise;
  await testPage.waitForURL('**/scenarios');
  assert.equal(await testPage.locator('h1').textContent(), '自由對戰測試');
  await testPage.locator('a[href="/#settings"]').first().click();
  await testPage.waitForSelector('#settings-panel:not([hidden])');
  await testPage.close();
  await page.locator('#switch-mode').selectOption('brawl');
  await page.locator('#change-mode').click();
  await page.waitForFunction(() => document.querySelector('#mode-label').textContent === '全員混戰');
  await page.locator('#switch-mode').selectOption('tournament');
  await page.locator('#change-mode').click();
  await page.waitForFunction(() => document.querySelector('#mode-label').textContent === '一對一淘汰賽');
  await page.screenshot({ path: path.join(output, 'settings-desktop.png'), fullPage: true });
  await page.locator('#tab-settings').press('Home');
  await page.locator('[data-action="prepare"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#schedule [data-match-id]').length === 5);
  await page.getByRole('tab', { name: '賽程', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#schedule .bracket-links path').length > 0);
  await page.screenshot({ path: path.join(output, 'schedule-desktop.png'), fullPage: true });
  await page.getByRole('tab', { name: '對戰', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#arena canvas').getBoundingClientRect().width > 0);
  const layouts = [];
  for (const width of [3440, 1920, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    const layout = await page.evaluate(() => {
      const brand = document.querySelector('.wordmark').getBoundingClientRect();
      const tabs = document.querySelector('.desk-nav').getBoundingClientRect();
      const main = document.querySelector('main').getBoundingClientRect();
      return { width: innerWidth, scroll: document.documentElement.scrollWidth, brandLeft: brand.left, tabsLeft: tabs.left, tabsRight: tabs.right, mainCenter: main.x + main.width / 2, bg: getComputedStyle(document.body).backgroundColor };
    });
    assert.ok(layout.scroll <= width, JSON.stringify(layout));
    assert.ok(Math.abs(layout.brandLeft - layout.tabsLeft) < 1, JSON.stringify(layout));
    assert.ok(Math.abs(layout.mainCenter - width / 2) < 1, JSON.stringify(layout));
    assert.equal(layout.bg, 'rgb(10, 14, 23)');
    layouts.push(layout);
    await page.screenshot({ path: path.join(output, `match-${width}.png`), fullPage: true });
    if (width === 390) {
      for (const name of ['選手', '賽程', '設定']) {
        await page.getByRole('tab', { name, exact: true }).click();
        assert.equal(await panelCount(), 1);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, `${name}-390.png`), fullPage: true });
      }
    }
  }
  assert.deepEqual(errors, []);
  const result = { passed: true, layouts, tabs: 4, keyboard: true, settingsModeChange: true, testPagePopup: true, bracketConnectorsAfterReveal: true, errors };
  writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await app.close();
}
