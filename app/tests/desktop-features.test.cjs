'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

test('desktop IPC adds independent datasets, exports inactive targets and guards all datasets on close', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'zps-feature-ipc-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const handlers = new Map();
  const dialogs = [];
  const root = path.resolve(__dirname, '../..');
  const uiURL = pathToFileURL(path.join(root, 'app/ui/index.html')).href;
  let window;
  let openFiles = [];
  let saveFile = path.join(temporary, 'edited.jx3dat');
  let discardResponse = 0;
  let openOptions, saveOptions;
  let closed = false;
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const menus = [];
  const electron = {
    app: { isPackaged: false, whenReady: () => Promise.resolve(), on() {}, quit() {}, getPath: () => temporary },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    Menu: { setApplicationMenu: menu => menus.push(menu) },
    net: { fetch: async () => { throw new Error('No network needed'); } },
    dialog: {
      showMessageBox: async (_, options) => { dialogs.push(options); return { response: discardResponse }; },
      showOpenDialog: async (_, options) => { openOptions = options; return { canceled: false, filePaths: openFiles }; },
      showSaveDialog: async (_, options) => { saveOptions = options; return { canceled: false, filePath: saveFile }; },
      showErrorBox: (_, message) => readyReject(new Error(message))
    },
    BrowserWindow: class {
      constructor() {
        window = this;
        this.events = new Map();
        this.webContents = { mainFrame: { url: uiURL }, setWindowOpenHandler() {}, on() {} };
      }
      on(name, handler) { this.events.set(name, handler); }
      async loadFile() { readyResolve(); }
      close() { const event = { preventDefault() {} }; this.events.get('close')(event); closed = true; }
    }
  };
  const electronPath = require.resolve('electron');
  const previous = require.cache[electronPath];
  require.cache[electronPath] = { exports: electron };
  t.after(() => { if (previous) require.cache[electronPath] = previous; else delete require.cache[electronPath]; });
  require('../desktop/main.cjs');
  await ready;
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  const invoke = (name, payload) => handlers.get(`studio:${name}`)(event, payload);
  assert.deepEqual(menus, [null], 'the default Electron menu bar is removed');
  const samples = await invoke('samples');
  const jx = await invoke('activateFeature', 'jx-buff');
  const buff = jx.document.records.find(record => record.id === 12784);
  await invoke('edit', { key: buff.key, fields: { nPower: 11 } });
  const team = await invoke('activateFeature', 'my-team');
  await invoke('edit', { key: team.document.records[0].key, fields: { label: '独立团队修改' } });
  await invoke('activateFeature', 'chat');
  let prevented = false;
  window.events.get('close')({ preventDefault() { prevented = true; } });
  await invoke('undo');
  assert.equal(prevented, true);
  assert.equal(closed, false);
  assert.match(dialogs.at(-1).detail, /BuffData\.jx3dat/);
  assert.match(dialogs.at(-1).detail, /团队气劲/);
  const samplePath = samples.find(sample => sample.path.endsWith('/BuffData.jx3dat')).path;
  const reopened = await invoke('openSample', samplePath);
  assert.equal(reopened.datasetId, jx.datasetId, 'reopening an exact sample preserves its session');
  assert.equal(reopened.document.records.find(record => record.id === 12784).fields.nPower, 11);
  const directoryOne = path.join(temporary, 'one');
  const directoryTwo = path.join(temporary, 'two');
  await Promise.all([fs.mkdir(directoryOne), fs.mkdir(directoryTwo)]);
  const original = await fs.readFile(path.join(root, 'samples', samplePath));
  const fileOne = path.join(directoryOne, 'BuffData.jx3dat');
  const fileTwo = path.join(directoryTwo, 'BuffData.jx3dat');
  await Promise.all([fs.writeFile(fileOne, original), fs.writeFile(fileTwo, original)]);
  const [canonicalOne, canonicalTwo] = await Promise.all([fs.realpath(fileOne), fs.realpath(fileTwo)]);
  openFiles = [fileOne, fileTwo];
  const imported = await invoke('open');
  assert.ok(openOptions.properties.includes('multiSelections'));
  assert.equal(imported.datasets.length, 3);
  const firstFile = imported.datasets.find(dataset => dataset.source.displayPath === canonicalOne);
  const secondFile = imported.datasets.find(dataset => dataset.source.displayPath === canonicalTwo);
  assert.notEqual(firstFile.datasetId, secondFile.datasetId);
  assert.notEqual(firstFile.datasetId, jx.datasetId);
  await invoke('edit', { datasetId: firstFile.datasetId, key: buff.key, fields: { nPower: 19 } });
  assert.equal((await invoke('undo', { datasetId: secondFile.datasetId })).datasetId, secondFile.datasetId);
  const saved = await invoke('save', { datasetId: firstFile.datasetId });
  assert.equal(saved.datasetId, secondFile.datasetId, 'inactive export must preserve the active dataset');
  assert.equal(saved.exportedPath, saveFile);
  assert.equal(saved.exportedDataset.datasetId, firstFile.datasetId);
  assert.equal(saved.exportedDataset.source.displayPath, canonicalOne, 'export keeps source identity');
  const { openDocument } = await import('../core/documents.mjs');
  const output = openDocument(await fs.readFile(saveFile), saveFile);
  assert.equal(output.records.find(record => record.id === 12784).fields.nPower, 19);
  assert.deepEqual(await fs.readFile(fileOne), original, 'import never overwrites the original');
  openFiles = [fileOne];
  const retained = await invoke('open');
  assert.equal(retained.datasetId, firstFile.datasetId);
  assert.equal(retained.document.records.find(record => record.id === 12784).fields.nPower, 19);
  const invalidFile = path.join(temporary, 'invalid.jx3dat');
  await fs.writeFile(invalidFile, 'return os.execute("unsafe")');
  openFiles = [fileTwo, invalidFile];
  await assert.rejects(invoke('open'));
  assert.deepEqual(await invoke('undo', { datasetId: secondFile.datasetId }), retained);
  await invoke('setDraftState', { datasetId: firstFile.datasetId, dirty: true });
  await invoke('activateDataset', secondFile.datasetId);
  assert.equal(await invoke('closeDataset', firstFile.datasetId), null);
  assert.equal((await invoke('undo')).datasets.length, 3);
  discardResponse = 1;
  assert.equal((await invoke('closeDataset', firstFile.datasetId)).datasetId, secondFile.datasetId);
  discardResponse = 0;
  const created = await invoke('create', { kind: 'jx-buff', filename: '自定义气劲.jx3dat', gameVersion: '丝路风雨' });
  assert.equal(created.datasets.length, 3);
  assert.equal(created.gameVersion, '丝路风雨');
  await invoke('save', created.datasetId);
  assert.match(saveOptions.defaultPath, /自定义气劲_丝路风雨_edited/);
  const before = await invoke('undo');
  await assert.rejects(invoke('create', { kind: 'jx-buff', filename: '../bad.jx3dat' }));
  await assert.rejects(invoke('create', { kind: 'jx-buff', filename: 'bad.txt' }));
  await assert.rejects(invoke('create', { kind: 'jx-buff', gameVersion: 42 }));
  await assert.rejects(invoke('save', 'missing'));
  await assert.rejects(invoke('edit', { datasetId: 'missing', key: buff.key, fields: { nPower: 1 } }));
  assert.deepEqual(await invoke('undo'), before);
  await assert.rejects(invoke('activateFeature', 'unknown'));
  assert.throws(() => handlers.get('studio:activateFeature')({ sender: {} }, 'chat'), /Untrusted/);
  await invoke('activateFeature', 'chat');
  await invoke('setDraftState', { datasetId: jx.datasetId, dirty: true });
  window.events.get('close')({ preventDefault() {} });
  await invoke('undo');
  assert.match(dialogs.at(-1).detail, /BuffData\.jx3dat/, 'inactive drafts must guard close');
});
