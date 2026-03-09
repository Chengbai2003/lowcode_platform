import type { ComponentPanelConfig } from '../../types';

export const HeaderMeta: ComponentPanelConfig = {
  componentType: 'Header',
  displayName: '布局头部',
  category: 'layout',
  icon: 'layout-top',
  properties: [
    { key: 'children', label: '内容', editor: 'string', defaultValue: 'Header' },
    { key: 'className', label: '类名', editor: 'string', defaultValue: '', group: '样式' },
    { key: 'style', label: '样式', editor: 'json', defaultValue: {}, group: '样式' },
  ],
};
