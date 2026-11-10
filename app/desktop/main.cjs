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
let updater;
let updateChecks;
let quitApproved = false;
let pending = Promise.resolve();

const within = (target, directory) => target === directory || target.startsWith(directory + path.sep);
async function confirmDiscard(targets) {
  const dirty = (Array.isArray(targets) ? targets : [targets]).filter(session => session?.dirty || session?.draftDirty);
  if (!dirty.length) return true;
  const { response } = await dialog.showMessageBox(win, { type: 'warning', message: '以下文档的修改尚未导出。是否放弃修改？', detail: dirty.map(session => session.filename).join('\n'), buttons: ['取消', '放弃修改'], defaultId: 0, cancelId: 0 });
  return response === 1;
}
function outputBytes(result) {
  return Buffer.from(result?.bytes ?? result);
}
async function readDocument(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('文件不是有效的数据文件，或超过 32 MB。');
  return { bytes: await fs.readFile(file), filename: file };
}
async function replaceDocument(file) {
  const { bytes, filename } = await readDocument(file);
  return sessions.replace(bytes, filename, { confirmDiscard });
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
  const { canceled, filePath } = await dialog.showSaveDialog(win, { title: '导出数据副本', defaultPath: path.join(app.getPath('documents'), `${stem}_edited${ext}`), filters: [{ name: '插件数据', extensions: ext === '.txt' ? ['txt'] : ['jx3dat'] }] });
  if (canceled || !filePath) return null;
  await atomicExport(filePath, session.bytes);
  return { ...sessions.markSaved(session), exported: true };
}
function configureUpdates() {
  if (!app.isPackaged) { updateState = { status: 'unavailable', message: '开发模式不检查更新。' }; return; }
  try {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.setFeedURL(updateFeed);
    updater.on('checking-for-update', () => { updateState = { status: 'checking' }; });
    updater.on('update-available', info => { updateState = { status: 'available', version: info.version }; });
    updater.on('update-not-available', () => { updateState = { status: 'current' }; });
    updater.on('download-progress', info => { updateState = { status: 'downloading', progress: Math.round(info.percent) }; });
    updater.on('update-downloaded', info => { updateState = { status: 'ready', version: info.version }; });
    updater.on('error', () => { updateState = { status: 'error', message: '更新暂不可用，请稍后重试或从 GitHub 下载。' }; });
    updateChecks = createUpdateChecks({ updater, getState: () => updateState, onError: () => { updateState = { status: 'error', message: '更新暂不可用，将自动重试。' }; } });
    win.on('focus', () => updateChecks.check());
    app.on('will-quit', () => updateChecks.stop());
    updateChecks.start();
  } catch { updateState = { status: 'unavailable', message: '此版本未配置自动更新。' }; }
}
async function updates(action = 'status') {
  if (!['status', 'check', 'download', 'install'].includes(action)) throw new Error('Unknown update action');
  if (!updater || action === 'status') return updateState;
  try {
    if (action === 'check') updateChecks?.check({ force: true });
    if (action === 'download') {
      if (updateState.status !== 'available') throw new Error('Update not available');
      updateState = { status: 'downloading', progress: 0 };
      updater.downloadUpdate().catch(() => { updateState = { status: 'error', message: '更新下载未完成。' }; });
    }
    if (action === 'install') {
      if (updateState.status !== 'ready') throw new Error('Update not ready');
      if (sessions.dirtySessions().some(session => session.draftDirty)) {
        await dialog.showMessageBox(win, { type: 'info', message: '先应用或撤销草稿', detail: '尚有未应用的表单草稿。请在对应功能中应用或撤销草稿后，再安装更新。', buttons: ['确定'] });
        return updateState;
      }
      for (const session of sessions.dirtySessions()) {
        if (!(await save(session))) return updateState;
      }
      const { response } = await dialog.showMessageBox(win, { type: 'question', message: '更新已下载。现在重启并安装？', buttons: ['取消', '重启安装'], defaultId: 0, cancelId: 0 });
      if (response === 1) { quitApproved = true; updater.quitAndInstall(); }
    }
  } catch { updateState = { status: 'error', message: '更新操作未完成。请检查网络或先检查更新。' }; }
  return updateState;
}
async function report(text) {
  const categories = { timeout: /timeout|timed out|超时/i, network: /network|fetch|网络/i, format: /parse|format|编码|格式/i, update: /updat|更新/i };
  const input = typeof text === 'string' ? text.slice(0, 2000) : '';
  const error = Object.keys(categories).find(key => categories[key].test(input)) || 'unspecified';
  const payload = { version: app.getVersion(), platform: process.platform, error, description: input };
  const { canceled, filePath } = await dialog.showSaveDialog(win, { title: '导出本地问题报告', defaultPath: 'zps-report.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (canceled || !filePath) return null;
  await atomicExport(filePath, Buffer.from(JSON.stringify(payload, null, 2) + '\n'));
  return { exported: true };
}
async function start() {
  codec = await import('../core/documents.mjs');
  featureRegistry = await import('../ui/features.mjs');
  const { createFeatureSessions } = await import('../core/feature-sessions.mjs');
  sessions = createFeatureSessions({ codec, ...featureRegistry });
  const manifest = JSON.parse(await fs.readFile(path.join(samplesRoot, 'SAMPLES.json'), 'utf8'));
  sampleList = Object.keys(manifest.files).filter(file => /\.jx3dat$/i.test(file) || /团队气劲\/[^/]+\.txt$/.test(file) || /推荐设置关键词\.txt$/.test(file)).map(file => ({ path: file, name: file, filename: path.basename(file) }));
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
      return sample ? readDocument(path.join(samplesRoot, sample.path)) : null;
    }),
    openSample: async file => {
      if (!sampleList.some(item => item.path === file)) throw new Error('未列出的示例文件。');
      return replaceDocument(path.join(samplesRoot, file));
    },
    open: async () => {
      const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: '插件数据', extensions: ['jx3dat', 'txt'] }] });
      return result.canceled || !result.filePaths[0] ? null : replaceDocument(result.filePaths[0]);
    },
    create: async kind => {
      const result = codec.createDocument(kind);
      return sessions.replace(outputBytes(result), result.filename || ({ 'jx-buff': 'BuffData.jx3dat', 'my-team': 'my-team.txt', chat: 'chat-keywords.txt' }[kind]), { dirty: true, confirmDiscard });
    },
    edit: change => sessions.mutate('editDocument', change),
    add: fields => sessions.mutate('addRecord', fields),
    undo: () => sessions.undo(),
    save: () => save(), lookup: query => catalog.lookup(query), lookupCached: queries => catalog.lookupCached(queries), loadIcon: query => iconCache.load(query), updates, report
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
