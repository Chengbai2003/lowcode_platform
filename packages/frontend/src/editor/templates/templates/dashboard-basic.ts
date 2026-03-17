/**
 * Dashboard 仪表盘模板
 */
import type { Template } from '../types';
import type { A2UISchema } from '../../../types/schema';
import { createHiddenDataNode } from '../reactiveSchema';

const schema: A2UISchema = {
  version: 1,
  rootId: 'page-dashboard',
  components: {
    dashboardScene: createHiddenDataNode('dashboardScene', {
      title: '工作台',
      subtitle: '今日运营概览',
    }),
    dashboardMetrics: createHiddenDataNode('dashboardMetrics', {
      activeUsers: '24,593',
      newOrders: '1,284',
      revenue: '89,400',
      completionRate: '92.5%',
    }),
    dashboardActivities: createHiddenDataNode('dashboardActivities', [
      { key: '1', time: '10:23', user: '林冲', event: '更新了系统配置' },
      { key: '2', time: '09:45', user: '武松', event: '处理了 3 笔高危订单' },
      { key: '3', time: '08:18', user: '鲁智深', event: '完成了晨间巡检' },
    ]),
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
      childrenIds: ['dash-title', 'dash-subtitle'],
    },
    'dash-title': {
      id: 'dash-title',
      type: 'Title',
      props: { level: 3, children: '{{ dashboardScene.title }}', style: { margin: 0 } },
      childrenIds: [],
    },
    'dash-subtitle': {
      id: 'dash-subtitle',
      type: 'Text',
      props: {
        children: '{{ dashboardScene.subtitle }}',
        style: { color: '#64748b' },
      },
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
      props: {
        level: 2,
        children: '{{ dashboardMetrics.activeUsers }}',
        style: { margin: 0, color: '#1890ff' },
      },
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
      props: {
        level: 2,
        children: '{{ dashboardMetrics.newOrders }}',
        style: { margin: 0, color: '#52c41a' },
      },
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
      props: {
        level: 2,
        children: '{{ "¥ " + dashboardMetrics.revenue }}',
        style: { margin: 0, color: '#faad14' },
      },
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
      props: {
        level: 2,
        children: '{{ dashboardMetrics.completionRate }}',
        style: { margin: 0, color: '#722ed1' },
      },
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
        dataSource: '{{ dashboardActivities }}',
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
      events: {
        onClick: [
          {
            type: 'setValue',
            field: 'dashboardScene',
            value: {
              title: '商品运营工作台',
              subtitle: '新品发布后的实时监控快照',
            },
          },
          {
            type: 'setValue',
            field: 'dashboardMetrics',
            value: {
              activeUsers: '26,108',
              newOrders: '1,962',
              revenue: '128,640',
              completionRate: '96.1%',
            },
          },
          {
            type: 'setValue',
            field: 'dashboardActivities',
            value: [
              { key: '1', time: '11:08', user: '商品运营', event: '完成新品上架并同步首页推荐位' },
              {
                key: '2',
                time: '10:46',
                user: '市场团队',
                event: '创建新品首发活动并推送给会员用户',
              },
              { key: '3', time: '10:15', user: '客服中心', event: '接入新品 FAQ 与售后答疑脚本' },
            ],
          },
        ],
      },
      childrenIds: [],
    },
    'btn-action-2': {
      id: 'btn-action-2',
      type: 'Button',
      props: { block: true, children: '查看异常日志' },
      events: {
        onClick: [
          {
            type: 'setValue',
            field: 'dashboardScene',
            value: {
              title: '风控巡检看板',
              subtitle: '聚焦异常订单和系统告警的排查视图',
            },
          },
          {
            type: 'setValue',
            field: 'dashboardMetrics',
            value: {
              activeUsers: '22,904',
              newOrders: '318',
              revenue: '53,200',
              completionRate: '81.4%',
            },
          },
          {
            type: 'setValue',
            field: 'dashboardActivities',
            value: [
              { key: '1', time: '10:52', user: '风控引擎', event: '拦截 12 笔异常支付请求' },
              { key: '2', time: '10:19', user: 'SRE', event: '完成支付网关重试链路回放' },
              { key: '3', time: '09:57', user: '审计系统', event: '生成高风险订单复盘报告' },
            ],
          },
        ],
      },
      childrenIds: [],
    },
    'btn-action-3': {
      id: 'btn-action-3',
      type: 'Button',
      props: { block: true, children: '系统权限设置' },
      events: {
        onClick: [
          {
            type: 'setValue',
            field: 'dashboardScene',
            value: {
              title: '权限治理中心',
              subtitle: '面向组织权限调整和访问审计的协同视图',
            },
          },
          {
            type: 'setValue',
            field: 'dashboardMetrics',
            value: {
              activeUsers: '18,420',
              newOrders: '742',
              revenue: '67,800',
              completionRate: '98.3%',
            },
          },
          {
            type: 'setValue',
            field: 'dashboardActivities',
            value: [
              { key: '1', time: '11:30', user: 'IAM 管理员', event: '批量收敛过期项目成员权限' },
              { key: '2', time: '10:11', user: '审计平台', event: '同步最新的敏感操作访问记录' },
              {
                key: '3',
                time: '09:34',
                user: '安全负责人',
                event: '确认关键系统最小权限策略生效',
              },
            ],
          },
        ],
      },
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
