import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';
import { openDocument, editDocument, addRecord } from '../core/documents.mjs';
import { projectTypes, matchingMembers, searchTypes, typeLabel, rebaseMembershipDraft } from '../ui/jx-workspace.mjs';

async function sampleFile(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.name === 'BuffData.jx3dat') return filename;
    if (item.isDirectory()) {
      const found = await sampleFile(filename);
      if (found) return found;
    }
  }
}
const samplePath = await sampleFile(fileURLToPath(new URL('../../samples/', import.meta.url)));
const sampleBytes = await readFile(samplePath);
const fixture = 'return { tClass = { ["山"] = { bEnable = true, odd = "keep", }, [" "] = {}, ["空"] = {}, }, tBuff = { [42] = { nClass = "山", nPower = 10, unknown = { answer = 42 }, }, [43] = { nClass = "", }, [44] = { nClass = " ", }, [45] = { nClass = "孤", }, }, extra = { answer = 42 }, }';
const bytes = () => new Uint8Array(iconv.encode(fixture, 'gbk'));
const open = value => openDocument(value, 'BuffData.jx3dat');

test('actual JX document projects every buff exactly once and keeps every explicit type', () => {
  const doc = open(sampleBytes);
  const groups = projectTypes(doc.records);
  const members = groups.flatMap(group => group.members);
  assert.deepEqual(new Set(members.map(record => record.key)), new Set(doc.records.filter(record => record.key.startsWith('buff:')).map(record => record.key)));
  assert.equal(members.length, new Set(members.map(record => record.key)).size);
  for (const record of doc.records.filter(record => record.key.startsWith('class:'))) {
    assert.equal(groups.find(group => group.name === record.name).record, record);
  }
  assert.ok(groups.find(group => group.name === '骑行').members.some(record => record.id === 244));
});

test('empty, space, orphan and empty explicit types retain distinct identities', () => {
  const groups = projectTypes(open(bytes()).records);
  assert.equal(groups.find(group => group.name === '').members[0].id, 43);
  assert.equal(groups.find(group => group.name === ' ').members[0].id, 44);
  assert.equal(groups.find(group => group.name === '孤').record, null);
  assert.equal(groups.find(group => group.name === '孤').members[0].id, 45);
  assert.equal(groups.find(group => group.name === '空').members.length, 0);
  assert.notEqual(typeLabel(''), typeLabel(' '));
});

test('type search finds member IDs and newly enriched names, and type matches retain all members', () => {
  const groups = projectTypes(open(sampleBytes).records);
  const group = groups.find(group => group.members.some(record => record.id === 244));
  assert.ok(searchTypes(groups, '244').includes(group));
  assert.equal(searchTypes(groups, '骑乘元气').length, 0);
  const enrichedName = record => record.id === 244 ? '骑乘元气' : record.name;
  assert.deepEqual(searchTypes(groups, '骑乘元气', enrichedName).map(item => item.name), [group.name]);
  assert.deepEqual(matchingMembers(group, '骑乘元气', enrichedName).map(record => record.id), [244]);
  assert.equal(matchingMembers(group, group.name).length, group.members.length);
  assert.equal(searchTypes(groups, '绝不存在的搜索词').length, 0);
});

test('move and remove membership preserve unknown data and can restore exact bytes', () => {
  const original = bytes();
  const moved = editDocument(original, 'BuffData.jx3dat', { key: 'buff:42', fields: { nClass: ' ' } });
  assert.equal(projectTypes(open(moved).records).find(group => group.name === ' ').members.length, 2);
  const removed = editDocument(moved, 'BuffData.jx3dat', { key: 'buff:42', fields: { nClass: '' } });
  const doc = open(removed);
  const record = doc.records.find(item => item.id === 42);
  assert.equal(record.fields.nClass, '');
  assert.equal(record.fields.unknown.answer, 42);
  assert.equal(projectTypes(doc.records).find(group => group.name === '山').members.length, 0);
  const restored = editDocument(removed, 'BuffData.jx3dat', { key: 'buff:42', fields: { nClass: '山' } });
  assert.deepEqual(restored, original);
});

test('type rename updates projected membership and adding a numeric buff preserves existing bytes', () => {
  const renamed = editDocument(bytes(), 'BuffData.jx3dat', { key: 'class:山', fields: { name: '盾' } });
  const groups = projectTypes(open(renamed).records);
  assert.equal(groups.find(group => group.name === '山'), undefined);
  assert.equal(groups.find(group => group.name === '盾').members[0].id, 42);
  assert.equal(groups.find(group => group.name === '盾').record.fields.odd, 'keep');
  const addedType = addRecord(renamed, 'BuffData.jx3dat', { type: 'class', name: '新类型' });
  assert.equal(projectTypes(open(addedType).records).find(group => group.name === '新类型').members.length, 0);
  const added = addRecord(addedType, 'BuffData.jx3dat', { id: 99, nClass: '新类型' });
  const next = open(added);
  assert.equal(projectTypes(next.records).find(group => group.name === '新类型').members[0].id, 99);
  assert.equal(next.records.find(record => record.id === 42).fields.unknown.answer, 42);
  assert.ok(iconv.decode(added, 'gbk').includes('extra = { answer = 42 }'));
});

test('type rename rebases untouched draft membership while keeping other edits', () => {
  const previous = open(bytes()).records.find(record => record.id === 42);
  const renamed = editDocument(bytes(), 'BuffData.jx3dat', { key: 'class:山', fields: { name: '盾' } });
  const next = open(renamed).records.find(record => record.id === 42);
  const draft = { values: { nClass: '山', nPower: '77' }, fields: { nClass: '山', nPower: 77 } };
  const rebased = rebaseMembershipDraft(draft, previous, next);
  assert.equal(rebased.values.nClass, '盾');
  assert.equal(rebased.fields.nClass, '盾');
  assert.equal(rebased.fields.nPower, 77);
  assert.equal(draft.values.nClass, '山');
  const explicitMove = { values: { nClass: '孤' }, fields: { nClass: '孤' } };
  assert.equal(rebaseMembershipDraft(explicitMove, previous, next), explicitMove);
});

test('border previews cover exactly the bundled border images', async () => {
  const { borderNumbers, borderPreview } = await import('../ui/jx-workspace.mjs');
  const directory = fileURLToPath(new URL('../ui/borders/', import.meta.url));
  const files = (await readdir(directory)).filter(name => name.endsWith('.png')).sort();
  assert.deepEqual(files, borderNumbers.map(number => `border_${number}.png`).sort(), 'every listed border has an image and every image is listed');
  for (const file of files) assert.deepEqual([...(await readFile(path.join(directory, file))).subarray(1, 4)], [...Buffer.from('PNG')], `${file} is a PNG`);
  assert.deepEqual(borderPreview(true, 45), { kind: 'image', number: 45, src: 'borders/border_45.png' });
  assert.deepEqual(borderPreview(true, 61), { kind: 'unknown', number: 61 });
  assert.deepEqual(borderPreview(false, 45), { kind: 'off' });
  assert.deepEqual(borderPreview(undefined, 45), { kind: 'off' });
});
