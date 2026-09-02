# A2UI 平台演进路线图

> Status: Active
> Last Updated: 2026-09-01
> Current Stage: M1 Foundation / M1a
> Execution Source of Truth: GitHub Issues（创建后在本文登记链接）

## 文档目的

本文描述平台从当前低代码编辑器与受控 Patch Agent，演进为企业级 Schema-Native 页面 Agent 的长期方向、阶段边界和发布门槛。

本文不是具体实施清单。架构决策以 `docs/adr/` 为准，模块工作方式以 `docs/architecture/` 为准，具体任务、负责人和进度以 GitHub Issues 为准。

## 当前前提

- 项目尚未正式发布，没有需要长期兼容的生产 Schema。
- 当前 Schema 被视为开发期 Draft，可以进行一次性破坏性升级。
- M0 不建设 V1 到 V2 的通用迁移链；M1 完成后冻结首个正式 Schema V1。
- `customScript` 永久禁用，业务能力必须由安全表达式、State、Computed、ActionFlow、DataSource 和受控宿主能力组成。
- 一个系统只能绑定一个 ComponentPreset，不支持同一系统混用多套组件库。

## 最终定位

> 面向中后台业务的、受约束、可验证、可编译的 Schema-Native 页面 Agent。

```text
自然语言
  ↓
受控 Agent Tool Call
  ↓
最小 Patch
  ↓
Schema / Manifest / Policy 校验
  ↓
Patch Preview 与用户确认
  ↓
乐观锁与原子保存
  ↓
独立 Renderer 加载 PageSchema JSON
  ↓
可选编译为 React 源码
```

## Milestone 全景

```text
M0 工程与协议地基
  ├── M1F 生产评测与可信运行时扩展地基（可并行）
  └── M1a 声明式逻辑内核
        ↓
      M1b 声明式数据源
        ↓
      M1.5 生产化与原位交互
        ↓
      M2 企业 API 与 MCP
        ↓
      M3 Durable Task
        ↓
      M4 确定性视觉检查
        ↓
      M5 项目资产与显式记忆
```

## M0：工程与运行时地基

目标：让 DSL、Renderer、Compiler 和 Agent 的每次改动都可验证、可量化、可回归。

| Epic                                                                             | 优先级 | 目标                                                            | 状态      |
| -------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------- | --------- |
| M0-1 Schema Contract                                                             | P0     | 建立协议单一真相源，分离 `schemaVersion` 与 `pageVersion`       | Completed |
| M0-2 全量测试门禁                                                                | P0     | 修复 3 组 Nest 测试，恢复后端全量门禁                           | Completed |
| [M0-3 Agent Eval](https://github.com/Chengbai2003/lowcode_platform/issues/18)    | P0     | 确定性 Eval、20 个基线、指标和 CI 门禁                          | Completed |
| [M0-4 独立 Renderer](https://github.com/Chengbai2003/lowcode_platform/issues/19) | P0     | 独立 Renderer、内置 Preset、RuntimeSession 与可信 Compiler 闭环 | Completed |

M0 核心交付已随 [PR #37](https://github.com/Chengbai2003/lowcode_platform/pull/37)
完成；#18/#19 的最终 Closure DoD 已将后续范围转交 M1 Foundation。生产 Agent Replay、
Live 趋势契约和外部 Preset 注册不继续扩张 M0 Issue。

M0 发布门槛：

- Schema 类型只有一个来源。
- 后端 36/36 suites、前端全量测试和类型检查全部通过。
- Renderer 可被最小 React 宿主独立消费，不依赖 Editor 和 Agent。
- 同 rootId、多页面并行和异步回调场景不存在 RuntimeSession 串台。
- `eval:deterministic` 可在 CI 稳定复现。

## M1F：生产评测与可信运行时扩展地基

目标：在不改变 M0 Contract 安全边界的前提下，将评测接入生产 Agent 编排，并让第二个可信 Preset 可以通过部署配置进入全链路。

| Epic                                                                                         | 优先级 | 目标                                                               | 状态        |
| -------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ | ----------- |
| [M1F-1 Production Eval](https://github.com/Chengbai2003/lowcode_platform/issues/38)          | P0     | 生产 Agent Replay、版本化报告契约与 Live Trends                    | In Progress |
| [M1F-2 Runtime Profile Registry](https://github.com/Chengbai2003/lowcode_platform/issues/39) | P0     | SystemRuntimeProfile Registry、Frontend Catalog 与第二 Preset 验收 | In Progress |

执行关系：

```text
M1F-1 Production Eval ───────────────┐
                                     ├── 可并行
M1F-2 Runtime Profile Registry ──────┘

M1a-1 State & Computed 可与 M1F 并行
M1a-1 → M1a-2 ActionFlow
M1a-1 / M1a-2 → M1a-3 六消费面一致性套件
```

M1F-2 只阻断外部 Preset 正式开放，不是 M1a-1 State & Computed 的技术前置依赖。

## M1a：声明式逻辑内核

目标：让页面从静态 UI 升级为具备安全状态和完整业务流程的可执行页面。

| Epic                   | 优先级 | 目标                                                                           | 状态    |
| ---------------------- | ------ | ------------------------------------------------------------------------------ | ------- |
| M1a-1 State & Computed | P0     | 引入 `logic.states`、安全 computed、依赖 DAG 与循环检测                        | Planned |
| M1a-2 ActionFlow       | P0     | 用具名 Flow 替代内联 ActionList，定义错误、取消与预算语义                      | Planned |
| M1a-3 一致性套件       | P0     | 验证 Contract、Validator、Editor/Agent、Renderer、Compiler、Storage 六个消费面 | Planned |

M1a 发布门槛：

- State 和 Computed 可安全驱动局部渲染。
- ActionFlow 默认遇错停止，支持显式 `onError` 和 AbortSignal。
- Renderer 解释执行与 Compiler 导出代码的可观察行为在固定语料集上一致。
- 任一消费面不支持新字段时，不得开放保存和发布。

## M1b：声明式数据源

目标：让页面调用真实业务数据，但 Schema 不保存 URL、Token、Cookie 和内部网络信息。

| Epic                  | 优先级 | 目标                                                       | 状态    |
| --------------------- | ------ | ---------------------------------------------------------- | ------- |
| M1b-1 DataSource Core | P1     | 建立 OperationRef、OperationResolver 和 DataSourceExecutor | Planned |
| M1b-2 数据资源绑定    | P1     | 建立查询状态机、分页、Loading、Error、Form/Table 标准绑定  | Planned |

M1b 发布门槛：

- 旧 `apiCall` 被结构化 `executeDataSource` 能力替代。
- Schema 不包含裸凭据、内部 URL 或宿主网络配置。
- 风险等级来自服务端可信 Operation Registry，不能由 Agent 或 Schema 自报。
- M2 Policy Engine 完成前，`destructive` 操作保持禁用。
- M1b 完成后冻结首个正式 Schema V1、Renderer V1 和 ComponentPreset V1。

## M1.5：生产化与原位交互

| Epic              | 优先级 | 目标                                            | 状态    |
| ----------------- | ------ | ----------------------------------------------- | ------- |
| M1.5-1 数据库存储 | P0     | 用 PostgreSQL 事务与 CAS 替换 file-backed store | Planned |
| M1.5-2 自愈提议   | P1     | 采集脱敏运行时错误并生成需用户确认的修复 Patch  | Planned |
| M1.5-3 原位交互   | P1     | 画布原位 Prompt 与新增/修改/删除 Ghost Preview  | Planned |

SQLite 仅作为本地开发或测试适配器，不宣称具备 PostgreSQL 式行级锁语义。

## M2：企业 API 与 MCP

目标：让 Agent 理解真实企业接口资产，同时无法绕过鉴权、确认和风险策略。

| Epic               | 优先级 | 目标                                                        | 状态    |
| ------------------ | ------ | ----------------------------------------------------------- | ------- |
| M2-1 API Catalog   | P1     | 建立 CatalogOperation 与 OpenAPI/YApi 不可信输入导入器      | Planned |
| M2-2 Policy Engine | P0     | 对 destructive 路径执行控制流校验与一次性确认令牌校验       | Planned |
| M2-3 MCP           | P1     | 建立受控 MCP Client 与具备权限、版本、审计约束的 MCP Server | Planned |

M2 发布门槛：

- Catalog 导入禁止默认读取远程 `$ref`，并限制文件大小、节点数和递归深度。
- 每条到达 destructive 节点的执行路径都必须被有效确认支配。
- confirmation token 绑定 operation、参数哈希、页面版本和会话，短 TTL 且单次使用。
- MCP 写工具必须经过身份认证、权限校验、expected pageVersion、确认与审计。

## M3～M5：高级能力

| Epic              | 优先级 | 目标                                                   | 状态    |
| ----------------- | ------ | ------------------------------------------------------ | ------- |
| M3-1 Durable Task | P1     | DAG、Checkpoint、Cancel/Resume、幂等、租约与冲突重规划 | Planned |
| M4-1 Visual Rules | P1     | Playwright/DOM 重叠、溢出、Label 和 a11y 确定性检查    | Planned |
| M5-1 Governance   | P2     | Design Tokens、业务字典、团队规范和高质量模板版本化    | Planned |

M4 初期只输出报告；规则稳定后再选择低误报规则进入阻断门禁。M5 的记忆必须显式、可编辑、可审计、可版本化，不依赖黑盒式自动记忆。

## 20 个 Epic 清单

1. `[M0-1] [Architecture] 建立 DSL 单一真相源与 schemaVersion/pageVersion 边界`
2. `[M0-2] [Quality] 修复剩余 3 组 Nest 测试并恢复后端 36/36 全量门禁`
3. `[M0-3] [Eval] 建立确定性离线评测 Harness 与首批 20 个基线用例`
4. `[M0-4] [Architecture] 抽离独立 Renderer Package、单系统 ComponentPreset 与 RuntimeSession 隔离`
5. `[M1F-1] [Eval] 接通生产 Agent Replay 与 Live Trend Contract`（[#38](https://github.com/Chengbai2003/lowcode_platform/issues/38)）
6. `[M1F-2] [Architecture] 建立 SystemRuntimeProfile Registry 与可信 Preset 部署链路`（[#39](https://github.com/Chengbai2003/lowcode_platform/issues/39)）
7. `[M1a-1] [Logic] 引入 logic.states 与安全 computed`
8. `[M1a-2] [ActionFlow] 将内联 ActionList 重构为具名声明式 ActionFlow`
9. `[M1a-3] [Consistency] 建立六个消费面的一致性测试套件`
10. `[M1b-1] [DataSource] 引入 OperationRef、OperationResolver 与 DataSourceExecutor`
11. `[M1b-2] [DataSource] 建立查询资源状态机及 Table/Form 标准绑定`
12. `[M1.5-1] [Storage] 页面、快照与版本存储数据库化`
13. `[M1.5-2] [Self-Healing] 运行时错误采集与 Agent 修复建议闭环`
14. `[M1.5-3] [UX] 画布原位 Prompt 和 Patch 空间级差异预览`
15. `[M2-1] [Catalog] 建立 API Catalog 领域模型与 OpenAPI/YApi 不可信输入导入器`
16. `[M2-2] [Security] 建立 destructive 操作控制流校验与一次性确认令牌`
17. `[M2-3] [MCP] 建立受控 MCP Client 与低代码 MCP Server`
18. `[M3-1] [Workflow] 基于数据库的长任务状态机`
19. `[M4-1] [Visual] 基于 Playwright/DOM 的布局和 a11y 规则检查`
20. `[M5-1] [Governance] Design Tokens、业务字典与团队规范版本化管理`

## 更新规则

- 本文只维护方向、依赖、阶段门槛和 Epic 状态，不复制 Issue 的全部 checkbox。
- Epic 创建后，将链接补充到对应表格。
- 架构方向变化必须新增或取代 ADR，不能只修改 Issue 描述。
- 每个架构类 Issue 的 DoD 必须包含更新对应 Architecture、ADR 和 Roadmap 状态。
- 已完成的历史 Phase 文档保留作追溯，但不再作为当前架构真相源。
