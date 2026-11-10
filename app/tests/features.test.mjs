import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { features, featureById, featureForKind, featureForSample } from '../ui/features.mjs';
import { openDocument } from '../core/documents.mjs';

test('the six actual presets belong to four addon features regardless of file extension', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../../samples/SAMPLES.json', import.meta.url), 'utf8'));
  const files = Object.keys(manifest.files).filter(file => /\.jx3dat$/.test(file) || /团队气劲\/.*\.txt$/.test(file) || /推荐设置关键词\.txt$/.test(file));
  const groups = new Map(features.map(feature => [feature.id, []]));
  for (const file of files) {
    const id = featureForSample(file);
    const bytes = await fs.readFile(new URL(`../../samples/${file}`, import.meta.url));
    const document = openDocument(bytes, file.split('/').at(-1));
    assert.equal(featureForKind(document.kind), id, file);
    assert.equal(featureForSample(file.replaceAll('/', '\\')), id);
    groups.get(id).push(file.split('/').at(-1));
  }
  assert.deepEqual(Object.fromEntries(groups), {
    'jx-buff': ['BuffData.jx3dat'],
    'my-team': ['真传（仅）团队气劲.txt'],
    'my-target': ['其他辅助.jx3dat', '技能监控.jx3dat', '自用完整版.jx3dat'],
    chat: ['推荐设置关键词.txt']
  });
  assert.equal(featureById('my-target').kind, 'opaque');
  assert.equal(featureForSample('other/BuffData.jx3dat'), null);
  assert.equal(featureForKind('unknown'), null);
  assert.throws(() => featureById('../unknown'));
});
