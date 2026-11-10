export function typeLabel(name) {
  if (name === '') return '未分配类型';
  if (!name.trim()) return `空白类型（${name.length} 个空格）`;
  return name;
}

export function projectTypes(records = []) {
  const groups = new Map();
  const ensure = name => {
    if (!groups.has(name)) groups.set(name, { name, record: null, members: [] });
    return groups.get(name);
  };
  for (const record of records) {
    if (record.key.startsWith('class:')) ensure(record.name).record = record;
  }
  for (const record of records) {
    if (record.key.startsWith('buff:')) ensure(record.fields.nClass).members.push(record);
  }
  return [...groups.values()];
}

export function matchingMembers(group, search = '', getName = record => record.name) {
  const query = search.trim().toLocaleLowerCase();
  if (!query || `${group.name} ${typeLabel(group.name)}`.toLocaleLowerCase().includes(query)) return group.members;
  return group.members.filter(record => `${getName(record)} ${record.name} ${record.id} ${record.key}`.toLocaleLowerCase().includes(query));
}

export function searchTypes(groups, search = '', getName) {
  const query = search.trim().toLocaleLowerCase();
  return groups.filter(group => !query || `${group.name} ${typeLabel(group.name)}`.toLocaleLowerCase().includes(query) || matchingMembers(group, search, getName).length);
}

export function rebaseMembershipDraft(draft, previous, next) {
  if (!draft || draft.values.nClass !== previous.fields.nClass || previous.fields.nClass === next.fields.nClass) return draft;
  return { ...draft, values: { ...draft.values, nClass: next.fields.nClass }, fields: draft.fields ? { ...draft.fields, nClass: next.fields.nClass } : null };
}
