import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.updateTest={state:{status:'downloading',progress:35},installs:0};
  window.studio={samples:async()=>[{path:'剑心目标增强/BuffData.jx3dat',name:'BuffData.jx3dat'}],
   openSample:async()=>({filename:'BuffData.jx3dat',dirty:false,canUndo:false,document:{kind:'jx-buff',encoding:'gbk',writable:true,records:[]}}),
   updates:async action=>{if(action==='install')window.updateTest.installs++;return window.updateTest.state;}
  };
 });
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4183');
 await page.locator('#update-banner').waitFor();assert.match(await page.locator('#update-message').innerText(),/35%/);
 assert.equal(await page.locator('#update-restart').isVisible(),false);
 await page.evaluate(()=>{window.updateTest.state={status:'ready',version:'0.1.1'};window.dispatchEvent(new Event('focus'));});
 await page.locator('#update-restart').waitFor();assert.match(await page.locator('#update-message').innerText(),/0.1.1/);
 await page.locator('#update-restart').click();assert.equal(await page.evaluate(()=>window.updateTest.installs),1);
 assert.deepEqual(errors,[]);console.log('PASS background download banner, ready version, and guarded-restart IPC action');
}finally{await browser.close();}
