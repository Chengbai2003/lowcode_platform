import type { ComponentPanelConfig } from '../../types';

export const SpinMeta: ComponentPanelConfig = {
  componentType: 'Spin',
  displayName: '加载中',
  category: 'feedback',
  icon: 'loader',
  properties: [
    { key: 'spinning', label: '是否加载', editor: 'boolean', defaultValue: true, group: '基础' },
    { key: 'tip', label: '提示文本', editor: 'string', defaultValue: '加载中...', group: '基础' },
    {
      key: 'size',
      label: '尺寸',
      editor: 'select',
      defaultValue: 'default',
      options: [
        { label: '小', value: 'small' },
        { label: '默认', value: 'default' },
        { label: '大', value: 'large' },
      ],
      group: '样式',
    },
    { key: 'delay', label: '延迟显示(ms)', editor: 'number', defaultValue: 0, group: '高级' },
  ],
};
