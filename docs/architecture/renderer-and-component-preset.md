# Renderer 与 ComponentPreset 架构

> Status: Draft  
> Last Updated: 2026-08-30  
> Target Milestone: M0-4

## 目标

将 Renderer 从编辑器应用中抽离为独立运行包。系统 Shell 全局加载 Renderer 和当前系统唯一的 ComponentPreset，后续页面只加载 PageSchema JSON，并为每个页面创建独立 RuntimeSession。

## 包结构

```text
@lowcode-platform/schema-contract
@lowcode-platform/renderer
@lowcode-platform/preset-antd
```

现阶段 `runtime`、`executor`、`reactive` 作为 Renderer 内部模块，不额外拆包。只有出现明确的非 React 消费端后再抽离 runtime-core。

## 单系统单 Preset

```ts
interface SystemRuntimeProfile {
  systemId: string;
  componentPresetId: string;
  componentPresetVersion: string;
  rendererVersion: string;
  themeVersion?: string;
}

interface ComponentPreset {
  id: string;
  version: string;
  runtime: ComponentRegistry;
  manifest: ComponentManifestRegistry;
  validation: ComponentValidationRegistry;
  compiler: ComponentCompilerRegistry;
}
```

Renderer 只接收一个 Preset，不在组件节点或运行时中判断 AntD、Arco 等组件库名称。

新增组件库只需新增：

```text
packages/preset-arco/
├── runtime.ts
├── manifest.ts
├── validator.ts
├── compiler.ts
└── index.ts
```

## 系统启动

```ts
const rendererHost = createRendererHost({
  systemProfile,
  preset: antdPreset,
  hostCapabilities: {
    navigate: safeNavigate,
    feedback: feedbackAdapter,
    executeDataSource: gatewayExecutor,
    requestConfirmation: confirmationAdapter,
  },
});
```

```tsx
<RendererHostProvider value={rendererHost}>
  <App />
</RendererHostProvider>
```

ES Module 在同一 SPA Document 内天然只执行一次，不需要把 Renderer 挂到可变的 `window` 全局对象。如果系统使用完整 HTML 跳转，只能依赖浏览器缓存减少下载，无法跨 Document 共享内存实例。

## 页面 Session

```tsx
<PageRenderer
  schema={pageSchema}
  pageId={pageId}
  pageVersion={pageVersion}
  documentSessionId={documentSessionId}
/>
```

```ts
interface RuntimeSession {
  readonly id: string;
  getState(): Readonly<Record<string, unknown>>;
  executeFlow(flowId: string, input?: unknown): Promise<unknown>;
  dispose(): void;
}
```

`dispose()` 必须：

- Abort 未完成的数据源请求。
- 取消 delay 和 timer。
- 清理订阅、事件监听和 tracking cache。
- 阻止旧异步回调写入新页面。
- 释放页面 State、Computed、Flow 栈和组件实例引用。

Session 身份不能只使用 `rootId`。至少需要绑定 `pageId + documentSessionId`，并在页面上下文变化时重建。

## 全局共享与页面隔离

| 内容                         | 生命周期            |
| ---------------------------- | ------------------- |
| Renderer 代码                | 系统全局一次        |
| ComponentPreset 代码与 CSS   | 系统全局一次        |
| 只读 Component Registry      | 系统全局一次        |
| 协议常量与安全白名单         | 系统全局一次        |
| Host Capability 包装         | 系统全局只读        |
| Schema                       | 页面只读            |
| State / Computed             | RuntimeSession 独立 |
| Flow 执行栈                  | RuntimeSession 独立 |
| 请求、AbortController、timer | RuntimeSession 独立 |
| Tracking WeakMap 与订阅      | RuntimeSession 独立 |

## Registry 不可变

Registry 只能在 Bootstrap 阶段由可信 Preset 构建，随后 seal。运行时不暴露 `register()`、原始 Map 或可变对象引用。

```ts
const registry = createSealedRegistry(preset.runtime);
```

组件只能查询和渲染，不能替换其他组件实现。

## Props 处理

Renderer 不直接执行：

```tsx
<Component {...node.props} />
```

正确流程：

```ts
const safeProps = preset.validation.validateAndSanitize(node.type, node.props);
const Component = registry.resolve(node.type);
```

```tsx
<Component {...safeProps} />
```

Manifest 是 Agent 生成提示和 Validator 的共同来源，但 Prompt 不是安全边界。Validator 必须独立拒绝未知组件、未知 Props、函数型 Props 和危险 DOM 能力。

## ComponentRuntimeBridge

组件包不能反向导入 Renderer 的内部 Executor、EventDispatcher 或表达式解析器。Renderer 通过稳定公共接口向组件注入受控能力：

```ts
interface ComponentRuntimeBridge {
  resolveValue(value: unknown, scope?: unknown): unknown;
  executeActions(
    actions: ActionList,
    event?: unknown,
    extraContext?: Record<string, unknown>,
  ): Promise<unknown>;
  getResource(resourceId: string): Readonly<DataResourceState>;
}
```

这可以消除当前 Table 等组件对 Renderer 内部实现的反向依赖。

> 实施说明（M0-4c）：`dispatchFlow` 面向 M1a 的具名 Flow，落地前以
> `executeActions`（执行 Schema 内联 ActionList，覆盖表格行按钮等现状）代替；
> `getResource` 已按 M1b 前默认 deny 实现（冻结的 error 态，fail-close）。
> 桥由 Renderer 挂载时创建，经 `ComponentRuntimeBridgeContext` /
> `useComponentRuntimeBridge` 注入；在 Renderer 之外直接渲染组件时桥为
> `null`，组件需自行降级（如禁用交互按钮）。

## 最小消费验收

M0-4 应提供独立示例：

```tsx
import { PageRenderer, createRendererHost } from '@lowcode-platform/renderer';
import { antdPreset } from '@lowcode-platform/preset-antd';

const host = createRendererHost({ preset: antdPreset, hostCapabilities });

createRoot(document.getElementById('root')!).render(
  <PageRenderer host={host} schema={schemaJson} documentSessionId="demo-session" />,
);
```

验收必须覆盖：

- 两个页面并行渲染不串 State。
- 同 rootId 切页不复用旧 Session。
- Registry 和 Schema 无法被组件修改。
- 非法 JSON 在创建 Session 前被拒绝。
- 页面卸载后请求、timer 和订阅全部停止。
- Renderer 构建产物不包含 Editor、AI Assistant 和 PropertyPanel。
- 新增测试 Preset 时不修改 Renderer 源码。

## 实施状态（2026-08）

M0-4 Scope A 已落地（Issue #19 / M0-4a）：`@lowcode-platform/renderer` 独立包（`packages/renderer`）承接原 `packages/frontend/src/renderer` 的全部渲染实现与测试；React/ReactDOM 为 peerDependencies；运行态执行类型（`ActionHandler`/`ExecutionContext`/`ActionResult`/`DSLExecutor` 等）随包内 `dsl` 子路径（`@lowcode-platform/renderer/dsl`）导出；公开入口导出 `PageRenderer`，`createRendererHost`（`@lowcode-platform/renderer/host`）提供最小 React Host；渲染入口保持 `requireSupportedPageSchema` fail-close；`pnpm check:architecture` 强制 Renderer 包不依赖 Frontend/Editor、不把运行时对象挂到可变 `window` 全局；前端消费面全部改从包导入，CI 增加 `build:packages` 守护 workspace 包 dist 的 rollup 可消费性。

尚未完成：Scope B `preset-antd`（`builtInComponents` 仍在 Renderer 包内临时依赖 antd Typography）、Scope D RuntimeSession（`createRuntimeSession`/`dispose`，本文示例中的 `host`/`documentSessionId` 形态）、Scope E HostCapabilities。Scope C ComponentRuntimeBridge 已落地（M0-4c）：Table 已改经 `useComponentRuntimeBridge` 消费受控能力，架构门禁禁止组件库 import 执行器并正向断言 Table 走桥。
