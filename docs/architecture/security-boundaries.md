# A2UI 安全边界

> Status: Draft  
> Last Updated: 2026-08-25  
> Applies To: Schema、Agent、Renderer、Compiler、DataSource、MCP

## 总原则

> Agent 负责提议，Validator 和 Policy 负责裁决，受控 Runtime Capability 负责执行。

LLM 输出、页面 JSON、外部 API 文档、MCP 工具输出、组件 Props 和运行时错误信息都必须视为不可信输入。

## 信任边界

```text
不可信
├── 用户自然语言
├── LLM 输出与 Tool Call 参数
├── PageSchema JSON
├── OpenAPI / YApi 文档
├── MCP Server 输出
├── DataSource 响应
└── 组件 Props

可信但最小化
├── Schema Contract
├── 服务端解析的 SystemRuntimeProfile
├── 已签名/固定版本的 ComponentPreset
├── Policy Engine
├── Repository CAS
└── Host Capability 包装
```

## 不变量

### 1. 任意脚本永久禁止

- `customScript` 不可创建、保存、编译、注册 Handler 或执行。
- 不使用 `eval`、`Function` 或 in-realm Proxy 伪装脚本沙箱。
- 复杂业务通过 Safe Expression、ActionFlow 和 Host Capabilities 表达。

### 2. Schema 入口统一且 fail-close

- raw JSON 必须先经过大小、结构、图、Props、表达式、Flow、DataSource 和 Policy 校验。
- Renderer、Compiler、Repository、Agent Tools 不得绕过统一入口。
- 未知字段、未知版本和未知组件默认拒绝。

### 3. 表达式只处理净化数据

- 只暴露明确上下文命名空间。
- 丢弃函数、getter/setter、类实例和危险原型属性。
- 方法调用使用白名单，并限制深度、节点数和执行预算。
- 禁止访问宿主 global、DOM、网络和任意构造器。

### 4. Props 是受控透传

- Props 必须出现在当前 ComponentPreset Manifest。
- 禁止函数型 Props、任意 `onXxx`、`renderXxx`、`dangerouslySetInnerHTML` 和组件替换入口。
- 事件只能绑定 ActionFlow，不把函数放入 Schema。

### 5. 全局配置只读，页面运行态隔离

- 全局 Registry Bootstrap 后 seal。
- RuntimeSession 不共享 State、Flow 栈、请求、timer、订阅和 tracking cache。
- 页面切换通过 `pageId + documentSessionId` 重建 Session。
- 旧 Session 的异步结果不得写入新页面。

### 6. SystemProfile 由服务端解析

- Agent 和客户端不能任意声明 `systemId` 或 ComponentPreset。
- 服务端通过 page/project 关系解析 SystemRuntimeProfile。
- Agent 只获得当前系统 Preset 的相关 Manifest。

### 7. DataSource 不保存基础设施秘密

- Schema 只保存 `operationRef`、参数映射和结果映射。
- URL、Token、Cookie、内部服务地址和网关配置由宿主管理。
- OperationResolver 和 DataSourceExecutor 校验 operation、入参、权限、超时和输出大小。
- M2 Policy 完成前不开放 destructive 操作。

### 8. destructive 操作需要确定性确认

仅检查 Flow 中“存在 confirmModal”不构成安全边界。每条到达 destructive 节点的控制流路径都必须被有效确认支配。

一次性确认令牌至少绑定：

```text
operationRef + paramsHash + pageId + pageVersion + documentSessionId
```

令牌短 TTL、单次使用，并由 DataSourceExecutor 在实际执行前再次校验。

### 9. Patch 防止 TOCTOU

Patch Preview 和 Apply 必须绑定：

- sourcePageId
- basePageVersion
- documentSessionId
- generation
- schemaRevision

确认弹窗等待期间任一值变化都必须使 Patch 失效。

### 10. MCP 最小权限

- MCP Client 只连接 allowlist Server，固定工具 Schema 和版本。
- MCP 输出视为不可信并限制大小。
- MCP Server 写工具要求身份、system/project/page 权限、expected pageVersion、确认、审计和限流。
- 凭据不得进入模型上下文。

## 资源与拒绝服务防御

所有运行链路都应设置明确预算：

- Schema 最大字节数、组件数、children 数和深度。
- 表达式 AST 节点数、深度和允许方法。
- Flow 最大步骤数、循环次数、嵌套深度和总时长。
- Agent 最大步骤、Tool Call、Patch Ops 和目标扩散数。
- DataSource 请求超时、响应大小、重试次数和并发数。
- Catalog 文件大小、引用数、递归深度和节点数。

超出预算统一 fail-close，不通过降级执行危险内容继续运行。

## 错误与观测数据

- Trace、错误堆栈和运行时上下文使用字段白名单脱敏。
- 不记录 Token、Cookie、Authorization、原始请求体或用户隐私数据。
- 自愈只能生成提议 Patch，必须由用户确认。
- 限制同一错误的自愈次数，防止 Agent 修复循环。

## 安全变更要求

涉及以下内容的 PR 必须补充定向安全测试：

- 新表达式 AST 或方法能力。
- 新 Flow 节点或 Host Capability。
- 新 ComponentPreset Props。
- 新 DataSource 操作类型。
- 新 MCP 写工具。
- Schema 校验放宽。

安全规则变化必须同步 Validator、Renderer、Compiler 和固定 Eval 用例。
