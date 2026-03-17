/**
 * 联系表单模板
 */
import type { Template } from '../types';
import type { A2UISchema } from '../../../types/schema';

const schema: A2UISchema = {
  version: 1.0,
  rootId: 'page-form',
  components: {
    'page-form': {
      id: 'page-form',
      type: 'Page',
      props: {
        style: {
          padding: '24px',
          backgroundColor: '#f0f2f5',
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
        },
      },
      childrenIds: ['form-card'],
    },
    'form-card': {
      id: 'form-card',
      type: 'Card',
      props: {
        title: '联系我们',
        bordered: false,
        style: {
          width: '800px',
          borderRadius: '8px',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        },
      },
      childrenIds: ['contactForm', 'preview-divider', 'preview-space'],
    },
    contactForm: {
      id: 'contactForm',
      type: 'Form',
      props: {
        layout: 'vertical',
        initialValues: {
          name: '张三',
          email: 'zhangsan@company.com',
          subject: 'trial',
          message: '想先了解产品试用和团队协作能力。',
        },
      },
      events: {
        onFinish: [{ type: 'apiCall', url: '/api/contact', method: 'POST' }],
      },
      childrenIds: ['row-1', 'row-2', 'row-3', 'row-actions'],
    },
    'row-1': {
      id: 'row-1',
      type: 'Row',
      props: { gutter: 24 },
      childrenIds: ['col-name', 'col-email'],
    },
    'col-name': {
      id: 'col-name',
      type: 'Col',
      props: { span: 12 },
      childrenIds: ['item-name'],
    },
    'item-name': {
      id: 'item-name',
      type: 'FormItem',
      props: { name: 'name', label: '您的姓名', rules: [{ required: true }] },
      childrenIds: ['input-name'],
    },
    'input-name': {
      id: 'input-name',
      type: 'Input',
      props: { placeholder: '请输入姓名', size: 'large' },
      childrenIds: [],
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
      props: { name: 'email', label: '联系邮箱', rules: [{ required: true, type: 'email' }] },
      childrenIds: ['input-email'],
    },
    'input-email': {
      id: 'input-email',
      type: 'Input',
      props: { placeholder: 'example@company.com', size: 'large' },
      childrenIds: [],
    },
    'row-2': {
      id: 'row-2',
      type: 'Row',
      props: {},
      childrenIds: ['col-subject'],
    },
    'col-subject': {
      id: 'col-subject',
      type: 'Col',
      props: { span: 24 },
      childrenIds: ['item-subject'],
    },
    'item-subject': {
      id: 'item-subject',
      type: 'FormItem',
      props: { name: 'subject', label: '咨询主题', rules: [{ required: true }] },
      childrenIds: ['select-subject'],
    },
    'select-subject': {
      id: 'select-subject',
      type: 'Select',
      props: {
        placeholder: '请选择主题',
        size: 'large',
        style: { width: '100%' },
        options: [
          { label: '产品试用', value: 'trial' },
          { label: '商务合作', value: 'business' },
          { label: '技术支持', value: 'support' },
        ],
      },
      childrenIds: [],
    },
    'row-3': {
      id: 'row-3',
      type: 'Row',
      props: {},
      childrenIds: ['col-message'],
    },
    'col-message': {
      id: 'col-message',
      type: 'Col',
      props: { span: 24 },
      childrenIds: ['item-message'],
    },
    'item-message': {
      id: 'item-message',
      type: 'FormItem',
      props: { name: 'message', label: '详细内容', rules: [{ required: true }] },
      childrenIds: ['textarea-message'],
    },
    'textarea-message': {
      id: 'textarea-message',
      type: 'TextArea',
      props: { placeholder: '请详细描述您的需求...', rows: 4 },
      childrenIds: [],
    },
    'row-actions': {
      id: 'row-actions',
      type: 'Row',
      props: { justify: 'end', style: { marginTop: '16px' } },
      childrenIds: ['col-actions'],
    },
    'col-actions': {
      id: 'col-actions',
      type: 'Col',
      props: { span: 24, style: { textAlign: 'right' } },
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
      props: { type: 'primary', htmlType: 'submit', size: 'large', children: '提交信息' },
      childrenIds: [],
    },
    'preview-divider': {
      id: 'preview-divider',
      type: 'Divider',
      props: { style: { margin: '24px 0 16px 0' } },
      childrenIds: [],
    },
    'preview-space': {
      id: 'preview-space',
      type: 'Space',
      props: { direction: 'vertical', size: 8, style: { width: '100%' } },
      childrenIds: [
        'preview-title',
        'preview-name',
        'preview-email',
        'preview-subject',
        'preview-message',
      ],
    },
    'preview-title': {
      id: 'preview-title',
      type: 'Text',
      props: {
        strong: true,
        children: '实时预览',
      },
      childrenIds: [],
    },
    'preview-name': {
      id: 'preview-name',
      type: 'Text',
      props: {
        children: '{{ "联系人：" + contactForm.name }}',
      },
      childrenIds: [],
    },
    'preview-email': {
      id: 'preview-email',
      type: 'Text',
      props: {
        children: '{{ "联系邮箱：" + contactForm.email }}',
      },
      childrenIds: [],
    },
    'preview-subject': {
      id: 'preview-subject',
      type: 'Text',
      props: {
        children:
          '{{ "咨询主题：" + (contactForm.subject === "trial" ? "产品试用" : contactForm.subject === "business" ? "商务合作" : "技术支持") }}',
      },
      childrenIds: [],
    },
    'preview-message': {
      id: 'preview-message',
      type: 'Paragraph',
      props: {
        children: '{{ "消息摘要：" + contactForm.message }}',
        style: { marginBottom: 0 },
      },
      childrenIds: [],
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
