import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as codec from '../core/documents.mjs';
import { createHistory, restoreLabel } from '../core/history.mjs';

const sample = JSON.parse(await fs.readFile('samples/SAMPLES.json', 'utf8'));
const file = Object.keys(sample.files).find(name => name.endsWith('.jx3dat'));
const bytes = await fs.readFile(path.join('samples', file));
const filename = path.basename(file);
const out = result => Buffer.from(result?.bytes ?? result);

test('exports are kept with what changed, skip identical repeats and survive a restart', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zps-history-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const history = createHistory({ dir, codec });
  const first = await history.record({ bytes, filename, gameVersion: '副本', exportedPath: 'C:/out.jx3dat' });
  assert.equal(first.changes.first, true);
  assert.equal((await history.record({ bytes, filename, gameVersion: '副本' })).id, first.id, 'identical export is not stored twice');

  const document = codec.openDocument(bytes, filename);
  const buff = document.records.find(record => record.key.startsWith('buff:'));
  const edited = out(codec.editDocument(bytes, filename, { key: buff.key, fields: { nPower: 77 } }));
  const removed = out(codec.deleteRecord(edited, filename, { key: document.records.filter(record => record.key.startsWith('buff:'))[1].key }));
  const second = await history.record({ bytes: removed, filename, gameVersion: '副本' });
  assert.equal(second.changes.first, false);
  assert.deepEqual(second.changes.changed.map(item => [item.key, item.fields]), [[buff.key, ['nPower']]]);
  assert.equal(second.changes.removed.length, 1);
  assert.equal(second.changes.added.length, 0);

  const reopened = createHistory({ dir, codec });
  const list = await reopened.list(filename.toUpperCase());
  assert.deepEqual(list.map(item => item.id), [second.id, first.id], 'newest first, matched by file name');
  assert.deepEqual(await reopened.list('other.jx3dat'), []);
  assert.ok((await reopened.read(first.id)).bytes.equals(bytes), 'snapshot bytes are exact');
  assert.match(restoreLabel(first), /^历史 \d\d-\d\d \d\d:\d\d$/);
  await assert.rejects(reopened.read('../index'), /Invalid/);
});

test('only the newest exports per file are kept', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zps-history-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const history = createHistory({ dir, codec, limit: 2 });
  const document = codec.openDocument(bytes, filename);
  const buff = document.records.find(record => record.key.startsWith('buff:'));
  const ids = [];
  for (const power of [1, 2, 3]) ids.push((await history.record({ bytes: out(codec.editDocument(bytes, filename, { key: buff.key, fields: { nPower: power } })), filename })).id);
  assert.deepEqual((await history.list(filename)).map(item => item.id), [ids[2], ids[1]]);
  await assert.rejects(history.read(ids[0]));
  assert.equal((await fs.readdir(dir)).filter(name => name.endsWith('.bin')).length, 2, 'old snapshot files are removed');
});
