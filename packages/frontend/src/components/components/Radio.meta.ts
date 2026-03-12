import type { ComponentPanelConfig } from '../../types';

export const RadioMeta: ComponentPanelConfig = {
  componentType: 'Radio',
  displayName: '单选框',
  category: 'form',
  icon: 'radio',
  properties: [
    {
      key: 'children',
      label: '标签文字',
      editor: 'string',
      defaultValue: '单选框',

      group: '基础',
    },
    {
      key: 'checked',
      label: '选中状态',
      editor: 'boolean',
      defaultValue: false,

      group: '基础',
    },
    {
      key: 'disabled',
      label: '禁用',
      editor: 'expression',
      defaultValue: '',

      group: '基础',
    },
    {
      key: 'value',
      label: '值',
      editor: 'string',
      defaultValue: 'radio1',
      group: '高级',
    },
  ],
};
