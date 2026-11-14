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
  assert.match(await button(page).innerText(), /准备中|正在安装/);
}
async function refresh(page, state) {
  await page.evaluate(state => { window.updateTest.state = state; window.dispatchEvent(new Event('focus')); }, state);
}
try {
  await scenario({ status: 'available', version: '0.1.5' }, async page => {
    assert.match(await message(page).innerText(), /发现新版本.*0\.1\.5/);
    assert.equal(await button(page).innerText(), '安装');
    assert.equal(await button(page).isEnabled(), true);
    await button(page).focus();
    assert.equal(await button(page).evaluate(node => node === document.activeElement), true);
    const bounds = await page.locator('#update-banner').boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 1050 && bounds.y + bounds.height <= 760);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false, 'compact window must not overflow');
    await page.screenshot({ path: 'artifacts/one-click-update.png' });
    await page.setViewportSize({ width: 1536, height: 1050 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false, 'desktop window must not overflow');
    await page.screenshot({ path: 'artifacts/one-click-update-desktop.png' });
    await button(page).press('Enter');
    await pending(page);
    assert.equal(await installs(page), 1);
  });
  console.log('PASS automatic discovery, keyboard Install, compact 1050x760 layout');

  await scenario({ status: 'downloading', version: '0.1.5', progress: 35 }, async page => {
    assert.equal(await button(page).isEnabled(), true, 'Install is available during background download');
    await button(page).click();
    await pending(page);
    assert.match(await message(page).innerText(), /35%.*自动更新/);
    // A synthetic duplicate event also must not issue another IPC request.
    await button(page).evaluate(node => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.equal(await installs(page), 1);
    await page.screenshot({ path: 'artifacts/one-click-update-pending.png' });
    await refresh(page, { status: 'ready', version: '0.1.5', installRequested: true });
    await page.waitForFunction(() => document.querySelector('#update-restart').textContent === '正在安装…');
    assert.equal(await button(page).isDisabled(), true);
    assert.equal(await installs(page), 1, 'accepted intent needs no second Install');
  });
  console.log('PASS downloading Install, duplicate suppression, accepted ready needs no second click');

  await scenario({ status: 'ready', version: '0.1.5' }, async page => {
    await page.evaluate(() => { window.updateTest.holdInstall = true; });
    await button(page).click();
    await page.waitForFunction(() => window.updateTest.installHeld);
    await button(page).evaluate(node => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.equal(await installs(page), 1, 'in-flight Install must be single flight');
    await page.evaluate(() => window.updateTest.releaseInstall());
    await pending(page);
    assert.equal(await installs(page), 1);
  });
  console.log('PASS clean ready Install and in-flight duplicate suppression');

  for (const kind of ['未导出的修改', '未应用的草稿']) {
    await scenario({ status: 'ready', version: '0.1.5' }, async page => {
      await page.evaluate(kind => { window.updateTest.nextInstall = { status: 'ready', version: '0.1.5', blocked: true, message: `请先处理${kind}，再安装更新。`, installRequested: false }; }, kind);
      const original = await button(page).elementHandle();
      await button(page).click();
      await page.waitForFunction(kind => document.querySelector('#update-message').textContent.includes(kind), kind);
      assert.equal(await button(page).isEnabled(), true);
      assert.equal(await button(page).innerText(), '安装');
      assert.equal(await button(page).evaluate((node, original) => node === original, original), true, 'blocked action retains the same button');
      assert.equal(await page.locator('dialog[open]').count(), 0);
      await page.screenshot({ path: `artifacts/one-click-update-blocked-${kind === '未导出的修改' ? 'edits' : 'drafts'}.png` });
      // Model native guard clearing after the user resolves edits elsewhere.
      await page.evaluate(() => { window.updateTest.nextInstall = { status: 'ready', version: '0.1.5', installRequested: true }; });
      await button(page).click();
      await pending(page);
      assert.equal(await installs(page), 2);
    });
  }
  console.log('PASS edits and drafts block inline, same Install button retries after resolution');

  for (const version of ['0.1.5']) {
    await scenario({ status: 'error', version, message: '网络中断，请重试。' }, async page => {
      assert.equal(await button(page).innerText(), '重试');
      await page.evaluate(() => { window.updateTest.checkResult = { status: 'available', version: '0.1.5', installRequested: false }; });
      await button(page).click();
      assert.equal(await installs(page), 0, 'Retry must recheck even with a known version');
      await page.waitForFunction(() => document.querySelector('#update-restart').textContent === '安装' && !document.querySelector('#update-restart').disabled);
      assert.equal(await page.evaluate(() => window.updateTest.calls.filter(action => action === 'check').length), 1);
      await button(page).click();
      await pending(page);
      assert.equal(await installs(page), 1, 'a fresh Install click arms consent after error');
    });
  }
  console.log('PASS errors for a known version recheck and require fresh Install consent');

  await scenario({ status: 'ready', version: '0.1.5', installRequested: true }, async page => {
    await refresh(page, { status: 'error', version: '0.1.5', message: '下载失败', installRequested: false });
    await page.waitForFunction(() => document.querySelector('#update-restart').textContent === '重试');
    await page.evaluate(() => { window.updateTest.checkResult = { status: 'available', version: '0.1.5' }; });
    await button(page).click();
    await page.waitForFunction(() => document.querySelector('#update-restart').textContent === '安装');
    assert.equal(await installs(page), 0, 'an error must not carry old consent into the fresh check');
  });

  for (const action of ['install']) {
    await scenario({ status: 'available', version: '0.1.5' }, async page => {
      await page.evaluate(() => { window.updateTest.holdStatus = true; window.dispatchEvent(new Event('focus')); });
      await page.waitForFunction(() => window.updateTest.statusHeld);
      await button(page).click(); await pending(page);
      await page.evaluate(() => window.updateTest.releaseStatus());
      // Drain browser tasks after the older status promise resolves.
      await page.clock.runFor(50);
      assert.equal(await button(page).isDisabled(), true, 'status started before an action cannot overwrite its accepted result');
      assert.match(await button(page).innerText(), /准备中|正在安装/);
      assert.equal(await installs(page), 1);
    });
  }
  console.log('PASS held old status cannot overwrite a completed Install');

  for (const state of [{ status: 'current' }, { status: 'checking' }, { status: 'unavailable' }, { status: 'error', message: '网络中断' }]) {
    await scenario(state, async page => {
      await page.clock.runFor(50);
      assert.equal(await page.locator('#update-banner').isHidden(), true, `${state.status} without a new version shows nothing`);
      assert.equal(await page.locator('.sidebar button', { hasText: /检查更新|反馈问题/ }).count(), 0, 'manual check and report buttons are gone');
    }, { visible: false });
  }
  console.log('PASS bottom left stays empty without a new version');
  assert.deepEqual(errors, []);
  assert.equal(dialogs, 0);
  console.log('PASS no browser errors or update dialogs');
} finally { await browser.close(); }
