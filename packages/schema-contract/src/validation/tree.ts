import type { SchemaContractIssue } from './issues';

interface ComponentGraphNode {
  id?: string;
  type?: string;
  props?: Readonly<Record<string, unknown>>;
  childrenIds?: readonly string[];
}

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

  // 3. 孤儿节点可达性检测 (Orphan Detection)
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

    for (const [componentId, component] of Object.entries(components)) {
      if (!reachable.has(componentId) && !isDetachedHiddenDataNode(component)) {
        issues.push({
          code: 'ORPHANED_COMPONENT',
          path: ['components', componentId],
          message: `Schema contains orphaned component: "${componentId}"`,
        });
      }
    }
  }
}

function isDetachedHiddenDataNode(component: ComponentGraphNode): boolean {
  const props = component.props;
  return (
    component.type === 'Div' &&
    props?.visible === false &&
    Object.prototype.hasOwnProperty.call(props, 'initialValue') &&
    (component.childrenIds?.length ?? 0) === 0
  );
}
