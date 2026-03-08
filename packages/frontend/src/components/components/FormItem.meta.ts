import type { ComponentPanelConfig } from '../../types';

export const FormItemMeta: ComponentPanelConfig = {
  componentType: 'FormItem',
  displayName: '表单项',
  category: 'form',
  icon: 'list',
  properties: [
    {
      key: 'label',
      label: '标签',
      editor: 'string',
      defaultValue: '标签',
    },
    {
      key: 'name',
      label: '字段名',
      editor: 'string',
      defaultValue: 'field',
    },
    {
      key: 'required',
      label: '必填',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
    {
      key: 'hasFeedback',
      label: '显示反馈图标',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
    {
      key: 'help',
      label: '帮助信息',
      editor: 'string',
      defaultValue: '',
      group: '高级',
    },
    {
      key: 'extra',
      label: '额外说明',
      editor: 'string',
      defaultValue: '',
      group: '高级',
    },
  ],
};
