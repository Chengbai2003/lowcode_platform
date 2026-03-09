import type { ComponentPanelConfig } from '../../types';

export const TextAreaMeta: ComponentPanelConfig = {
  componentType: 'TextArea',
  displayName: '多行文本框',
  category: 'form',
  icon: 'align-left',
  properties: [
    {
      key: 'placeholder',
      label: '占位符',
      editor: 'string',
      defaultValue: '请输入内容',

      group: '基础',
    },
    {
      key: 'disabled',
      label: '禁用',
      editor: 'boolean',
      defaultValue: false,

      group: '基础',
    },
    {
      key: 'rows',
      label: '行数',
      editor: 'number',
      defaultValue: 4,
      group: '高级',
    },
    {
      key: 'allowClear',
      label: '显示清除按钮',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
    {
      key: 'maxLength',
      label: '最大长度',
      editor: 'number',
      defaultValue: undefined,
      group: '高级',
    },
    {
      key: 'autoSize',
      label: '自适应高度',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
  ],
};
