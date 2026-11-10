import {_electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {openDocument} from '../app/core/documents.mjs';
const installed = Boolean(process.env.ZPS_EXECUTABLE_PATH);
const temporary=process.env.ZPS_SMOKE_DATA_DIR || await fs.mkdtemp(path.join(os.tmpdir(),'zps-desktop-'));
await fs.mkdir(temporary,{recursive:true});
const launch=()=>_electron.launch({...(installed?{executablePath:process.env.ZPS_EXECUTABLE_PATH}:{}),args:installed?[]:['.'],timeout:30000});
let app;
try {
 app=await launch();
 const page=await app.firstWindow();
 await page.waitForSelector('#type-list .type-item');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const files=await page.evaluate(()=>window.studio.samples());assert.equal(files.length,6);
 const source=files.find(p=>p.path.endsWith('BuffData.jx3dat'));
 let snapshot=await page.evaluate(p=>window.studio.openSample(p),source.path);
 assert.equal(snapshot.document.records.length,275);
 const row=snapshot.document.records.find(r=>r.id);
 await page.evaluate(key=>window.studio.edit({key,fields:{nPower:11}}),row.key);
 snapshot=await page.evaluate(()=>window.studio.undo());assert.equal(snapshot.dirty,false);
 await page.evaluate(key=>window.studio.edit({key,fields:{nPower:11}}),row.key);
 const destination=path.join(temporary,'气劲 配置.jx3dat');
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},destination);
 await page.evaluate(()=>window.studio.save());
 const exported=openDocument(await fs.readFile(destination),destination);
 assert.equal(exported.records.find(r=>r.key===row.key).fields.nPower,11);
 const firstExport=await fs.readFile(destination);
 await page.evaluate(key=>window.studio.edit({key,fields:{nPower:12}}),row.key);
 await page.evaluate(()=>window.studio.save());
 const backups=(await fs.readdir(temporary)).filter(file=>file.startsWith(path.basename(destination)+'.')&&file.endsWith('.bak'));
 assert.equal(backups.length,1);assert.deepEqual(await fs.readFile(path.join(temporary,backups[0])),firstExport);
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},destination);
 snapshot=await page.evaluate(()=>window.studio.open());
 assert.equal(snapshot.document.records.find(r=>r.key===row.key).fields.nPower,12);
 await page.evaluate(()=>window.studio.create('my-team'));
 snapshot=await page.evaluate(()=>window.studio.add({reference:'测试|lv1',color:'#FFFFFFFF',label:'测',priority:9}));
 assert.equal(snapshot.document.kind,'my-team');assert.equal(snapshot.document.records.length,1);
 const teamFile=path.join(temporary,'团队 气劲.txt');
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},teamFile);
 await page.evaluate(()=>window.studio.save());
 assert.equal(openDocument(await fs.readFile(teamFile),teamFile).records.length,1);
 const reportFile=path.join(temporary,'问题 报告.json');
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},reportFile);
 await page.evaluate(()=>window.studio.report('Test reproduction description'));
 const report=JSON.parse(await fs.readFile(reportFile,'utf8'));assert.equal(report.description,'Test reproduction description');assert.equal(report.filename,undefined);
 assert.deepEqual(errors,[]);
 if(installed){
  const userData=await app.evaluate(({app})=>app.getPath('userData'));
  const probeFile=path.join(userData,`zps-smoke-${Date.now()}.json`);
  await fs.mkdir(userData,{recursive:true});await fs.writeFile(probeFile,'preserve-on-uninstall');
  await app.close();app=await launch();const reopened=await app.firstWindow();await reopened.waitForSelector('#type-list .type-item');
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),userData);
  assert.equal(await fs.readFile(probeFile,'utf8'),'preserve-on-uninstall');
  if(process.env.ZPS_SMOKE_STATE){
   const retainedFiles=await Promise.all([probeFile,destination,teamFile,reportFile,path.join(temporary,backups[0])].map(async file=>({path:file,sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')})));
   await fs.writeFile(process.env.ZPS_SMOKE_STATE,JSON.stringify({probeFile,retainedFiles}));
  }
 }
 console.log('PASS native Electron preload, actual samples, edit, undo, Chinese paths, overwrite backup, reopen export, MY creation, local report'+(installed?', installed restart and retained user data':''));
} finally {
 if(app){await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app.close();}
 if(!process.env.ZPS_SMOKE_DATA_DIR)await fs.rm(temporary,{recursive:true,force:true});
}
