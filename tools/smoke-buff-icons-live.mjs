import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173');
  await page.waitForFunction(() => document.querySelector('#metadata-progress')?.textContent.includes('177/177'), {}, { timeout: 180000 });
  const buffs = page.locator('#records-body tr[data-key^="buff:"]');
  assert.equal(await buffs.count(), 177);
  assert.equal(await buffs.locator('.record-name').filter({ hasText: /^#/ }).count(), 0);
  const deserter = page.locator('#records-body tr[data-key="buff:12784"]');
  assert.equal(await deserter.locator('.record-name').innerText(), '逃兵');
  await deserter.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#records-body tr[data-key="buff:12784"] img')?.naturalWidth === 48);
  await deserter.click();
  await page.waitForFunction(() => document.querySelector('#selection-heading img')?.naturalWidth === 48);
  assert.equal(await page.locator('#selection-heading h3').innerText(), '逃兵');
  assert.equal(await page.locator('#dirty-dot').isHidden(), true);
  assert.equal(await page.locator('#undo-button').isDisabled(), true);
  const internal = page.locator('#records-body tr[data-key="buff:12724"]');
  assert.equal(await internal.locator('.record-name').innerText(), '出圈提示');
  assert.match(await internal.innerText(), /内部名/);
  assert.equal(await internal.locator('img').count(), 0);
  await fs.mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/buff-names-icons.png', fullPage: true });
  await page.locator('#box-tab').click();
  await page.waitForSelector('.remote-name');
  await page.waitForFunction(() => document.querySelector('.remote-heading img')?.naturalWidth === 48);
  await page.screenshot({ path: 'artifacts/buff-icon-details.png', fullPage: true });
  await internal.click();
  assert.match(await page.locator('#selection-heading').innerText(), /内部名/);
  assert.equal(await page.locator('.remote-name').innerText(), '出圈提示');
  assert.match(await page.locator('#inspector-content').innerText(), /内部名/);
  assert.deepEqual(errors, []);
  console.log('PASS: 177 displayed buff names; internal names labeled; real 48px icons in list, selection, and details; missing-icon fallback; unchanged dirty/undo state; zero page errors');
} finally {
  await browser.close();
}
