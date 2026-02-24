import type { A2UISchema, A2UIComponent } from "@lowcode-platform/renderer";
import { compileStyle } from "./styleCompiler";

export interface CompileOptions {
  componentSources?: Record<string, string>;
  defaultLibrary?: string;
}

interface FieldInfo {
  name: string;
  setterName: string;
  initialValue: any;
}

export interface ExpressionNode {
  __expr: true;
  code: string;
}

export function isExpression(value: unknown): value is ExpressionNode {
  return typeof value === "object" && value !== null && "__expr" in value;
}

export function escapeJSX(str: unknown): string {
  if (typeof str !== "string") return String(str);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

/**
 * 将 A2UI Flat Schema 编译为 React 组件代码字符串
 */
export function compileToCode(
  schema: A2UISchema,
  options?: CompileOptions
): string {
  const optionsConfig = {
    componentSources: options?.componentSources || {},
    defaultLibrary: options?.defaultLibrary || "antd",
  };

  const importsBySource: Record<string, Set<string>> = {
    react: new Set(["useState"]),
    [optionsConfig.defaultLibrary]: new Set(["message"]),
  };

  function addImport(component: string) {
    const source =
      optionsConfig.componentSources[component] || optionsConfig.defaultLibrary;
    if (!importsBySource[source]) {
      importsBySource[source] = new Set();
    }
    importsBySource[source].add(component);
  }

  const fields: FieldInfo[] = [];
  const { components, rootId } = schema;

  // Step A: 全局状态收集 (Global State Collection)
  const allNodes = Object.values(components) as A2UIComponent[];

  allNodes.forEach((node) => {
    // 收集组件 import
    if (node.type && /^[A-Z]/.test(node.type)) {
      addImport(node.type);
    }

    // 收集 Field
    if (node.props?.field) {
      const fieldName = toCamelCase(node.props.field);
      fields.push({
        name: fieldName,
        setterName: `set${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)
          }`,
        initialValue: node.props.defaultValue || node.props.value || "",
      });
    }
  });

  // 1. 生成 imports
  const importStatements = Object.entries(importsBySource)
    .filter(([_, set]) => set.size > 0)
    .map(([source, set]) => {
      const names = Array.from(set).sort();
      if (source === "react") {
        return `import React, { ${names.join(", ")} } from 'react';`;
      }
      return `import { ${names.join(", ")} } from '${source}';`;
    })
    .join("\n");

  // 2. 生成 State Hooks 代码
  const stateHooks = fields.map(
    (field) =>
      `const [${field.name}, ${field.setterName}] = useState('${field.initialValue || ""
      }');`
  );

  const visited = new Set<string>();

  // Step B: JSX 生成器 (Lookup Generator)
  function generateJSX(nodeId: string, level: number = 2): string {
    const indent = "  ".repeat(level);

    if (visited.has(nodeId)) {
      return `${indent}{/* Circular ref: ${nodeId} */}`;
    }
    visited.add(nodeId);

    const node = components[nodeId];
    if (!node) {
      return `${indent}<div style={{color: 'red'}}>Node ${nodeId} Not Found</div>`;
    }

    const props = { ...node.props };
    const events = node.events || {};

    // 特殊处理：Field 双向绑定
    if (props.field) {
      const fieldName = toCamelCase(props.field);
      const fieldInfo = fields.find((f) => f.name === fieldName);

      if (fieldInfo) {
        props.value = { __expr: true, code: fieldName } as ExpressionNode;
        props.onChange = {
          __expr: true,
          code: `(e) => ${fieldInfo.setterName}(e.target ? e.target.value : e)`,
        } as ExpressionNode;
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
      labelElement = `<label style={{ display: 'block', marginBottom: 8 }}>${escapeJSX(
        props.label
      )}</label>\n${indent}  `;
      delete props.label;
    }

    // 处理 Events (转化为内联 JS 代码)
    const extraProps: string[] = [];
    Object.entries(events).forEach(([evtName, evtAction]) => {
      if (Array.isArray(evtAction)) {
        const jsCode = compileActionList(evtAction, fields);
        extraProps.push(`${evtName}={${jsCode}}`);
      }
    });

    // 生成 Props 字符串
    const propStrings = Object.entries(props)
      .map(([key, value]) => {
        if (key === "style") return null; // 稍后处理
        if (isExpression(value)) {
          return `${key}={${value.code}}`;
        }
        if (typeof value === "string") {
          return `${key}="${escapeJSX(value)}"`;
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
      childrenJSX = `${indent}  ${escapeJSX(props.children)}`;
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
  return `${importStatements}

export default function GeneratedPage() {
  // 1. State 定义
  ${stateHooks.join("\n  ")}

  // 2. 渲染逻辑
  return (
${jsx}
  );
}
`;
}

// 将 ActionList 编译为 JS 闭包字符串
function compileActionList(actions: any[], fields: FieldInfo[]): string {
  if (!actions || actions.length === 0) return "() => {}";

  const statements = actions.map((action) => {
    switch (action.type) {
      case "setField": {
        const fieldName = toCamelCase(action.field);
        const field = fields.find((f) => f.name === fieldName);
        if (field) {
          const valStr = typeof action.value === "string" ? `"${escapeJSX(action.value)}"` : JSON.stringify(action.value);
          return `${field.setterName}(${valStr});`;
        }
        return `// Field ${action.field} not found`;
      }
      case "message": {
        const msgType = action.messageType || "info";
        const content = typeof action.content === "string" ? `"${escapeJSX(action.content)}"` : JSON.stringify(action.content);
        return `message.${msgType}(${content});`;
      }
      case "navigate": {
        const to = typeof action.to === "string" ? `"${escapeJSX(action.to)}"` : JSON.stringify(action.to);
        return `window.location.href = ${to};`;
      }
      case "apiCall": {
        const url = typeof action.url === "string" ? `"${escapeJSX(action.url)}"` : JSON.stringify(action.url);
        const method = action.method || "GET";
        return `fetch(${url}, { method: "${method}" }).then(res => res.json()).then(data => console.log(data));`;
      }
      case "log": {
        const level = action.level || "log";
        const val = typeof action.value === "string" ? `"${escapeJSX(action.value)}"` : JSON.stringify(action.value);
        return `console.${level}(${val});`;
      }
      case "customAction": {
        if (action.plugin === "submit") {
          return `console.log("Submit", { ${fields.map((f) => f.name).join(", ")} });\n      message.success("提交成功");`;
        }
        return `// Custom Action: ${action.plugin}`;
      }
      default:
        return `// Unsupported action: ${action.type}`;
    }
  });

  return `() => {\n      ${statements.join("\n      ")}\n    }`;
}

// 辅助函数：转驼峰
function toCamelCase(str: string): string {
  if (!str) return "";
  return str.replace(/([-_.\s][a-z])/g, (group) =>
    group.toUpperCase().replace("-", "").replace("_", "").replace(".", "").replace(" ", "")
  );
}
