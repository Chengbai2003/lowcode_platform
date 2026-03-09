import type { ComponentPanelConfig } from '../../types';

export const ContainerMeta: ComponentPanelConfig = {
  componentType: 'Container',
  displayName: '容器',
  category: 'layout',
  icon: 'box',
  properties: [
    {
      key: 'width',
      label: '宽度',
      editor: 'select',
      defaultValue: 'full',
      options: [
        { label: 'XS', value: 'xs' },
        { label: 'SM', value: 'sm' },
        { label: 'MD', value: 'md' },
        { label: 'LG', value: 'lg' },
        { label: 'XL', value: 'xl' },
        { label: '全宽', value: 'full' },
      ],
    },
    { key: 'padding', label: '内边距', editor: 'string', defaultValue: '16px' },
    { key: 'center', label: '居中', editor: 'boolean', defaultValue: true },
    {
      key: 'className',
      label: '类名',
      editor: 'string',
      defaultValue: '',
      group: '高级',
    },
    {
      key: 'style',
      label: '内联样式',
      editor: 'json',
      defaultValue: {},
      group: '样式',
    },
  ],
};
