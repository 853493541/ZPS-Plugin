import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { openDocument } from '../app/core/documents.mjs';
const manifest=JSON.parse(await fs.readFile('samples/SAMPLES.json','utf8'));
const sample=Object.keys(manifest.files).find(p=>p.endsWith('/BuffData.jx3dat'));
const document=openDocument(await fs.readFile('samples/'+sample),'BuffData.jx3dat');
const fixture=JSON.parse(await fs.readFile('app/tests/fixtures/jx3box/std-12784-level-1.json','utf8'));
const snapshot={featureId:'jx-buff',filename:'BuffData.jx3dat',document,dirty:false,canUndo:false};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1360,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({snapshot,raw})=>{
  const chat={featureId:'chat',filename:'chat-keywords.txt',dirty:false,canUndo:false,document:{kind:'chat',writable:true,records:[{key:'line:0',name:'聊天',fields:{keyword:'聊天'}}]}};
  window.cacheTest={lookups:0,bulk:0,icons:0,pending:[]};
  const result=query=>({list:raw.list,total:1,raw,query:{type:'id',value:'12784',client:'std',level:1},client:'std',source:'cache',stale:true,cachedAt:Date.now()-90000000});
  window.studio={
   samples:async()=>[{path:'剑心目标增强/BuffData.jx3dat',name:'BuffData.jx3dat'},{path:'茗伊聊天监控/chat-keywords.txt',name:'chat-keywords.txt'}],
   activateFeature:async id=>id==='chat'?chat:snapshot,
   openSample:async()=>snapshot,
   setDraftState:async()=>{},
   lookupCached:async queries=>{window.cacheTest.bulk++;return queries.map(q=>String(q.id)==='12784'&&q.client==='std'&&q.level===1?result(q):null);},
   lookup:async query=>{window.cacheTest.lookups++;return new Promise(resolve=>window.cacheTest.pending.push({query,resolve}));},
   loadIcon:async()=>{window.cacheTest.icons++;return{dataURL:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQKE3+DwADqQH4mzDeRwAAAABJRU5ErkJggg==',source:'cache',cachedAt:Date.now()};},
   updates:async()=>({status:'unavailable'})
  };
 },{snapshot,raw:fixture.raw});
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4173');
 await page.waitForSelector('#type-list .type-item');
 await page.waitForFunction(()=>window.cacheTest.lookups>0);
 assert.equal(await page.evaluate(()=>window.cacheTest.icons),0,'offscreen buff icons must not be requested');
 await page.locator('#type-search').fill('12784');await page.locator('#type-list .type-item').first().click();
 await page.waitForFunction(()=>document.querySelector('#type-members .record-name')?.textContent==='逃兵');
 await page.locator('#type-members .type-member-row').click();
 await page.waitForFunction(()=>document.querySelector('#selection-heading img')?.naturalWidth>0);
 assert.match(await page.locator('#selection-heading').innerText(),/逃兵.*离线缓存/s);
 await page.locator('[name="nPower"]').fill('123');
 await page.locator('.inspector-close').click();
 const chat=page.getByRole('tab',{name:'茗伊聊天监控'});await chat.click();
 await page.getByRole('tab',{name:'剑心 BUFF增强'}).click();
 await page.locator('#type-members .type-member-row').click();
 await page.waitForFunction(()=>document.querySelector('[name="nPower"]')?.value==='123');
 assert.match(await page.locator('#selection-heading').innerText(),/逃兵/);
 assert.equal(await page.locator('#undo-button').isDisabled(),true,'metadata must not edit preset bytes');
 assert.equal(await page.locator('#dirty-dot').isVisible(),true,'unapplied drafts must be marked while metadata leaves bytes clean');
 await page.evaluate(()=>{
  for(const {query,resolve} of window.cacheTest.pending) resolve({list:[],total:0,raw:{list:[]},client:query.client,source:'network',stale:false,cachedAt:Date.now()});
 });
 await page.waitForFunction(()=>document.querySelector('#selection-heading h3')?.textContent==='#12784');
 assert.doesNotMatch(await page.locator('#selection-heading').innerText(),/逃兵/,'successful empty refresh removes obsolete cached name');
 assert.deepEqual(errors,[]);
 await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/cache-loading.png'});
 const large=await browser.newPage();large.on('pageerror',e=>errors.push(e.message));
 await large.addInitScript(()=>{
  const document={kind:'jx-buff',encoding:'gbk',writable:true,records:Array.from({length:513},(_,index)=>({key:`buff:${200000+index}`,id:200000+index,name:`#${200000+index}`,category:'',fields:{nClass:'',nPower:10}}))};
  window.largeCache={batches:[],lookups:0};
  window.studio={samples:async()=>[{path:'剑心目标增强/BuffData.jx3dat',name:'BuffData.jx3dat'}],openSample:async()=>({filename:'BuffData.jx3dat',document,dirty:false,canUndo:false}),
   lookupCached:async queries=>{if(queries.length>512)throw Error('Oversized batch');window.largeCache.batches.push(queries.length);return queries.map(query=>{const raw={list:[{BuffID:Number(query.id),Name:`Cached ${query.id}`,Level:query.level,IconID:null}],total:1};return{...raw,raw,client:query.client,source:'cache',stale:false,cachedAt:Date.now()};});},
   lookup:async()=>{window.largeCache.lookups++;throw Error('Warm data must not request the network');}
  };
 });
 await large.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4173');
 await large.waitForFunction(()=>document.querySelectorAll('#type-members .record-name').length===513&&[...document.querySelectorAll('#type-members .record-name')].every(n=>n.textContent.startsWith('Cached ')));
 assert.deepEqual(await large.evaluate(()=>window.largeCache),{batches:[512,1],lookups:0});
 assert.deepEqual(errors,[]);
 console.log('PASS stale cached names and icons display before blocked refresh; offscreen icons deferred; tab return retains name, draft and clean preset');
}finally{await browser.close();}
