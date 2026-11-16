'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const invoke = (method, payload) => ipcRenderer.invoke(`studio:${method}`, payload);
contextBridge.exposeInMainWorld('studio', Object.freeze({
  samples: () => invoke('samples'),
  activateFeature: id => invoke('activateFeature', id),
  activateDataset: id => invoke('activateDataset', id),
  closeDataset: id => invoke('closeDataset', id),
  setDraftState: value => invoke('setDraftState', value),
  openSample: path => invoke('openSample', path),
  open: () => invoke('open'),
  create: kind => invoke('create', kind),
  edit: change => invoke('edit', change),
  add: fields => invoke('add', fields),
  remove: change => invoke('remove', change),
  move: change => invoke('move', change),
  save: value => invoke('save', value),
  history: filename => invoke('history', filename),
  restoreHistory: id => invoke('restoreHistory', id),
  lookup: query => invoke('lookup', query),
  lookupCached: queries => invoke('lookupCached', queries),
  loadIcon: query => invoke('loadIcon', query),
  updates: action => invoke('updates', action),
  undo: value => invoke('undo', value),
  duplicate: value => invoke('duplicate', value),
  renameVersion: value => invoke('renameVersion', value)
}));
