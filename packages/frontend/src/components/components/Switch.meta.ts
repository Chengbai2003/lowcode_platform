import type { ComponentPanelConfig } from '../../types';

export const SwitchMeta: ComponentPanelConfig = {
  componentType: 'Switch',
  displayName: '开关',
  category: 'form',
  icon: 'toggle-left',
  properties: [
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
      key: 'checkedChildren',
      label: '选中时文字',
      editor: 'string',
      defaultValue: '',
      group: '高级',
    },
    {
      key: 'unCheckedChildren',
      label: '未选中时文字',
      editor: 'string',
      defaultValue: '',
      group: '高级',
    },
    {
      key: 'size',
      label: '尺寸',
      editor: 'select',
      defaultValue: 'default',
      options: [
        { label: '默认', value: 'default' },
        { label: '小', value: 'small' },
      ],
      group: '样式',
    },
  ],
};
