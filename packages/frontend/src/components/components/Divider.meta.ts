import type { ComponentPanelConfig } from '../../types';

export const DividerMeta: ComponentPanelConfig = {
  componentType: 'Divider',
  displayName: '分割线',
  category: 'layout',
  icon: 'divider',
  properties: [
    {
      key: 'type',
      label: '方向',
      editor: 'select',
      defaultValue: 'horizontal',
      options: [
        { label: '水平', value: 'horizontal' },
        { label: '垂直', value: 'vertical' },
      ],
    },
    {
      key: 'orientation',
      label: '标题位置',
      editor: 'select',
      defaultValue: 'center',
      options: [
        { label: '居中', value: 'center' },
        { label: '左对齐', value: 'left' },
        { label: '右对齐', value: 'right' },
      ],
      visible: (props) => props.type === 'horizontal',
    },
    { key: 'dashed', label: '虚线', editor: 'boolean', defaultValue: false },
    {
      key: 'plain',
      label: '朴素样式',
      editor: 'boolean',
      defaultValue: false,
      group: '样式',
    },
    {
      key: 'children',
      label: '标题文字',
      editor: 'string',
      defaultValue: '',
      group: '内容',
    },
  ],
};
