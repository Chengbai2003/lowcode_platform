/**
 * Agent prompt builders — pure functions for system/prompt generation.
 *
 * Extracted from agent-runner.service.ts to keep the runner as thin facade.
 */

import { getCoreActionTypes } from '../ai/prompt-builder';
import {
  buildCompactContextSections,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_INSTRUCTION_PROMPT_CHARS,
  sanitizePromptText,
} from './agent-prompt.utils';
import type { AgentConversationContext } from './agent-session-memory.service';
import type { AgentCollectionScope, AgentRouteDecision } from './types/agent-edit.types';
import type { FocusContextResult } from '../schema-context';
import type { AgentEditRequestDto } from './dto/agent-edit-request.dto';

/** Increment whenever production Agent prompt semantics change. */
export const AGENT_PROMPT_VERSION = 'agent-prompt-v1';

export function buildSystemPrompt(componentList: readonly string[]): string {
  const allowedActionTypes = getCoreActionTypes().filter((type) => type !== 'customScript');
  return [
    '你是一个受限的低代码页面编辑 Agent。',
    '你只能通过工具读取页面信息并生成最小 patch；不要输出整页 schema，不要编造不存在的组件 ID。',
    '优先做局部修改，尽量复用已有组件和结构。',
    '禁止生成 customScript。',
    `可用组件类型: ${componentList.join(', ') || '未知'}`,
    `允许的事件 Action 类型: ${allowedActionTypes.join(', ')}`,
    "feedback 动作必须使用 content/level 字段，例如 { type: 'feedback', kind: 'message', content: '操作成功', level: 'success' }；不要使用 message/type_/messageType。",
    'Button 的红色/危险样式请设置 props.danger=true；不要把 Button.props.type 写成 danger，type 仅用于 default/primary/dashed/link/text。',
    '如需修改页面逻辑（State 或 Computed），必须先用 get_page_schema 读取当前 schema.logic，再调用 replace_page_logic 提交完整 logic 对象，保留未要求修改的声明。',
    '如果你已经完成修改，就停止继续调用工具。',
  ].join('\n');
}

export function buildPrompt(
  dto: AgentEditRequestDto,
  focusContextResult: FocusContextResult,
  resolvedSelectedId?: string,
  conversationContext?: AgentConversationContext,
): string {
  const chunks = buildCompactContextSections(focusContextResult);
  if (resolvedSelectedId) chunks.push(`默认编辑目标组件: ${resolvedSelectedId}`);
  if (conversationContext?.summary) chunks.push(`会话摘要:\n${conversationContext.summary}`);
  const conversationHistory = (dto.conversationHistory || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-4)
    .map((m) => `${m.role}: ${sanitizePromptText(m.content, MAX_HISTORY_MESSAGE_CHARS)}`);
  if (conversationHistory.length > 0) chunks.push(`最近对话:\n${conversationHistory.join('\n')}`);
  chunks.push(`用户指令: ${sanitizePromptText(dto.instruction, MAX_INSTRUCTION_PROMPT_CHARS)}`);
  chunks.push(
    [
      '建议策略:',
      '1. 简单文案或属性修改优先调用 update_component_props。',
      '2. 绑定事件使用 bind_event，并只替换目标 trigger 的 action 列表。',
      '3. 新增组件使用 insert_component，组件需带 id/type。',
      '4. 删除或移动前确认目标组件明确。',
      '5. 修改页面逻辑（State 或 Computed）必须先调用 get_page_schema 读取当前值，再用 replace_page_logic 提交完整 logic，保留未要求修改的声明。',
    ].join('\n'),
  );
  return chunks.join('\n\n');
}

export function buildBatchScopeSystemPrompt(
  componentList: readonly string[],
  rootId: string,
): string {
  return [
    '你正在执行批量修改的范围规划阶段。',
    '本阶段不能生成 patch，也不能调用任何写工具。',
    `当前选中的容器 rootId=${rootId}。`,
    '如果用户要做集合修改，你必须调用 resolve_collection_scope。',
    '调用 resolve_collection_scope 时，rootId 必须等于当前选中的容器 ID。',
    `可用组件类型: ${componentList.join(', ') || '未知'}`,
    '当 resolve_collection_scope 返回 matched 后即可停止。',
  ].join('\n');
}

export function buildBatchScopePrompt(
  dto: AgentEditRequestDto,
  focusContextResult: FocusContextResult,
  resolvedSelectedId: string,
  conversationContext?: AgentConversationContext,
): string {
  const chunks = buildCompactContextSections(focusContextResult);
  chunks.push(`当前已选中的容器: ${resolvedSelectedId}`);
  chunks.push('当前是批量修改第一阶段，请只规划范围，不要生成 patch。');
  if (conversationContext?.summary) chunks.push(`会话摘要:\n${conversationContext.summary}`);
  chunks.push(`用户指令: ${sanitizePromptText(dto.instruction, MAX_INSTRUCTION_PROMPT_CHARS)}`);
  chunks.push('你必须先调用 resolve_collection_scope(rootId=当前容器ID)。');
  return chunks.join('\n\n');
}

export function buildBatchPatchSystemPrompt(
  componentList: readonly string[],
  scope: AgentCollectionScope,
): string {
  return [
    '你正在执行批量修改的 patch 生成阶段。',
    '范围已经由用户确认，不能自行扩展目标集合。',
    `已确认 rootId=${scope.rootId}。`,
    `已确认目标类型=${scope.matchedType} (${scope.matchedDisplayName})。`,
    `已确认目标数量=${scope.targetCount}。`,
    `可用组件类型: ${componentList.join(', ') || '未知'}`,
    '你只能对已确认 targetIds 做统一 props 更新。',
    '禁止插入、删除、移动组件，禁止绑定事件。',
    '优先使用 update_components_props 一次完成批量更新。',
  ].join('\n');
}

export function buildBatchPatchPrompt(
  dto: AgentEditRequestDto,
  focusContextResult: FocusContextResult,
  scope: AgentCollectionScope,
  conversationContext?: AgentConversationContext,
): string {
  const chunks = buildCompactContextSections(focusContextResult);
  if (conversationContext?.summary) chunks.push(`会话摘要:\n${conversationContext.summary}`);
  chunks.push(`用户指令: ${sanitizePromptText(dto.instruction, MAX_INSTRUCTION_PROMPT_CHARS)}`);
  chunks.push(`已确认 rootId: ${scope.rootId}`);
  chunks.push(`已确认目标类型: ${scope.matchedDisplayName} (${scope.matchedType})`);
  chunks.push(`已确认 targetIds: ${scope.targetIds.join(', ')}`);
  chunks.push('只能修改这些 targetIds，且只能生成统一 props 更新。');
  return chunks.join('\n\n');
}
