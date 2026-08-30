# @lowcode-platform/renderer

A2UI 低代码平台运行时渲染器（[Issue #19](https://github.com/Chengbai2003/lowcode_platform/issues/19) / M0-4）。

将 `@lowcode-platform/schema-contract` 校验通过的 PageSchema 渲染为 React 组件树。

## 设计边界

- **单一真相源**：渲染入口只接受 Contract 返回的 canonical 深冻结 Schema（`requireSupportedPageSchema`，fail-close）。渲染树不读取原始输入 Schema，同引用变异不会影响后续渲染。
- **不依赖编辑器**：本包不依赖 Editor / AI Assistant / PropertyPanel（由 `pnpm check:architecture` 门禁强制）。
- **React / ReactDOM 是 peerDependencies**：宿主应用自行提供 React 18/19。
- **不污染全局**：Renderer 不把任何运行时对象挂到可变 `window` 全局。
- **组件库零依赖**：Renderer 本体不含任何内置组件与组件库（antd 等）。基础组件由 Preset 层提供（Scope B / M0-4b 起为 `@lowcode-platform/preset-antd`），宿主经 `preset` prop 绑定单一 Preset，宿主自有组件经 `components` prop 注入并可覆盖 Preset 组件。

## 安装与消费

```jsonc
// 宿主 package.json
{
  "dependencies": {
    "@lowcode-platform/renderer": "workspace:*",
    "@lowcode-platform/schema-contract": "workspace:*",
  },
}
```

子路径导出：

| 入口                              | 用途                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `@lowcode-platform/renderer`      | `PageRenderer`、`Renderer`、`renderFromJSON`、校验工具等                         |
| `@lowcode-platform/renderer/host` | `createRendererHost`（最小 React Host，DOM 生命周期收敛点）                      |
| `@lowcode-platform/renderer/dsl`  | 渲染器运行态执行类型（`ActionHandler` / `ExecutionContext` / `ActionResult` 等） |

## 最小 React Host 示例

```tsx
import { createRendererHost } from '@lowcode-platform/renderer/host';
import type { PageSchema } from '@lowcode-platform/schema-contract';

const schema: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: [] },
  },
};

const host = createRendererHost(document.getElementById('app')!, { schema });

// Schema 更新（例如编辑器推送新版本）
host.update({ schema: nextSchema });

// 页面离开时释放
host.unmount();
```

## RuntimeSession（M0-4 Scope D）

提供 `pageId + documentSessionId` 时，Renderer 每次挂载创建独立 RuntimeSession，
`documentSessionId` 变化或卸载时销毁旧 Session：

```tsx
<Renderer preset={antdPreset} pageId="page-42" documentSessionId={docSessionId} schema={schema} />
```

- Session 独立持有 State/Computed（ReactiveRuntime）、执行栈、AbortController、
  timers、tracked cleanups 与 generation；同 Schema 两次挂载不共享状态。
- `dispose()` 清除 timer、abort in-flight 请求；`apiCall`/`delay` 感知 Session，
  dispose 后旧异步回调不再写回状态（返回 `aborted`）。
- 非 React 宿主可直接使用 `createRuntimeSession` / `getOrCreateRuntimeSession` /
  `disposeRuntimeSession`。

## ComponentRuntimeBridge（M0-4 Scope C）

渲染树中的组件（如 Table）不得反向导入 Renderer 内部执行器（DSLExecutor / valueResolver /
EventDispatcher 实现），受控能力一律经桥消费：

```tsx
import { useComponentRuntimeBridge } from '@lowcode-platform/renderer';

function RowActions({ actions }: { actions: ActionList }) {
  const bridge = useComponentRuntimeBridge();
  if (!bridge) {
    // Renderer 之外直接渲染组件：桥为 null，组件自行降级
    return <button disabled>执行</button>;
  }
  return <button onClick={() => bridge.executeActions(actions)}>执行</button>;
}
```

- `resolveValue(value, scope?)`：解析表达式/模板值，scope 合并进行级上下文。
- `executeActions(actions, event?, extraContext?)`：执行 Schema ActionList。
- `getResource(resourceId)`：M1b 前默认 deny（冻结的 error 态，fail-close）。

桥由 Renderer 挂载时创建并经 Context 注入；组件测试可用
`ComponentRuntimeBridgeContext.Provider` 注入桩实现。

## 契约校验 API

- `validateA2UISchema(input)`：严格校验并返回 canonical 深冻结对象，失败抛 `SchemaValidationError`。
- `safeValidateA2UISchema(input)`：同上，但以 `{ success, data | error }` 返回。
- `validateA2UISchemaWithWhitelist(input, whitelist)`：附加组件类型白名单。
- `validateAndAutoFixA2UISchema(input, whitelist?)`：先 AutoFix（无版本迁移、descriptor-safe），再校验。

## 开发

```bash
pnpm --filter @lowcode-platform/schema-contract build   # 前置：Contract dist
pnpm --filter @lowcode-platform/renderer build
pnpm --filter @lowcode-platform/renderer test
```
