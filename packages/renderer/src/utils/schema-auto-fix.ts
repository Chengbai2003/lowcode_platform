import type { A2UISchema } from "../types";

/**
 * 常见 AI 幻觉的组件类型映射表
 * 将 AI 常生成的非标准组件名映射到 A2UI 标准组件名
 */
const COMPONENT_TYPE_FIX_MAP: Record<string, string> = {
  // Layout
  Btn: "Button",
  btn: "Button",
  Box: "Container",
  Flex: "Space",
  FlexBox: "Space",
  Grid: "Row",
  Panel: "Card",
  Section: "Container",
  Div: "Container",

  // Form
  TextInput: "Input",
  TextField: "Input",
  Textarea: "TextArea",
  textarea: "TextArea",
  SelectBox: "Select",
  Dropdown: "Select",
  NumInput: "InputNumber",
  Toggle: "Switch",

  // Typography
  Heading: "Title",
  H1: "Title",
  H2: "Title",
  H3: "Title",
  Label: "Text",
  Span: "Text",
  Paragraph: "Text",
  P: "Paragraph",

  // Media / Other
  Image: "Container", // A2UI 目前使用 Container 配合背景或自定义渲染
  Img: "Container",
  Loading: "Spin",
  Progressbar: "Progress",
};

/**
 * 自动修复 A2UI Schema 中的常见错误
 *
 * @param rawSchema 原始输入对象
 * @param registeredTypes 已注册的组件类型列表（白名单）
 * @returns 修复后的 Schema 和修复记录
 */
export function autoFixSchema(
  rawSchema: any,
  registeredTypes: string[] = [],
): {
  fixed: A2UISchema;
  fixes: string[];
} {
  const fixes: string[] = [];

  // 1. 深度拷贝，避免污染原始对象
  const schema = JSON.parse(JSON.stringify(rawSchema)) as A2UISchema;

  // 2. 基础结构校验与初始化
  if (!schema.version) {
    schema.version = 1;
    fixes.push("添加默认版本号: 1");
  }

  if (!schema.components || typeof schema.components !== "object") {
    schema.components = {};
    fixes.push("初始化缺失的 components 对象");
  }

  // 3. 处理每个组件
  const componentIds = Object.keys(schema.components);

  for (const id of componentIds) {
    const comp = schema.components[id];

    // 3a. 修复 ID 缺失或不一致
    if (!comp.id) {
      comp.id = id;
      fixes.push(`组件 ${id}: 补全缺失的 id 字段`);
    } else if (comp.id !== id) {
      const oldId = comp.id;
      comp.id = id;
      fixes.push(`组件 ${id}: 修复 id 不一致 (${oldId} -> ${id})`);
    }

    // 3b. 修复组件类型幻觉
    if (comp.type && !registeredTypes.includes(comp.type)) {
      const fixedType = COMPONENT_TYPE_FIX_MAP[comp.type];
      if (fixedType && registeredTypes.includes(fixedType)) {
        const oldType = comp.type;
        comp.type = fixedType;
        fixes.push(`组件 ${id}: 修正类型幻觉 (${oldType} -> ${fixedType})`);
      } else if (!registeredTypes.includes(comp.type)) {
        // 如果不在映射表中且未注册，暂时保留，由验证器报错或设为 Container
        // 这里选择不做暴力替换，保留错误供后续流程决定
      }
    }

    // 3c. 确保 props 存在
    if (!comp.props) {
      comp.props = {};
    }

    // 3d. 清理无效的 childrenIds 引用
    if (comp.childrenIds && Array.isArray(comp.childrenIds)) {
      const validChildrenIds = comp.childrenIds.filter((childId) => {
        const exists = !!schema.components[childId];
        if (!exists) {
          fixes.push(`组件 ${id}: 移除无效的子组件引用 (${childId})`);
        }
        return exists;
      });

      if (validChildrenIds.length !== comp.childrenIds.length) {
        comp.childrenIds = validChildrenIds;
      }
    } else if (comp.childrenIds && !Array.isArray(comp.childrenIds)) {
      comp.childrenIds = [];
      fixes.push(`组件 ${id}: 修复 childrenIds 格式错误`);
    }
  }

  // 4. 处理 rootId 幻觉
  if (!schema.rootId || !schema.components[schema.rootId]) {
    const oldRootId = schema.rootId;
    // 策略：优先寻找 Page 或 Container，否则取第一个组件
    const firstPage = Object.entries(schema.components).find(
      ([_, c]) => c.type === "Page",
    )?.[0];
    const firstContainer = Object.entries(schema.components).find(
      ([_, c]) => c.type === "Container",
    )?.[0];
    const firstComp = Object.keys(schema.components)[0];

    const newRootId = firstPage || firstContainer || firstComp || "root";

    // 如果没有任何组件，则创建一个默认 Page
    if (!schema.components[newRootId]) {
      schema.components[newRootId] = {
        id: newRootId,
        type: "Page",
        props: { title: "New Page" },
        childrenIds: [],
      };
      fixes.push("创建缺失的根组件 (Page)");
    }

    schema.rootId = newRootId;
    fixes.push(`修正 rootId (${oldRootId || "null"} -> ${newRootId})`);
  }

  return { fixed: schema, fixes };
}
