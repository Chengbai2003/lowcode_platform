# Architecture Decision Records

ADR 记录已经接受的重要架构决策、备选方案和长期后果。状态使用 `Proposed`、`Accepted`、`Deprecated` 或 `Superseded by ADR-xxxx`。

## 当前决策

| ADR                                                    | 状态     | 决策                                                       |
| ------------------------------------------------------ | -------- | ---------------------------------------------------------- |
| [ADR-0001](0001-separate-schema-and-page-version.md)   | Accepted | 分离 Schema 协议版本与页面内容版本                         |
| [ADR-0002](0002-single-component-preset-per-system.md) | Accepted | 一个系统只能绑定一个 ComponentPreset                       |
| [ADR-0003](0003-isolated-renderer-runtime-session.md)  | Accepted | Renderer 全局复用代码，页面隔离 RuntimeSession             |
| [ADR-0004](0004-disable-arbitrary-script-execution.md) | Accepted | 永久禁止任意脚本执行                                       |
| [ADR-0005](0005-operation-ref-data-source.md)          | Accepted | DataSource 使用 OperationRef，不在 Schema 保存基础设施秘密 |

## 新增 ADR

新增决策时使用下一个连续编号，至少包含：

- 背景与需要解决的问题
- 最终决策
- 被拒绝的备选方案及原因
- 对代码、兼容性、运维与安全的后果

已接受 ADR 不应被静默改写结论。决策变化时新增 ADR，并在旧文档中记录替代关系。
