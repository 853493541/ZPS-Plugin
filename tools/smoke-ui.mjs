import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
const page=await browser.newPage({viewport:{width:1536,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const opened=page.waitForResponse(response=>response.url().endsWith('/preview-api/openSample')&&response.request().method()==='POST');
await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4173');await page.waitForSelector('#records-body tr');
const original=(await (await opened).json()).result;
assert.equal(original.dirty,false);assert.equal(original.canUndo,false);
assert.equal(await page.locator('#records-body tr').count(),275);
await page.locator('#search').fill('12784');assert.equal(await page.locator('#records-body tr').count(),1);
await fs.mkdir('artifacts',{recursive:true});
await page.locator('#records-body tr').click();await page.screenshot({path:'artifacts/editor.png',fullPage:true});
await page.locator('#box-tab').click();
async function lookup() {
 const pending=page.waitForResponse(response=>response.url().endsWith('/preview-api/lookup')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'查询 JX3BOX',exact:true}).click();
 const response=await pending;
 const body=await response.json();
 assert.equal(response.status(),200,JSON.stringify(body));
 assert.deepEqual(response.request().postDataJSON().payload,{id:12784,client:'std',level:1});
 const result=body.result;
 assert.deepEqual(result.query,{type:'id',value:'12784',client:'std',level:1});
 assert.equal(result.client,'std');assert.equal(result.stale,false);
 assert.ok(['network','cache'].includes(result.source));assert.ok(Number.isFinite(result.cachedAt));
 assert.equal(result.total,1);assert.deepEqual(result.list,result.raw.list);
 assert.equal(result.list[0].Name,'逃兵');assert.equal(result.list[0].BuffID,12784);assert.equal(result.list[0].Level,1);
 await page.waitForFunction(()=>document.querySelector('.remote-name')?.textContent==='逃兵');
 assert.match(await page.locator('.lookup-source').innerText(),new RegExp(`来源 ${result.source}.*客户端 std.*等级 1`));
 const raw=page.locator('.raw-details').filter({hasText:'查看完整 API 响应'});
 await raw.locator('summary').click();
 assert.deepEqual(JSON.parse(await raw.locator('.raw-data').innerText()),result.raw);
 assert.equal(await page.locator('.warning-box').count(),0);
 assert.equal(await page.locator('#dirty-dot').isHidden(),true);assert.equal(await page.locator('#undo-button').isDisabled(),true);
 const unchanged=await page.request.post(new URL('/preview-api/undo',page.url()).href,{data:{}});
 assert.equal(unchanged.status(),200);assert.deepEqual((await unchanged.json()).result,original,'metadata must not change the preset, dirty flag, or undo history');
 return result;
}
const first=await lookup();
const cached=await lookup();assert.equal(cached.source,'cache');assert.equal(cached.cachedAt,first.cachedAt);assert.deepEqual(cached.raw,first.raw);
await page.locator('#config-tab').click();
await page.locator('[name="nPower"]').fill('11');
await page.getByRole('button',{name:'保存条目修改'}).click();
await page.waitForFunction(()=>document.querySelector('[name="nPower"]')?.value==='11'&&!document.querySelector('#undo-button').disabled);
await page.locator('#undo-button').click();await page.waitForFunction(()=>document.querySelector('[name="nPower"]')?.value==='10');
await page.locator('#new-button').click();await page.locator('[name="new-kind"][value="my-team"]').check();await page.locator('#modal-submit').click();
await page.waitForFunction(()=>document.querySelector('#document-title').textContent.includes('MY'));
await page.locator('#add-button').click();await page.locator('#modal [name="reference"]').fill('测试气劲|lv1');await page.locator('#modal-submit').click();
await page.waitForSelector('#records-body tr');assert.match(await page.locator('#records-body').innerText(),/测试气劲/);
await page.locator('#sample-list button').filter({hasText:'其他辅助'}).click();await page.waitForFunction(()=>document.querySelector('#format-badge').textContent==='READ ONLY');
assert.equal(await page.locator('#add-button').isDisabled(),true);
console.log(`PASS: 275 actual JX records; 12784 std level 1 = 逃兵 (${first.source}, then cache); raw API payload retained; metadata leaves preset clean; search, edit, undo, MY creation, add, binary read-only; no page errors: ${errors.length}`);assert.deepEqual(errors,[]);
} finally {
await browser.close();
}
