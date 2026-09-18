# M1F-2 B4：第二个可信 Preset 执行记录（Issue #39）

> 状态：已合入 main (PR #62, commit 1c45285)；阶段 0 基线收口已完成。
> 本文记录 B4 的部署组合、阶段 0 收口成果、验收证据与已知限制。不代表 Issue #39 已关闭。

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

## 3. 首次创建（B 页面真实创建入口，可执行步骤）

无 pageId 的 AntD 草稿不是第二 Preset 的新建入口（保持不动）。B 页面经
真实服务端保存入口创建，以下步骤可直接执行（review Spec#4）：

```bash
# 1) 以 B4 验收组合启动后端（端口与 API_SECRET 见 packages/backend/.env*）
LOWCODE_DEPLOYMENT_COMPOSITION=b4-acceptance pnpm --filter @lowcode-platform/backend dev

# 2) 用真实保存入口创建页面并回读服务端三元组（校验绑定 builtin-test）
node scripts/b4-acceptance-bootstrap.mjs \
  --base-url http://127.0.0.1:3001/api/v1 \
  --page-id b4-acceptance-demo \
  --token "$API_SECRET"

# 3) 前端隔离 Demo：加载已创建页面，走真实编辑/预览链
pnpm dev   # vite，端口 3000
# 浏览器打开 http://localhost:3000/b4-acceptance.html?pageId=b4-acceptance-demo
```

步骤 2 的脚本会：`PUT /api/v1/pages/:pageId/schema`（无 `basePageVersion`，
服务端此刻绑定 default active = builtin-test 并写入快照三元组）→ 重新 `GET`
回读 `runtimeCompatibility`（页面身份唯一可信来源）→ 校验三元组为
`builtin-test@0.1.0`，非该值即以非零退出码失败。步骤 3 的 Demo 入口
（`packages/frontend/b4-acceptance.html` + `src/b4-acceptance-main.tsx`）读取
`?pageId=`，页面不存在时用 builtin-test 支持的初始 Schema 走 404 bootstrap
真实创建；它不是通用 Preset 选择器，页面身份完全由服务端快照决定。

脚本按全局 `TransformInterceptor` 的 `{ success, data }` 信封解包保存与读取响应，
期望三元组取自真实包常量 `TEST_RUNTIME_COMPATIBILITY` 并逐字段精确比对
（`rendererVersion: "9.9.9"` 会失败退出，已用桩服务复现验证），非该组合即非零
退出；页面已存在（HTTP 409）时跳过创建、继续回读校验，可幂等重复运行。以上
已在真实启动的 `b4-acceptance` 后端（临时 `PAGE_SCHEMA_FILE_PATH`）上端到端
验证：首建 exit 0 且存储三元组为 `builtin-test@0.1.0`，重跑走 409 路径 exit 0。

## 4. 生成代码消费与安全语义

- 真实 generator 输出（`scripts/b4-second-preset-compile.cjs` 桥 + 真实
  `testCompilerBindings`）：
  `import { Button, Container, Text, message, notification } from "@lowcode-platform/preset-test/runtime";`
  （feedback message/notification 动作固定从 defaultLibrary——即本包 runtime——导入。）
- 消费验证（`packages/frontend/src/editor/__tests__/b4-generated-code-consumption.test.tsx`）：
  transpile + 受限 require（仅 react 与真实 preset-test runtime 模块）→ jsdom 挂载 →
  断言 `data-preset-test` DOM 标记、message/notification/setValue 点击行为，并与
  真实 Renderer 渲染同一 schema 的结果对照。
- **Runtime 自防御（review P1）**：Compiler 生成代码直接消费 runtime、不经过
  Renderer 的 Manifest 净化，因此组件对未知 Props 自身 fail-close——只透传
  `className/id/title`（标量）与 `on[A-Z]` 且值为函数的事件 handler（events 机制
  的合法形态），字符串型 `on*`、`dangerouslySetInnerHTML`、任意其他属性一律
  丢弃。危险 Props 编译产物（`onerror`/危险 HTML/`javascript:` href）经真实
  runtime 挂载后不会注入 DOM，与 Renderer 路径输出一致（同一测试文件锁定）。

## 4b. Props 属性边界（三层一致）

| 层                               | 行为                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent 写入（insert/updateProps） | builtin-test Meta 显式声明 `allowedProps`（与包内 Manifest 完全一致，组合测试锁漂移）；AntD 专属 Props（如 `loading`/`danger`）被 `PATCH_INVALID` 拒绝。AntD 内置 Meta 未声明白名单，行为零变化。 |
| Renderer 渲染                    | Manifest 白名单净化（fail-close），危险 Props 移除。                                                                                                                                              |
| Compiler 产物                    | 双层防护：1) 静态生成依据服务端可信 Manifest 解析 Props 白名单，彻底剔除未知与危险属性（保留合法 events 函数 handler）；2) runtime 自防御兜底丢弃未知 Props。DOM 输出与 Renderer 严格一致。       |

## 5. 验收证据映射（Issue #39 / B4 DoD）

| 链路/场景                                                                                                                                                                                                                                                                                                  | 证据                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新包资产一致性（runtime/manifest/validation/compiler 键一致、seal、版本对齐、净化、点击、直消费自防御、message/notification）                                                                                                                                                                              | `packages/preset-test/src/__tests__/preset.test.tsx`（17 用例）                                                                                                                                     |
| 部署组合不变量、启动 fail-close、Meta/Runtime/allowedProps 防漂移                                                                                                                                                                                                                                          | `packages/backend/src/modules/runtime-profile/__tests__/deployment-composition.spec.ts`（10 用例）                                                                                                  |
| B active 新建：服务端生成 B tuple、Schema 无身份字段、伪造参数被忽略                                                                                                                                                                                                                                       | `b4-second-preset.integration.spec.ts` S1                                                                                                                                                           |
| B 回读（加载/预览身份）                                                                                                                                                                                                                                                                                    | 同上 S2                                                                                                                                                                                             |
| Agent 读 B Meta/aliases；规范类型 Patch 完整闭环（预览→CAS 保存→编译）                                                                                                                                                                                                                                     | 同上 S3                                                                                                                                                                                             |
| A 独有类型/别名被拒绝（结构合法证明）；Props 属性边界（insert/updateProps 拒绝 AntD 专属 Props，同 Props 在 AntD 页不受限）                                                                                                                                                                                | 同上 S3                                                                                                                                                                                             |
| 别名写入规范化与复杂 Patch 全链路闭环：覆盖单别名插入、别名插入后删除、同 ID 覆盖/异构别名重建；经真实工具出口（preview_patch/write tools）→ 前端真实 applyPatchToSchema 重放 → 真实生产文件仓储 PageSchemaRepository CAS 保存（独立临时文件落地与重启回读验证）→ 旧版本拒绝断言 → Compiler 导出全链路闭环 | `b4-second-preset.integration.spec.ts` S3（3 个完整闭环用例）+ `b4-frontend-second-preset.test.tsx`（4 个真实重放与真实 CAS 用例，全文件共 11 用例）+ `patch-validation.service.spec.ts`（42 用例） |
| 确认后经真实 CAS 保存、过期版本冲突                                                                                                                                                                                                                                                                        | 同上 S4                                                                                                                                                                                             |
| Compiler B：真实 generator、导入路径实际可解析、message/notification 命名导出                                                                                                                                                                                                                              | 同上 S5                                                                                                                                                                                             |
| 危险 Props 经 Compiler Manifest 静态白名单与 runtime 自防御双层拦截，无法向 DOM 注入（Constraint 1 & 2）                                                                                                                                                                                                   | `compiler-props-filtering.spec.ts`（6 用例） + `b4-generated-code-consumption.test.tsx`                                                                                                             |
| 完整覆盖 JSON 转义字符与 JSX 特殊字符（", ', \, \n, \r, \t, \b, \f, 控制字符, &, <, >, 空串）生成合法代码且真实 DOM 严格保真（Constraint 3）                                                                                                                                                               | `b4-generated-code-consumption.test.tsx` + `generator.behavior.spec.ts`                                                                                                                             |
| A→B 静态升级：旧 A 保存/预览/Agent/编译仍 A，新页面 B                                                                                                                                                                                                                                                      | 同上 S6                                                                                                                                                                                             |
| 跨组合延续：B 页面回到正常部署仍可保存（deprecated 允许）                                                                                                                                                                                                                                                  | 同上 S7                                                                                                                                                                                             |
| A/B 交错：Meta/别名/编译来源不串用（同名 Button）                                                                                                                                                                                                                                                          | 同上 S8                                                                                                                                                                                             |
| disabled/unknown/mismatch 拒绝（保存/编译/Agent 执行）                                                                                                                                                                                                                                                     | 同上 S9                                                                                                                                                                                             |
| 真实生产仓储（文件存储）CAS、过期冲突、重启持久化三元组                                                                                                                                                                                                                                                    | 同上 S10                                                                                                                                                                                            |
| 前端真实 Catalog 双 Preset 并存、精确解析、版本不匹配 fail-close                                                                                                                                                                                                                                           | `b4-frontend-second-preset.test.tsx`（7 核心用例，全文件共 11 用例）                                                                                                                                |
| 前端加载链：PreviewPane 接线 + 真实 Renderer DOM 标记（非仅 prop）                                                                                                                                                                                                                                         | 同上                                                                                                                                                                                                |
| 前端真实预览链：真实 PreviewPane→SelectableCanvas→Renderer 渲染 B DOM 并点击派发                                                                                                                                                                                                                           | `b4-frontend-second-preset-preview.test.tsx`（1 用例）                                                                                                                                              |
| 前端组件白名单只来自当前 Preset runtime                                                                                                                                                                                                                                                                    | 同上                                                                                                                                                                                                |
| 前端 A/B 交错切页、404 bootstrap 真实创建入口、mismatch 不挂载                                                                                                                                                                                                                                             | 同上                                                                                                                                                                                                |
| 生成代码可解析/可构建/可挂载、message/notification 与点击行为和 Renderer 一致                                                                                                                                                                                                                              | `b4-generated-code-consumption.test.tsx`（4 用例）                                                                                                                                                  |
| 正常 AntD 部署体验不变                                                                                                                                                                                                                                                                                     | 默认组合 antd active；既有 B1/B2/B3、M1a、PageSchema/Repository、Agent、Compiler、Frontend 全量回归                                                                                                 |

## 6. 已知限制与收口记录

- **别名写入规范化与复杂 Patch 全链路闭环（阶段 0 收口 / 约束 4）**：`PatchValidationService`
  在主校验循环中对每一步 insertComponent 操作就地基于当前组件元数据归一化类型，并生成 `previewValidatedPatch` 下发
  （不再基于最终 Schema 反推），彻底消除别名插入后删除、删除后同 ID 重建与不同类型等复杂操作流导致的污染。
  已由测试完整证明全链路闭环：真实工具出口（`preview_patch` 与 write tools）返回规范化 Patch → 前端真实 `applyPatchToSchema` 重放验证与预览 Schema 严格全等 → 独立临时文件真实生产仓储 `PageSchemaRepository` 执行 CAS 保存校验 `basePageVersion` 成功落地磁盘 → 以新实例从磁盘回读并由真实 Compiler 编译成功且产物干净 → 过期旧版本再次提交被真实 CAS 拒绝（409 ConflictException）。绕过 Agent 入口手写的别名 Schema（直接 `PUT` 原始 JSON）
  不做规范化，编译时按 `Unsupported component type` fail-close——保存入口的
  类型白名单校验属后续工作。
- **完整覆盖 JSON 转义字符与 JSX 字符保真（阶段 0 收口 / 约束 3）**：通过正则完整覆盖所有 JSON 规范转义字符（`"`, `\`, `\x00-\x1f` 包括 `\t`, `\b`, `\f`, `\0`, `\n`, `\r` 等控制字符）以及 JSX 敏感字符（`&`, `<`, `>`, `\x7f`, `\u2028`, `\u2029`），统一通过 JSX 表达式 `{toQuotedString(val)}` 输出，消除 JSX 实体双重转义误差（如 `&amp;`）与非表达式容器下转义字符退化为字面量（如 `\t` 变为 `\\t`）的问题，生成合法代码且挂载后真实 DOM 属性值严格保真相等（`===`）。
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
