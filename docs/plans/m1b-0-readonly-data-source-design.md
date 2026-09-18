# M1b-0：只读数据源设计草案

> 2026-09-18；状态：设计方向已认可；协议细节待冻结，未实施。
> 代码审计基线：40685a2；阶段 0 PR #63 已合并为 fc133ef，main CI 35320072208 已成功。
> 本设计位于独立 worktree，不属于 #63；不授权实施、发布或变更历史页面。

## 1. 目标与非目标

首个闭环：用户点击查询 → 可信注册的只读示例操作 → 校验结果 → 写入 Session State → 页面展示；保存重载仅保留声明。Renderer 与编译产物在相同宿主能力下行为一致。

M1b-1 不做业务写操作、Table 分页资源框架、自动轮询、缓存平台、OpenAPI 导入、数据库 Catalog、多租户管理或真实生产接口接入。M1b-2 才做资源订阅与 Table/Form 查询绑定。保持 PropertyPanel 的 Preset 化为独立事项。

## 2. 已核实的现状与影响路径

| 位置                                                                              | 当前行为                                                 | 设计影响                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `docs/adr/0005-operation-ref-data-source.md`                                      | 已接受 OperationRef、可信 Resolver、唯一网络 Executor    | 沿用，不覆盖历史 ADR                                         |
| `packages/schema-contract/src/actions/action-union.ts`、`validation/actions.ts`   | apiCall 已支持；executeDataSource 不存在                 | 新增动作及严格验证，不能只添加联合类型                       |
| `packages/schema-contract/src/capabilities/manifest.ts`                           | 遍历能力集合，默认全部 supported                         | 改为显式支持登记，新增能力默认 unsupported；既有能力状态不变 |
| `packages/renderer/src/executor/actions/asyncActions.ts`                          | apiCall 使用宿主 api 或 network 授权后的 fetch           | 新动作不复用这条可接受 URL 的执行入口                        |
| `packages/backend/src/modules/compiler/pipeline.ts`                               | apiCall 在普通动作和 Flow 路径生成 fetch                 | 两条生成路径都必须执行新模式的拒绝规则                       |
| `packages/renderer/src/host/HostCapabilities.ts`                                  | dataResources 默认 false；宿主 api 不受 network 开关控制 | dataResources 只是本地授权条件，不是服务端权限证明           |
| `packages/renderer/src/bridge/ComponentRuntimeBridge.ts`                          | getResource 只读形状已预留                               | M1b-1 不扩展成第二套状态系统                                 |
| `packages/renderer/src/bridge/createComponentRuntimeBridge.ts`                    | getResource 暂返回 error                                 | M1b-2 再实现资源状态及订阅                                   |
| 前端 `ActionSelectorModal`、`actionConfig`、`EventConfigPanel`、`EventFlowEditor` | 存在 apiCall 编辑入口                                    | 新模式隐藏旧动作且执行真实验证；UI 隐藏不代替 gate           |
| 前端 templates 的 profile-user/form-contact/login-simple                          | 存在 apiCall 声明                                        | 纳入迁移清单，不能靠删除 fixture 让门禁通过                  |

生产存储页面是否含 apiCall 尚未统计。本轮不读取用户业务数据；上线切换前必须提供只读扫描报告。源码模板清单不等于历史资产清单。

## 3. 推荐协议（草案，不是现有接口）

### 3.1 引用与页面声明

建议 OperationRef 固定为 `{ operationId, revision }`，两者为有界非空字符串。revision 是不透明的精确修订标识，不解释为 semver，不允许 `latest`、范围或自动升级。相同引用跨环境可映射到不同地址，但必须保持同一输入输出契约和只读语义；否则拒绝部署或创建新 revision。

在 Page Logic 中增加具名 `dataSources`，key 沿用 Logic Key 规则并参与现有声明冲突校验。声明只保存 OperationRef 与参数映射；不保存响应、请求句柄、URL、Headers、Cookie、Token、租户身份、风险或超时策略。

示意（所有新增字段均待批准）：

```json
{
  "logic": {
    "states": { "query": "", "rows": [] },
    "dataSources": {
      "searchItems": {
        "operationRef": { "operationId": "demo.items.search", "revision": "1" },
        "params": { "query": "{{ state.query }}" }
      }
    }
  }
}
```

此例仅展示拟增加区域，不替代现有完整 PageSchema/State 类型。参数值复用现有安全 Value/表达式机制，不增加 JS 执行或第二套表达式语法。Contract 拒绝未知字段、非法引用、超限声明和危险键。

### 3.2 动作与结果

建议新增 `executeDataSource` 动作：`sourceId` 引用当前页声明，`resultTo` 指向已声明的 `state.<key>` 顶层槽位；首版不支持任意深层路径。以宿主校验后的完整公开 JSON 结果作为写入值；复杂投影通过后续已有 setValue/Computed 实现，不增加独立映射 DSL。

示意：`{ "type": "executeDataSource", "sourceId": "searchItems", "resultTo": "state.rows" }`。

动作应在 ActionFlow 中调用，复用 Flow 的顺序、onError、AbortSignal 和预算。首版不新增动作级 onSuccess/onError 嵌套体系；普通事件中的直接调用遵从现有异步动作调度，禁止提前执行后续依赖结果的动作。实现前必须用 fixture 锁定两种调用入口的一致性。

声明只定义输入映射；响应形状来自可信 Operation 契约。resultTo 是页面侧提交目标，不是服务端可执行路径。后端永远不接受客户端传入的“写入目标”并据此写业务数据。

## 4. 信任边界与执行路径

ActionFlow → Session 求值与本地 gate → 宿主 DataSource 接口 → 同源受认证适配端点 → 授权/Resolver → 唯一 DataSourceExecutor → 受控上游。

生成代码和 Renderer 均调用同一个显式注入的宿主接口；缺接口或 dataResources 未授予时拒绝，绝不 fallback fetch/context.api/apiCall。生成模块不携带上游地址或凭据。浏览器的同源传输适配器不是第二套可任意访问上游的 Executor。

推荐宿主请求参数：`pageId`、`pageVersion`、`sourceId`、已求值 `params`、AbortSignal。pageId/version 用于查找受授权页面版本，不作为身份凭据。服务端从可信会话获取用户/租户，读取已保存快照并解析 OperationRef；客户端不发送可信风险等级或自行选择上游地址。

未保存草稿首版禁止外部执行：提示保存页面后查询。导出页必须配置受认证的页面版本/发布引用，不能拿一个 pageId 就获得权限；静态独立演示可显式注入只读本地测试宿主，但不能宣称具备生产授权。发布身份的完整体系不在本阶段扩建。

参数属于不可信输入，即使由合法页面表达式求值也不能获得额外权限。服务端按操作输入 schema 校验并强制权限范围；商户、租户等安全范围来自会话，不能由 params 覆盖。授权判断在每次执行发生，Catalog 展示许可不替代执行许可。

### 4.1 可信操作注册项

本地静态注册包含精确引用、公开说明、参数/结果契约、可信 readonly 风险、权限策略、目标及宿主限额。只向 Agent 暴露经当前权限过滤的公开描述，不暴露目标、凭据或内部错误。

Executor：只允许注册目标；限制协议、地址与端口；拒绝重定向到未授权目标；生产适配器需处理 DNS/重定向 SSRF 边界。测试 loopback 只在隔离测试配置中显式允许，不能成为生产默认例外。只读不能仅由 GET 方法推断，必须是可信注册语义。

输入输出均限制 JSON 深度、体积、字段与记录数；输出先校验再交给客户端，不透传原始上游 Headers。候选默认值：单请求 10 秒、响应 1 MiB、页面并发 4；由可信宿主下调，最终值需结合测试确定，不能让 Schema 提高。

## 5. 并发、取消和错误语义

- 调用开始时冻结参数快照，按 `(sessionId, sourceId)` 递增代际；同一来源采用 latest-started-wins，启动 B 时取消 A。
- 请求被取消/页面卸载/会话替换后，不论上游是否真正停止，都禁止结果和后续成功动作写入 Session。取消结束对应 Flow，不触发用户可恢复 onError；沿用现有不可恢复取消语义。
- 超时是可恢复的结构化错误，可由 Flow onError 处理；超时同时中止请求。服务端也有独立截止时间，不能只依赖浏览器 signal。
- 参数/授权/能力拒绝发生在发送上游请求前。错误代码建议为 UNKNOWN_OPERATION、FORBIDDEN、CAPABILITY_DENIED、INVALID_PARAMS、INVALID_RESULT、TIMEOUT、UPSTREAM_FAILURE；返回安全消息与 traceId，不返回 URL、Token 或上游堆栈。
- 校验成功且代际仍有效时原子替换 resultTo；失败/取消保留旧值。Flow 的加载状态由现有 State/动作表达，M1b-1 不伪装成已实现 getResource。
- 不同 sourceId 若写同一 State，首版按成功提交顺序执行，不保证跨来源 latest-wins；推荐不同目标，测试明确这一边界。
- readonly 首版无自动重试；用户显式重试启动新代际。取消不意味着撤销已发生的服务端行为，因此不能借此开放写操作。

## 6. 旧 apiCall：显式分阶段处理

推荐采用可信部署执行模式：legacy 与 operation-only；不由 Schema/Agent 声明。它是执行安全策略，不借用 Preset 身份编码权限。

1. M1b-0/实现准备期保留现有语义，不悄悄禁用旧页面。扫描源码 fixture、模板和经授权的页面资产，生成每项 URL/方法/结果目标/动作嵌套位置报告，敏感值脱敏。
2. 新能力启用前，operation-only 模式在 Editor/Agent、保存、Preview、Renderer 和 Compiler 递归拒绝所有 apiCall，包括 Flow、loop、if、onError 内嵌动作。即便宿主注入 context.api 也不得绕过。
3. legacy 模式只维持原行为，不能开放新数据源能力、不能被标为“OperationRef 安全闭环”。同一页面禁止混用两类网络动作；dataResources 开关本身不能作为模式判断。
4. 迁移工具只输出建议 Patch：管理员先注册只读 Operation，再人工审核 URL/权限/参数/响应映射；写操作与无法映射的页面阻断迁移。用户确认后走现有 CAS，保留历史快照；不自动把任意 URL 包装成 Operation。
5. operation-only 下打开未迁移页面时，允许展示明确的不可执行迁移诊断，不执行网络、不静默清空动作。切换默认模式前需用户批准及资产清单验收。

替代方案“立刻全局删除 apiCall”破坏兼容；“继续放开 apiCall 与 OperationRef 并存”绕过新边界，因此均不推荐。V1 冻结前应完成受支持资产迁移并决定 legacy 退役时间。

## 7. 六消费面与分阶段门禁

| 消费面       | 必须完成                                                                  |
| ------------ | ------------------------------------------------------------------------- |
| Contract     | 声明/动作纯数据类型，引用/安全键/目标/嵌套限制，往返保真                  |
| Validator    | capability 默认拒绝，递归识别 apiCall 与 executeDataSource，统一错误路径  |
| Editor/Agent | 权限过滤的公开操作目录，真实 Patch 出口，草稿执行拒绝，禁止客户端伪造模式 |
| Renderer     | Session 代际、取消、Flow 错误语义、宿主能力 gate                          |
| Compiler     | 普通动作与 Flow 两条路径一致，显式宿主参数，无裸 fetch 回退               |
| Storage      | 声明 CAS 持久化；查询结果/令牌/错误/资源状态不进入快照                    |

Stage A：Contract 与显式能力矩阵；生产 unsupported，仅测试可信注入支持。
Stage B：可信静态 Resolver、授权与 Executor、受控本地测试服务。
Stage C：Renderer/Compiler 两条执行路径与导出宿主契约。
Stage D：Agent/Editor/Storage 接线和 operation-only 拒绝矩阵。
Stage E：全部证据通过才以独立提交启用；后端和前端构建不兼容时保持拒绝，不能先开 UI。

不改 schemaVersion 来绕过 gate；是否需要协议版本递增，应根据现有版本/能力兼容规则在 Stage A 明确，不能默认所有旧消费者理解新字段。

## 8. 验收与实施切分

最小场景使用隔离本地只读列表服务，不接生产账号。必须经过真实 Resolver/授权/generator，网络服务可控但不能 mock 掉安全判断。

验收包括：正常查询；未知 revision；跨页/跨用户未授权；伪造风险与额外字段；非法参数/结果/超大响应；无宿主能力；取消/超时/卸载；A 晚于 B；错误恢复；不同来源共享目标；嵌套 apiCall 禁止；草稿拒绝；两 Preset 同行为；声明保存重载；真实返回 Patch → 前端重放全等 → 文件仓储 CAS → 新实例回读 → 真实编译产物挂载和交互。

拒绝用例检查上游调用计数为 0；所有异步用例检查迟到响应不能写当前会话。回归不得删除旧断言、下调 M1a 门槛或把 legacy 标为安全成功。

建议 PR 顺序：A 门禁与协议 → B 服务端执行边界 → C Runtime/Compiler → D 编辑器与全链 → E 启用。每个 PR 未完成部分保持 fail-close，阶段 0 PR 不加入这些改动。

## 9. 已认可方向与待冻结事项

已获用户方向认可：精确 revision；logic.dataSources + executeDataSource；首版整结果写入顶层 State；同来源 latest-started-wins；未保存草稿禁止查询；operation-only 与 legacy 分阶段隔离。

方向认可不等于实施授权；协议细节按执行计划 PR A 冻结，获得实施授权后再开发 M1b-1。认证适配器尚未选定：首版仅能交付隔离本地演示；任何真实业务环境启用前，必须指定可信会话来源及页面/操作权限适配器并完成越权测试。不能通过匿名开放端点绕过该前提。
