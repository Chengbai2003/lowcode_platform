/**
 * 登录页面模板
 */
import type { Template } from '../types';
import type { A2UISchema } from '../../../types/schema';

const schema: A2UISchema = {
  version: 1,
  rootId: 'page-login',
  components: {
    'page-login': {
      id: 'page-login',
      type: 'Page',
      props: {
        style: {
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          backgroundColor: '#f0f2f5',
        },
      },
      childrenIds: ['login-card'],
    },
    'login-card': {
      id: 'login-card',
      type: 'Card',
      props: {
        bordered: false,
        style: {
          width: '400px',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        },
      },
      childrenIds: ['login-header', 'login-form'],
    },
    'login-header': {
      id: 'login-header',
      type: 'Div',
      props: { style: { textAlign: 'center', marginBottom: '32px' } },
      childrenIds: ['login-title', 'login-sub'],
    },
    'login-title': {
      id: 'login-title',
      type: 'Title',
      props: { level: 2, children: 'A2UI 中台系统', style: { margin: '0 0 8px 0' } },
      childrenIds: [],
    },
    'login-sub': {
      id: 'login-sub',
      type: 'Text',
      props: { type: 'secondary', children: '高效的企业级数字底座' },
      childrenIds: [],
    },
    'login-form': {
      id: 'login-form',
      type: 'Form',
      props: { size: 'large' },
      events: {
        onFinish: [{ type: 'apiCall', url: '/api/login', method: 'POST' }],
      },
      childrenIds: ['item-user', 'item-pass', 'row-options', 'item-submit'],
    },
    'item-user': {
      id: 'item-user',
      type: 'FormItem',
      props: { name: 'username', rules: [{ required: true, message: '请输入工号' }] },
      childrenIds: ['input-user'],
    },
    'input-user': {
      id: 'input-user',
      type: 'Input',
      props: { placeholder: '请输入工号', allowClear: true },
      childrenIds: [],
    },
    'item-pass': {
      id: 'item-pass',
      type: 'FormItem',
      props: { name: 'password', rules: [{ required: true, message: '请输入密码' }] },
      childrenIds: ['input-pass'],
    },
    'input-pass': {
      id: 'input-pass',
      type: 'Input',
      props: { placeholder: '请输入密码', type: 'password' },
      childrenIds: [],
    },
    'row-options': {
      id: 'row-options',
      type: 'Row',
      props: { justify: 'space-between', align: 'middle', style: { marginBottom: '24px' } },
      childrenIds: ['col-rem', 'col-forgot'],
    },
    'col-rem': {
      id: 'col-rem',
      type: 'Col',
      props: {},
      childrenIds: ['item-rem'],
    },
    'item-rem': {
      id: 'item-rem',
      type: 'FormItem',
      props: { name: 'remember', valuePropName: 'checked', style: { margin: 0 } },
      childrenIds: ['check-rem'],
    },
    'check-rem': {
      id: 'check-rem',
      type: 'Checkbox',
      props: { children: '自动登录' },
      childrenIds: [],
    },
    'col-forgot': {
      id: 'col-forgot',
      type: 'Col',
      props: {},
      childrenIds: ['link-forgot'],
    },
    'link-forgot': {
      id: 'link-forgot',
      type: 'Link',
      props: { href: '#', children: '忘记密码？' },
      childrenIds: [],
    },
    'item-submit': {
      id: 'item-submit',
      type: 'FormItem',
      props: { style: { margin: 0 } },
      childrenIds: ['btn-submit'],
    },
    'btn-submit': {
      id: 'btn-submit',
      type: 'Button',
      props: { type: 'primary', htmlType: 'submit', block: true, children: '登 录' },
      childrenIds: [],
    },
  },
};

export const loginSimpleTemplate: Template = {
  id: 'login-simple',
  name: 'Simple Login',
  nameZh: '简单登录页',
  description: 'A clean and simple login page template',
  descriptionZh: '简洁的登录页面模板',
  category: 'login',
  tags: ['login', 'auth', 'form'],
  schema,
  examplePrompt:
    '创建一个简洁的登录页面，包含邮箱和密码输入框，有"记住我"复选框和"忘记密码"链接，提交按钮使用主题色。',
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
};
