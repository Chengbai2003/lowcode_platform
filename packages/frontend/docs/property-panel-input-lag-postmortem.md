# 属性面板输入延迟与丢字问题复盘

本文档记录属性面板中字符串输入类属性在快速输入时出现的延迟回显和丢字问题，方便后续逐步理解编辑器状态流、历史记录系统，以及类似交互问题的排查方式。

## 1. 问题现象

在属性面板中编辑 `defaultValue`、`placeholder` 等字符串属性时，如果连续快速输入，例如在很短时间内按下 `123456`：

- 输入框不会立即回显
- 大约 `500ms` 后才出现内容
- 最终往往只显示最后一次输入结果，例如只剩 `6`

这类表现容易让人误以为是：

- 输入框组件性能差
- React 重渲染过多
- 浏览器或输入法卡顿

但本问题的根因并不在输入框本身，而在 schema 更新与历史记录合并的耦合方式。

## 2. 相关代码位置

- `packages/frontend/src/editor/components/PropertyPanel/editors/StringEditor.tsx`
- `packages/frontend/src/editor/components/PropertyPanel/PropertyPanel.tsx`
- `packages/frontend/src/editor/LowcodeEditor.tsx`
- `packages/frontend/src/editor/hooks/useSchemaHistoryStore.ts`
- `packages/frontend/src/editor/commands/schemaCommands.ts`

## 3. 问题链路

### 3.1 输入框是受控组件

`StringEditor` 使用的是标准受控输入：

- `value={stringValue}`
- `onChange={handleChange}`

这意味着输入框显示什么，完全取决于外部传进来的 `value`。如果外部状态没有及时更新，输入框就不会稳定显示用户刚输入的内容。

### 3.2 属性面板在每次输入时都会生成新 schema

`PropertyPanel` 中的 `handlePropertyChange` 会在每次按键后：

- 读取当前组件 props
- 生成新的 `nextProps`
- 构造新的 `newSchema`
- 调用 `onSchemaChange(newSchema)`

这一层本身没有做节流，也没有缓存输入值。

### 3.3 编辑器把属性变更交给历史记录系统处理

在 `LowcodeEditor` 中：

- `handleSchemaChange(newSchema)` 会调用 `updateSchema(newSchema, '更新 Schema')`
- `useSchemaHistoryStore` 配置了：
  - `enableMerge: true`
  - `mergeWindow: 500`

设计意图是把连续编辑合并为一个撤销步骤，避免用户输入一个单词就要撤销很多次。

### 3.4 真正的坑点：合并历史时，连实时状态更新也一起延迟了

`useSchemaHistoryStore.updateSchema()` 当前实现里：

- 不会立刻执行 `onChange(newSchema)`
- 而是先创建一个 `UpdateSchemaCommand`
- 把命令暂存到 `pendingCommandRef`
- 启动一个 `500ms` 的定时器
- 只有定时器到期时，才执行 `executeCommand(pendingCommandRef.current)`

而 `UpdateSchemaCommand.execute()` 内部才会真正调用：

```ts
this.onChange(this.newSchema);
```

也就是说：

- 历史记录没有立刻入栈
- schema 也没有立刻更新
- 受控输入框始终拿到旧值

## 4. 为什么最后只剩一个字符

以快速输入 `123456` 为例：

1. 输入 `1`，创建一个待执行命令，启动 `500ms` 定时器
2. 输入 `2`，旧定时器被清掉，命令被替换成“最终值是 2”
3. 输入 `3`、`4`、`5`、`6`，重复同样过程
4. 在持续输入期间，schema 没有被真正应用
5. 停止输入超过 `500ms` 后，只执行最后一个待命令

于是界面上会表现为：

- 前面输入没有稳定显示
- 停顿后一次性刷新
- 最终只保留最后一次输入结果

严格说，这不是“输入事件丢了”，而是“受控值始终没有及时跟上用户输入，最后只提交了最后一份暂存状态”。

## 5. 根因总结

根因可以概括为一句话：

> 把“实时 UI 状态更新”和“撤销历史合并”错误地绑定成了同一个延迟动作。

更具体地说：

- 属性面板输入框依赖 schema 实时回显
- 历史系统本来只应合并 undo/redo 记录
- 但当前实现把 schema 应用本身也延迟到了合并窗口结束之后

这会直接破坏所有依赖“即时受控值”的交互场景，属性面板只是最明显的受害者。

## 6. 这个设计为什么容易写成这样

这类问题在编辑器项目里很常见，原因是“状态变更”和“历史记录”天然很像一件事：

- 用户改了 schema
- 系统要更新画布
- 系统也要记录撤销历史

如果实现时把“更新 schema”完全包进命令执行里，就很容易顺手把“何时更新 UI”和“何时入历史栈”做成同一个时机。

从历史系统角度看，这样写很顺：

- 只要命令执行，就同时完成状态更新和入栈

但从输入交互角度看，这会带来一个隐患：

- 任何需要即时回显的受控 UI，都不能等历史系统的合并窗口结束后才更新

## 7. 推荐修复策略

推荐把“实时状态更新”和“历史合并”拆开处理。

### 策略 A：实时更新 schema，延迟写入历史栈

这是最推荐的方案。

思路是：

- 用户每次输入时，立刻调用 `onChange(newSchema)`，让编辑器实时更新 schema
- 同时把这次变化记为“候选历史记录”
- 在 `500ms` 窗口结束后，再把最终变化合并写入 undo 栈

这样可以同时满足：

- 输入框即时回显
- 预览区即时同步
- 撤销历史仍然按一段连续输入合并

### 策略 B：属性面板局部维护输入草稿

备选方案是在 `StringEditor` 或 `PropertyPanel` 里维护本地 draft：

- 输入时先更新本地状态
- 延迟同步到 schema

这个方案能缓解当前现象，但不推荐作为首选，因为：

- 会把“编辑器真实状态”和“面板暂存状态”拆成两份
- 需要处理选中切换、外部 schema 更新、撤销重做同步
- 复杂属性编辑器会更难维护

它更像是绕过问题，而不是修复问题根源。

### 策略 C：对不同来源的 schema 更新采用不同策略

如果项目后续会有更多类型的编辑操作，可以进一步分层：

- 输入框拖拽类操作：实时更新 + 合并历史
- JSON 保存、模板应用、AI 回写：立即提交历史
- 批量结构变更：单独命令直接入栈

这个方案适合编辑器逐步成熟后再演进。

## 8. 修复时要注意的点

如果后续正式修这个问题，建议重点关注以下几点：

- `undo` 应该回到本次连续输入开始前的 schema，而不是中间每个字符
- `redo` 应该恢复连续输入结束后的最终 schema
- 组件树、预览区、属性面板都应基于同一份实时 schema
- 当用户在合并窗口内切换选中组件时，待合并历史不能错绑到其他组件
- `forceUpdateSchema()` 这类“立即提交”入口仍应保留，用于保存、模板应用、AI 更新等场景

## 9. 排查这类问题的经验

后续遇到类似“输入卡顿”“回显延迟”“最后一位生效”的问题，可以优先按下面顺序排查：

1. 先确认输入框是不是受控组件
2. 再确认 `value` 来自哪里，是本地 state、全局 store 还是 schema
3. 顺着 `onChange` 往上找，看中间有没有：
   - debounce
   - throttle
   - merge window
   - command queue
   - async setState
4. 分清楚“UI 状态更新时机”和“持久化/历史记录时机”是否被耦合

这次问题的关键突破点，就是识别出：

- 看起来像输入框卡
- 实际上是上游 schema 更新被延迟

## 10. 当前结论

当前属性面板输入延迟与丢字问题的本质不是渲染性能问题，而是状态流设计问题：

- 受控输入要求实时更新 value
- 当前实现却把 schema 更新延迟到了历史合并窗口结束后

因此，真正的修复方向应放在编辑器状态管理与历史系统边界，而不是只在输入框层面打补丁。
