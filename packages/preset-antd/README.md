# @lowcode-platform/preset-antd

AntD 单一 ComponentPreset（[Issue #19](https://github.com/Chengbai2003/lowcode_platform/issues/19) / M0-4 Scope B）。

为一个 Renderer Host 提供唯一绑定的组件 Preset：运行时组件、Props 白名单 Manifest、
组件级 Validation 钩子与 Compiler 绑定。Registry 在 Bootstrap（模块加载）阶段经
`createSealedPreset` 构建即校验并深冻结——没有 `register()`、没有可变 Map。

## 子路径导出

| 入口                                       | 用途                                                       |
| ------------------------------------------ | ---------------------------------------------------------- |
| `@lowcode-platform/preset-antd`            | 全量导出（含 `antdPreset` 单例与 `createAntdPreset` 工厂） |
| `@lowcode-platform/preset-antd/runtime`    | 组件运行时注册表 `antdRuntime`                             |
| `@lowcode-platform/preset-antd/manifest`   | Props 白名单 `antdManifest`                                |
| `@lowcode-platform/preset-antd/validation` | 组件级 Validation 钩子 `antdValidation`                    |
| `@lowcode-platform/preset-antd/compiler`   | Compiler 绑定 `antdCompilerBindings`                       |

## 消费方式

```tsx
import { Renderer } from '@lowcode-platform/renderer';
import { antdPreset } from '@lowcode-platform/preset-antd';

// 一个 Renderer Host 只绑定一个 Preset；宿主自有组件经 components 注入
// （覆盖同类型 Preset 组件后，该类型不再受 Preset Manifest 约束）。
<Renderer preset={antdPreset} schema={schema} components={hostComponents} />;
```

编译预览默认与 Preview 消费同一份 Compiler 绑定（见
`packages/frontend/src/editor/services/compilerApi.ts`）：Preset 组件的
import 来源为 `@lowcode-platform/preset-antd/runtime`，其余回落到 `antd`。

## 安全语义（fail-close）

- 渲染前经 Manifest 白名单净化：未知 Props、函数型 Props、
  `dangerouslySetInnerHTML` 一律移除并告警，永不抵达组件实现；
- Validation 钩子对 `Link.href` / `Image.src` 做危险 scheme 检查
  （`javascript:` / `vbscript:` / `file:` / `about:` / 非图片 `data:`），
  命中即移除；
- 未知组件类型被 Renderer 拒绝渲染（占位标记，不吞异常行为）。

## 新增组件

在 `runtime.tsx` / `manifest.ts` / （可选）`validation.ts` / `compiler.ts`
中登记后经 `createSealedPreset` seal——Manifest 缺失会在 Bootstrap 阶段
直接抛错（fail-close），不需要也不会修改 Renderer 源码。

## 开发

```bash
pnpm --filter @lowcode-platform/schema-contract build
pnpm --filter @lowcode-platform/renderer build
pnpm --filter @lowcode-platform/preset-antd build
pnpm --filter @lowcode-platform/preset-antd test
```
