# Renderer Runtime-Only 解耦实施计划

## 摘要

- 目标：完成 renderer 侧的彻底解耦，让 `ReactiveRuntime` 成为唯一运行态数据源，删除 Redux/compat 桥接、legacy 写路径和相关公开 API。
- 范围：只动 renderer/runtime/DSL 执行链，不改编辑器侧 `schema + Zustand + history` 的职责边界。
- 结果：编辑器层继续负责 `schema`、选中态、属性编辑、撤销/重做；运行态只负责渲染、表达式求值、事件 DSL 执行与联动更新，两者通过 `schema / eventContext / patch` 交互。

## 公开接口与类型变更

- 直接移除 `packages/frontend/src/renderer/index.tsx` 和 `packages/frontend/src/index.ts` 中以下导出：
  - `store`
  - `useAppDispatch`
  - `useAppSelector`
  - `setComponentData`
  - `setMultipleComponentData`
  - `clearComponentData`
  - `setComponentConfig`
  - `resetAllData`
- 删除 `packages/frontend/src/renderer/store/*` 与 `packages/frontend/src/renderer/store/compat.ts`，仓库内不再存在 renderer runtime 对这些模块的 import。
- `ExecutionContext` 调整为 runtime-first：
  - `runtime` 改为必备字段
  - 删除 `setComponentData`
  - 删除 `markFullChange`
  - `dispatch`、`getState` 改为可选 host hooks，只做透传，不再代表 renderer 内建状态同步能力
- `DSLExecutor.createContext()` 默认创建并注入 `ReactiveRuntime`，以后所有内建 action 都假定 runtime 存在。
- `CapabilityAPIOptions` 收口为仅接收 `runtime` 与 `validComponentIds`；删除 `getData` / `setComponentData` / `markFullChange`。
- `customScript` 的 capability 模式改为默认且唯一实现；移除 `capabilityScript` flag 和旧脚本路径。
- `LowcodeProvider` 本轮保留为无害 no-op；它不再与任何 store/compat 语义绑定，也不参与数据流。

## 实施计划

### 1. 切断 compat 与公开 Redux 面

- 删除 renderer store 目录及 compat action/selectors，实现层不再保留 “兼容桥”。
- 清理 `renderer/index.tsx` 与包根 `index.ts` 的 Redux/compat 导出。
- 仓库内所有测试、工具代码和示例导入改为不依赖 `store.dispatch(...)` 或 compat actions。
- 文档同步更新，明确 renderer 运行态已经不再是 Redux 模型。

### 2. 收口 `EventDispatcher` 为 runtime 唯一执行中枢

- 重构 `EventDispatcher`，删除：
  - runtime -> compat store 镜像
  - compat store -> runtime 回读
  - 失败后根据 store 状态补写 executionContext 的逻辑
- `EventDispatcher` 只负责：
  - 初始化 `ReactiveRuntime` 的 `data/state/formData/components`
  - 在 `setContext()` 时同步 namespace 到 runtime
  - 通过 `getExecutionContext()` 暴露 runtime 快照
  - 通过 version / dirty-path 驱动订阅与选择性重算
- `updateComponentData()` 直接写 runtime，不再 dispatch compatibility action。
- `getExecutionContext()` 返回的上下文以 runtime 快照为准，不再包含任何 compat 语义。
- 所有嵌套/派生上下文都必须保留 runtime：
  - `DSLExecutor.createContext()`
  - `Table` 组件里的手动 fallback context
  - flow/loop 等会复制上下文的 action

### 3. 将所有内建写路径改成 runtime-only

- `dataActions.setValue`
  - 删除 direct mutation 到 `context.data/state/formData`
  - 删除 `dispatch({ type: 'SET_FIELD' ... })`
  - 删除 `markFullChange`
  - 所有写入都走 `context.runtime.set(...)`
- `asyncActions.apiCall`
  - `resultTo` 只走 `context.runtime.set(...)`
  - 删除 direct mutation + 全量失效兜底
- `CapabilityAPI`
  - `get/set/patch` 只基于 `runtime`
  - 去掉 `getData` / `setComponentData` / `markFullChange` fallback
- `extensionActions.customScript`
  - 统一走 capability sandbox
  - 删除旧路径对 `dispatch/getState` 的直接暴露
  - 删除 `capabilityScript` flag 分支
  - 保留 `enableCustomScript` 作为是否允许执行 `customScript` 的唯一开关
- 清理所有 runtime 源码里的 legacy 注释和 Phase 2 过渡说明，避免后续维护时误以为仍存在双路径。

### 4. 同步 consumer、测试辅助与文档

- `DSLExecutor.createContext()` 默认创建 runtime，测试辅助统一复用它，避免测试继续手搓无 runtime 的上下文。
- `Table` 组件的 fallback `ExecutionContext` 改成通过 `DSLExecutor.createContext()` 构造，确保行级模板求值和 action 执行也走 runtime。
- 更新 README / `project_summary.md` / `PROJECT_REVIEW.md` 中关于“渲染器状态 = Redux”“编辑器 Zustand + 渲染器 Redux 分离”的表述，改成 “编辑器层 + ReactiveRuntime 运行态执行层”。
- 变更说明里显式标记为 breaking change：外部若仍依赖 renderer store/action，需要迁移到 runtime/eventContext 集成。

## 回归测试与新增测试点

### 必跑现有测试

- `packages/frontend/src/renderer/__tests__/cross-component-reactivity.test.tsx`
- `packages/frontend/src/renderer/__tests__/visibility.test.tsx`
- `packages/frontend/src/renderer/__tests__/event-feedback.test.tsx`
- `packages/frontend/src/renderer/__tests__/capability-api.test.ts`
- `packages/frontend/src/renderer/__tests__/extension-actions.test.ts`
- `packages/frontend/src/renderer/executor/__tests__/dataActions.test.ts`
- `packages/frontend/src/renderer/executor/__tests__/asyncActions.test.ts`
- `packages/frontend/src/components/components/Table.test.tsx`
- `packages/frontend/src/editor/components/PropertyPanel/PropertyPanel.preview-link.test.tsx`
- `pnpm type-check`

### 需要重写或删除的旧测试

- 所有断言 “runtime 与 compatibility layers 保持镜像” 的用例，改为断言 “runtime 是唯一数据源”。
- 所有通过 `store.dispatch(setComponentData(...))` 驱动 renderer 行为的用例，改为通过 `EventDispatcher` / action / user event 驱动。
- 所有断言 `setComponentData`、`setMultipleComponentData`、`markFullChange` 被调用的 capability/data/async 测试，改为断言 `runtime.set` / `runtime.patch` / dirty-path 行为。
- 所有依赖 `capabilityScript` flag 开关旧路径的测试，改为默认 capability sandbox 行为。

### 必增回归场景

- `Renderer` 不包 `LowcodeProvider` 仍可运行，且与包裹时行为一致。
- `EventDispatcher.updateComponentData()` 只写 runtime；`getExecutionContext().data` 能反映最新 runtime 快照。
- `EventDispatcher.setContext('data'|'state'|'formData'|'components')` 后，runtime namespace 正确更新，dirty-path/version 正常递增。
- `setValue` 覆盖：
  - 顶层 data 写入
  - `state.*` 写入
  - `formData.*` 写入
  - `merge=true` 对象合并
  - 非法 key / 原型污染路径拦截
- `apiCall.resultTo` 写入 runtime 后，依赖该路径的表达式、显隐和联动能自动更新。
- `customScript` 中 `$.set` / `$.patch` 可以触发联动；脚本不能通过 `data/formData` 快照直写绕过 runtime。
- schema 变更后 `components` namespace 能同步进 runtime，`CapabilityAPI` 的合法 id 校验仍正确。
- `ComponentRenderer.runtime` 依赖订阅仍按 dirty-path 精准更新，不退化成全量刷新。
- 包根入口和 `renderer` 入口在删除 Redux 导出后仍能通过类型检查与构建；仓库内不存在残留导入。

### 推荐回归命令

```bash
pnpm type-check
pnpm --filter @lowcode-platform/frontend test -- --run \
  src/renderer/__tests__/cross-component-reactivity.test.tsx \
  src/renderer/__tests__/visibility.test.tsx \
  src/renderer/__tests__/event-feedback.test.tsx \
  src/renderer/__tests__/capability-api.test.ts \
  src/renderer/__tests__/extension-actions.test.ts \
  src/renderer/executor/__tests__/dataActions.test.ts \
  src/renderer/executor/__tests__/asyncActions.test.ts \
  src/components/components/Table.test.tsx \
  src/editor/components/PropertyPanel/PropertyPanel.preview-link.test.tsx
```

## 验收标准与默认决策

- 默认这是一次允许 breaking change 的重构，不保留 Redux/compat 过渡壳。
- `ReactiveRuntime` 是唯一运行态真相源；renderer 内建代码里不再出现 `renderer/store/*`、`compat.ts`、`setComponentData`、`markFullChange` 的依赖。
- `ExecutionContext` 统一带 `runtime`；若外部直接手写 `ExecutionContext`，也必须自行提供 runtime，或改用 `DSLExecutor.createContext()`。
- `dispatch/getState` 作为 host hooks 保留为可选字段，但 renderer 内建能力不再依赖它们。
- `LowcodeProvider` 本轮保留；它不是架构耦合点，删除它不属于这轮解耦验收条件。
- `customScript` 统一收敛到 capability API 模式；旧默认脚本路径与 `capabilityScript` 灰度开关一并下线。
