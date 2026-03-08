/**
 * AI Prompt Builder
 *
 * 构建 AI System Prompt，包含核心 Action 类型的说明。
 * 用于指导 AI 生成符合规范的组件 Schema。
 */

import { CORE_ACTION_TYPES } from '@lowcode-platform/frontend/types';

/**
 * 核心 Action 类型定义
 */
const CORE_ACTIONS_DESCRIPTION = {
  // 数据操作
  setField: {
    description: "设置字段值，支持路径如 'user.name'",
    example: `{ "type": "setField", "field": "userName", "value": "John" }`,
  },
  mergeField: {
    description: '合并对象到字段',
    example: `{ "type": "mergeField", "field": "user", "value": { "name": "John" } }`,
  },

  // UI 交互
  message: {
    description: '显示消息提示',
    example: `{ "type": "message", "content": "操作成功", "messageType": "success" }`,
  },
  modal: {
    description: '弹出模态框',
    example: `{ "type": "modal", "title": "提示", "content": "确定要删除吗？" }`,
  },
  confirm: {
    description: '确认对话框',
    example: `{ "type": "confirm", "title": "确认", "content": "确定继续吗？" }`,
  },

  // 导航
  navigate: {
    description: '页面跳转',
    example: `{ "type": "navigate", "to": "/dashboard" }`,
  },

  // 状态管理
  setState: {
    description: '设置组件状态',
    example: `{ "type": "setState", "state": { "loading": false } }`,
  },

  // 异步操作
  apiCall: {
    description: '发起 API 请求',
    example: `{ "type": "apiCall", "url": "/api/users", "method": "GET" }`,
  },
  delay: {
    description: '延迟执行',
    example: `{ "type": "delay", "ms": 1000 }`,
  },

  // 流程控制
  if: {
    description: '条件判断',
    example: `{ "type": "if", "condition": "{{formData.valid}}", "then": [...], "else": [...] }`,
  },
  tryCatch: {
    description: '异常捕获',
    example: `{ "type": "tryCatch", "try": [...], "catch": [...] }`,
  },

  // 调试
  log: {
    description: '控制台日志',
    example: `{ "type": "log", "value": "{{formData}}" }`,
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
        { "type": "message", "content": "提交成功", "messageType": "success" }
      ], "else": [
        { "type": "message", "content": "请填写必填项", "messageType": "error" }
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
  version: string;          // Schema 版本
  components: {
    [id: string]: {
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
4. 确保所有组件 ID 唯一
5. 确保 childrenIds 引用的组件存在
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
