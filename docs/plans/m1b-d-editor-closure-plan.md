# M1b-1 PR D 执行计划：编辑器与持久化闭环（草案 v3）

> 日期：2026-09-21。状态：**计划文档，随本 PR 提交审查；未改任何功能代码**。
> v2 并入外部审查 round 1 四项意见：① operation-only 策略实现归 D（不再缩减为混用拒绝）；② 版本绑定补脏页面/会话一致性/null 判定；③ Outcome 映射补 traceId 约定、成功字段校验、原始 Response 路径与解析期 abort；④ 新增真实编辑器集成验收用例。两个可加性契约扩展按条件接受（paramsContract 单源派生）。
> v3 并入 round 2 两项修正：① D10 成功链改为「配置变脏先被拒 → 保存为 v2 → 查询成功携带 v2」（消除与 §3.1 脏页禁止的自相矛盾）；② 错误体同样做完整字段校验（code/message/traceId 任一缺失或类型错误、body 非合法 JSON → 统一固定安全消息 + local- traceId），防止 `{code:"TIMEOUT"}` 类残缺体生成违反 B 契约的 Outcome。
> Base：main `b6b545d`（PR C #68 合并后，CI run 35498082990 绿）。勘察 worktree：`/private/tmp/lowcode-m1b-d-plan`（分支 `codex/m1b-d-plan`，自 origin/main 新建）。
> 依据：`m1b-execution-plan.md` §4「PR D」与 §5 验收矩阵、`m1b-0-readonly-data-source-design.md` §6/§7/§8、ADR-0005、Proposed ADR-0009、`m1b-c-runtime-freeze.md` §5。
> 本计划不授权：切换生产执行模式（默认 legacy 字节级不变）、启用生产能力（六面 unsupported 保持到 E）、新增生产认证体系、迁移用户资产、自动合并或关闭 Issue。

## 1. 目标与退出条件

PR D 把 A/B/C 已交付的协议、执行内核与双路径运行时接到真实出口：可信部署执行策略（legacy / operation-only 的**实现**，不启用）、Agent 权限过滤目录、真实 preview/write 工具 Patch、前端重放、生产文件仓储 CAS、新实例回读、编译产物在真实适配器下执行、真实编辑器接线验收。

退出条件（对照执行计划 §4 D 行，全部须有可复现证据）：

1. **重放全等**：真实 write 工具返回的 Patch，经前端 `applyPatchToSchema` 重放后与服务端预览（`PatchApplyService.applyPatch`）产出完全相等；两侧对着同一份由真实链生成的 fixture 断言，禁止手写期望 Patch。
2. **CAS 与回读**：真实文件仓储保存铸造新 `pageVersion`；携带旧 `basePageVersion` 再保存得 409（含 expected/received）；全新仓储实例（新进程内对象、重读磁盘）回读声明全等，且快照不含任何运行值（结果、代际、错误、凭据）。
3. **产物执行**：回读页面经真实 `CompilerService` 编译的代码，在显式宿主（真实适配器 → 真实 HTTP execute 端点 → 真实 loopback 上游）下执行，结果整值写入已声明 State；失败路径按 B 错误码语义可见。
4. **执行策略矩阵（D 实现策略，E 才启用切换）**：operation-only 模式下**一切** apiCall 被递归拒绝（含纯 apiCall 页面）；legacy 模式拒绝 data-source 新能力；同页混用任何模式下拒绝；三条规则在 schema-contract 校验层单点实现、六面继承；`context.api` 的存在不导致挂载失败，但不能绕过上述策略。
5. **目录 ≠ 授权**：Agent/编辑器只获得身份过滤后的操作目录；存在「目录可见但 B 逐请求拒绝」的负例证据。
6. **草稿与脏页 fail-close**：未保存草稿与「声明已改未保存」的脏页面执行均为零 HTTP 请求；保存成功后适配器下一次请求自动携带新版本；保存失败/409/切页不错误刷新绑定。
7. **真实编辑器集成链**：加载 → UI 配置查询（配置即使页面变脏，点击先被拒、零 HTTP）→ 保存成功 → 再点击查询成功且请求携带新版本 → UI 更新，全链在真实编辑器组件上验收（D10），覆盖脏页拒绝、保存失败 409 不刷新绑定与切页失效。
8. **生产默认行为保持**：生产清单与默认策略字节不变（默认 legacy）；默认部署下 data-source 页面在保存、预览、编译、Agent 编辑仍被拒（现有 ingress 断言全部保留），纯 apiCall 页面行为不变。

## 2. 已核实的现状与接缝（base `b6b545d`）

### 2.1 真实入口（已核实，直接可用）

| 面            | 现状                                                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent 工具    | `packages/backend/src/modules/agent-tools/definitions/` 三组共 15 个工具；write 工具统一走 `executeWriteTool`（write.tools.ts:18-39）→ `previewValidatedPatch`，返回 `{patchDelta, updatedWorkingSchema}`。HTTP 面：`POST /agent/edit`、`POST /agent/patch/preview`（agent.controller.ts:121-128）               |
| Patch 双实现  | 前端 `packages/frontend/src/editor/services/patchAdapter.ts:75`（`applyPatchToSchema`）；服务端孪生 `agent-tools/patch-apply.service.ts:79`（同一 6 op 集合；b4 集成测试已注明等价关系）。`replacePageLogic` 与 `cloneSchema` 已保留 `logic` 字段往返                                                            |
| 持久化        | `PUT/GET /api/v1/pages/:pageId/schema`（page-schema.controller.ts）。仓储 `repositories/page-schema.repository.ts`：JSON 文件存储（env `PAGE_SCHEMA_FILE_PATH` 可指向临时文件，:47-48）、快照不可变、`basePageVersion` CAS 409（:126-141）、原子写（tmp+fsync+rename）、载入时全量重校验（:282-292）             |
| 编译          | `POST /api/v1/compiler/export`（compiler.controller.ts:40-54）：校验请求 schema → 按仓储页面的 `runtimeCompatibility` 解析受信绑定 → 编译。**生成代码不内嵌 pageId/pageVersion**（pipeline.ts 无任何引用，grep 证实）——版本绑定天然归宿主侧，与 C 冻结一致                                                       |
| B 端点        | `POST /api/v1/pages/:pageId/data-sources/:sourceId/execute`，body 仅允许 `pageVersion/params`（`ALLOWED_BODY_FIELDS`）；body 携带 pageId/sourceId 被拒（B 冻结）                                                                                                                                                 |
| 响应包裹      | 成功：TransformInterceptor 信封 `{success:true, data:{ok:true,result,operationId,revision,traceId}, message, timestamp, path}`（`ok`≠`success` 不触发直通分支）；错误：HttpExceptionFilter 平铺 `{statusCode, code, message, error, timestamp, path, traceId}`（无信封）——**两种形状不对称，适配器映射按此冻结** |
| HTTP 客户端   | `fetchApp.request(url, options)`（httpClient.ts:55）返回**原始 Response**（不抛错）；`.get/.post/.put` 在其上包装 handleResponse，对非 2xx 抛 `HttpClientError`——适配器必须用 `request()`，否则 B 错误会被误归类为网络异常                                                                                       |
| 预览挂载      | `SelectableCanvas.tsx:161-171` 应用内挂 `Renderer`（`LowcodeProvider` 直通）；预览声明来自**当前编辑器草稿 schema**（这是脏页漂移的根源，见 §3.1）；eventContext 仅 app 上下文 + antd ui；`hostCapabilities` 未传；`pageVersion` 从未到达预览宿主，编辑器 state 为 `number                                       | null`（null 即未绑定，LowcodeEditor.tsx:70） |
| 版本/修订状态 | `pageVersion`（number \| null）+ 稳定化 `pageVersionRef`（:74-77）；`schemaRevision` 每次编辑 bump（editor-store.ts:311-317）；`generation` 标识页面会话（切页/重载递增，usePageLifecycle 守卫）                                                                                                                 |
| 测试矩阵缝隙  | dist `capabilities/manifest.js` 的 `getTrustedCapabilityManifest` 进程内 monkey-patch（backend `withSupportedDataSourceAsync`，data-source-kernel.spec.ts:30-58；renderer/frontend 同型）。生产清单字节不变，正向测试仅走此缝隙                                                                                  |

### 2.2 关键不存在项（D 需新建，均经检索确认）

1. **Agent 目录工具与 HTTP 目录路由均不存在**；`listTrustedOperationSummaries()`（trusted-operation-registry.ts:210-224）无任何消费者。
2. **浏览器 `DataSourceHostService` 适配器不存在**（`renderer/src/dsl/context.ts:14-19` 接口仅测试宿主实现）。
3. **Agent 动作白名单硬拒绝 `executeDataSource`**：`page-schema/action-validation.ts`（`Unsupported action type`），m1b-datasource-ingress.spec.ts:156-238 已钉住并注明"PR D 才接线"——该断言在 D 中**反转为允许类型、改由 capability/策略校验拒绝**（生产默认下 data-source schema 仍整体被拒，生产语义不变）。
4. **不存在任何执行模式机制**：无 `executionPolicy` 概念、`capabilities/detect.ts` 不扫描 apiCall（:174-177 仅 runFlow/executeDataSource）、无混用/策略拒绝规则。D 需实现完整策略（§3.4）。
5. **前端 `ACTION_TYPE` 无 executeDataSource**，且动作清单在两处硬编码重复（actionConfig.ts:21-32 与 ActionSelectorModal.tsx:24-112）。
6. **身份端口仅 per-sourceId `resolveIdentity`**（data-source-identity.adapter.ts:14-20），无页面级解析；默认 `UnconfiguredDataSourceIdentityAdapter` 返回 undefined（确定性 FORBIDDEN / 空目录语义）。
7. 已知缺口**不在 D 开**：无 page-list 路由；前端「新标签页打开」指向的 `/preview` 路由不存在；`useDraftStorage` 为死代码；`compilerApi.ts` 绕开 `fetchApp`（默认端口与 token 来源不一致）。均记录，不在本 PR 修。

## 3. 冻结的接口约定

### 3.1 页面版本绑定与保存后更新规则（含草稿/脏页禁止执行）

漂移根源（审查 round 1 指出）：预览 Renderer 的声明来自**草稿 schema**，而 B 按**保存快照**解析执行。v1 已保存 `searchItems → operation A`，用户未保存改成 B 时，Renderer 按新声明求值、适配器却发 v1、服务端实际执行 A——「新声明 + 旧快照」组合是语义错误，必须在上游拦截。

- **绑定铸造（唯一两个事件点）**：仅在「页面加载成功」或「保存成功」时铸造绑定 `{pageId, pageVersion, schemaRevision, generation}`——pageId 与 pageVersion 必属同一编辑会话的同一快照。判空按 `number | null` 的真实类型（`pageVersion == null` 即未绑定）。保存进行中、保存失败、409、切页加载中**均不铸造/不刷新**绑定。
- **脏页禁止查询（首版取严）**：适配器每次 `execute` 前校验「当前 `generation === 绑定.generation` 且当前 `schemaRevision === 绑定.schemaRevision`」；任一不等（切页、或保存后任何再次编辑——revision 每次编辑 bump）→ fail-close：抛固定消息 Error（宿主配置缺陷语义，不伪造 B Outcome），**零 HTTP 请求**（fetch 层 spy 计数 0 断言），UI 显示「先保存再查询」。取舍写明：v1 宁可误拒「保存后无关编辑」（如改了个标题）也绝不放行声明漂移；v2 若需放宽，改为仅比对 `logic.dataSources` 片段深相等，不在本 PR。
- **保存期间继续编辑**：保存成功铸造的绑定记录**本次 PUT 携带 schema 的 revision**；若保存期间又有编辑（当前 revision 更高），绑定即刻为脏 → 下次查询仍拒绝，提示再次保存。不会错误放行。
- **保存失败/409**：绑定保持旧值；由于 revision 已超前于旧绑定，页面自然处于脏态 → 查询被拒，直到重新保存或重载。**不出现「409 后仍按旧版本查询」的路径**。
- **切页/重载**：`generation` 变化使旧绑定失效（读取时校验），新页面加载成功才铸造新绑定；期间查询 fail-close 零 HTTP。
- **在途请求不强杀 + latest-wins 边界澄清**：保存产生新版本后，旧版本上仍在飞的请求不主动取消（B 对精确版本快照语义合法且不可变）。同 sourceId latest-started-wins **仅在启动新查询时**取消旧代际——声明变化本身不触发取消、不"自动覆盖"；正因如此，脏页拦截必须发生在「启动新查询」之前（上一条已保证），两者不可互相替代。
- **编译产物宿主**：生成代码不内嵌 pageId/pageVersion（§2.1 已证）；显式宿主自行绑定导出页面的 `(pageId, pageVersion)`，且绑定同样只在「确认快照」后铸造。D 的产物执行测试用保存响应的返回值铸造绑定。

### 3.2 B 端点响应 → 宿主 Outcome 映射（浏览器适配器）

新建 `packages/frontend/src/editor/services/dataSourceHostApi.ts`：

- **请求构造**：`POST {apiBase}/api/v1/pages/{pageId}/data-sources/{sourceId}/execute`；body 恰为 `{pageVersion}` 或 `{pageVersion, params}`（镜像 B 的 `ALLOWED_BODY_FIELDS`，**绝不把 pageId/sourceId 放进 body**）；鉴权沿用 `fetchApp`（Bearer 仅在配置时附加）。
- **传输层**：必须用 `fetchApp.request(url, {method:'POST', body, signal})` 取**原始 Response**（httpClient.ts:55）；禁止 `.post()`——其包装层对非 2xx 抛 `HttpClientError`，会把 B 的结构化错误误归类为网络异常。无重试、无客户端截止时间（服务端 deadline/字节/深度限额权威）；每 `execute` 恰好一次 POST。
- **abort 语义（任何时点保持取消，不进映射表）**：调用前 `signal.aborted` → 立即抛 AbortError；`fetch` reject 时**先判 `signal.aborted`**（取消优先于网络失败分类）；**响应体读取/解析期间** abort → 同样抛 AbortError，不把半截响应当失败 Outcome。本地取消绝不降级为 B Outcome——取消不可恢复语义归 C。
- **本地失败 traceId 约定**：`DataSourceExecutionFailure.traceId` 为必填（types.ts），本地失败（网络异常、形状意外、未知码）由适配器铸造 `local-<randomUUID()>`；**`local-` 前缀是「非服务端 trace」的标识约定**（未经 B 链路、无法在服务端检索），UI/日志据此区分；服务端 trace 原样透传，绝不伪造非 `local-` 前缀。
- **映射表（冻结）**：

| HTTP 结果                                                                                                                                         | 映射为 Outcome                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2xx ∧ 信封 `success===true` ∧ `data.ok===true` ∧ `data.result` 为合法 JSON 值 ∧ `data.operationId/revision/traceId` 均为非空 string               | `{ok:true, result, operationId, revision, traceId}`（**完整字段校验，任一畸形不得当成功**，落下行）                              |
| 2xx 但信封/数据形状意外（含上述字段校验失败）                                                                                                     | `{ok:false, code:'UPSTREAM_FAILURE', message:FIXED_UNEXPECTED, traceId:local-…}`                                                 |
| 非 2xx ∧ body 为合法 JSON ∧ `code` ∈ B 八码集 ∧ `message` 为非空 string ∧ `traceId` 为非空 string                                                 | `{ok:false, code:body.code, message:body.message, traceId:body.traceId}`（message 为 B 已脱敏消息，直传）                        |
| 非 2xx 但任一校验失败：code 缺失/未知、message/traceId 缺失或类型错误、body 非合法 JSON（含 401 鉴权失败、404 路由不存在、无码 5xx、HTML 错误页） | `{ok:false, code:'UPSTREAM_FAILURE', message:FIXED_UNEXPECTED, traceId:local-…}`                                                 |
| fetch 网络异常（reject 且非 abort）                                                                                                               | `{ok:false, code:'UPSTREAM_FAILURE', message:FIXED_NETWORK, traceId:local-…}`（**不透传 `error.message`**，防内部地址/堆栈泄露） |

- **错误体完整字段校验（v3 冻结）**：`{code:"TIMEOUT"}` 这类缺 message/traceId 或字段类型错误的残缺体，不得直接生成违反 B 契约的 Outcome（`Failure.message/traceId` 必填 string）——必须同时满足「已知 code ∧ 非空 string message ∧ 非空 string traceId ∧ body 为合法 JSON」才按错误码直传，否则统一落固定安全消息 + `local-` traceId 的 UPSTREAM_FAILURE。
- 错误码判定以 `body.code` 为权威（不按 status 反推）。**纯函数 `mapDataSourceExecuteResponse(status, body, mintLocalTraceId)` 独立导出**，预览适配器与测试共用；固定消息常量集中定义，测试逐字断言。

### 3.3 可信身份下的操作目录

- **端口扩展（审查已接受）**：`DataSourceIdentityAdapter` 新增**具体方法** `resolvePageIdentity(context: {pageId, pageVersion})`，默认实现返回 `undefined`（fail-close）。`UnconfiguredDataSourceIdentityAdapter` 与既有测试适配器零改动继承默认；逐请求授权路径不变。
- **过滤规则**：`listTrustedOperationSummaries()` ∩ `identity.grantedPermissions ⊇ requiredPermission`；身份 `undefined`（默认部署）→ **空目录**（不报错、不暴露任何条目）。
- **目录过滤 ≠ 授权**：目录是视图层便利；B 的逐请求授权（快照声明 → 受信 operation → identity → permission）不变。必须附负例：页面级身份授了权限（目录可见）而 per-source 解析返回无权限身份 → 执行 FORBIDDEN、上游计数 0。
- **注册表附加字段（审查有条件接受——单源派生）**：`TrustedOperationDefinition` 增 `paramsContract`（结构化：`query: string ≤128`、`limit: integer 1–50`），且 **`validateParams` 改为由同一 `paramsContract` 派生**（demo.items.search 的校验器重构为基于 paramsContract 的通用实现）——单一事实源，不允许两份独立规则；加边界回归测试锁行为（limit 0/1/50/51、query 空/128/129 字符，接受/拒绝与重构前一致）。`listTrustedOperationSummaries()` 增返该字段，供 Agent/UI 配置 params。
- **Agent 工具**：`list_data_source_operations`（visibility `'agent'`，只读、无 patchDelta；以 `ToolExecutionContext` 的 pageId/resolvedPageVersion 解析页面身份）。
- **HTTP 路由**：`GET /api/v1/data-source/operations?pageId=&pageVersion=`（AuthGuard；类型化 DTO，两参必填、pageVersion 为 ≥1 整数——与 B「无版本/浮动版本拒绝」一致，不提供 latest 语义）。响应（信封包裹）`data: { operations: Summary[] }`；身份未配置 → `{operations: []}`。**不新增任何认证体系**，沿用共享密钥 AuthGuard。
- **前端消费**：`dataSourceCatalogApi.ts`（走 `fetchApp`）。

### 3.4 可信部署执行策略：legacy / operation-only（D 实现，E 启用）

设计 §6 的完整策略在 D 落地为实现（不是启用）：**模式是可信部署配置，不由 Schema/Agent/客户端声明或切换**（无 schema 字段、无页面级开关）；生产默认 legacy，**D 不切换默认模式**；E 的启用提交才做受控切换。

- **策略载体**：schema-contract 新增受信常量与 getter `getTrustedExecutionPolicy(): 'legacy' | 'operation-only'`（默认 `'legacy'`）。**新增文件/常量，不修改 `TRUSTED_CAPABILITY_MANIFEST` 既有字节**；生产默认行为字节级不变。
- **三条校验规则（单点实现：`evaluatePageSchemaCapabilities` 消费策略 + `detect.ts` 增加 apiCall 递归扫描，经 `requireSupportedPageSchema` 六面自动继承——Renderer 挂载、Compiler ingress、Storage 写/读、Agent patch 预览、前端 JSON/Logic 保存）**：
  1. **operation-only 递归拒绝一切 apiCall**（含**纯 apiCall 页面**；含 then/else/actions/onSuccess/onError/onOk/onCancel 嵌套与 Flow steps/onError），新错误码 `APICALL_FORBIDDEN_BY_POLICY`；
  2. **legacy 拒绝新数据源能力**：使用 data-source（声明或动作）∧ 策略为 legacy → 拒绝，新错误码 `DATASOURCE_REQUIRES_OPERATION_ONLY`（启用 data-source 的部署必须处于 operation-only——该耦合由校验层结构化保证，进程内测试矩阵也必须显式带策略，不存在隐性 legacy 正向路径）；
  3. **模式无关混用拒绝**：data-source ∧ 任意 apiCall → `DATASOURCE_MIXED_API_CALL`（任何模式下拒绝）。
- **与 capability 评估的顺序**：capability 先行；已被 capability 拒绝的 schema 不叠加策略 issue（保持既有 ingress 断言与错误信息字节稳定）；策略规则仅在 capability 放行（测试矩阵 / E）时生效。
- **context.api 不绕过、也不因存在而挂载失败**（修正草案 v1）：撤销「Renderer 注入 api 即抛错」守卫。防绕过由「策略在挂载必经的校验层执行」保证——operation-only 下含 apiCall 的 schema 挂载即被拒，`context.api` 在页内没有消费者；Renderer 无需感知宿主注入物，策略不依赖它。编译产物无 context.api 概念。
- **既有 B/C 测试 seam 更新（语义不变、断言不放松）**：backend `withSupportedDataSourceAsync` 与 renderer/frontend 同型 manifest patch helper 同步补 `getTrustedExecutionPolicy → 'operation-only'` 补丁（它们本就是 data-source 正向场景，规则 2 要求显式策略）。
- **agent 白名单**：`action-validation.ts` 允许集加入 `executeDataSource`（同步 `prompt-builder.ts` CORE_ACTION_TYPES）；受同一策略校验约束。生产默认（legacy + unsupported）下 data-source schema 仍在 capability 层被拒，改动惰性。

## 4. 前端最小查询动作配置

- 新 `ExecuteDataSourceActionEditor`（`actionEditors/` 目录）：
  - `sourceId`：下拉选择已声明数据源，或「新建查询」内联建声明（operation 下拉 ← 目录 API（真实 HTTP，需已保存版本，否则提示先保存）、sourceId 命名、params 键值编辑，键值进入 `declaration.params` 静态字面量）；
  - `resultTo`：下拉选择已声明顶层 state（可顺带新建声明）；
  - 未保存草稿 / 脏页：面板显示「先保存再查询」（执行侧由 §3.1 绑定校验 fail-close 兜底）。
- **接线四点**（缺一不可，均需单测）：`actionConfig.ts`（ACTION_TYPE + ACTION_TYPE_CONFIG）、`ActionSelectorModal.tsx` 本地数组、`EventConfigPanel.tsx` `handleAddAction` 默认值、`EventFlowEditor.tsx` `renderActionEditor`/`getActionSummary` 分派。
- **不做**：URL/headers/方法编辑（OperationRef 语义：目标与风险只存在于服务端受信注册）、完整 API 管理器、资源状态/Table/Form（M1b-2 F/G）。
- 两处硬编码动作清单的重复**记录为技术债**，D 内两处同步添加，不借机重构。

## 5. 改动白名单

仅以下路径允许改动（测试文件与 fixture 伴随各自改动）；其余一律不动：

| 包              | 路径                                                                                                                        | 性质      | 内容                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| schema-contract | `src/capabilities/policy.ts`（新）+ `evaluate.ts`/`detect.ts` + 错误码类型                                                  | 新增/修改 | `getTrustedExecutionPolicy`（默认 legacy）、apiCall 递归扫描、三条策略规则（`APICALL_FORBIDDEN_BY_POLICY` / `DATASOURCE_REQUIRES_OPERATION_ONLY` / `DATASOURCE_MIXED_API_CALL`）、capability 先行不叠加 |
| schema-contract | `dist/`                                                                                                                     | 重建      | 门禁链要求：改契约先构建 dist                                                                                                                                                                           |
| backend         | `data-source/data-source-identity.adapter.ts`                                                                               | 修改      | `resolvePageIdentity` 具体默认方法（fail-close）                                                                                                                                                        |
| backend         | `data-source/trusted-operation-registry.ts`                                                                                 | 修改      | `paramsContract` + `validateParams` 单源派生重构 + summaries 扩展                                                                                                                                       |
| backend         | `data-source/` 目录 service/controller/DTO                                                                                  | 新增      | `GET /data-source/operations`（AuthGuard，只读）                                                                                                                                                        |
| backend         | `agent-tools/definitions/`（catalog 工具）+ `types/tool.types.ts` 依赖                                                      | 新增/修改 | `list_data_source_operations`                                                                                                                                                                           |
| backend         | `page-schema/action-validation.ts` + `ai/prompt-builder.ts`                                                                 | 修改      | 允许 `executeDataSource`                                                                                                                                                                                |
| backend         | `agent-tools/types/editor-action.types.ts`                                                                                  | 修改      | 镜像动作类型补 executeDataSource                                                                                                                                                                        |
| renderer        | （无生产代码改动）                                                                                                          | —         | 策略经 schema-contract 校验层继承，v1 的「context.api 挂载守卫」已撤销                                                                                                                                  |
| frontend        | `editor/services/dataSourceHostApi.ts`                                                                                      | 新增      | 预览适配器 + `mapDataSourceExecuteResponse` 纯函数（`fetchApp.request` 原始 Response 路径）                                                                                                             |
| frontend        | `editor/services/dataSourceCatalogApi.ts`                                                                                   | 新增      | 目录消费                                                                                                                                                                                                |
| frontend        | `editor/hooks/`（绑定状态：`usePageLifecycle`/`useEditorActions` 落点或新 hook）                                            | 新增/修改 | §3.1 绑定铸造/失效（generation+revision 校验）                                                                                                                                                          |
| frontend        | `editor/components/PropertyPanel/actionConfig.ts`、`ActionSelectorModal.tsx`、`EventConfigPanel.tsx`、`EventFlowEditor.tsx` | 修改      | §4 接线四点                                                                                                                                                                                             |
| frontend        | `editor/components/PropertyPanel/actionEditors/ExecuteDataSourceActionEditor.tsx` + `index.ts`                              | 新增      | 最小配置面板                                                                                                                                                                                            |
| frontend        | `editor/components/layout/PreviewPane/SelectableCanvas.tsx`（或 LowcodeEditor.tsx 传参处）                                  | 修改      | 预览接线：`eventContext.dataSources` + `hostCapabilities={{dataResources:true}}`                                                                                                                        |
| 测试            | `test-fixtures/m1b-d-editor-closure.json`                                                                                   | 新增      | 真实链生成（§6.0）                                                                                                                                                                                      |
| 测试            | backend `__tests__/m1b-d-editor-closure.spec.ts` 等、frontend/renderer/schema-contract 对应 spec                            | 新增/修改 | §6 矩阵；`m1b-datasource-ingress.spec.ts` agent 断言按 §2.2-3 反转；backend/renderer/frontend 三处测试 seam helper 补 policy 补丁                                                                       |

**显式不做**（防夹带）：不动 `TRUSTED_CAPABILITY_MANIFEST` 既有字节、不切生产默认策略（legacy）；不动 M1a fixtures/evidence/scripts 字节；不动 preset-antd/preset-test 运行时（C 已覆盖双 Preset）；不开 page-list 路由、`/preview` 独立路由；不修 `compilerApi.ts`（列为已知债务，除非审查要求纳入）；不动 Flow 取消语义、不迁移任何用户页面；Renderer 生产代码零改动。

## 6. 测试链与验收矩阵

### 6.0 共享 fixture 生成机制（满足"实际输出、非手写"）

- 新 `test-fixtures/m1b-d-editor-closure.json`（**新文件**，M1a fixture 不动），内容：`{baseSchema, patch, expectedSchema, compiledCode, endpointSamples}`。
- backend e2e spec 支持 `UPDATE_M1B_D_FIXTURE=1` 时把**真实链输出**写入该文件；常规运行与提交的 fixture 断言全等。
- 确定性处理：组件/动作 id 用工具入参显式指定（或在测试内注入确定性 id 生成器——测试配置，不触生产代码）；响应体中 `timestamp`/`path` 字段以占位符记录、断言忽略；`snapshotId`/`savedAt` 等只做语义断言（pageVersion 等），不逐字比较。
- `endpointSamples`：真实 supertest 录制的 B 端点响应（成功 + ≥3 个错误码如 INVALID_PARAMS/FORBIDDEN/401-无码；TIMEOUT 等慢路径允许用与 HttpExceptionFilter 形状一致的回放字节并标注来源），供前端适配器映射测试与 D10 编辑器集成回放。

### 6.1 测试矩阵

| ID  | 面                                                                     | 内容（全部真实链，安全判断不 mock）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | backend jest（进程内矩阵+policy 窗口）                                 | 主链：临时仓储文件（`PAGE_SCHEMA_FILE_PATH`→tmp）真实保存 v1 → 真实 agent 工具（`replace_pageLogic` 加 `logic.dataSources` + `bind_event` 绑 `executeDataSource`）产出真实 patch → 服务端 `previewPatch` → **HTTP CAS 保存**（supertest，生产 ValidationPipe）得 v2 → 旧 `basePageVersion` 再存 → 409(expected/received) → **全新仓储实例**回读 v2 声明全等 ∧ 无运行值键 → 真实 `CompilerService` 编译（页面自身 runtimeCompatibility/antd）→ `new Function` 产物执行，宿主服务经 supertest HTTP 调真实 execute 端点 + loopback 上游 → state 整值写入；同一链复跑错误路径（INVALID_PARAMS/FORBIDDEN）断言上游计数与脱敏消息。窗口外负例：同一保存不带矩阵/策略 → 拒绝（引既有 ingress spec 为证，不重复实现）                                                                                                                                                        |
| D2  | frontend vitest                                                        | 读 fixture：`applyPatchToSchema(baseSchema, patch)` 深等于 `expectedSchema`（重放全等，与服务端 D1 产出对同一 fixture）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D3  | frontend vitest                                                        | 适配器映射：loopback 服务回放 `endpointSamples` 真实字节 → 断言 §3.2 全表（成功**含 operationId/revision/traceId 完整校验、畸形成功落 UPSTREAM_FAILURE**；八码完整体直传；**错误体缺字段/字段类型错误/非合法 JSON（如 `{code:"TIMEOUT"}`、HTML 错误页）→ 统一 UPSTREAM_FAILURE 固定消息 + `local-` traceId**；未知码/401；网络失败固定消息 + `local-` traceId；各时点 abort 抛 AbortError 不降级）；经 `fetchApp.request` 原始 Response 路径（B 错误不被误归类网络异常）；请求体断言恰为 `{pageVersion[, params]}`                                                                                                                                                                                                                                                                                                                                                   |
| D4  | frontend vitest                                                        | 产物+适配器联合：fixture `compiledCode`（真实生成）+ 真实适配器 + loopback（真实字节）→ 模拟点击 → 查询 → state 写入；失败码经错误语义可见                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D5  | backend jest                                                           | 目录：test identity（授 `demo.items.search`）→ 目录恰含该 op（含 paramsContract，与 validateParams 行为一致——边界值防漂移断言）；`resolvePageIdentity` 未配置 → 空（agent 工具与 HTTP 路由一致）；HTTP 缺参/非法 pageVersion → 400；**目录≠授权负例**：页面身份授权（目录可见）而 per-source 身份无权限 → 执行 FORBIDDEN、上游计数 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D6  | contract/backend/renderer/frontend                                     | **策略矩阵**：operation-only 下**纯 apiCall 页面**（无 data-source）与嵌套 apiCall（if/loop/Flow/onError ≥3 层）均被拒（校验层单测全覆盖 + 四真实入口各一：Renderer 挂载、compiler export、storage save、agent patch 预览、前端 JSON/Logic 保存）；legacy 下 data-source 被拒（`DATASOURCE_REQUIRES_OPERATION_ONLY`，矩阵放行+legacy 策略组合）；混用拒绝两模式各一；**生产默认（legacy+unsupported）下纯 apiCall 页面各入口行为字节不变**（回归）；`context.api` 注入不改变上述任何结果（不挂载失败、不可绕过）                                                                                                                                                                                                                                                                                                                                                     |
| D7  | frontend vitest                                                        | 草稿/脏页 fail-close（单元级）：未加载（pageVersion 为 **null**）→ 抛固定消息、fetch spy 计数 0；加载后编辑（revision 超前）→ 同拒；配置面板含「先保存再查询」提示                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D8  | frontend vitest                                                        | 绑定生命周期（单元级）：仅「加载成功/保存成功」铸造绑定；保存失败/409/进行中不铸造不刷新；保存期间继续编辑 → 新绑定即刻为脏；切页（generation 变化）→ 旧绑定失效零错版本请求；保存成功 → 下次请求 body.pageVersion 为新值（spy 断言）；在途旧版本请求不被伪造取消/错误                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D9  | 全部                                                                   | 回归：M1a/M1b 既有断言全保留（含生产清单字节、六面 ingress、C 的 12+16+1 用例）；backend/renderer/frontend 三处 seam helper 补 policy 后全绿且断言不放松；新增不降低任何既有门槛                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D10 | frontend vitest（真实编辑器集成，审查 round 1 新增、round 2 修正流程） | 真实 `LowcodeEditor` 挂载（jsdom + user-event），fetchApp 层不 mock，全部后端依赖由 loopback 回放服务承接（GET/PUT `/pages/:id/schema`、GET `/data-source/operations`、POST execute——响应字节取自 `endpointSamples`/真实形状，GET 页面内容由 fixture schema 提供；D1 已证真实端点行为，此处证编辑器接线，**不宣称前端跑了真 Nest**，需 manifest+policy 测试注入）。流程（与 §3.1 脏页规则一致，**配置查询本身即变脏**）：加载 v1 → 真实 UI 配置查询动作（目录选 operation、建声明、选 resultTo）→ 预览点击查询 → **被拒**（execute 端点零请求 + 「先保存再查询」提示可见）→ PUT 保存成功（回放 200/v2）→ 再点击 → **查询成功**：请求 body.pageVersion===2、真实适配器 → 回放端点 → UI 断言结果渲染（state 绑定探针）；随后再编辑（revision 超前）再点 → 再次被拒；回放 409（旧 basePageVersion 保存失败）→ 绑定不刷新仍拒；切页 → 旧绑定失效零错版本请求直至新页加载 |

### 6.2 对执行计划 §5 验收矩阵的覆盖映射

| §5 行                                               | D 证据                                                      |
| --------------------------------------------------- | ----------------------------------------------------------- |
| 正常查询                                            | D1（产物经真实端点）、D4、D10（编辑器链）                   |
| 未知/未授权/伪造/缺 capability                      | D1 错误路径、D5（既有 B spec 回归保留）                     |
| 嵌套 apiCall、新旧混用                              | D6（策略矩阵，含纯 apiCall 页）                             |
| 保存/重载（声明全等、运行值不持久化、精确引用不变） | D1                                                          |
| Patch/CAS（重放全等、旧版本 409）                   | D1、D2                                                      |
| 导出缺宿主确定性拒绝                                | C 已覆盖，D9 回归                                           |
| A/B Preset                                          | C 已覆盖（D 链用页面自身 preset，不新增断言、不宣称新覆盖） |
| 回归                                                | D9                                                          |

### 6.3 模板/fixture apiCall 分类记录（执行计划 §4 末条）

在冻结文档（非本计划）新增一节：枚举现有模板与 test-fixtures 中 apiCall 出现处（文件、方法、resultTo、嵌套位置，敏感值脱敏），分类为 legacy-合法（生产默认 legacy 下行为不变；operation-only 启用后属待迁移清单，归 E）。**只记录，不改任何字节，不读线上用户页面。**

## 7. 边界、风险与停止条件

- **生产默认行为字节级不变**：`TRUSTED_CAPABILITY_MANIFEST` 既有字节不动；执行策略默认 legacy（新增受信常量）；D 合并后生产 = legacy + 六面 unsupported，纯 apiCall 页与 data-source 页行为与合并前完全一致（D6/D9 断言）。预览接线（`dataResources:true` + 适配器注入）在生产默认下不可达（schema 挂载先被拒），仅为测试注入与 E 演示就位。
- **模式切换归 E**：D 交付策略实现与耦合校验（legacy 拒 data-source / operation-only 拒 apiCall），不切任何生产默认；E 的启用提交同时交付 data-source 矩阵放行与 operation-only 切换（结构上已被规则 2 强制同步）。
- **不新增生产认证体系**：目录与执行路由均沿用 AuthGuard 共享密钥；身份仍只来自可信适配器（D 仅以测试适配器 overrideProvider 注入）。不可用客户端自报身份。
- **不迁移用户资产**：e2e 全程临时仓储文件；不批量改历史 apiCall 页面；迁移工具（设计 §6.4）不在 D。
- **契约扩展按审查条件执行**：`resolvePageIdentity` 默认拒绝、逐请求授权不变；`paramsContract` 与 `validateParams` 单源派生 + 边界防漂移测试。
- **停止条件**：策略规则引发既有 fixture/模板回归且无法归因于预期语义变化；需要破坏 Preset 公共 API、持久化协议版本或 Flow 取消语义；需要新增生产鉴权或读取未授权用户页面；前端双硬编码清单被要求超出最小接线的重构。命中即停，报告影响面与替代方案。
- **交付纪律**：审查通过后从最新 main 建隔离 worktree 出单一实施 PR（Refs 关联，不自动 Closes）；本地门禁命令链（先 schema-contract dist 构建）；CI 对应最终 HEAD；合并须单独授权。
