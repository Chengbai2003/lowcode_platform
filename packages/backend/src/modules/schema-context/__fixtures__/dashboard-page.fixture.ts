import { A2UISchema } from '../types/schema.types';

export const DASHBOARD_PAGE_FIXTURE: A2UISchema = {
  version: 1,
  rootId: 'page_dashboard',
  components: {
    page_dashboard: {
      id: 'page_dashboard',
      type: 'Page',
      childrenIds: ['dash_header', 'stats_row', 'content_row'],
      props: { style: { padding: 24, backgroundColor: '#f5f7fa' } },
    },
    dash_header: {
      id: 'dash_header',
      type: 'Div',
      childrenIds: ['title_main', 'text_subtitle'],
      props: { style: { marginBottom: 24 } },
    },
    title_main: {
      id: 'title_main',
      type: 'Title',
      props: { level: 3, children: '运营仪表盘' },
    },
    text_subtitle: {
      id: 'text_subtitle',
      type: 'Text',
      props: { children: '今日核心业务指标总览' },
    },
    stats_row: {
      id: 'stats_row',
      type: 'Row',
      childrenIds: ['col_users', 'col_orders', 'col_revenue', 'col_rate'],
      props: { gutter: [16, 16] },
    },
    col_users: {
      id: 'col_users',
      type: 'Col',
      childrenIds: ['card_users'],
      props: { span: 6 },
    },
    card_users: {
      id: 'card_users',
      type: 'Card',
      childrenIds: ['title_users'],
      props: { title: '活跃用户' },
    },
    title_users: {
      id: 'title_users',
      type: 'Title',
      props: { level: 2, children: '24,593' },
    },
    col_orders: {
      id: 'col_orders',
      type: 'Col',
      childrenIds: ['card_orders'],
      props: { span: 6 },
    },
    card_orders: {
      id: 'card_orders',
      type: 'Card',
      childrenIds: ['title_orders'],
      props: { title: '今日订单' },
    },
    title_orders: {
      id: 'title_orders',
      type: 'Title',
      props: { level: 2, children: '1,284' },
    },
    col_revenue: {
      id: 'col_revenue',
      type: 'Col',
      childrenIds: ['card_revenue'],
      props: { span: 6 },
    },
    card_revenue: {
      id: 'card_revenue',
      type: 'Card',
      childrenIds: ['title_revenue'],
      props: { title: '本周营收' },
    },
    title_revenue: {
      id: 'title_revenue',
      type: 'Title',
      props: { level: 2, children: '89,400' },
    },
    col_rate: {
      id: 'col_rate',
      type: 'Col',
      childrenIds: ['card_rate'],
      props: { span: 6 },
    },
    card_rate: {
      id: 'card_rate',
      type: 'Card',
      childrenIds: ['title_rate'],
      props: { title: '完成率' },
    },
    title_rate: {
      id: 'title_rate',
      type: 'Title',
      props: { level: 2, children: '92.5%' },
    },
    content_row: {
      id: 'content_row',
      type: 'Row',
      childrenIds: ['col_activity', 'col_actions'],
      props: { gutter: [16, 16] },
    },
    col_activity: {
      id: 'col_activity',
      type: 'Col',
      childrenIds: ['card_activity'],
      props: { span: 16 },
    },
    card_activity: {
      id: 'card_activity',
      type: 'Card',
      childrenIds: ['table_activity'],
      props: { title: '最近活动' },
    },
    table_activity: {
      id: 'table_activity',
      type: 'Table',
      props: {
        columns: [
          { title: '时间', dataIndex: 'time' },
          { title: '操作人', dataIndex: 'operator' },
          { title: '事件', dataIndex: 'event' },
        ],
        dataSource: [],
      },
    },
    col_actions: {
      id: 'col_actions',
      type: 'Col',
      childrenIds: ['card_actions'],
      props: { span: 8 },
    },
    card_actions: {
      id: 'card_actions',
      type: 'Card',
      childrenIds: ['space_actions'],
      props: { title: '快捷入口' },
    },
    space_actions: {
      id: 'space_actions',
      type: 'Space',
      childrenIds: ['btn_publish', 'btn_review', 'btn_export'],
      props: { direction: 'vertical', size: 'middle' },
    },
    btn_publish: {
      id: 'btn_publish',
      type: 'Button',
      props: { children: '发布新商品', type: 'primary', block: true },
    },
    btn_review: {
      id: 'btn_review',
      type: 'Button',
      props: { children: '审核待办', block: true },
    },
    btn_export: {
      id: 'btn_export',
      type: 'Button',
      props: { children: '导出日报', block: true },
    },
  },
};
