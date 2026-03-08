import type { AISession, AISessionMessage } from '../../../../types';

/**
 * Mock 会话数据 - 仅用于开发/测试环境
 * 生产环境应使用真实数据
 */

// 生成唯一的消息 ID
const msgId = (prefix: string, index: number) => `${prefix}-${index}`;

// 创建基础会话结构
const createMockSession = (
  id: string,
  title: string,
  hoursAgo: number,
  messages: AISessionMessage[],
): AISession => ({
  id,
  title,
  createdAt: Date.now() - 1000 * 60 * 60 * hoursAgo,
  updatedAt: Date.now() - 1000 * 60 * 60 * (hoursAgo - 0.5),
  messageCount: messages.length,
  lastMessageContent: messages[messages.length - 1]?.content.slice(0, 50) || '',
  lastMessageTimestamp: messages[messages.length - 1]?.timestamp || Date.now(),
  messages,
});

// 创建用户消息
const createUserMessage = (id: string, content: string, hoursAgo: number): AISessionMessage => ({
  id,
  role: 'user',
  content,
  timestamp: Date.now() - 1000 * 60 * 60 * hoursAgo,
  context: { selectedComponentIds: [] },
});

// 创建 AI 消息
const createAIMessage = (
  id: string,
  content: string,
  hoursAgo: number,
  hasAction?: boolean,
): AISessionMessage => ({
  id,
  role: 'assistant',
  content,
  timestamp: Date.now() - 1000 * 60 * 60 * hoursAgo,
  actionResult: hasAction
    ? {
        type: 'component_update',
        props: { rootId: 'root', components: {} },
      }
    : undefined,
});

// Mock 会话数据
export const mockSessions: AISession[] = [
  createMockSession('session-001', '优化登录页面设计', 0.5, [
    createUserMessage(
      msgId('msg', 1),
      '帮我设计一个现代化的登录页面，包含用户名、密码和登录按钮',
      0.5,
    ),
    createAIMessage(
      msgId('msg', 2),
      `好的！我来为你设计一个现代化的登录页面。

\`\`\`json
{
  "rootId": "root",
  "components": {
    "root": { "id": "root", "type": "Page", "props": {}, "childrenIds": ["card"] },
    "card": { "id": "card", "type": "Container", "props": { "style": { "padding": "32px" } }, "childrenIds": [] }
  }
}
\`\`\``,
      0.4,
      true,
    ),
    createUserMessage(msgId('msg', 3), '继续添加输入框和按钮', 0.35),
    createAIMessage(msgId('msg', 4), '好的，已添加输入框和按钮。', 0.3, true),
  ]),
  createMockSession('session-002', '创建数据仪表盘', 2, [
    createUserMessage(msgId('msg2', 1), '帮我创建一个数据仪表盘', 2),
    createAIMessage(msgId('msg2', 2), '我来创建数据仪表盘，需要哪些统计指标？', 1.9),
    createUserMessage(msgId('msg2', 3), '用户总数、今日访问量、订单数量', 1.8),
    createAIMessage(msgId('msg2', 4), '已添加统计卡片。', 1.7, true),
  ]),
  createMockSession('session-003', '商品详情页设计', 24, [
    createUserMessage(msgId('msg3', 1), '设计一个电商商品详情页', 24),
    createAIMessage(msgId('msg3', 2), '我来设计商品详情页，包括图片轮播、规格选择等模块。', 23.5),
  ]),
  createMockSession('session-004', '导航栏组件优化', 48, [
    createUserMessage(msgId('msg4', 1), '优化顶部导航栏', 48),
    createAIMessage(msgId('msg4', 2), '已优化导航栏，添加了用户菜单和通知。', 47, true),
  ]),
  createMockSession('session-005', '表单页面生成', 72, [
    createUserMessage(msgId('msg5', 1), '创建用户注册表单', 72),
    createAIMessage(msgId('msg5', 2), '已创建注册表单，包含姓名、邮箱、密码字段。', 71, true),
  ]),
];
