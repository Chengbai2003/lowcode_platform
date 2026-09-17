# @lowcode-platform/preset-test

第二个可信 ComponentPreset（Issue #39 / M1F-2 B4 验收参考包）。

## 定位

这不是通用生产 UI 库，而是**可信 Preset 扩展闭环的最小验收参考**：仅使用
React 与基础 DOM 元素（无任何 UI 库依赖），证明一个新增的静态打包 Preset
可以经部署 Registry、Frontend Catalog 与六条消费链（保存、加载、预览、
渲染、Agent Meta/编辑、Compiler 导出）完成真实闭环。

## 组件集合

| 类型        | DOM                                  | 专属 Props（另含公共白名单） | 说明                                               |
| ----------- | ------------------------------------ | ---------------------------- | -------------------------------------------------- |
| `Container` | `<div data-preset-test="container">` | `width` `padding` `center`   | 页面根容器/布局                                    |
| `Text`      | `<span data-preset-test="text">`     | `strong` `size`              | 文本展示                                           |
| `Button`    | `<button data-preset-test="button">` | `variant` `disabled` `block` | 与 AntD 同名按钮，DOM 标记与等宽虚线样式可暴露错配 |

三个组件都带 `data-preset-test` 标记与可辨识样式：如果页面被错误地用
AntD Preset 渲染（或反之），DOM 标记会立刻暴露错配。

## 安全语义

- Runtime / Manifest / Validation / Compiler 四类资产在模块加载时经
  `createSealedPreset` 组装并深冻结，无任何运行时注册入口。
- Props 白名单由 Renderer 的 `sanitizePropsByManifest` fail-close 执行：
  白名单外 Props、危险 HTML、函数型 Props 一律移除。
- **Runtime 自防御（编译消费路径）**：Compiler 生成代码直接 import 本包
  runtime、不经过 Renderer 净化，因此组件对未知 Props 自身 fail-close——
  只透传 `className/id/title`（标量）与 `on[A-Z]` 且值为函数的事件 handler
  （events 机制合法形态）；字符串型 `on*`（如 `onerror="alert(1)"`）、
  `dangerouslySetInnerHTML`、任意其他属性一律丢弃，两条消费路径 DOM 输出一致。
- 组件不接收可执行函数、不直接调用执行器；交互统一走 Renderer 的
  `events` 机制（`onClick` 等在 Manifest 净化之后由 ComponentRenderer 注入）。
- Compiler 绑定指向本包真实子路径导出 `@lowcode-platform/preset-test/runtime`，
  `allowDefaultComponentFallback: false`（未知组件不回退默认库）。
- `/runtime` 导出最小 `message` 与 `notification`（success/error/warning/info，
  console 实现）：generator 的 feedback 动作固定从 defaultLibrary（本包 runtime）
  导入这两个 API，保证生成代码开箱可运行。

## 版本常量

- Preset 身份：`builtin-test` / `0.1.0`（`TEST_PRESET_ID` / `TEST_PRESET_VERSION`）。
- 兼容性三元组：`TEST_RUNTIME_COMPATIBILITY`（内嵌打包时的 `RENDERER_VERSION`）。
- Manifest 修订号：`TEST_MANIFEST_VERSION = '1'`。

## 子路径导出

| 入口           | 内容                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `.`            | 全部公开导出（preset 单例/工厂、版本常量、四类资产）                                                             |
| `./runtime`    | `testRuntime` 组件注册表（`Container` / `Text` / `Button`）+ 编译 feedback 依赖的最小 `message` / `notification` |
| `./manifest`   | `testManifest` Props 白名单                                                                                      |
| `./validation` | `testValidation`（该组件集无资源类 Props，为空注册表）                                                           |
| `./compiler`   | `testCompilerBindings` 编译绑定                                                                                  |

## 开发

```bash
pnpm --filter @lowcode-platform/preset-test build      # tsc → dist/
pnpm --filter @lowcode-platform/preset-test test       # vitest run
pnpm --filter @lowcode-platform/preset-test type-check
```
