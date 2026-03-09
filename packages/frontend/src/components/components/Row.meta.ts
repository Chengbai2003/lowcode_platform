import type { ComponentPanelConfig } from '../../types';

export const RowMeta: ComponentPanelConfig = {
  componentType: 'Row',
  displayName: '栅格行',
  category: 'layout',
  icon: 'columns',
  properties: [
    { key: 'gutter', label: '列间距', editor: 'number', defaultValue: 16 },
    {
      key: 'justify',
      label: '水平对齐',
      editor: 'select',
      defaultValue: 'start',
      options: [
        { label: '起点', value: 'start' },
        { label: '居中', value: 'center' },
        { label: '终点', value: 'end' },
        { label: '两端', value: 'space-between' },
        { label: '环绕', value: 'space-around' },
        { label: '均分', value: 'space-evenly' },
      ],
    },
    {
      key: 'align',
      label: '垂直对齐',
      editor: 'select',
      defaultValue: 'top',
      options: [
        { label: '顶部', value: 'top' },
        { label: '中部', value: 'middle' },
        { label: '底部', value: 'bottom' },
      ],
    },
    { key: 'wrap', label: '自动换行', editor: 'boolean', defaultValue: true },
  ],
};
