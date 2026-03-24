import { A2UISchema } from '../types/schema.types';

export const LOGIN_FORM_FIXTURE: A2UISchema = {
  version: 1,
  rootId: 'page_root',
  components: {
    page_root: { id: 'page_root', type: 'Page', childrenIds: ['container_main'] },
    container_main: {
      id: 'container_main',
      type: 'Container',
      childrenIds: ['title_header', 'form_main', 'alert_footer'],
      props: { style: { padding: 24 } },
    },
    title_header: { id: 'title_header', type: 'Title', props: { children: '用户登录', level: 2 } },
    form_main: {
      id: 'form_main',
      type: 'Form',
      childrenIds: ['form_item_username', 'form_item_password', 'form_item_submit'],
      props: { layout: 'vertical' },
    },
    form_item_username: {
      id: 'form_item_username',
      type: 'FormItem',
      childrenIds: ['input_username'],
      props: { label: '用户名', name: 'username', required: true },
    },
    input_username: { id: 'input_username', type: 'Input', props: { placeholder: '请输入用户名' } },
    form_item_password: {
      id: 'form_item_password',
      type: 'FormItem',
      childrenIds: ['input_password'],
      props: { label: '密码', name: 'password', required: true },
    },
    input_password: {
      id: 'input_password',
      type: 'Input',
      props: { placeholder: '请输入密码', type: 'password' },
    },
    form_item_submit: { id: 'form_item_submit', type: 'FormItem', childrenIds: ['btn_submit'] },
    btn_submit: {
      id: 'btn_submit',
      type: 'Button',
      props: { children: '登录', type: 'primary', block: true },
      events: { onClick: [{ type: 'apiCall', url: '/api/login', method: 'POST' }] },
    },
    alert_footer: {
      id: 'alert_footer',
      type: 'Alert',
      props: { message: '请使用公司邮箱登录', type: 'info', showIcon: true },
    },
  },
};
