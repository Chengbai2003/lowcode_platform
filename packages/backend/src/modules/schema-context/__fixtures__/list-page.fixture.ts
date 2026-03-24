import { A2UISchema } from '../types/schema.types';

export const LIST_PAGE_FIXTURE: A2UISchema = {
  version: 2,
  rootId: 'page_root',
  components: {
    page_root: { id: 'page_root', type: 'Page', childrenIds: ['container_main'] },
    container_main: {
      id: 'container_main',
      type: 'Container',
      childrenIds: ['title_header', 'space_search', 'table_main', 'space_actions', 'modal_add'],
      props: { style: { padding: 24 } },
    },
    title_header: { id: 'title_header', type: 'Title', props: { children: '数据列表', level: 3 } },
    space_search: {
      id: 'space_search',
      type: 'Space',
      childrenIds: ['input_search', 'btn_search', 'btn_reset'],
    },
    input_search: {
      id: 'input_search',
      type: 'Input',
      props: { placeholder: '请输入搜索关键词', allowClear: true },
    },
    btn_search: { id: 'btn_search', type: 'Button', props: { children: '查询', type: 'primary' } },
    btn_reset: { id: 'btn_reset', type: 'Button', props: { children: '重置' } },
    table_main: {
      id: 'table_main',
      type: 'Table',
      props: {
        columns: [
          { title: '姓名', dataIndex: 'name' },
          { title: '年龄', dataIndex: 'age' },
        ],
        dataSource: [],
        rowKey: 'id',
      },
    },
    space_actions: { id: 'space_actions', type: 'Space', childrenIds: ['btn_add', 'btn_delete'] },
    btn_add: { id: 'btn_add', type: 'Button', props: { children: '新增', type: 'primary' } },
    btn_delete: { id: 'btn_delete', type: 'Button', props: { children: '删除', danger: true } },
    modal_add: {
      id: 'modal_add',
      type: 'Modal',
      childrenIds: ['form_add'],
      props: { title: '新增记录', open: false },
    },
    form_add: {
      id: 'form_add',
      type: 'Form',
      childrenIds: ['form_item_name', 'form_item_age', 'form_item_email'],
      props: { layout: 'vertical' },
    },
    form_item_name: {
      id: 'form_item_name',
      type: 'FormItem',
      childrenIds: ['input_name'],
      props: { label: '姓名', name: 'name', required: true },
    },
    input_name: { id: 'input_name', type: 'Input', props: { placeholder: '请输入姓名' } },
    form_item_age: {
      id: 'form_item_age',
      type: 'FormItem',
      childrenIds: ['input_age'],
      props: { label: '年龄', name: 'age' },
    },
    input_age: {
      id: 'input_age',
      type: 'InputNumber',
      props: { min: 0, max: 150, placeholder: '请输入年龄' },
    },
    form_item_email: {
      id: 'form_item_email',
      type: 'FormItem',
      childrenIds: ['input_email'],
      props: { label: '邮箱', name: 'email' },
    },
    input_email: { id: 'input_email', type: 'Input', props: { placeholder: '请输入邮箱' } },
  },
};
