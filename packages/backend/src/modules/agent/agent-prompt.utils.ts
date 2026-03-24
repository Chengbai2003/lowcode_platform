import { FocusContext, FocusContextResult, NodeCandidate } from '../schema-context';

export const MAX_INSTRUCTION_PROMPT_CHARS = 2000;
export const MAX_HISTORY_MESSAGE_CHARS = 4000;
export const MAX_SUBTREE_PROMPT_CHARS = 2500;
export const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizePromptText(input: string, maxChars: number): string {
  const normalized = input.replace(CONTROL_CHARS_REGEX, ' ').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}...(truncated)`;
}

export function formatJsonBlock(value: unknown, maxChars: number): string {
  const json = JSON.stringify(value, null, 2);
  if (json.length <= maxChars) {
    return json;
  }

  const remainingChars = json.length - maxChars;
  return `${json.slice(0, maxChars)}\n... [truncated ${remainingChars} chars]`;
}

export function formatPageOverview(contextResult: FocusContextResult): string {
  const { schema } = contextResult;
  const rootNode = schema.components[schema.rootId];
  const totalComponents =
    contextResult.mode === 'focused' && contextResult.context
      ? contextResult.context.schemaStats.totalComponents
      : Object.keys(schema.components).length;

  const rootChildren = (rootNode?.childrenIds ?? [])
    .slice(0, 8)
    .map((id) => `${id}(${schema.components[id]?.type ?? 'unknown'})`);

  const lines = ['## 页面概览'];
  lines.push(`- rootId: ${schema.rootId}`);

  if (schema.version !== undefined) {
    lines.push(`- version: ${schema.version}`);
  }

  lines.push(`- 总组件数: ${totalComponents}`);

  if (rootChildren.length > 0) {
    const totalRootChildren = rootNode?.childrenIds?.length ?? 0;
    const suffix = totalRootChildren > rootChildren.length ? ` 等 ${totalRootChildren} 个` : '';
    lines.push(`- 根节点子组件: ${rootChildren.join(', ')}${suffix}`);
  }

  return lines.join('\n');
}

export function formatFocusContext(ctx: FocusContext): string {
  const lines: string[] = ['## 当前焦点组件'];
  lines.push(`- ID: ${ctx.focusNode.id}`);
  lines.push(`- 类型: ${ctx.focusNode.type}`);

  if (ctx.focusNode.props && Object.keys(ctx.focusNode.props).length > 0) {
    lines.push(`- 属性: ${JSON.stringify(ctx.focusNode.props)}`);
  }

  if (ctx.parent) {
    lines.push(`- 父组件: ${ctx.parent.id} (${ctx.parent.type})`);
  }

  if (ctx.ancestors.length > 0) {
    lines.push(`- 祖先链: ${ctx.ancestors.map((a) => `${a.id}(${a.type})`).join(' → ')}`);
  }

  if (ctx.siblings.length > 0) {
    lines.push(`- 兄弟组件: ${ctx.siblings.map((s) => `${s.id}(${s.type})`).join(', ')}`);
  }

  if (ctx.children.length > 0) {
    lines.push(`- 子组件: ${ctx.children.map((c) => `${c.id}(${c.type})`).join(', ')}`);
  } else {
    lines.push('- 子组件: 无');
  }

  if (Object.keys(ctx.subtree).length > 0) {
    lines.push('');
    lines.push('### 焦点子树:');
    lines.push(formatJsonBlock(ctx.subtree, MAX_SUBTREE_PROMPT_CHARS));
  }

  return lines.join('\n');
}

export function formatCandidates(candidates: readonly NodeCandidate[]): string {
  const lines: string[] = ['## 可能的目标组件候选'];
  for (const candidate of candidates.slice(0, 3)) {
    lines.push(
      `- ${candidate.id} (${candidate.type}) [score=${candidate.score}]: ${candidate.reason}`,
    );
  }
  return lines.join('\n');
}

export function buildCompactContextSections(contextResult?: FocusContextResult): string[] {
  if (!contextResult) {
    return [];
  }

  const chunks = [formatPageOverview(contextResult)];
  if (contextResult.mode === 'focused' && contextResult.context) {
    chunks.push(formatFocusContext(contextResult.context));
  } else if (contextResult.mode === 'candidates' && contextResult.candidates?.length) {
    chunks.push(formatCandidates(contextResult.candidates));
  }

  return chunks;
}
