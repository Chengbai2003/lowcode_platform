import type { ComponentPanelConfig } from '../../types';

export const AvatarMeta: ComponentPanelConfig = {
  componentType: 'Avatar',
  displayName: '头像',
  category: 'display',
  icon: 'user',
  properties: [
    { key: 'src', label: '图片地址', editor: 'string', defaultValue: '', group: '基础' },
    { key: 'size', label: '尺寸', editor: 'number', defaultValue: 40, group: '样式' },
  ],
};
