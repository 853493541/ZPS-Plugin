import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// This checks renderer behavior at the studio IPC boundary. Native download,
// dataset guards and silent installer arguments have separate native tests.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:4183';
const errors = [];
let dialogs = 0;
await fs.mkdir('artifacts', { recursive: true });
async function scenario(initial, test, { visible = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 1050, height: 760 } });
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  // Keep polling deterministic: tests explicitly send window focus to refresh.
  await page.clock.install({ time: new Date('2026-11-10T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-10T00:01:00Z'));
  await page.addInitScript(initial => {
    const clone = value => JSON.parse(JSON.stringify(value));
    const model = window.updateTest = {
      state: initial, calls: [], holdStatus: false, holdInstall: false,
      statusHeld: false, installHeld: false, checkResult: { status: 'current' },
    };
    window.studio = {
      samples: async () => [],
      updates: async action => {
        model.calls.push(action);
        if (action === 'status' && model.holdStatus) {
          model.holdStatus = false;
          const old = clone(model.state);
          model.statusHeld = true;
          return new Promise(resolve => { model.releaseStatus = () => { model.statusHeld = false; resolve(old); }; });
        }
        if (action === 'check') model.state = clone(model.checkResult);
        if (action === 'install') {
          if (model.nextInstall) model.state = clone(model.nextInstall);
          else model.state = { ...model.state, installRequested: true };
          if (model.holdInstall) {
            model.installHeld = true;
            return new Promise(resolve => { model.releaseInstall = () => { model.installHeld = false; resolve(clone(model.state)); }; });
          }
        }
        return clone(model.state);
      },
    };
  }, initial);
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.updateTest.calls.includes('status'));
    if (visible) await page.locator('#update-banner').waitFor();
    await test(page);
    assert.equal(await page.locator('dialog[open]').count(), 0, 'updates must remain inline');
    assert.equal(dialogs, 0, 'updates must not create native dialogs');
  } finally { await page.close(); }
}
const button = page => page.locator('#update-restart');
const message = page => page.locator('#update-message');
const installs = page => page.evaluate(() => window.updateTest.calls.filter(action => action === 'install').length);
async function pending(page) {
  await page.waitForFunction(() => document.querySelector('#update-restart').disabled);
  assert.equal(await button(page).innerText(), '正在重启…');
}
async function refresh(page, state) {
  await page.evaluate(state => { window.updateTest.state = state; window.dispatchEvent(new Event('focus')); }, state);
}
const hidden = page => page.locator('#update-banner').isHidden();
try {
  for (const state of [{ status: 'available', version: '0.1.5' }, { status: 'downloading', version: '0.1.5', progress: 35 }, { status: 'checking' }, { status: 'current' }, { status: 'unavailable' }, { status: 'error', message: '网络中断' }, { status: 'error', version: '0.1.5', message: '下载失败' }]) {
    await scenario(state, async page => {
      await page.clock.runFor(50);
      assert.equal(await hidden(page), true, `${state.status} shows nothing until the download is ready`);
      assert.equal(await page.locator('.sidebar button', { hasText: /检查更新|反馈问题/ }).count(), 0, 'manual check and report buttons are gone');
    }, { visible: false });
  }
  console.log('PASS nothing shows while checking, downloading or after a background error');

  await scenario({ status: 'downloading', version: '0.1.5', progress: 70 }, async page => {
    await page.clock.runFor(50);
    assert.equal(await hidden(page), true);
    await refresh(page, { status: 'ready', version: '0.1.5' });
    await page.locator('#update-banner').waitFor();
    assert.equal(await button(page).innerText(), '重启更新');
    assert.equal(await message(page).isHidden(), true, 'no status sentence');
    assert.equal((await page.locator('#update-banner').innerText()).trim(), '重启更新', 'the notice is only the button');
    assert.equal(await button(page).getAttribute('title'), '新版本 0.1.5');
    const bounds = await page.locator('#update-banner').boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 1050 && bounds.y + bounds.height <= 760);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false, 'compact window must not overflow');
    await page.screenshot({ path: 'artifacts/one-click-update.png' });
    await button(page).focus();
    await button(page).press('Enter');
    await pending(page);
    await button(page).evaluate(node => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.equal(await installs(page), 1, 'one click restarts; duplicates are ignored');
   }, { visible: false });
  console.log('PASS silent download, single 重启更新 button appears when ready, keyboard restart, compact layout');

  await scenario({ status: 'ready', version: '0.1.5' }, async page => {
    await page.evaluate(() => { window.updateTest.holdInstall = true; });
    await button(page).click();
    await page.waitForFunction(() => window.updateTest.installHeld);
    await button(page).evaluate(node => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.equal(await installs(page), 1, 'in-flight restart must be single flight');
    await page.evaluate(() => window.updateTest.releaseInstall());
    await pending(page);
    assert.equal(await installs(page), 1);
  });
  console.log('PASS in-flight restart is single flight');

  await scenario({ status: 'ready', version: '0.1.5' }, async page => {
    await page.evaluate(() => { window.updateTest.nextInstall = { status: 'ready', version: '0.1.5', blocked: 'edits', installRequested: false }; });
    const original = await button(page).elementHandle();
    await button(page).click();
    await page.waitForFunction(() => document.querySelector('#update-message').textContent === '请先导出或撤销修改');
    assert.equal(await message(page).isVisible(), true);
    assert.equal(await button(page).innerText(), '重启更新');
    assert.equal(await button(page).isEnabled(), true);
    assert.equal(await button(page).evaluate((node, original) => node === original, original), true, 'blocked action keeps the same button');
    await page.screenshot({ path: 'artifacts/one-click-update-blocked.png' });
    await page.evaluate(() => { window.updateTest.nextInstall = { status: 'ready', version: '0.1.5', installRequested: true }; });
    await button(page).click();
    await pending(page);
    assert.equal(await message(page).isHidden(), true);
    assert.equal(await installs(page), 2);
  });
  console.log('PASS unsaved work blocks with one short line and the same button retries');

  await scenario({ status: 'ready', version: '0.1.5' }, async page => {
    await page.evaluate(() => { window.updateTest.nextInstall = { status: 'error', version: '0.1.5', message: '下载失败', installRequested: false }; });
    await button(page).click();
    await page.waitForFunction(() => document.querySelector('#update-restart').textContent === '重试');
    await page.evaluate(() => { window.updateTest.checkResult = { status: 'ready', version: '0.1.5' }; });
    await button(page).click();
    await page.waitForFunction(() => document.querySelector('#update-restart').textContent === '重启更新' && !document.querySelector('#update-restart').disabled);
    assert.equal(await installs(page), 1, 'retry rechecks without reusing old consent');
    await page.evaluate(() => { window.updateTest.nextInstall = null; });
    await button(page).click();
    await pending(page);
    assert.equal(await installs(page), 2);
  });
  console.log('PASS a failed restart offers 重试 and needs a fresh click');

  await scenario({ status: 'ready', version: '0.1.5' }, async page => {
    await page.evaluate(() => { window.updateTest.holdStatus = true; window.dispatchEvent(new Event('focus')); });
    await page.waitForFunction(() => window.updateTest.statusHeld);
    await button(page).click(); await pending(page);
    await page.evaluate(() => window.updateTest.releaseStatus());
    await page.clock.runFor(50);
    assert.equal(await button(page).isDisabled(), true, 'an older status cannot overwrite an accepted restart');
    assert.equal(await installs(page), 1);
  });
  console.log('PASS held old status cannot overwrite a completed restart');
  assert.deepEqual(errors, []);
  assert.equal(dialogs, 0);
  console.log('PASS no browser errors or update dialogs');
} finally { await browser.close(); }
