# ReactiveRuntime 设计说明

## 概述

`ReactiveRuntime` 是 renderer 的单一事实来源。

它维护四个命名空间：

- `data`：组件业务值
- `state`：renderer 和 DSL 的运行时状态
- `formData`：预留的表单命名空间
- `components`：当前扁平化后的组件映射

现在 renderer 遵循一条核心规则：

- 所有写入都通过 `EventDispatcher` 或 Capability API 进入
- 所有用于渲染的读取都来自 `ReactiveRuntime`
- Redux 即使存在，也只作为兼容镜像层存在

## 运行时流程

1. `Renderer` 扁平化 schema 值并创建 `EventDispatcher`
2. `EventDispatcher` 使用 `data` 和 `components` 初始化 `ReactiveRuntime`
3. `ComponentRenderer` 通过 `useSyncExternalStore` 建立订阅
4. 表达式求值通过 runtime 的 tracking proxy 读取数据
5. runtime 写入会标记 dirty path，并在 microtask 中统一 flush
6. 受影响的 computed 监听器触发重新渲染，随后在需要时把兼容态镜像出去

## 关键不变量

- `ReactiveRuntime` 在 renderer 执行过程中始终可用
- `runtime.set()` 是同步写入
- 订阅通知必须批量触发
- computed props 只读，绝不能反向写回 runtime
- 兼容层 Redux state 绝不能驱动 renderer 的读取链路

## 兼容层

以下 API 仍然保留，用于向后兼容：

- `LowcodeProvider`
- `renderer/store`
- `setComponentData`、`setMultipleComponentData`、`setComponentConfig`

它们当前的职责被限制为：

- 接收遗留调用
- 接收 runtime 的镜像快照
- 避免破坏旧有集成方式

它们不属于 renderer 的响应式主链。

## EventDispatcher 职责

`EventDispatcher` 现在负责：

- DSL 执行入口
- runtime 初始化
- 输入事件和 action 的统一写入 facade
- 在兼容层存在时，将 runtime 快照镜像到兼容状态

它不再依赖 Redux 作为事实来源。

## 渲染模型

`ComponentRenderer` 现在使用两个面向 runtime 的 hook：

- `useNodeValue`
- `useResolvedSchemaProps`

这两个 hook 都基于 runtime version 和 computed 依赖进行订阅。
选择性求值由 dirty-path 检查保护，因此无关的 runtime 写入不会让无关节点重新计算。

## 扩展建议

新增 runtime 行为时，优先遵循以下原则：

- 除非是真正的组件值数据，否则优先把新的可写状态放进 `state.*`
- 所有写入都通过 `EventDispatcher`、DSL action 或 Capability API 进入
- 不要从兼容层 Redux state 新增 renderer 直读路径
- 新增命名空间或写路径时，同步更新文档和测试
