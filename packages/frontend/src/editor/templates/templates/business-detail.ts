/**
 * 业务详情页模板
 */
import type { Template } from '../types';
import type { A2UISchema } from '../../../types/schema';

const schema: A2UISchema = {
  version: 1,
  rootId: 'page-detail',
  components: {
    'page-detail': {
      id: 'page-detail',
      type: 'Page',
      props: {
        style: { padding: '24px', backgroundColor: '#f0f2f5', minHeight: '100vh' },
      },
      childrenIds: ['header-card', 'info-card', 'logs-card'],
    },
    'header-card': {
      id: 'header-card',
      type: 'Card',
      props: {
        bordered: false,
        style: {
          marginBottom: '24px',
          borderRadius: '8px',
          boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)',
        },
      },
      childrenIds: ['header-flex'],
    },
    'header-flex': {
      id: 'header-flex',
      type: 'Div',
      props: { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      childrenIds: ['header-title', 'header-actions'],
    },
    'header-title': {
      id: 'header-title',
      type: 'Title',
      props: { level: 3, children: '工单明细：TASK-001', style: { margin: 0 } },
      childrenIds: [],
    },
    'header-actions': {
      id: 'header-actions',
      type: 'Space',
      props: {},
      childrenIds: ['btn-reject', 'btn-pass'],
    },
    'btn-reject': {
      id: 'btn-reject',
      type: 'Button',
      props: { danger: true, children: '驳回' },
      events: { onClick: [] },
      childrenIds: [],
    },
    'btn-pass': {
      id: 'btn-pass',
      type: 'Button',
      props: { type: 'primary', children: '通过' },
      events: { onClick: [] },
      childrenIds: [],
    },
    'info-card': {
      id: 'info-card',
      type: 'Card',
      props: {
        title: '基础信息',
        bordered: false,
        style: {
          marginBottom: '24px',
          borderRadius: '8px',
          boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)',
        },
      },
      childrenIds: ['info-row'],
    },
    'info-row': {
      id: 'info-row',
      type: 'Row',
      props: { gutter: [24, 24] },
      childrenIds: ['col-info-1', 'col-info-2', 'col-info-3'],
    },
    'col-info-1': {
      id: 'col-info-1',
      type: 'Col',
      props: { span: 8 },
      childrenIds: ['info-1'],
    },
    'info-1': {
      id: 'info-1',
      type: 'Space',
      props: { direction: 'vertical', size: 4 },
      childrenIds: ['label-1', 'val-1'],
    },
    'label-1': {
      id: 'label-1',
      type: 'Text',
      props: { type: 'secondary', children: '申请人' },
      childrenIds: [],
    },
    'val-1': { id: 'val-1', type: 'Text', props: { children: '张三 (研发中心)' }, childrenIds: [] },
    'col-info-2': {
      id: 'col-info-2',
      type: 'Col',
      props: { span: 8 },
      childrenIds: ['info-2'],
    },
    'info-2': {
      id: 'info-2',
      type: 'Space',
      props: { direction: 'vertical', size: 4 },
      childrenIds: ['label-2', 'val-2'],
    },
    'label-2': {
      id: 'label-2',
      type: 'Text',
      props: { type: 'secondary', children: '申请时间' },
      childrenIds: [],
    },
    'val-2': { id: 'val-2', type: 'Text', props: { children: '2026-03-09' }, childrenIds: [] },
    'col-info-3': {
      id: 'col-info-3',
      type: 'Col',
      props: { span: 8 },
      childrenIds: ['info-3'],
    },
    'info-3': {
      id: 'info-3',
      type: 'Space',
      props: { direction: 'vertical', size: 4 },
      childrenIds: ['label-3', 'val-3'],
    },
    'label-3': {
      id: 'label-3',
      type: 'Text',
      props: { type: 'secondary', children: '当前状态' },
      childrenIds: [],
    },
    'val-3': {
      id: 'val-3',
      type: 'Text',
      props: { children: '处理中', strong: true, type: 'warning' },
      childrenIds: [],
    },
    'logs-card': {
      id: 'logs-card',
      type: 'Card',
      props: {
        title: '操作日志',
        bordered: false,
        style: { borderRadius: '8px', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' },
      },
      childrenIds: ['logs-table'],
    },
    'logs-table': {
      id: 'logs-table',
      type: 'Table',
      props: {
        pagination: false,
        columns: [
          { title: '时间', dataIndex: 'time', key: 'time' },
          { title: '操作人', dataIndex: 'user', key: 'user' },
          { title: '动作', dataIndex: 'action', key: 'action' },
        ],
        dataSource: [{ key: '1', time: '10:15', user: '张三', action: '提交申请' }],
      },
      childrenIds: [],
    },
  },
};

export const businessDetailTemplate: Template = {
  id: 'business-detail',
  name: 'Business Detail',
  nameZh: '业务详情',
  description: 'A business detail page with basic info, detailed info and operation timeline',
  descriptionZh: '包含基本信息、详细信息和操作记录的业务详情页',
  category: 'detail',
  tags: ['detail', 'info', 'timeline', 'business'],
  schema,
  examplePrompt:
    '创建一个业务详情页，顶部有返回按钮、标题和编辑/删除操作按钮，主体包含基本信息卡片（使用描述列表展示关键字段）、详细信息卡片（收货地址和联系方式）、底部是操作记录时间线。',
  createdAt: '2026-03-09T00:00:00.000Z',
  updatedAt: '2026-03-09T00:00:00.000Z',
};
