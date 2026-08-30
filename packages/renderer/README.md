# @lowcode-platform/renderer

A2UI 低代码平台运行时渲染器（[Issue #19](https://github.com/Chengbai2003/lowcode_platform/issues/19) / M0-4）。

将 `@lowcode-platform/schema-contract` 校验通过的 PageSchema 渲染为 React 组件树。

## 设计边界

- **单一真相源**：渲染入口只接受 Contract 返回的 canonical 深冻结 Schema（`requireSupportedPageSchema`，fail-close）。渲染树不读取原始输入 Schema，同引用变异不会影响后续渲染。
- **不依赖编辑器**：本包不依赖 Editor / AI Assistant / PropertyPanel（由 `pnpm check:architecture` 门禁强制）。
- **React / ReactDOM 是 peerDependencies**：宿主应用自行提供 React 18/19。
- **不污染全局**：Renderer 不把任何运行时对象挂到可变 `window` 全局。
- **内置组件是临时态**：`builtInComponents`（含 antd Typography）将在 Scope B（M0-4b）迁往 `@lowcode-platform/preset-antd`，Renderer 本体不出现组件库条件分支。

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

页面级 RuntimeSession 隔离（`pageId + documentSessionId`、`dispose()`、异步回调失效）属于
Scope D（M0-4d），落地前宿主通过 `createRendererHost` 自行管理挂载生命周期。

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
