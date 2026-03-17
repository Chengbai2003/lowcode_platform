/**
 * 用户个人中心模板
 */
import type { Template } from '../types';
import type { A2UISchema } from '../../../types/schema';

const schema: A2UISchema = {
  version: 1,
  rootId: 'page-profile',
  components: {
    'page-profile': {
      id: 'page-profile',
      type: 'Page',
      props: {
        style: { padding: '24px', backgroundColor: '#f0f2f5', minHeight: '100vh' },
      },
      childrenIds: ['profile-row'],
    },
    'profile-row': {
      id: 'profile-row',
      type: 'Row',
      props: { gutter: [24, 24] },
      childrenIds: ['col-avatar', 'col-settings'],
    },
    'col-avatar': {
      id: 'col-avatar',
      type: 'Col',
      props: { span: 8 },
      childrenIds: ['card-avatar'],
    },
    'card-avatar': {
      id: 'card-avatar',
      type: 'Card',
      props: {
        bordered: false,
        style: {
          borderRadius: '8px',
          boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)',
          textAlign: 'center',
          paddingTop: '24px',
        },
      },
      childrenIds: ['space-avatar'],
    },
    'space-avatar': {
      id: 'space-avatar',
      type: 'Space',
      props: { direction: 'vertical', size: 'middle', align: 'center', style: { width: '100%' } },
      childrenIds: ['user-avatar', 'user-name', 'user-role', 'divider-1', 'user-desc'],
    },
    'user-avatar': {
      id: 'user-avatar',
      type: 'Avatar',
      props: {
        size: 104,
        src: 'https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png',
      },
      childrenIds: [],
    },
    'user-name': {
      id: 'user-name',
      type: 'Title',
      props: { level: 4, children: '{{ profileForm.nickname }}', style: { margin: 0 } },
      childrenIds: [],
    },
    'user-role': {
      id: 'user-role',
      type: 'Text',
      props: {
        type: 'secondary',
        children:
          '{{ profileForm.department === "dev" ? "研发部" : profileForm.department === "pm" ? "产品部" : "未设置部门" }}',
      },
      childrenIds: [],
    },
    'divider-1': {
      id: 'divider-1',
      type: 'Divider',
      props: { dashed: true },
      childrenIds: [],
    },
    'user-desc': {
      id: 'user-desc',
      type: 'Text',
      props: { children: '{{ profileForm.bio }}' },
      childrenIds: [],
    },
    'col-settings': {
      id: 'col-settings',
      type: 'Col',
      props: { span: 16 },
      childrenIds: ['card-settings'],
    },
    'card-settings': {
      id: 'card-settings',
      type: 'Card',
      props: {
        title: '基本设置',
        bordered: false,
        style: { borderRadius: '8px', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' },
      },
      childrenIds: ['profileForm'],
    },
    profileForm: {
      id: 'profileForm',
      type: 'Form',
      props: {
        layout: 'vertical',
        initialValues: {
          email: 'admin@a2ui.dev',
          nickname: '管理员',
          phone: '138-0000-0000',
          department: 'dev',
          bio: '负责 A2UI 平台的研发架构与组件体系建设。',
        },
      },
      events: {
        onFinish: [{ type: 'apiCall', url: '/api/user/update', method: 'POST' }],
      },
      childrenIds: ['form-row-1', 'form-row-2', 'item-bio', 'form-row-action'],
    },
    'form-row-1': {
      id: 'form-row-1',
      type: 'Row',
      props: { gutter: 24 },
      childrenIds: ['col-email', 'col-name'],
    },
    'col-email': {
      id: 'col-email',
      type: 'Col',
      props: { span: 12 },
      childrenIds: ['item-email'],
    },
    'item-email': {
      id: 'item-email',
      type: 'FormItem',
      props: { label: '邮箱', name: 'email', rules: [{ required: true, type: 'email' }] },
      childrenIds: ['input-email'],
    },
    'input-email': {
      id: 'input-email',
      type: 'Input',
      props: { placeholder: 'admin@a2ui.dev' },
      childrenIds: [],
    },
    'col-name': {
      id: 'col-name',
      type: 'Col',
      props: { span: 12 },
      childrenIds: ['item-nickname'],
    },
    'item-nickname': {
      id: 'item-nickname',
      type: 'FormItem',
      props: { label: '昵称', name: 'nickname', rules: [{ required: true }] },
      childrenIds: ['input-nickname'],
    },
    'input-nickname': {
      id: 'input-nickname',
      type: 'Input',
      props: { placeholder: '请输入昵称' },
      childrenIds: [],
    },
    'form-row-2': {
      id: 'form-row-2',
      type: 'Row',
      props: { gutter: 24 },
      childrenIds: ['col-phone', 'col-dept'],
    },
    'col-phone': {
      id: 'col-phone',
      type: 'Col',
      props: { span: 12 },
      childrenIds: ['item-phone'],
    },
    'item-phone': {
      id: 'item-phone',
      type: 'FormItem',
      props: { label: '联系电话', name: 'phone' },
      childrenIds: ['input-phone'],
    },
    'input-phone': {
      id: 'input-phone',
      type: 'Input',
      props: { placeholder: '138-xxxx-xxxx' },
      childrenIds: [],
    },
    'col-dept': {
      id: 'col-dept',
      type: 'Col',
      props: { span: 12 },
      childrenIds: ['item-dept'],
    },
    'item-dept': {
      id: 'item-dept',
      type: 'FormItem',
      props: { label: '所属部门', name: 'department' },
      childrenIds: ['select-dept'],
    },
    'select-dept': {
      id: 'select-dept',
      type: 'Select',
      props: {
        placeholder: '请选择部门',
        style: { width: '100%' },
        options: [
          { label: '研发部', value: 'dev' },
          { label: '产品部', value: 'pm' },
        ],
      },
      childrenIds: [],
    },
    'item-bio': {
      id: 'item-bio',
      type: 'FormItem',
      props: { label: '个人简介', name: 'bio' },
      childrenIds: ['textarea-bio'],
    },
    'textarea-bio': {
      id: 'textarea-bio',
      type: 'TextArea',
      props: { placeholder: '简单介绍一下自己...', rows: 4 },
      childrenIds: [],
    },
    'form-row-action': {
      id: 'form-row-action',
      type: 'Row',
      props: { style: { marginTop: '16px' } },
      childrenIds: ['col-action'],
    },
    'col-action': {
      id: 'col-action',
      type: 'Col',
      props: { span: 24 },
      childrenIds: ['item-submit'],
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
      props: { type: 'primary', htmlType: 'submit', children: '更新基本信息' },
      childrenIds: [],
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
