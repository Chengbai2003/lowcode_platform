# Renderer 开发指南

## 心智模型

可以把 renderer 理解为下面这条链路：

- 输入 schema
- 初始化 runtime
- 组件订阅 runtime
- 事件和 DSL 修改 runtime
- 只有在需要兼容时，兼容层才向外做镜像

只要保持这个结构，代码库就会更稳定、更可预测。

## 安全扩展点

新增能力时，优先从这些扩展点入手：

- 在 `src/renderer/executor/actions` 下新增或调整 DSL action
- 在 `src/renderer/executor/capability` 下扩展 Capability API
- 只有在确实需要 runtime 支撑订阅时，才新增 renderer 侧 hook
- 组件渲染逻辑尽量保留在 `ComponentRenderer` 和相关 helper 模块中

## 状态修改规则

- 输入和表单更新必须调用 `eventDispatcher.updateComponentData(...)`
- DSL 写入应通过 `context.runtime`
- custom script 写入必须限制在 Capability API 内
- 不要把兼容层 Redux state 当作主写入入口

## 读取规则

- 组件值通过 `useNodeValue` 获取
- schema props 表达式通过 `useResolvedSchemaProps` 获取
- 不允许在渲染链路中重新引入遗留 Redux selector

## 兼容 API

以下 API 仍然存在，但应视为遗留桥接层：

- `LowcodeProvider`
- `store`
- `useAppDispatch`
- `useAppSelector`
- `setComponentData` 及相关 action creator

它们对旧调用方可能仍有价值，但新的 renderer 功能不应再依赖它们。

## 测试检查清单

修改 renderer 行为时，至少应覆盖相关子集：

- 不依赖 `LowcodeProvider` 的独立渲染
- 跨组件响应式联动
- DSL 或 Capability 写路径
- 如果改动触及遗留 API，则验证兼容镜像行为

推荐重点关注这些测试：

- `src/renderer/__tests__/cross-component-reactivity.test.tsx`
- `src/renderer/__tests__/visibility.test.tsx`
- `src/renderer/__tests__/event-feedback.test.tsx`
- `src/renderer/__tests__/capability-api.test.ts`
- `src/renderer/__tests__/extension-actions.test.ts`

## 常见错误

- 从 `renderer/store` 新增读取路径
- 在 runtime 之外引入第二套写入源
- 将渲染期的 computed 逻辑和命令式写入混在一起
- 把 `LowcodeProvider` 当成必需基础设施

## 文件地图

- `src/renderer/Renderer.tsx`：renderer 入口
- `src/renderer/EventDispatcher.ts`：写入 facade 和 DSL 执行入口
- `src/renderer/ComponentRenderer.runtime.ts`：runtime 驱动的 hook
- `src/renderer/reactive/runtime.ts`：runtime 核心
- `src/renderer/store/*`：仅作为兼容桥接层
