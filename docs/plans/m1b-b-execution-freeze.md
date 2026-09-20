# M1b-1 PR B 执行协议冻结记录：可信只读执行内核

> 状态：已冻结并实施（PR B）；基线 aedbcc2（PR A/#65 合并后 main）。
> 依据：`m1b-0-readonly-data-source-design.md` §4–§5、`m1b-execution-plan.md` §4 PR B、ADR-0005、`m1b-a-protocol-freeze.md`。
> 本记录锁定宿主执行协议与服务端执行边界；`data-source` 能力在 B 交付后仍保持六消费面默认 unsupported（生产清单字节不变），Renderer/Compiler 接线属 PR C。

## 1. 冻结的宿主执行协议（schema-contract `operations/`）

### 1.1 请求（`DataSourceExecutionRequest`）

| 字段          | 必选性   | 校验（`validateDataSourceExecutionRequest`，错误码统一 `INVALID_PARAMS`）                                                                    |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pageId`      | **必填** | 非空字符串 ≤256；只用于定位已保存快照，不是凭据                                                                                              |
| `pageVersion` | **必填** | 安全正整数（`Number.isSafeInteger` 且 ≥1）                                                                                                   |
| `sourceId`    | **必填** | 安全 Logic Key（`isSafeLogicKey`），必须指向该快照 `logic.dataSources` 的已声明条目                                                          |
| `params`      | 可选     | 普通对象、键安全、键数 ≤ `maxDataSourceParamEntries`(20)、值过共享 JsonValue 深度/节点预算；是宿主求值后的冻结快照，服务端不二次求值 `{{ }}` |
| 其他一切字段  | 拒绝     | 未知字段 fail-close——`url`/`token`/`tenantId` 等越界字段天然落入此拒绝                                                                       |

- AbortSignal 属传输层（C 阶段宿主调用与取消语义），不进入请求类型。
- 返回值为剥离原型链的深拷贝（复用 `inspectAndSanitizeJsonValue` 语义），入参后续变异不影响结果。

### 1.2 结果（`DataSourceExecutionOutcome`）

- 成功：`{ ok: true, result, operationId, revision, traceId }`——`result` 是通过 Operation 输出契约校验后的完整公开 JSON。
- 失败：`{ ok: false, code, message, traceId }`——`message` 为安全消息（不含上游 URL、端口、凭据、上游堆栈），`traceId` 为每次执行生成的 UUID。

### 1.3 错误码与 HTTP 映射（冻结集合，不随场景增删）

| code                | HTTP | 语义                                                                           | 上游计数          |
| ------------------- | ---- | ------------------------------------------------------------------------------ | ----------------- |
| `UNKNOWN_OPERATION` | 404  | `(operationId, revision)` 精确二元组不在可信注册                               | **0**             |
| `FORBIDDEN`         | 403  | 缺身份适配器 / 身份不可信 / 未授予操作权限 / 部署未配置目标 / 目标违反注册约束 | **0**             |
| `CAPABILITY_DENIED` | 403  | 当前部署能力清单未放行 `data-source`                                           | **0**             |
| `INVALID_PARAMS`    | 400  | 请求形状 / sourceId 未声明 / 输入契约不过                                      | **0**             |
| `EXECUTION_BUSY`    | 429  | 同页面并发准入被拒                                                             | **0**（被拒请求） |
| `INVALID_RESULT`    | 502  | 上游已响应但输出不合法：体积/深度/JSON/结果契约                                | 请求已发生        |
| `TIMEOUT`           | 504  | 服务端独立截止时间超时（请求已发出并中止）                                     | 请求已发生        |
| `UPSTREAM_FAILURE`  | 502  | 传输失败 / 非 2xx / 重定向（`redirect:'error'` 不跟随）                        | 请求已尝试        |

页面/快照不存在复用 Nest `NotFoundException`（404，非执行错误码）。设计 §5 建议的 7 码全部保留，另增 `EXECUTION_BUSY` 承载并发准入（它同样是"零上游请求"的前置拒绝，不能伪装成上游失败）。

## 2. 服务端执行边界（backend `modules/data-source/`）

### 2.1 固定执行顺序

请求形状 → 页面快照回读（404）→ 能力门禁（`evaluatePageSchemaCapabilities`，真实生产清单）→ 声明解析（sourceId）→ Operation 注册解析（精确二元组）→ 身份（适配器）→ 权限（`requiredPermission`）→ 目标绑定 → 输入契约 → 并发准入 → 唯一 Executor → 输出契约。

前置拒绝全部发生在任何上游请求之前（测试逐项断言上游计数 0）；上游已响应后的失败不宣称零调用。

### 2.2 可信注册（`trusted-operation-registry.ts`）

- 唯一注册：`demo.items.search` @ revision `1`，`kind: 'readonly-query'`（只读语义来自注册，不由 HTTP 方法推断），`requiredPermission: 'data-source:demo.items.search:execute'`。
- 输入契约：键 ⊆ {`query`(≤128 字符), `limit`(整数 1–50)}；安全范围（租户/权限）键天然落入未知键拒绝，params 无法授予任何权限。
- 输出契约：`{ items: [{ id, title, price? }] }`，结果/条目字段白名单，条目数 ≤100，节点预算 5000。
- 公开目录（`listTrustedOperationSummaries`）只含 operationId/revision/title/description/kind，不含目标、权限或限额。

### 2.3 目标绑定（`upstream-targets.provider.ts`）

- 目标只来自服务端可信绑定表 `${operationId}@${revision}` → URL；页面 Schema、Agent Patch、客户端请求均无法注入。
- 默认绑定表为空：任何部署未显式配置即 FORBIDDEN，不存在匿名生产路由或公网默认例外。
- `demo.items.search` 声明 `loopback-only` 约束并在解析时强制：即使可信配置被误配为公网地址/非 http(s)/坏 URL，解析失败 → FORBIDDEN（零上游请求）。loopback 判定覆盖 `127.0.0.0/8`、`localhost`、`::1`。

### 2.4 身份适配器（`data-source-identity.adapter.ts`）

- 端口：`resolveIdentity({ pageId, pageVersion, sourceId })` → 可信身份或 undefined；返回 undefined 即页面级拒绝。
- 默认实现 `UnconfiguredDataSourceIdentityAdapter` 恒拒——**端点存在即确定性拒绝，不因实现权限端口而宣称生产鉴权已交付**。
- 身份携带 `grantedPermissions`；执行权限 = 注册项 `requiredPermission` ∈ 身份权限集合。用户/租户身份不来自请求或 params。

### 2.5 唯一 Executor（`data-source-executor.ts`）

- 只执行「可信注册 + 可信绑定」解析出的 GET 请求；查询串来自已通过输入契约的参数。
- 限额三项（默认 10s / 1 MiB / 深度 32）在**流式读取过程中**强制：超字节或超深度立即 `reader.cancel()` + abort 连接（服务端可观测到响应未写完即中止），绝不完整读取后才检测。深度扫描是 `JSON.parse` 之前的防线，深度炸弹不进入解析。
- 服务端独立截止时间：超时中止请求并返回 TIMEOUT；不依赖任何调用方 signal。
- `redirect: 'error'`：不跟随重定向，防止绕过目标约束；非 2xx 不读响应体直接 UPSTREAM_FAILURE。
- 传输层失败细节只进服务端日志；客户端只收脱敏 reason。

### 2.6 并发准入与限额覆盖

- 同 `pageId` 上游并发默认上限 4（服务端准入，与 C 阶段客户端代际/取消互补）；超出 EXECUTION_BUSY，被拒请求零上游调用；不同页面互不影响；失败后槽位释放。
- 宿主限额覆盖只允许向下：有效值 = min(注册默认, 覆盖值)；非法覆盖值（非正整数）在构造期抛 TypeError（fail-close，模块不启动）。页面 Schema 与请求无法影响限额。

## 3. 端点

`POST /api/v1/pages/:pageId/data-sources/:sourceId/execute`（AuthGuard 同其他控制器；路径参数权威，请求体只携带 `{ pageVersion, params? }`，未知体字段 fail-close）。模块接入 `AppModule`：默认部署（无适配器、无目标绑定、data-source unsupported）对所有请求确定性拒绝。

## 4. 证据（全部真实链路，loopback 受控上游）

| 断言                                                                            | 测试（backend jest）                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 真实成功链：参数→上游→校验→结果                                                 | `data-source-kernel.spec.ts`「executes the declared operation…」「omitting params…」；`data-source-endpoint.spec.ts`「responds 200…」（真实 HTTP + supertest） |
| 未知 operation/revision → 404，计数 0                                           | kernel「rejects unknown operationId/revision…」                                                                                                                |
| 生产清单 CAPABILITY_DENIED，计数 0                                              | kernel「rejects with CAPABILITY_DENIED under the real production manifest」；endpoint 同名用例                                                                 |
| 缺适配器确定性拒绝，计数 0                                                      | kernel「rejects deterministically without an identity adapter」；endpoint「FORBIDDEN under default providers」                                                 |
| 未授权身份 / 未配置目标 / 公网目标误配，计数 0                                  | kernel「identity without the required permission」「no upstream target」「non-loopback target binding」                                                        |
| 请求形状 / sourceId 未声明 / 输入契约（含租户键走私），计数 0                   | kernel「request-shape violations」「params that violate the operation input contract」；endpoint「body shape violations」                                      |
| 并发准入（EXECUTION_BUSY 计数不增、跨页放行、失败释放）                         | kernel describe「并发准入」                                                                                                                                    |
| 超大响应流中终止（服务端观测未写完即中止）                                      | kernel「terminates an oversized response during streaming」                                                                                                    |
| 深度炸弹解析前终止                                                              | kernel「terminates a depth bomb during streaming (pre-parse guard)」                                                                                           |
| 非 JSON / 输出契约各分支（请求后拒绝，计数 1）                                  | kernel「rejects invalid JSON」「rejects output contract violations」it.each×6                                                                                  |
| 5xx / 重定向不跟随（重定向目标计数 0）/ 连接拒绝 / 超时（504 且服务端观测中止） | kernel 对应用例                                                                                                                                                |
| 消息脱敏（不含 host/端口/URL）                                                  | `expectSanitizedMessage` 应用于全部失败用例                                                                                                                    |
| loopback 解析矩阵 / 注册表精确匹配                                              | `trusted-operation-registry.spec.ts`                                                                                                                           |
| 契约请求校验（27 用例）                                                         | schema-contract `operations-contract.spec.ts`                                                                                                                  |

## 5. 未完成项与后续边界

- Renderer/Compiler 宿主调用、参数冻结快照、`(sessionId, sourceId)` 代际与取消：**PR C**（本 PR 的 `DataSourceExecutionRequest/Outcome` 即 C 的宿主契约基线）。
- 服务端无会话状态：latest-started-wins 是 C 的客户端语义；B 的并发准入只做同页面准入，不追踪代际。
- 客户端断连不取消服务端执行（结果被丢弃）；如需透传取消属后续决策点。
- Agent 公开目录接线（`listTrustedOperationSummaries` 已就绪未暴露）、编辑器 UI：PR D。
- 能力矩阵不变：`data-source` 六面 unsupported；正向测试仅经进程内测试矩阵（`createTestCapabilityMatrix`）构造快照与放行，生产清单字节不变。
- M1b 证据清单（`m1b-capability-evidence.json`）仍为 A 阶段范围（能力矩阵 + 9 入口）；B 的证据以本文件 §4 的真实测试为准，不扩展 A 已合并的证据工件。

## 6. 兼容与回滚

- 纯增量：新契约模块、新 backend 模块、AppModule 增一行 import；既有 API、存储格式、能力矩阵零改动。
- 回滚 = revert 本 PR：端点与内核整体移除，无持久化数据依赖（声明快照本就无法在生产清单下保存/加载）。若 B 已合并且测试配置下存过含声明页面，回滚后这些快照在旧构建下无法加载——与 PR A §5 同一约束，须按执行计划 §7 处置。
