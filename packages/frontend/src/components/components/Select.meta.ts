import type { ComponentPanelConfig } from '../../types';

export const SelectMeta: ComponentPanelConfig = {
  componentType: 'Select',
  displayName: '选择器',
  category: 'form',
  icon: 'select',
  properties: [
    {
      key: 'placeholder',
      label: '占位符',
      editor: 'string',
      defaultValue: '请选择',

      group: '基础',
    },
    {
      key: 'options',
      label: '选项列表',
      editor: 'json',
      defaultValue: [
        { label: '选项1', value: 'option1' },
        { label: '选项2', value: 'option2' },
      ],

      group: '基础',
    },
    {
      key: 'mode',
      label: '模式',
      editor: 'select',
      defaultValue: '',
      options: [
        { label: '单选', value: '' },
        { label: '多选', value: 'multiple' },
        { label: '标签', value: 'tags' },
      ],

      group: '基础',
    },
    {
      key: 'defaultValue',
      label: '默认值',
      editor: 'string',
      defaultValue: '',

      group: '基础',
    },
    { key: 'disabled', label: '禁用', editor: 'expression', defaultValue: '', group: '基础' },
    {
      key: 'allowClear',
      label: '允许清除',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
    {
      key: 'showSearch',
      label: '可搜索',
      editor: 'boolean',
      defaultValue: true,
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
