# M1a 声明式逻辑内核实施计划

> **Issues**：[#45 M1a-1 State & Computed](https://github.com/Chengbai2003/lowcode_platform/issues/45) · [#46 M1a-2 ActionFlow](https://github.com/Chengbai2003/lowcode_platform/issues/46) · [#47 M1a-3 六消费面一致性](https://github.com/Chengbai2003/lowcode_platform/issues/47)
> **架构基线**：[ADR-0003](../adr/0003-isolated-renderer-runtime-session.md) · [ADR-0007](../adr/0007-separate-page-logic-declarations-and-session-values.md) · [Schema Contract](../architecture/schema-contract.md)
> **当前阶段**：`M1a-1 / S1 Page State` | **优先级**：`P0`

## 目标与边界

M1a 用纯数据声明替代页面脚本，让 Renderer 解释执行与 Compiler 导出代码具备同一套 State、Computed 和 ActionFlow 语义。`customScript` 继续永久禁用；M1a 不引入网络数据源、企业 API、MCP 或持久化运行值。

核心不变量：

1. `PageSchema.logic` 只保存声明，Session State、Computed 结果和 Flow 执行栈只属于独立 RuntimeSession。
2. Contract 是结构、命名和资源预算的唯一真相源；消费面不得复制或放宽规则。
3. 新字段必须同时贯通 Contract/Validator、Editor/Agent、Renderer、Compiler、Storage，并由固定语料验证一致性。
4. 任一消费面尚未支持时，该能力不得开放保存或发布。

## 实施顺序

```text
S1 Page State 纵向闭环
  ↓
S2 安全 Computed + 依赖 DAG / 循环检测
  ↓
M1a-2 具名 ActionFlow + 错误 / 取消 / 预算语义
  ↓
M1a-3 六消费面固定语料与解释/编译一致性门禁
```

### S1：Page State 纵向闭环（当前 PR）

- Contract：新增可选 `logic.states: Record<LogicKey, JsonValue>`，沿用 JSON 深度/节点预算并增加 State 条目预算；危险键与未知字段 fail-close。
- Renderer：每个 RuntimeSession 深拷贝声明初值；没有声明时继续兼容宿主传入的 legacy state。
- Compiler：为声明或既有 `state.*` 动作生成页面级 `useState`，读取表达式与 `setValue` 写入共享同一 state。
- Editor/Agent：Schema 文本同步与组件 Patch 必须保留 `logic`，组件级变更不得别名或丢弃页面逻辑。
- Storage：不可变快照、版本保存与磁盘恢复完整往返 `logic.states`。
- Fixture：固定计数器页面验证 `1 → 2` 的 Renderer 行为与等价编译输出。

S1 仅对声明式 Page State 承诺顶层 Logic Key；声明存在时嵌套 State 写入在 Contract 中 fail-close，无声明的旧页面仍保留既有嵌套写入语义。已有组件字段若会生成 `state` / `setState` 绑定，Compiler 明确拒绝并要求先重命名，避免静默改义。同一事件内跨动作读取 State 的解释/编译顺序一致性必须在 #45 完成前明确并纳入 #47 语料，当前切片不扩大 Action 协议。

### S2：Computed

- 在共享 Contract 中定义安全表达式声明，复用同一 AST 白名单与资源预算。
- 构建确定性依赖 DAG，拒绝缺失引用、循环依赖、危险属性和超预算图。
- RuntimeSession 按依赖失效并只读求值；Compiler 按同一拓扑生成等价代码。
- Editor/Agent 提供结构化声明入口，Storage 只保存表达式，不保存求值结果。

### M1a-2：ActionFlow

- 将可复用流程提升为具名声明，事件只引用 Flow；保留明确的兼容迁移窗口，不长期维护双语义。
- 默认遇错停止，定义显式 `onError`、AbortSignal、步数/循环/异步预算和 dispose 后写入阻断。

### M1a-3：一致性门禁

- 维护一份固定 Page Logic 语料，驱动六个 Consumer Surface。
- 比较 Renderer 与 Compiler 的可观察状态、渲染、错误和取消行为；发现差异即阻断发布。

## 阶段门槛

- M1a-1 可与 M1F 并行；M1F-2 只阻断外部 Preset 正式开放。
- M1a-2 依赖 M1a-1 的命名、表达式和会话边界稳定。
- M1a-3 依赖 M1a-1 与 M1a-2，负责把跨消费面一致性变为门禁。
- M1b 完成后才能冻结首版 Schema V1、Renderer V1 与 ComponentPreset V1。
- M2 可先做调研和方案；实现必须等待上述 V1 冻结面并完成 M1.5 生产化前置，避免企业 API、Policy 与 MCP 建在继续变化的协议和存储边界上。
