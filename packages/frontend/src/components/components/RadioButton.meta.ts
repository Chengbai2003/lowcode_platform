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
    },
    {
      key: 'value',
      label: '值',
      editor: 'string',
      defaultValue: 'option',
    },
    {
      key: 'disabled',
      label: '禁用',
      editor: 'boolean',
      defaultValue: false,
    },
  ],
};
