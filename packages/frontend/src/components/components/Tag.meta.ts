import type { ComponentPanelConfig } from '../../types';

export const TagMeta: ComponentPanelConfig = {
  componentType: 'Tag',
  displayName: '标签',
  category: 'display',
  icon: 'tag',
  properties: [
    { key: 'children', label: '文本', editor: 'string', defaultValue: '标签' },
    { key: 'color', label: '颜色', editor: 'string', defaultValue: '' },
    { key: 'bordered', label: '显示边框', editor: 'boolean', defaultValue: true, group: '样式' },
  ],
};
