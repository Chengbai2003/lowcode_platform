import type { ComponentPanelConfig } from '../../types';

export const PopoverMeta: ComponentPanelConfig = {
  componentType: 'Popover',
  displayName: '气泡卡片',
  category: 'feedback',
  icon: 'message-circle',
  properties: [
    { key: 'title', label: '标题', editor: 'string', defaultValue: '', group: '基础' },
    { key: 'content', label: '内容', editor: 'string', defaultValue: '提示内容', group: '基础' },
    {
      key: 'trigger',
      label: '触发方式',
      editor: 'select',
      defaultValue: 'hover',
      options: [
        { label: '悬浮', value: 'hover' },
        { label: '点击', value: 'click' },
        { label: '聚焦', value: 'focus' },
      ],

      group: '基础',
    },
    {
      key: 'placement',
      label: '弹出位置',
      editor: 'select',
      defaultValue: 'top',
      options: [
        { label: '上', value: 'top' },
        { label: '下', value: 'bottom' },
        { label: '左', value: 'left' },
        { label: '右', value: 'right' },
      ],
      group: '样式',
    },
    { key: 'open', label: '手动控制显示', editor: 'boolean', defaultValue: false, group: '高级' },
  ],
};
