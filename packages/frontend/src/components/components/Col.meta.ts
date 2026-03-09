import type { ComponentPanelConfig } from '../../types';

export const ColMeta: ComponentPanelConfig = {
  componentType: 'Col',
  displayName: '栅格列',
  category: 'layout',
  icon: 'column-width',
  properties: [
    { key: 'span', label: '列宽(span)', editor: 'number', defaultValue: 24 },
    { key: 'offset', label: '左偏移', editor: 'number', defaultValue: 0 },
    { key: 'order', label: '排序', editor: 'number', defaultValue: 0, group: '高级' },
    { key: 'push', label: '右移', editor: 'number', defaultValue: 0, group: '高级' },
    { key: 'pull', label: '左移', editor: 'number', defaultValue: 0, group: '高级' },
    { key: 'flex', label: 'flex', editor: 'string', defaultValue: '', group: '样式' },
  ],
};
