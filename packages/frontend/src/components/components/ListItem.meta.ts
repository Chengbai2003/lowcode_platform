import type { ComponentPanelConfig } from '../../types';

export const ListItemMeta: ComponentPanelConfig = {
  componentType: 'ListItem',
  displayName: '列表项',
  category: 'display',
  icon: 'list-item',
  properties: [
    { key: 'children', label: '内容', editor: 'slot', defaultValue: '列表项', group: '基础' },
    { key: 'extra', label: '额外内容', editor: 'string', defaultValue: '', group: '高级' },
    {
      key: 'actions',
      label: '操作区',
      editor: 'json',
      defaultValue: [],
      description: '例如 ["编辑", "删除"]',
      group: '高级',
    },
  ],
};
