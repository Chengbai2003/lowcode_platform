# ADR-0003：Renderer 全局复用代码，页面隔离 RuntimeSession

> Status: Accepted  
> Date: 2026-08-25

## 背景

系统希望只在 Shell 启动时加载一次 Renderer 和组件库，后续页面只加载 JSON。若把代码复用误实现为全局共享页面状态，会产生跨页 State、消息、请求、追踪代理和异步回调串台。

## 决策

- Renderer Bundle、ComponentPreset、协议常量和只读 Registry 在 SPA Shell 中全局加载一次。
- 每个页面创建独立 RuntimeSession。
- Session 身份至少绑定 `pageId + documentSessionId`，不能只依赖 rootId。
- State、Computed、Flow 栈、请求、timer、订阅和 tracking cache 都归 Session 所有。
- 页面卸载或文档会话变化时必须 `dispose()`。
- 不把 Renderer 挂到可变的 `window` 全局对象。

## 备选方案

### 全局单例 Runtime

拒绝。无法可靠隔离多个页面、标签页式编辑和异步回调。

### 每个页面重复打包 Renderer

拒绝。增加下载和执行成本，也无法形成独立可复用运行包。

### 仅使用 rootId 判断页面切换

拒绝。不同页面可以使用相同 rootId，会错误复用旧运行态。

## 后果

- 需要明确 Session Factory、生命周期和资源所有权。
- 组件只能通过公共 Runtime Bridge 使用页面能力。
- 测试必须覆盖同 rootId 切页、并行页面、延迟回调和 dispose 后写入阻断。
