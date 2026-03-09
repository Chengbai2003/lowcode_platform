import type { ComponentPanelConfig } from '../../types';

export const InputMeta: ComponentPanelConfig = {
  componentType: 'Input',
  displayName: '输入框',
  category: 'form',
  icon: 'text-input',
  properties: [
    { key: 'placeholder', label: '占位符', editor: 'string', defaultValue: '', group: '基础' },
    {
      key: 'defaultValue',
      label: '默认值',
      editor: 'string',
      defaultValue: '',

      group: '基础',
    },
    { key: 'disabled', label: '禁用', editor: 'boolean', defaultValue: false, group: '基础' },
    { key: 'readOnly', label: '只读', editor: 'boolean', defaultValue: false, group: '基础' },
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

      group: '基础',
    },
    {
      key: 'allowClear',
      label: '允许清除',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
    {
      key: 'bordered',
      label: '显示边框',
      editor: 'boolean',
      defaultValue: true,
      group: '样式',
    },
  ],
};
