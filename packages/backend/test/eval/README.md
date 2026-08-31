# Agent Eval（Issue #18 / M0-3）

两条隔离的评测通道：

```text
eval:deterministic → CI blocking（无网络、无模型凭据）
eval:live          → 手动/定时趋势观测（需要真实模型凭据与运行中的后端）
```

## 运行

```bash
pnpm eval:deterministic   # jest --config ./test/eval/jest.eval.config.js（CI 阻断）
pnpm eval:live            # 需 AGENT_EVAL_BASE_URL + AGENT_EVAL_TOKEN；不进 CI
```

- `eval:deterministic`：这是 **Deterministic Patch Apply Eval**，不是完整生产 Agent
  编排回放。模型输出以 Fixture 回放，复用 Contract、Patch 归一化/风险评估、
  `AgentPolicyService`、`PatchAutoFixService`、`PatchValidationService`、安全校验器和
  Repository CAS；同一代码跑两遍逐键比对（Replay Reproducibility）。
  它尚未调用 AgentRunner 私有的模型/ToolExecutionService 编排入口。
  报告写入 `.codex/artifacts/agent-eval/deterministic.{json,md}`。
- `eval:live`：先创建真实页面，再对运行中的后端 `POST /agent/edit` 发送用例 intent；
  Draft/Patch 记录真实首轮完成，Validation/Safety/Conflict 以生产边界的预期拒绝为成功。
  当前 API 无法表达的表达式与录制 Patch 注入场景会标记 `skipped` 并排除成功率分母。
  报告记录路由、Trace tool calls、repair、usage/cost（服务端可用时）及版本标签，写入
  `.codex/artifacts/agent-eval/live/`。

## 指标

| 指标                       | 含义                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| Schema Valid Rate          | 实际产出 `schemaValid` 的用例中，`actual.schemaValid === true` 的比例   |
| Expected Outcome Rate      | 全部用例 expected 与 actual 一致的比例（门禁 = 100%）                   |
| Patch Minimality           | patch 用例 `normalizedOps/submittedOps` 均值（归一化去 no-op 的产出率） |
| Safety Block Rate          | safety 用例中 `actual.blocked === true` 的比例                          |
| Version Conflict Integrity | conflict 用例一致的比例（CAS 拒绝过期/缺失基线）                        |
| Replay Reproducibility     | 两次独立运行结果一致的比例（门禁 = 100%）                               |

## 新增 / 审查 / 更新 Eval Case

1. 在 `cases/` 新增 `<id>.case.json`，`caseSchemaVersion` 必须等于
   `eval-case.types.ts` 中的 `EVAL_CASE_SCHEMA_VERSION`；
2. `category` 决定执行管线：`draft`（模型输出 Schema 回放校验）、
   `patch`（归一化 + 风险评估）、`validation`（非法输入拦截）、
   `conflict`（Repository CAS 步骤序列）、`safety`（表达式/Schema 安全校验器）；
3. `capabilities` 必须是非空字符串数组；`expected` 必须是非空对象，runner 产出同构
   `actual` 逐键深度比较；
4. **黄金答案纪律**：修改 `expected` 必须在 PR 说明中解释原因；
   禁止为让新实现通过而静默放宽 ExpectedOutcome；
5. M1a/M1b 未实现的 State、ActionFlow、DataSource 能力不得计入 M0 成功率；
   暂不建 case，等对应 Milestone 转为正式基线。

## 基线配额（M0 = 20 例）

draft 4 / patch 6 / validation 4 / conflict 3 / safety 3；四个 draft 都是合法成功冷启动。
