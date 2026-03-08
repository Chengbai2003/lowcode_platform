import type { ComponentPanelConfig } from '../../types';

export const AlertMeta: ComponentPanelConfig = {
  componentType: 'Alert',
  displayName: '警告提示',
  category: 'feedback',
  icon: 'alert-triangle',
  properties: [
    {
      key: 'message',
      label: '警告内容',
      editor: 'string',
      defaultValue: '警告提示',
    },
    {
      key: 'description',
      label: '辅助性文字',
      editor: 'string',
      defaultValue: '',
      group: '高级',
    },
    {
      key: 'type',
      label: '类型',
      editor: 'select',
      defaultValue: 'info',
      options: [
        { label: '信息', value: 'info' },
        { label: '成功', value: 'success' },
        { label: '警告', value: 'warning' },
        { label: '错误', value: 'error' },
      ],
      group: '样式',
    },
    {
      key: 'showIcon',
      label: '显示图标',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
    {
      key: 'closable',
      label: '可关闭',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
    {
      key: 'banner',
      label: ' banner 模式',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
  ],
};
