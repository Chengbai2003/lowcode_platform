import type { ComponentPanelConfig } from '../../types';

export const CardMeta: ComponentPanelConfig = {
  componentType: 'Card',
  displayName: '卡片',
  category: 'display',
  icon: 'card',
  properties: [
    { key: 'title', label: '标题', editor: 'string', defaultValue: '' },
    {
      key: 'extra',
      label: '右侧内容',
      editor: 'string',
      defaultValue: '',
      description: '通常放置操作按钮',
    },
    {
      key: 'hoverable',
      label: '悬浮阴影',
      editor: 'boolean',
      defaultValue: false,
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
    },
    {
      key: 'bordered',
      label: '显示边框',
      editor: 'boolean',
      defaultValue: true,
      group: '样式',
    },
    {
      key: 'type',
      label: '类型',
      editor: 'select',
      defaultValue: 'default',
      options: [
        { label: '默认', value: 'default' },
        { label: '内部卡片', value: 'inner' },
      ],
      group: '样式',
    },
  ],
};
