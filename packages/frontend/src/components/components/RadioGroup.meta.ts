import type { ComponentPanelConfig } from '../../types';

export const RadioGroupMeta: ComponentPanelConfig = {
  componentType: 'RadioGroup',
  displayName: '单选框组',
  category: 'form',
  icon: 'radio',
  properties: [
    {
      key: 'options',
      label: '选项配置',
      editor: 'json',
      defaultValue: [
        { label: '选项1', value: 'option1' },
        { label: '选项2', value: 'option2' },
      ],

      group: '基础',
    },
    {
      key: 'defaultValue',
      label: '默认值',
      editor: 'string',
      defaultValue: 'option1',

      group: '基础',
    },
    {
      key: 'disabled',
      label: '禁用',
      editor: 'expression',
      defaultValue: '',

      group: '基础',
    },
    {
      key: 'optionType',
      label: '选项样式',
      editor: 'select',
      defaultValue: 'default',
      options: [
        { label: '默认', value: 'default' },
        { label: '按钮', value: 'button' },
      ],
      group: '样式',
    },
    {
      key: 'buttonStyle',
      label: '按钮风格',
      editor: 'select',
      defaultValue: 'outline',
      options: [
        { label: '描边', value: 'outline' },
        { label: '实底', value: 'solid' },
      ],
      group: '样式',
      visible: (props) => props.optionType === 'button',
    },
  ],
};
