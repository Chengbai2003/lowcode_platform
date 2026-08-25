# ADR-0004：永久禁止任意脚本执行

> Status: Accepted  
> Date: 2026-08-25

## 背景

`new Function`、`eval`、`with + Proxy` 等 in-realm 方案无法构成安全沙箱，能够通过构造器链逃逸、访问宿主 global，并且无法可靠终止同步死循环。项目不计划在近期引入独立 Worker、隔离 iframe 或 QuickJS 等真正隔离执行环境。

## 决策

- `customScript` 永久不可创建、保存、编译、注册或执行。
- 历史类型只有在确有生产兼容需求时才允许作为不可执行数据读取；当前预发布阶段可以直接删除旧结构。
- 表达式只通过 AST 白名单解释器求值。
- 业务逻辑使用 State、Computed、ActionFlow、DataSource 和显式 Host Capabilities。
- 不提供隐藏开关重新启用 in-realm 脚本。

## 备选方案

### 保留 `enableCustomScript` 开关

拒绝。开关只改变暴露概率，不改变任意代码执行本质。

### 对 `new Function` 增加关键词过滤和超时

拒绝。关键词过滤可绕过，Promise timeout 不能中断同步死循环。

### 立即接入 QuickJS/isolated-vm

暂不采用。当前产品能力可以由声明式 DSL 覆盖，引入完整隔离运行时的复杂度和维护成本不匹配当前阶段。

## 后果

- 部分高度自定义逻辑无法直接塞入页面脚本，必须抽象为受控 Flow 节点或宿主 capability。
- 新增能力需要经过 Schema、Validator、Renderer、Compiler 和安全测试共同实现。
- 安全边界更清晰，导出代码和预览运行更容易保持一致。
