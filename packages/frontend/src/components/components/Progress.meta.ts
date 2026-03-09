import type { ComponentPanelConfig } from '../../types';

export const ProgressMeta: ComponentPanelConfig = {
  componentType: 'Progress',
  displayName: '进度条',
  category: 'display',
  icon: 'chart-bar',
  properties: [
    { key: 'percent', label: '进度', editor: 'number', defaultValue: 0 },
    {
      key: 'type',
      label: '类型',
      editor: 'select',
      defaultValue: 'line',
      options: [
        { label: '线形', value: 'line' },
        { label: '圆形', value: 'circle' },
        { label: '仪表盘', value: 'dashboard' },
      ],
      group: '样式',
    },
    {
      key: 'status',
      label: '状态',
      editor: 'select',
      defaultValue: 'normal',
      options: [
        { label: '正常', value: 'normal' },
        { label: '成功', value: 'success' },
        { label: '异常', value: 'exception' },
        { label: '激活', value: 'active' },
      ],
      group: '样式',
    },
    { key: 'showInfo', label: '显示文本', editor: 'boolean', defaultValue: true },
    {
      key: 'size',
      label: '尺寸',
      editor: 'select',
      defaultValue: 'default',
      options: [
        { label: '默认', value: 'default' },
        { label: '小', value: 'small' },
      ],
      group: '样式',
    },
    { key: 'strokeColor', label: '进度颜色', editor: 'string', defaultValue: '', group: '样式' },
  ],
};
