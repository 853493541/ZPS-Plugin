import {_electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openDocument} from '../app/core/documents.mjs';
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'zps-desktop-'));
let app;
try {
 app=await _electron.launch({args:['.'],timeout:30000});
 const page=await app.firstWindow();
 await page.waitForSelector('#records-body tr');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const files=await page.evaluate(()=>window.studio.samples());assert.equal(files.length,6);
 const source=files.find(p=>p.path.endsWith('BuffData.jx3dat'));
 let snapshot=await page.evaluate(p=>window.studio.openSample(p),source.path);
 assert.equal(snapshot.document.records.length,275);
 const row=snapshot.document.records.find(r=>r.id);
 await page.evaluate(key=>window.studio.edit({key,fields:{nPower:11}}),row.key);
 snapshot=await page.evaluate(()=>window.studio.undo());assert.equal(snapshot.dirty,false);
 await page.evaluate(key=>window.studio.edit({key,fields:{nPower:11}}),row.key);
 const destination=path.join(temporary,'BuffData.jx3dat');
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},destination);
 await page.evaluate(()=>window.studio.save());
 const exported=openDocument(await fs.readFile(destination),destination);
 assert.equal(exported.records.find(r=>r.key===row.key).fields.nPower,11);
 await page.evaluate(()=>window.studio.create('my-team'));
 snapshot=await page.evaluate(()=>window.studio.add({reference:'测试|lv1',color:'#FFFFFFFF',label:'测',priority:9}));
 assert.equal(snapshot.document.kind,'my-team');assert.equal(snapshot.document.records.length,1);
 await page.evaluate(()=>window.studio.save());
 await page.evaluate(()=>window.studio.report('Test reproduction description'));
 const report=JSON.parse(await fs.readFile(destination,'utf8'));assert.equal(report.description,'Test reproduction description');assert.equal(report.filename,undefined);
 assert.deepEqual(errors,[]);
 console.log('PASS native Electron preload, actual samples, edit, undo, export, MY creation, local report');
} finally {
 if(app){await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app.close();}
 await fs.rm(temporary,{recursive:true,force:true});
}
