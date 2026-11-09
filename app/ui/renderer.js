const $ = (id) => document.getElementById(id);
const formats = {
  'jx-buff': { title: 'JX Buff 配置', badge: 'JX · BUFF', description: '管理增益条目、分类与原始参数。', add: { id: '', nClass: '', nPower: 10, tLevel: { 0: true, 1: true } } },
  'my-team': { title: 'MY 团队配置', badge: 'MY · TEAM', description: '管理团队监控条目，保留配置中的原始值。', add: { reference: '', color: '#FFFFFFFF', label: '', priority: 9 } },
  chat: { title: '聊天配置', badge: 'CHAT · CONFIG', description: '管理聊天关键词与原始配置字段。', add: { keyword: '' } },
  opaque: { title: '原始配置', badge: 'READ ONLY', description: '当前格式可预览。未识别的内容以只读方式保留。' },
};
const state = { document: null, filename: '', dirty: false, canUndo: false, selected: null, category: null, search: '', tab: 'config', samples: [], lookup: null, lookupClient: 'std', lookupLevel: '1', busy: false };
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
  finally { state.busy = false; $('status-text').textContent = state.dirty ? '有未导出的修改' : '准备就绪'; }
}

function receive(result, reset = false) {
  if (!result?.document) return false;
  Object.assign(state, { document: result.document, filename: result.filename || '', dirty: Boolean(result.dirty), canUndo: Boolean(result.canUndo) });
  if (reset) Object.assign(state, { selected: null, category: null, search: '', lookup: null, tab: 'config' });
  if (!state.document.records.some((record) => record.key === state.selected)) {
    state.selected = state.document.records[0]?.key ?? null;
    state.lookupLevel = referenceQuery(selectedRecord()).level || '1';
  }
  $('search').value = state.search;
  render();
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
  return (state.document?.records || []).filter((record) => (!state.category || String(record.category || '未分类') === state.category) && (!state.search || `${record.name} ${record.id ?? ''} ${record.key} ${JSON.stringify(record.fields)}`.toLowerCase().includes(state.search.toLowerCase())));
}

function render() {
  const doc = state.document;
  const format = formats[doc?.kind] || formats.opaque;
  const count = doc?.records.length || 0;
  $('breadcrumb-name').textContent = doc ? fileName(state.filename) : '未打开文件';
  $('breadcrumb-name').title = state.filename;
  $('dirty-dot').hidden = !state.dirty;
  $('document-title').textContent = doc ? format.title : '配置库';
  $('document-description').textContent = doc ? format.description : '在一个工作区内管理 MY 与 JX 配置。';
  $('format-badge').textContent = doc ? format.badge : 'LOCAL WORKSPACE';
  $('save-button').disabled = !doc || !doc.writable;
  $('undo-button').disabled = !state.canUndo;
  $('add-button').disabled = !doc?.writable || !format.add;
  $('sidebar-count').textContent = count;
  $('document-meta').replaceChildren();
  for (const text of doc ? [`${doc.encoding || '原始编码'} · ${doc.writable ? '可编辑' : '只读'}`, `${count} 个条目`, '保留原有格式与未知字段'] : ['本地工作区', '保留原有格式与未知字段']) {
    $('document-meta').append(element('span', '', text));
  }
  renderCategories();
  renderRecords();
  renderInspector();
  renderSamples();
  $('status-text').textContent = state.dirty ? '有未导出的修改' : '准备就绪';
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
  if (!state.samples.length) $('sample-list').append(element('p', 'sidebar-hint', '没有可用样本。可打开本地文件。'));
  for (const sample of state.samples) {
    const button = element('button', `sample-item${sample.path === state.filename ? ' active' : ''}`);
    button.title = sample.path;
    button.append(element('span', 'sample-symbol', '▧'), element('span', '', sample.name || fileName(sample.path)));
    button.addEventListener('click', () => run(async () => receive(await bridge.openSample(sample.path), true)));
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
    empty.querySelector('p').textContent = '打开本地文件，或选择左侧样本。支持 JX Buff、MY 团队配置与聊天配置。';
    $('empty-open').hidden = false;
  }
  for (const record of records) {
    const row = element('tr', `record-row${record.key === state.selected ? ' selected' : ''}`);
    row.tabIndex = 0;
    row.setAttribute('aria-selected', String(record.key === state.selected));
    const glyphCell = element('td');
    glyphCell.append(element('div', 'record-glyph', record.key.startsWith('class:') ? '▦' : '✦'));
    const nameCell = element('td');
    nameCell.append(element('div', 'record-name', record.name || (record.id ? `#${record.id}` : record.key)), element('div', 'record-id', record.id ? `ID ${record.id}` : record.key));
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
  $('selection-heading').replaceChildren(element('div', 'record-glyph big', record?.key.startsWith('class:') ? '▦' : '✦'), element('h3', '', record?.name || (record?.id ? `#${record.id}` : '条目详情')), element('p', '', record ? `${record.id ? `BUFF ID ${record.id}` : record.key}` : '从配置库中选择一个条目'));
  $('inspector-status').textContent = state.document ? state.document.writable ? '本地配置' : '只读' : '未选择';
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
  const apply = element('button', 'button primary apply-button', '保存条目修改');
  apply.type = 'submit';
  apply.disabled = !state.document.writable;
  form.append(apply);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      const fields = Object.fromEntries(Object.entries(formValues(form)).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(originalFields[key])));
      if (!Object.keys(fields).length) { toast('没有需要保存的修改。'); return; }
      const result = await bridge.edit({ key: record.key, fields });
      if (fields.name && record.key.startsWith('class:')) state.selected = `class:${fields.name}`;
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
  select.addEventListener('change', () => { state.lookupClient = select.value; state.lookup = null; lookupSequence++; renderInspector(); });
  const level = element('input');
  level.type = 'number'; level.min = '1'; level.placeholder = '等级'; level.value = state.lookupLevel;
  level.setAttribute('aria-label', 'Buff 等级');
  level.addEventListener('input', () => {
    state.lookupLevel = level.value;
    state.lookup = null;
    lookupSequence++;
    button.disabled = !record || record.key.startsWith('class:');
    button.textContent = '查询 JX3BOX';
    while (button.nextSibling) button.nextSibling.remove();
    content.append(element('p', 'muted-text', '等级已修改。点击查询读取对应等级的数据。'));
  });
  level.addEventListener('change', () => renderInspector());
  controls.append(select, level);
  const button = element('button', 'button primary lookup-button', state.lookup?.loading ? '查询中…' : '查询 JX3BOX');
  button.disabled = !record || state.lookup?.loading || record.key.startsWith('class:');
  button.addEventListener('click', () => lookup(record));
  content.append(controls, button);
  if (!record || record.key.startsWith('class:')) { content.append(element('p', 'muted-text', '选择一个 Buff 条目后查询。分类配置没有独立的 Buff 数据。')); return; }
  if (!state.lookup) {
    const empty = element('div', 'lookup-empty');
    empty.append(element('div', 'empty-symbol', '⌕'), element('p', 'muted-text', '按 ID 或条目名称查询真实数据。\n查询结果不会改写本地配置。'));
    content.append(empty);
    return;
  }
  if (state.lookup.loading) { content.append(element('p', 'muted-text', '正在读取 JX3BOX 数据…')); return; }
  if (state.lookup.error) { content.append(element('div', 'warning-box', state.lookup.error)); return; }
  const result = state.lookup.result;
  const list = Array.isArray(result?.list) ? result.list : [];
  if (!list.length) content.append(element('div', 'inspector-note', '未找到匹配记录。请检查 ID、客户端版本和等级。'));
  for (const item of list) {
    content.append(element('h4', 'remote-name', cleanMarkup(item.Name ?? item.name ?? '名称未提供')), element('p', 'remote-description', cleanMarkup(item.Desc ?? item.desc ?? item.Description ?? '描述未提供')));
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
  const key = record.key;
  state.lookup = { loading: true };
  renderInspector();
  try {
    const level = Number(state.lookupLevel);
    if (!Number.isInteger(level) || level < 1) throw new Error('等级需要为大于 0 的整数。');
    const query = referenceQuery(record);
    const result = await bridge.lookup({ ...(query.id !== undefined ? { id: query.id } : { name: query.name }), client: state.lookupClient, level });
    if (sequence === lookupSequence && state.selected === key) state.lookup = { result };
  } catch (error) { if (sequence === lookupSequence && state.selected === key) state.lookup = { error: error.message || String(error) }; }
  if (sequence === lookupSequence && state.tab === 'box') renderInspector();
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
  const content = element('div');
  content.append(element('p', 'modal-description', '选择配置类型。新建文件将在导出时选择保存位置。'));
  const choices = element('div', 'format-options');
  for (const [kind, title, description] of [['jx-buff', 'JX Buff 配置', 'Buff 条目与分类参数'], ['my-team', 'MY 团队配置', '团队监控原始字段'], ['chat', '聊天配置', '聊天关键词配置']]) {
    const label = element('label', 'format-choice');
    const input = element('input'); input.type = 'radio'; input.name = 'new-kind'; input.value = kind; input.checked = kind === 'jx-buff';
    const text = element('div'); text.append(element('strong', '', title), element('small', '', description));
    label.append(input, text); choices.append(label);
  }
  content.append(choices);
  showModal('新建配置', content, '创建配置', async () => {
    const kind = document.querySelector('input[name="new-kind"]:checked').value;
    const result = await bridge.create(kind);
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

const open = () => run(async () => receive(await bridge.open(), true));
const save = () => run(async () => { if (state.document?.writable) { const result = await bridge.save(); if (receive(result)) toast('配置已导出。'); } });
for (const id of ['open-button', 'sidebar-open', 'empty-open']) $(id).addEventListener('click', open);
$('save-button').addEventListener('click', save);
$('undo-button').addEventListener('click', () => run(async () => receive(await bridge.undo())));
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
  if (event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); if (state.canUndo) run(async () => receive(await bridge.undo())); }
});

render();
run(async () => {
  const samples = await bridge.samples();
  state.samples = Array.isArray(samples) ? samples : [];
  renderSamples();
  if (state.samples.length) receive(await bridge.openSample(state.samples[0].path), true);
});
