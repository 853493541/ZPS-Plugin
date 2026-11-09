'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCatalog } = require('../services/catalog.cjs');
async function setup(t, options = {}) {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zps-catalog-'));
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }));
  return { cacheDir, ...options };
}
const response = raw => ({ ok: true, json: async () => raw });
test('looks up an official client and preserves the complete response', async t => {
  const raw = { list: [{ BuffID: 42, Level: '1', Name: '测试', Extra: { unchanged: true } }], metadata: 'kept' };
  let requested;
  const service = createCatalog(await setup(t, { fetch: async url => { requested = url; return response(raw); } }));
  const result = await service.lookup({ id: 42, client: 'origin', level: 1 });
  assert.equal(requested, 'https://node.jx3box.com/buff/id/42?client=origin&level=1');
  assert.deepEqual(result.raw, raw);
  assert.equal(result.total, 1);
  assert.equal(result.source, 'network');
  assert.equal(result.stale, false);
});
test('name searches encode the query and keep client and level caches separate', async t => {
  const urls = [];
  const service = createCatalog(await setup(t, { intervalMs: 0, fetch: async url => { urls.push(url); return response({ list: [], total: 0 }); } }));
  await service.lookup({ name: '气 劲/甲', client: 'std', level: 1 });
  await service.lookup({ name: '气 劲/甲', client: 'wujie', level: 1 });
  await service.lookup({ name: '气 劲/甲', client: 'std', level: 2 });
  assert.equal(urls.length, 3);
  assert.equal(urls[0], 'https://node.jx3box.com/buff/name/%E6%B0%94%20%E5%8A%B2%2F%E7%94%B2?client=std&level=1');
});
test('a fresh disk cache works across service instances without a network call', async t => {
  const options = await setup(t);
  await createCatalog({ ...options, fetch: async () => response({ list: [{ BuffID: '5' }], total: 9 }) }).lookup({ id: 5 });
  const result = await createCatalog({ ...options, fetch: async () => { throw new Error('must not fetch'); } }).lookup({ id: 5 });
  assert.equal(result.source, 'cache');
  assert.equal(result.stale, false);
  assert.equal(result.total, 9);
  assert.equal(result.list[0].BuffID, '5');
});
test('expired cache is explicitly stale when offline', async t => {
  let current = 100;
  let offline = false;
  const service = createCatalog(await setup(t, { ttlMs: 10, intervalMs: 0, now: () => current, fetch: async () => { if (offline) throw new Error('offline'); return response({ list: [{ BuffID: 9 }] }); } }));
  await service.lookup({ id: 9 });
  current = 200;
  offline = true;
  const result = await service.lookup({ id: 9 });
  assert.equal(result.source, 'cache');
  assert.equal(result.stale, true);
  assert.match(result.warning, /expired/);
});
test('invalid clients and IDs never reach the API', async t => {
  let calls = 0;
  const service = createCatalog(await setup(t, { fetch: async () => { calls++; return response({ list: [] }); } }));
  await assert.rejects(service.lookup({ id: 1, client: 'zhenchuan' }));
  await assert.rejects(service.lookup({ id: '../1' }));
  await assert.rejects(service.lookup({ id: 1, level: 0 }));
  assert.equal(calls, 0);
});
test('timeouts reject even when a transport ignores cancellation', async t => {
  let signal;
  const service = createCatalog(await setup(t, { timeoutMs: 10, fetch: async (_, options) => { signal = options.signal; return new Promise(() => {}); } }));
  await assert.rejects(service.lookup({ id: 1 }), /timed out/);
  assert.equal(signal.aborted, true);
});
test('malformed and failed responses do not become cache hits', async t => {
  let calls = 0;
  const service = createCatalog(await setup(t, { intervalMs: 0, fetch: async () => { calls++; return calls === 1 ? response({ data: [] }) : { ok: false, status: 503 }; } }));
  await assert.rejects(service.lookup({ id: 7 }), /Unexpected/);
  await assert.rejects(service.lookup({ id: 7 }), /503/);
  assert.equal(calls, 2);
});
