# M1b-1 PR C 冻结记录：Renderer/Compiler 一致执行

> 状态：已冻结并实施（PR C）；基线 f7423e0（PR A #65、PR B #66、计划 #67 合并后 main）。
> 依据：`m1b-c-runtime-compiler-plan.md`（#67 审查通过）、`m1b-b-execution-freeze.md`（宿主协议消费面）、`m1b-a-protocol-freeze.md`（resultTo 严格语法）。
> `data-source` 能力在 C 交付后仍保持六消费面默认 unsupported；预览宿主适配器与编辑器接线属 PR D。
> 审查修正（review round 1）：① 编译器代际守卫改为**写入点活检查**——登记不再于完成时删除（仅被下一次同源请求或卸载替换），`superseded` 为惰性 getter 在实际写 state 处求值，消除「守卫通过→写入」窗口；普通路径与 Flow 路径均有确定性微任务穿插测试（旧结果在写入前被未完成的新代际穿透时丢弃）。② 参数快照统一为**安全 JSON 快照**：Renderer `JSON.parse(JSON.stringify(...))` + 契约 `deepFreeze`（响应式代理可穿、深冻结、隔离后续变异；不可序列化按可恢复失败），编译器内嵌运行时同语义深拷贝；两侧补嵌套对象/数组/不可变性测试。③ Renderer 以**成员调用**执行宿主服务（保留接收者，类实例适配器的 `this` 绑定不丢）。

## 1. 宿主接口（C 冻结）

- **服务形状**：`DataSourceHostExecuteInput { sourceId, params? }`（schema-contract `operations/`，B 契约请求的严格子集）+ `DataSourceHostService { execute(input, signal?) → Promise<DataSourceExecutionOutcome> }`（renderer `dsl/context.ts`，含 AbortSignal 属传输语义）。
- **注入点**：Renderer 经 `eventContext.dataSources` 注入（与 `context.api` 同层）；编译产物经组件 prop `dataSources` 注入（仅含 executeDataSource 动作的页面在签名上追加 `({ dataSources } = {})`，其余页面签名字节不变）。
- **授权**：`hostCapabilities.dataResources === true` ∧ 服务函数存在，缺一即结构化 fail-close（零宿主调用）；编译产物无 HostCapabilities，仅检查 prop 形状。
- **pageId/pageVersion 绑定归宿主**：Renderer/生成代码只携带 sourceId 与已求值参数；B 端点完整请求由宿主适配器构造。生成模块不携带页面身份、上游地址或凭据。

## 2. Renderer 执行语义（`executor/actions/dataSourceActions.ts`）

1. 授权 gate（try 外抛出，同 apiCall gate 位置）→ 2. Session 必需（代际守卫依赖，无 Session fail-close）→ 3. 声明解析（`context.dataSourceDeclarations`，由渲染入口从校验后 canonical Schema 接线，`Renderer.tsx` 经 `setHostConfig` 透传；缺声明 fail-close）→ 4. 参数求值一次（现有 `resolveValues`）并 `structuredClone` 冻结 → 5. `session.startDataSourceRun(sourceId)` 代际登记（同 sourceId 旧请求立即 abort）→ 6. 组合 signal（session ∧ run ∧ flow，`AbortSignal.any` 带手动组合兜底）调用宿主服务 → 7. 提交守卫（代际未变 ∧ 未 dispose ∧ flow 未 abort）下 `runtime.set(resultTo, outcome.result)` 整值写入。

### 2.1 错误映射（B 8 码 → Runtime 行为）

| 结果                                                   | Flow 模式                                                                                                 | 普通事件模式                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `ok:false`（全部 B 码）                                | 抛 `DataSourceActionError`（携带 code/traceId）→ FlowRun 包装 `FLOW_STEP_FAILED` → Flow 级 onError 可恢复 | 返回 `{success:false, code, message, traceId}`；旧值保留 |
| 取消（代际被取代 / dispose / flow abort / AbortError） | 不可恢复（`createAbortError` 通道），**不经 onError**                                                     | 静默 `{success:false, aborted:true}`，不写回             |
| gate 拒绝                                              | 配置级错误在调用前抛出                                                                                    | 同左（Engine 记录结构化失败）                            |

- 失败/取消保留旧值；无自动重试；v1 无动作级 onSuccess/onError 嵌套。
- 共享同一 resultTo 的不同 sourceId 无跨来源协调：按成功提交顺序（X/R7 测试明确该边界）。
- `RuntimeSession` 新增 `startDataSourceRun / isCurrentDataSourceRun / finishDataSourceRun`；dispose 时全部代际 abort，迟到结果被提交守卫丢弃（旧 Session 写不进新 Session：Session 每页全新实例）。

## 3. Compiler 生成契约（`pipeline.ts`）

- **组件实例内嵌 `__executeDataSource` 运行时**（`useRef` 代际注册表 + `useEffect` 卸载中止）：缺宿主 prop 时返回拒绝（结构化错误，绝不 fallback fetch/`context.api`/apiCall）；结果统一包装 `{superseded, outcome}`。
- **普通事件路径**：`__executeDataSource("sourceId", {params})` `.then(OnResult 处理器)`（守卫后经现有 `resolveResultTarget` 写已声明 state 槽位）`.catch(console.error)`。
- **Flow 路径**：`flowContext.executeWithAbortRace(__executeDataSource(..., flowContext.signal), ...)`；`superseded → createAbortError`（不可恢复）；`!ok → createError('FLOW_STEP_FAILED', …, 'executeDataSource failed [code] (trace …): message', outcome)`；成功后写 resultTo（`throwIfAborted` 前导）。
- **参数快照**：声明 params 经现有 `getExpressionCode` 求值后，在 `__executeDataSource` 内做安全 JSON 深拷贝（与 Renderer 同语义；审查修正②）。
- **未知动作 fail-close（修 A 冻结 §4 残余风险）**：普通路径 default 分支由静默注释改为编译期抛错（`Unsupported action type for compiler`）；Flow 路径 default 本就生成运行期 fail-close（回归保留）。契约校验通过的 schema 只含已知类型，该 default 现实触发路径即「契约新增类型而编译器滞后」，fail-close 是正确行为。
- **声明集穿透修复（main 既有缺口）**：`parseSchema` 独立调用 `analyzeActionFlowDeclarations` 时补传 `declaredDataSourceKeys/declaredStateKeys`（A 冻结：独立调用按空集 fail-close——此前 Flow 摆放在测试矩阵下无法通过编译器分析；A 阶段因生产门禁在分析前拒绝而未暴露）。

## 4. 证据（真实链路；renderer vitest jsdom + backend jest）

| 断言                                                                                        | 测试                                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| R1 真实成功链（挂载→点击→真实 loopback HTTP→整值写入→重渲染）                               | renderer `m1b-datasource-runtime.test.tsx`「R1」             |
| R2 参数快照冻结（求值后改 state 不影响请求）                                                | 「R2」                                                       |
| R3 latest-started-wins（旧请求 abort、迟到结果丢弃）                                        | 「R3」                                                       |
| R4 dispose 中止 + 新 Session 不受污染                                                       | 「R4」                                                       |
| R5 gate fail-close（缺能力/缺服务，零宿主调用）                                             | 「R5」                                                       |
| R6 Flow 超时可恢复（onError 执行、旧值保留）；取消不经 onError                              | 「R6」（本地 Flow schema + setValue onError 探针）           |
| R7 共享 resultTo 按成功提交顺序                                                             | 「R7」（双声明本地 schema）                                  |
| R8 legacy apiCall 不退化（宿主 api 客户端照常驱动）                                         | 「R8」                                                       |
| X1 双路径一致（同一脚本化 outcome 序列，renderer 断言与 compiler C4 对齐）                  | renderer「X1」+ backend `generator.datasource.spec.ts`「C4」 |
| C1 普通路径代码生成（宿主调用/参数求值/无 fetch 回退/旧签名不变）                           | backend「C1」                                                |
| C2 Flow 路径代码生成（executeWithAbortRace + flow signal + 错误映射）                       | backend「C2」                                                |
| C3 未知动作编译期 fail-close（普通路径抛错；Flow 路径回归）                                 | backend「C3」                                                |
| C4 生成代码真实执行（new Function harness：成功/失败保旧值/latest-wins/卸载中止/Flow 恢复） | backend「C4」                                                |
| C5 产物缺宿主运行期 fail-close（无网络回退）                                                | backend「C5」                                                |
| G1 生产清单仍拒绝挂载/编译                                                                  | renderer「G1」+ backend「G1」                                |

M1a/M1b 证据工件（A 阶段）字节未动；C 的证据以本文件 §4 与两个测试套件为准。

## 5. 未完成项与边界

- 预览/编辑器宿主适配器（调用 B 端点、pageId/pageVersion 绑定、身份）：PR D。
- Agent 公开目录暴露、前端编辑入口（`ACTION_TYPE`）：PR D。能力矩阵放行：PR E（六面证据齐后）。
- 服务端会话/代际不在 C 范围（B 并发准入已覆盖服务端；客户端代际在 Renderer/产物内）。
- 双 Preset：Renderer 侧以 preset-test 真实挂载覆盖；preset-antd 的数据能力行为与 Preset 无关（宿主服务注入位与 Preset 正交，A/B 已证 Preset 边界），组件库渲染回归由既有 preset-antd 套件保证。

## 6. 兼容与回滚

- 纯增量：新 handler/新代码生成分支/新可选 prop；无 executeDataSource 的页面生成代码字节不变（旧签名断言）；apiCall 两条路径未动（快照/回归）。
- 回滚 = revert 本 PR：无持久化数据依赖；含声明页面在回滚构建下仍被 A 阶段门禁拒绝（UNKNOWN_LOGIC_FIELD / CAPABILITY_UNSUPPORTED），与 PR A §5 同一约束。
