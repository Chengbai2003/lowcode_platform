/**
 * 联系表单模板
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
          padding: '40px',
          maxWidth: '800px',
          margin: '0 auto',
        },
      },
      childrenIds: ['form-header', 'contact-form'],
    },
    'form-header': {
      id: 'form-header',
      type: 'Div',
      props: {
        style: { marginBottom: '32px', textAlign: 'center' },
      },
      childrenIds: ['form-title', 'form-desc'],
    },
    'form-title': {
      id: 'form-title',
      type: 'Title',
      props: {
        level: 2,
        children: 'Contact Us',
        style: { margin: 0 },
      },
    },
    'form-desc': {
      id: 'form-desc',
      type: 'Text',
      props: {
        children: 'Have a question? We would love to hear from you.',
        style: { color: '#666', marginTop: '8px' },
      },
    },
    'contact-form': {
      id: 'contact-form',
      type: 'Form',
      props: {
        layout: 'vertical',
      },
      childrenIds: ['name-row', 'email-row', 'subject-row', 'message-row', 'submit-row'],
    },
    'name-row': {
      id: 'name-row',
      type: 'FormItem',
      props: {
        label: 'Full Name',
        name: 'name',
        rules: [{ required: true, message: 'Please enter your name' }],
      },
      childrenIds: ['name-input'],
    },
    'name-input': {
      id: 'name-input',
      type: 'Input',
      props: {
        placeholder: 'John Doe',
        size: 'large',
      },
    },
    'email-row': {
      id: 'email-row',
      type: 'FormItem',
      props: {
        label: 'Email Address',
        name: 'email',
        rules: [
          { required: true, message: 'Please enter your email' },
          { type: 'email', message: 'Please enter a valid email' },
        ],
      },
      childrenIds: ['email-input'],
    },
    'email-input': {
      id: 'email-input',
      type: 'Input',
      props: {
        placeholder: 'john@example.com',
        size: 'large',
      },
    },
    'subject-row': {
      id: 'subject-row',
      type: 'FormItem',
      props: {
        label: 'Subject',
        name: 'subject',
        rules: [{ required: true, message: 'Please enter a subject' }],
      },
      childrenIds: ['subject-input'],
    },
    'subject-input': {
      id: 'subject-input',
      type: 'Input',
      props: {
        placeholder: 'How can we help?',
        size: 'large',
      },
    },
    'message-row': {
      id: 'message-row',
      type: 'FormItem',
      props: {
        label: 'Message',
        name: 'message',
        rules: [{ required: true, message: 'Please enter your message' }],
      },
      childrenIds: ['message-input'],
    },
    'message-input': {
      id: 'message-input',
      type: 'TextArea',
      props: {
        placeholder: 'Tell us more about your inquiry...',
        rows: 6,
      },
    },
    'submit-row': {
      id: 'submit-row',
      type: 'Div',
      props: {
        style: { marginTop: '24px' },
      },
      childrenIds: ['submit-btn', 'reset-btn'],
    },
    'submit-btn': {
      id: 'submit-btn',
      type: 'Button',
      props: {
        type: 'primary',
        htmlType: 'submit',
        size: 'large',
        children: 'Send Message',
        style: { marginRight: '12px' },
      },
    },
    'reset-btn': {
      id: 'reset-btn',
      type: 'Button',
      props: {
        size: 'large',
        children: 'Reset',
      },
    },
  },
};

export const formContactTemplate: Template = {
  id: 'form-contact',
  name: 'Contact Form',
  nameZh: '联系表单',
  description: 'A contact form with name, email, subject and message fields',
  descriptionZh: '包含姓名、邮箱、主题和消息字段的联系表单',
  category: 'form',
  tags: ['form', 'contact', 'email'],
  schema,
  // 联系表单相对简单，不需要示例 Prompt
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
};
