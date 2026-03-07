import type { A2UISchema, A2UIComponent } from "../../../types";
import type { TreeNodeData } from "./treeTypes";

/**
 * 获取组件的显示标签
 * 优先使用 props.children 或 props.label，否则使用 type
 */
function getComponentLabel(component: A2UIComponent): string {
  if (
    component.props?.children &&
    typeof component.props.children === "string"
  ) {
    // 截断过长的文本
    const text = component.props.children.trim();
    return text.length > 20 ? text.slice(0, 20) + "..." : text;
  }
  if (component.props?.label && typeof component.props.label === "string") {
    return component.props.label;
  }
  return component.type;
}

/**
 * 将扁平化的 Schema 转换为树形结构
 * @param schema - A2UI Schema
 * @param _expandedKeys - 预留参数，用于未来过滤展开节点
 */
export function schemaToTree(
  schema: A2UISchema | null,
  _expandedKeys?: Set<string>,
): TreeNodeData[] {
  if (!schema || !schema.rootId || !schema.components) {
    return [];
  }

  const components = schema.components;
  const visited = new Set<string>();

  function buildNode(
    id: string,
    depth: number,
    parentPath: string[],
  ): TreeNodeData | null {
    // 防止循环引用
    if (visited.has(id)) {
      return null;
    }
    visited.add(id);

    const component = components[id];
    if (!component) {
      return null;
    }

    const childrenIds = component.childrenIds || [];
    const currentPath = [...parentPath, id];

    const children = childrenIds
      .map((childId: string) => buildNode(childId, depth + 1, currentPath))
      .filter(
        (node: TreeNodeData | null): node is TreeNodeData => node !== null,
      );

    return {
      id,
      type: component.type,
      label: getComponentLabel(component),
      children,
      depth,
    };
  }

  const root = buildNode(schema.rootId, 0, []);
  return root ? [root] : [];
}

/**
 * 从 Schema 中查找组件的父节点
 */
export function findParentId(
  schema: A2UISchema,
  targetId: string,
): string | null {
  for (const [id, component] of Object.entries(schema.components) as [
    string,
    A2UIComponent,
  ][]) {
    if (component.childrenIds?.includes(targetId)) {
      return id;
    }
  }
  return null;
}

/**
 * 从 Schema 中删除组件及其所有子组件
 */
export function deleteComponent(
  schema: A2UISchema,
  targetId: string,
): A2UISchema {
  const components = { ...schema.components };
  const toDelete = new Set<string>();

  // 收集所有需要删除的组件（包括子组件）
  function collectDescendants(id: string) {
    toDelete.add(id);
    const component = components[id];
    if (component?.childrenIds) {
      component.childrenIds.forEach((childId: string) =>
        collectDescendants(childId),
      );
    }
  }

  collectDescendants(targetId);

  // 从父节点的 childrenIds 中移除
  const parentId = findParentId(schema, targetId);
  if (parentId && components[parentId]) {
    const parent = { ...components[parentId] };
    parent.childrenIds = parent.childrenIds?.filter(
      (id: string) => id !== targetId,
    );
    components[parentId] = parent;
  }

  // 删除所有收集的组件
  toDelete.forEach((id: string) => delete components[id]);

  // 如果删除的是根节点，返回空 schema
  if (targetId === schema.rootId) {
    return {
      ...schema,
      components: {},
    };
  }

  return {
    ...schema,
    components,
  };
}

/**
 * 复制组件（生成新 ID）
 */
export function copyComponent(
  schema: A2UISchema,
  targetId: string,
): A2UISchema | null {
  const components = { ...schema.components };
  const target = components[targetId];
  if (!target) return null;

  const parentId = findParentId(schema, targetId);
  if (!parentId) return null;

  // 生成新 ID
  const newId = generateNewId(targetId, components);

  // 复制组件树
  const idMap = new Map<string, string>();
  idMap.set(targetId, newId);

  function cloneComponent(id: string): string {
    const comp = components[id];
    if (!comp) return id;

    const newCompId = idMap.get(id) || generateNewId(id, components);
    if (!idMap.has(id)) {
      idMap.set(id, newCompId);
    }

    // 递归处理子组件
    const newChildrenIds = comp.childrenIds?.map((childId: string) => {
      if (!idMap.has(childId)) {
        const newChildId = generateNewId(childId, components);
        idMap.set(childId, newChildId);
        cloneComponent(childId);
      }
      return idMap.get(childId)!;
    });

    const newComp: A2UIComponent = {
      ...comp,
      id: newCompId,
      childrenIds: newChildrenIds,
    };

    components[newCompId] = newComp;
    return newCompId;
  }

  cloneComponent(targetId);

  // 更新父节点的 childrenIds
  const parent = components[parentId];
  if (parent && parent.childrenIds) {
    const targetIndex = parent.childrenIds.indexOf(targetId);
    const newChildrenIds = [...parent.childrenIds];
    newChildrenIds.splice(targetIndex + 1, 0, newId);
    components[parentId] = {
      ...parent,
      childrenIds: newChildrenIds,
    };
  }

  return {
    ...schema,
    components,
  };
}

/**
 * 移动组件（上移/下移）
 */
export function moveComponent(
  schema: A2UISchema,
  targetId: string,
  direction: "up" | "down",
): A2UISchema | null {
  const components = schema.components;
  const parentId = findParentId(schema, targetId);
  if (!parentId) return null;

  const parent = components[parentId];
  if (!parent?.childrenIds) return null;

  const siblings = [...parent.childrenIds];
  const currentIndex = siblings.indexOf(targetId);
  if (currentIndex === -1) return null;

  const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  // 边界检查
  if (newIndex < 0 || newIndex >= siblings.length) return null;

  // 交换位置
  [siblings[currentIndex], siblings[newIndex]] = [
    siblings[newIndex],
    siblings[currentIndex],
  ];

  return {
    ...schema,
    components: {
      ...components,
      [parentId]: {
        ...parent,
        childrenIds: siblings,
      },
    },
  };
}

/**
 * 移动组件到新的父节点下
 */
export function moveComponentTo(
  schema: A2UISchema,
  targetId: string,
  newParentId: string,
): A2UISchema | null {
  if (targetId === newParentId) return null;

  const components = { ...schema.components };
  const target = components[targetId];
  const newParent = components[newParentId];

  if (!target || !newParent) return null;

  // 检查是否会造成循环引用（targetId 不能是 newParentId 的祖先）
  let current: string | null = newParentId;
  while (current) {
    if (current === targetId) return null; // 会造成循环
    current = findParentId({ ...schema, components }, current);
  }

  // 从旧父节点移除
  const oldParentId = findParentId(schema, targetId);
  if (oldParentId && components[oldParentId]) {
    const oldParent = {
      ...components[oldParentId],
      childrenIds: components[oldParentId].childrenIds?.filter(
        (id: string) => id !== targetId,
      ),
    };
    components[oldParentId] = oldParent;
  }

  // 添加到新父节点
  const newParentChildren = [...(newParent.childrenIds || []), targetId];
  components[newParentId] = {
    ...newParent,
    childrenIds: newParentChildren,
  };

  return {
    ...schema,
    components,
  };
}

/**
 * 生成新的唯一 ID
 */
function generateNewId(
  originalId: string,
  existingComponents: Record<string, A2UIComponent>,
): string {
  const match = originalId.match(/^(.+?)(-copy-\d+)?$/);
  const baseId = match ? match[1] : originalId;

  let counter = 1;
  let newId = `${baseId}-copy-${counter}`;

  while (existingComponents[newId]) {
    counter++;
    newId = `${baseId}-copy-${counter}`;
  }

  return newId;
}

/**
 * 获取组件在父节点中的索引
 */
export function getComponentIndex(
  schema: A2UISchema,
  targetId: string,
): number {
  const parentId = findParentId(schema, targetId);
  if (!parentId) return -1;

  const parent = schema.components[parentId];
  return parent?.childrenIds?.indexOf(targetId) ?? -1;
}

/**
 * 检查组件是否可以上移/下移
 */
export function canMove(
  schema: A2UISchema,
  targetId: string,
): { up: boolean; down: boolean } {
  const parentId = findParentId(schema, targetId);
  if (!parentId) return { up: false, down: false };

  const parent = schema.components[parentId];
  const siblings = parent?.childrenIds || [];
  const index = siblings.indexOf(targetId);

  return {
    up: index > 0,
    down: index >= 0 && index < siblings.length - 1,
  };
}
