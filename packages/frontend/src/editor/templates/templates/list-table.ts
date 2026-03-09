/**
 * 列表表格模板
 */
import type { Template } from '../types';
import type { A2UISchema } from '../../../types/schema';

const schema: A2UISchema = {
  rootId: 'page-list',
  components: {
    'page-list': {
      id: 'page-list',
      type: 'Page',
      props: {
        style: {
          padding: '24px',
          backgroundColor: '#f0f2f5',
          minHeight: '100vh',
        },
      },
      childrenIds: ['header-wrapper', 'filter-card', 'table-card'],
    },
    'header-wrapper': {
      id: 'header-wrapper',
      type: 'Div',
      props: {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        },
      },
      childrenIds: ['page-title', 'btn-add'],
    },
    'page-title': {
      id: 'page-title',
      type: 'Title',
      props: {
        level: 3,
        children: '用户管理中心',
        style: {
          margin: 0,
        },
      },
      childrenIds: [],
    },
    'btn-add': {
      id: 'btn-add',
      type: 'Button',
      props: {
        type: 'primary',
        children: '➕ 新建用户',
      },
      events: {
        onClick: [
          {
            type: 'navigate',
            to: '/users/create',
          },
        ],
      },
      childrenIds: [],
    },
    'filter-card': {
      id: 'filter-card',
      type: 'Card',
      props: {
        bordered: false,
        style: {
          marginBottom: '16px',
          borderRadius: '8px',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        },
      },
      childrenIds: ['filter-form'],
    },
    'filter-form': {
      id: 'filter-form',
      type: 'Form',
      props: {
        style: {
          width: '100%',
        },
      },
      events: {
        onFinish: [
          {
            type: 'apiCall',
            url: '/api/users',
            method: 'GET',
          },
        ],
      },
      childrenIds: ['filter-fields-row', 'filter-actions-row'],
    },
    'filter-fields-row': {
      id: 'filter-fields-row',
      type: 'Row',
      props: {
        gutter: [16, 16],
        style: {
          width: '100%',
        },
      },
      childrenIds: ['col-search', 'col-status', 'col-date'],
    },
    'col-search': {
      id: 'col-search',
      type: 'Col',
      props: {
        span: 6,
      },
      childrenIds: ['item-search'],
    },
    'item-search': {
      id: 'item-search',
      type: 'FormItem',
      props: {
        name: 'keyword',
        label: '用户检索',
        style: {
          margin: 0,
          width: '100%',
        },
      },
      childrenIds: ['input-search'],
    },
    'input-search': {
      id: 'input-search',
      type: 'Input',
      props: {
        placeholder: '请输入姓名、邮箱',
        allowClear: true,
      },
      childrenIds: [],
    },
    'col-status': {
      id: 'col-status',
      type: 'Col',
      props: {
        span: 6,
      },
      childrenIds: ['item-status'],
    },
    'item-status': {
      id: 'item-status',
      type: 'FormItem',
      props: {
        name: 'status',
        label: '账号状态',
        style: {
          margin: 0,
          width: '100%',
        },
      },
      childrenIds: ['select-status'],
    },
    'select-status': {
      id: 'select-status',
      type: 'Select',
      props: {
        placeholder: '请选择状态',
        allowClear: true,
        style: {
          width: '100%',
        },
        options: [
          {
            label: '正常活跃',
            value: 'active',
          },
          {
            label: '已封禁',
            value: 'banned',
          },
        ],
      },
      childrenIds: [],
    },
    'col-date': {
      id: 'col-date',
      type: 'Col',
      props: {
        span: 6,
      },
      childrenIds: ['item-date'],
    },
    'item-date': {
      id: 'item-date',
      type: 'FormItem',
      props: {
        name: 'dateRange',
        label: '注册时间',
        style: {
          margin: 0,
          width: '100%',
        },
      },
      childrenIds: ['date-picker'],
    },
    'date-picker': {
      id: 'date-picker',
      type: 'DatePicker',
      props: {
        style: {
          width: '100%',
        },
      },
      childrenIds: [],
    },
    'filter-actions-row': {
      id: 'filter-actions-row',
      type: 'Row',
      props: {
        justify: 'end',
        style: {
          marginTop: '16px',
        },
      },
      childrenIds: ['col-action-full'],
    },
    'col-action-full': {
      id: 'col-action-full',
      type: 'Col',
      childrenIds: ['item-action'],
    },
    'item-action': {
      id: 'item-action',
      type: 'FormItem',
      props: {
        style: {
          margin: 0,
          width: '100%',
        },
      },
      childrenIds: ['action-space'],
    },
    'action-space': {
      id: 'action-space',
      type: 'Space',
      props: {
        size: 'small',
      },
      childrenIds: ['btn-reset', 'btn-search'],
    },
    'btn-reset': {
      id: 'btn-reset',
      type: 'Button',
      props: {
        children: '重置',
      },
      events: {
        onClick: [],
      },
      childrenIds: [],
    },
    'btn-search': {
      id: 'btn-search',
      type: 'Button',
      props: {
        type: 'primary',
        htmlType: 'submit',
        children: '查询',
      },
      childrenIds: [],
    },
    'table-card': {
      id: 'table-card',
      type: 'Card',
      props: {
        bordered: false,
        style: {
          borderRadius: '8px',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        },
      },
      childrenIds: ['data-table'],
    },
    'data-table': {
      id: 'data-table',
      type: 'Table',
      props: {
        size: 'middle',
        columns: [
          {
            title: '用户名',
            dataIndex: 'name',
            key: 'name',
          },
          {
            title: '联系邮箱',
            dataIndex: 'email',
            key: 'email',
          },
          {
            title: '当前状态',
            dataIndex: 'status',
            key: 'status',
          },
        ],
        dataSource: [
          {
            key: '1',
            name: 'Linus Torvalds',
            email: 'linus@linux.org',
            status: '🟢 正常活跃',
          },
        ],
        pagination: {
          pageSize: 10,
        },
      },
      childrenIds: [],
    },
  },
};

export const listTableTemplate: Template = {
  id: 'list-table',
  name: 'Data Table',
  nameZh: '数据表格',
  description: 'A data table with search, filters and pagination',
  descriptionZh: '带搜索、筛选和分页的数据表格',
  category: 'list',
  tags: ['table', 'list', 'data', 'admin'],
  schema,
  examplePrompt:
    '创建一个用户管理列表页，顶部有标题和"新增"按钮，下方是筛选区域包含搜索框、状态下拉框、日期选择器和搜索按钮，底部是数据表格展示用户信息。',
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
};
