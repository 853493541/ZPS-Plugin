'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

test('desktop IPC retains feature edits, protects dirty destinations and guards inactive documents on close', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'zps-feature-ipc-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const handlers = new Map();
  const dialogs = [];
  const root = path.resolve(__dirname, '../..');
  const uiURL = pathToFileURL(path.join(root, 'app/ui/index.html')).href;
  let window;
  let openFile;
  let closed = false;
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const electron = {
    app: { isPackaged: false, whenReady: () => Promise.resolve(), on() {}, quit() {}, getPath: () => temporary },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    net: { fetch: async () => { throw new Error('No network needed'); } },
    dialog: {
      showMessageBox: async (_, options) => { dialogs.push(options); return { response: 0 }; },
      showOpenDialog: async () => ({ canceled: false, filePaths: [openFile] }),
      showSaveDialog: async () => ({ canceled: false, filePath: path.join(temporary, 'edited.jx3dat') }),
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
  openFile = path.join(root, 'samples', samples.find(sample => sample.path.endsWith('/BuffData.jx3dat')).path);
  assert.equal(await invoke('open'), null);
  assert.equal((await invoke('undo')).featureId, 'chat', 'canceling a destination replacement must not switch tabs');
  const retained = await invoke('activateFeature', 'jx-buff');
  assert.equal(retained.document.records.find(record => record.id === 12784).fields.nPower, 11);
  assert.equal(retained.dirty, true);
  assert.equal(retained.canUndo, true);
  await assert.rejects(invoke('activateFeature', 'unknown'));
  assert.throws(() => handlers.get('studio:activateFeature')({ sender: {} }, 'chat'), /Untrusted/);
  const saved = await invoke('save');
  assert.equal(saved.dirty, false);
  const { openDocument } = await import('../core/documents.mjs');
  const output = openDocument(await fs.readFile(path.join(temporary, 'edited.jx3dat')), 'edited.jx3dat');
  assert.equal(output.records.find(record => record.id === 12784).fields.nPower, 11);
  const retainedTeam = await invoke('activateFeature', 'my-team');
  assert.equal(retainedTeam.document.records[0].fields.label, '独立团队修改');
  assert.equal(retainedTeam.dirty, true);
  await invoke('setDraftState', { featureId: 'jx-buff', dirty: true });
  await invoke('activateFeature', 'chat');
  window.events.get('close')({ preventDefault() {} });
  await invoke('undo');
  assert.match(dialogs.at(-1).detail, /BuffData\.jx3dat/, 'inactive unapplied drafts must guard close even when exported bytes are clean');
  assert.equal(await invoke('open'), null, 'a draft-only destination must require discard confirmation');
  assert.equal((await invoke('undo')).featureId, 'chat');
  await invoke('setDraftState', { featureId: 'jx-buff', dirty: false });
  const count = dialogs.length;
  assert.equal((await invoke('open')).featureId, 'jx-buff');
  assert.equal(dialogs.length, count, 'clearing the draft must remove the draft-only discard guard');
});
