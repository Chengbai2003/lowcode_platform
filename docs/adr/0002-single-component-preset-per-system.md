# ADR-0002：一个系统只能绑定一个 ComponentPreset

> Status: Accepted  
> Date: 2026-08-25
> Related: [ADR-0006](0006-system-runtime-profile-deployment-boundary.md)

## 背景

同一系统混用 AntD、Arco 等组件库会引入主题、CSS、交互习惯、Props、弹层容器、Compiler Import 和 Agent Manifest 冲突。Renderer 中增加组件库条件分支也会破坏开闭原则。

## 决策

- 一个 `SystemRuntimeProfile` 只能绑定一个 `componentPresetId + componentPresetVersion`。
- Renderer 只接收一个 ComponentPreset，不判断具体组件库名称。
- Preset 同时提供 runtime components、manifest、props validation 和 compiler bindings。
- Agent 依据服务端解析的 system profile，只获得当前 Preset 的组件元数据。
- 新增组件库通过新增 Preset 包和系统配置完成。

## 备选方案

### 单页面混合多个组件库

拒绝。增加包体积、样式冲突、Agent 幻觉和 Compiler 复杂度，不符合中后台系统的一致性目标。

### Renderer 内部 switch 组件库

拒绝。每次新增组件库都需要修改和发布 Renderer。

### 所有组件 Props 完全标准化

暂不采用。平台统一节点、事件和运行语义；具体 Props 由当前 Preset Manifest 定义并校验，避免被最低公共能力限制。

## 后果

- 系统切换组件库属于系统级迁移，不是页面级动态能力。
- PageSchema 核心协议不依赖具体组件库包，但页面使用的扩展 Props 可能依赖当前 Preset。
- ComponentPreset 版本必须进入 Trace、快照和 Eval 元数据，便于复现。
