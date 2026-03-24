import { A2UIComponent } from '../types/schema.types';

/** BFS collect subtree node IDs, limited by maxDepth and maxNodes */
export function getSubtreeIds(
  nodeId: string,
  components: Readonly<Record<string, A2UIComponent>>,
  maxDepth: number,
  maxNodes: number,
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

  while (queue.length > 0 && result.length < maxNodes) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (!components[id]) continue;
    result.push(id);
    if (depth < maxDepth) {
      const children = components[id].childrenIds ?? [];
      for (const childId of children) {
        if (result.length + queue.length < maxNodes) {
          queue.push({ id: childId, depth: depth + 1 });
        }
      }
    }
  }

  return result;
}

/** Extract subtree as independent components map */
export function extractSubtree(
  nodeId: string,
  components: Readonly<Record<string, A2UIComponent>>,
  maxDepth: number,
  maxNodes: number,
): Record<string, A2UIComponent> {
  const ids = getSubtreeIds(nodeId, components, maxDepth, maxNodes);
  const result: Record<string, A2UIComponent> = {};
  for (const id of ids) {
    const comp = components[id];
    if (comp) {
      result[id] = comp;
    }
  }
  return result;
}

/** Compute max depth from rootId using BFS */
export function computeMaxDepth(
  rootId: string,
  components: Readonly<Record<string, A2UIComponent>>,
): number {
  let maxDepth = 0;
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const comp = components[id];
    if (!comp) continue;
    if (depth > maxDepth) maxDepth = depth;
    const children = comp.childrenIds ?? [];
    for (const childId of children) {
      queue.push({ id: childId, depth: depth + 1 });
    }
  }

  return maxDepth;
}
