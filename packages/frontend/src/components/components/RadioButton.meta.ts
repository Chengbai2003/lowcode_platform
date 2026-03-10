import type { ComponentPanelConfig } from '../../types';

export const RadioButtonMeta: ComponentPanelConfig = {
  componentType: 'RadioButton',
  displayName: '单选按钮',
  category: 'form',
  icon: 'dot-circle',
  properties: [
    {
      key: 'children',
      label: '按钮文字',
      editor: 'string',
      defaultValue: '选项',

      group: '基础',
    },
    {
      key: 'value',
      label: '值',
      editor: 'string',
      defaultValue: 'option',

      group: '基础',
    },
    {
      key: 'disabled',
      label: '禁用',
      editor: 'expression',
      defaultValue: '',

      group: '基础',
    },
  ],
};
