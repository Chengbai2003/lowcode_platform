# M1b-1 PR C 执行计划：Renderer/Compiler 一致执行

> 日期：2026-09-20。状态：计划待审查；基线 c54282d（PR A #65、PR B #66 合并后 main）。
> 依据：`m1b-execution-plan.md` §4 PR C、`m1b-0-readonly-data-source-design.md` §3.2/§4/§5、`m1b-a-protocol-freeze.md`、`m1b-b-execution-freeze.md`。
> 本计划不授权自动实施、合并、关闭 Issue；实施 PR 从本计划合并后的最新 main 建独立 worktree。
> 交付形态：单一 PR C（与执行计划 §4 表一致，不拆分）；`data-source` 能力六消费面保持 unsupported。

## 1. 目标与退出条件

同一份含 `dataSources` + `executeDataSource` 的 fixture，经**真实 Renderer 挂载交互**与**真实编译产物执行**得到相同的结果、错误与副作用；期间：

- 同 `(sessionId, sourceId)` latest-started-wins：启动新请求取消旧代际；只有校验后且仍为当前代际的结果才提交。
- 页面卸载/切换后旧请求禁止写入新 Session；取消不被 onError 吞掉；超时是可恢复错误、旧结果保留；无自动重试。
- 缺 `dataResources` 能力或宿主函数时确定性拒绝；生成产物不得 fallback 到裸 fetch、`context.api` 或 apiCall。
- Compiler 普通事件路径对未知动作的静默注释（A 冻结文档 §4 记录的残余风险）改为 fail-close。
- 既有 apiCall（Renderer 与两条编译路径）、M1a 能力矩阵、deterministic eval 全部不退化。

退出条件（执行计划 §4 C 行）：同 fixture 双路径一致；gate 关闭期间仅可信测试宿主可执行新动作。

## 2. 已核实的现状与接缝

| 位置                                                 | 现状                                                                         | C 的接缝                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| `renderer/src/executor/actions/asyncActions.ts`      | apiCall 走宿主 api 或 network 授权 fetch；Flow/legacy 双模式、abort 守卫齐全 | 新建 `dataSourceActions.ts`，不改动 apiCall    |
| `renderer/src/executor/Engine.ts` `BUILTIN_HANDLERS` | 无 `executeDataSource`（A 冻结未接入）                                       | 注册新 handler                                 |
| `renderer/src/host/HostCapabilities.ts`              | `dataResources` 能力已存在、默认 false                                       | 不改形状；作为授权条件之一                     |
| `renderer/src/dsl/context.ts`                        | `context.api`/`ui`/`navigate` 等宿主注入位                                   | 新增可选 `context.dataSources` 宿主服务        |
| `renderer/src/session/RuntimeSession.ts`             | generation、dispose abort、`trackCleanup`、FlowRun 并发管理已有              | 新增按 sourceId 的代际注册表，dispose 统一中止 |
| `renderer/src/Renderer.tsx`                          | 已从校验后 schema 计算 `flowAnalysis` 并 `session.configureFlows`            | 同一通道传入 dataSources 声明（不重新解析）    |
| `compiler/pipeline.ts` 普通事件路径                  | apiCall 生成裸 fetch `.then/.catch` 链（约 L1886–2003）                      | executeDataSource 生成宿主服务调用             |
| `compiler/pipeline.ts` Flow 路径                     | apiCall 经 `flowContext.executeWithAbortRace(fetch)`（约 L2502–2626）        | executeDataSource 同模式改为宿主服务调用       |
| `compiler/pipeline.ts` default 分支（L2170）         | 未知动作生成 `/* Unknown action */` 静默注释                                 | 改为编译期 fail-close 报错                     |
| backend `__tests__/generator.flow.spec.ts`           | 已有 `new Function` 执行生成代码的 harness                                   | 复用该模式做真实行为断言                       |

## 3. 冻结的宿主接口

### 3.1 服务形状（C 冻结，B 契约的消费面）

```ts
// schema-contract operations（纯数据）：宿主执行输入
interface DataSourceHostExecuteInput {
  readonly sourceId: string;
  readonly params?: Readonly<Record<string, JsonValue>>; // 已求值并冻结的参数快照
}

// renderer dsl/context（含传输语义，留在 renderer）：宿主服务
interface DataSourceHostService {
  execute(
    input: DataSourceHostExecuteInput,
    signal?: AbortSignal,
  ): Promise<DataSourceExecutionOutcome>;
}
```

- **注入点**：Renderer 经执行上下文 `context.dataSources` 注入（与 `context.api` 同层：宿主显式注入，不属于内置能力）；编译产物经组件 prop `dataSources` 注入（同一形状）。
- **授权条件（缺一即拒绝，零宿主调用）**：`hostCapabilities.dataResources === true` **且** `typeof context.dataSources?.execute === 'function'`。编译产物无 HostCapabilities 概念，仅检查 prop 形状。
- **pageId/pageVersion 绑定归宿主**：Renderer/生成代码只携带 `sourceId` 与已求值 params；`DataSourceExecutionRequest`（B 契约的 `pageId/pageVersion`）由宿主实现构造并调用 B 端点。理由：设计 §4「导出页必须配置受认证的页面版本/发布引用」——页面身份绑定是宿主配置，不是 Schema/Runtime 的知识；生成模块不携带页面身份、上游地址或凭据。编辑器预览的真实适配器接线属 PR D。
- 错误结果直接复用 B 的 `DataSourceExecutionOutcome`（8 错误码 + traceId），C 不发明第二套错误形状。

### 3.2 参数求值与冻结（与现有机制一致）

- 声明 `logic.dataSources[sourceId].params` 在**动作开始时**经现有 `resolveValue/resolveValues`（Renderer）与 `getExpressionCode`（编译侧，同语义表达式代码生成）求值一次。
- 求值结果立即深冻结（JSON 深拷贝）作为快照；后续 state 变化不影响已发出的请求（测试断言）。
- `{{ }}` 模板串的求值语义与现有动作值完全一致（A 冻结 §1.1 已约定「复用现有安全 Value/表达式机制，不增加第二套表达式」）。

## 4. Renderer 执行语义

### 4.1 handler 流程（`dataSourceActions.ts`，双模式与 apiCall 同构）

1. **授权 gate**：能力 + 服务函数检查（fail-close，结构化错误，零宿主调用）。
2. **声明解析**：从校验后 schema 传入的声明表中取 `logic.dataSources[sourceId]`；缺失即结构化错误（正常情况已被 A 阶段 schema 校验拦截，此处为纵深防御）。
3. **参数快照**：求值 + 冻结（§3.2）。
4. **代际登记**：Session 内按 sourceId 的注册表（`Map<sourceId, {generation, controller}>`）：新启动 = 递增代际 + abort 旧 controller；同时记录 session.generation。
5. **调用**：`execute(input, AbortSignal.any([session.signal, run.signal, flowContext?.signal]))`（无 flow 时不含 flow signal）。
6. **结果提交**：`ok:true` 且（代际未变 ∧ session 未 dispose ∧ flow 未 abort）时 `context.runtime.set(action.resultTo, outcome.result)` 整值写入（resultTo 已在 A 阶段 schema 层严格校验为已声明顶层 `state.<key>`）。
7. **失败**：`ok:false` 按下表处理；任何路径**不自动重试**、失败/取消**保留旧值**。

### 4.2 错误码 → 行为映射（B 码到 Runtime 语义）

| B 错误码                                                                   | Flow 模式                                                                                                                   | 普通事件模式                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `TIMEOUT` / `UPSTREAM_FAILURE` / `INVALID_RESULT`                          | 可恢复：抛步骤级错误（`FLOW_STEP_FAILED` 通道），Flow 级 onError 可处理；错误上下文携带 `{code, message, traceId}`          | `{ success:false, code, message, traceId }` 返回；旧值保留 |
| `INVALID_PARAMS` / `FORBIDDEN` / `CAPABILITY_DENIED` / `UNKNOWN_OPERATION` | 同上（可恢复，交给 onError 诊断）                                                                                           | 同上；不额外弹 message（结构化结果为准）                   |
| 取消（代际被取代 / session dispose / flow abort）                          | 不可恢复：走现有 `FLOW_ABORTED` 语义原样外抛，**不经 onError**（与现有不可恢复取消一致，A 冻结「取消不可由 onError 吞掉」） | 静默返回 `{ success:false, aborted:true }`，不写回         |
| 宿主 gate 拒绝（缺能力/缺服务）                                            | 配置级 fail-close：在调用前抛出（同 apiCall 的 gate 位置，可被 onError 视为步骤失败）                                       | 同左，结构化错误                                           |

- **共享 resultTo 的不同 sourceId**：无跨来源协调，各自按成功到达顺序提交（后者覆盖前者）；测试明确该边界，不宣称跨来源 latest-wins。
- **dispose**：注册表内全部 controller 随 session dispose 统一 abort；迟到结果在提交守卫处丢弃（新 Session 是全新对象，旧引用天然写不进）。
- v1 无动作级 onSuccess/onError 嵌套（A 冻结）；Flow 内 executeDataSource 之后依赖结果的步骤按现有顺序语义等待前一步完成。

## 5. Compiler 两条路径

### 5.1 生成契约（两路径一致）

- 生成的 executeDataSource 代码只做：求值参数快照 → 调用注入的 `dataSources.execute({ sourceId, params }, signal)` → 按结果写 state（或进入 Flow 错误通道）。
- **绝不**生成 fetch、`context.api`、apiCall 形态的网络代码；产物缺 `props.dataSources?.execute` 时在运行期抛结构化 fail-close 错误（点名缺宿主能力，不静默）。
- 生成模块内嵌与 Renderer 同语义的按 sourceId 代际守卫（组件实例内模块级注册表 + 卸载 `useEffect` 清理中止），保证「卸载/换页后禁止旧请求写入」。

### 5.2 普通事件路径

`.then` 链形态（与现有 apiCall 生成一致的风格）：`dataSources.execute(...).then((outcome) => { if (outcome.ok && 代际仍当前) setState(...) })`；失败分支不写 state、不弹消息，错误进入 console 可见的结构化对象（供宿主调试，非用户提示）。

### 5.3 Flow 路径

复用 `flowContext.executeWithAbortRace(hostCall, ...)` + `flowContext.signal`（apiCall 现模式）；`ok:false` 的可恢复错误经 `flowContext.createError('FLOW_STEP_FAILED', ...)` 携带 B 码与 traceId 进入 onError；abort 语义沿用现有不可恢复路径。

### 5.4 未知动作 fail-close（修 A 冻结残余风险）

default 分支由静默注释改为抛编译错误（BadRequest 通道，指明 `action.type`）。安全性：contract 校验通过的 schema 只含已知动作类型，今日可达 default 的唯一现实路径恰是「契约新增类型而编译器滞后」（A 阶段 executeDataSource 的情形），fail-close 是正确行为；既有资产不受影响（全量回归 + 快照证明）。

## 6. 测试矩阵（全部真实链路；两 Preset 均覆盖 Renderer 侧）

| #   | 场景                                                          | 套件与断言要点                                                                                          |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| R1  | 成功链：点击 → 参数求值 → 受控服务结果 → state 提交 → UI 呈现 | renderer jsdom 真实挂载点击；宿主适配器背后是**真实 loopback HTTP 服务**（不是同步 stub），等待真实异步 |
| R2  | 参数快照冻结                                                  | 点击后立即改 state；请求捕获的 params 保持求值时值                                                      |
| R3  | latest-started-wins                                           | 同 sourceId 连发 A(慢)/B(快)：A 被取消（适配器观测 abort）、B 提交、A 迟到结果被丢弃                    |
| R4  | 卸载/换页                                                     | in-flight 时 unmount/dispose：新 Session 状态不被写入、旧请求 abort                                     |
| R5  | 宿主 gate                                                     | 缺能力 / 缺服务函数：结构化拒绝，适配器调用计数 0                                                       |
| R6  | Flow 语义                                                     | TIMEOUT → Flow onError 执行且旧值保留；Flow 取消 → onError 不执行（不可恢复）                           |
| R7  | 共享目标不同来源                                              | 两 sourceId 写同一 state：按成功到达顺序提交，后到覆盖                                                  |
| R8  | legacy 回归                                                   | apiCall 在 Renderer 与两编译路径行为/快照不变                                                           |
| C1  | 普通路径代码生成                                              | 含 `dataSources.execute` 调用与求值参数；不含 fetch/apiCall；快照固化                                   |
| C2  | Flow 路径代码生成                                             | `executeWithAbortRace` 包宿主调用 + flowContext.signal                                                  |
| C3  | 未知动作                                                      | 两路径编译期 fail-close 报错                                                                            |
| C4  | 生成代码真实执行                                              | 复用 `new Function` harness 注入宿主服务：成功提交 / 失败映射 / abort 丢弃 / 代际守卫                   |
| C5  | 生成产物缺宿主                                                | 运行期结构化 fail-close，无网络调用                                                                     |
| X1  | 双路径一致（退出条件）                                        | 同一 fixture 分别走真实 Renderer 与真实生成产物，结果/错误/副作用一致                                   |
| G1  | 能力门禁不退化                                                | 生产清单下含新动作的 schema 仍被 Renderer/Compiler 拒绝（A 证据不变）；C 测试全部在可信测试矩阵下运行   |

- 两个 Preset（antd/test）的 Renderer 侧用例同构覆盖；不引入对 AntD message 的数据能力依赖（结构化结果是唯一断言对象）。
- backend 编译器用例在 backend jest；Renderer 用例在 renderer vitest(jsdom)；loopback 服务复用 B 的受控上游 helper 形态（renderer 侧新建同语义小 helper）。

## 7. 改动清单（供审查对照）

- `schema-contract/src/operations/types.ts`：+`DataSourceHostExecuteInput`（+契约测试）
- `renderer/src/dsl/context.ts`：+`dataSources` 宿主服务类型
- `renderer/src/executor/actions/dataSourceActions.ts`（新）+ `Engine.ts` 注册
- `renderer/src/session/RuntimeSession.ts`：+按 sourceId 代际注册表（dispose 中止）；`Renderer.tsx` 声明表接线
- `renderer/src/__tests__/`：R1–R8、X1（双 Preset）
- `backend/src/modules/compiler/pipeline.ts`：两路径 + default fail-close；`__tests__/`：C1–C5、X1、快照更新
- `docs/plans/m1b-c-runtime-freeze.md`（交付时冻结：宿主接口、代际/取消/超时语义、生成契约、错误映射、边界）
- 不动：HostCapabilities 形状、生产能力矩阵、M1a/M1b 证据工件、前端编辑入口（D）、预览宿主适配器（D）、apiCall 全部行为

## 8. 边界与停止条件

- 不做：真实后端预览接线（D）、Agent 目录/编辑 UI（D）、能力矩阵放行（E）、资源状态系统（M1b-2 F/G）、写操作。
- 停止并回到设计评审：需要破坏现有 Flow 取消语义、需要扩大 Preset 公共 API、需要变更编译产物对外契约（超出新增一个可选 `dataSources` prop）、需要改持久化协议。
- 交付要求沿用执行计划 §7：base/head、命令与结果、CI 对应最终 HEAD、真实成功链与拒绝链、生产能力仍关闭声明、兼容与回滚说明；不自动合并、不自动关闭。
