import type { ComponentPanelConfig } from '../../types';

export const SkeletonMeta: ComponentPanelConfig = {
  componentType: 'Skeleton',
  displayName: '骨架屏',
  category: 'feedback',
  icon: 'layout',
  properties: [
    { key: 'loading', label: '加载中', editor: 'boolean', defaultValue: true },
    { key: 'active', label: '动画效果', editor: 'boolean', defaultValue: true },
    { key: 'round', label: '圆角', editor: 'boolean', defaultValue: false, group: '样式' },
    { key: 'avatar', label: '显示头像', editor: 'boolean', defaultValue: false, group: '高级' },
    { key: 'title', label: '显示标题', editor: 'boolean', defaultValue: true, group: '高级' },
    {
      key: 'paragraph',
      label: '段落配置',
      editor: 'json',
      defaultValue: { rows: 3 },
      group: '高级',
    },
  ],
};
