# M1F-2 B4：第二个可信 Preset 执行记录（Issue #39）

> 状态：已实施、待验收（Draft PR）。本文记录 B4 的部署组合、验收证据与已知限制，
> 不代表 Issue #39 已关闭。

## 1. 新包：@lowcode-platform/preset-test

- 路径 `packages/preset-test`，workspace/private，不发布 npm。
- 仅依赖 `@lowcode-platform/renderer` + React；无 UI 库。
- 身份常量：`TEST_PRESET_ID = 'builtin-test'`、`TEST_PRESET_VERSION = '0.1.0'`、
  `TEST_RUNTIME_COMPATIBILITY`（内嵌 `RENDERER_VERSION`）。
- 组件与 Props（Manifest 白名单 = 公共项 + 专属项）：

| 类型        | DOM 标记                       | 专属 Props                   | 公共 Props                                        |
| ----------- | ------------------------------ | ---------------------------- | ------------------------------------------------- |
| `Container` | `data-preset-test="container"` | `width` `padding` `center`   | `children` `className` `style` `id` `title` `key` |
| `Text`      | `data-preset-test="text"`      | `strong` `size`              | 同上                                              |
| `Button`    | `data-preset-test="button"`    | `variant` `disabled` `block` | 同上                                              |

- 交互不经组件内写死 onClick：统一走 Renderer `events` 机制（Manifest 净化后注入）。
- `/runtime` 子路径额外导出最小 `message`（success/error/warning/info）：
  generator 的 feedback 动作固定从 `defaultLibrary` 导入 `message`，
  antd 由 `defaultLibrary: 'antd'` 满足，本包由自身 runtime 满足。
- Compiler Binding：全部类型绑定 `@lowcode-platform/preset-test/runtime`，
  `allowDefaultComponentFallback: false`（未知组件不回退默认库）。
- Agent Meta（部署侧静态）：`test-component-manifest.ts`，仅注册上述三类型；
  别名 `Shell→Container`、`Caption→Text`、`Action→Button`（与 AntD 的
  `Btn/Box/Section` 等互不共享）。

## 2. 部署组合选择表

组合在进程启动时一次确定（`packages/backend/src/modules/runtime-profile/deployment-composition.ts`），
两个组合共享同一份静态资产（Compiler Bindings + 版本化 Meta），差异仅是 default 系统的 active 指向。
不存在运行中切换全局 current 的入口；未知组合取值在启动时 fail-close。

| 部署        | 启动命令                                                        | default active       | antd Profile | test Profile                 | 绑定/Meta 来源                 | Frontend Catalog 资产                    |
| ----------- | --------------------------------------------------------------- | -------------------- | ------------ | ---------------------------- | ------------------------------ | ---------------------------------------- |
| 正常部署    | `pnpm dev:backend`                                              | `builtin-antd@0.1.0` | active       | deprecated（只承接历史快照） | 静态组合（antd+test 全量注册） | `antdPreset` + `testPreset` 均已打包注册 |
| B4 验收部署 | `LOWCODE_DEPLOYMENT_COMPOSITION=b4-acceptance pnpm dev:backend` | `builtin-test@0.1.0` | deprecated   | active                       | 同上（同一份资产对象）         | 同上                                     |
| A→B 升级    | 先以正常部署创建 A 页面，再以上述验收组合重启                   | `builtin-test@0.1.0` | deprecated   | active                       | 同上                           | 同上                                     |

要点：

- 正常部署中新页面仍绑定 antd（`resolveSystem('default')` 只返回唯一 active）。
- 升级不迁移数据：旧 antd 页面在验收组合下继续以 antd 保存/读取/预览/Agent/编译；
  新页面绑定 test。
- 两个组合下另一方的 Meta 与 Compiler Binding 仍可精确解析（deprecated 允许历史执行），
  因此跨组合重启不会让历史页面不可读。

## 3. 首次创建（B 页面真实创建入口）

无 pageId 的 AntD 草稿不是第二 Preset 的新建入口（保持不动）。B 页面经
真实服务端保存入口创建：

1. 验收组合下启动后端；前端打开一个新的 pageId。
2. GET 404 → 前端用该 Preset 支持的初始 Schema（Container/Text/Button）
   调 `PUT /api/v1/pages/:pageId/schema`（无 `basePageVersion`）。
3. 服务端此刻绑定 default active（test）身份并写入快照三元组。
4. 前端重新 GET，用服务端返回的 `runtimeCompatibility` 经
   `BUILTIN_RENDERER_PRESET_CATALOG` 解析 `testPreset`，进入真实 Editor 链。

## 4. 生成代码消费

- 真实 generator 输出（`scripts/b4-second-preset-compile.cjs` 桥 + 真实
  `testCompilerBindings`）：
  `import { Button, Container, Text, message } from "@lowcode-platform/preset-test/runtime";`
- 消费验证（`packages/frontend/src/editor/__tests__/b4-generated-code-consumption.test.tsx`）：
  transpile + 受限 require（仅 react 与真实 preset-test runtime 模块）→ jsdom 挂载 →
  断言 `data-preset-test` DOM 标记、点击 feedback/setValue 行为，并与真实 Renderer
  渲染同一 schema 的结果对照。

## 5. 验收证据映射（Issue #39 / B4 DoD）

| 链路/场景                                                                                 | 证据                                                                                                |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 新包资产一致性（runtime/manifest/validation/compiler 键一致、seal、版本对齐、净化、点击） | `packages/preset-test/src/__tests__/preset.test.tsx`（12 用例）                                     |
| 部署组合不变量、启动 fail-close、Meta/Runtime 防漂移                                      | `packages/backend/src/modules/runtime-profile/__tests__/deployment-composition.spec.ts`（9 用例）   |
| B active 新建：服务端生成 B tuple、Schema 无身份字段、伪造参数被忽略                      | `b4-second-preset.integration.spec.ts` S1                                                           |
| B 回读（加载/预览身份）                                                                   | 同上 S2                                                                                             |
| Agent 读 B Meta/aliases、合法 Patch 预览、A 独有类型/别名被拒绝（结构合法证明）           | 同上 S3                                                                                             |
| 确认后经真实 CAS 保存、过期版本冲突                                                       | 同上 S4                                                                                             |
| Compiler B：真实 generator、导入路径实际可解析、message 命名导出                          | 同上 S5                                                                                             |
| A→B 静态升级：旧 A 保存/预览/Agent/编译仍 A，新页面 B                                     | 同上 S6                                                                                             |
| 跨组合延续：B 页面回到正常部署仍可保存（deprecated 允许）                                 | 同上 S7                                                                                             |
| A/B 交错：Meta/别名/编译来源不串用（同名 Button）                                         | 同上 S8                                                                                             |
| disabled/unknown/mismatch 拒绝（保存/编译/Agent 执行）                                    | 同上 S9                                                                                             |
| 前端真实 Catalog 双 Preset 并存、精确解析、版本不匹配 fail-close                          | `b4-frontend-second-preset.test.tsx`（7 用例）                                                      |
| 前端加载链：PreviewPane 接线 + 真实 Renderer DOM 标记（非仅 prop）                        | 同上                                                                                                |
| 前端组件白名单只来自当前 Preset runtime                                                   | 同上                                                                                                |
| 前端 A/B 交错切页、404 bootstrap 真实创建入口、mismatch 不挂载                            | 同上                                                                                                |
| 生成代码可解析/可构建/可挂载、点击与 Renderer 一致                                        | `b4-generated-code-consumption.test.tsx`（2 用例）                                                  |
| 正常 AntD 部署体验不变                                                                    | 默认组合 antd active；既有 B1/B2/B3、M1a、PageSchema/Repository、Agent、Compiler、Frontend 全量回归 |

## 6. 已知限制

- 编辑器 PropertyPanel/ComponentTree 的属性面板仍消费遗留全局
  `componentRegistry`（AntD Meta），不随页面 Preset 切换；JSON/Logic 保存白名单
  已按当前 Preset runtime 收敛。属性面板的 Preset 化不在 B4 范围。
- 无 pageId 草稿仍默认 AntD（`usePageLifecycle` 显式行为），不宣称支持任意默认 Preset。
- `b4-acceptance` 是验收组合，不是生产多 Preset 租户方案；页面级 Preset 选择、
  动态模块加载、数据库 Registry、跨 Preset 自动迁移均不在 B4 范围。
- ADR-0002「单系统单 Preset」语义不变：default 系统任意时刻只有一个 active Profile。

## 7. 恢复记录

- 回退 B4 只需 revert 本 PR：新包目录、组合文件与注册行均为新增，正常部署行为
  （antd active）在合并前后等价。
