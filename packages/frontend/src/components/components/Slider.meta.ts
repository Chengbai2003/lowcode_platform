import type { ComponentPanelConfig } from '../../types';

export const SliderMeta: ComponentPanelConfig = {
  componentType: 'Slider',
  displayName: '滑块',
  category: 'form',
  icon: 'sliders',
  properties: [
    { key: 'min', label: '最小值', editor: 'number', defaultValue: 0 },
    { key: 'max', label: '最大值', editor: 'number', defaultValue: 100 },
    { key: 'step', label: '步长', editor: 'number', defaultValue: 1 },
    { key: 'defaultValue', label: '默认值', editor: 'number', defaultValue: 0 },
    { key: 'disabled', label: '禁用', editor: 'boolean', defaultValue: false },
    {
      key: 'vertical',
      label: '垂直方向',
      editor: 'boolean',
      defaultValue: false,
      group: '样式',
    },
    { key: 'range', label: '范围选择', editor: 'boolean', defaultValue: false, group: '高级' },
  ],
};
