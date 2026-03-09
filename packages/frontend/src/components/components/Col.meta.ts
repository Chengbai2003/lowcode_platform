import type { ComponentPanelConfig } from '../../types';

export const ColMeta: ComponentPanelConfig = {
  componentType: 'Col',
  displayName: '栅格列',
  category: 'layout',
  icon: 'column-width',
  properties: [
    { key: 'span', label: '列宽(span)', editor: 'number', defaultValue: 24, group: '基础' },
    { key: 'offset', label: '左偏移', editor: 'number', defaultValue: 0, group: '基础' },
    { key: 'xs', label: 'XS', editor: 'number', defaultValue: undefined, group: '样式' },
    { key: 'sm', label: 'SM', editor: 'number', defaultValue: undefined, group: '样式' },
    { key: 'md', label: 'MD', editor: 'number', defaultValue: undefined, group: '样式' },
    { key: 'lg', label: 'LG', editor: 'number', defaultValue: undefined, group: '样式' },
    { key: 'xl', label: 'XL', editor: 'number', defaultValue: undefined, group: '样式' },
    { key: 'xxl', label: 'XXL', editor: 'number', defaultValue: undefined, group: '样式' },
    { key: 'order', label: '排序', editor: 'number', defaultValue: 0, group: '高级' },
    { key: 'push', label: '右移', editor: 'number', defaultValue: 0, group: '高级' },
    { key: 'pull', label: '左移', editor: 'number', defaultValue: 0, group: '高级' },
    { key: 'flex', label: 'flex', editor: 'string', defaultValue: '', group: '样式' },
    { key: 'className', label: '类名', editor: 'string', defaultValue: '', group: '样式' },
    { key: 'style', label: '样式', editor: 'json', defaultValue: {}, group: '样式' },
  ],
};
