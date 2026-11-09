'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

function createCatalog({ fetch, cacheDir, ttlMs = 86400000, timeoutMs = 8000, intervalMs = 350, now = Date.now }) {
  if (typeof fetch !== 'function' || !cacheDir) throw new Error('Catalog requires fetch and a cache directory');
  let queue = Promise.resolve();
  let nextRequest = 0;
  function lookup(input = {}) {
    const client = input.client || 'std';
    const level = input.level === undefined || input.level === '' ? 1 : Number(input.level);
    if (!['std', 'origin', 'wujie'].includes(client)) return Promise.reject(new Error('Unsupported JX3BOX client'));
    if (!Number.isSafeInteger(level) || level < 1 || level > 99999) return Promise.reject(new Error('Invalid buff level'));
    const id = input.id === undefined ? '' : String(input.id).trim();
    const name = input.name === undefined ? '' : String(input.name).trim();
    if (id ? !/^\d{1,12}$/.test(id) : !name || name.length > 200) return Promise.reject(new Error('Enter a buff ID or a name'));
    const query = { type: id ? 'id' : 'name', value: id || name, client, level };
    const run = () => request(query);
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  }
  async function request(query) {
    const key = createHash('sha256').update(JSON.stringify(query)).digest('hex');
    const file = path.join(cacheDir, `${key}.json`);
    let cached;
    try {
      const entry = JSON.parse(await fs.readFile(file, 'utf8'));
      if (Number.isFinite(entry.cachedAt) && validPayload(entry.raw)) cached = entry;
    } catch {}
    const result = (entry, source, stale) => ({ list: entry.raw.list, total: Number.isFinite(entry.raw.total) ? entry.raw.total : entry.raw.list.length, raw: entry.raw, source, stale, client: query.client, query, cachedAt: entry.cachedAt });
    if (cached && now() - cached.cachedAt < ttlMs) return result(cached, 'cache', false);
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
      const entry = { cachedAt: now(), raw };
      try {
        await fs.mkdir(cacheDir, { recursive: true });
        const temporary = `${file}.tmp`;
        await fs.writeFile(temporary, JSON.stringify(entry), { mode: 0o600 });
        await fs.rename(temporary, file);
      } catch {}
      return result(entry, 'network', false);
    } catch (error) {
      if (cached) return { ...result(cached, 'cache', true), warning: 'Network unavailable. Showing expired cached data.' };
      throw error;
    } finally { clearTimeout(timer); }
  }
  return { lookup };
}
function validPayload(raw) {
  return raw && typeof raw === 'object' && Array.isArray(raw.list) && (raw.total === undefined || Number.isFinite(raw.total) && raw.total >= 0) && raw.list.every(row => row && typeof row === 'object' && !Array.isArray(row));
}
module.exports = { createCatalog };
