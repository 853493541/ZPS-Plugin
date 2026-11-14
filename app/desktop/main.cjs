'use strict';
const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { createCatalog } = require('../services/catalog.cjs');
const { createIconCache } = require('../services/icons.cjs');
const { updateFeed } = require('../services/release.cjs');
const { createUpdateChecks } = require('../services/update-checks.cjs');
const root = path.resolve(__dirname, '../..');
const samplesRoot = app.isPackaged ? path.join(process.resourcesPath, 'samples') : path.join(root, 'samples');
const uiURL = pathToFileURL(path.join(root, 'app/ui/index.html')).href;
let win, codec, catalog, iconCache, sessions, featureRegistry;
let sampleList = [];
let updateState = { status: 'idle' };
let installIntent = { phase: 'idle' };
let updater;
let updateChecks;
let quitApproved = false;
let pending = Promise.resolve();

const within = (target, directory) => target === directory || target.startsWith(directory + path.sep);
async function confirmDiscard(targets) {
  const dirty = (Array.isArray(targets) ? targets : [targets]).filter(session => session?.dirty || session?.draftDirty);
  if (!dirty.length) return true;
  const { response } = await dialog.showMessageBox(win, { type: 'warning', message: '以下文档的修改尚未导出。是否放弃修改？', detail: dirty.map(session => `${session.filename}${session.gameVersion ? ` · ${session.gameVersion}` : ''}\n${session.source.displayPath}`).join('\n\n'), buttons: ['取消', '放弃修改'], defaultId: 0, cancelId: 0 });
  return response === 1;
}
function outputBytes(result) {
  return Buffer.from(result?.bytes ?? result);
}
async function readDocument(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('文件不是有效的数据文件，或超过 32 MB。');
  const canonical = await fs.realpath(file);
  return { bytes: await fs.readFile(canonical), filename: path.basename(canonical), source: { kind: 'file', key: process.platform === 'win32' ? canonical.toLowerCase() : canonical, displayPath: canonical, modifiedAt: stat.mtime.toISOString() } };
}
async function readSample(file) {
  const document = await readDocument(path.join(samplesRoot, file));
  return { ...document, source: { ...document.source, kind: 'sample', key: file, displayPath: file } };
}
function datasetId(value) {
  if (value === undefined) return undefined;
  const id = typeof value === 'string' ? value : value?.datasetId;
  if (typeof id !== 'string' || !id) throw new Error('Invalid dataset identity');
  return id;
}
function mutate(operation, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid edit');
  const { datasetId: id, ...change } = value;
  if (id !== undefined) datasetId(id);
  return sessions.mutate(operation, change, id);
}
function enqueue(operation) {
  const task = pending.then(operation);
  pending = task.catch(() => {});
  return task;
}
async function protectedPath(file) {
  const absolute = path.resolve(file);
  let actual = absolute;
  try { actual = await fs.realpath(absolute); }
  catch { actual = path.join(await fs.realpath(path.dirname(absolute)), path.basename(absolute)); }
  return within(absolute.toLowerCase(), samplesRoot.toLowerCase()) || within(actual.toLowerCase(), samplesRoot.toLowerCase()) || ['vendor', 'samples'].some(dir => within(absolute.toLowerCase(), path.join(root, dir).toLowerCase()) || within(actual.toLowerCase(), path.join(root, dir).toLowerCase()));
}
async function atomicExport(file, bytes) {
  if (await protectedPath(file)) throw new Error('示例和原始插件目录受保护，请选择其他导出位置。');
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('导出目标必须是普通文件。');
      await fs.copyFile(file, `${file}.${Date.now()}.${randomUUID().slice(0, 8)}.bak`, 1);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
async function save(session = sessions.active) {
  if (!session) throw new Error('请先打开或新建数据。');
  const ext = path.extname(session.filename);
  const stem = path.basename(session.filename, ext);
  const version = session.gameVersion ? `_${session.gameVersion.replace(/[<>:"/\\|?*]/g, '_')}` : '';
  const { canceled, filePath } = await dialog.showSaveDialog(win, { title: '导出数据副本', defaultPath: path.join(app.getPath('documents'), `${stem}${version}_edited${ext}`), filters: [{ name: '插件数据', extensions: ext === '.txt' ? ['txt'] : ['jx3dat'] }] });
  if (canceled || !filePath) return null;
  await atomicExport(filePath, session.bytes);
  return { ...sessions.markSaved(session), exported: true, exportedPath: filePath, exportedDataset: sessions.summary(session) };
}
function publicUpdateState() {
  const { blocked, message } = installIntent;
  return { ...updateState, installRequested: ['requested', 'started'].includes(installIntent.phase), ...(blocked ? { blocked, message } : {}) };
}
function setUpdateState(state) {
  if (state.version !== updateState.version) installIntent = { phase: 'idle' };
  updateState = state;
}
function updateFailed(message) {
  installIntent = { phase: 'idle' };
  quitApproved = false;
  updateState = { status: 'error', ...(updateState.version ? { version: updateState.version } : {}), message };
}
function blockInstallForEdits() {
  const dirty = sessions.dirtySessions();
  if (!dirty.length) return false;
  installIntent = { phase: 'blocked', blocked: dirty.some(session => session.draftDirty) ? 'drafts' : 'edits', message: '请先保存或撤销修改，再安装更新。' };
  return true;
}
function finishRequestedInstall() {
  if (installIntent.phase !== 'requested' || updateState.status !== 'ready' || installIntent.version !== updateState.version) return;
  if (blockInstallForEdits()) return;
  installIntent = { ...installIntent, phase: 'started' };
  quitApproved = true;
  try { updater.quitAndInstall(true, true); }
  catch { updateFailed('更新安装未完成，请重试安装或重新检查更新。'); }
}
function configureUpdates() {
  if (!app.isPackaged) { updateState = { status: 'unavailable', message: '开发模式不检查更新。' }; return; }
  try {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.setFeedURL(updateFeed);
    updater.on('checking-for-update', () => { setUpdateState({ status: 'checking', ...(updateState.version ? { version: updateState.version } : {}) }); });
    updater.on('update-available', info => { setUpdateState({ status: 'available', version: info.version }); });
    updater.on('update-not-available', () => { setUpdateState({ status: 'current' }); });
    updater.on('download-progress', info => { setUpdateState({ status: 'downloading', version: updateState.version, progress: Math.round(info.percent) }); });
    updater.on('update-downloaded', info => {
      setUpdateState({ status: 'ready', version: info.version });
      void enqueue(finishRequestedInstall);
    });
    updater.on('error', () => { updateFailed('更新暂不可用，请重试或从 GitHub 下载。'); });
    updateChecks = createUpdateChecks({ updater, getState: () => updateState, onError: () => { updateFailed('更新暂不可用，请重试检查更新。'); } });
    win.on('focus', () => updateChecks.check());
    app.on('will-quit', () => updateChecks.stop());
    updateChecks.start();
  } catch { updateState = { status: 'unavailable', message: '此版本未配置自动更新。' }; }
}
async function updates(action = 'status') {
  if (!['status', 'check', 'download', 'install'].includes(action)) throw new Error('Unknown update action');
  if (!updater || action === 'status') return publicUpdateState();
  try {
    if (action === 'check') updateChecks?.check({ force: true });
    if (action === 'download') {
      if (updateState.status !== 'available') throw new Error('Update not available');
      if (!updater.autoDownload) {
        setUpdateState({ status: 'downloading', version: updateState.version, progress: 0 });
        updater.downloadUpdate().catch(() => { updateFailed('更新下载未完成，请重试检查更新。'); });
      }
    }
    if (action === 'install' && !['requested', 'started'].includes(installIntent.phase)) {
      if (!['available', 'downloading', 'ready'].includes(updateState.status) || !updateState.version) throw new Error('Update not available');
      if (!blockInstallForEdits()) {
        installIntent = { phase: 'requested', version: updateState.version };
        finishRequestedInstall();
      }
    }
  } catch { updateFailed('更新操作未完成。请检查网络并重新检查更新。'); }
  return publicUpdateState();
}
async function start() {
  codec = await import('../core/documents.mjs');
  featureRegistry = await import('../ui/features.mjs');
  const { createFeatureSessions } = await import('../core/feature-sessions.mjs');
  sessions = createFeatureSessions({ codec, ...featureRegistry });
  const manifest = JSON.parse(await fs.readFile(path.join(samplesRoot, 'SAMPLES.json'), 'utf8'));
  sampleList = Object.keys(manifest.files).filter(file => /\.jx3dat$/i.test(file) || /团队气劲\/[^/]+\.txt$/.test(file) || /推荐设置关键词\.txt$/.test(file)).map(file => ({ path: file, name: file, filename: path.basename(file), ...(manifest.files[file].modifiedAt ? { modifiedAt: manifest.files[file].modifiedAt } : {}) }));
  catalog = createCatalog({ fetch: (...args) => net.fetch(...args), cacheDir: path.join(app.getPath('userData'), 'buff-cache') });
  iconCache = createIconCache({ fetch: (...args) => net.fetch(...args), cacheDir: path.join(app.getPath('userData'), 'icon-cache') });
  win = new BrowserWindow({ width: 1360, height: 900, minWidth: 1000, minHeight: 680, title: 'ZPS 数据工坊', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  const handlers = {
    samples: () => sampleList,
    setDraftState: value => sessions.setDraftState(value),
    activateFeature: id => sessions.activate(id, async featureId => {
      const sample = sampleList.find(item => featureRegistry.featureForSample(item.path) === featureId);
      return sample ? readSample(sample.path) : null;
    }),
    activateDataset: id => sessions.activateDataset(datasetId(id)),
    closeDataset: id => sessions.closeDataset(datasetId(id), { confirmDiscard }),
    openSample: async file => {
      if (!sampleList.some(item => item.path === file)) throw new Error('未列出的示例文件。');
      const sample = await readSample(file);
      return sessions.open(sample.bytes, sample.filename, sample);
    },
    open: async () => {
      const result = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: '插件数据', extensions: ['jx3dat', 'txt'] }] });
      if (result.canceled || !result.filePaths.length) return null;
      const documents = await Promise.all(result.filePaths.map(readDocument));
      return sessions.openMany(documents);
    },
    create: async value => {
      const input = typeof value === 'string' ? { kind: value } : value;
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid new dataset');
      const { kind, gameVersion = '' } = input;
      const result = codec.createDocument(kind);
      const filename = input.filename ?? result.filename ?? ({ 'jx-buff': 'BuffData.jx3dat', 'my-team': 'my-team.txt', chat: 'chat-keywords.txt' }[kind]);
      if (typeof filename !== 'string' || !filename.trim() || filename.length > 255 || /[<>:"/\\|?*\x00-\x1f]/.test(filename)) throw new Error('Invalid dataset filename');
      const extension = kind === 'jx-buff' ? '.jx3dat' : '.txt';
      if (!filename.toLowerCase().endsWith(extension)) throw new Error(`数据文件名需要以 ${extension} 结尾。`);
      return sessions.open(outputBytes(result), filename, { dirty: true, gameVersion });
    },
    edit: change => mutate('editDocument', change),
    add: fields => mutate('addRecord', fields),
    undo: value => sessions.undo(datasetId(value)),
    duplicate: value => sessions.duplicate(datasetId(value), value?.gameVersion ?? ''),
    save: value => save(sessions.resolve(datasetId(value))), lookup: query => catalog.lookup(query), lookupCached: queries => catalog.lookupCached(queries), loadIcon: query => iconCache.load(query), updates
  };
  for (const [name, handler] of Object.entries(handlers)) {
    ipcMain.handle(`studio:${name}`, (event, payload) => {
      if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== uiURL) throw new Error('Untrusted IPC sender');
      if (name === 'lookup' || name === 'lookupCached' || name === 'loadIcon' || name === 'samples' || name === 'updates' && payload !== 'install') return handler(payload);
      return enqueue(() => handler(payload));
    });
  }
  let closing = false;
  win.on('close', event => {
    if (quitApproved) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    enqueue(async () => {
      if (await confirmDiscard(sessions.dirtySessions())) {
        quitApproved = true;
        if (updateState.status === 'ready') updater.quitAndInstall(true, false);
        else win.close();
      }
    }).catch(() => {}).finally(() => { closing = false; });
  });
  await win.loadFile(path.join(root, 'app/ui/index.html'));
  configureUpdates();
}
app.whenReady().then(start).catch(() => { dialog.showErrorBox('启动失败', '应用无法加载。请重新安装或检查数据文件。'); app.quit(); });
app.on('window-all-closed', () => app.quit());
