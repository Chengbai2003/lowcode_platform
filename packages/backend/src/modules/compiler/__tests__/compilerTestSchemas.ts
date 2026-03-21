import type { A2UISchema } from '../schema.types';

function createSchema(
  components: A2UISchema['components'],
  rootId = 'page_root',
): A2UISchema {
  return {
    version: 1,
    rootId,
    components,
  };
}

export const snapshotSchemas = {
  simpleButton: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['btn_submit'],
    },
    btn_submit: {
      id: 'btn_submit',
      type: 'Button',
      props: {
        type: 'primary',
        children: '提交',
      },
      childrenIds: [],
    },
  }),
  nestedTree: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      props: { style: { padding: '24px' } },
      childrenIds: ['container_main'],
    },
    container_main: {
      id: 'container_main',
      type: 'Container',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        },
      },
      childrenIds: ['title_main', 'btn_confirm'],
    },
    title_main: {
      id: 'title_main',
      type: 'Text',
      props: {
        children: '审批中心',
      },
      childrenIds: [],
    },
    btn_confirm: {
      id: 'btn_confirm',
      type: 'Button',
      props: {
        type: 'primary',
        children: '确认',
      },
      childrenIds: [],
    },
  }),
  fieldBinding: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['input_name'],
    },
    input_name: {
      id: 'input_name',
      type: 'Input',
      props: {
        field: 'userName',
        defaultValue: 'Alice',
        placeholder: '请输入用户名',
      },
      childrenIds: [],
    },
  }),
  styleClassMerge: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['div_banner'],
    },
    div_banner: {
      id: 'div_banner',
      type: 'Div',
      props: {
        className: 'banner-shell',
        style: {
          marginBottom: 16,
          display: 'flex',
          color: '#1f2937',
        },
        children: '系统公告',
      },
      childrenIds: [],
    },
  }),
  componentSources: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['card_stats', 'btn_refresh'],
    },
    card_stats: {
      id: 'card_stats',
      type: 'Card',
      props: {
        children: '统计卡片',
      },
      childrenIds: [],
    },
    btn_refresh: {
      id: 'btn_refresh',
      type: 'Button',
      props: {
        children: '刷新',
      },
      childrenIds: [],
    },
  }),
  basicActionList: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['btn_notify'],
    },
    btn_notify: {
      id: 'btn_notify',
      type: 'Button',
      props: {
        type: 'primary',
        children: '通知',
      },
      events: {
        onClick: [{ type: 'feedback', kind: 'message', level: 'success', content: '操作成功' }],
      },
      childrenIds: [],
    },
  }),
};

export const behaviorSchemas = {
  expressionsAndTemplates: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['input_name', 'text_title', 'text_summary', 'link_profile'],
    },
    input_name: {
      id: 'input_name',
      type: 'Input',
      props: {
        field: 'name',
        defaultValue: 'A2UI',
      },
      childrenIds: [],
    },
    text_title: {
      id: 'text_title',
      type: 'Text',
      props: {
        children: '{{ "你好，" + name }}',
      },
      childrenIds: [],
    },
    text_summary: {
      id: 'text_summary',
      type: 'Text',
      props: {
        children: '欢迎 {{ name }}，再次欢迎 {{ name }}',
      },
      childrenIds: [],
    },
    link_profile: {
      id: 'link_profile',
      type: 'Link',
      props: {
        href: '/users/{{ name }}',
        children: '查看资料',
      },
      childrenIds: [],
    },
  }),
  visibleConditions: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['toggle_flag', 'panel_static', 'panel_dynamic'],
    },
    toggle_flag: {
      id: 'toggle_flag',
      type: 'Input',
      props: {
        field: 'enabled',
        defaultValue: true,
      },
      childrenIds: [],
    },
    panel_static: {
      id: 'panel_static',
      type: 'Card',
      props: {
        visible: false,
        children: '永远隐藏',
      },
      childrenIds: [],
    },
    panel_dynamic: {
      id: 'panel_dynamic',
      type: 'Card',
      props: {
        visible: '{{ enabled }}',
        children: '条件面板',
      },
      childrenIds: [],
    },
  }),
  notificationAndDialog: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['btn_ui'],
    },
    btn_ui: {
      id: 'btn_ui',
      type: 'Button',
      props: {
        children: '操作',
      },
      events: {
        onClick: [
          {
            type: 'feedback',
            kind: 'notification',
            level: 'success',
            title: '{{ "系统通知" }}',
            content: '{{ "已完成同步" }}',
            placement: 'bottomRight',
            duration: 0,
          },
          {
            type: 'dialog',
            kind: 'confirm',
            title: '{{ "确认提交" }}',
            content: '{{ "是否继续？" }}',
            onOk: [{ type: 'feedback', content: '继续执行', level: 'info' }],
            onCancel: [{ type: 'feedback', content: '已取消', level: 'warning' }],
          },
        ],
      },
      childrenIds: [],
    },
  }),
  actionCallbacksAndDelay: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['hidden_rows', 'btn_fetch'],
    },
    hidden_rows: {
      id: 'hidden_rows',
      type: 'Div',
      props: {
        visible: false,
        initialValue: [],
      },
      childrenIds: [],
    },
    btn_fetch: {
      id: 'btn_fetch',
      type: 'Button',
      props: {
        children: '加载数据',
      },
      events: {
        onClick: [
          {
            type: 'apiCall',
            url: 'https://example.com/api/list',
            method: 'GET',
            resultTo: 'hidden_rows',
            onSuccess: [{ type: 'delay', ms: 50 }, { type: 'log', value: '{{ hidden_rows }}' }],
            onError: [{ type: 'feedback', level: 'error', content: '加载失败' }],
          },
        ],
      },
      childrenIds: [],
    },
  }),
  legacyExpressionCompatibility: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['text_legacy'],
    },
    text_legacy: {
      id: 'text_legacy',
      type: 'Text',
      props: {
        children: {
          __expr: true,
          code: 'formData.userName',
        },
      },
      childrenIds: [],
    },
  }),
  nonStringInitialValues: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['hidden_obj', 'hidden_num', 'input_flag'],
    },
    hidden_obj: {
      id: 'hidden_obj',
      type: 'Div',
      props: {
        visible: false,
        initialValue: {
          role: 'admin',
          count: 2,
        },
      },
      childrenIds: [],
    },
    hidden_num: {
      id: 'hidden_num',
      type: 'Div',
      props: {
        visible: false,
        initialValue: 3,
      },
      childrenIds: [],
    },
    input_flag: {
      id: 'input_flag',
      type: 'Input',
      props: {
        field: 'isEnabled',
        defaultValue: false,
      },
      childrenIds: [],
    },
  }),
  customScriptAndUnsafeNavigate: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['btn_legacy'],
    },
    btn_legacy: {
      id: 'btn_legacy',
      type: 'Button',
      props: {
        children: 'Legacy',
      },
      events: {
        onClick: [
          { type: 'customScript', code: 'alert(1)' },
          { type: 'navigate', to: 'javascript:alert(1)' },
        ],
      },
      childrenIds: [],
    },
  }),
  cycleAndMissingNode: createSchema({
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['node_a', 'missing_child'],
    },
    node_a: {
      id: 'node_a',
      type: 'Div',
      childrenIds: ['node_b'],
    },
    node_b: {
      id: 'node_b',
      type: 'Div',
      childrenIds: ['node_a'],
    },
  }),
};
