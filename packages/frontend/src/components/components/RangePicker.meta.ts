import type { ComponentPanelConfig } from '../../types';

export const RangePickerMeta: ComponentPanelConfig = {
  componentType: 'RangePicker',
  displayName: '日期范围选择器',
  category: 'form',
  icon: 'calendar-range',
  properties: [
    {
      key: 'placeholder',
      label: '占位符',
      editor: 'json',
      defaultValue: ['开始日期', '结束日期'],
    },
    { key: 'disabled', label: '禁用', editor: 'boolean', defaultValue: false },
    { key: 'allowClear', label: '允许清除', editor: 'boolean', defaultValue: true },
    {
      key: 'picker',
      label: '选择类型',
      editor: 'select',
      defaultValue: 'date',
      options: [
        { label: '日期', value: 'date' },
        { label: '周', value: 'week' },
        { label: '月', value: 'month' },
        { label: '季度', value: 'quarter' },
        { label: '年', value: 'year' },
      ],
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
    { key: 'showTime', label: '显示时间', editor: 'boolean', defaultValue: false, group: '高级' },
    { key: 'separator', label: '分隔符', editor: 'string', defaultValue: '~', group: '样式' },
  ],
};
