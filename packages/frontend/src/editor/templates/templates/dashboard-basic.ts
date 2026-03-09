/**
 * Dashboard 仪表盘模板
 */
import type { Template } from '../types';
import type { A2UISchema } from '../../../types/schema';

const schema: A2UISchema = {
  version: 1,
  rootId: 'page-dashboard',
  components: {
    'page-dashboard': {
      id: 'page-dashboard',
      type: 'Page',
      props: {
        style: { padding: '24px', backgroundColor: '#f0f2f5', minHeight: '100vh' },
      },
      childrenIds: ['dash-header', 'stat-row', 'content-row'],
    },
    'dash-header': {
      id: 'dash-header',
      type: 'Div',
      props: { style: { marginBottom: '24px' } },
      childrenIds: ['dash-title'],
    },
    'dash-title': {
      id: 'dash-title',
      type: 'Title',
      props: { level: 3, children: '工作台', style: { margin: 0 } },
      childrenIds: [],
    },
    'stat-row': {
      id: 'stat-row',
      type: 'Row',
      props: { gutter: [24, 24], style: { marginBottom: '24px' } },
      childrenIds: ['col-stat-1', 'col-stat-2', 'col-stat-3', 'col-stat-4'],
    },
    'col-stat-1': {
      id: 'col-stat-1',
      type: 'Col',
      props: { span: 6 },
      childrenIds: ['card-stat-1'],
    },
    'card-stat-1': {
      id: 'card-stat-1',
      type: 'Card',
      props: {
        title: '总活跃用户',
        bordered: false,
        style: { borderRadius: '8px', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' },
      },
      childrenIds: ['val-stat-1'],
    },
    'val-stat-1': {
      id: 'val-stat-1',
      type: 'Title',
      props: { level: 2, children: '24,593', style: { margin: 0, color: '#1890ff' } },
      childrenIds: [],
    },
    'col-stat-2': {
      id: 'col-stat-2',
      type: 'Col',
      props: { span: 6 },
      childrenIds: ['card-stat-2'],
    },
    'card-stat-2': {
      id: 'card-stat-2',
      type: 'Card',
      props: {
        title: '今日新增订单',
        bordered: false,
        style: { borderRadius: '8px', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' },
      },
      childrenIds: ['val-stat-2'],
    },
    'val-stat-2': {
      id: 'val-stat-2',
      type: 'Title',
      props: { level: 2, children: '1,284', style: { margin: 0, color: '#52c41a' } },
      childrenIds: [],
    },
    'col-stat-3': {
      id: 'col-stat-3',
      type: 'Col',
      props: { span: 6 },
      childrenIds: ['card-stat-3'],
    },
    'card-stat-3': {
      id: 'card-stat-3',
      type: 'Card',
      props: {
        title: '本周总营收',
        bordered: false,
        style: { borderRadius: '8px', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' },
      },
      childrenIds: ['val-stat-3'],
    },
    'val-stat-3': {
      id: 'val-stat-3',
      type: 'Title',
      props: { level: 2, children: '¥ 89,400', style: { margin: 0, color: '#faad14' } },
      childrenIds: [],
    },
    'col-stat-4': {
      id: 'col-stat-4',
      type: 'Col',
      props: { span: 6 },
      childrenIds: ['card-stat-4'],
    },
    'card-stat-4': {
      id: 'card-stat-4',
      type: 'Card',
      props: {
        title: '任务完成率',
        bordered: false,
        style: { borderRadius: '8px', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' },
      },
      childrenIds: ['val-stat-4'],
    },
    'val-stat-4': {
      id: 'val-stat-4',
      type: 'Title',
      props: { level: 2, children: '92.5%', style: { margin: 0, color: '#722ed1' } },
      childrenIds: [],
    },
    'content-row': {
      id: 'content-row',
      type: 'Row',
      props: { gutter: [24, 24] },
      childrenIds: ['col-activity', 'col-actions'],
    },
    'col-activity': {
      id: 'col-activity',
      type: 'Col',
      props: { span: 16 },
      childrenIds: ['card-activity'],
    },
    'card-activity': {
      id: 'card-activity',
      type: 'Card',
      props: {
        title: '最近活动',
        bordered: false,
        style: { borderRadius: '8px', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' },
      },
      childrenIds: ['table-activity'],
    },
    'table-activity': {
      id: 'table-activity',
      type: 'Table',
      props: {
        size: 'small',
        pagination: { pageSize: 5 },
        columns: [
          { title: '时间', dataIndex: 'time', key: 'time' },
          { title: '操作人', dataIndex: 'user', key: 'user' },
          { title: '事件描述', dataIndex: 'event', key: 'event' },
        ],
        dataSource: [
          { key: '1', time: '10:23', user: '林冲', event: '更新了系统配置' },
          { key: '2', time: '09:45', user: '武松', event: '处理了 3 笔高危订单' },
        ],
      },
      childrenIds: [],
    },
    'col-actions': {
      id: 'col-actions',
      type: 'Col',
      props: { span: 8 },
      childrenIds: ['card-actions'],
    },
    'card-actions': {
      id: 'card-actions',
      type: 'Card',
      props: {
        title: '快捷入口',
        bordered: false,
        style: { borderRadius: '8px', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' },
      },
      childrenIds: ['space-actions'],
    },
    'space-actions': {
      id: 'space-actions',
      type: 'Space',
      props: { direction: 'vertical', size: 'middle', style: { width: '100%' } },
      childrenIds: ['btn-action-1', 'btn-action-2', 'btn-action-3'],
    },
    'btn-action-1': {
      id: 'btn-action-1',
      type: 'Button',
      props: { block: true, children: '发布新商品' },
      childrenIds: [],
    },
    'btn-action-2': {
      id: 'btn-action-2',
      type: 'Button',
      props: { block: true, children: '查看异常日志' },
      childrenIds: [],
    },
    'btn-action-3': {
      id: 'btn-action-3',
      type: 'Button',
      props: { block: true, children: '系统权限设置' },
      childrenIds: [],
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
