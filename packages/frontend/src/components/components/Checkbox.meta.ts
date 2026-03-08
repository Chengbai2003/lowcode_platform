import type { ComponentPanelConfig } from '../../types';

export const CheckboxMeta: ComponentPanelConfig = {
  componentType: 'Checkbox',
  displayName: '复选框',
  category: 'form',
  icon: 'check-square',
  properties: [
    {
      key: 'children',
      label: '标签文字',
      editor: 'string',
      defaultValue: '复选框',
    },
    {
      key: 'checked',
      label: '选中状态',
      editor: 'boolean',
      defaultValue: false,
    },
    {
      key: 'disabled',
      label: '禁用',
      editor: 'boolean',
      defaultValue: false,
    },
    {
      key: 'indeterminate',
      label: '半选状态',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
  ],
};
