import { features, featureById, featureForKind, featureForSample } from './features.mjs';
import { projectTypes, searchTypes, matchingMembers, typeLabel, rebaseMembershipDraft, typeSettings, borderNumbers, borderPreview, typeTabs, enabledLevels } from './jx-workspace.mjs';

const $ = (id) => document.getElementById(id);
const themes = [['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']];
function storedTheme() { try { const value = localStorage.getItem('zps-theme'); return themes.some(([key]) => key === value) ? value : 'system'; } catch { return 'system'; } }
function applyTheme(value) { document.documentElement.dataset.theme = value; }
applyTheme(storedTheme());
const formats = {
  'jx-buff': { add: { id: '', nClass: '', nPower: 10, tLevel: { 0: true, 1: true } } },
  'my-team': { add: { reference: '', color: '#FFFFFFFF', label: '', priority: 9 } },
  chat: { add: { keyword: '' } },
  opaque: {},
};
const freshView = () => ({ datasetId: null, document: null, filename: '', source: null, gameVersion: '', revision: '', dirty: false, canUndo: false, selected: null, selectedType: null, typeSearch: '', detailOpen: false, search: '', tab: 'config', lookup: null, lookupClient: 'std', lookupLevel: '1', drafts: new Map() });
const state = { ...freshView(), featureId: features[0].id, samples: [], datasets: [], busy: false };
const views = new Map();
const viewKey = (value = state) => value.datasetId || value.featureId;
const datasetPayload = (fields = {}) => ({ ...fields, ...(state.datasetId ? { datasetId: state.datasetId } : {}) });
let activationQueue = Promise.resolve();
let activationSequence = 0;
let switching = false;
let draftNotifications = Promise.resolve();

function draftIsDirty(key, draft = state.drafts.get(key)) {
  const record = state.document?.records.find(item => item.key === key);
  if (!record || !draft) return false;
  const original = key.startsWith('class:') ? { name: record.name, ...record.fields } : record.fields;
  return !draft.fields || Object.entries(draft.fields).some(([name, value]) => JSON.stringify(value) !== JSON.stringify(original[name]));
}

function syncDraftState() {
  const dirty = [...state.drafts].some(([key, draft]) => draftIsDirty(key, draft));
  $('dirty-dot').hidden = !state.dirty && !dirty;
  renderDatasets();
  if (!state.document || typeof bridge.setDraftState !== 'function') return;
  const payload = datasetPayload({ featureId: state.featureId, dirty });
  draftNotifications = draftNotifications.catch(() => {}).then(() => bridge.setDraftState(payload));
  draftNotifications.catch(error => toast(error.message || String(error), true));
}

function trackDraft(form, key) {
  const values = Object.fromEntries([...form.querySelectorAll('[name]')].map(input => [input.name, input.value]));
  let fields = null;
  try { fields = formValues(form); }
  catch {}
  state.drafts.set(key, { values, fields });
}

async function openSample(path) {
  await draftNotifications;
  return receive(await bridge.openSample(path), true);
}

function rememberView() {
  views.set(viewKey(), Object.fromEntries(Object.keys(freshView()).map(key => [key, state[key]])));
}

function clearMetadata() {
  documentGeneration++;
  lookupSequence++;
  for (const node of pendingIcons.keys()) iconObserver?.unobserve(node);
  pendingIcons.clear();
  attemptedMetadata.clear();
  while (metadata.size > 512) metadata.delete(metadata.keys().next().value);
  enrichmentStopped = false;
  enrichment = null;
}

function activateFeature(id) {
  featureById(id);
  if (id === state.featureId && (switching || state.document)) return;
  activateWorkspace(() => bridge.activateFeature(id), id);
}

function activateDataset(id, focus = false) {
  if (id === state.datasetId) return;
  const summary = state.datasets.find(item => item.datasetId === id);
  if (!summary) return;
  activateWorkspace(() => bridge.activateDataset(id), summary.featureId || state.featureId);
  if (focus) activationQueue.then(() => {
    if (state.datasetId === id) $('dataset-tabs')?.querySelector('[aria-selected=true]')?.focus({ preventScroll: true });
  });
}

function activateWorkspace(activate, featureId) {
  if (state.busy && !switching) return;
  if (!switching) rememberView();
  const sequence = ++activationSequence;
  switching = true;
  state.busy = true;
  clearMetadata();
  closeDetail(false);
  Object.assign(state, freshView(), { featureId, datasets: [] });
  $('search').value = '';
  render();
  activationQueue = activationQueue.catch(() => {}).then(async () => {
    if (sequence !== activationSequence) return;
    try {
      await draftNotifications;
      const result = await activate();
      if (sequence !== activationSequence) return;
      state.busy = false;
      switching = false;
      if (!receive(result, false, true)) render();
    } catch (error) {
      if (sequence !== activationSequence) return;
      state.busy = false;
      switching = false;
      render();
      toast(error.message || String(error), true);
    }
  });
}

async function closeDataset(id) {
  await draftNotifications;
  const result = await bridge.closeDataset(id);
  if (!result || result.canceled || result.cancelled) return;
  const remaining = result.datasets;
  if (Array.isArray(remaining) && !remaining.some(item => item.datasetId === id)) views.delete(id);
  receive(result, false, true);
}

function initializeFeatures() {
  for (const feature of features) {
    const button = element('button', 'feature-tab', feature.title);
    button.id = `feature-tab-${feature.id}`;
    button.type = 'button';
    button.dataset.feature = feature.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `feature-panel-${feature.id}`);
    button.addEventListener('click', () => activateFeature(feature.id));
    button.addEventListener('keydown', event => {
      const index = features.findIndex(item => item.id === feature.id);
      const next = { ArrowDown: (index + 1) % features.length, ArrowUp: (index + features.length - 1) % features.length, ArrowRight: (index + 1) % features.length, ArrowLeft: (index + features.length - 1) % features.length, Home: 0, End: features.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      if (state.busy && !switching) return;
      activateFeature(features[next].id);
      $(`feature-tab-${features[next].id}`).focus();
    });
    $('feature-tabs').append(button);
    const panel = element('section', 'feature-panel');
    panel.id = `feature-panel-${feature.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    $('feature-panels').append(panel);
  }
}

function renderFeatures() {
  const feature = featureById(state.featureId);
  for (const item of features) {
    const active = item.id === feature.id;
    const button = $(`feature-tab-${item.id}`);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    const panel = $(`feature-panel-${item.id}`);
    panel.hidden = !active;
    panel.setAttribute('aria-busy', String(switching && active));
    if (active) panel.append($('feature-workspace'));
  }
}

const bridge = window.studio || new Proxy({}, {
  get: (_, method) => async (payload) => {
    const response = await fetch(`/preview-api/${String(method)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }) });
    let body;
    try { body = await response.json(); }
    catch { throw new Error('预览服务不可用，请在桌面应用中打开。'); }
    if (body.error) throw new Error(typeof body.error === 'string' ? body.error : body.error.message);
    if (!response.ok) throw new Error('预览服务不可用，请在桌面应用中打开。');
    return body.result;
  },
});
let detailReturnFocus;
let toastTimer;
let modalAction;
let modalMetadataRefresh;
let lookupSequence = 0;
const metadata = new Map();
const attemptedMetadata = new Set();
const failedIcons = new Set();
let documentGeneration = 0;
let enrichment = null;
let enrichmentStopped = false;

function buffQuery(record, level) {
  if (!record || record.key.startsWith('class:') || !['jx-buff', 'my-team'].includes(state.document?.kind)) return null;
  const reference = referenceQuery(record);
  const query = { client: state.lookupClient, level: Number(level ?? reference.level ?? 1) };
  if (!Number.isSafeInteger(query.level) || query.level < 1 || query.level > 99999) return null;
  if (reference.id !== undefined) {
    if (!/^\d{1,12}$/.test(String(reference.id))) return null;
    query.id = String(Number(reference.id));
  } else {
    if (!reference.name || reference.name.length > 200) return null;
    query.name = reference.name;
  }
  return query;
}

function metadataKey(query) {
  return JSON.stringify([query.client, query.id !== undefined ? 'id' : 'name', query.id ?? query.name, query.level]);
}

function metadataDisplayName(item) {
  const name = typeof item?.Name === 'string' ? cleanMarkup(item.Name).trim() : '';
  const internalName = typeof item?.BuffName === 'string' ? cleanMarkup(item.BuffName).trim() : '';
  return { name: name || internalName, internal: !name && Boolean(internalName) };
}

function matchedMetadata(query, result) {
  if (result?.client !== query.client || !Array.isArray(result?.list)) return null;
  const matches = result.list.filter((item) => Number(item.Level) === query.level &&
    (query.id !== undefined ? String(item.BuffID) === query.id : item.Name === query.name));
  if (matches.length !== 1) return null;
  const displayName = metadataDisplayName(matches[0]);
  if (!displayName.name || query.name !== undefined && displayName.internal) return null;
  if (query.name !== undefined && (result.total ?? result.list.length) > result.list.length) return null;
  return { item: matches[0], result, query };
}

function recordMetadata(record) {
  const query = buffQuery(record);
  return query ? metadata.get(metadataKey(query)) : null;
}

function recordName(record) {
  const item = recordMetadata(record)?.item;
  return item ? metadataDisplayName(item).name : record?.name || (record?.id !== undefined ? `#${record.id}` : record?.key || '条目详情');
}

function buffIdLabel(record) {
  const levels = state.document?.kind === 'jx-buff' ? enabledLevels(record.fields?.tLevel) : [];
  return levels.length ? [record.id, ...levels].join(',') : `ID ${record.id}`;
}

function recordSubtitle(record) {
  const item = recordMetadata(record)?.item;
  return `${record.id !== undefined ? buffIdLabel(record) : record.key}${metadataDisplayName(item).internal ? ' · 内部名' : ''}`;
}

const pendingIcons = new Map();
let cleanIconObservers = false;
const iconObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const start = pendingIcons.get(entry.target);
    pendingIcons.delete(entry.target);
    iconObserver.unobserve(entry.target);
    start?.();
  }
}, { rootMargin: '200px' }) : null;

function whenIconVisible(node, start) {
  if (!iconObserver) { start(); return; }
  pendingIcons.set(node, start);
  iconObserver.observe(node);
  if (cleanIconObservers) return;
  cleanIconObservers = true;
  queueMicrotask(() => {
    cleanIconObservers = false;
    for (const node of pendingIcons.keys()) {
      if (!node.isConnected) { iconObserver.unobserve(node); pendingIcons.delete(node); }
    }
  });
}

function recordGlyph(record, entry = recordMetadata(record), big = false) {
  const glyph = record?.key.startsWith('class:') ? '▦' : state.document?.kind === 'chat' ? '☰' : state.document?.kind === 'opaque' ? '▧' : '✦';
  const node = element('div', `record-glyph${big ? ' big' : ''}`, glyph);
  if (record?.key.startsWith('class:') || !['jx-buff', 'my-team'].includes(state.document?.kind)) return node;
  const displayName = entry ? metadataDisplayName(entry.item) : { name: recordName(record) };
  const label = `${displayName.name || '名称未提供'}${displayName.internal ? ' · 内部名' : ''}`;
  const icon = entry?.item.IconID;
  const iconID = typeof icon === 'number' || typeof icon === 'string' && /^\d+$/.test(icon) ? Number(icon) : NaN;
  const url = Number.isSafeInteger(iconID) && iconID > 0 ? `https://icon.jx3box.com/${entry.query.client === 'origin' ? 'origin_icon' : 'icon'}/${iconID}.png` : null;
  const query = buffQuery(record);
  const unavailable = !entry && (enrichmentStopped || query && attemptedMetadata.has(metadataKey(query)));
  node.setAttribute('role', 'img');
  node.classList.add('icon-fallback');
  node.textContent = entry ? '无图' : unavailable ? '未获' : '待查';
  node.title = `${label} · ${entry ? '图标未提供' : unavailable ? '暂无图标信息' : '图标信息待查询'}`;
  node.setAttribute('aria-label', node.title);
  if (!url) return node;
  const showRetry = () => {
    node.classList.remove('has-icon');
    node.title = `${label} · 图标加载失败，点击重试`;
    node.removeAttribute('role');
    node.removeAttribute('aria-label');
    const retry = element('button', 'icon-retry', '重试');
    retry.type = 'button';
    retry.setAttribute('aria-label', `重试${label}图标`);
    retry.addEventListener('mousedown', event => event.preventDefault());
    retry.addEventListener('keydown', event => { if (!event.ctrlKey && !event.metaKey && (event.key === 'Enter' || event.key === ' ')) event.stopPropagation(); });
    retry.addEventListener('click', event => { event.stopPropagation(); loadIcon(true); });
    node.replaceChildren(retry);
  };
  const loadIcon = (force = false) => {
    if (node.contains(document.activeElement)) { node.tabIndex = -1; node.focus({ preventScroll: true }); }
    node.textContent = '…';
    node.title = `${label} · 图标加载中`;
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', node.title);
    const image = element('img', 'buff-icon');
    image.loading = big ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.alt = `${label} 图标`;
    image.addEventListener('load', () => { failedIcons.delete(url); node.classList.add('has-icon'); node.title = label; node.removeAttribute('role'); node.removeAttribute('aria-label'); }, { once: true });
    image.addEventListener('error', () => { failedIcons.add(url); showRetry(); }, { once: true });
    const setSource = async () => {
      try {
        const cached = typeof bridge.loadIcon === 'function' ? await bridge.loadIcon({ client: entry.query.client, id: iconID, refresh: force }) : null;
        image.src = cached?.dataURL || url;
      } catch { failedIcons.add(url); showRetry(); }
    };
    node.append(image);
    if (typeof bridge.loadIcon === 'function' && !force && !big) whenIconVisible(node, setSource);
    else setSource();
  };
  if (failedIcons.has(url)) showRetry();
  else loadIcon();
  return node;
}

function renderSelectionHeading() {
  const record = selectedRecord();
  const entry = recordMetadata(record);
  $('selection-heading').replaceChildren(recordGlyph(record, entry, true), element('h3', '', recordName(record)), element('p', '', record ? record.id !== undefined ? `BUFF ${buffIdLabel(record)}` : entry ? `BUFF ID ${entry.item.BuffID} · ${record.key}` : record.key : '从配置库中选择一个条目'));
  if (entry) $('selection-heading').append(element('p', 'metadata-source', `JX3BOX · ${entry.query.client} · 等级 ${entry.query.level}${metadataDisplayName(entry.item).internal ? ' · 内部名' : ''}${entry.result.stale ? ' · 离线缓存' : entry.result.source === 'cache' ? ' · 缓存' : ''}`));
}

function refreshMetadata(changedKey) {
  if (state.document?.kind === 'jx-buff') {
    renderTypeLists(changedKey);
    modalMetadataRefresh?.();
    const query = buffQuery(selectedRecord());
    if (!changedKey || query && metadataKey(query) === changedKey) renderSelectionHeading();
    renderEnrichmentProgress();
    const details = $('lookup-results');
    const detailsQuery = buffQuery(selectedRecord(), state.lookupLevel);
    if (details && !state.lookup && (!changedKey || detailsQuery && metadataKey(detailsQuery) === changedKey)) renderLookupDetails(details, selectedRecord());
    return;
  }
  const focusedRow = document.activeElement.closest?.('.record-row');
  const focusedKey = focusedRow?.dataset.key;
  if (state.search) {
    renderRecords();
    if (focusedKey) Array.from($('records-body').children).find((row) => row.dataset.key === focusedKey)?.focus({ preventScroll: true });
  } else {
    for (const row of $('records-body').children) {
      const record = state.document?.records.find((item) => item.key === row.dataset.key);
      if (!record) continue;
      const query = buffQuery(record);
      if (changedKey && (!query || metadataKey(query) !== changedKey)) continue;
      row.firstChild.replaceChildren(recordGlyph(record));
      row.querySelector('.record-name').textContent = recordName(record);
      row.querySelector('.record-id').textContent = recordSubtitle(record);
    }
  }
  const selectedQuery = buffQuery(selectedRecord());
  if (!changedKey || selectedQuery && metadataKey(selectedQuery) === changedKey) renderSelectionHeading();
  renderEnrichmentProgress();
  const details = $('lookup-results');
  const detailsQuery = buffQuery(selectedRecord(), state.lookupLevel);
  if (details && !state.lookup && (!changedKey || detailsQuery && metadataKey(detailsQuery) === changedKey)) renderLookupDetails(details, selectedRecord());
}

function renderEnrichmentProgress() {
  let node = $('metadata-progress');
  if (!node) { node = element('span', 'metadata-progress'); node.id = 'metadata-progress'; $('document-meta').append(node); }
  node.hidden = !enrichment?.total;
  node.textContent = enrichment?.total ? `JX3BOX ${enrichment.done}/${enrichment.total}${enrichment.cached ? ` · 缓存 ${enrichment.cached}` : ''}${enrichment.stopped ? ' · 连接中断，可手动查询' : enrichment.done < enrichment.total ? ' · 读取中' : ' · 已检查'}` : '';
}

function requestCatalog(query, isCurrent) {
  return isCurrent() ? bridge.lookup(query) : Promise.resolve(null);
}

function startEnrichment() {
  const generation = documentGeneration;
  const queries = new Map();
  for (const record of state.document?.records || []) {
    const query = buffQuery(record);
    if (query) queries.set(metadataKey(query), query);
  }
  const job = { total: queries.size, done: [...queries.keys()].filter((key) => attemptedMetadata.has(key) || metadata.has(key)).length, stopped: enrichmentStopped, cached: 0 };
  enrichment = job;
  const isCurrent = () => generation === documentGeneration;
  renderEnrichmentProgress();
  if (job.stopped) return;
  (async () => {
    const entries = [...queries];
    if (typeof bridge.lookupCached === 'function') {
      try {
        for (let offset = 0; offset < entries.length; offset += 512) {
          const chunk = entries.slice(offset, offset + 512);
          const cached = await bridge.lookupCached(chunk.map(([, query]) => query));
          if (!isCurrent()) return;
          chunk.forEach(([key, query], index) => {
            const result = cached?.[index];
            if (!result) return;
            job.cached++;
            const entry = matchedMetadata(query, result);
            if (entry) metadata.set(key, entry);
            else metadata.delete(key);
            if (!result.stale) attemptedMetadata.add(key);
          });
        }
        job.done = entries.filter(([key]) => attemptedMetadata.has(key)).length;
        refreshMetadata();
      } catch { if (!isCurrent()) return; }
    }
    const remaining = new Map(entries.filter(([key]) => {
      const previous = metadata.get(key);
      return !attemptedMetadata.has(key) && !(previous && !previous.result.stale && Date.now() - previous.result.cachedAt < 86400000);
    }));
    while (remaining.size) {
      if (!isCurrent()) return;
      const selected = buffQuery(selectedRecord());
      const visible = visibleRecords().map(record => buffQuery(record)).find(query => query && remaining.has(metadataKey(query)));
      const preferred = selected && remaining.has(metadataKey(selected)) ? selected : visible;
      const [key, query] = preferred ? [metadataKey(preferred), preferred] : remaining.entries().next().value;
      remaining.delete(key);
      const previous = metadata.get(key);
      if (attemptedMetadata.has(key) || previous && !previous.result.stale && Date.now() - previous.result.cachedAt < 86400000) { job.done++; continue; }
      try {
        const result = await requestCatalog(query, isCurrent);
        if (!isCurrent()) return;
        const entry = matchedMetadata(query, result);
        if (entry) metadata.set(key, entry);
        else metadata.delete(key);
        attemptedMetadata.add(key);
        if (result?.stale) job.stopped = true;
        job.done++;
      } catch { if (!isCurrent()) return; attemptedMetadata.add(key); job.done++; job.stopped = true; }
      enrichmentStopped = job.stopped;
      refreshMetadata(key);
      if (job.stopped) return;
    }
  })();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').className = error ? 'error' : '';
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 3500);
}

async function run(action) {
  if (state.busy) return;
  state.busy = true;
  $('status-text').textContent = '正在处理…';
  try { return await action(); }
  catch (error) { toast(error.message || String(error), true); }
  finally { state.busy = false; renderAvailability(); $('status-text').textContent = state.dirty ? '有未导出的修改' : '准备就绪'; }
}

function receive(result, reset = false, restore = false) {
  if (!result || result.canceled || result.cancelled) return false;
  if (Array.isArray(result.datasets)) state.datasets = result.datasets;
  if (!result.document && !Object.hasOwn(result, 'datasetId')) return false;
  const featureId = result.featureId || featureForKind(result.document?.kind) || state.featureId;
  const key = result.datasetId || featureId;
  const previousKey = viewKey();
  const changed = key !== previousKey || !state.document || !result.datasetId && reset && result.filename !== state.filename;
  if (changed) {
    if (state.document && (!Array.isArray(result.datasets) || result.datasets.some(item => item.datasetId === state.datasetId))) rememberView();
    const remembered = !result.datasetId && reset && result.filename !== state.filename ? null : views.get(key);
    Object.assign(state, remembered || freshView(), { featureId });
    clearMetadata();
    closeDetail(false);
  }
  documentGeneration++;
  lookupSequence++;
  state.lookup = null;
  if (!changed && state.document?.kind === 'jx-buff' && result.document?.kind === 'jx-buff') {
    for (const previous of state.document.records.filter(record => record.key.startsWith('buff:'))) {
      const next = result.document.records.find(record => record.key === previous.key);
      if (next && state.drafts.has(previous.key)) state.drafts.set(previous.key, rebaseMembershipDraft(state.drafts.get(previous.key), previous, next));
    }
  }
  Object.assign(state, { datasetId: result.datasetId || null, document: result.document || null, filename: result.filename || '', source: result.source || null, gameVersion: result.gameVersion || '', locked: Boolean(result.locked), revision: result.revision || '', dirty: Boolean(result.dirty), canUndo: Boolean(result.canUndo) });
  if (!state.document) Object.assign(state, freshView(), { featureId });
  if (state.document && !state.document.records.some(record => record.key === state.selected)) {
    state.selected = state.document.records[0]?.key ?? null;
    if (!restore) state.lookupLevel = referenceQuery(selectedRecord()).level || '1';
  }
  $('search').value = state.search;
  render();
  startEnrichment();
  syncDraftState();
  return true;
}

function selectedRecord() { return state.document?.records.find((record) => record.key === state.selected); }
function referenceQuery(record) {
  const reference = String(record?.fields?.reference ?? record?.name ?? '');
  const name = reference.split('|')[0].trim();
  const level = reference.match(/\|lv(\d+)(?:\||$)/i)?.[1];
  return { ...(record?.id !== undefined ? { id: record.id } : /^\d+$/.test(name) ? { id: Number(name) } : { name }), level };
}
function fileName(path) { return String(path || '').split(/[\\/]/).pop() || '未命名配置'; }
function textValue(value) { return value === null ? 'null' : typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''); }
function visibleRecords() {
  if (state.document?.kind === 'jx-buff') {
    const group = projectTypes(state.document.records).find(item => item.name === state.selectedType);
    return group ? matchingMembers(group, state.typeSearch || state.search, recordName) : [];
  }
  return (state.document?.records || []).filter((record) => (!state.search || `${recordName(record)} ${record.name} ${record.id ?? ''} ${record.key} ${JSON.stringify(record.fields)}`.toLowerCase().includes(state.search.toLowerCase())));
}

function versionLabel(dataset = state) { return dataset.locked ? '🔒 内置样本' : dataset.gameVersion || ''; }

function renderDatasets() {
  const tabs = $('dataset-tabs');
  if (!tabs) return;
  const focusedId = document.activeElement.closest?.('.dataset-tab-item')?.dataset.datasetId;
  tabs.replaceChildren();
  const summaries = state.datasets.length ? state.datasets : state.document ? [{ ...state, datasetId: viewKey() }] : [];
  for (const summary of summaries) {
    const item = element('div', 'dataset-tab-item');
    item.dataset.datasetId = summary.datasetId;
    const button = element('button', `dataset-tab${summary.datasetId === viewKey() ? ' active' : ''}`);
    button.type = 'button'; button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(summary.datasetId === viewKey()));
    button.tabIndex = summary.datasetId === viewKey() ? 0 : -1;
    const dirty = summary.datasetId === viewKey() ? state.dirty || [...state.drafts].some(([key, draft]) => draftIsDirty(key, draft)) : summary.dirty || summary.hasDrafts;
    button.append(element('span', 'dataset-tab-name', `${fileName(summary.filename)}${dirty ? ' ·' : ''}`));
    const duplicates = summaries.filter(item => fileName(item.filename) === fileName(summary.filename)).length > 1;
    const sourcePath = summary.source?.displayPath || summary.filename;
    const parent = duplicates ? summary.source?.kind === 'new' ? '新建' : String(sourcePath || '').replace(/[\\/][^\\/]+$/, '') : '';
    button.append(element('span', 'dataset-tab-secondary', [versionLabel(summary), parent].filter(Boolean).join(' · ')));
    button.title = [sourcePath, versionLabel(summary), dirty ? '有未导出或未应用的修改' : ''].filter(Boolean).join('\n');
    button.addEventListener('click', () => activateDataset(summary.datasetId));
    button.addEventListener('keydown', event => {
      const index = summaries.indexOf(summary);
      const next = { ArrowRight: (index + 1) % summaries.length, ArrowLeft: (index + summaries.length - 1) % summaries.length, Home: 0, End: summaries.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault(); activateDataset(summaries[next].datasetId, true);
    });
    button.addEventListener('contextmenu', event => { event.preventDefault(); datasetMenu(summary, event.clientX, event.clientY); });
    button.addEventListener('keydown', event => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      event.preventDefault();
      const box = button.getBoundingClientRect();
      datasetMenu(summary, box.left + 12, box.bottom + 4);
    });
    button.disabled = state.busy && !switching;
    item.append(button); tabs.append(item);
  }
  if (focusedId) [...tabs.children].find(item => item.dataset.datasetId === focusedId)?.querySelector('.dataset-tab')?.focus({ preventScroll: true });
}

function openSettings() {
  const content = element('div');
  content.append(element('strong', '', '外观'));
  const choices = element('div', 'theme-choices');
  const paint = () => { for (const button of choices.children) { const active = button.dataset.theme === storedTheme(); button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); } };
  for (const [key, label] of themes) {
    const button = element('button', 'theme-choice', label);
    button.type = 'button'; button.dataset.theme = key;
    button.addEventListener('click', () => { try { localStorage.setItem('zps-theme', key); } catch {} applyTheme(key); paint(); });
    choices.append(button);
  }
  content.append(choices);
  paint();
  showModal('设置', content);
}

function closeMenu() { $('context-menu')?.remove(); }

function datasetMenu(summary, x, y) {
  closeMenu();
  const menu = element('div', 'context-menu'); menu.id = 'context-menu'; menu.setAttribute('role', 'menu');
  const name = fileName(summary.filename);
  const items = [
    ['复制为新版本', false, () => duplicateDataset(summary)],
    ['导出', summary.datasetId !== viewKey() || !state.document?.writable || featureById(state.featureId).kind === 'opaque', () => save()],
    ['关闭', false, () => run(() => closeDataset(summary.datasetId))],
  ];
  for (const [label, disabled, action] of items) {
    const item = element('button', 'context-item', label);
    item.type = 'button'; item.setAttribute('role', 'menuitem'); item.disabled = disabled || state.busy;
    item.addEventListener('click', () => { closeMenu(); action(); });
    menu.append(item);
  }
  menu.setAttribute('aria-label', name);
  document.body.append(menu);
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - box.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, innerHeight - box.height - 4))}px`;
  menu.querySelector('button:not(:disabled)')?.focus();
  menu.addEventListener('keydown', event => {
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }
  });
}

function duplicateDataset(summary) {
  run(async () => {
    await draftNotifications;
    const result = await bridge.duplicate({ datasetId: summary.datasetId });
    if (receive(result, true)) toast(`已复制为“${result.gameVersion}”，可以开始编辑。点 ✎ 可命名。`);
  });
}

function renameVersion() {
  const label = $('dataset-version');
  if (!state.document || state.locked) return;
  const input = element('input', 'version-input');
  input.value = state.gameVersion; input.placeholder = '版本名称'; input.setAttribute('aria-label', '版本名称'); input.maxLength = 80;
  let done = false;
  const finish = commit => {
    if (done) return; done = true;
    input.replaceWith(label); $('version-edit').hidden = false;
    if (!commit || input.value.trim() === state.gameVersion) return;
    run(async () => { if (receive(await bridge.renameVersion({ datasetId: state.datasetId, gameVersion: input.value }))) toast('版本已命名。'); });
  };
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  label.replaceWith(input); $('version-edit').hidden = true;
  input.focus(); input.select();
}

document.addEventListener('pointerdown', event => { if (!event.target.closest?.('#context-menu')) closeMenu(); });
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);

function datasetInfo() {
  if (!state.document) return;
  const content = element('dl', 'dataset-info-list');
  const sourceLabels = { file: '本地文件', sample: '内置样本', new: '新建数据集' };
  const rows = [
    ['文件名', fileName(state.filename)],
    ['数据版本', state.gameVersion || '未标注'],
    ['来源', sourceLabels[state.source?.kind] || '未记录'],
    ['原始路径', state.source?.kind === 'new' ? '在工作区内新建' : state.source?.displayPath || state.filename || '未记录'],
    ['导入位置', featureById(state.featureId).importPath],
    ['源文件修改时间', state.source?.modifiedAt ? new Date(state.source.modifiedAt).toLocaleString() : '未记录'],
    ['当前内容指纹', state.revision || '未记录'],
  ];
  for (const [label, value] of rows) content.append(element('dt', '', label), element('dd', '', value));
  content.append(element('p', 'muted-text', '数据版本由使用者标注，不代表已验证游戏兼容性。'));
  showModal('数据集信息', content);
}

function render() {
  const doc = state.document;
  const feature = featureById(state.featureId);
  renderFeatures();
  renderDatasets();
  if ($('dataset-version')) { $('dataset-version').textContent = doc ? state.gameVersion || '' : '新建或打开数据集'; $('dataset-version').hidden = Boolean(doc) && !state.gameVersion; }
  $('version-edit').hidden = !doc || state.locked;
  $('version-edit').title = state.gameVersion ? '重命名此版本' : '命名此版本';
  $('lock-bar').hidden = !doc || !state.locked;
  if ($('dataset-info-button')) $('dataset-info-button').disabled = !doc || state.busy;
  $('breadcrumb-name').textContent = doc ? fileName(state.filename) : '未打开文件';
  $('breadcrumb-name').title = state.filename;
  $('dirty-dot').hidden = !state.dirty && ![...state.drafts].some(([key, draft]) => draftIsDirty(key, draft));
  renderAvailability();
  $('document-meta').replaceChildren();
  renderRecords();
  renderTypeWorkspace();
  renderInspector();
  renderSamples();
  $('status-text').textContent = switching ? '正在切换工作区…' : state.dirty ? '有未导出的修改' : '准备就绪';
}

function renderAvailability() {
  const feature = featureById(state.featureId);
  const format = formats[feature.kind];
  for (const button of document.querySelectorAll('.dataset-tab')) button.disabled = state.busy && !switching;
  if ($('dataset-info-button')) $('dataset-info-button').disabled = !state.document || state.busy;
  $('save-button').disabled = state.busy || !state.document?.writable || feature.kind === 'opaque';
  $('undo-button').disabled = state.busy || !state.canUndo;
  $('new-button').textContent = '＋ 新建数据集';
  $('new-button').disabled = state.busy || !format.add;
  $('add-button').textContent = feature.kind === 'jx-buff' ? '＋ 添加 Buff' : feature.kind === 'chat' ? '＋ 添加关键词' : '＋ 新建监控';
  if ($('empty-create')) $('empty-create').disabled = state.busy || !format.add;
  $('add-button').hidden = feature.kind === 'opaque';
  $('add-button').disabled = state.busy || !state.document?.writable || !format.add;
  $('search').disabled = switching;
  for (const node of document.querySelectorAll('#type-workspace button, #type-workspace input')) {
    const editOnly = node.matches('.border-choice, .font-choice, .switch-option, .type-name-edit, #add-type-button, #assign-member-button, #type-settings-button');
    node.disabled = state.busy || !state.document || editOnly && !state.document.writable;
  }
  const group = currentType();
  if ($('add-type-button')) $('add-type-button').disabled = state.busy || !state.document?.writable;
  if ($('assign-member-button')) $('assign-member-button').disabled = state.busy || !state.document?.writable || !group;
  for (const button of document.querySelectorAll('#sample-list button')) button.disabled = state.busy;
}

function focusSearch() { (state.document?.kind === 'jx-buff' ? $('type-search') : $('search'))?.focus(); }

function typeGroups() { return projectTypes(state.document?.records); }
function tabGroups() { const tabs = typeTabs(typeGroups()); return state.typeTab === 'builtin' ? tabs.builtin : tabs.custom; }
function currentType() { return tabGroups().find(group => group.name === state.selectedType); }

function actionButton(label, id, action) {
  const button = element('button', 'button', label);
  if (id) button.id = id;
  button.type = 'button';
  button.addEventListener('click', action);
  return button;
}

function renderTypeWorkspace() {
  const workspace = $('type-workspace');
  if (!workspace) return;
  const active = state.document?.kind === 'jx-buff';
  workspace.hidden = !active;
  $('search').hidden = active;
  if (!active) return;
  if (!$('type-search')) {
    const master = element('aside', 'type-master');
    const heading = element('div', 'type-master-header');
    heading.append(element('h3', '', '类型'), actionButton('＋ 新建类型', 'add-type-button', addType));
    const tabs = element('div', 'type-tabs'); tabs.id = 'type-tabs'; tabs.setAttribute('role', 'tablist');
    for (const [tab, label] of [['builtin', '默认'], ['custom', '自定义']]) {
      const button = element('button', 'type-tab', label);
      button.type = 'button'; button.dataset.tab = tab; button.setAttribute('role', 'tab');
      button.addEventListener('click', () => { if (state.typeTab === tab) return; state.typeTab = tab; state.selectedType = null; state.detailOpen = false; renderTypeWorkspace(); renderInspector(); });
      tabs.append(button);
    }
    const search = element('input', 'type-search');
    search.id = 'type-search'; search.type = 'search'; search.placeholder = '搜索类型、Buff 名称或 ID';
    search.setAttribute('aria-label', '搜索类型、Buff 名称或 ID');
    search.addEventListener('input', () => { state.typeSearch = search.value; state.search = ''; renderTypeLists(); });
    const list = element('div', 'type-list'); list.id = 'type-list'; list.setAttribute('aria-label', '类型列表');
    master.append(heading, tabs, search, list);
    const detail = element('section', 'type-detail');
    const header = element('header', 'type-detail-header'); header.id = 'type-detail-header';
    const members = element('div', 'type-member-list'); members.id = 'type-members';
    detail.append(header, members);
    workspace.replaceChildren(master, detail);
  }
  if (state.typeTab !== 'builtin') state.typeTab = 'custom';
  const tabs = typeTabs(typeGroups());
  for (const button of $('type-tabs').children) {
    const active = button.dataset.tab === state.typeTab;
    button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active));
    button.textContent = `${button.dataset.tab === 'builtin' ? '默认' : '自定义'} ${tabs[button.dataset.tab].length}`;
  }
  $('add-type-button').hidden = state.typeTab === 'builtin';
  const groups = tabGroups();
  if (!groups.some(group => group.name === state.selectedType)) state.selectedType = groups[0]?.name ?? null;
  $('type-search').value = state.typeSearch;
  renderTypeHeader();
  renderTypeLists();
  renderAvailability();
}

function moveBuff(key, name) {
  const record = state.document?.records.find(item => item.key === key);
  if (!record || record.fields.nClass === name) return;
  run(async () => {
    await draftNotifications;
    const result = await bridge.edit(datasetPayload({ key, fields: { nClass: name } }));
    if (result?.document) {
      const draft = state.drafts.get(key);
      if (draft) state.drafts.set(key, rebaseMembershipDraft(draft, record, { ...record, fields: { ...record.fields, nClass: name } }));
    }
    if (receive(result)) toast(`${recordName(record)} 已移入“${typeLabel(name)}”。`);
  });
}

function editType(group, fields) {
  return run(async () => {
    await draftNotifications;
    const result = await bridge.edit(datasetPayload({ key: group.record.key, fields }));
    if (result?.document && Object.hasOwn(fields, 'name')) {
      for (const [key, draft] of state.drafts) {
        if (draft.values.nClass === group.name) state.drafts.set(key, { ...draft, values: { ...draft.values, nClass: fields.name }, fields: draft.fields ? { ...draft.fields, nClass: fields.name } : null });
      }
      if (state.selectedType === group.name) state.selectedType = fields.name;
    }
    if (receive(result)) toast('类型已更新。导出配置以写入文件。');
  });
}

function typeSwitch(label, value, onChange, disabled) {
  const wrap = element('div', 'type-switch');
  wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', label);
  for (const [option, text] of [[true, '开启'], [false, '关闭']]) {
    const button = element('button', `switch-option${value === option ? ' active' : ''}`, text);
    button.type = 'button'; button.disabled = disabled;
    button.setAttribute('aria-pressed', String(value === option));
    button.addEventListener('click', () => { if (value !== option) onChange(option); });
    wrap.append(button);
  }
  return wrap;
}

function settingRow(label, ...controls) {
  const row = element('div', 'type-setting-row');
  row.append(element('strong', 'type-setting-label', label));
  const body = element('div', 'type-setting-controls');
  body.append(...controls);
  row.append(body);
  return row;
}

function memberIcon(record, fields) {
  const wrap = element('span', 'member-icon');
  wrap.append(recordGlyph(record));
  const preview = borderPreview(fields?.bBorderEnable, fields?.nBorder);
  if (preview.kind === 'image') { const image = element('img', 'member-border'); image.src = preview.src; image.alt = ''; image.draggable = false; wrap.append(image); }
  return wrap;
}

function renderTypeHeader() {
  if (!$('type-detail-header')) return;
  const group = currentType();
  const header = $('type-detail-header');
  const assign = actionButton('＋ 添加 Buff', 'assign-member-button', assignMember);
  assign.disabled = !group || !state.document?.writable;
  if (!group) {
    const intro = element('div', 'type-card-title');
    intro.append(element('h2', '', '先添加一个类型'), element('p', 'muted-text', '类型用来组织 Buff，并决定它们在游戏里的边框和字体。'));
    header.replaceChildren(intro, assign);
    return;
  }
  if (group.builtin) {
    const top = element('div', 'type-card-top');
    const title = element('div', 'type-card-title');
    const line = element('div', 'type-title-line');
    const heading = element('h2', '', group.name); heading.id = 'type-name';
    line.append(heading, element('span', 'type-count-badge', `${group.members.length} 个 Buff`));
    title.append(line, element('p', 'muted-text', '插件内置类型'));
    top.append(title, assign);
    const note = element('div', 'type-card-note');
    note.append(element('span', '', group.shadow ? '文件里有同名的自定义类型，它的边框和字体设置会用在这些 Buff 上。' : '这是插件自带的类型，样式由插件决定。这里列出文件中放入它的 Buff。'));
    if (group.shadow) {
      const jump = actionButton(`编辑自定义“${group.name}”`, '', () => { state.typeTab = 'custom'; state.selectedType = group.name; renderTypeWorkspace(); });
      note.append(jump);
    }
    header.replaceChildren(top, note);
    return;
  }
  const fields = group.record?.fields || {};
  const locked = !state.document?.writable || state.busy;
  const top = element('div', 'type-card-top');
  const title = element('div', 'type-card-title');
  const line = element('div', 'type-title-line');
  const heading = element('h2', '', typeLabel(group.name)); heading.id = 'type-name';
  line.append(heading);
  if (group.record) {
    const pen = element('button', 'type-name-edit', '✎');
    pen.id = 'type-name-edit'; pen.type = 'button'; pen.title = '重命名类型'; pen.setAttribute('aria-label', '重命名类型'); pen.disabled = locked;
    pen.addEventListener('click', () => {
      const name = element('input', 'type-name-input');
      name.id = 'type-name-input'; name.value = group.name; name.setAttribute('aria-label', '类型名称');
      let done = false;
      const finish = commit => {
        if (done) return; done = true;
        if (commit && name.value && name.value !== group.name) { editType(group, { name: name.value }); return; }
        if (commit && !name.value) toast('类型名称不能为空。');
        renderTypeHeader();
      };
      name.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); finish(true); }
        if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      });
      name.addEventListener('blur', () => finish(true));
      heading.replaceWith(name); pen.hidden = true;
      name.focus(); name.select();
    });
    line.append(pen);
  }
  line.append(element('span', 'type-count-badge', `${group.members.length} 个 Buff`));
  title.append(line);
  top.append(title, assign);
  header.replaceChildren(top);
  if (!group.record) {
    const note = element('div', 'type-card-note');
    if (group.name === '') note.append(element('span', '', '这些 Buff 没有指定类型，所以没有边框和字体设置。把它们移入某个类型即可套用该类型的样式。'));
    else {
      note.append(element('span', '', '有 Buff 引用了这个类型，但文件里还没有它的样式设置。'));
      const create = actionButton('创建样式设置', 'type-settings-button', () => addType(group.name));
      create.disabled = locked;
      note.append(create);
    }
    header.append(note);
    return;
  }
  const settings = element('div', 'type-card-settings');
  settings.append(settingRow('启用', typeSwitch('启用', fields.bEnable, value => editType(group, { bEnable: value }), locked)));
  const borders = element('div', 'border-choices');
  const choice = (enabled, number, active, title, change) => {
    const button = element('button', `border-choice${active ? ' active' : ''}`);
    button.type = 'button'; button.disabled = locked; button.title = title; button.setAttribute('aria-label', title);
    button.setAttribute('aria-pressed', String(active));
    if (number !== undefined) button.dataset.border = number;
    button.append(borderSwatch(enabled, number, 'medium'));
    button.addEventListener('click', () => { if (!active) editType(group, change); });
    borders.append(button);
  };
  choice(false, undefined, fields.bBorderEnable !== true, '不使用边框', { bBorderEnable: false });
  for (const value of borderNumbers) choice(true, value, fields.bBorderEnable === true && fields.nBorder === value, `边框 ${value}`, { bBorderEnable: true, nBorder: value });
  if (fields.bBorderEnable === true && !borderNumbers.includes(fields.nBorder)) choice(true, fields.nBorder, true, `边框 ${fields.nBorder ?? '未设置'}（暂无预览图）`, {});
  settings.append(settingRow('图标边框', borders));
  const fonts = element('div', 'font-choices');
  const used = [...new Set(typeGroups().map(item => item.record?.fields.nFont).filter(Number.isSafeInteger))].sort((x, y) => x - y);
  if (Number.isSafeInteger(fields.nFont) && !used.includes(fields.nFont)) used.push(fields.nFont);
  const fontOff = fields.bFontEnable !== true;
  const fontChoice = (text, active, title, onClick) => {
    const button = element('button', `font-choice${active ? ' active' : ''}`, text);
    button.type = 'button'; button.disabled = locked; button.title = title; button.setAttribute('aria-pressed', String(active));
    button.addEventListener('click', onClick);
    fonts.append(button);
  };
  fontChoice('无', fontOff, '不使用自定义字体', () => { if (!fontOff) editType(group, { bFontEnable: false }); });
  used.forEach((value, index) => {
    const active = !fontOff && fields.nFont === value;
    const count = typeGroups().filter(item => item.record?.fields.nFont === value).length;
    fontChoice(String(index + 1), active, `字体编号 ${value} · 文件中 ${count} 个类型使用`, () => { if (!active) editType(group, { bFontEnable: true, nFont: value }); });
  });
  settings.append(settingRow('文字字体', fonts));
  header.append(settings);
}

function renderTypeLists(changedKey) {
  if (state.document?.kind !== 'jx-buff' || !$('type-list')) return;
  const active = document.activeElement;
  const focusedType = active.closest?.('.type-item')?.dataset.type;
  const focusedMember = active.closest?.('.type-member-row')?.dataset.key;
  const list = $('type-list');
  const members = $('type-members');
  const scroll = [list.scrollTop, members.scrollTop];
  const groups = searchTypes(tabGroups(), state.typeSearch || state.search, recordName);
  list.replaceChildren();
  for (const group of groups) {
    const button = element('button', `type-item${group.name === state.selectedType ? ' active' : ''}`);
    button.type = 'button'; button.dataset.type = group.name;
    button.setAttribute('aria-pressed', String(group.name === state.selectedType));
    button.append(borderSwatch(group.record?.fields.bBorderEnable, group.record?.fields.nBorder), element('span', 'type-name', typeLabel(group.name)), element('span', 'type-count', group.members.length));
    button.addEventListener('dragover', event => {
      if (!state.document?.writable || !event.dataTransfer.types.includes('application/x-zps-buff')) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; button.classList.add('drop-target');
    });
    button.addEventListener('dragleave', () => button.classList.remove('drop-target'));
    button.addEventListener('drop', event => {
      button.classList.remove('drop-target');
      const key = event.dataTransfer.getData('application/x-zps-buff');
      if (!key) return;
      event.preventDefault();
      moveBuff(key, group.name);
    });
    button.addEventListener('click', () => { state.selectedType = group.name; state.detailOpen = false; renderTypeHeader(); renderTypeLists(); renderInspector(); });
    list.append(button);
  }
  if (!groups.length) list.append(element('p', 'type-empty', '没有匹配的类型或 Buff。'));
  const records = visibleRecords();
  const sameMembers = changedKey && records.length === members.children.length && records.every((record, index) => members.children[index].dataset.key === record.key);
  if (sameMembers) {
    for (const row of members.children) {
      const record = records.find(item => item.key === row.dataset.key);
      const query = buffQuery(record);
      if (changedKey && (!query || metadataKey(query) !== changedKey)) continue;
      row.querySelector('.record-glyph').replaceWith(recordGlyph(record));
      row.querySelector('.record-name').textContent = recordName(record);
      row.querySelector('.record-id').textContent = recordSubtitle(record);
    }
  } else {
    members.replaceChildren();
    for (const record of records) {
      const row = element('div', `type-member-row${state.selected === record.key && state.detailOpen ? ' selected' : ''}`);
      row.dataset.key = record.key;
      const copy = element('span', 'type-member-copy');
      copy.append(element('span', 'record-name', recordName(record)), element('span', 'record-id', recordSubtitle(record)));
      const open = element('button', 'type-member-open');
      open.type = 'button';
      open.append(memberIcon(record, currentType()?.record?.fields || currentType()?.shadow?.fields), copy);
      open.addEventListener('click', () => openDetail(record));
      if (state.document?.writable) {
        row.draggable = true;
        row.title = '拖到左侧类型即可移入该类型';
        row.addEventListener('dragstart', event => { event.dataTransfer.setData('application/x-zps-buff', record.key); event.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
        row.addEventListener('dragend', () => row.classList.remove('dragging'));
      }
      row.append(open);
      members.append(row);
    }
    if (!records.length) members.append(element('p', 'type-empty', !currentType() ? '添加类型后，就可以放入 Buff。' : state.typeSearch ? '当前类型中没有匹配的 Buff。' : '此类型还没有 Buff。点击“＋ 添加 Buff”开始。'));
  }
  list.scrollTop = scroll[0]; members.scrollTop = scroll[1];
  if (focusedType !== undefined) [...list.children].find(node => node.dataset.type === focusedType)?.focus({ preventScroll: true });
  if (focusedMember) [...members.children].find(node => node.dataset.key === focusedMember)?.querySelector('.type-member-open')?.focus({ preventScroll: true });
}

function openDetail(record) {
  detailReturnFocus = document.activeElement;
  state.selected = record.key;
  state.detailOpen = true;
  state.lookup = null;
  state.tab = 'config';
  state.lookupLevel = referenceQuery(record).level || '1';
  lookupSequence++;
  renderTypeLists();
  renderInspector();
  requestAnimationFrame(() => $('inspector-content').querySelector('input:not([readonly]), select:not([disabled]), textarea:not([readonly]), button')?.focus());
}

function membershipField(value) {
  const field = element('label', 'field');
  field.append(element('span', '', '所属类型'));
  const select = element('select'); select.name = 'nClass'; select.dataset.valueType = 'string';
  const names = new Set(['', ...typeGroups().map(group => group.name), value]);
  for (const name of names) {
    const option = element('option', '', name === '' ? '移出类型（保留 Buff）' : typeLabel(name));
    option.value = name; select.append(option);
  }
  select.value = value; select.disabled = !state.document.writable;
  field.append(select);
  return field;
}

function addType(initial = '') {
  if (!state.document?.writable) return;
  const content = element('div');
  content.append(element('p', 'modal-description', '创建一个类型并设置它的显示样式。名称按原样保存，之后仍可修改。'));
  const field = fieldInput('name', typeof initial === 'string' ? initial : '');
  const settings = element('div', 'type-settings');
  for (const setting of typeSettings) settings.append(typeSettingInput(setting, setting.initial));
  content.append(field, settings);
  attachBorderPicker(settings);
  showModal('新建类型', content, '创建类型', async () => {
    const name = field.querySelector('input').value;
    if (!name) throw new Error('请输入类型名称。');
    const values = formValues(settings);
    await draftNotifications;
    const result = await bridge.add(datasetPayload({ type: 'class', name, ...values }));
    if (result?.document) { state.selectedType = name; state.typeTab = 'custom'; state.typeSearch = ''; state.search = ''; }
    if (receive(result)) { closeModal(); toast('类型已创建。'); }
  });
}

function lookupBuffById(id) {
  const query = { client: state.lookupClient, level: 1, id: String(id) };
  const key = metadataKey(query);
  if (metadata.has(key)) return Promise.resolve(metadata.get(key));
  return Promise.resolve(bridge.lookup(query)).then(result => {
    const entry = matchedMetadata(query, result) || (Array.isArray(result?.list) && result.list.find(item => String(item.BuffID) === query.id) ? { item: result.list.find(item => String(item.BuffID) === query.id), result, query } : null);
    if (entry && matchedMetadata(query, result)) metadata.set(key, entry);
    return entry;
  });
}

function assignMember() {
  if (!state.document?.writable) return;
  const group = currentType();
  if (!group) { addType(); return; }
  const content = element('div', 'add-buff');
  content.append(element('p', 'modal-description', `输入 Buff ID，添加到“${typeLabel(group.name)}”。`));
  const input = element('input', 'add-buff-id');
  input.id = 'add-buff-id'; input.type = 'text'; input.inputMode = 'numeric'; input.placeholder = 'Buff ID'; input.setAttribute('aria-label', 'Buff ID'); input.autocomplete = 'off';
  const preview = element('div', 'add-buff-preview'); preview.id = 'add-buff-preview'; preview.setAttribute('aria-live', 'polite');
  content.append(input, preview);
  let token = 0;
  let timer = null;
  const parse = () => {
    const text = input.value.trim();
    if (!text) return { empty: true };
    if (!/^\d{1,12}$/.test(text) || !Number.isSafeInteger(Number(text))) return { error: 'Buff ID 只能是数字。' };
    const id = Number(text);
    return { id, existing: state.document.records.find(record => record.key === `buff:${id}`) };
  };
  const paint = () => {
    const current = ++token;
    const parsed = parse();
    preview.replaceChildren();
    if (parsed.empty) return;
    if (parsed.error) { preview.append(element('p', 'add-buff-status error', parsed.error)); return; }
    const record = parsed.existing || { key: `buff:${parsed.id}`, id: parsed.id, name: `#${parsed.id}`, fields: {} };
    const row = element('div', 'add-buff-row');
    const name = element('strong', 'add-buff-name', parsed.existing ? recordName(parsed.existing) : '正在查询 JX3BOX…');
    const copy = element('div', 'add-buff-copy');
    copy.append(name, element('span', 'muted-text', `ID ${parsed.id}`));
    row.append(recordGlyph(record), copy);
    preview.append(row);
    const owner = parsed.existing?.fields.nClass;
    if (!parsed.existing) preview.append(element('p', 'add-buff-status ok', '尚未添加到任何类型，可以添加。'));
    else if (owner === group.name) preview.append(element('p', 'add-buff-status', '已在当前类型中。'));
    else {
      const status = element('div', 'add-buff-status warn');
      status.append(element('span', '', `已在类型“${typeLabel(owner)}”中。一个 Buff 只能属于一个类型。`));
      const move = actionButton('移到此类型', 'add-buff-move', () => { closeModal(); moveBuff(parsed.existing.key, group.name); });
      status.append(move);
      preview.append(status);
    }
    lookupBuffById(parsed.id).then(entry => {
      if (current !== token) return;
      const display = entry ? metadataDisplayName(entry.item).name : '';
      name.textContent = display || (parsed.existing ? recordName(parsed.existing) : 'JX3BOX 未找到此 Buff');
      if (entry) row.firstChild.replaceWith(recordGlyph(record, entry));
    }).catch(() => { if (current === token && !parsed.existing) name.textContent = 'JX3BOX 暂时无法连接'; });
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(paint, 150); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { clearTimeout(timer); paint(); } });
  showModal('添加 Buff', content, '添加', async () => {
    clearTimeout(timer);
    const parsed = parse();
    if (parsed.empty || parsed.error) throw new Error(parsed.error || '请输入 Buff ID。');
    if (parsed.existing) throw new Error(parsed.existing.fields.nClass === group.name ? '这个 Buff 已在当前类型中。' : `这个 Buff 已在类型“${typeLabel(parsed.existing.fields.nClass)}”中，可点击“移到此类型”。`);
    await draftNotifications;
    const result = await bridge.add(datasetPayload({ id: parsed.id, nClass: group.name }));
    if (result?.document) { state.typeSearch = ''; state.search = ''; }
    if (receive(result)) { closeModal(); toast('Buff 已添加。可使用撤销恢复。'); }
  });
}

function renderSamples() {
  $('sample-list').replaceChildren();
  const samples = state.samples.filter(sample => featureForSample(sample.path) === state.featureId);
  if (!samples.length) $('sample-list').append(element('p', 'sidebar-hint', '没有可用样本。可打开本地文件。'));
  for (const sample of samples) {
    const button = element('button', `sample-item${fileName(sample.path) === fileName(state.filename) ? ' active' : ''}`);
    button.title = `${featureById(state.featureId).title} · ${sample.path}`;
    button.disabled = state.busy;
    button.append(element('span', 'sample-symbol', '▧'), element('span', '', sample.filename || fileName(sample.name || sample.path)));
    button.addEventListener('click', () => run(() => openSample(sample.path)));
    $('sample-list').append(button);
  }
}

function renderRecords() {
  if (state.document?.kind === 'jx-buff') { renderTypeLists(); return; }
  const records = visibleRecords();
  $('records-body').replaceChildren();
  $('record-total').textContent = `${records.length} / ${state.document?.records.length || 0} 个条目`;
  $('empty-state').hidden = records.length > 0;
  const empty = $('empty-state');
  if (state.document && !records.length) {
    empty.querySelector('h3').textContent = state.document.kind === 'opaque' ? '当前文件以只读方式打开' : state.search ? '没有匹配的条目' : '这份配置还没有条目';
    empty.querySelector('p').textContent = state.document.kind === 'opaque' ? '查看原始内容，或打开其他数据集。' : state.search ? '尝试其他关键词。' : '创建第一条记录开始编辑。';
    $('empty-open').hidden = true;
  } else {
    empty.querySelector('h3').textContent = '从一份配置开始';
    empty.querySelector('p').textContent = switching ? '正在载入此功能的配置，请稍候。' : `${featureById(state.featureId).title} · 打开本地文件，或选择左侧样本。`;
    empty.querySelector('h3').textContent = switching ? '正在切换工作区' : '从一份配置开始';
    $('empty-open').hidden = false;
  }
  empty.querySelectorAll('.empty-create, .empty-add, .empty-view-content').forEach(node => node.remove());
  const kind = featureById(state.featureId).kind;
  if (!state.document && formats[kind].add) {
    const create = actionButton('＋ 新建数据集', 'empty-create', newDocument);
    create.classList.add('empty-create', 'primary'); empty.append(create);
  } else if (state.document?.kind === 'opaque') {
    const view = actionButton('查看内容', '', () => {
      detailReturnFocus = document.activeElement;
      state.detailOpen = true; state.tab = 'source'; renderInspector();
    });
    view.classList.add('empty-view-content'); empty.append(view);
  } else if (state.document?.writable && !records.length && !state.search) {
    const create = actionButton(kind === 'chat' ? '＋ 添加关键词' : '＋ 新建监控', '', addRecord);
    create.classList.add('empty-add', 'primary'); empty.append(create);
  }
  for (const record of records) {
    const row = element('tr', `record-row${record.key === state.selected ? ' selected' : ''}`);
    row.dataset.key = record.key;
    row.tabIndex = 0;
    row.setAttribute('aria-selected', String(record.key === state.selected));
    const glyphCell = element('td');
    glyphCell.append(recordGlyph(record));
    const nameCell = element('td');
    nameCell.append(element('div', 'record-name', recordName(record)), element('div', 'record-id', recordSubtitle(record)));
    const categoryCell = element('td');
    categoryCell.append(element('span', 'category-pill', record.category || (record.key.startsWith('class:') ? '分类配置' : '未分类')));
    row.append(glyphCell, nameCell, categoryCell, element('td', '', '›'));
    const select = () => { openDetail(record); renderRecords(); };
    row.addEventListener('click', select);
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
    $('records-body').append(row);
  }
}

const fieldLabels = { name: '类型名称', id: 'Buff ID', nClass: '所属类型', nPower: '显示优先级', tLevel: '生效等级', bEnable: '启用', reference: 'Buff 名称或 ID', color: '颜色', label: '显示标签', priority: '优先级', keyword: '聊天关键词' };

function fieldInput(key, value, options = {}) {
  const field = element('label', 'field');
  field.append(element('span', '', fieldLabels[key] || key));
  const complex = value !== null && typeof value === 'object';
  const input = document.createElement(complex || String(value).length > 100 ? 'textarea' : 'input');
  input.name = key;
  input.value = complex ? JSON.stringify(value, null, 2) : textValue(value);
  input.dataset.valueType = complex ? 'json' : typeof value;
  if (input.tagName === 'INPUT') input.type = typeof value === 'number' ? 'number' : 'text';
  if (typeof value === 'number') input.step = 'any';
  input.readOnly = Boolean(options.readonly);
  field.append(input);
  if (complex) field.append(element('small', '', 'JSON 值，保留数组或对象结构。'));
  return field;
}

function typeSettingInput(setting, value, readonly = false) {
  const field = element('label', 'field');
  field.append(element('span', '', setting.label));
  const unset = value === undefined;
  let input;
  if (setting.type === 'boolean') {
    input = element('select');
    for (const [optionValue, text] of [...(unset ? [['', '未设置']] : []), ['true', '开启'], ['false', '关闭']]) {
      const option = element('option', '', text); option.value = optionValue; input.append(option);
    }
    input.disabled = readonly;
  } else {
    input = element('input'); input.type = 'number'; input.min = '0'; input.step = '1';
    input.placeholder = '未设置';
    input.readOnly = readonly;
  }
  input.name = setting.key;
  input.dataset.valueType = setting.type;
  if (unset) input.dataset.optional = 'true';
  input.value = unset ? '' : String(value);
  field.append(input);
  if (unset) field.append(element('small', '', '文件中没有此项。设置后会写入该类型。'));
  return field;
}

function borderSwatch(enabled, number, size = 'small') {
  const preview = borderPreview(enabled, number);
  const swatch = element('span', `border-swatch ${size} ${preview.kind}`);
  if (preview.kind === 'image') {
    const image = element('img'); image.src = preview.src; image.alt = ''; image.draggable = false;
    swatch.append(image);
    swatch.title = `边框 ${preview.number}`;
  } else if (preview.kind === 'unknown') {
    swatch.append(element('span', '', String(preview.number ?? '?')));
    swatch.title = preview.number === undefined ? '边框已启用，未设置编号' : `边框 ${preview.number} 暂无预览图`;
  } else swatch.title = '未启用自定义边框';
  return swatch;
}

function attachBorderPicker(container) {
  const number = container.querySelector('[name=nBorder]');
  const enabled = container.querySelector('[name=bBorderEnable]');
  if (!number || !enabled) return;
  const panel = element('div', 'border-picker');
  const current = element('div', 'border-current');
  const choices = element('div', 'border-choices');
  const update = () => {
    const value = number.value.trim() === '' ? undefined : Number(number.value);
    const preview = borderPreview(enabled.value === 'true', value);
    current.replaceChildren(borderSwatch(enabled.value === 'true', value, 'large'), element('span', 'muted-text', preview.kind === 'image' ? `边框 ${preview.number}` : preview.kind === 'unknown' ? (value === undefined ? '已启用，未设置编号' : `边框 ${value} 暂无预览图`) : '未启用自定义边框'));
    for (const button of choices.children) button.classList.toggle('active', preview.kind === 'image' && Number(button.dataset.border) === value);
  };
  for (const value of borderNumbers) {
    const button = element('button', 'border-choice');
    button.type = 'button'; button.dataset.border = value; button.title = `边框 ${value}`;
    button.disabled = number.readOnly || enabled.disabled;
    button.append(borderSwatch(true, value), element('span', '', String(value)));
    button.addEventListener('click', () => {
      number.value = String(value); enabled.value = 'true';
      number.dispatchEvent(new Event('input', { bubbles: true }));
      update();
    });
    choices.append(button);
  }
  panel.append(current, choices);
  number.closest('.field').after(panel);
  number.addEventListener('input', update);
  enabled.addEventListener('change', update);
  update();
}

function formValues(form) {
  const fields = {};
  for (const input of form.querySelectorAll('[name]')) {
    let value = input.value;
    if (input.dataset.optional && value.trim() === '') continue;
    if (input.dataset.valueType === 'number') {
      if (value.trim() === '' || !Number.isFinite(Number(value))) throw new Error(`${input.name} 需要有效数字。`);
      value = Number(value);
    } else if (input.dataset.valueType === 'boolean') {
      if (value !== 'true' && value !== 'false') throw new Error(`${input.name} 需要 true 或 false。`);
      value = value === 'true';
    } else if (input.dataset.valueType === 'json' || input.dataset.valueType === 'object') {
      try { value = JSON.parse(value); } catch { throw new Error(`${input.name} 不是有效 JSON。`); }
    }
    fields[input.name] = value;
  }
  return fields;
}

function closeDetail(restoreFocus = true) {
  state.detailOpen = false;
  const modal = $('detail-modal');
  if (modal?.open) modal.close();
  if (restoreFocus) {
    const row = [...document.querySelectorAll('.type-member-row, .record-row')].find(node => node.dataset.key === state.selected);
    const target = detailReturnFocus?.isConnected ? detailReturnFocus : row?.querySelector('.type-member-open') || row || $('type-settings-button');
    target?.focus({ preventScroll: true });
  }
}

function renderInspector() {
  const record = selectedRecord();
  const content = $('inspector-content');
  const jx = state.document?.kind === 'jx-buff';
  $('editor-grid').hidden = jx;
  const modal = $('detail-modal');
  let close = document.querySelector('.inspector-close');
  if (!close) {
    close = actionButton('关闭详情', '', () => closeDetail());
    close.classList.add('inspector-close');
    ($('detail-owner-file')?.parentElement || document.querySelector('.inspector')).append(close);
  }
  if ($('detail-owner-file')) $('detail-owner-file').textContent = fileName(state.filename);
  if (state.detailOpen && state.document) {
    if (modal && !modal.open) modal.showModal();
  } else if (modal?.open) modal.close();
  content.replaceChildren();
  renderSelectionHeading();
  $('inspector-status').textContent = state.document ? state.document.writable ? '本地配置' : '只读' : '未选择';
  const supportsLookup = ['jx-buff', 'my-team'].includes(featureById(state.featureId).kind);
  $('box-tab').hidden = !supportsLookup;
  if (!supportsLookup && state.tab === 'box') state.tab = 'config';
  for (const tab of ['config', 'box', 'source']) {
    $(`${tab}-tab`).classList.toggle('active', state.tab === tab);
    $(`${tab}-tab`).setAttribute('aria-selected', String(state.tab === tab));
  }
  if (state.tab === 'source') {
    content.append(element('div', 'section-label', record ? '条目原始数据（只读）' : '文件原始内容（只读）'), element('pre', 'raw-data', record ? JSON.stringify(record, null, 2) : state.document?.text || '尚未打开配置文件。'));
    return;
  }
  if (state.tab === 'box') { renderLookup(content, record); return; }
  if (!record) {
    content.append(element('p', 'muted-text', state.document?.kind === 'opaque' ? '未识别的格式不能直接编辑。切换到原始数据页查看文件内容。' : '选择左侧条目后，可在这里编辑配置中已有的字段。'));
    appendWarnings(content);
    return;
  }
  const form = element('form');
  const originalFields = record.key.startsWith('class:') ? { name: record.name, ...record.fields } : record.fields;
  const advanced = element('details', 'advanced-fields');
  advanced.append(element('summary', '', record.key.startsWith('class:') ? '高级样式与原始字段' : '高级字段'));
  for (const [key, value] of Object.entries(originalFields || {})) {
    const input = jx && key === 'nClass' ? membershipField(value) : fieldInput(key, value, { readonly: !state.document.writable || key === 'raw' || value !== null && typeof value === 'object' && key !== 'tLevel' });
    (fieldLabels[key] && key !== 'raw' ? form : advanced).append(input);
  }
  if (advanced.children.length > 1) form.append(advanced);
  const draft = state.drafts.get(record.key);
  for (const input of form.querySelectorAll('[name]')) {
    if (draft && Object.hasOwn(draft.values, input.name)) {
      if (input.name === 'nClass' && input.options && ![...input.options].some(option => option.value === draft.values.nClass)) {
        const option = element('option', '', `${typeLabel(draft.values.nClass)}（待保存）`);
        option.value = draft.values.nClass; input.append(option);
      }
      input.value = draft.values[input.name];
    }
  }
  if (draft) trackDraft(form, record.key);
  form.addEventListener('input', () => {
    trackDraft(form, record.key);
    syncDraftState();
  });
  const apply = element('button', 'button primary apply-button', '保存条目修改');
  apply.type = 'submit';
  apply.disabled = !state.document.writable;
  form.append(apply);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      const fields = Object.fromEntries(Object.entries(formValues(form)).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(originalFields[key])));
      if (!Object.keys(fields).length) { state.drafts.delete(record.key); syncDraftState(); toast('没有需要保存的修改。'); return; }
      const submitted = Object.fromEntries([...form.querySelectorAll('[name]')].map(input => [input.name, input.value]));
      await draftNotifications;
      const result = await bridge.edit(datasetPayload({ key: record.key, fields }));
      if (result?.document) {
        const current = state.drafts.get(record.key);
        if (current && JSON.stringify(current.values) === JSON.stringify(submitted)) state.drafts.delete(record.key);
      }
      if (receive(result)) toast('条目已更新。导出配置以写入文件。');
    });
  });
  content.append(form);
  appendWarnings(content);
}

function appendWarnings(content) {
  for (const warning of state.document?.warnings || []) content.append(element('div', 'warning-box', typeof warning === 'string' ? warning : JSON.stringify(warning)));
}

function cleanMarkup(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/\\n/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Math.min(Number(code), 0x10ffff)));
}

function renderLookup(content, record) {
  content.append(element('div', 'section-label', 'JX3BOX BUFF 数据'));
  const controls = element('div', 'lookup-controls');
  const select = element('select');
  select.setAttribute('aria-label', '客户端版本');
  for (const [value, label] of [['std', '重制版'], ['origin', '怀旧服'], ['wujie', '无界']]) {
    const option = element('option', '', label);
    option.value = value;
    select.append(option);
  }
  select.value = state.lookupClient;
  select.addEventListener('change', () => {
    documentGeneration++;
    lookupSequence++;
    state.lookupClient = select.value;
    state.lookup = null;
    enrichmentStopped = false;
    refreshMetadata();
    renderInspector();
    startEnrichment();
  });
  const level = element('input');
  level.type = 'number'; level.min = '1'; level.placeholder = '等级'; level.value = state.lookupLevel;
  level.setAttribute('aria-label', 'Buff 等级');
  level.addEventListener('input', () => {
    state.lookupLevel = level.value;
    state.lookup = null;
    lookupSequence++;
    button.disabled = !buffQuery(record, state.lookupLevel);
    button.textContent = '查询 JX3BOX';
    renderLookupDetails($('lookup-results'), record);
  });
  level.addEventListener('change', () => renderInspector());
  controls.append(select, level);
  const button = element('button', 'button primary lookup-button', state.lookup?.loading ? '查询中…' : '查询 JX3BOX');
  button.disabled = !buffQuery(record, state.lookupLevel) || state.lookup?.loading;
  button.addEventListener('click', () => lookup(record));
  content.append(controls, button);
  const details = element('div');
  details.id = 'lookup-results';
  content.append(details);
  renderLookupDetails(details, record);
}

function renderLookupDetails(content, record) {
  content.replaceChildren();
  const query = buffQuery(record, state.lookupLevel);
  if (!query) { content.append(element('p', 'muted-text', '选择一个 Buff 条目并填写有效等级后查询。分类、聊天与原始配置没有独立的 Buff 数据。')); return; }
  const entry = metadata.get(metadataKey(query));
  const lookup = state.lookup || (entry ? { result: entry.result } : null);
  if (!lookup) {
    const empty = element('div', 'lookup-empty');
    empty.append(element('div', 'empty-symbol', '⌕'), element('p', 'muted-text', '按 ID 或条目名称查询真实数据。\n查询结果不会改写本地配置。'));
    content.append(empty);
    return;
  }
  if (lookup.loading) { content.append(element('p', 'muted-text', '正在读取 JX3BOX 数据…')); return; }
  if (lookup.error) { content.append(element('div', 'warning-box', lookup.error)); return; }
  const result = lookup.result;
  const list = Array.isArray(result?.list) ? result.list : [];
  if (!list.length) content.append(element('div', 'inspector-note', '未找到匹配记录。请检查 ID、客户端版本和等级。'));
  for (const item of list) {
    const heading = element('div', 'remote-heading');
    const displayName = metadataDisplayName(item);
    heading.append(recordGlyph(record, { item, query }), element('h4', 'remote-name', displayName.name || '名称未提供'));
    if (displayName.internal) heading.append(element('span', 'metadata-source', '内部名'));
    content.append(heading, element('p', 'remote-description', cleanMarkup(item.Desc ?? item.desc ?? item.Description ?? '描述未提供')));
    const grid = element('dl', 'remote-grid');
    for (const key of ['BuffID', 'Level', 'IconID', 'DetachType']) {
      const cell = element('div');
      cell.append(element('dt', '', key), element('dd', '', item[key] === undefined || item[key] === null ? '未提供' : textValue(item[key])));
      grid.append(cell);
    }
    const details = element('details', 'raw-details');
    details.append(element('summary', '', '查看完整返回记录'), element('pre', 'raw-data', JSON.stringify(item, null, 2)));
    content.append(grid, details);
  }
  if (result) {
    content.append(element('p', 'lookup-source', `来源 ${result.source || 'JX3BOX'} · 客户端 ${result.client || state.lookupClient} · 等级 ${result.query?.level ?? state.lookupLevel}${result.stale ? ' · 离线缓存' : ''}${result.cachedAt ? ` · ${new Date(result.cachedAt).toLocaleString()}` : ''}`));
    const raw = element('details', 'raw-details');
    raw.append(element('summary', '', '查看完整 API 响应'), element('pre', 'raw-data', JSON.stringify(result.raw ?? result, null, 2)));
    content.append(raw);
  }
}

async function lookup(record) {
  const sequence = ++lookupSequence;
  const generation = documentGeneration;
  const key = record.key;
  const query = buffQuery(record, state.lookupLevel);
  const isCurrent = () => generation === documentGeneration && sequence === lookupSequence && state.selected === key;
  state.lookup = { loading: true };
  renderInspector();
  try {
    if (!query) throw new Error('请选择 Buff 条目，等级需要为 1 到 99999 的整数。');
    const result = await requestCatalog(query, isCurrent);
    if (isCurrent()) {
      state.lookup = { result };
      const entry = matchedMetadata(query, result);
      if (entry) metadata.set(metadataKey(query), entry);
      else metadata.delete(metadataKey(query));
      refreshMetadata(metadataKey(query));
    }
  } catch (error) { if (isCurrent()) state.lookup = { error: error.message || String(error) }; }
  if (isCurrent() && state.tab === 'box') {
    renderLookupDetails($('lookup-results'), record);
    const button = $('inspector-content').querySelector('.lookup-button');
    button.disabled = false;
    button.textContent = '查询 JX3BOX';
  }
}

function showModal(title, content, submitText, action) {
  modalMetadataRefresh = null;
  $('modal-title').textContent = title;
  $('modal-content').replaceChildren(content);
  $('modal-submit').textContent = submitText || '确定';
  $('modal-submit').hidden = !action;
  $('modal-cancel').textContent = action ? '取消' : '关闭';
  $('modal-submit').disabled = false;
  modalAction = action;
  if (!$('modal').open) $('modal').showModal();
  content.querySelector('input:not([type=hidden]):not([hidden]), select, textarea, button')?.focus();
}

function closeModal() { modalMetadataRefresh = null; $('modal').close(); }

function newDocument() {
  const feature = featureById(state.featureId);
  if (state.busy || !formats[feature.kind].add) return;
  const content = element('div');
  const extension = feature.kind === 'jx-buff' ? '.jx3dat' : '.txt';
  const filename = fieldInput('filename', `${feature.title} 新数据集${extension}`);
  filename.querySelector('span').textContent = '数据文件名';
  filename.querySelector('input').required = true;
  const version = fieldInput('gameVersion', '');
  version.querySelector('span').textContent = '数据版本（可选）';
  version.querySelector('input').placeholder = '例如 赛季名称 / 2026-11';
  const input = element('input');
  input.type = 'radio'; input.name = 'new-kind'; input.value = feature.kind; input.checked = true; input.hidden = true;
  content.append(filename, version, input, element('p', 'muted-text', '版本用于区分你的数据集，不代表已验证游戏兼容性。'));
  showModal('新建数据集', content, '创建数据集', async () => {
    const name = filename.querySelector('input').value.trim();
    if (!name) throw new Error('请输入数据文件名。');
    await draftNotifications;
    const result = await bridge.create({ kind: feature.kind, filename: name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`, gameVersion: version.querySelector('input').value.trim() });
    if (receive(result, true)) { closeModal(); toast('已创建数据集。'); }
  });
}

function addRecord() {
  if (state.document?.kind === 'jx-buff') { assignMember(); return; }
  const spec = formats[state.document?.kind]?.add;
  if (!spec || !state.document.writable) return;
  const content = element('div');
  const form = element('div');
  for (const [key, value] of Object.entries(spec)) form.append(fieldInput(key, value));
  content.append(form);
  const label = state.document.kind === 'chat' ? '添加关键词' : '新建监控';
  showModal(label, content, label, async () => {
    const fields = formValues(form);
    const previous = new Set(state.document.records.map((record) => record.key));
    const result = await bridge.add(datasetPayload(fields));
    if (receive(result)) {
      state.selected = state.document.records.find((record) => !previous.has(record.key))?.key || state.selected;
      state.search = ''; $('search').value = ''; state.tab = 'config';
      render(); closeModal(); toast('已添加条目。');
    }
  });
}



const open = () => run(async () => { await draftNotifications; return receive(await bridge.open(), true); });
const save = () => run(async () => { if (state.document?.writable) { await draftNotifications; const result = await bridge.save(datasetPayload()); if (receive(result)) toast('配置已导出。'); } });
for (const id of ['open-button', 'empty-open']) $(id).addEventListener('click', open);
$('save-button').addEventListener('click', save);
const undo = () => run(async () => {
  const previous = state.document;
  const drafts = new Map(state.drafts);
  await draftNotifications;
  const result = await bridge.undo(datasetPayload());
  if (result?.document) {
    for (const record of previous?.records || []) {
      const restored = result.document.records.find(item => item.key === record.key);
      if (JSON.stringify(record) !== JSON.stringify(restored) && state.drafts.get(record.key) === drafts.get(record.key)) state.drafts.delete(record.key);
    }
  }
  receive(result);
});
$('undo-button').addEventListener('click', undo);
$('new-button').addEventListener('click', newDocument);
$('dataset-info-button')?.addEventListener('click', datasetInfo);
$('detail-modal')?.addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
function closeOnOutsideClick(dialog, close) {
  const outside = event => {
    const box = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
  };
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', event => { pressedOutside = outside(event); });
  dialog.addEventListener('click', event => { if (pressedOutside && outside(event)) close(); pressedOutside = false; });
}
closeOnOutsideClick($('detail-modal'), () => closeDetail());
closeOnOutsideClick($('modal'), closeModal);
$('add-button').addEventListener('click', addRecord);
$('search').addEventListener('input', (event) => { state.search = event.target.value; if (state.document?.kind === 'jx-buff') { state.typeSearch = state.search; if ($('type-search')) $('type-search').value = state.search; } renderRecords(); });
for (const tab of ['config', 'box', 'source']) $(`${tab}-tab`).addEventListener('click', () => { state.tab = tab; renderInspector(); });
$('modal-close').addEventListener('click', closeModal);
$('modal-cancel').addEventListener('click', closeModal);
$('modal').addEventListener('close', () => { modalMetadataRefresh = null; });
$('modal-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!modalAction) return;
  $('modal-submit').disabled = true;
  await run(modalAction);
  $('modal-submit').disabled = false;
});
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 'o') { event.preventDefault(); if (!$('modal').open && !$('detail-modal')?.open) open(); }
  if (event.key.toLowerCase() === 's') { event.preventDefault(); if (!$('modal').open) save(); }
  if (event.key.toLowerCase() === 'k') { event.preventDefault(); focusSearch(); }
  if (event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); if (state.canUndo) undo(); }
});

initializeFeatures();
render();
run(async () => {
  const samples = await bridge.samples();
  state.samples = Array.isArray(samples) ? samples : [];
  renderSamples();
  if (state.samples.length) await openSample(state.samples[0].path);
});


let updateBannerBusy = false;
let updateActionBusy = false;
let updateActionEpoch = 0;
let updateView = null;

function renderUpdateBanner(result) {
  updateView = result;
  const status = result?.status;
  const known = ['available', 'downloading', 'ready'].includes(status);
  const retry = status === 'error';
  const show = known || retry && result.version !== undefined;
  $('update-banner').hidden = !show;
  const button = $('update-restart');
  button.hidden = !known && !retry;
  button.disabled = updateActionBusy || Boolean(result?.installRequested);
  button.textContent = result?.installRequested ? status === 'ready' ? '正在安装…' : '准备中…' : retry ? '重试' : '安装';
  if (result?.blocked) $('update-message').textContent = result.message || '请先保存或撤销修改，再安装更新。';
  else if (retry) $('update-message').textContent = result.message || '更新未完成，请重试。';
  else if (result?.installRequested) $('update-message').textContent = status === 'ready' ? '正在更新，即将重新打开应用。' : `正在下载 ${result.progress || 0}%，完成后自动更新并重启。`;
  else if (known) $('update-message').textContent = `发现新版本${result.version ? ` ${result.version}` : ''}`;
}

async function refreshUpdateBanner() {
  if (updateBannerBusy || updateActionBusy || typeof bridge.updates !== 'function') return;
  updateBannerBusy = true;
  const epoch = updateActionEpoch;
  try {
    const result = await bridge.updates('status');
    if (!updateActionBusy && epoch === updateActionEpoch) renderUpdateBanner(result);
  } catch {}
  finally { updateBannerBusy = false; }
}


$('settings-button').addEventListener('click', openSettings);
$('version-edit').addEventListener('click', renameVersion);
$('lock-copy').addEventListener('click', () => duplicateDataset({ datasetId: state.datasetId }));
$('update-restart').addEventListener('click', () => run(async () => {
  if (updateActionBusy || updateView?.installRequested) return;
  updateActionBusy = true;
  updateActionEpoch++;
  $('update-restart').disabled = true;
  try {
    await draftNotifications;
    const action = updateView?.status === 'error' ? 'check' : 'install';
    renderUpdateBanner(await bridge.updates(action));
  } catch (error) { renderUpdateBanner({ status: 'error', message: error.message || '更新未完成，请重试。' }); }
  finally { updateActionBusy = false; if (updateView) renderUpdateBanner(updateView); }
}));
refreshUpdateBanner();
setInterval(() => { if (!document.hidden) refreshUpdateBanner(); }, 2000);
window.addEventListener('focus', refreshUpdateBanner);
