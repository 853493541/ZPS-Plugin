import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as codec from '../core/documents.mjs';
import * as registry from '../ui/features.mjs';
import { createFeatureSessions } from '../core/feature-sessions.mjs';

const samplesRoot = new URL('../../samples/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('SAMPLES.json', samplesRoot), 'utf8'));
const files = Object.keys(manifest.files).filter(file => /\.jx3dat$/i.test(file) || /团队气劲\/[^/]+\.txt$/.test(file) || /推荐设置关键词\.txt$/.test(file));
const load = async file => ({ bytes: await fs.readFile(new URL(file, samplesRoot)), filename: path.basename(file) });
const first = id => load(files.find(file => registry.featureForSample(file) === id));
const store = () => createFeatureSessions({ codec, ...registry });
const power = snapshot => snapshot.document.records.find(record => record.id === 244).fields.nPower;

test('feature activation loads once and retains independent applied bytes, undo and dirty state', async () => {
  const sessions = store();
  assert.equal(sessions.snapshot(), null);
  let loads = 0;
  const loader = id => { loads++; return first(id); };
  const original = await sessions.activate('jx-buff', loader);
  assert.equal(original.featureId, 'jx-buff');
  assert.equal(power(original), 10);
  sessions.mutate('editDocument', { key: 'buff:244', fields: { nPower: 11 } });
  await sessions.activate('my-team', loader);
  sessions.mutate('addRecord', { reference: '测试', priority: 7 });
  const team = sessions.snapshot();
  const restored = await sessions.activate('jx-buff', loader);
  assert.equal(loads, 2);
  assert.equal(power(restored), 11);
  assert.equal(restored.dirty, true);
  assert.equal(restored.canUndo, true);
  const undone = sessions.undo();
  assert.equal(power(undone), 10);
  assert.equal(undone.dirty, false);
  assert.equal(undone.canUndo, false);
  assert.deepEqual(await sessions.activate('my-team', loader), team);
  assert.equal(loads, 2);
});

test('all six samples route from parsed kind, including three readonly target presets', async () => {
  const sessions = store();
  let targets = 0;
  for (const file of files) {
    const sample = await load(file);
    const snapshot = await sessions.replace(sample.bytes, sample.filename);
    assert.equal(snapshot.featureId, registry.featureForSample(file));
    assert.equal(snapshot.dirty, false);
    assert.equal(snapshot.canUndo, false);
    assert.deepEqual(sessions.active.savedBytes, sample.bytes);
    if (snapshot.featureId === 'my-target') {
      targets++;
      assert.equal(snapshot.document.writable, false);
      assert.throws(() => sessions.mutate('addRecord', { keyword: 'unsafe' }));
      assert.deepEqual(sessions.snapshot(), snapshot);
    }
  }
  assert.equal(files.length, 6);
  assert.equal(targets, 3);
});

test('replacement confirms only the dirty parsed destination and cancellation leaves the active session unchanged', async () => {
  const sessions = store();
  await sessions.activate('jx-buff', first);
  sessions.mutate('editDocument', { key: 'buff:244', fields: { nPower: 11 } });
  await sessions.activate('chat', first);
  sessions.mutate('addRecord', { keyword: '保留当前' });
  const activeBefore = sessions.snapshot();
  const activeBytes = Buffer.from(sessions.active.bytes);
  const jx = await first('jx-buff');
  const confirmed = [];
  const canceled = await sessions.replace(jx.bytes, 'looks-like-chat.txt', {
    confirmDiscard: destination => { confirmed.push(destination.featureId); return false; }
  });
  assert.equal(canceled, null);
  assert.deepEqual(confirmed, ['jx-buff']);
  assert.deepEqual(sessions.snapshot(), activeBefore);
  assert.deepEqual(sessions.active.bytes, activeBytes);
  assert.equal(power(await sessions.activate('jx-buff', first)), 11);
  assert.equal(sessions.undo().dirty, false);
  assert.deepEqual(await sessions.activate('chat', first), activeBefore);
});

test('clean destination replacements never prompt for an unrelated dirty session', async () => {
  const sessions = store();
  await sessions.activate('chat', first);
  sessions.mutate('addRecord', { keyword: '保留' });
  const chat = sessions.snapshot();
  const team = await first('my-team');
  const snapshot = await sessions.replace(team.bytes, 'unrelated-name.txt', { confirmDiscard: () => { assert.fail('Unrelated session must not prompt'); } });
  assert.equal(snapshot.featureId, 'my-team');
  assert.equal(snapshot.dirty, false);
  assert.deepEqual(await sessions.activate('chat', first), chat);
});

test('created documents route by parsed kind and remain dirty when undo returns to their unexported bytes', async () => {
  const sessions = store();
  await sessions.activate('jx-buff', first);
  const snapshot = await sessions.replace(codec.createDocument('chat'), 'chat.txt', { dirty: true });
  assert.equal(snapshot.featureId, 'chat');
  assert.equal(snapshot.dirty, true);
  sessions.mutate('addRecord', { keyword: '新关键词' });
  assert.equal(sessions.undo().dirty, true);
  assert.equal(sessions.snapshot().document.records.length, 0);
  assert.equal(sessions.dirtySessions().length, 1);
});

test('dirty state compares original and exported bytes across no-op edits, reversions and undo', async () => {
  const sessions = store();
  await sessions.activate('jx-buff', first);
  const original = Buffer.from(sessions.active.bytes);
  sessions.mutate('editDocument', { key: 'buff:244', fields: { nPower: 10 } });
  assert.equal(sessions.snapshot().dirty, false);
  assert.equal(sessions.snapshot().canUndo, false);
  sessions.mutate('editDocument', { key: 'buff:244', fields: { nPower: 11 } });
  sessions.mutate('editDocument', { key: 'buff:244', fields: { nPower: 10 } });
  assert.equal(sessions.snapshot().dirty, false);
  assert.deepEqual(sessions.active.bytes, original);
  sessions.undo();
  sessions.markSaved();
  sessions.mutate('editDocument', { key: 'buff:244', fields: { nPower: 12 } });
  assert.equal(sessions.snapshot().dirty, true);
  assert.equal(sessions.undo().dirty, false);
  assert.equal(power(sessions.snapshot()), 11);
  assert.equal(sessions.undo().dirty, true);
  assert.equal(power(sessions.snapshot()), 10);
});

test('all dirty sessions remain visible to lifecycle guards and saving an inactive one preserves active selection', async () => {
  const sessions = store();
  await sessions.activate('jx-buff', first);
  sessions.mutate('editDocument', { key: 'buff:244', fields: { nPower: 11 } });
  const jx = sessions.active;
  await sessions.activate('my-team', first);
  sessions.mutate('addRecord', { reference: '保留团队' });
  await sessions.activate('chat', first);
  const chat = sessions.snapshot();
  assert.deepEqual(sessions.dirtySessions().map(session => session.featureId), ['jx-buff', 'my-team']);
  assert.deepEqual(sessions.markSaved(jx), chat);
  assert.deepEqual(sessions.dirtySessions().map(session => session.featureId), ['my-team']);
  assert.equal(power(await sessions.activate('jx-buff', first)), 11);
  assert.equal(sessions.snapshot().dirty, false);
  assert.equal(sessions.snapshot().canUndo, true);
});

test('unknown features, failed sample loads and invalid replacements preserve all current state', async () => {
  const sessions = store();
  await sessions.activate('chat', first);
  const before = sessions.snapshot();
  await assert.rejects(sessions.activate('unknown', () => assert.fail('Unknown feature must not load')));
  await assert.rejects(sessions.activate('my-team', async () => { throw Error('Unreadable'); }));
  assert.equal(await sessions.activate('my-team', async () => null), null);
  await assert.rejects(sessions.activate('my-team', () => first('chat')));
  await assert.rejects(sessions.replace(Buffer.from('return os.execute("unsafe")'), 'bad.jx3dat', { confirmDiscard: () => assert.fail('Invalid data must not prompt') }));
  assert.deepEqual(sessions.snapshot(), before);
  assert.deepEqual(sessions.dirtySessions(), []);
});

test('unapplied drafts guard inactive destinations without changing applied bytes or byte dirty state', async () => {
  const sessions = store();
  await sessions.activate('jx-buff', first);
  const bytes = Buffer.from(sessions.active.bytes);
  sessions.setDraftState({ featureId: 'jx-buff', dirty: true });
  assert.equal(sessions.snapshot().dirty, false);
  assert.equal(sessions.snapshot().hasDrafts, true);
  assert.deepEqual(sessions.active.bytes, bytes);
  await sessions.activate('chat', first);
  const chat = sessions.snapshot();
  assert.deepEqual(sessions.dirtySessions().map(session => session.featureId), ['jx-buff']);
  const jx = await first('jx-buff');
  const canceled = await sessions.replace(jx.bytes, jx.filename, { confirmDiscard: session => {
    assert.equal(session.featureId, 'jx-buff');
    assert.equal(session.draftDirty, true);
    return false;
  } });
  assert.equal(canceled, null);
  assert.deepEqual(sessions.snapshot(), chat);
  assert.deepEqual(sessions.setDraftState({ featureId: 'jx-buff', dirty: false }), chat);
  assert.equal(sessions.dirtySessions().length, 0);
  await sessions.activate('jx-buff', first);
  assert.deepEqual(sessions.active.bytes, bytes);
  assert.equal(sessions.snapshot().hasDrafts, false);
});

test('exporting or undoing applied bytes never marks unapplied drafts as exported', async () => {
  const sessions = store();
  await sessions.activate('jx-buff', first);
  sessions.mutate('editDocument', { key: 'buff:244', fields: { nPower: 11 } });
  sessions.setDraftState({ featureId: 'jx-buff', dirty: true });
  const saved = sessions.markSaved();
  assert.equal(saved.dirty, false);
  assert.equal(saved.hasDrafts, true);
  assert.equal(power(saved), 11);
  assert.equal(sessions.dirtySessions().length, 1);
  const undone = sessions.undo();
  assert.equal(undone.hasDrafts, true);
  assert.equal(undone.dirty, true);
  assert.equal(power(undone), 10);
  sessions.setDraftState({ featureId: 'jx-buff', dirty: false });
  assert.equal(sessions.dirtySessions().length, 1);
});

test('invalid or unloaded draft notifications cannot change any session', async () => {
  const sessions = store();
  await sessions.activate('chat', first);
  const before = sessions.snapshot();
  for (const value of [null, [], { featureId: 'chat', dirty: 'true' }, { featureId: 'unknown', dirty: true }, { featureId: 'jx-buff', dirty: true }]) {
    assert.throws(() => sessions.setDraftState(value));
    assert.deepEqual(sessions.snapshot(), before);
  }
  assert.equal(sessions.dirtySessions().length, 0);
});

test('same-feature datasets retain independent bytes, undo, drafts, identities and source revisions', async () => {
  const sessions = store();
  const sample = await first('jx-buff');
  const origin = name => ({ kind: 'file', key: `/imports/${name}/BuffData.jx3dat`, displayPath: `/imports/${name}/BuffData.jx3dat`, modifiedAt: '2026-11-10T00:00:00.000Z' });
  const one = sessions.open(sample.bytes, sample.filename, { source: origin('one'), gameVersion: '丝路风雨' });
  sessions.mutate('editDocument', { key: 'buff:244', fields: { nPower: 11 } }, one.datasetId);
  sessions.setDraftState({ datasetId: one.datasetId, featureId: 'jx-buff', dirty: true });
  const two = sessions.open(sample.bytes, sample.filename, { source: origin('two') });
  assert.notEqual(two.datasetId, one.datasetId);
  assert.equal(two.datasets.length, 2);
  assert.equal(power(two), 10);
  assert.equal(two.hasDrafts, false);
  assert.equal(two.canUndo, false);
  assert.equal(two.datasets[0].gameVersion, '丝路风雨');
  assert.notEqual(two.datasets[0].revision, one.revision);
  assert.equal(two.revision, one.revision);
  const reopened = sessions.open(sample.bytes, sample.filename, { source: origin('one') });
  assert.equal(reopened.datasetId, one.datasetId);
  assert.equal(reopened.datasets.length, 2);
  assert.equal(power(reopened), 11);
  assert.equal(reopened.hasDrafts, true);
  sessions.activateDataset(two.datasetId);
  const unchanged = sessions.undo(one.datasetId);
  assert.equal(unchanged.datasetId, two.datasetId);
  const restored = sessions.activateDataset(one.datasetId);
  assert.equal(restored.revision, one.revision);
  assert.equal(restored.hasDrafts, true);
  assert.equal(restored.dirty, false);
  assert.deepEqual(restored.source, origin('one'));
});

test('batch open validates every dataset before installing any and deduplicates exact origins', async () => {
  const sessions = store();
  await sessions.activate('chat', first);
  const before = sessions.snapshot();
  const sample = await first('jx-buff');
  const valid = { ...sample, source: { kind: 'file', key: '/one/BuffData.jx3dat', displayPath: '/one/BuffData.jx3dat' } };
  assert.throws(() => sessions.openMany([valid, { bytes: Buffer.from('return os.execute("unsafe")'), filename: 'bad.jx3dat' }]));
  assert.deepEqual(sessions.snapshot(), before);
  const opened = sessions.openMany([valid, valid]);
  assert.equal(opened.datasets.length, 1);
  assert.notEqual(opened.datasetId, before.datasetId);
});

test('closing checks the selected dataset including drafts and handles siblings and the last dataset', async () => {
  const sessions = store();
  const sample = await first('chat');
  const one = sessions.open(sample.bytes, 'one.txt');
  sessions.setDraftState({ datasetId: one.datasetId, dirty: true });
  const two = sessions.open(sample.bytes, 'two.txt');
  assert.equal(await sessions.closeDataset(one.datasetId), null);
  assert.equal(sessions.snapshot().datasetId, two.datasetId);
  assert.equal(sessions.snapshot().datasets.length, 2);
  assert.equal((await sessions.closeDataset(one.datasetId, { confirmDiscard: session => session.draftDirty })).datasetId, two.datasetId);
  const empty = await sessions.closeDataset(two.datasetId);
  assert.deepEqual(empty, { featureId: 'chat', datasetId: null, document: null, filename: '', dirty: false, hasDrafts: false, canUndo: false, datasets: [] });
  assert.deepEqual(sessions.snapshot(), empty);
  await sessions.activate('jx-buff', first);
  assert.deepEqual(await sessions.activate('chat', () => assert.fail('Closed last sample must not reload')), empty);
  assert.throws(() => sessions.activateDataset(one.datasetId), /Unknown dataset/);
  assert.throws(() => sessions.activateDataset(), /Invalid dataset identity/);
  await assert.rejects(sessions.closeDataset(), /Invalid dataset identity/);
});

test('explicit inactive mutations and export acknowledgements preserve active selection and reject unknown identities', async () => {
  const sessions = store();
  const sample = await first('jx-buff');
  const one = sessions.open(sample.bytes, 'one.jx3dat');
  const target = sessions.resolve(one.datasetId);
  const two = sessions.open(sample.bytes, 'two.jx3dat');
  sessions.mutate('editDocument', { key: 'buff:244', fields: { nPower: 12 } }, one.datasetId);
  assert.equal(power(sessions.snapshot()), 10);
  assert.equal(sessions.snapshot().datasetId, two.datasetId);
  assert.equal(sessions.markSaved(target).datasetId, two.datasetId);
  assert.equal(power(sessions.activateDataset(one.datasetId)), 12);
  assert.equal(sessions.snapshot().dirty, false);
  for (const action of [() => sessions.resolve('missing'), () => sessions.undo('missing'), () => sessions.mutate('addRecord', {}, 'missing'), () => sessions.setDraftState({ datasetId: 'missing', dirty: true })]) assert.throws(action, /Unknown dataset/);
});
