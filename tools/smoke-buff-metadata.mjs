import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { openDocument } from '../app/core/documents.mjs';

const manifest = JSON.parse(await fs.readFile('samples/SAMPLES.json', 'utf8'));
const sample = Object.keys(manifest.files).find(file => file.endsWith('/BuffData.jx3dat'));
const document = openDocument(await fs.readFile(`samples/${sample}`), 'BuffData.jx3dat');
const fixture = JSON.parse(await fs.readFile('app/tests/fixtures/jx3box/std-12784-level-1.json', 'utf8'));
document.records = [12784, 27038, 51406, 22468].map(id => document.records.find(record => record.id === id));
const snapshot = JSON.parse(JSON.stringify({ filename: 'BuffData.jx3dat', dirty: false, canUndo: false, document }));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ snapshot, raw }) => {
    window.testSnapshot = snapshot;
    window.testLookups = [];
    window.testEdits = 0;
    window.studio = {
      samples: async () => [{ path: '剑心目标增强/BuffData.jx3dat', name: 'BuffData.jx3dat' }, { path: '茗伊聊天监控/chat-keywords.txt', name: 'chat-keywords.txt' }],
      openSample: async path => path.includes('chat') ? { filename: 'chat-keywords.txt', dirty: false, canUndo: false, document: { kind: 'chat', writable: true, encoding: 'utf-8', records: [{ key: 'line:0', name: '聊天测试', fields: { keyword: '聊天测试' } }] } } : snapshot,
      lookup: async query => {
        window.testLookups.push(query);
        let list = [];
        if (Number(query.id) === 12784 && query.client === 'std' && query.level === 1) list = raw.list;
        if (Number(query.id) === 27038) list = await new Promise(resolve => { window.finishDelayedMetadata = () => resolve([{ ...raw.list[0], BuffID: 27038, Name: '延迟返回测试', IconID: -1 }]); });
        if (Number(query.id) === 51406) list = await new Promise(resolve => { window.finishDetailsMetadata = () => resolve([{ ...raw.list[0], BuffID: 51406, Name: '详情延迟测试', IconID: 340 }]); });
        if (Number(query.id) === 22468) list = await new Promise(resolve => { window.finishOldDocument = () => resolve([{ ...raw.list[0], BuffID: 22468, Name: '旧文档延迟', IconID: 340 }]); });
        return { list, total: list.length, raw: { ...raw, list, total: list.length }, client: query.client, query: { type: 'id', value: String(query.id), client: query.client, level: query.level }, source: 'network', stale: false, cachedAt: Date.now() };
      },
      edit: async () => { window.testEdits++; throw new Error('Metadata must never edit the preset'); },
      undo: async () => snapshot,
      updates: async () => ({ status: 'unavailable' })
    };
  }, { snapshot, raw: fixture.raw });
  await page.route('https://icon.jx3box.com/**', route => route.abort('failed'));
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173');
  await page.locator('#type-search').fill('12784');
  await page.locator('#type-list .type-item').first().click();
  await page.waitForFunction(() => document.querySelector('#type-members .record-name')?.textContent === '逃兵');
  await page.locator('#type-search').fill('逃兵');
  const buff = page.locator('#type-members .type-member-row').filter({ hasText: 'ID 12784' });
  assert.equal(await buff.locator('.record-name').innerText(), '逃兵');
  await buff.click();
  assert.equal(await page.locator('#selection-heading h3').innerText(), '逃兵');
  assert.equal(await page.locator('#dirty-dot').isHidden(), true);
  assert.equal(await page.locator('#undo-button').isDisabled(), true);
  await page.waitForFunction(() => typeof window.finishDelayedMetadata === 'function');
  await page.locator('[name="nPower"]').fill('123');
  await page.evaluate(() => window.finishDelayedMetadata());
  await page.waitForFunction(() => [...document.querySelectorAll('#type-members .record-name')].some(node => node.textContent === '延迟返回测试') || window.testLookups.length > 2);
  assert.equal(await page.locator('[name="nPower"]').inputValue(), '123', 'background metadata must preserve a typed unsaved value');
  assert.equal(await page.locator('[name="nPower"]').evaluate(node => node === document.activeElement), true);
  assert.equal(await buff.locator('img').count(), 0, 'failed image must use a fallback instead of a broken image');
  assert.deepEqual(await page.evaluate(() => window.testSnapshot), snapshot, 'metadata must preserve the original document and session state');
  assert.equal(await page.evaluate(() => window.testEdits), 0);
  await page.waitForFunction(() => typeof window.finishDetailsMetadata === 'function');
  await page.locator('#box-tab').click();
  const disclosure = page.locator('.raw-details').filter({ hasText: '查看完整返回记录' });
  await disclosure.locator('summary').click();
  await disclosure.locator('summary').focus();
  await page.evaluate(() => window.finishDetailsMetadata());
  await page.waitForFunction(() => typeof window.finishOldDocument === 'function');
  assert.equal(await disclosure.evaluate(node => node.open), true, 'unrelated metadata must not collapse expanded details');
  assert.equal(await disclosure.locator('summary').evaluate(node => node === document.activeElement), true, 'unrelated metadata must preserve details focus');
  await page.evaluate(async () => {const snapshot=await window.studio.openSample('chat'); window.testNextOpen=snapshot; window.studio.open=async()=>snapshot;});
  await page.locator('.inspector-close').click();
  await page.locator('#open-button').click();
  await page.waitForFunction(() => document.querySelector('#feature-tabs [aria-selected="true"]').textContent.includes('聊天'));
  await page.locator('#records-body tr').first().click();
  await page.evaluate(() => window.finishOldDocument());
  assert.equal(await page.locator('#selection-heading h3').innerText(), '聊天测试');
  assert.equal(await page.locator('#selection-heading img').count(), 0);
  const edition = await browser.newPage();
  edition.on('pageerror', error => errors.push(error.message));
  await edition.addInitScript(({ snapshot, raw }) => {
    const one = { ...snapshot, document: { ...snapshot.document, records: [snapshot.document.records.find(record => record.id === 12784)] } };
    window.studio = {
      samples: async () => [{ path: '剑心目标增强/BuffData.jx3dat', name: 'BuffData.jx3dat' }],
      openSample: async () => one,
      lookup: async query => {
        const name = query.client === 'std' ? await new Promise(resolve => { window.finishOldEdition = () => resolve('旧客户端测试'); }) : '缘起测试';
        const list = [{ ...raw.list[0], Name: name }];
        return { list, total: 1, raw: { list }, client: query.client, source: 'network', stale: false, cachedAt: Date.now() };
      }
    };
    window.seenHeadings = [];
    new MutationObserver(() => window.seenHeadings.push(document.querySelector('#selection-heading h3')?.textContent)).observe(document, { subtree: true, childList: true, characterData: true });
  }, { snapshot, raw: fixture.raw });
  const iconUrls = [];
  await edition.route('https://icon.jx3box.com/**', route => { iconUrls.push(route.request().url()); return route.abort('failed'); });
  await edition.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173');
  await edition.waitForFunction(() => typeof window.finishOldEdition === 'function');
  await edition.locator('#type-members .type-member-row').click();
  await edition.locator('#box-tab').click();
  await edition.getByLabel('客户端版本').selectOption('origin');
  await edition.evaluate(() => window.finishOldEdition());
  await edition.waitForFunction(() => document.querySelector('#selection-heading h3')?.textContent === '缘起测试');
  assert.equal((await edition.evaluate(() => window.seenHeadings)).includes('旧客户端测试'), false);
  await edition.waitForFunction(() => !document.querySelector('#selection-heading img'));
  assert.ok(iconUrls.includes('https://icon.jx3box.com/origin_icon/340.png'));
  const offline = await browser.newPage();
  offline.on('pageerror', error => errors.push(error.message));
  await offline.addInitScript(snapshot => {
    window.lookupAttempts = 0;
    window.studio = {
      samples: async () => [{ path: '剑心目标增强/BuffData.jx3dat', name: 'BuffData.jx3dat' }],
      openSample: async () => snapshot,
      lookup: async () => { window.lookupAttempts++; throw new Error('Network unavailable'); }
    };
  }, snapshot);
  await offline.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173');
  await offline.waitForFunction(() => document.querySelector('#metadata-progress')?.textContent.includes('连接中断'));
  assert.equal(await offline.evaluate(() => window.lookupAttempts), 1, 'a transport error must stop automatic requests');
  await offline.locator('#type-search').fill('12784');
  await offline.locator('#type-list .type-item').first().click();
  await offline.locator('#type-members .type-member-row').click();
  assert.equal(await offline.locator('#selection-heading h3').innerText(), '#12784');
  await offline.locator('#box-tab').click();
  await offline.getByRole('button', { name: '查询 JX3BOX', exact: true }).click();
  await offline.waitForSelector('.warning-box');
  assert.equal(await offline.evaluate(() => window.lookupAttempts), 2, 'manual lookup must allow retry');
  assert.deepEqual(errors, []);
  console.log('PASS: automatic names and search, icon fallback, typing focus, unchanged preset, stale document/edition isolation, origin icon paths, and bounded offline retry');
} finally {
  await browser.close();
}
