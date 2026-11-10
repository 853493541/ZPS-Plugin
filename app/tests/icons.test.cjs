'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { crc32 } = require('node:zlib');
const { PNG: PNGCodec } = require('pngjs');
const { createIconCache } = require('../services/icons.cjs');

const png = rgba => PNGCodec.sync.write({ width: 1, height: 1, data: Buffer.from(rgba) });
const PNG = png([255, 255, 255, 255]);
const response = (bytes = PNG, contentType = 'image/png') => new Response(bytes, { headers: contentType ? { 'Content-Type': contentType } : {} });
async function setup(t, options = {}) {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zps-icons-'));
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }));
  return { cacheDir, ...options };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('saved icons remain available offline across instances without expiring', async t => {
  let current = 100;
  let requests = 0;
  const options = await setup(t, { now: () => current });
  const online = createIconCache({ ...options, fetch: async () => { requests++; return response(); } });
  const loaded = await online.load({ client: 'std', id: 42 });
  assert.deepEqual(loaded, { dataURL: `data:image/png;base64,${PNG.toString('base64')}`, source: 'network', cachedAt: 100 });
  current += 365 * 86400000;
  assert.equal((await online.load({ client: 'std', id: 42 })).source, 'cache');
  assert.equal(requests, 1);
  const offline = createIconCache({ ...options, fetch: async () => { throw new Error('Network must not be used'); } });
  assert.deepEqual(await offline.load({ client: 'std', id: '42' }), { ...loaded, source: 'cache' });
  const files = await fs.readdir(options.cacheDir);
  assert.equal(files.filter(file => file.endsWith('.png')).length, 1);
  assert.deepEqual(await fs.readFile(path.join(options.cacheDir, files.find(file => file.endsWith('.png')))), PNG);
});

test('origin uses its fixed path while std and wujie share the actual URL cache', async t => {
  const urls = [];
  const cache = createIconCache(await setup(t, { fetch: async (url, options) => {
    urls.push(url);
    assert.equal(options.redirect, 'error');
    return response();
  } }));
  await cache.load({ client: 'std', id: '0042' });
  assert.equal((await cache.load({ client: 'wujie', id: 42 })).source, 'cache');
  await cache.load({ client: 'origin', id: 42 });
  assert.deepEqual(urls, ['https://icon.jx3box.com/icon/42.png', 'https://icon.jx3box.com/origin_icon/42.png']);
});

test('invalid client and ID inputs never reach the network', async t => {
  let requests = 0;
  const cache = createIconCache(await setup(t, { fetch: async () => { requests++; return response(); } }));
  for (const client of ['https://example.org', '__proto__', '', null, undefined, ['std'], { toString: () => 'std' }]) {
    await assert.rejects(cache.load({ client, id: 42 }));
  }
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '9007199254740992', 'https://example.org', '../1', '1.png', '1e2', '', null, true, [], {}]) {
    await assert.rejects(cache.load({ client: 'std', id }));
  }
  await assert.rejects(cache.load({ client: 'std', id: 42, refresh: 'yes' }));
  assert.equal(requests, 0);
});

test('same URL requests coalesce and unrelated downloads respect concurrency limits', async t => {
  let active = 0;
  let peak = 0;
  let requests = 0;
  const releases = [];
  const cache = createIconCache(await setup(t, { maxConcurrent: 3, fetch: async () => {
    requests++;
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => releases.push(resolve));
    active--;
    return response();
  } }));
  const tasks = [cache.load({ client: 'std', id: 1 }), cache.load({ client: 'wujie', id: '1' })];
  for (let id = 2; id <= 8; id++) tasks.push(cache.load({ client: 'std', id }));
  while (requests < 3) await tick();
  assert.equal(requests, 3);
  while (requests < 8 || releases.length) {
    releases.splice(0).forEach(resolve => resolve());
    await tick();
  }
  const results = await Promise.all(tasks);
  assert.equal(requests, 8);
  assert.equal(peak, 3);
  assert.deepEqual(results[0], results[1]);
});

test('disk cache hits bypass a saturated download queue', async t => {
  const options = await setup(t);
  await createIconCache({ ...options, fetch: async () => response() }).load({ client: 'std', id: 1 });
  let release;
  const cache = createIconCache({ ...options, maxConcurrent: 1, fetch: async () => {
    await new Promise(resolve => { release = resolve; });
    return response();
  } });
  const blocked = cache.load({ client: 'std', id: 2 });
  while (!release) await tick();
  try {
    const hit = await cache.load({ client: 'std', id: 1 });
    assert.equal(hit.source, 'cache');
  } finally { release(); }
  await blocked;
});

test('malformed PNGs, unsupported MIME types, errors and oversized bodies are never saved', async t => {
  for (const fetch of [
    async () => response(Buffer.from('<html>error</html>')),
    async () => response(PNG, 'text/html'),
    async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => PNG }),
    async () => new Response(PNG, { status: 404, headers: { 'Content-Type': 'image/png' } }),
    async () => response(Buffer.concat([PNG, Buffer.alloc(1024 * 1024)])),
  ]) {
    const options = await setup(t);
    await assert.rejects(createIconCache({ ...options, fetch }).load({ client: 'std', id: 1 }));
    assert.deepEqual(await fs.readdir(options.cacheDir), []);
    let attempts = 0;
    const retry = createIconCache({ ...options, fetch: async () => { attempts++; return response(); } });
    assert.equal((await retry.load({ client: 'std', id: 1 })).source, 'network');
    assert.equal(attempts, 1);
  }
});

test('a truncated PNG signature is rejected without poisoning a subsequent valid request', async t => {
  const options = await setup(t);
  let requests = 0;
  const cache = createIconCache({ ...options, fetch: async () => response(++requests === 1 ? PNG.subarray(0, 9) : PNG) });
  await assert.rejects(cache.load({ client: 'std', id: 42 }), /Invalid PNG/);
  assert.deepEqual(await fs.readdir(options.cacheDir), []);
  const loaded = await cache.load({ client: 'std', id: 42 });
  assert.equal(loaded.source, 'network');
  assert.equal(loaded.dataURL, `data:image/png;base64,${PNG.toString('base64')}`);
  assert.equal(requests, 2);
});

test('invalid PNG chunks, checksums, dimensions and compressed streams are never cached', async t => {
  const badCRC = Buffer.from(PNG);
  badCRC[29] ^= 1;
  const badStream = Buffer.from(PNG);
  const idat = badStream.indexOf(Buffer.from('IDAT'));
  const dataEnd = idat + 4 + badStream.readUInt32BE(idat - 4);
  badStream[idat + 4] = 0;
  badStream.writeUInt32BE(crc32(badStream.subarray(idat, dataEnd)), dataEnd);
  const oversizedDimensions = Buffer.from(PNG);
  oversizedDimensions.writeUInt32BE(2049, 16);
  oversizedDimensions.writeUInt32BE(crc32(oversizedDimensions.subarray(12, 29)), 29);
  const zeroDimensions = Buffer.from(PNG);
  zeroDimensions.writeUInt32BE(0, 20);
  zeroDimensions.writeUInt32BE(crc32(zeroDimensions.subarray(12, 29)), 29);
  for (const bytes of [PNG.subarray(0, 32), PNG.subarray(0, PNG.length - 1), badCRC, badStream, oversizedDimensions, zeroDimensions]) {
    const options = await setup(t);
    let requests = 0;
    const cache = createIconCache({ ...options, fetch: async () => response(++requests === 1 ? bytes : PNG) });
    await assert.rejects(cache.load({ client: 'std', id: 1 }), /Invalid PNG/);
    assert.deepEqual(await fs.readdir(options.cacheDir), []);
    assert.equal((await cache.load({ client: 'std', id: 1 })).source, 'network');
    assert.equal(requests, 2);
  }
});

test('failed explicit refresh preserves the saved icon and its fetch timestamp', async t => {
  const options = await setup(t, { now: () => 100 });
  let fail = false;
  const cache = createIconCache({ ...options, fetch: async () => {
    if (fail) throw new Error('offline');
    return response();
  } });
  const original = await cache.load({ client: 'origin', id: 99 });
  fail = true;
  const fallback = await cache.load({ client: 'origin', id: 99, refresh: true });
  assert.equal(fallback.dataURL, original.dataURL);
  assert.equal(fallback.cachedAt, 100);
  assert.equal(fallback.source, 'cache');
  assert.match(fallback.warning, /refresh failed/i);
  const restarted = createIconCache({ ...options, fetch: async () => { throw new Error('offline'); } });
  assert.deepEqual(await restarted.load({ client: 'origin', id: 99 }), { ...original, source: 'cache' });
});

test('successful explicit refresh updates bytes and timestamp on disk', async t => {
  const options = await setup(t);
  let current = 100;
  let bytes = PNG;
  let requests = 0;
  const cache = createIconCache({ ...options, now: () => current, fetch: async () => { requests++; return response(bytes); } });
  await cache.load({ client: 'std', id: 42 });
  current = 200;
  bytes = png([255, 0, 0, 255]);
  const refreshed = await cache.load({ client: 'std', id: 42, refresh: true });
  assert.equal(requests, 2);
  assert.equal(refreshed.source, 'network');
  assert.equal(refreshed.cachedAt, 200);
  assert.equal(refreshed.dataURL, `data:image/png;base64,${bytes.toString('base64')}`);
  const restarted = createIconCache({ ...options, fetch: async () => { throw new Error('offline'); } });
  assert.deepEqual(await restarted.load({ client: 'wujie', id: 42 }), { ...refreshed, source: 'cache' });
});

test('corrupted disk bytes trigger a valid replacement instead of reaching the caller', async t => {
  const options = await setup(t);
  await createIconCache({ ...options, fetch: async () => response() }).load({ client: 'std', id: 42 });
  const png = (await fs.readdir(options.cacheDir)).find(file => file.endsWith('.png'));
  await fs.writeFile(path.join(options.cacheDir, png), '<html>corrupt</html>');
  const replacement = await createIconCache({ ...options, fetch: async () => response() }).load({ client: 'std', id: 42 });
  assert.equal(replacement.source, 'network');
  assert.equal(replacement.dataURL, `data:image/png;base64,${PNG.toString('base64')}`);
});

test('a timed out request aborts and releases the queue for the next icon', async t => {
  let firstSignal;
  let calls = 0;
  const cache = createIconCache(await setup(t, { timeoutMs: 20, maxConcurrent: 1, fetch: async (url, { signal }) => {
    if (++calls === 1) { firstSignal = signal; return new Promise(() => {}); }
    return response();
  } }));
  const timeout = assert.rejects(cache.load({ client: 'std', id: 1 }), /timed out/);
  const next = cache.load({ client: 'std', id: 2 });
  await timeout;
  assert.equal(firstSignal.aborted, true);
  assert.equal((await next).source, 'network');
});

test('memory eviction retains persistent entries for later offline reads', async t => {
  let requests = 0;
  const cache = createIconCache(await setup(t, { fetch: async () => { requests++; return response(); } }));
  for (let id = 1; id <= 130; id++) await cache.load({ client: 'std', id });
  assert.equal((await cache.load({ client: 'std', id: 1 })).source, 'cache');
  assert.equal(requests, 130);
});
