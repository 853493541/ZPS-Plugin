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
  const installs = [], dialogs = [], exports = [];
  let downloads = 0;
  const updater = new EventEmitter();
  let checks = 0, win, resolveReady, rejectReady;
  const ready = new Promise((resolve,reject) => {resolveReady=resolve;rejectReady=reject;});
  updater.setFeedURL = () => {};
  updater.checkForUpdates = async () => { checks++; };
  updater.quitAndInstall = (...args) => installs.push(args);
  updater.downloadUpdate = async () => { downloads++; };
  const electron = {
    app: { isPackaged: true, whenReady: () => Promise.resolve(), on: (event,handler) => appEvents.set(event,handler), getPath: () => temporary, quit(){} },
    net: {fetch: async () => {throw Error('No network needed');}},
    ipcMain: {handle: (name,handler) => handlers.set(name,handler)},
    dialog: {
      showErrorBox: (_,message) => rejectReady(Error(message)),
      showMessageBox: async (_,options) => {dialogs.push(options);return{response};},
      showSaveDialog: async (_, options) => { exports.push(options); return {canceled:false,filePath:path.join(temporary,path.basename(options.defaultPath))}; }
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
  return { temporary, updater, installs, dialogs, exports, win, invoke, checks, downloads: () => downloads };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const available = updater => updater.emit('update-available', { version: '0.1.5' });
const downloaded = updater => updater.emit('update-downloaded', { version: '0.1.5' });

async function editBuff(invoke, datasetId) {
  const snapshot = datasetId ? await invoke('activateDataset', datasetId) : await invoke('activateFeature', 'jx-buff');
  const buff = snapshot.document.records.find(record => record.id);
  await invoke('edit', { datasetId: snapshot.datasetId, key: buff.key, fields: { nPower: 11 } });
  return snapshot;
}

test('clean ready update installs once and relaunches with no native dialogs', async t => {
  const { updater, installs, dialogs, exports, invoke, checks } = await createFixture(t);
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(checks, 1);
  downloaded(updater);
  await flush();
  assert.deepEqual(installs, [], 'background completion must wait for explicit install');
  const state = await invoke('updates', 'install');
  assert.equal(state.installRequested, true);
  await invoke('updates', 'install');
  downloaded(updater);
  await flush();
  assert.deepEqual(installs, [[true, true]]);
  assert.deepEqual(dialogs, []);
  assert.deepEqual(exports, []);
});

for (const phase of ['available', 'downloading']) {
  test(`install intent during ${phase} waits for download without starting another download`, async t => {
    const { updater, installs, dialogs, exports, invoke, downloads } = await createFixture(t);
    available(updater);
    if (phase === 'downloading') updater.emit('download-progress', { percent: 23.5 });
    const results = await Promise.all([invoke('updates', 'install'), invoke('updates', 'install')]);
    assert.ok(results.every(state => state.installRequested && state.version === '0.1.5'));
    assert.deepEqual(installs, []);
    assert.equal(downloads(), 0);
    assert.equal((await invoke('updates', 'status')).installRequested, true);
    downloaded(updater);
    await flush();
    assert.deepEqual(installs, [[true, true]]);
    assert.deepEqual(dialogs, []);
    assert.deepEqual(exports, []);
  });
}

for (const inactive of [false, true]) {
  for (const draft of [false, true]) {
    test(`${inactive ? 'inactive' : 'active'} dataset ${draft ? 'drafts' : 'edits'} block install inline without export`, async t => {
      const { updater, installs, dialogs, exports, invoke, temporary } = await createFixture(t);
      const first = await invoke('activateFeature', 'jx-buff');
      if (draft) await invoke('setDraftState', { datasetId: first.datasetId, dirty: true });
      else await editBuff(invoke, first.datasetId);
      let activeId = first.datasetId;
      if (inactive) activeId = (await invoke('activateFeature', 'chat')).datasetId;
      downloaded(updater);
      const result = await invoke('updates', 'install');
      assert.equal(result.blocked, draft ? 'drafts' : 'edits');
      assert.equal(result.installRequested, false);
      assert.equal(result.message, '请先保存或撤销修改，再安装更新。');
      assert.equal((await invoke('updates', 'status')).blocked, result.blocked);
      assert.equal((await invoke('undo')).datasetId, activeId, 'blocked install preserves dataset selection');
      assert.deepEqual(installs, []);
      assert.deepEqual(dialogs, []);
      assert.deepEqual(exports, []);
      assert.equal((await fs.readdir(temporary)).filter(file => file.endsWith('.jx3dat')).length, 0);
    });
  }
}

test('blocked install requires a new click after edits are resolved', async t => {
  const { updater, installs, dialogs, exports, invoke } = await createFixture(t);
  const first = await editBuff(invoke);
  available(updater);
  assert.equal((await invoke('updates', 'install')).blocked, 'edits');
  await invoke('undo', first.datasetId);
  downloaded(updater);
  await flush();
  assert.deepEqual(installs, []);
  const result = await invoke('updates', 'install');
  assert.equal(result.installRequested, true);
  assert.equal(result.blocked, undefined);
  assert.deepEqual(installs, [[true, true]]);
  assert.deepEqual(dialogs, []);
  assert.deepEqual(exports, []);
});

for (const draft of [false, true]) {
  test(`${draft ? 'drafts' : 'edits'} created during download clear intent and require explicit retry`, async t => {
    const { updater, installs, dialogs, exports, invoke } = await createFixture(t);
    const first = await invoke('activateFeature', 'jx-buff');
    available(updater);
    await invoke('updates', 'install');
    if (draft) await invoke('setDraftState', { datasetId: first.datasetId, dirty: true });
    else await editBuff(invoke, first.datasetId);
    await invoke('activateFeature', 'chat');
    downloaded(updater);
    await flush();
    const blocked = await invoke('updates', 'status');
    assert.equal(blocked.installRequested, false);
    assert.equal(blocked.blocked, draft ? 'drafts' : 'edits');
    assert.deepEqual(installs, []);
    if (draft) await invoke('setDraftState', { datasetId: first.datasetId, dirty: false });
    else await invoke('undo', first.datasetId);
    downloaded(updater);
    await flush();
    assert.deepEqual(installs, [], 'resolving edits never revives earlier consent');
    await invoke('updates', 'install');
    assert.deepEqual(installs, [[true, true]]);
    assert.deepEqual(dialogs, []);
    assert.deepEqual(exports, []);
  });
}

test('download error clears consent, retains version, and permits a fresh check', async t => {
  const { updater, installs, invoke } = await createFixture(t);
  available(updater);
  await invoke('updates', 'install');
  updater.emit('error', Error('download failed'));
  const result = await invoke('updates', 'status');
  assert.equal(result.status, 'error');
  assert.equal(result.version, '0.1.5');
  assert.equal(result.installRequested, false);
  assert.match(result.message, /重试/);
  let checks = 0;
  updater.checkForUpdates = async () => { checks++; };
  await invoke('updates', 'check');
  await flush();
  assert.equal(checks, 1);
  downloaded(updater);
  await flush();
  assert.deepEqual(installs, []);
  await invoke('updates', 'install');
  assert.deepEqual(installs, [[true, true]]);
});

test('a different update version clears intent instead of carrying consent forward', async t => {
  const { updater, installs, invoke } = await createFixture(t);
  available(updater);
  await invoke('updates', 'install');
  updater.emit('update-available', { version: '0.1.6' });
  assert.equal((await invoke('updates', 'status')).installRequested, false);
  updater.emit('update-downloaded', { version: '0.1.6' });
  await flush();
  assert.deepEqual(installs, []);
  await invoke('updates', 'install');
  assert.deepEqual(installs, [[true, true]]);
});

test('installation errors restore normal close protection', async t => {
  const { updater, installs, dialogs, invoke, win } = await createFixture(t);
  downloaded(updater);
  await invoke('updates', 'install');
  updater.emit('error', Error('installer failed'));
  await editBuff(invoke);
  let prevented = false;
  win.events.get('close')({ preventDefault() { prevented = true; } });
  await flush();
  assert.equal(prevented, true);
  assert.match(dialogs.at(-1).message, /未导出/);
  assert.deepEqual(installs, [[true, true]], 'cancelled close must not attempt another install');
});

test('normal close still guards inactive edits and drafts without exporting', async t => {
  const { updater, installs, dialogs, exports, win, invoke } = await createFixture(t);
  const first = await editBuff(invoke);
  await invoke('setDraftState', { datasetId: first.datasetId, dirty: true });
  await invoke('activateFeature', 'chat');
  downloaded(updater);
  let prevented = false;
  win.events.get('close')({ preventDefault() { prevented = true; } });
  await flush();
  assert.equal(prevented, true);
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0].message, /未导出/);
  assert.deepEqual(installs, []);
  assert.deepEqual(exports, []);
});

test('accepted guarded normal close silently installs without relaunching', async t => {
  const { updater, installs, dialogs, exports, win, invoke } = await createFixture(t, 1);
  await editBuff(invoke);
  downloaded(updater);
  win.events.get('close')({ preventDefault() {} });
  await flush();
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0].message, /未导出/);
  assert.deepEqual(installs, [[true, false]]);
  assert.deepEqual(exports, []);
});

test('clean normal close silently installs a ready update without install intent', async t => {
  const { updater, installs, dialogs, win, invoke } = await createFixture(t);
  downloaded(updater);
  await flush();
  assert.equal((await invoke('updates', 'status')).installRequested, false);
  win.events.get('close')({ preventDefault() {} });
  await flush();
  assert.deepEqual(installs, [[true, false]]);
  assert.deepEqual(dialogs, []);
});
