import type { ComponentPanelConfig } from '../../types';

export const FooterMeta: ComponentPanelConfig = {
  componentType: 'Footer',
  displayName: '布局底部',
  category: 'layout',
  icon: 'layout-bottom',
  properties: [
    { key: 'children', label: '内容', editor: 'string', defaultValue: 'Footer' },
    { key: 'className', label: '类名', editor: 'string', defaultValue: '', group: '样式' },
    { key: 'style', label: '样式', editor: 'json', defaultValue: {}, group: '样式' },
  ],
};
