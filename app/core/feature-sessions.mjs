import path from 'node:path';

export function createFeatureSessions({ codec, featureById, featureForKind }) {
  const sessions = new Map();
  let activeId = null;
  const active = () => sessions.get(activeId);
  const outputBytes = result => Buffer.from(result?.bytes ?? result);
  const snapshot = () => {
    const session = active();
    return session ? {
      featureId: activeId,
      document: codec.openDocument(session.bytes, session.filename),
      filename: session.filename,
      dirty: session.dirty,
      hasDrafts: session.draftDirty,
      canUndo: session.undo.length > 0
    } : null;
  };
  function prepare(bytes, filename, dirty = false) {
    const buffer = outputBytes(bytes);
    const name = path.basename(filename);
    const document = codec.openDocument(buffer, name);
    const featureId = featureForKind(document.kind);
    if (!featureId) throw new Error('Unsupported document kind');
    return { featureId, bytes: buffer, filename: name, dirty, draftDirty: false, savedBytes: dirty ? undefined : buffer, undo: [] };
  }
  function install(session) {
    sessions.set(session.featureId, session);
    activeId = session.featureId;
    return snapshot();
  }
  return {
    get active() { return active(); },
    snapshot,
    dirtySessions: () => [...sessions.values()].filter(session => session.dirty || session.draftDirty),
    setDraftState(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.dirty !== 'boolean') throw new Error('Invalid draft state');
      featureById(value.featureId);
      const session = sessions.get(value.featureId);
      if (!session) throw new Error('Feature has no document session');
      session.draftDirty = value.dirty;
      return snapshot();
    },
    async activate(id, loadFirstSample) {
      featureById(id);
      if (sessions.has(id)) {
        activeId = id;
        return snapshot();
      }
      const sample = await loadFirstSample(id);
      if (!sample) return null;
      const session = prepare(sample.bytes, sample.filename);
      if (session.featureId !== id) throw new Error('Sample kind does not match feature');
      return install(session);
    },
    async replace(bytes, filename, { dirty = false, confirmDiscard = async () => false } = {}) {
      const next = prepare(bytes, filename, dirty);
      const destination = sessions.get(next.featureId);
      if ((destination?.dirty || destination?.draftDirty) && !(await confirmDiscard(destination))) return null;
      return install(next);
    },
    mutate(operation, value) {
      const session = active();
      if (!session) throw new Error('请先打开或新建数据。');
      const bytes = outputBytes(codec[operation](session.bytes, session.filename, value));
      const document = codec.openDocument(bytes, session.filename);
      if (featureForKind(document.kind) !== activeId) throw new Error('An edit cannot change document kind');
      if (!bytes.equals(session.bytes)) {
        session.undo.push(session.bytes);
        if (session.undo.length > 30) session.undo.shift();
        session.bytes = bytes;
        session.dirty = !session.savedBytes?.equals(bytes);
      }
      return snapshot();
    },
    undo() {
      const session = active();
      if (session?.undo.length) {
        session.bytes = session.undo.pop();
        session.dirty = !session.savedBytes?.equals(session.bytes);
      }
      return snapshot();
    },
    markSaved(session = active()) {
      if (!session) throw new Error('请先打开或新建数据。');
      session.savedBytes = session.bytes;
      session.dirty = false;
      return snapshot();
    }
  };
}
