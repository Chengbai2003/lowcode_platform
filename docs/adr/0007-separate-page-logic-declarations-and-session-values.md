# ADR-0007：分离 Page Logic 声明与 RuntimeSession 值

> Status: Accepted
> Date: 2026-09-03

## 背景

State、Computed 与 ActionFlow 需要随页面保存，但运行期间产生的 State 最新值、Computed 结果和 Flow 执行栈具有会话性。若把两者放进同一持久化对象，页面预览、并行会话和历史快照会互相污染。

## 决策

- `PageSchema.logic` 只持久化声明；`logic.states` 是 RuntimeSession 初始值，`logic.computed` 保存不带 `{{ }}` 的单一安全表达式，后续在同一命名空间加入 ActionFlow 声明。
- 每个 RuntimeSession 从声明深拷贝自己的 Session State；运行时写入不得修改或回写 `PageSchema`。
- Computed 是只读派生值；求值结果、缓存、脏标记、依赖反向索引均归当前 RuntimeSession，不持久化且不跨 Session 共享。
- Contract 是 Computed 语法白名单、资源预算、引用校验、依赖提取与稳定拓扑的唯一入口。缺失引用、动态访问、宿主能力、构造器、循环和超预算图均 fail-close；Renderer 与 Compiler 不复制或放宽这些判断。
- Renderer 按 State 顶层 Logic Key 精确失效直接及传递依赖，并在一次批量写入后最多通知一次；替换声明图时保留 Session State，销毁 Session 时清空图和缓存。
- Compiler 按 Contract 拓扑生成派生值，并通过事件内局部值与 ref 保证连续动作和跨 `await` 动作读取最新 State/Computed。固定语料同时验证解释执行与编译产物的可观察状态。

## 备选方案

### 将最新 State 写回 PageSchema

拒绝。它会把用户会话数据混入页面定义，并破坏不可变快照、并行会话隔离与确定性编译。

### 由 Renderer 私有管理初始 State

拒绝。Editor、Agent、Compiler 和 Storage 将无法共享同一声明契约，最终形成多套不一致协议。

## 后果

- 新 Logic 字段只有在六个 Consumer Surface 均支持后才可保存和发布。
- Session State 的持久化若未来确有需求，必须使用 PageSchema 之外的独立业务数据模型。
