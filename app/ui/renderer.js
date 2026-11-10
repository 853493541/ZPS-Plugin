import { features, featureById, featureForKind, featureForSample } from './features.mjs';

const $ = (id) => document.getElementById(id);
const formats = {
  'jx-buff': { add: { id: '', nClass: '', nPower: 10, tLevel: { 0: true, 1: true } } },
  'my-team': { add: { reference: '', color: '#FFFFFFFF', label: '', priority: 9 } },
  chat: { add: { keyword: '' } },
  opaque: {},
};
const freshView = () => ({ document: null, filename: '', dirty: false, canUndo: false, selected: null, category: null, search: '', tab: 'config', lookup: null, lookupClient: 'std', lookupLevel: '1', drafts: new Map() });
const state = { ...freshView(), featureId: features[0].id, samples: [], busy: false };
const views = new Map();
let activationQueue = Promise.resolve();
let activationSequence = 0;
let switching = false;
let draftNotifications = Promise.resolve();

function syncDraftState() {
  if (typeof bridge.setDraftState !== 'function') return;
  const dirty = [...state.drafts].some(([key, draft]) => {
    const record = state.document?.records.find(item => item.key === key);
    if (!record) return false;
    const original = key.startsWith('class:') ? { name: record.name, ...record.fields } : record.fields;
    return !draft.fields || Object.entries(draft.fields).some(([name, value]) => JSON.stringify(value) !== JSON.stringify(original[name]));
  });
  const payload = { featureId: state.featureId, dirty };
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
  views.set(state.featureId, Object.fromEntries(Object.keys(freshView()).map(key => [key, state[key]])));
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
  if ((state.busy && !switching) || (id === state.featureId && (switching || state.document))) return;
  featureById(id);
  if (!switching) rememberView();
  const sequence = ++activationSequence;
  switching = true;
  state.busy = true;
  clearMetadata();
  clearTimeout(toastTimer);
  $('toast').hidden = true;
  Object.assign(state, freshView(), { featureId: id });
  $('search').value = '';
  render();
  activationQueue = activationQueue.then(async () => {
    if (sequence !== activationSequence) return;
    try {
      await draftNotifications;
      const result = await bridge.activateFeature(id);
      if (sequence !== activationSequence) return;
      Object.assign(state, views.get(id) || freshView());
      state.document = null;
      state.busy = false;
      switching = false;
      if (!receive(result, false, true)) { state.dirty = false; state.canUndo = false; render(); }
    } catch (error) {
      if (sequence !== activationSequence) return;
      state.busy = false;
      switching = false;
      render();
      toast(error.message || String(error), true);
    }
  });
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
      const next = { ArrowRight: (index + 1) % features.length, ArrowLeft: (index + features.length - 1) % features.length, Home: 0, End: features.length - 1 }[event.key];
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
  $('feature-addon').textContent = feature.addon;
  $('feature-guidance').textContent = feature.description;
  $('import-destination').textContent = `导入位置 · ${feature.importPath}`;
  $('feature-presets').replaceChildren();
  $('feature-presets').hidden = feature.kind !== 'opaque';
  if (feature.kind === 'opaque') {
    $('feature-presets').append(element('span', 'preset-label', '目标监控预设 · 只读'));
    for (const sample of state.samples.filter(item => featureForSample(item.path) === feature.id)) {
      const button = element('button', `preset-choice${fileName(sample.path) === fileName(state.filename) ? ' active' : ''}`, fileName(sample.path).replace(/\.jx3dat$/i, ''));
      button.type = 'button';
      button.disabled = state.busy;
      button.addEventListener('click', () => run(() => openSample(sample.path)));
      $('feature-presets').append(button);
    }
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
let toastTimer;
let modalAction;
let updateTimer;
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

function recordSubtitle(record) {
  const item = recordMetadata(record)?.item;
  return `${record.id !== undefined ? `ID ${record.id}` : record.key}${metadataDisplayName(item).internal ? ' · 内部名' : ''}`;
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
  $('selection-heading').replaceChildren(recordGlyph(record, entry, true), element('h3', '', recordName(record)), element('p', '', record ? record.id !== undefined ? `BUFF ID ${record.id}` : entry ? `BUFF ID ${entry.item.BuffID} · ${record.key}` : record.key : '从配置库中选择一个条目'));
  if (entry) $('selection-heading').append(element('p', 'metadata-source', `JX3BOX · ${entry.query.client} · 等级 ${entry.query.level}${metadataDisplayName(entry.item).internal ? ' · 内部名' : ''}${entry.result.stale ? ' · 离线缓存' : entry.result.source === 'cache' ? ' · 缓存' : ''}`));
}

function refreshMetadata(changedKey) {
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
  if (!result?.document) return false;
  const id = result.featureId || featureForKind(result.document.kind) || state.featureId;
  if (id !== state.featureId) {
    rememberView();
    Object.assign(state, views.get(id) || freshView(), { featureId: id });
    clearMetadata();
  }
  documentGeneration++;
  lookupSequence++;
  state.lookup = null;
  if (reset) { clearMetadata(); state.drafts = new Map(); }
  Object.assign(state, { document: result.document, filename: result.filename || '', dirty: Boolean(result.dirty), canUndo: Boolean(result.canUndo) });
  if (reset) Object.assign(state, { selected: null, category: null, search: '', lookup: null, tab: 'config' });
  if (!state.document.records.some((record) => record.key === state.selected)) {
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
  return (state.document?.records || []).filter((record) => (!state.category || String(record.category || '未分类') === state.category) && (!state.search || `${recordName(record)} ${record.name} ${record.id ?? ''} ${record.key} ${JSON.stringify(record.fields)}`.toLowerCase().includes(state.search.toLowerCase())));
}

function render() {
  const doc = state.document;
  const feature = featureById(state.featureId);
  renderFeatures();
  const count = doc?.records.length || 0;
  $('breadcrumb-name').textContent = doc ? fileName(state.filename) : '未打开文件';
  $('breadcrumb-name').title = state.filename;
  $('dirty-dot').hidden = !state.dirty;
  $('document-title').textContent = feature.title;
  $('document-description').textContent = switching ? '正在切换工作区…' : doc ? fileName(state.filename) : '打开本地配置，或选择此功能的样本。';
  $('format-badge').textContent = feature.kind === 'opaque' ? 'READ ONLY' : feature.badge;
  renderAvailability();
  $('sidebar-count').textContent = count;
  $('document-meta').replaceChildren();
  for (const text of doc ? [`${doc.encoding || '原始编码'} · ${doc.writable ? '可编辑' : '只读'}`, `${count} 个条目`, '保留原有格式与未知字段'] : ['本地工作区', '保留原有格式与未知字段']) {
    $('document-meta').append(element('span', '', text));
  }
  renderCategories();
  renderRecords();
  renderInspector();
  renderSamples();
  $('status-text').textContent = switching ? '正在切换工作区…' : state.dirty ? '有未导出的修改' : '准备就绪';
}

function renderAvailability() {
  const feature = featureById(state.featureId);
  const format = formats[feature.kind];
  $('save-button').disabled = state.busy || !state.document?.writable || feature.kind === 'opaque';
  $('undo-button').disabled = state.busy || !state.canUndo;
  $('new-button').disabled = state.busy || !format.add;
  $('add-button').hidden = feature.kind === 'opaque';
  $('add-button').disabled = state.busy || !state.document?.writable || !format.add;
  $('search').disabled = switching;
  for (const button of document.querySelectorAll('#sample-list button, #feature-presets button')) button.disabled = state.busy;
}

function renderCategories() {
  const counts = new Map();
  for (const record of state.document?.records || []) {
    const name = String(record.category || '未分类');
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  $('category-count').textContent = counts.size;
  $('category-list').replaceChildren();
  for (const [name, count] of counts) {
    const button = element('button', `category-item${state.category === name ? ' active' : ''}`, name);
    button.append(element('span', '', count));
    button.addEventListener('click', () => { state.category = name; renderCategories(); renderRecords(); });
    $('category-list').append(button);
  }
  $('all-records').classList.toggle('selected', !state.category);
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
  const records = visibleRecords();
  $('records-body').replaceChildren();
  $('list-summary').replaceChildren(document.createTextNode(state.category || '全部条目'), element('b', '', records.length));
  $('record-total').textContent = `${records.length} / ${state.document?.records.length || 0} 个条目`;
  $('list-caption').textContent = state.search ? `搜索 “${state.search}”` : '选择条目查看详情';
  $('empty-state').hidden = records.length > 0;
  const empty = $('empty-state');
  if (state.document && !records.length) {
    empty.querySelector('h3').textContent = state.document.kind === 'opaque' ? '当前文件以只读方式打开' : state.search || state.category ? '没有匹配的条目' : '这份配置还没有条目';
    empty.querySelector('p').textContent = state.document.kind === 'opaque' ? '在右侧原始数据页查看文件内容。' : state.search || state.category ? '尝试其他关键词或切换分类。' : '点击添加条目开始编辑。';
    $('empty-open').hidden = true;
  } else {
    empty.querySelector('h3').textContent = '从一份配置开始';
    empty.querySelector('p').textContent = switching ? '正在载入此功能的配置，请稍候。' : `${featureById(state.featureId).title} · 打开本地文件，或选择左侧样本。`;
    empty.querySelector('h3').textContent = switching ? '正在切换工作区' : '从一份配置开始';
    $('empty-open').hidden = false;
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
    const fieldsCell = element('td', 'field-preview', Object.keys(record.fields || {}).filter((key) => !key.startsWith('_')).slice(0, 2).join(' · ') || '原始值');
    row.append(glyphCell, nameCell, categoryCell, fieldsCell, element('td', '', '›'));
    const select = () => { state.selected = record.key; state.lookup = null; state.lookupLevel = referenceQuery(record).level || '1'; lookupSequence++; renderRecords(); renderInspector(); };
    row.addEventListener('click', select);
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
    $('records-body').append(row);
  }
}

function fieldInput(key, value, options = {}) {
  const field = element('label', 'field');
  field.append(element('span', '', key));
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

function formValues(form) {
  const fields = {};
  for (const input of form.querySelectorAll('[name]')) {
    let value = input.value;
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

function renderInspector() {
  const record = selectedRecord();
  const content = $('inspector-content');
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
    content.append(element('div', 'section-label', record ? '条目原始数据' : '文件原始内容'), element('p', 'file-source', '只读预览。编辑配置字段后，导出时保留未修改的内容。'), element('pre', 'raw-data', record ? JSON.stringify(record, null, 2) : state.document?.text || '尚未打开配置文件。'));
    return;
  }
  if (state.tab === 'box') { renderLookup(content, record); return; }
  if (!record) {
    content.append(element('p', 'muted-text', state.document?.kind === 'opaque' ? '未识别的格式不能直接编辑。切换到原始数据页查看文件内容。' : '选择左侧条目后，可在这里编辑配置中已有的字段。'));
    appendWarnings(content);
    return;
  }
  const heading = element('div', 'section-label', '配置参数');
  heading.append(element('span', '', `${Object.keys(record.fields).length} FIELDS`));
  content.append(heading);
  const form = element('form');
  const originalFields = record.key.startsWith('class:') ? { name: record.name, ...record.fields } : record.fields;
  for (const [key, value] of Object.entries(originalFields || {})) form.append(fieldInput(key, value, { readonly: !state.document.writable || key === 'raw' || value !== null && typeof value === 'object' && key !== 'tLevel' }));
  const draft = state.drafts.get(record.key);
  for (const input of form.querySelectorAll('[name]')) {
    if (draft && Object.hasOwn(draft.values, input.name)) input.value = draft.values[input.name];
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
      if (!Object.keys(fields).length) { toast('没有需要保存的修改。'); return; }
      const submitted = Object.fromEntries([...form.querySelectorAll('[name]')].map(input => [input.name, input.value]));
      await draftNotifications;
      const result = await bridge.edit({ key: record.key, fields });
      if (result?.document) {
        const current = state.drafts.get(record.key);
        if (current && JSON.stringify(current.values) === JSON.stringify(submitted)) state.drafts.delete(record.key);
        if (fields.name && record.key.startsWith('class:')) {
          state.selected = `class:${fields.name}`;
          if (state.drafts.has(record.key)) {
            state.drafts.set(state.selected, state.drafts.get(record.key));
            state.drafts.delete(record.key);
          }
        }
      }
      if (receive(result)) toast('条目已更新。导出配置以写入文件。');
    });
  });
  content.append(form, element('div', 'inspector-note', '字段名与值来自原文件。未识别字段保留原样。ID 和结构变更请通过添加条目操作。'));
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
  clearInterval(updateTimer);
  $('modal-title').textContent = title;
  $('modal-content').replaceChildren(content);
  $('modal-submit').textContent = submitText || '确定';
  $('modal-submit').hidden = !action;
  $('modal-cancel').textContent = action ? '取消' : '关闭';
  $('modal-submit').disabled = false;
  modalAction = action;
  $('modal').showModal();
}

function closeModal() { clearInterval(updateTimer); $('modal').close(); }

function newDocument() {
  const feature = featureById(state.featureId);
  if (state.busy || !formats[feature.kind].add) return;
  const content = element('div');
  content.append(element('p', 'modal-description', `为${feature.title}创建空白配置。导出时选择保存位置。`));
  const label = element('label', 'format-choice');
  const input = element('input');
  input.type = 'radio'; input.name = 'new-kind'; input.value = feature.kind; input.checked = true;
  const text = element('div');
  text.append(element('strong', '', feature.title), element('small', '', feature.importPath));
  label.append(input, text);
  content.append(label);
  showModal(`新建${feature.title}`, content, '创建配置', async () => {
    await draftNotifications;
    const result = await bridge.create(feature.kind);
    if (receive(result, true)) { closeModal(); toast('已创建空白配置。'); }
  });
}

function addRecord() {
  const spec = formats[state.document?.kind]?.add;
  if (!spec || !state.document.writable) return;
  const content = element('div');
  content.append(element('p', 'modal-description', '填写该格式所需的原始字段。字段语义请以插件配置说明为准。'));
  const form = element('div');
  let kindSelect;
  const populate = () => {
    form.replaceChildren();
    for (const [key, value] of Object.entries(kindSelect?.value === 'class' ? { name: '' } : spec)) form.append(fieldInput(key, value));
  };
  if (state.document.kind === 'jx-buff') {
    const field = element('label', 'field');
    field.append(element('span', '', '条目类型'));
    kindSelect = element('select');
    for (const [value, title] of [['buff', 'Buff 条目'], ['class', '分类配置']]) { const option = element('option', '', title); option.value = value; kindSelect.append(option); }
    field.append(kindSelect); content.append(field);
    kindSelect.addEventListener('change', populate);
  }
  populate();
  content.append(form);
  showModal('添加条目', content, '添加条目', async () => {
    const fields = formValues(form);
    if (kindSelect?.value === 'class') fields.type = 'class';
    else if (state.document.kind === 'jx-buff') {
      if (!/^\d+$/.test(fields.id)) throw new Error('Buff ID 需要为数字。');
      fields.id = Number(fields.id);
    }
    const previous = new Set(state.document.records.map((record) => record.key));
    const result = await bridge.add(fields);
    if (receive(result)) {
      state.selected = state.document.records.find((record) => !previous.has(record.key))?.key || state.selected;
      state.category = null; state.search = ''; $('search').value = ''; state.tab = 'config';
      render(); closeModal(); toast('已添加条目。');
    }
  });
}

function reportProblem() {
  const content = element('div');
  content.append(element('p', 'modal-description', '描述遇到的问题和重现步骤。反馈会导出到本地文件，由你检查后自行提交。'));
  const field = fieldInput('问题描述', '');
  const original = field.querySelector('input');
  const input = element('textarea'); input.rows = 6; input.placeholder = '发生了什么？你期望看到什么？'; input.required = true;
  original.replaceWith(input);
  content.append(field);
  showModal('导出问题反馈', content, '导出反馈', async () => {
    if (!input.value.trim()) throw new Error('请先填写问题描述。');
    const result = await bridge.report(input.value.trim());
    if (!result || result.canceled || result.cancelled) return;
    closeModal(); toast('问题反馈已导出到本地。');
  });
}

function updates() {
  const content = element('div');
  content.append(element('p', 'modal-description', '通过已配置的发布源检查桌面应用更新。'));
  const output = element('div', 'update-state', '正在读取更新状态…');
  const actions = element('div', 'update-actions');
  const labels = { check: '检查更新', download: '下载更新', install: '安装并重启' };
  const buttons = {};
  const refresh = async (action = 'status') => {
    try {
      for (const button of Object.values(buttons)) button.disabled = true;
      await draftNotifications;
      const result = await bridge.updates(action);
      const status = result?.status || result?.state;
      const statusLabels = { idle: '可以检查是否有新版本。', checking: '正在检查更新…', available: '发现新版本，可以下载更新。', current: '当前已是最新版本。', downloading: '正在下载更新…', ready: '更新已下载，安装后将重启应用。', unavailable: '当前环境不支持自动更新。', error: '更新操作未完成。' };
      output.textContent = typeof result === 'string' ? result : [statusLabels[status] || '更新状态未知。', result?.version ? `版本 ${result.version}` : '', result?.progress !== undefined ? `已下载 ${result.progress}%` : '', result?.message || ''].filter(Boolean).join('\n');
      buttons.check.disabled = false;
      buttons.download.disabled = !['available', 'update-available'].includes(status);
      buttons.install.disabled = !['downloaded', 'ready', 'update-downloaded'].includes(status);
    } catch (error) { output.textContent = error.message || String(error); buttons.check.disabled = false; }
  };
  for (const [action, label] of Object.entries(labels)) {
    const button = element('button', 'button', label); button.type = 'button'; button.disabled = true;
    button.addEventListener('click', () => refresh(action)); buttons[action] = button; actions.append(button);
  }
  content.append(output, actions);
  showModal('应用更新', content);
  refresh();
  updateTimer = setInterval(() => { if ($('modal').open) refresh(); }, 3000);
}

const open = () => run(async () => { await draftNotifications; return receive(await bridge.open(), true); });
const save = () => run(async () => { if (state.document?.writable) { await draftNotifications; const result = await bridge.save(); if (receive(result)) toast('配置已导出。'); } });
for (const id of ['open-button', 'sidebar-open', 'empty-open']) $(id).addEventListener('click', open);
$('save-button').addEventListener('click', save);
const undo = () => run(async () => {
  const previous = state.document;
  const drafts = new Map(state.drafts);
  await draftNotifications;
  const result = await bridge.undo();
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
$('add-button').addEventListener('click', addRecord);
$('report-nav').addEventListener('click', reportProblem);
$('update-nav').addEventListener('click', updates);
$('workspace-nav').addEventListener('click', () => { $('search').focus(); });
$('all-records').addEventListener('click', () => { state.category = null; renderCategories(); renderRecords(); });
$('search').addEventListener('input', (event) => { state.search = event.target.value; renderRecords(); });
for (const tab of ['config', 'box', 'source']) $(`${tab}-tab`).addEventListener('click', () => { state.tab = tab; renderInspector(); });
$('modal-close').addEventListener('click', closeModal);
$('modal-cancel').addEventListener('click', closeModal);
$('modal').addEventListener('close', () => clearInterval(updateTimer));
$('modal-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!modalAction) return;
  $('modal-submit').disabled = true;
  await run(modalAction);
  $('modal-submit').disabled = false;
});
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 'o') { event.preventDefault(); if (!$('modal').open) open(); }
  if (event.key.toLowerCase() === 's') { event.preventDefault(); if (!$('modal').open) save(); }
  if (event.key.toLowerCase() === 'k') { event.preventDefault(); $('search').focus(); }
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
