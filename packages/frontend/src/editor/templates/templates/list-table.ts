/**
 * 列表表格模板
 */
import type { Template } from '../types';
import type { A2UISchema } from '../../../types/schema';

const schema: A2UISchema = {
  version: '1.0',
  metadata: {
    id: 'template-list-table',
    name: 'Data Table List',
    description: 'Data table with search and filters',
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
      childrenIds: ['page-header', 'filter-card', 'table-card'],
    },
    'page-header': {
      id: 'page-header',
      type: 'Div',
      props: {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        },
      },
      childrenIds: ['page-title', 'add-btn'],
    },
    'page-title': {
      id: 'page-title',
      type: 'Title',
      props: {
        level: 3,
        children: 'User Management',
        style: { margin: 0 },
      },
    },
    'add-btn': {
      id: 'add-btn',
      type: 'Button',
      props: {
        type: 'primary',
        children: '+ Add New',
      },
    },
    'filter-card': {
      id: 'filter-card',
      type: 'Card',
      props: {
        style: { marginBottom: '16px', borderRadius: '8px' },
      },
      childrenIds: ['filter-row'],
    },
    'filter-row': {
      id: 'filter-row',
      type: 'Row',
      props: {
        gutter: 16,
      },
      childrenIds: ['search-col', 'status-col', 'date-col', 'search-btn-col'],
    },
    'search-col': {
      id: 'search-col',
      type: 'Col',
      props: { span: 8 },
      childrenIds: ['search-input'],
    },
    'search-input': {
      id: 'search-input',
      type: 'Input',
      props: {
        placeholder: 'Search by name or email...',
        prefix: '🔍',
        allowClear: true,
      },
    },
    'status-col': {
      id: 'status-col',
      type: 'Col',
      props: { span: 6 },
      childrenIds: ['status-select'],
    },
    'status-select': {
      id: 'status-select',
      type: 'Select',
      props: {
        placeholder: 'Status',
        allowClear: true,
        style: { width: '100%' },
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' },
          { label: 'Pending', value: 'pending' },
        ],
      },
    },
    'date-col': {
      id: 'date-col',
      type: 'Col',
      props: { span: 6 },
      childrenIds: ['date-picker'],
    },
    'date-picker': {
      id: 'date-picker',
      type: 'DatePicker',
      props: {
        placeholder: 'Select date',
        style: { width: '100%' },
      },
    },
    'search-btn-col': {
      id: 'search-btn-col',
      type: 'Col',
      props: { span: 4 },
      childrenIds: ['search-btn'],
    },
    'search-btn': {
      id: 'search-btn',
      type: 'Button',
      props: {
        type: 'primary',
        children: 'Search',
        style: { width: '100%' },
      },
    },
    'table-card': {
      id: 'table-card',
      type: 'Card',
      props: {
        style: { borderRadius: '8px' },
      },
      childrenIds: ['data-table'],
    },
    'data-table': {
      id: 'data-table',
      type: 'Table',
      props: {
        columns: [
          { title: 'Name', dataIndex: 'name', key: 'name' },
          { title: 'Email', dataIndex: 'email', key: 'email' },
          { title: 'Status', dataIndex: 'status', key: 'status' },
          { title: 'Created', dataIndex: 'createdAt', key: 'createdAt' },
          { title: 'Actions', key: 'actions', width: 150 },
        ],
        dataSource: [
          {
            key: '1',
            name: 'John Doe',
            email: 'john@example.com',
            status: 'Active',
            createdAt: '2026-01-15',
          },
          {
            key: '2',
            name: 'Jane Smith',
            email: 'jane@example.com',
            status: 'Active',
            createdAt: '2026-02-20',
          },
          {
            key: '3',
            name: 'Bob Wilson',
            email: 'bob@example.com',
            status: 'Pending',
            createdAt: '2026-03-01',
          },
        ],
        pagination: { pageSize: 10 },
      },
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
