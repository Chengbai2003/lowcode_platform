/**
 * 登录页面模板
 */
import type { Template } from '../types';
import type { A2UISchema } from '../../../types/schema';

const schema: A2UISchema = {
  version: 1,
  rootId: 'page-1',
  components: {
    'page-1': {
      id: 'page-1',
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
        style: {
          width: '400px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      },
      childrenIds: ['login-header', 'login-form'],
    },
    'login-header': {
      id: 'login-header',
      type: 'Div',
      props: {
        style: {
          textAlign: 'center',
          marginBottom: '24px',
        },
      },
      childrenIds: ['login-title', 'login-subtitle'],
    },
    'login-title': {
      id: 'login-title',
      type: 'Title',
      props: {
        level: 2,
        children: 'Welcome Back',
        style: { margin: 0, color: '#1a1a1a' },
      },
    },
    'login-subtitle': {
      id: 'login-subtitle',
      type: 'Text',
      props: {
        children: 'Please sign in to continue',
        style: { color: '#666', marginTop: '8px' },
      },
    },
    'login-form': {
      id: 'login-form',
      type: 'Form',
      props: {
        layout: 'vertical',
        style: { width: '100%' },
      },
      childrenIds: ['email-item', 'password-item', 'remember-row', 'submit-btn'],
    },
    'email-item': {
      id: 'email-item',
      type: 'FormItem',
      props: {
        label: 'Email',
        name: 'email',
        rules: [{ required: true, message: 'Please input your email!' }],
      },
      childrenIds: ['email-input'],
    },
    'email-input': {
      id: 'email-input',
      type: 'Input',
      props: {
        placeholder: 'Enter your email',
        size: 'large',
      },
    },
    'password-item': {
      id: 'password-item',
      type: 'FormItem',
      props: {
        label: 'Password',
        name: 'password',
        rules: [{ required: true, message: 'Please input your password!' }],
      },
      childrenIds: ['password-input'],
    },
    'password-input': {
      id: 'password-input',
      type: 'InputPassword',
      props: {
        placeholder: 'Enter your password',
        size: 'large',
      },
    },
    'remember-row': {
      id: 'remember-row',
      type: 'Div',
      props: {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        },
      },
      childrenIds: ['remember-checkbox', 'forgot-link'],
    },
    'remember-checkbox': {
      id: 'remember-checkbox',
      type: 'Checkbox',
      props: {
        children: 'Remember me',
      },
    },
    'forgot-link': {
      id: 'forgot-link',
      type: 'Link',
      props: {
        href: '/forgot-password',
        children: 'Forgot password?',
      },
    },
    'submit-btn': {
      id: 'submit-btn',
      type: 'Button',
      props: {
        type: 'primary',
        htmlType: 'submit',
        size: 'large',
        block: true,
        children: 'Sign In',
      },
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
