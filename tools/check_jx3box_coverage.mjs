import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDocument } from '../app/core/documents.mjs';
import { createCatalog } from '../app/services/catalog.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'samples/SAMPLES.json'), 'utf8'));
const sample = Object.keys(manifest.files).find(file => file.endsWith('/BuffData.jx3dat'));
const bytes = await fs.readFile(path.join(root, 'samples', sample));
const document = openDocument(bytes, 'BuffData.jx3dat');
const records = document.records.filter(record => record.id !== undefined);
const directory = path.join(root, 'artifacts');
await fs.mkdir(directory, { recursive: true });
const catalog = createCatalog({ fetch, cacheDir: path.join(directory, 'coverage-cache'), timeoutMs: 20000 });
const report = {
  startedAt: new Date().toISOString(),
  sample,
  sampleSha256: createHash('sha256').update(bytes).digest('hex'),
  client: 'std',
  scope: 'Every buff ID in the supplied JX preset, at API level 1. Preset level zero is not interpreted as an API level.',
  results: []
};
for (const record of records) {
  const query = { id: record.id, client: report.client, level: 1 };
  const sourceUrl = `https://node.jx3box.com/buff/id/${query.id}?client=${query.client}&level=${query.level}`;
  try {
    const result = await catalog.lookup(query);
    const matches = result.list.filter(row => String(row.BuffID) === String(query.id) && Number(row.Level) === query.level);
    report.results.push({ query, sourceUrl, capturedAt: new Date(result.cachedAt).toISOString(), source: result.source, stale: result.stale, matched: matches.length > 0, raw: result.raw });
  } catch (error) {
    report.results.push({ query, sourceUrl, error: error.message });
  }
  report.summary = {
    checked: report.results.length,
    requested: records.length,
    matched: report.results.filter(result => result.matched).length,
    missing: report.results.filter(result => result.matched === false).length,
    failed: report.results.filter(result => result.error).length,
    network: report.results.filter(result => result.source === 'network').length,
    cached: report.results.filter(result => result.source === 'cache').length,
    stale: report.results.filter(result => result.stale).length
  };
  await fs.writeFile(path.join(directory, 'jx3box-coverage.json'), JSON.stringify(report, null, 2) + '\n');
  if (report.results.length % 10 === 0) console.log(JSON.stringify(report.summary));
}
report.finishedAt = new Date().toISOString();
await fs.writeFile(path.join(directory, 'jx3box-coverage.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
process.exitCode = report.summary.failed ? 1 : 0;
