import type { A2UISchema, A2UIComponent } from "@lowcode-platform/renderer";
import * as babelTypes from "@babel/types";
import generate from "@babel/generator";
import { CompileOptions, FieldInfo, toCamelCase } from "./ast/utils";
import { buildImports } from "./ast/importBuilder";
import { buildJSXTree } from "./ast/jsxBuilder";

export { isExpression, toCamelCase, escapeJSX } from "./ast/utils";
// Removed redundant export from utils

/**
 * 将 A2UI Flat Schema 编译为 React 组件代码字符串 (AST 驱动版)
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
  const { components } = schema;

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
        initialValue: node.props.defaultValue ?? node.props.value ?? "",
      });
    }
  });

  // Step B: 构建 AST (Build AST from schema)

  // 1. 生成 Imports
  const importDecls = buildImports(importsBySource);

  // 2. 生成 State Hooks 语句
  // const [field, setField] = useState('val');
  const stateHooks: babelTypes.Statement[] = fields.map((field) => {
    return babelTypes.variableDeclaration("const", [
      babelTypes.variableDeclarator(
        babelTypes.arrayPattern([babelTypes.identifier(field.name), babelTypes.identifier(field.setterName)]),
        babelTypes.callExpression(babelTypes.identifier("useState"), [
          // typeof check is no longer needed cleanly handle empty string default
          typeof field.initialValue === 'string'
            ? babelTypes.stringLiteral(field.initialValue)
            : babelTypes.identifier(String(field.initialValue || '""'))
        ])
      ),
    ]);
  });

  // 3. 生成 JSX 树
  const jsxTree = buildJSXTree(schema, fields);

  // 4. 组装组件主体
  const funcBody = babelTypes.blockStatement([
    ...stateHooks,
    babelTypes.returnStatement(jsxTree),
  ]);

  const componentDecl = babelTypes.exportDefaultDeclaration(
    babelTypes.functionDeclaration(babelTypes.identifier("GeneratedPage"), [], funcBody)
  );

  // 5. 生成完整文件 Program
  const program = babelTypes.program([...importDecls, componentDecl]);
  const file = babelTypes.file(program);

  // Step C: 代码生成 (Generate via Babel)
  const { code } = generate(file, {
    jsescOption: {
      minimal: true, // 防止中文被转义为 unicode 码
    }
  });

  return code;
}
