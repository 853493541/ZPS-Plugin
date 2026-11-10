import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import * as codec from '../app/core/documents.mjs';
import { createFeatureSessions } from '../app/core/feature-sessions.mjs';
import * as featureRegistry from '../app/ui/features.mjs';
import { createCatalog } from '../app/services/catalog.cjs';
import { createIconCache } from '../app/services/icons.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = createCatalog({ fetch, cacheDir: process.env.PREVIEW_CACHE_DIR || path.join(root, 'artifacts', 'preview-buff-cache') });
const iconCache = createIconCache({ fetch, cacheDir: process.env.PREVIEW_ICON_CACHE_DIR || path.join(root, 'artifacts', 'preview-icon-cache') });
const ui = path.join(root, 'app/ui');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'samples/SAMPLES.json'), 'utf8'));
const files = Object.keys(manifest.files).filter(p => p.endsWith('.jx3dat') || p.includes('团队气劲') && p.endsWith('.txt') || p.includes('推荐设置关键词'));
const sessions = createFeatureSessions({ codec, ...featureRegistry });
const confirmations = new WeakMap();
let pending = Promise.resolve();
const readSample = async file => ({ bytes: await fs.readFile(path.join(root, 'samples', file)), filename: path.basename(file), source: { kind: 'sample', key: file, displayPath: file } });
function datasetId(value) {
  if (value === undefined) return undefined;
  const id = typeof value === 'string' ? value : value?.datasetId;
  if (typeof id !== 'string' || !id) throw Error('Invalid dataset identity');
  return id;
}
function mutate(operation, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid edit');
  const { datasetId: id, ...change } = value;
  if (id !== undefined) datasetId(id);
  return sessions.mutate(operation, change, id);
}
class ConfirmationRequired extends Error {
  constructor(confirmation) {
    super('Discard confirmation required');
    this.confirmation = confirmation;
  }
}
function confirmDiscard(token) {
  return session => {
    const previous = confirmations.get(session);
    if (previous && previous.token === token && previous.bytes === session.bytes && previous.draftDirty === session.draftDirty) {
      confirmations.delete(session);
      return true;
    }
    const confirmation = { token: randomUUID(), bytes: session.bytes, draftDirty: session.draftDirty };
    confirmations.set(session, confirmation);
    throw new ConfirmationRequired({ token: confirmation.token, filename: session.filename, featureId: session.featureId, datasetId: session.datasetId, displayPath: session.source.displayPath, gameVersion: session.gameVersion });
  };
}
const methods = {
  samples: () => files.map(file => ({ path: file, name: file, filename: path.basename(file) })),
  activateDataset: id => sessions.activateDataset(datasetId(id)),
  closeDataset: (id, confirmDiscard) => sessions.closeDataset(datasetId(id), { confirmDiscard }),
  setDraftState: value => sessions.setDraftState(value),
  activateFeature: id => sessions.activate(id, async featureId => {
    const file = files.find(file => featureRegistry.featureForSample(file) === featureId);
    return file ? readSample(file) : null;
  }),
  openSample: async file => {
    if (!files.includes(file)) throw Error('Unknown sample');
    const sample = await readSample(file);
    return sessions.open(sample.bytes, sample.filename, sample);
  },
  open: () => { throw Error('Use the sample library in browser preview. Native files open in the Windows application.'); },
  create: value => {
    const input = typeof value === 'string' ? { kind: value } : value;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid new dataset');
    const { kind, gameVersion = '' } = input;
    const result = codec.createDocument(kind);
    const filename = input.filename ?? result.filename ?? { 'jx-buff': 'BuffData.jx3dat', 'my-team': 'my-team.txt', chat: 'chat-keywords.txt' }[kind];
    if (typeof filename !== 'string' || /[<>:"/\\|?*\x00-\x1f]/.test(filename)) throw Error('Invalid dataset filename');
    const extension = kind === 'jx-buff' ? '.jx3dat' : '.txt';
    if (!filename.toLowerCase().endsWith(extension)) throw new Error(`数据文件名需要以 ${extension} 结尾。`);
    return sessions.open(result.bytes ?? result, filename, { dirty: true, gameVersion });
  },
  edit: change => mutate('editDocument', change),
  add: fields => mutate('addRecord', fields),
  undo: value => sessions.undo(datasetId(value)),
  save: () => { throw Error('Native export is available in the desktop app. Browser preview never writes source files.'); },
  lookup: query => catalog.lookup(query),
  lookupCached: queries => catalog.lookupCached(queries),
  loadIcon: query => iconCache.load(query),
  updates: () => ({ status: 'unavailable', message: 'Updates are available in an installed Windows release.' }),
  report: () => { throw Error('Local diagnostic export is available in the desktop app.'); }
};
const bridgeScript = `window.studio ||= Object.freeze(Object.fromEntries(${JSON.stringify(Object.keys(methods))}.map(method => [method, async payload => {
  let discardToken;
  for (;;) {
    const response = await fetch('/preview-api/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload, discardToken }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Preview request failed');
    if (!data.confirmation) return data.result;
    if (!window.confirm('以下文档的修改尚未导出。是否放弃修改？\\n' + data.confirmation.filename + (data.confirmation.gameVersion ? ' · ' + data.confirmation.gameVersion : '') + '\\n' + data.confirmation.displayPath)) return null;
    discardToken = data.confirmation.token;
  }
}])));`;
function dispatch(method, payload, discardToken) {
  const run = () => methods[method](payload, confirmDiscard(discardToken));
  if (method === 'lookup' || method === 'lookupCached' || method === 'loadIcon' || method === 'samples' || method === 'updates') return run();
  const task = pending.then(run);
  pending = task.catch(() => {});
  return task;
}
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url.startsWith('/preview-api/')) {
      if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${server.address().port}`) throw Error('Invalid origin');
      let body = '';
      for await (const part of req) {
        body += part;
        if (body.length > 1000000) throw Error('Request too large');
      }
      const method = req.url.slice('/preview-api/'.length);
      if (!Object.hasOwn(methods, method)) throw Error('Unknown method');
      const { payload, discardToken } = JSON.parse(body || '{}');
      const result = await dispatch(method, payload, discardToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result }));
      return;
    }
    if (req.url === '/preview-bridge.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(bridgeScript);
      return;
    }
    const relative = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).slice(1);
    const file = path.resolve(ui, relative);
    if (!file.startsWith(ui + path.sep)) throw Error('Invalid path');
    let data = await fs.readFile(file);
    if (file === path.join(ui, 'index.html')) data = data.toString().replace('</head>', '<script src="/preview-bridge.js"></script></head>');
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript' }[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    if (error instanceof ConfirmationRequired) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ confirmation: error.confirmation }));
      return;
    }
    res.writeHead(req.url.startsWith('/preview-api/') ? 400 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`ZPS preview http://127.0.0.1:${server.address().port}`));
