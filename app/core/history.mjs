import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const LIMIT = 50;

// What changed between two exports of the same file, by record.
export function describeChanges(codec, previousBytes, bytes, filename) {
  const records = data => new Map(codec.openDocument(data, filename).records.map(record => [record.key, record]));
  const after = records(bytes);
  if (!previousBytes) return { first: true, total: after.size, added: [], removed: [], changed: [] };
  const before = records(previousBytes);
  const label = record => ({ key: record.key, name: record.name ?? record.key, category: record.category ?? '' });
  const added = [...after.values()].filter(record => !before.has(record.key)).map(label);
  const removed = [...before.values()].filter(record => !after.has(record.key)).map(label);
  const changed = [];
  for (const [key, record] of after) {
    const old = before.get(key);
    if (!old) continue;
    const names = new Set([...Object.keys(old.fields ?? {}), ...Object.keys(record.fields ?? {})]);
    const fields = [...names].filter(name => JSON.stringify(old.fields?.[name]) !== JSON.stringify(record.fields?.[name]));
    if (old.name !== record.name) fields.unshift('name');
    if (fields.length) changed.push({ ...label(record), fields });
  }
  return { first: false, total: after.size, added, removed, changed };
}

export function createHistory({ dir, codec, limit = LIMIT }) {
  const index = path.join(dir, 'index.json');
  let entries;
  async function load() {
    if (entries) return entries;
    try {
      const data = JSON.parse(await fs.readFile(index, 'utf8'));
      entries = Array.isArray(data?.entries) ? data.entries.filter(item => typeof item?.id === 'string' && /^[0-9a-f-]{36}$/.test(item.id)) : [];
    } catch { entries = []; }
    return entries;
  }
  async function write() {
    await fs.mkdir(dir, { recursive: true });
    const temporary = `${index}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify({ entries }), 'utf8');
    await fs.rename(temporary, index);
  }
  const blob = id => path.join(dir, `${id}.bin`);
  const same = (item, filename) => item.filename.toLowerCase() === filename.toLowerCase();
  const publicEntry = ({ id, filename, gameVersion, exportedPath, createdAt, revision, changes }) => ({ id, filename, gameVersion, exportedPath, createdAt, revision, changes });

  return {
    async record({ bytes, filename, gameVersion = '', exportedPath = '' }) {
      const list = await load();
      const buffer = Buffer.from(bytes);
      const revision = createHash('sha256').update(buffer).digest('hex').slice(0, 12);
      const previous = list.filter(item => same(item, filename)).at(-1);
      if (previous?.revision === revision && previous.gameVersion === gameVersion) return publicEntry(previous);
      let previousBytes;
      if (previous) { try { previousBytes = await fs.readFile(blob(previous.id)); } catch {} }
      const entry = { id: randomUUID(), filename, gameVersion, exportedPath, createdAt: new Date().toISOString(), revision, changes: describeChanges(codec, previousBytes, buffer, filename) };
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(blob(entry.id), buffer);
      list.push(entry);
      const mine = list.filter(item => same(item, filename));
      for (const old of mine.slice(0, Math.max(0, mine.length - limit))) {
        list.splice(list.indexOf(old), 1);
        await fs.rm(blob(old.id), { force: true });
      }
      await write();
      return publicEntry(entry);
    },
    async list(filename) {
      if (typeof filename !== 'string' || !filename) throw new Error('Invalid history filename');
      return (await load()).filter(item => same(item, filename)).map(publicEntry).reverse();
    },
    async read(id) {
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid history entry');
      const entry = (await load()).find(item => item.id === id);
      if (!entry) throw new Error('找不到这条历史记录。');
      return { ...publicEntry(entry), bytes: await fs.readFile(blob(id)) };
    }
  };
}

// The tab label for a restored export, e.g. 历史 11-16 09:05.
export function restoreLabel(entry) {
  const date = new Date(entry.createdAt);
  const pad = number => String(number).padStart(2, '0');
  return `历史 ${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
