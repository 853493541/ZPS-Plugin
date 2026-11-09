export const features = Object.freeze([
  { id: 'jx-buff', kind: 'jx-buff', title: '剑心 BUFF增强', addon: '剑心插件集', badge: 'JX · BUFF', description: '编辑 Buff 分类、边框与标识规则。', importPath: '剑心插件集 → BUFF增强 → 导入', sampleDirectory: '剑心目标增强' },
  { id: 'my-team', kind: 'my-team', title: '茗伊团队气劲', addon: '茗伊插件集', badge: 'MY · TEAM', description: '编辑团队面板中的气劲监控与显示规则。', importPath: '茗伊 → 团队 → 气劲设置 → 编辑，粘贴全文', sampleDirectory: '团队气劲' },
  { id: 'my-target', kind: 'opaque', title: '茗伊目标监控', addon: '茗伊插件集', badge: 'MY · TARGET', description: '管理技能监控、其他辅助与自用完整版预设。当前二进制格式仅支持只读查看。', importPath: '茗伊 → 目标监控', sampleDirectory: '目标监控' },
  { id: 'chat', kind: 'chat', title: '茗伊聊天监控', addon: '茗伊插件集', badge: 'MY · CHAT', description: '编辑技能名称与公告等聊天监控关键词。', importPath: '茗伊 → 聊天 → 聊天监控 → 添加关键词', sampleDirectory: '茗伊聊天监控' }
]);

export function featureById(id) {
  const feature = features.find(item => item.id === id);
  if (!feature) throw new Error('Unknown feature');
  return feature;
}

export function featureForKind(kind) {
  return features.find(feature => feature.kind === kind)?.id ?? null;
}

export function featureForSample(file) {
  const directories = String(file).replaceAll('\\', '/').split('/').slice(0, -1);
  return features.find(feature => directories.includes(feature.sampleDirectory))?.id ?? null;
}
