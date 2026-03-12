import type { ComponentPanelConfig } from '../../types';

export const CollapseMeta: ComponentPanelConfig = {
  componentType: 'Collapse',
  displayName: '折叠面板',
  category: 'display',
  icon: 'chevron-down-square',
  properties: [
    {
      key: 'accordion',
      label: '手风琴模式',
      editor: 'boolean',
      defaultValue: false,
      group: '基础',
    },
    { key: 'bordered', label: '显示边框', editor: 'boolean', defaultValue: true, group: '样式' },
    { key: 'ghost', label: '幽灵模式', editor: 'boolean', defaultValue: false, group: '样式' },
    {
      key: 'expandIconPosition',
      label: '图标位置',
      editor: 'select',
      defaultValue: 'start',
      options: [
        { label: '左侧', value: 'start' },
        { label: '右侧', value: 'end' },
      ],
      group: '样式',
    },
    {
      key: 'destroyInactivePanel',
      label: '销毁隐藏面板',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
  ],
};
