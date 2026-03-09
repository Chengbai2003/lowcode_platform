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
      key: 'rules',
      label: '校验规则',
      editor: 'json',
      defaultValue: [],
      description: '例如 [{ required: true, message: "请输入内容" }]',
      group: '基础',
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
      key: 'validateTrigger',
      label: '校验触发时机',
      editor: 'select',
      defaultValue: 'onChange',
      options: [
        { label: '值变更', value: 'onChange' },
        { label: '失焦', value: 'onBlur' },
        { label: '提交', value: 'onSubmit' },
      ],
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
    {
      key: 'labelCol',
      label: '标签布局',
      editor: 'json',
      defaultValue: undefined,
      group: '高级',
    },
    {
      key: 'wrapperCol',
      label: '控件布局',
      editor: 'json',
      defaultValue: undefined,
      group: '高级',
    },
  ],
};
