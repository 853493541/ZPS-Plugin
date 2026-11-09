import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import iconv from 'iconv-lite';
import { openDocument, editDocument, createDocument, addRecord } from '../core/documents.mjs';

const root = fileURLToPath(new URL('../../samples/', import.meta.url));
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(item => item.isDirectory() ? files(path.join(directory, item.name)) : path.join(directory, item.name)))).flat();
}
const samples = await files(root);
const sample = name => readFile(samples.find(filename => path.basename(filename) === name));
const utf8 = value => new Uint8Array(Buffer.from(value));
const gbk = value => new Uint8Array(iconv.encode(value, 'gbk'));
const simpleLua = 'return { tClass = { ["山"] = { bEnable = true, odd = "unchanged", }, }, tBuff = { [42] = { nClass = "山", nPower = 10, tLevel = { true, [0] = true, [7] = false, }, unknown = { ["__proto__"] = { polluted = true }, }, }, }, extra = { answer = 42 }, }';

test('the actual GBK JX sample opens and no-op edits preserve every byte', async () => {
  const bytes = await sample('BuffData.jx3dat');
  const document = openDocument(bytes, 'BuffData.jx3dat');
  assert.equal(document.kind, 'jx-buff');
  assert.equal(document.encoding, 'gbk');
  assert.ok(document.categories.includes('沉默'));
  const buff = document.records.find(item => item.id === 244);
  assert.equal(buff.category, '骑行');
  assert.equal(buff.fields.tLevel[0], true);
  assert.equal(buff.fields.tLevel[70], true);
  assert.deepEqual(editDocument(bytes, 'BuffData.jx3dat', { key: buff.key, fields: {} }), new Uint8Array(bytes));
  assert.deepEqual(editDocument(bytes, 'BuffData.jx3dat', { key: buff.key, fields: { nPower: buff.fields.nPower, nClass: buff.fields.nClass } }), new Uint8Array(bytes));
});

test('editing the actual JX sample changes only the requested literal', async () => {
  const bytes = await sample('BuffData.jx3dat');
  const changed = editDocument(bytes, 'BuffData.jx3dat', { key: 'buff:244', fields: { nPower: 77 } });
  const doc = openDocument(changed, 'BuffData.jx3dat');
  assert.equal(doc.records.find(item => item.id === 244).fields.nPower, 77);
  const restored = editDocument(changed, 'BuffData.jx3dat', { key: 'buff:244', fields: { nPower: 10 } });
  assert.deepEqual(restored, new Uint8Array(bytes));
});

test('unknown fields, table keys, comments and explicit and implicit levels survive scalar edits', () => {
  const text = simpleLua.replace('nPower = 10', 'nPower = -- keep this comment\n10');
  const bytes = gbk(text);
  const changed = editDocument(bytes, 'BuffData.jx3dat', { key: 'buff:42', fields: { nPower: 3 } });
  assert.equal(iconv.decode(changed, 'gbk'), text.replace('\n10', '\n3'));
  const fields = openDocument(changed, 'BuffData.jx3dat').records.find(item => item.id === 42).fields;
  assert.equal(fields.tLevel[0], true);
  assert.equal(fields.tLevel[1], true);
  assert.equal(fields.tLevel[7], false);
  assert.equal(fields.unknown.__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
});

test('class rename updates references and class boolean edits preserve unknown data', () => {
  let bytes = gbk(simpleLua);
  bytes = editDocument(bytes, 'x.jx3dat', { key: 'class:山', fields: { name: '盾', bEnable: false } });
  const doc = openDocument(bytes, 'x.jx3dat');
  assert.deepEqual(doc.categories, ['盾']);
  assert.equal(doc.records.find(item => item.id === 42).category, '盾');
  assert.equal(doc.records.find(item => item.key === 'class:盾').fields.bEnable, false);
  assert.equal(doc.records.find(item => item.key === 'class:盾').fields.odd, 'unchanged');
});

test('unrepresentable GBK characters and invalid scalar types are rejected', () => {
  const bytes = gbk(simpleLua);
  assert.throws(() => editDocument(bytes, 'x.jx3dat', { key: 'buff:42', fields: { nClass: '😀' } }), /GBK/);
  assert.throws(() => editDocument(bytes, 'x.jx3dat', { key: 'buff:42', fields: { nPower: '10' } }));
  assert.throws(() => editDocument(bytes, 'x.jx3dat', { key: 'buff:42', fields: { tLevel: { 0: 'false' } } }));
});

test('level editing preserves zero keys and unchanged implicit source entries', () => {
  const bytes = gbk(simpleLua);
  assert.deepEqual(editDocument(bytes, 'x.jx3dat', { key: 'buff:42', fields: { tLevel: { 0: true, 1: true, 7: false } } }), bytes);
  const oneChange = editDocument(bytes, 'x.jx3dat', { key: 'buff:42', fields: { tLevel: { 0: false, 1: true, 7: false } } });
  assert.equal(iconv.decode(oneChange, 'gbk'), simpleLua.replace('[0] = true', '[0] = false'));
  const added = editDocument(oneChange, 'x.jx3dat', { key: 'buff:42', fields: { tLevel: { 0: false, 1: true, 7: false, 10: true } } });
  assert.equal(openDocument(added, 'x.jx3dat').records.find(item => item.id === 42).fields.tLevel[10], true);
  assert.equal(openDocument(added, 'x.jx3dat').records.find(item => item.id === 42).fields.tLevel[0], false);
  assert.ok(iconv.decode(added, 'gbk').includes('unknown = { ["__proto__"] = { polluted = true }, }'));
});

test('executable Lua and unknown Lua structures are never evaluated', () => {
  for (const text of [
    'return os.execute("touch /tmp/never-execute")',
    'return { tClass = {}, tBuff = load("return {}")() }',
    'return { tClass = {}, tBuff = {} }; print("no")',
    'return { tClass = {}, tBuff = {}, x = function() end }',
    'return { arbitrary = {} }',
    'return { tClass = {}, tClass = {}, tBuff = {} }',
  ]) assert.throws(() => openDocument(utf8(text), 'untrusted.jx3dat'));
});

test('non-ASCII decimal byte escapes are rejected instead of misreading GBK references', () => {
  const bytes = gbk('return { tClass = { ["你"] = {} }, tBuff = { [42] = { nClass = "\\196\\227", nPower = 10 } } }');
  assert.throws(() => openDocument(bytes, 'x.jx3dat'), /非 ASCII 十进制字节转义/);
  assert.throws(() => editDocument(bytes, 'x.jx3dat', { key: 'class:你', fields: { name: '新' } }), /非 ASCII 十进制字节转义/);
  const asciiEscapes = gbk('return { tClass = { ["A"] = {} }, tBuff = { [42] = { nClass = "\\065", nPower = 10 } } }');
  const renamed = editDocument(asciiEscapes, 'x.jx3dat', { key: 'class:A', fields: { name: 'B' } });
  assert.equal(openDocument(renamed, 'x.jx3dat').records.find(record => record.id === 42).category, 'B');
});

test('actual MY sample keeps every header and line ending on no-op and edits', async () => {
  const bytes = await sample('真传（仅）团队气劲.txt');
  const doc = openDocument(bytes, '团队气劲.txt');
  assert.equal(doc.kind, 'my-team');
  const first = doc.records[0];
  assert.equal(first.name, '弹跳|mine');
  assert.equal(first.fields.color, '#FFFF1FFF');
  assert.equal(first.fields.priority, 9);
  assert.equal(first.fields.flags, '!!!!');
  const noPriority = doc.records.find(item => item.name === '绝脉');
  assert.ok(noPriority);
  assert.equal(Object.hasOwn(noPriority.fields, 'priority'), false);
  const changedLabel = editDocument(bytes, '团队气劲.txt', { key: noPriority.key, fields: { label: '脉' } });
  assert.equal(Buffer.from(changedLabel).toString(), Buffer.from(bytes).toString().replace('绝脉,[#FF1F1FFF],(绝)', '绝脉,[#FF1F1FFF],(脉)'));
  assert.deepEqual(editDocument(bytes, '团队气劲.txt', { key: first.key, fields: first.fields }), new Uint8Array(bytes));
  const changed = editDocument(bytes, '团队气劲.txt', { key: first.key, fields: { reference: '新名称|lv1', color: '#123456FF', priority: 2, label: '新', flags: '!!,!!!!' } });
  const text = new TextDecoder().decode(changed);
  assert.equal(text, new TextDecoder().decode(bytes).replace('弹跳|mine,[#FFFF1FFF],#9,!!!!|[#FFFF1F]', '新名称|lv1,[#123456FF],(新),#2,!!,!!!!|[#FFFF1F]'));
  const edited = openDocument(changed, '团队气劲.txt').records[0];
  assert.equal(edited.fields.label, '新');
  assert.equal(edited.fields.reference, '新名称|lv1');
});

test('unknown MY lines remain intact and invalid delimiters are rejected', () => {
  const bytes = utf8('-----分类-----\r\nMystery line!\r\n测试,[#FFFFFFFF],(测),#9,!!\r\n');
  const doc = openDocument(bytes, 'my-team.txt');
  assert.equal(doc.warnings.length, 1);
  const changed = editDocument(bytes, 'my-team.txt', { key: doc.records[0].key, fields: { priority: 0 } });
  assert.equal(Buffer.from(changed).toString(), '-----分类-----\r\nMystery line!\r\n测试,[#FFFFFFFF],(测),#0,!!\r\n');
  assert.throws(() => editDocument(bytes, 'my-team.txt', { key: doc.records[0].key, fields: { reference: 'bad,name' } }));
});

test('actual chat sample preserves blank lines and keyword order', async () => {
  const bytes = await sample('推荐设置关键词.txt');
  const doc = openDocument(bytes, '推荐设置关键词.txt');
  assert.equal(doc.kind, 'chat');
  assert.equal(doc.records[0].name, '绝境·女娲补天');
  assert.equal(doc.records.length, 4);
  assert.deepEqual(editDocument(bytes, 'chat.txt', { key: doc.records[0].key, fields: { keyword: doc.records[0].name } }), new Uint8Array(bytes));
  const changed = editDocument(bytes, 'chat.txt', { key: doc.records[1].key, fields: { keyword: '新关键词' } });
  assert.equal(Buffer.from(changed).toString(), Buffer.from(bytes).toString().replace('伪传·孤影化双', '新关键词'));
  assert.equal(openDocument(changed, 'chat.txt').records[2].name, '绝境·啸如虎');
});

test('binary target-monitor imports are explicit read-only opaque documents', async () => {
  for (const name of ['其他辅助.jx3dat', '技能监控.jx3dat', '自用完整版.jx3dat']) {
    const bytes = await sample(name);
    const doc = openDocument(bytes, name);
    assert.equal(doc.kind, 'opaque');
    assert.equal(doc.writable, false);
    assert.ok(doc.warnings.length);
    assert.throws(() => addRecord(bytes, name, { id: 1 }));
  }
});

test('new documents accept records and additions preserve the existing prefix', () => {
  let bytes = createDocument('jx-buff');
  bytes = addRecord(bytes, 'BuffData.jx3dat', { type: 'class', name: '山' });
  bytes = addRecord(bytes, 'BuffData.jx3dat', { id: 42, nClass: '山', nPower: 5, tLevel: { 0: true, 1: false } });
  const doc = openDocument(bytes, 'BuffData.jx3dat');
  assert.equal(doc.records.find(item => item.id === 42).fields.nPower, 5);
  assert.equal(doc.records.find(item => item.id === 42).fields.tLevel[1], false);
  assert.throws(() => addRecord(bytes, 'BuffData.jx3dat', { id: 42 }));
  let team = createDocument('my-team');
  const prefix = Buffer.from(team).toString();
  team = addRecord(team, 'my-team.txt', { reference: '测试|mine', label: '测', flags: '!!' });
  assert.ok(Buffer.from(team).toString().startsWith(prefix));
  assert.equal(openDocument(team, 'my-team.txt').records[0].fields.reference, '测试|mine');
  const chat = addRecord(createDocument('chat'), 'chat.txt', { keyword: '关键词' });
  assert.equal(openDocument(chat, 'chat.txt').records[0].name, '关键词');
});

test('adding beside comments retains Lua separators and bare category keys can be renamed', () => {
  const bytes = gbk('return { tClass = { Default = { bEnable = true } -- comment\n, }, tBuff = { [1] = { nClass = "Default", nPower = 1 } -- comment\n; } }');
  const renamed = editDocument(bytes, 'x.jx3dat', { key: 'class:Default', fields: { name: '山' } });
  assert.equal(openDocument(renamed, 'x.jx3dat').categories[0], '山');
  const added = addRecord(renamed, 'x.jx3dat', { id: 2, nClass: '山' });
  assert.equal(openDocument(added, 'x.jx3dat').records.filter(record => record.id).length, 2);
  assert.equal(iconv.decode(added, 'gbk').split('-- comment').length, 3);
});

test('UTF-8 BOM, mixed newlines and missing final newline survive unrelated chat edits', () => {
  const bytes = utf8('\uFEFFfirst\r\n\r\nsecond\nthird');
  const changed = editDocument(bytes, 'chat.txt', { key: 'line:2', fields: { keyword: 'changed' } });
  assert.equal(Buffer.from(changed).toString(), '\uFEFFfirst\r\n\r\nchanged\nthird');
});
