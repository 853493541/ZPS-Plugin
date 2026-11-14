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
  save: value => invoke('save', value),
  lookup: query => invoke('lookup', query),
  lookupCached: queries => invoke('lookupCached', queries),
  loadIcon: query => invoke('loadIcon', query),
  updates: action => invoke('updates', action),
  undo: value => invoke('undo', value),
  duplicate: value => invoke('duplicate', value),
  renameVersion: value => invoke('renameVersion', value)
}));
