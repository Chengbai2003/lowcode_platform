# ADR-0007：分离 Page Logic 声明与 RuntimeSession 值

> Status: Accepted
> Date: 2026-09-03

## 背景

State、Computed 与 ActionFlow 需要随页面保存，但运行期间产生的 State 最新值、Computed 结果和 Flow 执行栈具有会话性。若把两者放进同一持久化对象，页面预览、并行会话和历史快照会互相污染。

## 决策

- `PageSchema.logic` 只持久化声明；第一步加入 `logic.states` 作为 RuntimeSession 初始值，后续在同一命名空间加入 Computed 与 ActionFlow 声明。
- 每个 RuntimeSession 从声明深拷贝自己的 Session State；运行时写入不得修改或回写 `PageSchema`。
- Computed 是只读派生值，只持久化安全表达式，不持久化求值结果。
- Contract 负责 Logic Key、JSON 资源预算和声明结构；Renderer 与 Compiler 必须对同一声明产生一致的可观察行为。

## 备选方案

### 将最新 State 写回 PageSchema

拒绝。它会把用户会话数据混入页面定义，并破坏不可变快照、并行会话隔离与确定性编译。

### 由 Renderer 私有管理初始 State

拒绝。Editor、Agent、Compiler 和 Storage 将无法共享同一声明契约，最终形成多套不一致协议。

## 后果

- 新 Logic 字段只有在六个 Consumer Surface 均支持后才可保存和发布。
- Session State 的持久化若未来确有需求，必须使用 PageSchema 之外的独立业务数据模型。
