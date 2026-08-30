import type { SchemaContractIssue } from './issues';

export interface ComponentGraphNode {
  readonly id?: string;
  readonly type?: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly childrenIds?: readonly string[];
}

function getComponentSafe(
  components: Record<string, ComponentGraphNode>,
  id: string,
): ComponentGraphNode | undefined {
  const desc = Object.getOwnPropertyDescriptor(components, id);
  if (!desc || !('value' in desc) || desc.get || desc.set) return undefined;
  return desc.value as ComponentGraphNode;
}

function hasOwnComponent(components: Record<string, ComponentGraphNode>, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(components, id);
}

function getChildrenIdsSafe(node: ComponentGraphNode | undefined): readonly string[] {
  if (!node || typeof node !== 'object') return [];
  const desc = Object.getOwnPropertyDescriptor(node as object, 'childrenIds');
  if (!desc || !('value' in desc) || desc.get || desc.set) return [];
  const val = desc.value;
  if (!Array.isArray(val)) return [];
  // descriptor-safe array iteration: ensure prototype is Array.prototype and no accessor indices
  const arrObj = val as unknown as object;
  if (Object.getPrototypeOf(arrObj) !== Array.prototype) return [];
  const lenDesc = Object.getOwnPropertyDescriptor(arrObj, 'length');
  if (!lenDesc || !('value' in lenDesc) || lenDesc.get || lenDesc.set) return [];
  const len = lenDesc.value as number;
  if (typeof len !== 'number' || !Number.isInteger(len) || len < 0) return [];
  const result: string[] = [];
  for (let i = 0; i < len; i++) {
    const d = Object.getOwnPropertyDescriptor(arrObj, String(i));
    if (!d || !('value' in d) || d.get || d.set) continue;
    const childId = d.value;
    if (typeof childId === 'string') result.push(childId);
  }
  return result;
}

/**
 * 纯 DSL 组件拓扑图合法性校验（全 descriptor-safe，绝不触发 getter）
 * 1. 多父节点检测 (不允许一个组件出现在多个节点的 childrenIds 中)
 * 2. 拓扑成环检测 (Cycle Detection)
 * 3. 严格孤儿节点检测 (从 rootId 无法遍历到达的节点严格拒绝，不硬编码任何组件库知识)
 */
export function validateComponentGraph(
  rootId: string,
  components: Record<string, ComponentGraphNode>,
  issues: SchemaContractIssue[],
): void {
  // 防御：components 必须为普通对象
  const compProto = Object.getPrototypeOf(components);
  if (compProto !== Object.prototype && compProto !== null) {
    // 调用方已校验，此处仅防御
    issues.push({
      code: 'INVALID_OBJECT_PROTOTYPE',
      path: ['components'],
      message: 'components must be a plain object',
    });
    return;
  }

  const componentIds = Object.getOwnPropertyNames(components);

  // 1. 多父节点检测
  const parentCounts = new Map<string, number>();
  for (const parentId of componentIds) {
    const component = getComponentSafe(components, parentId);
    if (!component) continue;
    const children = getChildrenIdsSafe(component);
    for (const childId of children) {
      if (typeof childId !== 'string') continue;
      if (!hasOwnComponent(components, childId)) continue;
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

  for (const startId of componentIds) {
    if (state.has(startId)) continue;

    const stack: Array<{ id: string; nextChildIndex: number }> = [
      { id: startId, nextChildIndex: 0 },
    ];
    state.set(startId, 'visiting');

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const comp = getComponentSafe(components, frame.id);
      const children = getChildrenIdsSafe(comp);

      if (frame.nextChildIndex >= children.length) {
        state.set(frame.id, 'visited');
        stack.pop();
        continue;
      }

      const childId = children[frame.nextChildIndex++];
      if (typeof childId !== 'string' || !hasOwnComponent(components, childId)) continue;

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
  if (hasOwnComponent(components, rootId)) {
    const reachable = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const currentId = stack.pop()!;
      if (reachable.has(currentId)) continue;
      reachable.add(currentId);
      const node = getComponentSafe(components, currentId);
      const children = getChildrenIdsSafe(node);
      for (const childId of children) {
        if (typeof childId === 'string' && hasOwnComponent(components, childId)) {
          stack.push(childId);
        }
      }
    }

    for (const componentId of componentIds) {
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
