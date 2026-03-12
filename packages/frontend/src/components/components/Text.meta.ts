import type { ComponentPanelConfig } from '../../types';

export const TextMeta: ComponentPanelConfig = {
  componentType: 'Text',
  displayName: '文本',
  category: 'typography',
  icon: 'text',
  properties: [
    {
      key: 'children',
      label: '文本内容',
      editor: 'slot',
      defaultValue: '文本内容',

      group: '基础',
    },
    {
      key: 'type',
      label: '文本类型',
      editor: 'select',
      defaultValue: 'secondary',
      options: [
        { label: '默认', value: 'default' },
        { label: '次要', value: 'secondary' },
        { label: '警告', value: 'warning' },
        { label: '危险', value: 'danger' },
      ],

      group: '基础',
    },
    { key: 'strong', label: '粗体', editor: 'boolean', defaultValue: false, group: '基础' },
    {
      key: 'mark',
      label: '标记',
      editor: 'boolean',
      defaultValue: false,
      group: '样式',
    },
    {
      key: 'code',
      label: '代码',
      editor: 'boolean',
      defaultValue: false,
      group: '样式',
    },
    {
      key: 'copyable',
      label: '可复制',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
    {
      key: 'ellipsis',
      label: '省略',
      editor: 'boolean',
      defaultValue: false,
      group: '样式',
    },
  ],
};
