'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { PNG } = require('pngjs');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_BYTES = 1024 * 1024;
const MAX_DIMENSION = 2048;
const ICON_PATHS = { std: 'icon', origin: 'origin_icon', wujie: 'icon' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function validPNG(bytes) {
  if (bytes.length < 33 || bytes.length > MAX_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') return false;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) return false;
  try {
    PNG.sync.read(bytes, { checkCRC: true });
    return true;
  } catch { return false; }
}

function createIconCache({ fetch, cacheDir, timeoutMs = 8000, maxConcurrent = 3, now = Date.now }) {
  if (typeof fetch !== 'function' || typeof cacheDir !== 'string' || !cacheDir) throw new Error('Icon cache requires fetch and a cache directory');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) throw new Error('Invalid icon request limits');
  const memory = new Map();
  const pending = new Map();
  const queue = [];
  let active = 0;

  function remember(key, entry) {
    memory.delete(key);
    memory.set(key, entry);
    if (memory.size > 128) memory.delete(memory.keys().next().value);
    return entry;
  }

  async function readCached(key, url) {
    if (memory.has(key)) return remember(key, memory.get(key));
    try {
      const metadataFile = path.join(cacheDir, `${key}.json`);
      if ((await fs.stat(metadataFile)).size > 4096) return null;
      const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
      if (metadata.url !== url || !Number.isFinite(metadata.cachedAt) || !/^[a-f0-9]{64}$/.test(metadata.digest)) return null;
      const pngFile = path.join(cacheDir, `${metadata.digest}.png`);
      if ((await fs.stat(pngFile)).size > MAX_BYTES) return null;
      const bytes = await fs.readFile(pngFile);
      if (!validPNG(bytes) || hash(bytes) !== metadata.digest) return null;
      if (memory.has(key)) return remember(key, memory.get(key));
      return remember(key, { bytes, cachedAt: metadata.cachedAt });
    } catch { return memory.get(key) || null; }
  }

  async function atomicWrite(file, contents) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, contents, { mode: 0o600 });
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
  }

  async function save(key, url, entry) {
    const digest = hash(entry.bytes);
    await fs.mkdir(cacheDir, { recursive: true });
    await atomicWrite(path.join(cacheDir, `${digest}.png`), entry.bytes);
    // Publish the pointer last so interrupted refreshes keep the previous PNG usable.
    await atomicWrite(path.join(cacheDir, `${key}.json`), JSON.stringify({ url, digest, cachedAt: entry.cachedAt }));
  }

  function pump() {
    while (active < maxConcurrent && queue.length) {
      const { run, resolve, reject } = queue.shift();
      active++;
      Promise.resolve().then(run).then(resolve, reject).finally(() => { active--; pump(); });
    }
  }

  async function readResponse(response, controller) {
    const contentType = response.headers?.get?.('content-type') || '';
    if (contentType.split(';')[0].trim().toLowerCase() !== 'image/png') throw new Error('Expected an image/png icon');
    const length = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('Icon exceeds the size limit');
    let bytes;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) {
            controller.abort();
            await reader.cancel().catch(() => {});
            throw new Error('Icon exceeds the size limit');
          }
          chunks.push(Buffer.from(value));
        }
        bytes = Buffer.concat(chunks, size);
      } finally { reader.releaseLock(); }
    } else {
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (!validPNG(bytes)) throw new Error('Invalid PNG icon');
    return bytes;
  }

  async function request(key, url, cached) {
    const controller = new AbortController();
    let timer;
    try {
      const download = (async () => {
        const response = await fetch(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'image/png' } });
        if (!response.ok) throw new Error(`Icon HTTP ${response.status}`);
        return readResponse(response, controller);
      })();
      const bytes = await Promise.race([download, new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Icon request timed out')); }, timeoutMs);
      })]);
      const entry = { bytes, cachedAt: now() };
      remember(key, entry);
      try {
        await save(key, url, entry);
      } catch {
        return result(entry, 'network', 'Icon loaded, but could not be saved to disk.');
      }
      return result(entry, 'network');
    } catch (error) {
      controller.abort();
      if (cached) return result(cached, 'cache', 'Icon refresh failed. Showing the saved icon.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  function result(entry, source, warning) {
    return { dataURL: `data:image/png;base64,${entry.bytes.toString('base64')}`, source, cachedAt: entry.cachedAt, ...(warning ? { warning } : {}) };
  }

  async function load(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.client !== 'string' || !Object.hasOwn(ICON_PATHS, input.client)) throw new Error('Unsupported icon client');
    if ((typeof input.id !== 'number' && typeof input.id !== 'string') || !/^[0-9]+$/.test(String(input.id))) throw new Error('Invalid icon ID');
    const id = Number(input.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid icon ID');
    if (input.refresh !== undefined && typeof input.refresh !== 'boolean') throw new Error('Invalid icon refresh option');
    const url = `https://icon.jx3box.com/${ICON_PATHS[input.client]}/${id}.png`;
    const key = hash(url);
    const cached = await readCached(key, url);
    if (cached && !input.refresh) return result(cached, 'cache');
    if (!pending.has(key)) {
      const task = new Promise((resolve, reject) => { queue.push({ run: () => request(key, url, cached), resolve, reject }); });
      pending.set(key, task);
      task.then(() => pending.delete(key), () => pending.delete(key));
      pump();
    }
    return pending.get(key);
  }

  return { load };
}

module.exports = { createIconCache };
