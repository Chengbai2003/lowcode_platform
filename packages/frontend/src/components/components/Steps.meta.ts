import type { ComponentPanelConfig } from '../../types';

export const StepsMeta: ComponentPanelConfig = {
  componentType: 'Steps',
  displayName: '步骤条',
  category: 'display',
  icon: 'list-ordered',
  properties: [
    { key: 'current', label: '当前步骤', editor: 'number', defaultValue: 0, group: '基础' },
    {
      key: 'direction',
      label: '方向',
      editor: 'select',
      defaultValue: 'horizontal',
      options: [
        { label: '水平', value: 'horizontal' },
        { label: '垂直', value: 'vertical' },
      ],
      group: '样式',
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
    {
      key: 'status',
      label: '状态',
      editor: 'select',
      defaultValue: 'process',
      options: [
        { label: '等待', value: 'wait' },
        { label: '进行中', value: 'process' },
        { label: '完成', value: 'finish' },
        { label: '错误', value: 'error' },
      ],
      group: '高级',
    },
    { key: 'responsive', label: '响应式', editor: 'boolean', defaultValue: true, group: '高级' },
    {
      key: 'labelPlacement',
      label: '标题位置',
      editor: 'select',
      defaultValue: 'horizontal',
      options: [
        { label: '水平', value: 'horizontal' },
        { label: '垂直', value: 'vertical' },
      ],
      group: '高级',
    },
  ],
};
