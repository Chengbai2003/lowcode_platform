import type { ComponentPanelConfig } from '../../types';

export const StepMeta: ComponentPanelConfig = {
  componentType: 'Step',
  displayName: '步骤项',
  category: 'display',
  icon: 'list-item',
  properties: [
    { key: 'title', label: '标题', editor: 'string', defaultValue: '步骤标题', group: '基础' },
    { key: 'description', label: '描述', editor: 'string', defaultValue: '', group: '基础' },
    { key: 'subTitle', label: '副标题', editor: 'string', defaultValue: '', group: '高级' },
    {
      key: 'status',
      label: '状态',
      editor: 'select',
      defaultValue: 'wait',
      options: [
        { label: '等待', value: 'wait' },
        { label: '进行中', value: 'process' },
        { label: '完成', value: 'finish' },
        { label: '错误', value: 'error' },
      ],

      group: '基础',
    },
    { key: 'disabled', label: '禁用', editor: 'boolean', defaultValue: false, group: '基础' },
  ],
};
