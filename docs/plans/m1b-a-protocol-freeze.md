# M1b-1 PR A 协议冻结记录：只读数据源声明与 executeDataSource

> 状态：已冻结并实施（PR A）；基线 ef640cf（#64 合并后 main）。
> 依据：`m1b-0-readonly-data-source-design.md` §3 草案、ADR-0005、ADR-0009、`m1b-execution-plan.md` §2「实施前待定细节」。
> 本记录锁定 PR A 交付的协议细节；B/C/D/E 未交付前 `data-source` 能力保持六消费面默认 unsupported。

## 1. 冻结的协议

### 1.1 字段必选性

| 位置 | 字段 | 必选性 | 说明 |
| --- | --- | --- | --- |
| `logic.dataSources` | 区域整体 | 可选 | `Record<LogicKey, DataSourceDeclaration>`；键规则与其他 Logic 区域一致（`isSafeLogicKey`，拒绝 `__proto__`/`constructor` 等） |
| 声明 | `operationRef` | **必填** | 精确二元组 `{ operationId, revision }`，二者均必填非空字符串 |
| 声明 | `params` | 可选 | 普通对象（非数组、plain prototype）；键必须安全；值任意 JsonValue |
| 声明 | 其他一切字段 | 拒绝 | `UNKNOWN_DATASOURCE_FIELD`——url/headers/凭据/token/风险/超时等越界字段天然落入此拒绝 |
| `operationRef` | 其他一切字段 | 拒绝 | `UNKNOWN_OPERATION_REF_FIELD` |
| 动作 `executeDataSource` | `type` / `sourceId` / `resultTo` | **全部必填** | v1 无 onSuccess/onError 嵌套（Flow 级 onError 已覆盖恢复语义）；携带即 `UNKNOWN_ACTION_FIELD` |

- `operationId` 格式：`^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$`（点分标识，如 `demo.items.search`）；不接受 URL、协议、通配。
- `revision` 格式：`^[A-Za-z0-9][A-Za-z0-9._-]*$`（不透明精确修订）；显式拒绝 `latest`/`*`（不区分大小写）→ `OPERATION_REVISION_FLOATING`；范围记号（`~1`、`>=1`）不匹配格式 → `INVALID_OPERATION_REVISION`。
- 参数值中的 `{{ }}` 模板串在 Contract 层保持不透明（computed 的 mustache 禁令不适用于 params）；执行开始时由与现有动作值相同的机制求值并冻结快照（renderer `resolveValue`/`interpolateTemplate`，编译侧同语义插值），属 C 阶段约定，A 只记录不实现。

### 1.2 长度与数量上限（宿主控制，Schema 不可放宽）

| 限额 | 默认 | 硬上限 | 超限错误码 |
| --- | --- | --- | --- |
| `maxDataSourceEntries` | 20 | 100 | `DATASOURCE_ENTRIES_BUDGET_EXCEEDED` |
| `maxDataSourceParamEntries` | 20 | 100 | `DATASOURCE_PARAMS_BUDGET_EXCEEDED` |
| `maxOperationIdLength` | 128 | 256 | `INVALID_OPERATION_ID` |
| `maxOperationRevisionLength` | 32 | 128 | `INVALID_OPERATION_REVISION` |

值深度/体积继续由全局预算覆盖（`SCHEMA_DEPTH_EXCEEDED` 深度 32、`maxJsonNodes` 25 000、`maxBytes` 1 MiB）。声明不含 ActionList，不与动作节点/深度预算交互。

### 1.3 错误代码

新增（沿用 SCREAMING_SNAKE 惯例）：`INVALID_DATASOURCES_OBJECT`、`INVALID_DATASOURCE_KEY`、`DATASOURCE_ENTRIES_BUDGET_EXCEEDED`、`INVALID_DATASOURCE_DECLARATION`、`UNKNOWN_DATASOURCE_FIELD`、`OPERATION_REF_REQUIRED`、`UNKNOWN_OPERATION_REF_FIELD`、`INVALID_OPERATION_ID`、`INVALID_OPERATION_REVISION`、`OPERATION_REVISION_FLOATING`、`INVALID_DATASOURCE_PARAMS`、`INVALID_DATASOURCE_PARAM_KEY`、`DATASOURCE_PARAMS_BUDGET_EXCEEDED`、`DATASOURCE_SOURCE_ID_REQUIRED`、`INVALID_DATASOURCE_SOURCE_ID`、`DATASOURCE_REFERENCE_MISSING`、`DATASOURCE_RESULTTO_REQUIRED`、`UNDECLARED_STATE_TARGET`。

复用既有：`INVALID_OBJECT_PROTOTYPE`、`SYMBOL_PROPERTY_FORBIDDEN`、`ACCESSOR_PROPERTY_FORBIDDEN`、`COMPUTED_TARGET_READONLY`、`INVALID_STATE_TARGET`、`UNKNOWN_ACTION_FIELD`、`CAPABILITY_UNSUPPORTED`。

### 1.4 resultTo 严格语法（仅新动作）

精确 `state.<key>`：单段、安全 Logic Key、且 `<key>` 必须已在 `logic.states` 声明。禁止 `computed.*`、深层路径与未声明键。**不放宽 legacy 嵌套**（即使页面无 states 声明也不放宽），**不收紧旧 apiCall**（`validateLogicTarget` 路径一字未动）。声明集合经共享 `ActionValidationContext.dataSourceValidation` 显式传入，覆盖组件事件与全部嵌套 Flow 容器（steps/onError、if.then/else、loop.actions、apiCall.onSuccess/onError、dialog.onOk/onCancel）；`analyzeActionFlowDeclarations` 经 options 接收同一集合，独立调用时按空集合 fail-close。

### 1.5 能力修订与 schemaVersion

- 新能力 `data-source`，revision 1；能力集合变更为 4 项。`buildTrustedCapabilityMatrix` 改为显式登记表驱动：新增 `SCHEMA_CAPABILITIES` 条目必须在 `TRUSTED_CAPABILITY_STATUSES` 显式登记，否则模块初始化失败（消除"追加能力名即默认放行"）。既有 3 项能力六面 supported/revision 1 **完全不变**（回归红线）。
- `schemaVersion` 维持 `[0]` 不变。新字段是加法且被能力门禁默认拒绝，无已持久化页面含此字段，零迁移；旧构建遇该字段以 `UNKNOWN_LOGIC_FIELD` fail-close，行为正确（与 ADR-0008 在 v0 内分阶段激活 flows 的先例一致）。

### 1.6 canonical 语义

`dataSources` 区域参与 canonical 重建：键按字典序排序；声明内固定 `operationRef`（`operationId` → `revision`）→ `params` 字段顺序；输入的 operationRef 键序错误被规范化纠正；往返保真（`JSON.parse(JSON.stringify(canonical))` 与声明语义相等）。

## 2. 结构合法 ≠ 部署允许

结构单测走 `createCanonicalPageSchema`（纯结构，不做能力评估）；全部 9 个真实入口汇聚的 `requireSupportedPageSchema` 在结构通过后叠加生产可信清单评估 → `CAPABILITY_UNSUPPORTED`（六面逐面点名）。这与 ADR-0008 F1 的「解析层拒绝」不同：M1b 的分阶段控制点在能力矩阵，不在结构白名单。

## 3. 入口拒绝证据（每入口真实测试，无共享断言）

| 入口 | 证据 | 拒绝形态 |
| --- | --- | --- |
| 服务保存 | `ev-m1b-ingress-save` | 400 `CAPABILITY_UNSUPPORTED`×6，仓储未被调用 |
| 仓储直接保存 | `ev-m1b-ingress-repo` | corrupted-store 错误，磁盘字节/版本指针/快照不变 |
| 磁盘重载 | `ev-m1b-ingress-reload` | 真实清单下 fail-close；测试矩阵放行后可恢复（证明拒绝来自门禁） |
| Agent 草稿 | `ev-m1b-ingress-agent-draft` | `SCHEMA_INVALID`，draft 不变、不保存 |
| Agent Patch 结果 | `ev-m1b-ingress-agent-patch` | `replacePageLogic` 引入 dataSources 即能力拒绝 |
| Agent bindEvent/insertComponent | `ev-m1b-ingress-agent-bindevent` | 动作白名单提前拒绝（"Unsupported action type"）——等效 fail-close，不要求统一错误码 |
| 编辑器 JSON/Logic 保存 | `ev-m1b-ingress-editor-json` | `parseAndValidateFullSchema`/`parseAndValidatePageLogic` 均拒 |
| Renderer 挂载 | `ev-m1b-ingress-renderer` | 会话创建与任何网络调用之前拒绝 |
| 编译服务 / 直接编译 | `ev-m1b-ingress-compiler-*` | 代码生成前 400 / `BadRequestException`，事件位与 Flow 位两种摆放均拒 |

回归组：legacy apiCall 照常保存/绑定；M1a 定型语料照常编译/挂载/过编辑器校验。M1a 的 3×6 证据与 sha256 钉死语料**字节未动**；M1b 使用独立 fixture（`m1b-datasource-conformance.json`，独立 sha256）与独立检查脚本（`check-m1b-capabilities.mjs`，已入 CI）。

## 4. 未完成项与后续边界

- Renderer `BUILTIN_HANDLERS`、Compiler 两条生成路径、前端 `ACTION_TYPE` 编辑入口：**A 阶段均未接入**（能力门禁保证含新动作的 Schema 到达不了；前端 `ACTION_TYPE` 为本地常量，契约联合加成员不产生编译错误，typecheck 验证通过）。
- 宿主 DataSource 接口、OperationResolver、Executor、Session 代际/取消：B/C 阶段。
- `executeDataSource` 在生产 `CORE_ACTION_TYPES`（Agent 动作白名单）中**保持缺席**至 D 阶段接线。
- Compiler 普通事件路径对未知动作的静默注释（`/* Unknown action */`）是能力门禁关闭下的残余风险，C 阶段修复。

## 5. 兼容与回滚

- 既有页面/动作零影响：apiCall、flows、states/computed 行为不变（回归组证明）。
- 回滚方式：revert 本 PR 即回到 3 能力矩阵；因生产从未接受过 dataSources 字段，无已持久化资产需要迁移。若在门禁放行后回滚，已保存的含声明页面将以 `UNKNOWN_LOGIC_FIELD` fail-close——须先按执行计划 §7 的快照备份与关闸流程处理。
