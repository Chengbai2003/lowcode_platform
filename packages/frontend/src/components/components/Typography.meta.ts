import type { ComponentPanelConfig } from '../../types';

export const TypographyMeta: ComponentPanelConfig = {
  componentType: 'Typography',
  displayName: '排版',
  category: 'typography',
  icon: 'typography',
  properties: [
    {
      key: 'children',
      label: '内容',
      editor: 'slot',
      defaultValue: '排版内容',

      group: '基础',
    },
    {
      key: 'className',
      label: '类名',
      editor: 'string',
      defaultValue: '',
      group: '样式',
    },
    {
      key: 'style',
      label: '样式',
      editor: 'json',
      defaultValue: {},
      group: '样式',
    },
  ],
};
