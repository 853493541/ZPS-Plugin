import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/preview-api/lookup', route => {
    const query = route.request().postDataJSON().payload;
    return route.fulfill({ json: { result: { list: [], raw: { list: [] }, total: 0, client: query.client, query, source: 'network', stale: false, cachedAt: Date.now() } } });
  });
  await page.goto(url);
  await page.waitForSelector('#records-body tr');
  const tabs = page.locator('#feature-tabs [role="tab"]');
  assert.equal(await tabs.count(), 4);
  async function activate(id) {
    const tab = page.locator(`#feature-tabs [data-feature="${id}"]`);
    await tab.click();
    await page.waitForFunction(id => {
      const tab = document.querySelector(`#feature-tabs [data-feature="${id}"]`);
      const panel = tab && document.getElementById(tab.getAttribute('aria-controls'));
      return tab?.getAttribute('aria-selected') === 'true' && panel?.getAttribute('aria-busy') === 'false' && document.querySelector('#breadcrumb-name')?.textContent !== '未打开文件';
    }, id);
  }
  assert.equal(await page.locator('#sample-list button').count(), 1);
  assert.match(await page.locator('#document-title').innerText(), /剑心|BUFF/i);
  await page.locator('#search').fill('12784');
  await page.locator('#records-body tr').click();
  await page.locator('[name="nPower"]').fill('11');
  let releaseEdit, editCaptured;
  const editGate = new Promise(resolve => { releaseEdit = resolve; });
  const captured = new Promise(resolve => { editCaptured = resolve; });
  await page.route('**/preview-api/edit', async route => {
    const response = await route.fetch();
    editCaptured();
    await editGate;
    await route.fulfill({ response });
  }, { times: 1 });
  await page.getByRole('button', { name: '保存条目修改' }).click();
  await captured;
  await page.locator('[name="nPower"]').fill('12');
  releaseEdit();
  await page.waitForFunction(() => !document.querySelector('#undo-button').disabled);
  assert.equal(await page.locator('[name="nPower"]').inputValue(), '12', 'an older apply response must preserve newer typing');
  await activate('my-team');
  assert.equal(await page.locator('#sample-list button').count(), 1);
  assert.match(await page.locator('#sample-list').innerText(), /真传（仅）团队气劲/);
  assert.match(await page.locator('#document-title').innerText(), /团队气劲/);
  await page.locator('#search').fill('弹跳');
  await page.locator('#records-body tr').first().click();
  await page.locator('[name="label"]').fill('团队测试');
  await page.getByRole('button', { name: '保存条目修改' }).click();
  await page.waitForFunction(() => !document.querySelector('#undo-button').disabled);
  await activate('my-target');
  assert.equal(await page.locator('#sample-list button').count(), 3);
  assert.match(await page.locator('#document-title').innerText(), /目标监控/);
  for (const filename of ['其他辅助.jx3dat', '技能监控.jx3dat', '自用完整版.jx3dat']) {
    await page.locator('#sample-list button').filter({ hasText: filename }).click();
    await page.waitForFunction(filename => document.querySelector('#breadcrumb-name')?.textContent === filename, filename);
    assert.equal(await page.locator('#save-button').isDisabled(), true);
    assert.equal(await page.locator('#add-button').isDisabled(), true);
    assert.equal(await page.locator('#new-button').isDisabled(), true);
    assert.equal(await page.locator('#box-tab').isVisible(), false);
  }
  await fs.mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/feature-target.png', fullPage: true });
  await activate('chat');
  assert.equal(await page.locator('#sample-list button').count(), 1);
  assert.match(await page.locator('#sample-list').innerText(), /推荐设置关键词/);
  assert.equal(await page.locator('#box-tab').isVisible(), false);
  await page.locator('#records-body tr').first().click();
  await page.locator('[name="keyword"]').fill('聊天测试关键词');
  await page.getByRole('button', { name: '保存条目修改' }).click();
  await page.waitForFunction(() => !document.querySelector('#undo-button').disabled);
  await activate('jx-buff');
  assert.equal(await page.locator('#search').inputValue(), '12784');
  assert.equal(await page.locator('[name="nPower"]').inputValue(), '12', 'switching features must retain an unapplied form draft');
  const response = await page.request.post(new URL('/preview-api/activateFeature', url).href, { data: { payload: 'jx-buff' } });
  const applied = (await response.json()).result;
  assert.equal(applied.document.records.find(record => record.id === 12784).fields.nPower, 11);
  assert.equal(applied.dirty, true);
  assert.equal(applied.canUndo, true);
  await page.locator('#undo-button').click();
  await page.waitForFunction(() => document.querySelector('[name="nPower"]')?.value === '10');
  await page.locator('[name="nPower"]').fill('13');
  const cancelDiscard = page.waitForEvent('dialog').then(dialog => dialog.dismiss());
  await page.locator('#sample-list button').click();
  await cancelDiscard;
  assert.equal(await page.locator('[name="nPower"]').inputValue(), '13', 'canceling a draft-only replacement must preserve the draft');
  await activate('my-team');
  assert.equal(await page.locator('#search').inputValue(), '弹跳');
  assert.equal(await page.locator('[name="label"]').inputValue(), '团队测试');
  assert.equal(await page.locator('#dirty-dot').isHidden(), false);
  await activate('chat');
  assert.equal(await page.locator('[name="keyword"]').inputValue(), '聊天测试关键词');
  assert.equal(await page.locator('#dirty-dot').isHidden(), false);
  assert.deepEqual(errors, []);
  console.log('PASS: four feature tabs; sample groups 1/1/3/1; all target presets read-only; independent applied edits, drafts, search, dirty state and undo; no page errors');
} finally {
  await browser.close();
}
