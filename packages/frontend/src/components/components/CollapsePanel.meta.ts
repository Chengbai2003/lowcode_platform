import type { ComponentPanelConfig } from '../../types';

export const CollapsePanelMeta: ComponentPanelConfig = {
  componentType: 'CollapsePanel',
  displayName: '折叠子面板',
  category: 'display',
  icon: 'panel',
  properties: [
    { key: 'header', label: '标题', editor: 'string', defaultValue: '面板标题' },
    { key: 'key', label: '唯一标识', editor: 'string', defaultValue: 'panel1', group: '高级' },
    { key: 'showArrow', label: '显示箭头', editor: 'boolean', defaultValue: true },
    {
      key: 'collapsible',
      label: '折叠触发方式',
      editor: 'select',
      defaultValue: 'header',
      options: [
        { label: '标题可点击', value: 'header' },
        { label: '仅图标可点击', value: 'icon' },
        { label: '禁用', value: 'disabled' },
      ],
      group: '高级',
    },
    {
      key: 'forceRender',
      label: '强制渲染',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
  ],
};
