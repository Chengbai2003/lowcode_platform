import type { ComponentPanelConfig } from '../../types';

export const DivMeta: ComponentPanelConfig = {
  componentType: 'Div',
  displayName: '原生容器',
  category: 'layout',
  icon: 'square',
  properties: [
    { key: 'id', label: 'ID', editor: 'string', defaultValue: '' },
    { key: 'className', label: '类名', editor: 'string', defaultValue: '' },
    { key: 'children', label: '内容', editor: 'string', defaultValue: '' },
    { key: 'style', label: '内联样式', editor: 'json', defaultValue: {}, group: '样式' },
  ],
};
