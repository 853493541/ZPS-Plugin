import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function createFeatureSessions({ codec, featureById, featureForKind }) {
  const sessions = new Map();
  const activeByFeature = new Map();
  let activeFeatureId = null;
  const active = () => sessions.get(activeByFeature.get(activeFeatureId));
  const outputBytes = result => Buffer.from(result?.bytes ?? result);
  function resolve(id) {
    const session = id === undefined ? active() : sessions.get(id);
    if (!session) throw new Error(id === undefined ? '请先打开或新建数据。' : 'Unknown dataset');
    return session;
  }
  const locked = session => session.source.kind === 'sample';
  const summary = session => ({
    datasetId: session.datasetId, filename: session.filename, source: { ...session.source }, locked: locked(session),
    gameVersion: session.gameVersion, dirty: session.dirty, hasDrafts: session.draftDirty,
    revision: createHash('sha256').update(session.bytes).digest('hex').slice(0, 12)
  });
  const snapshot = () => {
    const session = active();
    return session ? {
      ...summary(session), featureId: session.featureId,
      document: (document => locked(session) ? { ...document, writable: false } : document)(codec.openDocument(session.bytes, session.filename)),
      canUndo: session.undo.length > 0,
      datasets: [...sessions.values()].filter(item => item.featureId === activeFeatureId).map(summary)
    } : activeFeatureId ? { featureId: activeFeatureId, datasetId: null, document: null, filename: '', dirty: false, hasDrafts: false, canUndo: false, datasets: [] } : null;
  };
  function validVersion(gameVersion) {
    if (typeof gameVersion !== 'string' || gameVersion.length > 80 || /[\x00-\x1f]/.test(gameVersion)) throw new Error('Invalid game version label');
    return gameVersion;
  }
  function nextVersion(original) {
    const taken = [...sessions.values()].filter(item => item.featureId === original.featureId && item.filename === original.filename)
      .map(item => /^版本 (\d+)$/.exec(item.gameVersion)?.[1]).filter(Boolean).map(Number);
    return `版本 ${Math.max(1, ...taken) + 1}`;
  }
  function prepare(bytes, filename, { dirty = false, source = { kind: 'new', key: randomUUID(), displayPath: filename }, gameVersion = '' } = {}) {
    if (typeof filename !== 'string' || !filename.trim() || filename.length > 255 || /[\x00-\x1f]/.test(filename)) throw new Error('Invalid dataset filename');
    validVersion(gameVersion);
    if (!source || !['file', 'sample', 'new'].includes(source.kind) || typeof source.key !== 'string' || !source.key || typeof source.displayPath !== 'string') throw new Error('Invalid dataset source');
    const buffer = outputBytes(bytes);
    const name = path.basename(filename);
    const document = codec.openDocument(buffer, name);
    const featureId = featureForKind(document.kind);
    if (!featureId) throw new Error('Unsupported document kind');
    return { datasetId: randomUUID(), featureId, source: { ...source }, gameVersion, bytes: buffer, filename: name, dirty, draftDirty: false, savedBytes: dirty ? undefined : buffer, undo: [] };
  }
  function select(session) {
    activeFeatureId = session.featureId;
    activeByFeature.set(session.featureId, session.datasetId);
    return snapshot();
  }
  function install(session) {
    sessions.set(session.datasetId, session);
    return select(session);
  }
  function existing(session) {
    return session.source.kind === 'new' ? undefined : [...sessions.values()].find(item => item.source.kind === session.source.kind && item.source.key === session.source.key);
  }
  return {
    get active() { return active(); },
    snapshot, resolve, summary,
    dirtySessions: () => [...sessions.values()].filter(session => session.dirty || session.draftDirty),
    setDraftState(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.dirty !== 'boolean') throw new Error('Invalid draft state');
      if (value.featureId !== undefined) featureById(value.featureId);
      const session = value.datasetId === undefined && value.featureId !== undefined ? resolve(activeByFeature.get(value.featureId) ?? null) : resolve(value.datasetId);
      if (value.featureId !== undefined && session.featureId !== value.featureId) throw new Error('Dataset does not belong to feature');
      session.draftDirty = value.dirty;
      return snapshot();
    },
    async activate(id, loadFirstSample) {
      featureById(id);
      if (activeByFeature.has(id)) {
        activeFeatureId = id;
        return snapshot();
      }
      const sample = await loadFirstSample(id);
      if (!sample) return null;
      const session = prepare(sample.bytes, sample.filename, sample);
      if (session.featureId !== id) throw new Error('Sample kind does not match feature');
      return install(existing(session) || session);
    },
    activateDataset(id) {
      if (typeof id !== 'string' || !id) throw new Error('Invalid dataset identity');
      return select(resolve(id));
    },
    open(bytes, filename, options) {
      const session = prepare(bytes, filename, options);
      return install(existing(session) || session);
    },
    duplicate(id, gameVersion) {
      const original = resolve(id);
      return install(prepare(original.bytes, original.filename, { dirty: true, gameVersion: gameVersion ? validVersion(gameVersion) : nextVersion(original) }));
    },
    renameVersion(id, gameVersion) {
      const session = resolve(id);
      if (locked(session)) throw new Error('内置样本已锁定。请先复制再修改。');
      session.gameVersion = validVersion(gameVersion.trim());
      return select(session);
    },
    openMany(entries) {
      if (!Array.isArray(entries) || !entries.length) throw new Error('No datasets selected');
      const prepared = entries.map(({ bytes, filename, ...options }) => prepare(bytes, filename, options));
      for (const session of prepared) install(existing(session) || session);
      return snapshot();
    },
    async closeDataset(id, { confirmDiscard = async () => false } = {}) {
      if (typeof id !== 'string' || !id) throw new Error('Invalid dataset identity');
      const session = resolve(id);
      if ((session.dirty || session.draftDirty) && !(await confirmDiscard(session))) return null;
      sessions.delete(id);
      if (activeByFeature.get(session.featureId) === id) {
        const replacement = [...sessions.values()].filter(item => item.featureId === session.featureId).at(-1);
        if (replacement) activeByFeature.set(session.featureId, replacement.datasetId);
        else activeByFeature.set(session.featureId, null);
      }
      return snapshot();
    },
    async replace(bytes, filename, { dirty = false, confirmDiscard = async () => false, ...options } = {}) {
      const next = prepare(bytes, filename, { ...options, dirty });
      const destination = sessions.get(activeByFeature.get(next.featureId));
      if ((destination?.dirty || destination?.draftDirty) && !(await confirmDiscard(destination))) return null;
      if (destination) sessions.delete(destination.datasetId);
      return install(next);
    },
    mutate(operation, value, datasetId) {
      const session = resolve(datasetId);
      if (locked(session)) throw new Error('内置样本已锁定。请先复制再修改。');
      const bytes = outputBytes(codec[operation](session.bytes, session.filename, value));
      const document = codec.openDocument(bytes, session.filename);
      if (featureForKind(document.kind) !== session.featureId) throw new Error('An edit cannot change document kind');
      if (!bytes.equals(session.bytes)) {
        session.undo.push(session.bytes);
        if (session.undo.length > 30) session.undo.shift();
        session.bytes = bytes;
        session.dirty = !session.savedBytes?.equals(bytes);
      }
      return snapshot();
    },
    undo(datasetId) {
      const session = datasetId === undefined ? active() : resolve(datasetId);
      if (session?.undo.length) {
        session.bytes = session.undo.pop();
        session.dirty = !session.savedBytes?.equals(session.bytes);
      }
      return snapshot();
    },
    markSaved(session = active()) {
      if (!session || sessions.get(session.datasetId) !== session) throw new Error('Unknown dataset');
      session.savedBytes = session.bytes;
      session.dirty = false;
      return snapshot();
    }
  };
}
