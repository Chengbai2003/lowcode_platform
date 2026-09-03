# Low-code Page Runtime

本上下文描述低代码页面的持久化声明、独立运行会话与各消费面的共同语言，避免把可保存配置和瞬时运行值混为一谈。

## Language

**Page Logic**:
随 `PageSchema` 持久化的页面逻辑声明集合；当前从 State Declaration 开始，后续承载 Computed 与 ActionFlow 声明。
_Avoid_: Runtime data, page script

**State Declaration**:
`logic.states` 中按 Logic Key 声明的页面会话初始值；它是可持久化配置，不是运行中的最新值。
_Avoid_: Live state, state snapshot

**Session State**:
一个 RuntimeSession 根据 State Declaration 建立并独立维护的可变值；页面卸载后销毁，绝不回写 `PageSchema`。
_Avoid_: Schema state, persisted state

**Logic Key**:
Page Logic 中具名声明的安全标识符，用于在表达式、ActionFlow 和生成代码之间稳定引用同一逻辑成员。
_Avoid_: Variable name, property path

**Computed Declaration**:
以安全表达式声明、由 State 或其他 Computed 派生的只读逻辑成员；运行值不持久化。
_Avoid_: Formula result, computed state

**ActionFlow**:
Page Logic 中具名、声明式且有明确错误和取消语义的动作流程。
_Avoid_: Script, inline handler

**Consumer Surface**:
必须一致理解同一 PageSchema 字段的六类边界：Contract/Validator、Editor/Agent、Renderer、Compiler、Storage 和一致性测试。
_Avoid_: Caller, integration point

**Capability Gate**:
一项 Schema 能力可被保存或发布前，所有 Consumer Surface 必须共同通过的兼容性与行为门槛。
_Avoid_: Feature flag, rollout switch
