import { EditorPatchOperation } from '../agent-tools/types/editor-patch.types';
import { A2UISchema } from '../schema-context/types/schema.types';
import {
  AgentPatchChangeEntry,
  AgentPatchChangeGroup,
  AgentPatchChangeKind,
  AgentPatchRiskAssessment,
} from './types/agent-edit.types';

const CHANGE_GROUP_LABELS: Record<AgentPatchChangeKind, string> = {
  content: '文案',
  props: '属性',
  event: '事件',
  structure: '结构',
};

export function buildPatchPresentation(
  baseSchema: A2UISchema,
  previewSchema: A2UISchema,
  patch: readonly EditorPatchOperation[],
): {
  changeGroups: AgentPatchChangeGroup[];
  previewSummary: string;
  risk: AgentPatchRiskAssessment;
} {
  const groupedEntries = new Map<AgentPatchChangeKind, AgentPatchChangeEntry[]>();

  for (const operation of patch) {
    const kind = classifyPatchOperation(operation);
    const bucket = groupedEntries.get(kind) ?? [];
    bucket.push(buildPatchChangeEntry(operation, baseSchema, previewSchema));
    groupedEntries.set(kind, bucket);
  }

  const changeGroups = Array.from(groupedEntries.entries()).map(([kind, entries]) => ({
    kind,
    label: CHANGE_GROUP_LABELS[kind],
    count: entries.length,
    entries,
  }));

  const risk = assessPatchRisk(baseSchema, patch);
  const previewSummary = buildPatchPreviewSummary(patch, changeGroups);

  return {
    changeGroups,
    previewSummary,
    risk,
  };
}

export function assessPatchRisk(
  baseSchema: A2UISchema,
  patch: readonly EditorPatchOperation[],
): AgentPatchRiskAssessment {
  const patchOps = patch.length;
  const distinctTargets = countDistinctTargets(patch);
  const removeOperations = patch.filter(
    (operation): operation is Extract<EditorPatchOperation, { op: 'removeComponent' }> =>
      operation.op === 'removeComponent',
  );
  const moveOperations = patch.filter((operation) => operation.op === 'moveComponent');
  const removeSubtreeSizes = removeOperations.map((operation) =>
    countSubtreeNodes(baseSchema, operation.componentId),
  );
  const maxRemovedSubtreeSize = removeSubtreeSizes.length > 0 ? Math.max(...removeSubtreeSizes) : 0;
  const reasons: string[] = [];

  let level: AgentPatchRiskAssessment['level'] = 'low';

  if (removeOperations.length >= 2) {
    level = 'high';
    reasons.push('包含批量删除操作');
  }

  if (maxRemovedSubtreeSize > 1) {
    level = 'high';
    reasons.push('删除了包含子树的组件');
  }

  if (moveOperations.length >= 2) {
    level = 'high';
    reasons.push('包含多组件移动');
  }

  if (patchOps >= 5 || distinctTargets >= 4) {
    level = 'high';
    reasons.push('修改范围较大');
  }

  if (level !== 'high') {
    if (removeOperations.length === 1) {
      level = 'medium';
      reasons.push('包含删除操作');
    }

    if (moveOperations.length === 1) {
      level = 'medium';
      reasons.push('包含结构移动');
    }

    if (patchOps >= 3 || distinctTargets >= 3) {
      level = 'medium';
      reasons.push('涉及多个 patch 或目标组件');
    }
  }

  if (reasons.length === 0) {
    reasons.push('局部低范围修改');
  }

  return {
    level,
    reasons,
    patchOps,
    distinctTargets,
    requiresConfirmation: level === 'high',
  };
}

function classifyPatchOperation(operation: EditorPatchOperation): AgentPatchChangeKind {
  if (operation.op === 'bindEvent') {
    return 'event';
  }

  if (
    operation.op === 'insertComponent' ||
    operation.op === 'removeComponent' ||
    operation.op === 'moveComponent'
  ) {
    return 'structure';
  }

  if (operation.op === 'updateProps' && isContentLikeProps(operation.props)) {
    return 'content';
  }

  return 'props';
}

function buildPatchChangeEntry(
  operation: EditorPatchOperation,
  baseSchema: A2UISchema,
  previewSchema: A2UISchema,
): AgentPatchChangeEntry {
  switch (operation.op) {
    case 'insertComponent': {
      const componentId =
        typeof operation.component.id === 'string' ? operation.component.id : 'unknown-component';
      const componentType =
        typeof operation.component.type === 'string' ? operation.component.type : 'Unknown';
      return {
        op: operation.op,
        targetId: componentId,
        summary: `在 ${operation.parentId} 下插入 ${componentType}(${componentId})`,
      };
    }
    case 'updateProps': {
      const targetId = operation.componentId;
      const isContentUpdate = isContentLikeProps(operation.props);
      const propKeys = Object.keys(operation.props);
      const label = isContentUpdate ? '更新文案' : `更新属性 ${propKeys.join(', ')}`;
      const nextNode = previewSchema.components[targetId];
      const nextText =
        typeof nextNode?.props?.children === 'string'
          ? ` -> ${String(nextNode.props.children)}`
          : '';
      return {
        op: operation.op,
        targetId,
        summary: `${label} ${targetId}${isContentUpdate ? nextText : ''}`,
      };
    }
    case 'bindEvent':
      return {
        op: operation.op,
        targetId: operation.componentId,
        summary: `绑定 ${operation.componentId} 的 ${operation.event} 事件 (${operation.actions.length} 个动作)`,
      };
    case 'removeComponent': {
      const subtreeSize = countSubtreeNodes(baseSchema, operation.componentId);
      const suffix = subtreeSize > 1 ? `，同时删除 ${subtreeSize - 1} 个子节点` : '';
      return {
        op: operation.op,
        targetId: operation.componentId,
        summary: `删除组件 ${operation.componentId}${suffix}`,
      };
    }
    case 'moveComponent':
      return {
        op: operation.op,
        targetId: operation.componentId,
        summary: `移动 ${operation.componentId} 到 ${operation.newParentId} 的位置 ${operation.newIndex}`,
      };
  }
}

function buildPatchPreviewSummary(
  patch: readonly EditorPatchOperation[],
  changeGroups: readonly AgentPatchChangeGroup[],
): string {
  const groupSummary = changeGroups.map((group) => `${group.label}${group.count}处`).join('，');
  return patch.length > 0
    ? `本次修改共 ${patch.length} 个 patch，涉及 ${groupSummary}。`
    : '本次修改未产生可预览的 patch。';
}

function isContentLikeProps(props: Record<string, unknown>): boolean {
  const keys = Object.keys(props);
  return (
    keys.length > 0 && keys.every((key) => key === 'children' || key === 'text' || key === 'title')
  );
}

function countDistinctTargets(patch: readonly EditorPatchOperation[]): number {
  const targets = new Set<string>();

  for (const operation of patch) {
    switch (operation.op) {
      case 'insertComponent':
        targets.add(operation.parentId);
        if (typeof operation.component.id === 'string') {
          targets.add(operation.component.id);
        }
        break;
      case 'updateProps':
      case 'bindEvent':
      case 'removeComponent':
        targets.add(operation.componentId);
        break;
      case 'moveComponent':
        targets.add(operation.componentId);
        targets.add(operation.newParentId);
        break;
    }
  }

  return targets.size;
}

function countSubtreeNodes(schema: A2UISchema, rootId: string): number {
  if (!schema.components[rootId]) {
    return 0;
  }

  let count = 0;
  const stack = [rootId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    count += 1;

    const node = schema.components[currentId];
    for (const childId of node?.childrenIds ?? []) {
      if (schema.components[childId]) {
        stack.push(childId);
      }
    }
  }

  return count;
}
