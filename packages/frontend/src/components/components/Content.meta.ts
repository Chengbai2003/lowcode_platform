import type { ComponentPanelConfig } from '../../types';

export const ContentMeta: ComponentPanelConfig = {
  componentType: 'Content',
  displayName: '布局内容区',
  category: 'layout',
  icon: 'layout-center',
  properties: [
    { key: 'children', label: '内容', editor: 'slot', defaultValue: 'Content', group: '基础' },
    { key: 'className', label: '类名', editor: 'string', defaultValue: '', group: '样式' },
    { key: 'style', label: '样式', editor: 'json', defaultValue: {}, group: '样式' },
  ],
};
