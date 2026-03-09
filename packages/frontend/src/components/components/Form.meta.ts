import type { ComponentPanelConfig } from '../../types';

export const FormMeta: ComponentPanelConfig = {
  componentType: 'Form',
  displayName: '表单',
  category: 'form',
  icon: 'edit',
  properties: [
    {
      key: 'layout',
      label: '布局',
      editor: 'select',
      defaultValue: 'horizontal',
      options: [
        { label: '水平', value: 'horizontal' },
        { label: '垂直', value: 'vertical' },
        { label: '内联', value: 'inline' },
      ],
      group: '样式',
    },
    {
      key: 'labelCol',
      label: '标签布局',
      editor: 'json',
      defaultValue: { span: 6 },
      group: '高级',
    },
    {
      key: 'wrapperCol',
      label: '控件布局',
      editor: 'json',
      defaultValue: { span: 18 },
      group: '高级',
    },
    {
      key: 'labelAlign',
      label: '标签对齐',
      editor: 'select',
      defaultValue: 'right',
      options: [
        { label: '左', value: 'left' },
        { label: '右', value: 'right' },
      ],
      group: '样式',
    },
    {
      key: 'size',
      label: '尺寸',
      editor: 'select',
      defaultValue: 'middle',
      options: [
        { label: '默认', value: 'middle' },
        { label: '小', value: 'small' },
        { label: '大', value: 'large' },
      ],
      group: '样式',
    },
    {
      key: 'colon',
      label: '显示冒号',
      editor: 'boolean',
      defaultValue: true,
      group: '高级',
    },
  ],
};
