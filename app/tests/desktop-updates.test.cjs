'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function createFixture(t, response = 0) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'zps-auto-update-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = path.resolve(__dirname, '../..');
  const uiURL = pathToFileURL(path.join(root, 'app/ui/index.html')).href;
  const handlers = new Map(), appEvents = new Map();
  const installs = [], dialogs = [];
  const updater = new EventEmitter();
  let checks = 0, win, resolveReady, rejectReady;
  const ready = new Promise((resolve,reject) => {resolveReady=resolve;rejectReady=reject;});
  updater.setFeedURL = () => {};
  updater.checkForUpdates = async () => { checks++; };
  updater.quitAndInstall = (...args) => installs.push(args);
  const electron = {
    app: { isPackaged: true, whenReady: () => Promise.resolve(), on: (event,handler) => appEvents.set(event,handler), getPath: () => temporary, quit(){} },
    net: {fetch: async () => {throw Error('No network needed');}},
    ipcMain: {handle: (name,handler) => handlers.set(name,handler)},
    dialog: {
      showErrorBox: (_,message) => rejectReady(Error(message)),
      showMessageBox: async (_,options) => {dialogs.push(options);return{response};},
      showSaveDialog: async (_, options) => ({canceled:false,filePath:path.join(temporary,path.basename(options.defaultPath))})
    },
    BrowserWindow: class {
      constructor(){win=this;this.events=new Map();this.webContents={mainFrame:{url:uiURL},setWindowOpenHandler(){},on(){}};}
      on(name,handler){this.events.set(name,handler);}
      async loadFile(){resolveReady();}
      close(){}
    }
  };
  const originalResources = Object.getOwnPropertyDescriptor(process,'resourcesPath');
  Object.defineProperty(process,'resourcesPath',{value:root,configurable:true});
  const modules=[['electron',electron],['electron-updater',{autoUpdater:updater}]].map(([name,exports])=>{
    const file=require.resolve(name),previous=require.cache[file];require.cache[file]={exports};return{file,previous};
  });
  const mainFile = require.resolve('../desktop/main.cjs');
  const previousMain = require.cache[mainFile];
  delete require.cache[mainFile];
  t.after(()=>{
    appEvents.get('will-quit')?.();
    for(const {file,previous} of modules){if(previous)require.cache[file]=previous;else delete require.cache[file];}
    if(previousMain)require.cache[mainFile]=previousMain;else delete require.cache[mainFile];
    if(originalResources)Object.defineProperty(process,'resourcesPath',originalResources);else delete process.resourcesPath;
  });
  require('../desktop/main.cjs');await ready;await new Promise(resolve=>setImmediate(resolve));
  const event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
  const invoke=(name,payload)=>handlers.get(`studio:${name}`)(event,payload);
  return { temporary, updater, installs, dialogs, win, invoke, checks };
}

test('automatic downloads and guarded close protect drafts and unexported edits', async t => {
  const { temporary, updater, installs, dialogs, win, invoke, checks } = await createFixture(t);
  assert.equal(updater.autoDownload,true);
  assert.equal(updater.autoInstallOnAppQuit,false,'installation must use the guarded close path');
  assert.equal(checks,1);
  const snapshot=await invoke('activateFeature','jx-buff');
  const buff=snapshot.document.records.find(record=>record.id);
  await invoke('edit',{key:buff.key,fields:{nPower:11}});
  updater.emit('update-downloaded',{version:'0.1.1'});
  let prevented=false;win.events.get('close')({preventDefault(){prevented=true;}});
  await invoke('activateFeature','jx-buff');
  assert.equal(prevented,true);assert.equal(installs.length,0);
  assert.match(dialogs.at(-1).message,/未导出/);
  const second = await invoke('create', {kind:'jx-buff', filename:'other.jx3dat', gameVersion:'测试版本'});
  await invoke('setDraftState',{datasetId:snapshot.datasetId,dirty:true});
  await invoke('updates','install');
  assert.equal(installs.length,0);assert.match(dialogs.at(-1).message,/草稿/);
  assert.equal((await invoke('undo')).datasetId,second.datasetId,'an inactive draft must block restart without changing selection');
  await invoke('setDraftState',{datasetId:snapshot.datasetId,dirty:false});
  await invoke('updates','install');
  assert.equal(installs.length,0,'canceling restart must keep the app open after exporting both datasets');
  assert.equal((await invoke('undo')).datasetId,second.datasetId,'exporting inactive update targets must preserve selection');
  assert.equal((await fs.readdir(temporary)).filter(file=>file.endsWith('.jx3dat')).length,2);
  assert.equal((await invoke('activateDataset',snapshot.datasetId)).dirty,false);
  assert.equal((await invoke('activateDataset',second.datasetId)).dirty,false);
  win.events.get('close')({preventDefault(){}});
  await invoke('activateFeature','jx-buff');
  assert.deepEqual(installs,[[true,false]],'clean normal close silently installs without reopening');
});

test('accepted restart silently installs the downloaded update and relaunches', async t => {
  const { updater, installs, dialogs, invoke } = await createFixture(t, 1);
  updater.emit('update-downloaded', {version: '0.1.1'});
  await invoke('updates', 'install');
  assert.equal(dialogs.at(-1).type, 'question');
  assert.deepEqual(installs, [[true, true]], 'accepted restart must silently update and reopen the app');
});
