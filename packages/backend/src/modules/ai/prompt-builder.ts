/**
 * AI Prompt Builder
 *
 * 构建 AI System Prompt，包含精简后 Action 类型的说明。
 * 用于指导 AI 生成符合规范的组件 Schema。
 */

/**
 * 精简后的核心 Action 类型（10 种）
 */
export const CORE_ACTION_TYPES = [
  // 数据操作
  'setValue',
  // 网络请求
  'apiCall',
  // 路由跳转
  'navigate',
  // 交互反馈
  'feedback',
  // 弹窗对话框
  'dialog',
  // 流程控制
  'if',
  'loop',
  // 工具
  'delay',
  'log',
  // 逃生舱
  'customScript',
] as const;

/**
 * 核心 Action 类型定义（精简后 10 种）
 */
const CORE_ACTIONS_DESCRIPTION = {
  // 数据操作
  setValue: {
    description: '设置字段值或状态值',
    example: `{ "type": "setValue", "field": "userName", "value": "John" }`,
  },
  // 网络请求
  apiCall: {
    description: '发起 API 请求',
    example: `{ "type": "apiCall", "url": "/api/users", "method": "GET" }`,
  },
  // 路由跳转
  navigate: {
    description: '页面跳转（相对路径或白名单域名）',
    example: `{ "type": "navigate", "to": "/dashboard" }`,
  },
  // 交互反馈
  feedback: {
    description: '显示消息提示',
    example: `{ "type": "feedback", "level": "success", "content": "操作成功" }`,
  },
  // 弹窗对话框
  dialog: {
    description: '弹出模态框或确认框',
    example: `{ "type": "dialog", "kind": "modal", "title": "提示", "content": "操作完成" }`,
  },
  // 流程控制 - 条件判断
  if: {
    description: '条件分支',
    example: `{ "type": "if", "condition": "{{formData.valid}}", "then": [...], "else": [...] }`,
  },
  // 流程控制 - 循环
  loop: {
    description: '循环遍历',
    example: `{ "type": "loop", "over": "{{items}}", "itemVar": "item", "actions": [...] }`,
  },
  // 工具 - 延迟
  delay: {
    description: '延迟执行',
    example: `{ "type": "delay", "ms": 1000 }`,
  },
  // 工具 - 日志
  log: {
    description: '控制台日志',
    example: `{ "type": "log", "value": "{{formData}}" }`,
  },
  // 逃生舱
  customScript: {
    description: '自定义脚本（高级功能）',
    example: `{ "type": "customScript", "code": "console.log('Hello')" }`,
  },
} as const;

/**
 * 构建 Action 类型的 System Prompt 片段
 */
export function buildActionsPrompt(): string {
  const actionsList = Object.entries(CORE_ACTIONS_DESCRIPTION)
    .map(([type, info]) => {
      return `### ${type}\n${info.description}\n\n示例:\n\`\`\`json\n${info.example}\n\`\`\``;
    })
    .join('\n\n');

  return `
## 可用 Action 类型

以下是核心 Action 类型，用于定义组件事件行为：

${actionsList}

### 表达式语法

在 Action 中可以使用 \`{{expression}}\` 语法引用数据：
- \`{{formData.fieldName}}\` - 表单字段值
- \`{{data.key}}\` - 数据上下文
- \`{{state.key}}\` - 组件状态

### 事件示例

\`\`\`json
{
  "events": {
    "onClick": [
      { "type": "if", "condition": "{{formData.valid}}", "then": [
        { "type": "apiCall", "url": "/api/submit", "method": "POST", "body": "{{formData}}" },
        { "type": "feedback", "kind": "message", "content": "提交成功", "level": "success" }
      ], "else": [
        { "type": "feedback", "kind": "message", "content": "请填写必填项", "level": "error" }
      ]}
    ]
  }
}
\`\`\`
`;
}

/**
 * 构建完整的 System Prompt
 */
export function buildSystemPrompt(options?: {
  includeActions?: boolean;
  includeComponents?: boolean;
  componentList?: string[];
}): string {
  const { includeActions = true, includeComponents = true, componentList = [] } = options || {};

  let prompt = `你是一个低代码平台的 UI 生成助手。
你的任务是根据用户需求生成符合 A2UI 协议的组件 Schema。

## Schema 结构

Schema 是一个扁平的组件映射表：
\`\`\`typescript
{
  rootId: string;           // 根组件 ID
  version: number;          // Schema 版本
  components: {
    [id: string]: {
      id: string;           // 组件 ID，且必须与 components 的 key 一致
      type: string;         // 组件类型
      props: object;        // 组件属性
      childrenIds?: string[]; // 子组件 ID 列表
      events?: object;      // 事件处理
    }
  }
}
\`\`\`

`;

  if (includeActions) {
    prompt += buildActionsPrompt() + '\n\n';
  }

  if (includeComponents && componentList.length > 0) {
    prompt += `
## 可用组件类型

${componentList.map((c) => `- ${c}`).join('\n')}

请只使用以上列出的组件类型。
`;
  }

  prompt += `
## 输出要求

1. 只输出有效的 JSON 格式
2. 不要包含 Markdown 代码块标记
3. 不要添加解释说明
4. version 必须是 number，不能输出字符串
5. 每个组件对象都必须包含 id，且 id 必须与 components 的 key 完全一致
6. 确保所有组件 ID 唯一
7. 确保 childrenIds 引用的组件存在
8. Text / Title / Paragraph / Button 的文本内容优先放在 props.children，不要使用 props.content
9. feedback 动作必须使用 content / level / kind 字段，不要使用 message / type_ / messageType
`;

  return prompt;
}

/**
 * 获取核心 Action 类型列表
 */
export function getCoreActionTypes(): readonly string[] {
  return CORE_ACTION_TYPES;
}

/**
 * 检查 Action 类型是否为核心类型
 */
export function isCoreActionType(type: string): boolean {
  return CORE_ACTION_TYPES.includes(type as any);
}
