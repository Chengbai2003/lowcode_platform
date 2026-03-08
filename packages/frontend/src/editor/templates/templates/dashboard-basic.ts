/**
 * Dashboard 仪表盘模板
 */
import type { Template } from '../types';
import type { A2UISchema } from '../../../types/schema';

const schema: A2UISchema = {
  version: '1.0',
  metadata: {
    id: 'template-dashboard-basic',
    name: 'Dashboard',
    description: 'Basic dashboard with cards and statistics',
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
      childrenIds: ['header-1', 'stats-row', 'content-row'],
    },
    'header-1': {
      id: 'header-1',
      type: 'Div',
      props: {
        style: {
          marginBottom: '24px',
        },
      },
      childrenIds: ['title-1'],
    },
    'title-1': {
      id: 'title-1',
      type: 'Title',
      props: {
        level: 2,
        children: 'Dashboard Overview',
        style: { margin: 0, color: '#1a1a1a' },
      },
    },
    'stats-row': {
      id: 'stats-row',
      type: 'Row',
      props: {
        gutter: 16,
        style: { marginBottom: '24px' },
      },
      childrenIds: ['stat-card-1', 'stat-card-2', 'stat-card-3', 'stat-card-4'],
    },
    'stat-card-1': {
      id: 'stat-card-1',
      type: 'Card',
      props: {
        style: { borderRadius: '8px' },
      },
      childrenIds: ['stat-1-content'],
    },
    'stat-1-content': {
      id: 'stat-1-content',
      type: 'Div',
      props: {},
      childrenIds: ['stat-1-value', 'stat-1-label'],
    },
    'stat-1-value': {
      id: 'stat-1-value',
      type: 'Title',
      props: {
        level: 3,
        children: '1,234',
        style: { margin: 0, color: '#1890ff' },
      },
    },
    'stat-1-label': {
      id: 'stat-1-label',
      type: 'Text',
      props: {
        children: 'Total Users',
        style: { color: '#666' },
      },
    },
    'stat-card-2': {
      id: 'stat-card-2',
      type: 'Card',
      props: {
        style: { borderRadius: '8px' },
      },
      childrenIds: ['stat-2-content'],
    },
    'stat-2-content': {
      id: 'stat-2-content',
      type: 'Div',
      props: {},
      childrenIds: ['stat-2-value', 'stat-2-label'],
    },
    'stat-2-value': {
      id: 'stat-2-value',
      type: 'Title',
      props: {
        level: 3,
        children: '56,789',
        style: { margin: 0, color: '#52c41a' },
      },
    },
    'stat-2-label': {
      id: 'stat-2-label',
      type: 'Text',
      props: {
        children: 'Total Orders',
        style: { color: '#666' },
      },
    },
    'stat-card-3': {
      id: 'stat-card-3',
      type: 'Card',
      props: {
        style: { borderRadius: '8px' },
      },
      childrenIds: ['stat-3-content'],
    },
    'stat-3-content': {
      id: 'stat-3-content',
      type: 'Div',
      props: {},
      childrenIds: ['stat-3-value', 'stat-3-label'],
    },
    'stat-3-value': {
      id: 'stat-3-value',
      type: 'Title',
      props: {
        level: 3,
        children: '$98,765',
        style: { margin: 0, color: '#faad14' },
      },
    },
    'stat-3-label': {
      id: 'stat-3-label',
      type: 'Text',
      props: {
        children: 'Revenue',
        style: { color: '#666' },
      },
    },
    'stat-card-4': {
      id: 'stat-card-4',
      type: 'Card',
      props: {
        style: { borderRadius: '8px' },
      },
      childrenIds: ['stat-4-content'],
    },
    'stat-4-content': {
      id: 'stat-4-content',
      type: 'Div',
      props: {},
      childrenIds: ['stat-4-value', 'stat-4-label'],
    },
    'stat-4-value': {
      id: 'stat-4-value',
      type: 'Title',
      props: {
        level: 3,
        children: '98.5%',
        style: { margin: 0, color: '#722ed1' },
      },
    },
    'stat-4-label': {
      id: 'stat-4-label',
      type: 'Text',
      props: {
        children: 'Satisfaction',
        style: { color: '#666' },
      },
    },
    'content-row': {
      id: 'content-row',
      type: 'Row',
      props: {
        gutter: 16,
      },
      childrenIds: ['main-card', 'side-card'],
    },
    'main-card': {
      id: 'main-card',
      type: 'Card',
      props: {
        title: 'Recent Activity',
        style: { borderRadius: '8px' },
      },
      childrenIds: ['activity-placeholder'],
    },
    'activity-placeholder': {
      id: 'activity-placeholder',
      type: 'Text',
      props: {
        children: 'Activity feed will be displayed here...',
        style: { color: '#999', padding: '40px 0', textAlign: 'center' },
      },
    },
    'side-card': {
      id: 'side-card',
      type: 'Card',
      props: {
        title: 'Quick Actions',
        style: { borderRadius: '8px' },
      },
      childrenIds: ['action-btn-1', 'action-btn-2'],
    },
    'action-btn-1': {
      id: 'action-btn-1',
      type: 'Button',
      props: {
        type: 'primary',
        children: 'Create New',
        style: { width: '100%', marginBottom: '12px' },
      },
    },
    'action-btn-2': {
      id: 'action-btn-2',
      type: 'Button',
      props: {
        children: 'View Reports',
        style: { width: '100%' },
      },
    },
  },
};

export const dashboardBasicTemplate: Template = {
  id: 'dashboard-basic',
  name: 'Basic Dashboard',
  nameZh: '基础仪表盘',
  description: 'A basic dashboard template with statistics cards and quick actions',
  descriptionZh: '包含统计卡片和快捷操作的基础仪表盘模板',
  category: 'dashboard',
  tags: ['dashboard', 'analytics', 'admin'],
  schema,
  examplePrompt:
    '创建一个后台管理仪表盘，顶部有页面标题，下方有四个统计卡片展示用户数、订单数、收入和满意度，底部左侧是最近活动卡片，右侧是快捷操作按钮。',
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
};
