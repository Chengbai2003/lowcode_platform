import type { ComponentPanelConfig } from '../../types';

export const ModalMeta: ComponentPanelConfig = {
  componentType: 'Modal',
  displayName: '对话框',
  category: 'feedback',
  icon: 'message-square',
  properties: [
    {
      key: 'title',
      label: '标题',
      editor: 'string',
      defaultValue: '标题',

      group: '基础',
    },
    {
      key: 'open',
      label: '是否可见',
      editor: 'boolean',
      defaultValue: false,

      group: '基础',
    },
    {
      key: 'okText',
      label: '确认按钮文字',
      editor: 'string',
      defaultValue: '确定',
      group: '高级',
    },
    {
      key: 'cancelText',
      label: '取消按钮文字',
      editor: 'string',
      defaultValue: '取消',
      group: '高级',
    },
    {
      key: 'closable',
      label: '显示关闭按钮',
      editor: 'boolean',
      defaultValue: true,
      group: '高级',
    },
    {
      key: 'maskClosable',
      label: '点击遮罩关闭',
      editor: 'boolean',
      defaultValue: true,
      group: '高级',
    },
    {
      key: 'footer',
      label: '底部按钮',
      editor: 'boolean',
      defaultValue: true,
      group: '高级',
    },
  ],
};
