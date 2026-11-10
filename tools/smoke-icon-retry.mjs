import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const fixture = JSON.parse(await fs.readFile('app/tests/fixtures/jx3box/std-12784-level-1.json', 'utf8'));

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(raw => {
    window.studio = {
      samples: async () => [{ path: '剑心目标增强/BuffData.jx3dat', name: 'BuffData.jx3dat' }],
      openSample: async () => ({ filename: 'BuffData.jx3dat', dirty: false, canUndo: false, document: { kind: 'jx-buff', writable: true, encoding: 'gbk', records: [12784, 12724].map(id => ({ key: `buff:${id}`, id, name: `#${id}`, fields: { nClass: '', nPower: 10 } })) } }),
      lookup: async query => {
        const list = Number(query.id) === 12784 ? raw.list : [{ ...raw.list[0], BuffID: 12724, Name: '出圈提示', IconID: -1 }];
        return { list, total: 1, raw: { list }, client: query.client, source: 'network', stale: false };
      }
    };
  }, fixture.raw);
  let blocked = true;
  let requests = 0;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQKE3+DwADqQH4mzDeRwAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://icon.jx3box.com/icon/340.png', route => {
    requests++;
    return blocked ? route.abort('failed') : route.fulfill({ contentType: 'image/png', body: png });
  });
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173');
  await page.locator('#type-search').fill('12784');
  await page.locator('#type-list .type-item').first().click();
  await page.waitForFunction(() => document.querySelector('#type-members .record-name')?.textContent === '逃兵');
  await page.locator('#type-members .type-member-row').click();
  const retry = page.locator('#selection-heading').getByRole('button', { name: /重试.*图标/ });
  await retry.waitFor();
  await retry.focus();
  await page.keyboard.press('Control+k');
  assert.equal(await page.locator('#type-search').evaluate(node => node === document.activeElement), true, 'an icon retry must not swallow application shortcuts');
  const initialRequests = requests;
  assert.ok(initialRequests > 0);
  await page.locator('[name="nPower"]').fill('12');
  blocked = false;
  await retry.click();
  await page.waitForFunction(() => document.querySelector('#selection-heading img')?.naturalWidth > 0);
  assert.ok(requests > initialRequests, 'retry must issue a new image request after a failure');
  assert.equal(await page.locator('#selection-heading h3').innerText(), '逃兵');
  assert.equal(await page.locator('[name="nPower"]').inputValue(), '12', 'icon retry must preserve typed form values');
  assert.equal(await page.locator('#dirty-dot').isHidden(), true);
  assert.equal(await page.locator('#undo-button').isDisabled(), true);
  await page.locator('[name="nPower"]').fill('10');
  await page.locator('.inspector-close').click();
  await page.locator('#type-search').fill('12724');
  await page.locator('#type-list .type-item').first().click();
  await page.locator('#type-members .type-member-row').click();
  await page.waitForFunction(() => document.querySelector('#selection-heading h3')?.textContent === '出圈提示');
  assert.match(await page.locator('#selection-heading').innerText(), /无图|未提供图标/);
  assert.equal(await page.locator('#selection-heading img').count(), 0);
  assert.equal(await page.locator('#selection-heading').getByRole('button', { name: /重试.*图标/ }).count(), 0);
  const missing = await browser.newPage();
  missing.on('pageerror', error => errors.push(error.message));
  await missing.addInitScript(() => {
    window.studio = {
      samples: async () => [{ path: '剑心目标增强/BuffData.jx3dat', name: 'BuffData.jx3dat' }],
      openSample: async () => ({ filename: 'BuffData.jx3dat', dirty: false, canUndo: false, document: { kind: 'jx-buff', writable: true, encoding: 'gbk', records: [{ key: 'buff:99999', id: 99999, name: '#99999', fields: { nClass: '', nPower: 10 } }] } }),
      lookup: async query => ({ list: [], total: 0, raw: { list: [] }, client: query.client, source: 'network', stale: false })
    };
  });
  await missing.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173');
  await missing.waitForFunction(() => document.querySelector('#metadata-progress')?.textContent.includes('1/1'));
  await missing.locator('#type-members .type-member-row').click();
  assert.match(await missing.locator('#selection-heading .record-glyph').innerText(), /未获/);
  assert.doesNotMatch(await missing.locator('#selection-heading .record-glyph').getAttribute('title'), /待查询|加载中/);
  assert.deepEqual(errors, []);
  console.log('PASS: failed icons retry after network recovery; missing source icons are labeled; preset edits, undo and typed form values remain unchanged');
} finally {
  await browser.close();
}
