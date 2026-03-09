import type { ComponentPanelConfig } from '../../types';

export const TabPaneMeta: ComponentPanelConfig = {
  componentType: 'TabPane',
  displayName: '标签页面板',
  category: 'display',
  icon: 'panel',
  properties: [
    { key: 'tab', label: '页签标题', editor: 'string', defaultValue: '标签页' },
    { key: 'key', label: '唯一标识', editor: 'string', defaultValue: 'tab1', group: '高级' },
    { key: 'disabled', label: '禁用', editor: 'boolean', defaultValue: false },
    {
      key: 'forceRender',
      label: '强制渲染',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
    {
      key: 'closable',
      label: '可关闭',
      editor: 'boolean',
      defaultValue: true,
      group: '高级',
    },
  ],
};
