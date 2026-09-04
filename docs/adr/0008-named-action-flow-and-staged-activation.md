# ADR-0008：具名 ActionFlow 与阶段性激活边界

> Status: Accepted
> Date: 2026-09-04

## 背景

当前组件事件直接持有内联 ActionList，流程逻辑只能通过内联复制复用，导致 Schema 冗余、缺乏统一的错误边界与取消机制。随着条件、循环、异步和数据源等控制流能力的扩展，内联 ActionList 无法支撑结构化的业务流程编排。需要引入具名、可复用、有资源预算的声明式 ActionFlow。

## 决策

1. **具名 ActionFlow 声明模型**
   - ActionFlow 是 Page Logic 中“具名、持久化的流程声明”，仅包含静态动作声明（必填且非空的 `steps`，以及可选且非空的 `onError`）。
   - 不是运行时实例，不保存执行结果、错误状态、游标或调用栈。
   - 不新建与 Action 重复的第二套 Step 类型体系，完全复用标准 Action。

2. **运行时归属 RuntimeSession (FlowRun)**
   - 每次流程执行实例化为 RuntimeSession 内部的 FlowRun（属于 F2 实现），执行栈、局部变量、耗时与错误属于内存会话，不持久化回写 `PageSchema`（遵循 ADR-0007）。

3. **纯静态 RunFlowAction 引用**
   - `runFlow` 动作只保存目标 Flow Key 引用与可选的 descriptor-safe JSON `input`。
   - 严禁嵌入脚本、函数、import path 或可执行字符串（遵循 ADR-0004）。

4. **错误停止、onError 与取消语义**
   - **默认遇错停止**：流程在遇到首个未捕获错误时立即终止后续 steps 执行。
   - **单次显式 onError**：Flow 级的 `onError` 最多执行一次；`onError` 成功执行表示错误已恢复或转换，但不返回继续执行中断处的剩余 steps；`onError` 自身失败时向外传播新错误。
   - **取消与 Abort 不可恢复**：`AbortSignal` 触发或 Session dispose 属于不可恢复的流程终止，不得被 `onError` 吞掉。
   - 运行态调度语义留给 F2，Contract 阶段固定协议规范。

5. **引用图校验与资源预算**
   - 引用图必须为有向无环图 (DAG)，自环与跨 Flow 循环引用全部 fail-close (`FLOW_REFERENCE_CYCLE`)。
   - 缺失的 Flow 引用 fail-close (`FLOW_REFERENCE_MISSING`)。
   - 资源预算：`maxFlowEntries`（默认 200，硬上限 10,000）；全页面所有 Flow 共享 `maxActionNodes` 动作节点预算；嵌套 Action 深度与 Flow 引用调用链深度共同复用 `maxActionDepth` 预算。
   - 预算由宿主统一控制，不允许 Schema 自定义放宽。

6. **阶段性激活边界 (F1 安全门禁)**
   - F1 仅定义 Contract 类型（`ActionFlow`、`RunFlowAction`、`ActionFlowDeclarations`）与独立纯函数分析器（`analyzeActionFlowDeclarations`）。
   - **不把 `logic.flows` 接入 PageSchema 的生产解析路径**：默认 `validatePageSchemaValue` 仍拒绝 `logic.flows` (`UNKNOWN_LOGIC_FIELD`)，普通组件事件中的 `runFlow` 仍必须 fail-close (`UNSUPPORTED_ACTION_TYPE`)。
   - 杜绝在各消费面（Save、Preview、Renderer、Compiler）尚未实现执行语义前出现“接受但静默忽略”的半吊子状态。待 F2 与 F3 完成六消费面支持后，再正式开放 PageSchema 解析入口。

7. **旧 ActionList 兼容性与迁移规则**
   - 旧内联 ActionList 在 `schemaVersion: 0` 期间继续合法可用，不进行自动迁移或批量重写已有 Schema。
   - F3 闭环后，新 Authoring 优先生成具名 Flow；是否在 Schema V1 废弃内联形式留到 M1b 冻结前决定。

## 备选方案

### 继续复制内联 ActionList

拒绝。无法跨事件复用，会导致 Schema 显著膨胀，且无法施加统一的流程步数、调用链深度与错误捕获预算。

### 提前在 PageSchema 中开放 `logic.flows` 字段

拒绝。Renderer 和 Compiler 尚未实现 Flow 执行，会导致保存成功的 Flow 在渲染器中被静默忽略或不执行，造成“接受后静默丢弃”的严重语义断层。

### 允许 `onError` 恢复后继续执行剩余 steps

拒绝。重入式恢复控制流复杂且极易引入不可预测的状态脏写与死循环。串行停止加单一错误分支足以覆盖绝大部分业务场景。

## 后果

- 建立了严格受控、静态可分析的声明式流程契约与图分析内核。
- 保证了在 F2/F3 就绪前生产入口绝对 fail-close。
- 为 F2 (Renderer 执行与 AbortSignal) 和 F3 (Compiler 与 Editor/Agent) 提供了单一真相源。
