import type { A2UIComponent, A2UISchema } from '../../types/schema';

export function cloneSchema<T extends A2UISchema>(schema: T): T {
  return JSON.parse(JSON.stringify(schema)) as T;
}

export function createHiddenDataNode(id: string, initialValue: unknown): A2UIComponent {
  return {
    id,
    type: 'Div',
    props: {
      visible: false,
      initialValue,
    },
    childrenIds: [],
  };
}

export function createDefaultReactiveSchema(): A2UISchema {
  return {
    version: 1,
    rootId: 'defaultPage',
    components: {
      defaultPage: {
        id: 'defaultPage',
        type: 'Page',
        props: {
          style: {
            minHeight: '100vh',
            padding: '32px',
            backgroundColor: '#f5f7fb',
          },
        },
        childrenIds: ['welcomeCard'],
      },
      welcomeCard: {
        id: 'welcomeCard',
        type: 'Card',
        props: {
          bordered: false,
          style: {
            maxWidth: '720px',
            margin: '0 auto',
            borderRadius: '16px',
            boxShadow: '0 12px 40px rgba(15, 23, 42, 0.08)',
          },
        },
        childrenIds: [
          'welcomeTitle',
          'welcomeText',
          'welcomeForm',
          'welcomeSummary',
          'welcomeActions',
        ],
      },
      welcomeTitle: {
        id: 'welcomeTitle',
        type: 'Title',
        props: {
          level: 3,
          children: '{{ "你好，" + welcomeForm.name }}',
          style: { marginTop: 0, marginBottom: '8px' },
        },
        childrenIds: [],
      },
      welcomeText: {
        id: 'welcomeText',
        type: 'Text',
        props: {
          children:
            '{{ "当前正在以 " + welcomeForm.role + " 的身份预览默认页面，这个 Schema 已接入真实响应式数据。" }}',
          style: {
            display: 'block',
            marginBottom: '24px',
            color: '#475569',
          },
        },
        childrenIds: [],
      },
      welcomeForm: {
        id: 'welcomeForm',
        type: 'Form',
        props: {
          layout: 'vertical',
          initialValues: {
            name: 'A2UI',
            role: '产品经理',
          },
        },
        childrenIds: ['welcomeNameItem', 'welcomeRoleItem'],
      },
      welcomeNameItem: {
        id: 'welcomeNameItem',
        type: 'FormItem',
        props: {
          label: '页面名称',
          name: 'name',
        },
        childrenIds: ['welcomeNameInput'],
      },
      welcomeNameInput: {
        id: 'welcomeNameInput',
        type: 'Input',
        props: {
          placeholder: '输入页面名称体验实时联动',
        },
        childrenIds: [],
      },
      welcomeRoleItem: {
        id: 'welcomeRoleItem',
        type: 'FormItem',
        props: {
          label: '当前角色',
          name: 'role',
        },
        childrenIds: ['welcomeRoleSelect'],
      },
      welcomeRoleSelect: {
        id: 'welcomeRoleSelect',
        type: 'Select',
        props: {
          style: { width: '100%' },
          options: [
            { label: '产品经理', value: '产品经理' },
            { label: '运营主管', value: '运营主管' },
            { label: '审批专员', value: '审批专员' },
          ],
        },
        childrenIds: [],
      },
      welcomeSummary: {
        id: 'welcomeSummary',
        type: 'Alert',
        props: {
          type: 'info',
          showIcon: true,
          message: '{{ welcomeForm.name + " 已切换到 " + welcomeForm.role + " 模式" }}',
          style: { marginTop: '8px', marginBottom: '20px' },
        },
        childrenIds: [],
      },
      welcomeActions: {
        id: 'welcomeActions',
        type: 'Space',
        props: {
          wrap: true,
          size: 'middle',
        },
        childrenIds: ['presetOps', 'presetApproval', 'presetReset'],
      },
      presetOps: {
        id: 'presetOps',
        type: 'Button',
        props: {
          children: '切到运营看板',
        },
        events: {
          onClick: [
            {
              type: 'setValue',
              field: 'welcomeForm',
              value: {
                name: '运营总览',
                role: '运营主管',
              },
            },
          ],
        },
        childrenIds: [],
      },
      presetApproval: {
        id: 'presetApproval',
        type: 'Button',
        props: {
          type: 'primary',
          children: '切到审批页',
        },
        events: {
          onClick: [
            {
              type: 'setValue',
              field: 'welcomeForm',
              value: {
                name: '审批中心',
                role: '审批专员',
              },
            },
          ],
        },
        childrenIds: [],
      },
      presetReset: {
        id: 'presetReset',
        type: 'Button',
        props: {
          children: '恢复默认值',
        },
        events: {
          onClick: [
            {
              type: 'setValue',
              field: 'welcomeForm',
              value: {
                name: 'A2UI',
                role: '产品经理',
              },
            },
          ],
        },
        childrenIds: [],
      },
    },
  };
}
