# ADR-0005：DataSource 使用 OperationRef，不在 Schema 保存基础设施秘密

> Status: Accepted  
> Date: 2026-08-25

## 背景

当前内联 `apiCall` 可以在 Schema 中包含 URL、Headers 和请求细节。这会把内部网络拓扑、Token/Cookie 和宿主鉴权方式写入页面资产，并带来 SSRF、越权和环境迁移问题。

## 决策

- PageSchema 只保存 `operationRef`、参数映射和结果映射。
- 真实 URL、鉴权、Cookie、内部地址和网关路由由宿主或服务端 OperationResolver 管理。
- DataSourceExecutor 是唯一网络执行入口。
- Operation 风险等级来自可信 Catalog/Policy，不能信任 Agent 或 Schema 自报。
- 写操作支持 idempotency key；destructive 操作必须通过确定性 Policy 和一次性确认令牌。
- M2 Policy Engine 完成前不开放 destructive 操作。

## 备选方案

### Schema 继续保存 URL 和 Headers

拒绝。页面资产会绑定环境并泄露基础设施信息，且难以实施统一权限策略。

### 只在前端做 URL allowlist

拒绝。前端不是可信安全边界，无法替代服务端 OperationResolver 和网关鉴权。

### 允许 Agent 自行声明风险等级

拒绝。模型可以错误分类或被提示注入影响，风险必须由可信服务端元数据确定。

## 后果

- 开发环境需要本地静态 OperationResolver，M2 再接入 API Catalog。
- Renderer 和 Compiler 都只能调用宿主 DataSource capability。
- 页面从一个环境迁移到另一个环境时不需要改写 URL 和凭据。
