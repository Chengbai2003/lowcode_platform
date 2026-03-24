import { A2UIComponent } from '../types/schema.types';
import { AncestorEntry } from '../types/focus-context.types';

// Scan all childrenIds to build childId → parentId mapping. Single O(N) pass.
export function buildParentMap(
  components: Readonly<Record<string, A2UIComponent>>,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const [parentId, component] of Object.entries(components)) {
    if (component.childrenIds) {
      for (const childId of component.childrenIds) {
        map.set(childId, parentId);
      }
    }
  }
  return map;
}

// Walk from nodeId up to root via parentMap, return [root, ..., grandparent, parent] (excludes self)
export function buildAncestorChain(
  nodeId: string,
  parentMap: ReadonlyMap<string, string>,
  components: Readonly<Record<string, A2UIComponent>>,
): AncestorEntry[] {
  const ancestors: AncestorEntry[] = [];
  const seen = new Set<string>();
  let currentId = parentMap.get(nodeId);
  while (currentId !== undefined) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const comp = components[currentId];
    if (!comp) break;
    ancestors.push({ id: currentId, type: comp.type, depth: 0 });
    currentId = parentMap.get(currentId);
  }
  // reverse so root is first, then assign depth
  ancestors.reverse();
  return ancestors.map((a, i) => ({ ...a, depth: i }));
}
