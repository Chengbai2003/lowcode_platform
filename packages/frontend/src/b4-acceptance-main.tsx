/**
 * B4 验收隔离 Demo 入口（Issue #39 / M1F-2 B4，review Spec#4）。
 *
 * 面向 `LOWCODE_DEPLOYMENT_COMPOSITION=b4-acceptance` 的后端部署组合：
 * 打开 /b4-acceptance.html?pageId=<id> 时，若页面不存在则用 builtin-test
 * 支持的初始 Schema 走 404 bootstrap 真实创建，随后按服务端返回的
 * runtimeCompatibility 解析 Preset 进入真实编辑/预览链。
 * 这不是通用 Preset 选择器——页面身份完全由服务端快照决定。
 */
import { createRoot } from 'react-dom/client';
import './index.css';
import { LowcodeEditor } from './editor/LowcodeEditor';
import type { PageSchema } from './editor/types';

const B4_INITIAL_SCHEMA: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Container', childrenIds: ['intro', 'cta'] },
    intro: {
      id: 'intro',
      type: 'Text',
      props: { children: 'B4 验收页面（builtin-test）', size: 'lg' },
    },
    cta: {
      id: 'cta',
      type: 'Button',
      props: { children: 'test 按钮', variant: 'solid' },
      events: {
        onClick: [
          { type: 'feedback', kind: 'message', content: 'b4 acceptance click', level: 'success' },
        ],
      },
    },
  },
};

const pageId = new URLSearchParams(window.location.search).get('pageId') ?? 'b4-acceptance-demo';

const feedbackMessage = {
  success: (content: unknown) => console.info('[b4-acceptance:success]', content),
  error: (content: unknown) => console.error('[b4-acceptance:error]', content),
  warning: (content: unknown) => console.warn('[b4-acceptance:warning]', content),
  info: (content: unknown) => console.info('[b4-acceptance:info]', content),
};

const root = createRoot(document.getElementById('root')!);
root.render(
  <LowcodeEditor
    pageId={pageId}
    projectName="B4 第二可信 Preset 验收"
    initialSchema={B4_INITIAL_SCHEMA}
    eventContext={{ ui: { message: feedbackMessage } }}
  />,
);
