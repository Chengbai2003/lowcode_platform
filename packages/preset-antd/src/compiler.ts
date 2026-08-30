/**
 * @lowcode-platform/preset-antd/compiler
 *
 * AntD Preset 的 Compiler 绑定（Issue #19 / M0-4 Scope B）。
 *
 * 告知代码生成器：Preset 自身组件从本包 /runtime 子路径 import，
 * 其余组件类型回落到 defaultLibrary（antd）。宿主覆盖的组件由宿主
 * 通过编译选项提供自己的来源。
 */

import type { CompilerBindings } from '@lowcode-platform/renderer';

const RUNTIME_MODULE = '@lowcode-platform/preset-antd/runtime';

export const antdCompilerBindings: CompilerBindings = Object.freeze({
  defaultLibrary: 'antd',
  componentSources: Object.freeze({
    Page: RUNTIME_MODULE,
    Div: RUNTIME_MODULE,
    Span: RUNTIME_MODULE,
    Container: RUNTIME_MODULE,
    Row: RUNTIME_MODULE,
    Col: RUNTIME_MODULE,
    Text: RUNTIME_MODULE,
    Title: RUNTIME_MODULE,
    Paragraph: RUNTIME_MODULE,
    Input: RUNTIME_MODULE,
    Button: RUNTIME_MODULE,
    TextArea: RUNTIME_MODULE,
    Image: RUNTIME_MODULE,
    Link: RUNTIME_MODULE,
  }),
});
