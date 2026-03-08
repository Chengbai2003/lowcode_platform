/**
 * 用户个人中心模板
 */
import type { Template } from '../types';
import type { A2UISchema } from '../../../types/schema';

const schema: A2UISchema = {
  version: '1.0',
  metadata: {
    id: 'template-profile-user',
    name: 'User Profile',
    description: 'User profile page with settings',
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
  },
  rootId: 'page-1',
  components: {
    'page-1': {
      id: 'page-1',
      type: 'Page',
      props: {
        style: {
          padding: '24px',
          backgroundColor: '#f5f5f5',
          minHeight: '100vh',
        },
      },
      childrenIds: ['profile-header', 'profile-content'],
    },
    'profile-header': {
      id: 'profile-header',
      type: 'Card',
      props: {
        style: { marginBottom: '24px', borderRadius: '8px' },
      },
      childrenIds: ['header-content'],
    },
    'header-content': {
      id: 'header-content',
      type: 'Div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
        },
      },
      childrenIds: ['avatar', 'user-info'],
    },
    avatar: {
      id: 'avatar',
      type: 'Avatar',
      props: {
        size: 80,
        src: 'https://api.dicebear.com/7.x/avataaars/svg?seed=user',
      },
    },
    'user-info': {
      id: 'user-info',
      type: 'Div',
      props: {},
      childrenIds: ['user-name', 'user-email', 'user-role'],
    },
    'user-name': {
      id: 'user-name',
      type: 'Title',
      props: {
        level: 3,
        children: 'John Doe',
        style: { margin: 0 },
      },
    },
    'user-email': {
      id: 'user-email',
      type: 'Text',
      props: {
        children: 'john.doe@example.com',
        style: { color: '#666' },
      },
    },
    'user-role': {
      id: 'user-role',
      type: 'Tag',
      props: {
        color: 'blue',
        children: 'Administrator',
      },
    },
    'profile-content': {
      id: 'profile-content',
      type: 'Row',
      props: {
        gutter: 24,
      },
      childrenIds: ['left-col', 'right-col'],
    },
    'left-col': {
      id: 'left-col',
      type: 'Col',
      props: { span: 8 },
      childrenIds: ['menu-card'],
    },
    'menu-card': {
      id: 'menu-card',
      type: 'Card',
      props: {
        title: 'Settings',
        style: { borderRadius: '8px' },
      },
      childrenIds: ['menu-list'],
    },
    'menu-list': {
      id: 'menu-list',
      type: 'Menu',
      props: {
        mode: 'inline',
        selectedKeys: ['profile'],
        items: [
          { key: 'profile', label: 'Profile Information' },
          { key: 'security', label: 'Security' },
          { key: 'notifications', label: 'Notifications' },
          { key: 'preferences', label: 'Preferences' },
        ],
      },
    },
    'right-col': {
      id: 'right-col',
      type: 'Col',
      props: { span: 16 },
      childrenIds: ['info-card'],
    },
    'info-card': {
      id: 'info-card',
      type: 'Card',
      props: {
        title: 'Profile Information',
        style: { borderRadius: '8px' },
      },
      childrenIds: ['info-form'],
    },
    'info-form': {
      id: 'info-form',
      type: 'Form',
      props: {
        layout: 'vertical',
      },
      childrenIds: ['form-row-1', 'form-row-2', 'form-row-3', 'save-btn'],
    },
    'form-row-1': {
      id: 'form-row-1',
      type: 'Row',
      props: { gutter: 16 },
      childrenIds: ['first-name-col', 'last-name-col'],
    },
    'first-name-col': {
      id: 'first-name-col',
      type: 'Col',
      props: { span: 12 },
      childrenIds: ['first-name-item'],
    },
    'first-name-item': {
      id: 'first-name-item',
      type: 'FormItem',
      props: { label: 'First Name', name: 'firstName' },
      childrenIds: ['first-name-input'],
    },
    'first-name-input': {
      id: 'first-name-input',
      type: 'Input',
      props: { defaultValue: 'John' },
    },
    'last-name-col': {
      id: 'last-name-col',
      type: 'Col',
      props: { span: 12 },
      childrenIds: ['last-name-item'],
    },
    'last-name-item': {
      id: 'last-name-item',
      type: 'FormItem',
      props: { label: 'Last Name', name: 'lastName' },
      childrenIds: ['last-name-input'],
    },
    'last-name-input': {
      id: 'last-name-input',
      type: 'Input',
      props: { defaultValue: 'Doe' },
    },
    'form-row-2': {
      id: 'form-row-2',
      type: 'FormItem',
      props: { label: 'Email', name: 'email' },
      childrenIds: ['email-input'],
    },
    'email-input': {
      id: 'email-input',
      type: 'Input',
      props: { defaultValue: 'john.doe@example.com' },
    },
    'form-row-3': {
      id: 'form-row-3',
      type: 'FormItem',
      props: { label: 'Bio', name: 'bio' },
      childrenIds: ['bio-input'],
    },
    'bio-input': {
      id: 'bio-input',
      type: 'TextArea',
      props: {
        rows: 4,
        placeholder: 'Tell us about yourself...',
      },
    },
    'save-btn': {
      id: 'save-btn',
      type: 'Button',
      props: {
        type: 'primary',
        children: 'Save Changes',
        style: { marginTop: '16px' },
      },
    },
  },
};

export const profileUserTemplate: Template = {
  id: 'profile-user',
  name: 'User Profile',
  nameZh: '用户中心',
  description: 'User profile page with avatar, info and settings menu',
  descriptionZh: '包含头像、信息和设置菜单的用户中心页面',
  category: 'profile',
  tags: ['profile', 'user', 'settings', 'account'],
  schema,
  examplePrompt:
    '创建一个用户个人中心页面，顶部卡片展示头像、姓名、邮箱和角色标签，下方左侧是设置菜单（个人信息、安全、通知、偏好），右侧是对应的表单内容。',
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
};
