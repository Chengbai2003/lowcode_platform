import type { ComponentPanelConfig } from '../../types';

export const LayoutMeta: ComponentPanelConfig = {
  componentType: 'Layout',
  displayName: '布局容器',
  category: 'layout',
  icon: 'layout',
  properties: [
    { key: 'hasSider', label: '包含侧边栏', editor: 'boolean', defaultValue: false, group: '基础' },
    {
      key: 'style',
      label: '容器样式',
      editor: 'json',
      defaultValue: { minHeight: '100%' },
      group: '样式',
    },
    { key: 'className', label: '类名', editor: 'string', defaultValue: '', group: '样式' },
  ],
};
