import type { ComponentPanelConfig } from '../../types';

export const InputNumberMeta: ComponentPanelConfig = {
  componentType: 'InputNumber',
  displayName: '数字输入框',
  category: 'form',
  icon: 'hash',
  properties: [
    {
      key: 'placeholder',
      label: '占位符',
      editor: 'string',
      defaultValue: '请输入数字',

      group: '基础',
    },
    {
      key: 'disabled',
      label: '禁用',
      editor: 'boolean',
      defaultValue: false,

      group: '基础',
    },
    {
      key: 'min',
      label: '最小值',
      editor: 'number',
      defaultValue: undefined,
      group: '高级',
    },
    {
      key: 'max',
      label: '最大值',
      editor: 'number',
      defaultValue: undefined,
      group: '高级',
    },
    {
      key: 'step',
      label: '步长',
      editor: 'number',
      defaultValue: 1,
      group: '高级',
    },
    {
      key: 'size',
      label: '尺寸',
      editor: 'select',
      defaultValue: 'middle',
      options: [
        { label: '大', value: 'large' },
        { label: '中', value: 'middle' },
        { label: '小', value: 'small' },
      ],
      group: '样式',
    },
  ],
};
