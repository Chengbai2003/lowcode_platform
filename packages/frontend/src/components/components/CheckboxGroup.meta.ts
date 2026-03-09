import type { ComponentPanelConfig } from '../../types';

export const CheckboxGroupMeta: ComponentPanelConfig = {
  componentType: 'CheckboxGroup',
  displayName: '复选框组',
  category: 'form',
  icon: 'check-square',
  properties: [
    {
      key: 'options',
      label: '选项配置',
      editor: 'json',
      defaultValue: [
        { label: '选项1', value: 'option1' },
        { label: '选项2', value: 'option2' },
      ],
    },
    {
      key: 'defaultValue',
      label: '默认值',
      editor: 'json',
      defaultValue: [],
    },
    {
      key: 'disabled',
      label: '禁用',
      editor: 'boolean',
      defaultValue: false,
    },
    {
      key: 'name',
      label: '字段名',
      editor: 'string',
      defaultValue: '',
      group: '高级',
    },
  ],
};
