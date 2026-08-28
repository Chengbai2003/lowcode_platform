import type { SchemaContractIssue } from './issues';

export interface ComponentGraphNode {
  readonly id?: string;
  readonly type?: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly childrenIds?: readonly string[];
}

/**
 * 纯 DSL 组件拓扑图合法性校验
 * 1. 多父节点检测 (不允许一个组件出现在多个节点的 childrenIds 中)
 * 2. 拓扑成环检测 (Cycle Detection)
 * 3. 严格孤儿节点检测 (从 rootId 无法遍历到达的节点严格拒绝，不硬编码任何组件库知识)
 */
export function validateComponentGraph(
  rootId: string,
  components: Record<string, ComponentGraphNode>,
  issues: SchemaContractIssue[],
): void {
  // 1. 多父节点检测
  const parentCounts = new Map<string, number>();
  for (const [parentId, component] of Object.entries(components)) {
    for (const childId of component.childrenIds ?? []) {
      if (typeof childId !== 'string') continue;
      const count = (parentCounts.get(childId) ?? 0) + 1;
      if (count > 1) {
        issues.push({
          code: 'MULTIPLE_PARENTS',
          path: ['components', childId],
          message: `Component "${childId}" has multiple parents (referenced by "${parentId}")`,
        });
      }
      parentCounts.set(childId, count);
    }
  }

  // 2. 拓扑成环检测 (Cycle Detection)
  const state = new Map<string, 'visiting' | 'visited'>();

  for (const startId of Object.keys(components)) {
    if (state.has(startId)) continue;

    const stack: Array<{ id: string; nextChildIndex: number }> = [
      { id: startId, nextChildIndex: 0 },
    ];
    state.set(startId, 'visiting');

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const comp = components[frame.id];
      const children = comp?.childrenIds ?? [];

      if (frame.nextChildIndex >= children.length) {
        state.set(frame.id, 'visited');
        stack.pop();
        continue;
      }

      const childId = children[frame.nextChildIndex++];
      if (typeof childId !== 'string' || !components[childId]) continue;

      const childState = state.get(childId);

      if (childState === 'visiting') {
        issues.push({
          code: 'COMPONENT_CYCLE',
          path: ['components', childId],
          message: `Schema contains a component cycle at "${childId}"`,
        });
        break;
      }

      if (childState !== 'visited') {
        state.set(childId, 'visiting');
        stack.push({ id: childId, nextChildIndex: 0 });
      }
    }
  }

  // 3. 严格孤儿节点检测 (Orphan Detection)
  if (components[rootId]) {
    const reachable = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const currentId = stack.pop()!;
      if (reachable.has(currentId)) continue;
      reachable.add(currentId);
      const node = components[currentId];
      if (node && Array.isArray(node.childrenIds)) {
        for (const childId of node.childrenIds) {
          if (typeof childId === 'string' && components[childId]) {
            stack.push(childId);
          }
        }
      }
    }

    for (const componentId of Object.keys(components)) {
      if (!reachable.has(componentId)) {
        issues.push({
          code: 'ORPHANED_COMPONENT',
          path: ['components', componentId],
          message: `Schema contains orphaned component: "${componentId}" (unreachable from rootId "${rootId}")`,
        });
      }
    }
  }
}
