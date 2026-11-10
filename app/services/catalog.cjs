'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

function createCatalog({ fetch, cacheDir, ttlMs = 86400000, timeoutMs = 8000, intervalMs = 350, now = Date.now }) {
  if (typeof fetch !== 'function' || !cacheDir) throw new Error('Catalog requires fetch and a cache directory');
  let queue = Promise.resolve();
  let nextRequest = 0;
  const memory = new Map();
  const pending = new Map();
  function normalize(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid buff query');
    const client = input.client || 'std';
    const level = input.level === undefined || input.level === '' ? 1 : Number(input.level);
    if (!['std', 'origin', 'wujie'].includes(client)) throw new Error('Unsupported JX3BOX client');
    if (!Number.isSafeInteger(level) || level < 1 || level > 99999) throw new Error('Invalid buff level');
    const id = input.id === undefined ? '' : String(input.id).trim();
    const name = input.name === undefined ? '' : String(input.name).trim();
    if (id ? !/^\d{1,12}$/.test(id) : !name || name.length > 200) throw new Error('Enter a buff ID or a name');
    return { type: id ? 'id' : 'name', value: id || name, client, level };
  }
  const keyFor = query => createHash('sha256').update(JSON.stringify(query)).digest('hex');
  const fileFor = key => path.join(cacheDir, `${key}.json`);
  const isFresh = entry => now() - entry.cachedAt < ttlMs;
  function remember(key, entry) {
    memory.delete(key);
    memory.set(key, entry);
    if (memory.size > 512) memory.delete(memory.keys().next().value);
    return entry;
  }
  async function readCached(key) {
    if (memory.has(key)) return remember(key, memory.get(key));
    try {
      const entry = JSON.parse(await fs.readFile(fileFor(key), 'utf8'));
      if (memory.has(key)) return remember(key, memory.get(key));
      if (Number.isFinite(entry.cachedAt) && validPayload(entry.raw)) return remember(key, entry);
    } catch {}
    return memory.get(key) || null;
  }
  function result(entry, query, source, stale) {
    const raw = structuredClone(entry.raw);
    return { list: raw.list, total: Number.isFinite(raw.total) ? raw.total : raw.list.length, raw, source, stale, client: query.client, query, cachedAt: entry.cachedAt };
  }
  async function lookupCached(inputs) {
    if (!Array.isArray(inputs) || inputs.length > 512) throw new Error('Expected up to 512 buff queries');
    const queries = Array.from(inputs, normalize);
    return Promise.all(queries.map(async query => {
      const entry = await readCached(keyFor(query));
      return entry ? result(entry, query, 'cache', !isFresh(entry)) : null;
    }));
  }
  async function lookup(input = {}) {
    const query = normalize(input);
    const key = keyFor(query);
    const cached = await readCached(key);
    if (cached && isFresh(cached)) return result(cached, query, 'cache', false);
    let task = pending.get(key);
    if (!task) {
      const run = () => request(query, key, cached);
      task = queue.then(run, run);
      pending.set(key, task);
      queue = task.catch(() => {});
      task.then(() => pending.delete(key), () => pending.delete(key));
    }
    const resolved = await task;
    return { ...result(resolved.entry, query, resolved.source, resolved.stale), ...(resolved.warning ? { warning: resolved.warning } : {}) };
  }
  async function request(query, key, cached) {
    const wait = nextRequest - now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    nextRequest = now() + intervalMs;
    const controller = new AbortController();
    let timer;
    try {
      const url = `https://node.jx3box.com/buff/${query.type}/${encodeURIComponent(query.value)}?client=${query.client}&level=${query.level}`;
      const pending = (async () => {
        const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`JX3BOX HTTP ${response.status}`);
        const raw = await response.json();
        if (!validPayload(raw)) throw new Error('Unexpected JX3BOX response');
        return raw;
      })();
      const raw = await Promise.race([pending, new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('JX3BOX request timed out')); }, timeoutMs);
      })]);
      const entry = { cachedAt: now(), raw: structuredClone(raw) };
      remember(key, entry);
      const file = fileFor(key);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await fs.mkdir(cacheDir, { recursive: true });
        await fs.writeFile(temporary, JSON.stringify(entry), { mode: 0o600 });
        await fs.rename(temporary, file);
      } catch { await fs.rm(temporary, { force: true }).catch(() => {}); }
      return { entry, source: 'network', stale: false };
    } catch (error) {
      if (cached) return { entry: cached, source: 'cache', stale: true, warning: 'Network unavailable. Showing expired cached data.' };
      throw error;
    } finally { clearTimeout(timer); }
  }
  return { lookup, lookupCached };
}
function validPayload(raw) {
  return raw && typeof raw === 'object' && Array.isArray(raw.list) && (raw.total === undefined || Number.isFinite(raw.total) && raw.total >= 0) && raw.list.every(row => row && typeof row === 'object' && !Array.isArray(row));
}
module.exports = { createCatalog };
