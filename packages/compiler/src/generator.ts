import type { ComponentSchema } from "@lowcode-platform/renderer";

interface CompileOptions {
  prettier?: boolean;
}

interface FieldInfo {
  name: string;
  setterName: string;
  initialValue: any;
}

/**
 * 将 JSON Schema 编译为 React 组件代码字符串
 */
export function compileToCode(
  schema: ComponentSchema,
  options?: CompileOptions
): string {
  const imports = new Set<string>(["message"]);
  const fields: FieldInfo[] = [];

  // 1. 扫描字段和收集组件
  scanSchema(schema, imports, fields);

  // 整理 imports
  // 必须引入 React hooks
  const reactImports = ["useState"];

  // 过滤出 Antd 组件 (首字母大写)
  const antdImports = Array.from(imports)
    .filter((name) => /^[A-Z]/.test(name) || name === "message")
    .sort();

  // 2. 生成 State Hooks 代码
  const stateHooks = fields.map(
    (field) =>
      `const [${field.name}, ${field.setterName}] = useState('${
        field.initialValue || ""
      }');`
  );

  // 3. 生成 Submit 函数代码
  const submitFunction =
    fields.length > 0
      ? `
  const handleSubmit = () => {
    const values = {
      ${fields.map((f) => f.name).join(",\n      ")}
    };
    console.log('提交数据:', values);
    message.success('提交成功');
  };`
      : "";

  // 4. 生成 JSX
  const jsx = generateJSX(schema, fields);

  // 5. 组装最终代码
  return `import React, { ${reactImports.join(", ")} } from 'react';
import { ${antdImports.join(", ")} } from 'antd';

export default function GeneratedComponent() {
  // 1. 独立 State
  ${stateHooks.join("\n  ")}

  // 2. 聚合提交逻辑${submitFunction}

  return (
${jsx}
  );
}
`;
}

/**
 * 扫描 Schema：收集 Imports 和 Fields
 */
function scanSchema(
  node: ComponentSchema | string,
  imports: Set<string>,
  fields: FieldInfo[]
) {
  if (typeof node === "string") return;

  // 收集组件 import
  if (node.componentName && /^[A-Z]/.test(node.componentName)) {
    imports.add(node.componentName);
  }

  // 收集 Field
  // 假设 props.field 存在即为表单字段
  if (node.props?.field) {
    const fieldName = toCamelCase(node.props.field);
    fields.push({
      name: fieldName,
      setterName: `set${
        fieldName.charAt(0).toUpperCase() + fieldName.slice(1)
      }`,
      initialValue: node.props.defaultValue || node.props.value || "",
    });
  }

  // 递归处理子节点
  if (node.children) {
    const children = Array.isArray(node.children)
      ? node.children
      : [node.children];
    children.forEach((child) => scanSchema(child, imports, fields));
  }
}

/**
 * 递归生成 JSX
 */
function generateJSX(
  node: ComponentSchema | string,
  fields: FieldInfo[],
  level: number = 2 // 初始缩进层级
): string {
  if (typeof node === "string") {
    return `${"  ".repeat(level)}${node}`;
  }

  const indent = "  ".repeat(level);
  const props = { ...node.props };
  const events = node.events || {};

  // 特殊处理：Field 双向绑定
  if (props.field) {
    const fieldName = toCamelCase(props.field);
    const fieldInfo = fields.find((f) => f.name === fieldName);

    if (fieldInfo) {
      // 绑定 value
      props.value = `__EXPRESSION__${fieldName}`;
      // 绑定 onChange
      // 这里简单假设是 Input 类型的 onChange (e.target.value)
      // 如果是 Select/DatePicker 等可能不同，这里按 Input 处理演示核心逻辑
      props.onChange = `__EXPRESSION__(e) => ${fieldInfo.setterName}(e.target ? e.target.value : e)`;
    }
    // 移除 field 属性，因为 React 组件通常不接受这个非标准属性
    delete props.field;
  }

  // 特殊处理：Label (如果 Input 外面需要包一层 Label，或者 Antd Input 自身没有 Label 属性)
  // 用户的例子里 Input 有 label 属性，但 standard Antd Input 没有 label 属性。
  // 通常 Form.Item 才有 label。
  // 为了符合用户的 "预期输出" (Example 中的 div + label + Input)，我们需要在父级处理?
  // 用户例子： { "type": "Input", "props": { "label": "账号", "field": "username" } }
  // 输出： <div className="mb-4"><label>账号</label><Input ... /></div>
  // 这意味着我们需要这一层转换。简单起见，如果检测到 label 且不是 FormItem，我们可能需要 wrapper。
  // 但为了保持通用性，先把 label 留在 props 里，除非是特定组件。
  // 如果是 Antd Input，它不接受 label。
  // 让我们遵循用户的 "Human-readable" 结构。如果存在 label，生成 wrapper。

  let wrapperStart = "";
  let wrapperEnd = "";
  let labelElement = "";

  if (props.label && node.componentName === "Input") {
    wrapperStart = `${indent}<div style={{ marginBottom: 16 }}>\n${indent}  `;
    wrapperEnd = `\n${indent}</div>`;
    labelElement = `<label style={{ display: 'block', marginBottom: 8 }}>${props.label}</label>\n${indent}  `;
    delete props.label; // 移除已消费的 label
  }

  // 特殊处理：Event Binding
  const extraProps: string[] = [];
  Object.entries(events).forEach(([evtName, evtAction]) => {
    if (evtAction === "submit") {
      extraProps.push(`${evtName}={handleSubmit}`);
    } else {
      // 其他事件暂不处理或保留原样
    }
  });

  // 生成 Props 字符串
  const propStrings = Object.entries(props).map(([key, value]) => {
    if (typeof value === "string") {
      if (value.startsWith("__EXPRESSION__")) {
        return `${key}={${value.replace("__EXPRESSION__", "")}}`;
      }
      return `${key}="${value}"`;
    }
    return `${key}={${JSON.stringify(value)}}`;
  });

  // 合并事件 Pros
  const allProps = [...propStrings, ...extraProps].join(" ");

  // 处理子节点
  let childrenJSX = "";
  if (node.children) {
    const children = Array.isArray(node.children)
      ? node.children
      : [node.children];
    childrenJSX = children
      .map((c) => generateJSX(c, fields, wrapperStart ? level + 1 : level + 1))
      .join("\n");
  }

  const openTag = `<${node.componentName}${allProps ? " " + allProps : ""}`;
  let componentCode = "";

  if (!childrenJSX) {
    componentCode = `${indent}${openTag} />`;
  } else {
    componentCode = `${indent}${openTag}>\n${childrenJSX}\n${indent}</${node.componentName}>`;
  }

  // 应用 Wrapper (如果有 label)
  if (wrapperStart) {
    return `${wrapperStart}${labelElement}${componentCode.trim()}${wrapperEnd}`;
  }

  return componentCode;
}

// 辅助函数：转驼峰
function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace("-", "").replace("_", "")
  );
}
