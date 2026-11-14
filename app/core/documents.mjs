import iconv from 'iconv-lite';

const own = (object, key) => Object.hasOwn(object, key);
const fail = message => { throw new Error(message); };
const copy = bytes => new Uint8Array(bytes);
const MAX_BYTES = 16 * 1024 * 1024;

function decode(bytes, filename) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES) fail('文件必须是 Uint8Array，且不能超过 16 MB。');
  if (/\.jx3dat$/i.test(filename)) return { text: iconv.decode(Buffer.from(bytes), 'gbk', { stripBOM: false }), encoding: 'gbk' };
  let text;
  let encoding = 'utf-8';
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { encoding = 'gbk'; text = iconv.decode(Buffer.from(bytes), 'gbk'); }
  return { text, encoding };
}

function encode(text, encoding) {
  const bytes = iconv.encode(text, encoding);
  if (iconv.decode(bytes, encoding, { stripBOM: false }) !== text) fail(`文本包含 ${encoding.toUpperCase()} 无法无损保存的字符。`);
  return new Uint8Array(bytes);
}

function parseLua(source) {
  let at = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const error = () => fail(`不支持或不安全的 Lua 数据，位置 ${at}。只接受 return 和字面量表。`);
  const long = () => {
    const match = source.slice(at).match(/^\[(=*)\[/);
    if (!match) return null;
    const start = at + match[0].length;
    const end = source.indexOf(`]${match[1]}]`, start);
    if (end < 0) error();
    at = end + match[0].length;
    return source.slice(start, end).replace(/^\r?\n/, '');
  };
  const space = () => {
    for (;;) {
      while (/\s/.test(source[at] || '') && at < source.length) at++;
      if (source.slice(at, at + 2) !== '--') break;
      at += 2;
      if (long() === null) { const end = source.indexOf('\n', at); at = end < 0 ? source.length : end; }
    }
  };
  const take = value => { space(); if (source.slice(at, at + value.length) !== value) error(); at += value.length; };
  const word = () => { const match = source.slice(at).match(/^[A-Za-z_][A-Za-z_0-9]*/); if (!match) error(); at += match[0].length; return match[0]; };
  const value = (depth = 0) => {
    if (depth > 80) fail('Lua 数据嵌套过深。');
    space();
    const start = at;
    if (source[at] === '{') {
      at++;
      const entries = [];
      const result = Object.create(null);
      let implicit = 1;
      space();
      while (source[at] !== '}') {
        if (at >= source.length || entries.length > 100000) error();
        space();
        let key;
        let keyNode;
        if (source[at] === '[' && !/^\[(=*)\[/.test(source.slice(at))) {
          at++; keyNode = value(depth + 1); key = keyNode.value;
          if (!['number', 'string'].includes(typeof key)) error();
          take(']'); take('=');
        } else {
          const match = source.slice(at).match(/^([A-Za-z_][A-Za-z_0-9]*)\s*=/);
          if (match) { key = match[1]; keyNode = { start: at, end: at + key.length, value: key, bare: true }; at += match[0].length; }
          else key = implicit++;
        }
        const node = value(depth + 1);
        if (own(result, key)) fail(`Lua 数据含重复键 ${key}，无法安全编辑。`);
        result[key] = node.value;
        const item = { key, keyNode, node };
        entries.push(item);
        space();
        if (source[at] === ',' || source[at] === ';') { item.separator = true; at++; space(); }
        else if (source[at] !== '}') error();
      }
      at++;
      return { start, end: at, value: result, entries };
    }
    let result;
    if (source[at] === '"' || source[at] === "'") {
      const quote = source[at++]; result = '';
      while (at < source.length && source[at] !== quote) {
        const ch = source[at++];
        if (ch === '\n' || ch === '\r') error();
        if (ch !== '\\') { result += ch; continue; }
        const escape = source[at++];
        const escapes = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\x0b', '\\': '\\', '"': '"', "'": "'" };
        if (own(escapes, escape)) result += escapes[escape];
        else if (/\d/.test(escape || '')) {
          const match = source.slice(at - 1).match(/^\d{1,3}/)[0];
          if (+match > 255) error();
          if (+match >= 128) fail('Lua 字符串包含非 ASCII 十进制字节转义，暂不支持安全编辑。');
          result += String.fromCharCode(+match); at += match.length - 1;
        } else if (escape === '\n') result += '\n';
        else error();
      }
      if (source[at++] !== quote) error();
    } else if (/^\[(=*)\[/.test(source.slice(at))) result = long();
    else {
      const number = source.slice(at).match(/^-?(?:0[xX][0-9a-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/);
      if (number) { at += number[0].length; result = Number(number[0]); if (!Number.isFinite(result)) error(); }
      else { const token = word(); if (token === 'true') result = true; else if (token === 'false') result = false; else if (token === 'nil') result = null; else error(); }
    }
    return { start, end: at, value: result };
  };
  space();
  if (word() !== 'return') error();
  const root = value(); space();
  if (source[at] === ';') { at++; space(); }
  if (at !== source.length || !root.entries) error();
  return root;
}

const entry = (node, key) => node.entries?.find(item => String(item.key) === String(key));
const scalarFields = node => Object.fromEntries(node.entries.filter(item => !item.node.entries).map(item => [item.key, item.node.value]));
const linesOf = text => {
  const lines = [];
  const re = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let match;
  while ((match = re.exec(text)) && match[0]) lines.push({ raw: match[1], newline: match[2], start: match.index, end: match.index + match[1].length });
  return lines;
};
const teamPattern = /^([^,\r\n]+),\[(#[\da-fA-F]{8})\](?:,\(([^)\r\n]*)\))?(?:,#(\d+))?((?:,!{1,4})*)(?:\|\[(#[\da-fA-F]{6})\])?$/;

function inspect(bytes, filename) {
  const { text, encoding } = decode(bytes, filename);
  const base = { encoding, text, records: [], warnings: [], writable: true };
  if (bytes.includes(0) || /[\x01-\x08\x0b\x0c\x0e-\x1f]/.test(text)) {
    return { ...base, kind: 'opaque', text: '', writable: false, warnings: ['这是二进制或未知格式。可保留原文件，暂不支持编辑。'] };
  }
  if (!iconv.encode(text, encoding).equals(Buffer.from(bytes))) return { ...base, kind: 'opaque', text: '', writable: false, warnings: ['未知编码，无法无损编辑。'] };
  if (/^\s*\uFEFF?\s*return\b/.test(text) || /\.jx3dat$/i.test(filename)) {
    if (!/^\s*\uFEFF?\s*return\b/.test(text)) return { ...base, kind: 'opaque', text: '', writable: false, warnings: ['无法识别此 JX3DAT 格式，暂不支持编辑。'] };
    const root = parseLua(text);
    const classes = entry(root, 'tClass')?.node;
    const buffs = entry(root, 'tBuff')?.node;
    if (!classes?.entries || !buffs?.entries) fail('未知 Lua 表结构。需要 tClass 和 tBuff 数据表。');
    const records = [];
    for (const item of classes.entries) {
      if (typeof item.key !== 'string' || !item.node.entries) fail('无效的 tClass 分类结构。');
      records.push({ key: `class:${item.key}`, name: item.key, category: '分类', fields: scalarFields(item.node) });
    }
    for (const item of buffs.entries) {
      if (!Number.isSafeInteger(item.key) || item.key < 0 || !item.node.entries) fail('无效的 tBuff 条目结构。');
      const fields = item.node.value;
      if (typeof fields.nClass !== 'string' || (own(fields, 'nPower') && typeof fields.nPower !== 'number')) fail('无效的 BUFF 分类或优先级。');
      records.push({ key: `buff:${item.key}`, id: item.key, name: `#${item.key}`, category: fields.nClass, fields });
    }
    return { ...base, kind: 'jx-buff', records, categories: classes.entries.map(item => item.key), root, classes, buffs };
  }
  const lines = linesOf(text);
  const isTeam = lines.some(line => teamPattern.test(line.raw));
  if (isTeam || /团队|气劲|my-team/i.test(filename)) {
    let category = '';
    const records = [];
    let unknown = 0;
    for (const [index, line] of lines.entries()) {
      if (/^-{3,}/.test(line.raw)) { category = line.raw.replace(/^-+|-+$/g, ''); continue; }
      if (!line.raw.trim()) continue;
      const match = line.raw.match(teamPattern);
      if (!match) { unknown++; continue; }
      const [, reference, color, label, priority, flags, color2] = match;
      records.push({ key: `line:${index}`, name: reference, category, fields: { reference, color, label: label ?? '', ...(priority === undefined ? {} : { priority: +priority }), flags: flags.replace(/^,/, ''), color2: color2 ?? '', raw: line.raw } });
    }
    return { ...base, kind: 'my-team', records, lines, warnings: unknown ? [`保留了 ${unknown} 行无法识别的内容。`] : [] };
  }
  return { ...base, kind: 'chat', lines, records: lines.flatMap((line, index) => line.raw.trim() ? [{ key: `line:${index}`, name: line.raw, fields: { keyword: line.raw } }] : []) };
}

export const classStyleFields = [
  { key: 'bEnable', type: 'boolean', initial: true },
  { key: 'bBorderEnable', type: 'boolean', initial: true },
  { key: 'nBorder', type: 'number', initial: 1 },
  { key: 'bFontEnable', type: 'boolean', initial: true },
  { key: 'nFont', type: 'number', initial: 159 },
];

function classStyleValue(key, value) {
  const field = classStyleFields.find(item => item.key === key);
  if (!field) return undefined;
  if (typeof value !== field.type || field.type === 'number' && (!Number.isSafeInteger(value) || value < 0)) fail(`类型设置 ${key} 的值无效。`);
  return value;
}

export function openDocument(bytes, filename = '') {
  const { root, classes, buffs, lines, ...document } = inspect(bytes, filename);
  return document;
}

function literal(value) {
  if (typeof value === 'string') return `"${value.replace(/[\\"\x00-\x1f\x7f]/g, ch => ch === '\\' ? '\\\\' : ch === '"' ? '\\"' : `\\${ch.charCodeAt(0).toString().padStart(3, '0')}`)}"`;
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return String(value);
  if (value === null) return 'nil';
  fail('只允许编辑字符串、有限数值和布尔值。');
}

function levelEntries(value) {
  if (!value || typeof value !== 'object' || Object.entries(value).some(([key, enabled]) => !/^(?:0|[1-9]\d*)$/.test(key) || !Number.isSafeInteger(+key) || typeof enabled !== 'boolean')) fail('等级表应为等级编号到布尔值的映射。');
  return Object.entries(value);
}

const levelLiteral = value => `{ ${levelEntries(value).map(([key, enabled]) => `[${key}] = ${literal(enabled)}`).join(', ')} }`;

function patchesResult(document, patches, bytes) {
  if (!patches.length) return copy(bytes);
  let text = document.text;
  for (const patch of patches.sort((a, b) => b.start - a.start)) text = text.slice(0, patch.start) + patch.text + text.slice(patch.end);
  const result = encode(text, document.encoding);
  inspect(result, document.kind === 'jx-buff' ? 'BuffData.jx3dat' : document.kind);
  return result;
}

function teamLine(fields, original = '') {
  const reference = fields.reference ?? fields.name ?? '';
  const { color = '#FFFFFFFF', label = '', priority, flags = '', color2 = '' } = fields;
  if (typeof reference !== 'string' || !reference || /[,\r\n]/.test(reference)) fail('气劲名称或引用不能为空，也不能包含逗号或换行。');
  if (!/^#[\da-fA-F]{8}$/.test(color) || (color2 && !/^#[\da-fA-F]{6}$/.test(color2))) fail('颜色格式应为 #RRGGBBAA，附加颜色为 #RRGGBB。');
  if (typeof label !== 'string' || /[(),\r\n]/.test(label)) fail('标签不能包含括号、逗号或换行。');
  if (priority !== undefined && (!Number.isSafeInteger(priority) || priority < 0)) fail('优先级应为非负整数。');
  if (typeof flags !== 'string' || (flags && !/^!{1,4}(?:,!{1,4})*$/.test(flags))) fail('标记格式应为 !!,!!!,!!!!。');
  const hasLabel = label || original.includes(',(');
  return `${reference},[${color}]${hasLabel ? `,(${label})` : ''}${priority === undefined ? '' : `,#${priority}`}${flags ? `,${flags}` : ''}${color2 ? `|[${color2}]` : ''}`;
}

export function editDocument(bytes, filename, change) {
  const document = inspect(bytes, filename);
  if (!document.writable) fail('此格式只读。');
  if (!change || typeof change.key !== 'string' || !change.fields || typeof change.fields !== 'object' || Array.isArray(change.fields)) fail('无效的编辑请求。');
  const record = document.records.find(item => item.key === change.key);
  if (!record) fail('找不到要编辑的条目。');
  const fields = change.fields;
  const patches = [];
  if (document.kind === 'jx-buff') {
    const isClass = change.key.startsWith('class:');
    const sourceEntry = entry(isClass ? document.classes : document.buffs, isClass ? record.name : record.id);
    const missing = [];
    for (const [key, value] of Object.entries(fields)) {
      if (isClass && key === 'name') {
        if (typeof value !== 'string' || !value || document.categories.includes(value) && value !== record.name) fail('分类名不能为空或重复。');
        if (value === record.name) continue;
        patches.push({ ...sourceEntry.keyNode, text: sourceEntry.keyNode.bare ? `[${literal(value)}]` : literal(value) });
        for (const buff of document.buffs.entries) {
          const node = entry(buff.node, 'nClass')?.node;
          if (node?.value === record.name) patches.push({ ...node, text: literal(value) });
        }
        continue;
      }
      const actualKey = key === 'category' ? 'nClass' : key;
      const node = entry(sourceEntry.node, actualKey)?.node;
      if (isClass && !node && classStyleValue(actualKey, value) !== undefined) { missing.push([actualKey, value]); continue; }
      if (!isClass && actualKey === 'tLevel') {
        const levels = levelEntries(value);
        if (!node?.entries) fail('条目不存在可编辑的等级表。');
        levelEntries(node.value);
        if (levels.length === node.entries.length && levels.every(([level]) => own(node.value, level))) {
          for (const [level, enabled] of levels) {
            const leaf = entry(node, level).node;
            if (enabled !== leaf.value) patches.push({ ...leaf, text: literal(enabled) });
          }
        } else patches.push({ ...node, text: levelLiteral(value) });
        continue;
      }
      if (!node || node.entries) fail(`字段 ${actualKey} 不存在或不是可编辑的标量。`);
      if (typeof value !== typeof node.value || value === null) fail(`字段 ${actualKey} 的类型不正确。`);
      if (actualKey === 'nPower' && (!Number.isFinite(value) || value < 0)) fail('优先级应为非负数值。');
      if (isClass) classStyleValue(actualKey, value);
      if (value !== node.value) patches.push({ ...node, text: literal(value) });
    }
    if (missing.length) {
      const table = sourceEntry.node;
      const final = table.entries.at(-1);
      if (final && !final.separator) patches.push({ start: final.node.end, end: final.node.end, text: ',' });
      patches.push({ start: table.end - 1, end: table.end - 1, text: missing.map(([key, value]) => `\t${key} = ${literal(value)},\n\t\t`).join('') });
    }
  } else {
    const index = Number(change.key.slice(5));
    const line = document.lines[index];
    let text;
    if (document.kind === 'chat') {
      if (Object.keys(fields).some(key => !['keyword', 'name'].includes(key))) fail('未知关键词字段。');
      text = fields.keyword ?? fields.name ?? record.name;
      if (typeof text !== 'string' || /[\r\n\x00]/.test(text)) fail('关键词必须是单行文本。');
    } else {
      const allowed = ['reference', 'name', 'color', 'label', 'priority', 'flags', 'color2', 'raw'];
      if (Object.keys(fields).some(key => !allowed.includes(key))) fail('未知气劲字段。');
      const merged = { ...record.fields, ...fields };
      if (own(fields, 'name') && !own(fields, 'reference')) merged.reference = fields.name;
      text = teamLine(merged, line.raw);
      if (Object.entries(fields).every(([key, value]) => key === 'name' ? value === record.name : value === record.fields[key])) text = line.raw;
    }
    if (text !== line.raw) patches.push({ start: line.start, end: line.end, text });
  }
  return patchesResult(document, patches, bytes);
}

export function createDocument(kind) {
  if (kind === 'jx-buff') return encode('return {\r\n\ttClass = {},\r\n\ttBuff = {},\r\n}\r\n', 'gbk');
  if (kind === 'my-team') return encode('----------------团队气劲----------------\r\n', 'utf-8');
  if (kind === 'chat') return encode('', 'utf-8');
  fail('不支持的新建格式。');
}

export function addRecord(bytes, filename, fields) {
  const document = inspect(bytes, filename);
  if (!document.writable || !fields || typeof fields !== 'object') fail('无法添加条目。');
  if (document.kind === 'jx-buff') {
    if (fields.type === 'class') {
      const name = fields.name;
      if (typeof name !== 'string' || !name || document.categories.includes(name)) fail('分类名不能为空或重复。');
      const value = `{ ${classStyleFields.map(({ key, initial }) => `${key} = ${literal(own(fields, key) ? classStyleValue(key, fields[key]) : initial)}`).join(', ')}, }`;
      return insertLua(document, document.classes, `[${literal(name)}] = ${value}`, bytes);
    }
    const { id, nClass = fields.category ?? '', nPower = 10, tLevel = { 0: true } } = fields;
    if (!Number.isSafeInteger(id) || id < 0 || entry(document.buffs, id)) fail('BUFF ID 应为不重复的非负整数。');
    if (typeof nClass !== 'string' || !Number.isFinite(nPower) || nPower < 0) fail('无效的分类或优先级。');
    return insertLua(document, document.buffs, `[${id}] = { nClass = ${literal(nClass)}, tLevel = ${levelLiteral(tLevel)}, nPower = ${nPower}, }`, bytes);
  }
  const newline = document.lines.find(line => line.newline)?.newline || '\r\n';
  let line;
  if (document.kind === 'my-team') line = teamLine({ ...fields, priority: fields.priority ?? 9 });
  else { line = fields.keyword ?? fields.name; if (typeof line !== 'string' || !line.trim() || /[\r\n\x00]/.test(line)) fail('关键词必须是非空单行文本。'); }
  const prefix = document.text && !/[\r\n]$/.test(document.text) ? newline : '';
  return encode(document.text + prefix + line + newline, document.encoding);
}

function insertLua(document, table, text, bytes) {
  const finalEntry = table.entries.at(-1);
  const last = finalEntry?.node.end ?? table.start + 1;
  const separator = finalEntry && !finalEntry.separator ? ',' : '';
  return patchesResult(document, [{ start: last, end: last, text: separator }, { start: table.end - 1, end: table.end - 1, text: `\n\t\t${text},\n\t` }], bytes);
}
