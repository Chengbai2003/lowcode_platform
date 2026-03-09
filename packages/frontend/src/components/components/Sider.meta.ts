import type { ComponentPanelConfig } from '../../types';

export const SiderMeta: ComponentPanelConfig = {
  componentType: 'Sider',
  displayName: '侧边栏',
  category: 'layout',
  icon: 'sidebar',
  properties: [
    { key: 'width', label: '宽度', editor: 'number', defaultValue: 200 },
    { key: 'collapsed', label: '折叠', editor: 'boolean', defaultValue: false },
    { key: 'collapsedWidth', label: '折叠宽度', editor: 'number', defaultValue: 80 },
    {
      key: 'theme',
      label: '主题',
      editor: 'select',
      defaultValue: 'dark',
      options: [
        { label: '深色', value: 'dark' },
        { label: '浅色', value: 'light' },
      ],
      group: '样式',
    },
    {
      key: 'breakpoint',
      label: '响应断点',
      editor: 'select',
      defaultValue: 'lg',
      options: [
        { label: 'xs', value: 'xs' },
        { label: 'sm', value: 'sm' },
        { label: 'md', value: 'md' },
        { label: 'lg', value: 'lg' },
        { label: 'xl', value: 'xl' },
        { label: 'xxl', value: 'xxl' },
      ],
      group: '高级',
    },
  ],
};
