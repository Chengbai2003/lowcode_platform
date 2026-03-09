import type { ComponentPanelConfig } from '../../types';

export const BadgeMeta: ComponentPanelConfig = {
  componentType: 'Badge',
  displayName: '徽标数',
  category: 'display',
  icon: 'badge',
  properties: [
    { key: 'count', label: '数量', editor: 'number', defaultValue: 5 },
    { key: 'showZero', label: '显示0', editor: 'boolean', defaultValue: false },
    { key: 'dot', label: '小红点', editor: 'boolean', defaultValue: false, group: '样式' },
    {
      key: 'status',
      label: '状态色',
      editor: 'select',
      defaultValue: 'default',
      options: [
        { label: '默认', value: 'default' },
        { label: '成功', value: 'success' },
        { label: '处理中', value: 'processing' },
        { label: '警告', value: 'warning' },
        { label: '错误', value: 'error' },
      ],
      group: '样式',
    },
    { key: 'text', label: '状态文本', editor: 'string', defaultValue: '', group: '高级' },
    { key: 'overflowCount', label: '最大显示数', editor: 'number', defaultValue: 99, group: '高级' },
  ],
};
