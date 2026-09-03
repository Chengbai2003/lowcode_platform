# Agent Eval（Issue #38 / M1F-1）

两条隔离的评测通道：

```text
eval:deterministic → CI blocking（无网络、无模型凭据）
eval:live          → 手动/定时趋势观测（需要真实模型凭据与运行中的后端）
```

## 运行

```bash
pnpm eval:deterministic   # jest --config ./test/eval/jest.eval.config.js（CI 阻断）
pnpm eval:live            # 需目标部署的身份元数据；不进 CI
```

- `eval:deterministic`：Patch 用例使用离线 Fixture AIService 调用公开的
  `AgentRunnerService.runEdit()`，并执行真实 `ToolExecutionService`、Policy、
  AutoFix、PatchValidation 和 Preview 编排。Draft/Validation/Safety/Conflict 仍是生产
  Contract、安全校验器和 Repository CAS 探针，不伪装成 Agent 自然语言场景。
  整个通道无网络、无真实模型凭据，同一代码跑两遍逐键比对
  （Replay Reproducibility）。
  报告写入 `.codex/artifacts/agent-eval/deterministic.{json,md}`。
  每个 Fixture Patch 会额外记录固定 Replay 指令版本与 Runner 实际采用的
  effective Policy Profile；Eval 不重新运行关键词分类器猜测该值。
- `eval:live`：先创建真实页面，再对运行中的后端 `POST /agent/edit` 发送用例 intent；
  Draft/Patch 记录真实首轮完成，可表达的 Validation/Safety 以生产边界的预期拒绝为成功。
  Conflict 是 Repository CAS 步骤序列，不能由一次 `agent/edit` 如实表达，因此当前统一标记为
  `unsupported`，留待 A3 按具体操作验收。表达式与录制 Patch 注入场景同样会标记为 `unsupported`。Live 报告以
  Report v1 输出全部状态与覆盖率，未验证项不能被成功率掩盖。
  报告记录经脱敏的 Tool Call 名称/状态、repair、usage/cost（服务端可用时）及版本标签，写入
  `.codex/artifacts/agent-eval/live/`。

Live 不能把**本地 checkout**的 Git、Contract、Prompt、Tool 或 Manifest 标签冒充为远端部署事实。
运行前必须由部署/调度器显式注入下列目标身份（缺失即 fail-close，不生成误导性报告）：

```bash
AGENT_EVAL_BASE_URL=https://target.example/api/v1
AGENT_EVAL_TOKEN=...
AGENT_EVAL_TARGET_REVISION=<target git sha or release id>
AGENT_EVAL_CONTRACT_PACKAGE_VERSION=<target schema-contract version>
AGENT_EVAL_PROMPT_VERSION=<target prompt revision>
AGENT_EVAL_TOOL_VERSION=<target tool manifest revision>
AGENT_EVAL_MANIFEST_VERSION=<target component manifest revision>
AGENT_EVAL_PROVIDER=<requested provider>
AGENT_EVAL_MODEL_ID=<requested model/config id>
pnpm eval:live
```

当前 production API 尚未把解析后的实际 Provider/Model 写入 Trace，因此 Live 的
`run.provider/model` 明确标记为 `requested`，不能误读为 `observed`；RuntimeCompatibility 和
PageSchema version 则始终从目标页面快照读取。未来 A3 若接入服务端 provenance endpoint，才可升级为
`observed`。

## Report v1

机器可读报告遵循 [`eval-report.schema.json`](./eval-report.schema.json)，根字段固定为：

```text
reportVersion / run / environment / coverage / metrics / cases / resultsDigest
```

- `run` 保存 runId、生成时间、Git revision、Provider/Model 等可变元数据，并显式标记 revision
  与模型选择的来源；
- `environment` 保存 Contract/PageSchema/Eval Case 版本、完整 RuntimeCompatibility 三元组，
  以及 Prompt/Tool/Manifest 版本及来源；若 Live 在首次页面读取前即发生基础设施错误，Runtime 与
  PageSchema 版本明确记为 `null`，仍会产出 `infra_error` 报告，绝不伪造版本或丢失覆盖率；
  此时报告不能同时包含已执行的 `passed` 或 `failed` Case；
- `cases` 状态只能是 `passed`、`failed`、`unsupported`、`infra_error`、`not_selected`；
- `cases` 只保存状态、可选 mismatch 数量、执行 Profile 与安全遥测；每个 Case 都有 `telemetry`，无法
  观测的值明确写作 `null`（只有 Trace 明确记录零调用时才写 `[]`），绝不以零值冒充采集结果；**不发布**原始 actual、错误文本、
  Prompt、工具输入、工具输出或凭据。需要诊断时在受控日志/本地测试中查看，不能把敏感细节写入 Report；
- `telemetry` 只保存延迟、Token、成本、AutoFix 实际改写的 Patch operation 数（不含重试）和工具名/成功状态；
- `resultsDigest` 是 Canonical Results 的 SHA-256：排除 runId、时间、延迟、Token、成本及其他易变遥测，
  但包含 Case 的安全结果摘要、状态、Runtime 版本和 Replay 的 effective Policy Profile；Case 按唯一 ID
  归一排序，因此输入顺序不影响摘要。
- JSON Schema 同时约束运行模式与版本来源：deterministic 只能使用 `local_checkout`/`fixture`，
  Live 只能使用 `target_declaration`，并且 Runtime/PageSchema 元数据只能在 Live 的
  `infra_error` 场景一同缺失。

质量成功率只计算 `passed / (passed + failed)`；`unsupported` 和 `infra_error` 始终在
Coverage 中单独计数，因而不能通过缩小质量分母伪装为全绿。
Schema、Patch、Safety 与 Conflict 等质量指标也只读取同一组可比较 Case；基础设施故障不会被
降格为 `blocked=false`、零个 Patch 或冲突失败。

Report v1 是稳定契约：新增破坏性字段或语义时新建 `reportVersion: 2` 与对应 Schema，
不得静默改写 v1。固定 Fixture 的 Golden ExpectedOutcome 变化仍须在 PR 描述中给出 Review Reason。

内置 AntD 的 Manifest 使用独立的 `ANTD_MANIFEST_VERSION`，变更 Props 白名单或 Manifest
语义时必须递增，不能拿 ComponentPreset 版本替代。Live 的 `AGENT_EVAL_MANIFEST_VERSION` 必须是
目标部署的实际值，不能省略或从本地 Preset 推断。

确定性报告的 Prompt 与 Tool 版本分别读取生产代码旁的 `AGENT_PROMPT_VERSION` 和
`AGENT_TOOL_REGISTRY_VERSION`；修改生产 Prompt 语义，或工具名称、Schema、语义时必须递增对应版本。
Fixture 回放指令使用独立的 `FIXTURE_REPLAY_INSTRUCTION_VERSION`，不能替代生产 Prompt 版本。

`eval:live` 当前只适配此报告外壳；用例 mode 声明、100% Live 覆盖、多样本趋势和 P50/P95
仍属于 A3，不能把 `unsupported` 误报为已验证。

## 指标

| 指标                       | 含义                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Schema Valid Rate          | 实际产出 `schemaValid` 的用例中，`actual.schemaValid === true` 的比例                   |
| Expected Outcome Rate      | 实际可比较用例 expected 与 actual 一致的比例（deterministic 门禁 = 100%；空样本为 n/a） |
| Patch Minimality           | patch 用例 `normalizedOps/submittedOps` 均值（归一化去 no-op 的产出率）                 |
| Safety Block Rate          | safety 用例中 `actual.blocked === true` 的比例                                          |
| Version Conflict Integrity | conflict 用例一致的比例（CAS 拒绝过期/缺失基线）                                        |
| Replay Reproducibility     | 两次独立运行结果一致的比例（deterministic 门禁 = 100%；单次 Live 为 n/a）               |

## 新增 / 审查 / 更新 Eval Case

1. 在 `cases/` 新增 `<id>.case.json`，`caseSchemaVersion` 必须等于
   `eval-case.types.ts` 中的 `EVAL_CASE_SCHEMA_VERSION`；
2. `category` 决定执行管线：`draft`（模型输出 Schema 回放校验）、
   `patch`（AgentRunner + ToolExecution 生产编排回放）、`validation`（非法输入拦截）、
   `conflict`（Repository CAS 步骤序列）、`safety`（表达式/Schema 安全校验器）；
3. `capabilities` 必须是非空字符串数组；`expected` 必须是非空对象，runner 产出同构
   `actual` 逐键深度比较；
4. **黄金答案纪律**：修改 `expected` 必须在 PR 说明中解释原因；
   禁止为让新实现通过而静默放宽 ExpectedOutcome；
5. M1a/M1b 未实现的 State、ActionFlow、DataSource 能力不得计入 M0 成功率；
   暂不建 case，等对应 Milestone 转为正式基线。

## 基线配额（M0 = 20 例）

draft 4 / patch 6 / validation 4 / conflict 3 / safety 3；四个 draft 都是合法成功冷启动。
