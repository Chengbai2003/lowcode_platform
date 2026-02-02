import type { A2UISchema, A2UIComponent } from "@lowcode-platform/renderer";
import { compileStyle } from "./styleCompiler";

interface CompileOptions {
  prettier?: boolean;
}

interface FieldInfo {
  name: string;
  setterName: string;
  initialValue: any;
}

/**
 * 将 A2UI Flat Schema 编译为 React 组件代码字符串
 */
export function compileToCode(
  schema: A2UISchema,
  options?: CompileOptions
): string {
  const imports = new Set<string>(["message"]);
  const fields: FieldInfo[] = [];
  const { components, rootId } = schema;

  // Step A: 全局状态收集 (Global State Collection)
  // 利用扁平结构的特性，直接遍历组件池来收集 useState，无需递归
  const allNodes = Object.values(components) as A2UIComponent[];

  allNodes.forEach((node) => {
    // 收集组件 import
    if (node.type && /^[A-Z]/.test(node.type)) {
      imports.add(node.type);
    }

    // 收集 Field
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
  });

  // 整理 imports
  const reactImports = ["useState"];
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

  // Step B: JSX 生成器 (Lookup Generator)
  function generateJSX(nodeId: string, level: number = 2): string {
    const node = components[nodeId];
    if (!node) {
      return `${"  ".repeat(
        level
      )}<div style={{color: 'red'}}>Node ${nodeId} Not Found</div>`;
    }

    const indent = "  ".repeat(level);
    const props = { ...node.props };
    const events = node.events || {};

    // 特殊处理：Field 双向绑定
    if (props.field) {
      const fieldName = toCamelCase(props.field);
      const fieldInfo = fields.find((f) => f.name === fieldName);

      if (fieldInfo) {
        props.value = `__EXPRESSION__${fieldName}`;
        props.onChange = `__EXPRESSION__(e) => ${fieldInfo.setterName}(e.target ? e.target.value : e)`;
      }
      delete props.field;
    }

    // 特殊处理：Label Wrapper (Input)
    let wrapperStart = "";
    let wrapperEnd = "";
    let labelElement = "";

    if (props.label && node.type === "Input") {
      wrapperStart = `${indent}<div style={{ marginBottom: 16 }}>\n${indent}  `;
      wrapperEnd = `\n${indent}</div>`;
      labelElement = `<label style={{ display: 'block', marginBottom: 8 }}>${props.label}</label>\n${indent}  `;
      delete props.label;
    }

    // 特殊处理：Event Binding
    const extraProps: string[] = [];
    Object.entries(events).forEach(([evtName, evtAction]) => {
      if (evtAction === "submit") {
        extraProps.push(`${evtName}={handleSubmit}`);
      }
    });

    // 生成 Props 字符串
    const propStrings = Object.entries(props)
      .map(([key, value]) => {
        if (key === "style") return null; // 稍后处理
        if (typeof value === "string") {
          if (value.startsWith("__EXPRESSION__")) {
            return `${key}={${value.replace("__EXPRESSION__", "")}}`;
          }
          return `${key}="${value}"`;
        }
        return `${key}={${JSON.stringify(value)}}`;
      })
      .filter(Boolean) as string[];

    // 处理 Style
    if (props.style) {
      const { className, styleObj } = compileStyle(props.style);
      if (className) {
        if (props.className) {
          propStrings.push(`className="${props.className} ${className}"`);
        } else {
          propStrings.push(`className="${className}"`);
        }
      } else if (props.className) {
        propStrings.push(`className="${props.className}"`);
      }

      if (Object.keys(styleObj).length > 0) {
        propStrings.push(`style={${JSON.stringify(styleObj)}}`);
      }
    } else if (props.className) {
      propStrings.push(`className="${props.className}"`);
    }

    const allProps = [...propStrings, ...extraProps].join(" ");

    // 递归子节点
    let childrenJSX = "";
    if (node.childrenIds && node.childrenIds.length > 0) {
      childrenJSX = node.childrenIds
        .map((childId: string) =>
          generateJSX(childId, wrapperStart ? level + 2 : level + 1)
        )
        .join("\n");
    } else if (props.children && typeof props.children === "string") {
      // Handle text children defined in props (simplified case)
      childrenJSX = `${"  ".repeat(level + 1)}${props.children}`;
    }

    const openTag = `<${node.type}${allProps ? " " + allProps : ""}`;
    let componentCode = "";

    if (!childrenJSX) {
      componentCode = `${indent}${openTag} />`;
    } else {
      componentCode = `${indent}${openTag}>\n${childrenJSX}\n${indent}</${node.type}>`;
    }

    if (wrapperStart) {
      return `${wrapperStart}${labelElement}${componentCode.trim()}${wrapperEnd}`;
    }

    return componentCode;
  }

  // 4. 生成 JSX (从 Root 开始)
  // Ensure we have a rootId before generating
  const jsx = rootId ? generateJSX(rootId) : "";

  // Step C: 代码组装 (Assembly)
  return `import React, { ${reactImports.join(", ")} } from 'react';
import { ${antdImports.join(", ")} } from 'antd';

export default function GeneratedPage() {
  // 1. State 定义
  ${stateHooks.join("\n  ")}

  // 2. 聚合提交逻辑${submitFunction}

  // 3. 渲染逻辑
  return (
${jsx}
  );
}
`;
}

// 辅助函数：转驼峰
function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace("-", "").replace("_", "")
  );
}
