# M1a 声明式逻辑内核实施计划

> **Issues**：[#45 M1a-1 State & Computed](https://github.com/Chengbai2003/lowcode_platform/issues/45) · [#46 M1a-2 ActionFlow](https://github.com/Chengbai2003/lowcode_platform/issues/46) · [#47 M1a-3 六消费面一致性](https://github.com/Chengbai2003/lowcode_platform/issues/47)
> **架构基线**：[ADR-0003](../adr/0003-isolated-renderer-runtime-session.md) · [ADR-0007](../adr/0007-separate-page-logic-declarations-and-session-values.md) · [Schema Contract](../architecture/schema-contract.md)
> **当前阶段**：`M1a-1（S1-S4 已完成，等待合并 PR #48）` | **优先级**：`P0`

## 目标与边界

M1a 用纯数据声明替代页面脚本，让 Renderer 解释执行与 Compiler 导出代码具备同一套 State、Computed 和 ActionFlow 语义。`customScript` 继续永久禁用；M1a 不引入网络数据源、企业 API、MCP 或持久化运行值。

核心不变量：

1. `PageSchema.logic` 只保存声明，Session State、Computed 结果和 Flow 执行栈只属于独立 RuntimeSession。
2. Contract 是结构、命名和资源预算的唯一真相源；消费面不得复制或放宽规则。
3. 新字段必须同时贯通 Contract/Validator、Editor/Agent、Renderer、Compiler、Storage，并由固定语料验证一致性。
4. 任一消费面尚未支持时，该能力不得开放保存或发布。

## 实施顺序

```text
S1 Page State 纵向闭环 (Done)
  ↓
S2 安全 Computed + 依赖 DAG / 循环检测 (Done)
  ↓
S3 Computed Runtime + Compiler 等价实现 (Done)
  ↓
S4 页面逻辑 Authoring 与结构化诊断闭环 (Done)
  ↓
M1a-2 具名 ActionFlow + 错误 / 取消 / 预算语义
  ↓
M1a-3 六消费面固定语料与解释/编译一致性门禁
```

### S1：Page State 纵向闭环（已完成）

- Contract：新增可选 `logic.states: Record<LogicKey, JsonValue>`，沿用 JSON 深度/节点预算并增加 State 条目预算；危险键与未知字段 fail-close。
- Renderer：每个 RuntimeSession 深拷贝声明初值；没有声明时继续兼容宿主传入的 legacy state。
- Compiler：为声明或既有 `state.*` 动作生成页面级 `useState`，读取表达式与 `setValue` 写入共享同一 state。
- Editor/Agent：Schema 文本同步与组件 Patch 必须保留 `logic`，组件级变更不得别名或丢弃页面逻辑。
- Storage：不可变快照、版本保存与磁盘恢复完整往返 `logic.states`。
- Fixture：固定计数器页面验证 `1 → 2` 的 Renderer 行为与等价编译输出。

S1 仅对声明式 Page State 承诺顶层 Logic Key；声明存在时嵌套 State 写入在 Contract 中 fail-close，无声明的旧页面仍保留既有嵌套写入语义。已有组件字段若会生成 `state` / `setState` 绑定，Compiler 明确拒绝并要求先重命名，避免静默改义。同一事件内跨动作读取 State 的解释/编译顺序一致性必须在 #45 完成前明确并纳入 #47 语料，当前切片不扩大 Action 协议。

### S2：Computed Contract 与共享分析（已完成）

- `ComputedExpression` 是不带 `{{ }}` 的单一表达式；共享 Contract 唯一负责 AST 白名单、引用提取和资源预算。
- Contract 输出依赖优先、同层按 Logic Key 稳定排序的 DAG；缺失引用、动态访问、危险属性、宿主/构造器、循环和超预算图全部 fail-close。
- Editor JSON、组件 Patch、Agent 组件 Patch 与 Storage 显式保留 `logic.computed`；结构化声明入口和诊断 UI 留给 S4。

### S3：Computed Runtime 与 Compiler 等价实现（已完成）

- RuntimeSession 私有持有 Computed 缓存与反向依赖图；State 顶层 Logic Key 变更只失效直接和传递依赖，批量写入最多一次 flush。
- `computed.*` 进入 Renderer 安全表达式上下文并保持只读；声明图热替换保留当前 Session State，dispose 清空图与缓存。
- Compiler 复用 Contract 拓扑生成 React 代码，并用事件局部值与 ref 保证连续动作及跨 `await` 动作读取最新 State/Computed。
- `test-fixtures/m1a-computed-conformance.json` 同时驱动 Contract、Renderer 与 Compiler，验证初始值及一次事件后的可观察状态一致。

### S4：页面逻辑 Authoring 与结构化诊断闭环（已完成）

- **单一真相源**：Editor 与 Agent 严禁重复实现表达式解析、AST 校验或预算规则；校验全部统一委托给 Schema Contract（fail-close）。
- **原子 Patch 协议**：新增且仅新增一个原子操作 `replacePageLogic`（工具名 `replace_page_logic`），整块替换 `schema.logic`（传 `{}` 即清空）；不引入组件级细粒度混淆操作。
- **Agent 路由与快路径隔离**：通过领域词（`Page State`、`computed`、`页面逻辑`、`状态声明`、`计算声明/计算值` 等）识别页面级逻辑指令，直接跳过集合容器与组件目标澄清；以 `rootId` 组装只读 focusContext 但保持 `resolvedSelectedId` 为 `undefined`，防止单组件快路径误修改根节点。
- **Editor 轻量 Authoring**：PreviewPane 增加「页面逻辑」Tab，提供 Monaco Editor 进行最小 JSON 编辑（支持状态与计算属性声明）；全量通过 `parseAndValidatePageLogic` 与 Contract 校验后再触发 Commit；支持与 Undo/Redo 历史无缝集成。
- **结构化诊断反馈**：彻底移除 `alert()` 弹窗，全量在 Editor 内部以结构化错误面板展示 `code · path · message` 三元组（支持错误代码、路径定位与详情描述）。

### M1a-2：ActionFlow

- 将可复用流程提升为具名声明，事件只引用 Flow；保留明确的兼容迁移窗口，不长期维护双语义。
- 默认遇错停止，定义显式 `onError`、AbortSignal、步数/循环/异步预算和 dispose 后写入阻断。
- **实施状态**：
  - **F1 / F1.1 已完成**：建立具名 ActionFlow Schema Contract、独立静态分析器与综合深度预算；
  - **F2 已完成**：实现 Renderer 内部 ActionFlow Runtime 语义（默认遇错停止、flow 级 `onError`、AbortSignal 全链路贯穿、session dispose 后写回阻断、结构化诊断 trace、多维运行时预算边界校验与矩阵测试守护）；
  - **F3 待实施**：开放生产 `PageSchema.logic.flows`、组件事件 `runFlow` 桥接与内联 ActionList 迁移。

### M1a-3：一致性门禁

- 维护一份固定 Page Logic 语料，驱动六个 Consumer Surface。
- 比较 Renderer 与 Compiler 的可观察状态、渲染、错误和取消行为；发现差异即阻断发布。

## 阶段门槛

- M1a-1 可与 M1F 并行；M1F-2 只阻断外部 Preset 正式开放。
- M1a-2 依赖 M1a-1 的命名、表达式和会话边界稳定。
- M1a-3 依赖 M1a-1 与 M1a-2，负责把跨消费面一致性变为门禁。
- M1b 完成后才能冻结首版 Schema V1、Renderer V1 与 ComponentPreset V1。
- M2 可先做调研和方案；实现必须等待上述 V1 冻结面并完成 M1.5 生产化前置，避免企业 API、Policy 与 MCP 建在继续变化的协议和存储边界上。
