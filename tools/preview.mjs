import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDocument,editDocument,addRecord,createDocument} from '../app/core/documents.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ui=path.join(root,'app/ui');
const manifest=JSON.parse(await fs.readFile(path.join(root,'samples/SAMPLES.json'),'utf8'));
const files=Object.keys(manifest.files).filter(p=>p.endsWith('.jx3dat')||p.includes('团队气劲')&&p.endsWith('.txt')||p.includes('推荐设置关键词'));
let session;
const snapshot=()=>session?{filename:session.filename,dirty:session.dirty,canUndo:session.undo.length>0,document:openDocument(session.bytes,session.filename)}:null;
const methods={
 samples:()=>files.map(p=>({path:p,name:path.basename(p)})),
 openSample:async p=>{if(!files.includes(p))throw Error('Unknown sample');session={bytes:await fs.readFile(path.join(root,'samples',p)),filename:path.basename(p),dirty:false,undo:[]};return snapshot();},
 open:()=>{throw Error('Use the sample library in browser preview. Native files open in the Windows application.');},
 create:kind=>{session={bytes:Buffer.from(createDocument(kind)),filename:kind==='jx-buff'?'BuffData.jx3dat':kind==='my-team'?'my-team.txt':'chat-keywords.txt',dirty:true,undo:[]};return snapshot();},
 edit:change=>{if(!session)throw Error('Open a document');const next=editDocument(session.bytes,session.filename,change);session.undo.push(session.bytes);session.bytes=Buffer.from(next);session.dirty=true;return snapshot();},
 add:fields=>{if(!session)throw Error('Open a document');const next=addRecord(session.bytes,session.filename,fields);session.undo.push(session.bytes);session.bytes=Buffer.from(next);session.dirty=true;return snapshot();},
 undo:()=>{if(session?.undo.length){session.bytes=session.undo.pop();session.dirty=true;}return snapshot();},
 save:()=>{throw Error('Native export is available in the desktop app. Browser preview never writes source files.');},
 lookup:()=>{throw Error('Live JX3BOX access is blocked by this cloud network policy. No metadata has been fabricated.');},
 updates:()=>({status:'unavailable',message:'Updates are available in an installed Windows release.'}),
 report:()=>{throw Error('Local diagnostic export is available in the desktop app.');}
};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method==='POST'&&req.url.startsWith('/preview-api/')){
   if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${server.address().port}`)throw Error('Invalid origin');
   let body='';for await(const part of req){body+=part;if(body.length>1000000)throw Error('Request too large');}
   const method=req.url.slice('/preview-api/'.length);if(!Object.hasOwn(methods,method))throw Error('Unknown method');
   const result=await methods[method](JSON.parse(body||'{}').payload);
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({result}));return;
  }
  const relative=req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).slice(1);
  const file=path.resolve(ui,relative);if(!file.startsWith(ui+path.sep))throw Error('Invalid path');
  const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.css':'text/css','.js':'text/javascript'}[path.extname(file)]||'application/octet-stream'});res.end(data);
 }catch(error){res.writeHead(req.url.startsWith('/preview-api/')?400:404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`ZPS preview http://127.0.0.1:${server.address().port}`));
