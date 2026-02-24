import * as babelTypes from '@babel/types';
import { A2UISchema } from '@lowcode-platform/renderer';
import { compileStyle } from '../styleCompiler';
import { FieldInfo, toCamelCase, isExpression } from './utils';
import { buildActionListAST } from './actionBuilder';

/**
 * 递归生成 JSX Element AST
 */
export function buildJSXTree(
  schema: A2UISchema,
  fields: FieldInfo[]
): babelTypes.JSXElement | babelTypes.JSXFragment {
  const { components, rootId } = schema;
  const visited = new Set<string>();

  function generateJSXNode(
    nodeId: string
  ): babelTypes.JSXElement | babelTypes.JSXFragment | babelTypes.JSXExpressionContainer | babelTypes.JSXText {
    if (visited.has(nodeId)) {
      const commentExpr = babelTypes.jsxEmptyExpression();
      babelTypes.addComment(commentExpr, "inner", ` Circular ref: ${nodeId} `, false);
      // Babel returnStatement expects an Expression, but JSXExpressionContainer by itself is sometimes tricky.
      // Easiest safe way to return a comment is returning a fragment containing the comment container.
      return babelTypes.jsxFragment(babelTypes.jsxOpeningFragment(), babelTypes.jsxClosingFragment(), [
        babelTypes.jsxExpressionContainer(commentExpr)
      ]);
    }
    visited.add(nodeId);

    const node = components[nodeId];
    if (!node) {
      return babelTypes.jsxElement(
        babelTypes.jsxOpeningElement(babelTypes.jsxIdentifier("div"), [
          babelTypes.jsxAttribute(
            babelTypes.jsxIdentifier("style"),
            babelTypes.jsxExpressionContainer(
              babelTypes.objectExpression([
                babelTypes.objectProperty(babelTypes.identifier("color"), babelTypes.stringLiteral("red"))
              ])
            )
          )
        ]),
        babelTypes.jsxClosingElement(babelTypes.jsxIdentifier("div")),
        [babelTypes.jsxText(`Node ${nodeId} Not Found`)]
      );
    }

    const props = { ...node.props };
    const events = node.events || {};

    // 1. 特殊处理：Field 双向绑定
    let boundValueNode: babelTypes.JSXExpressionContainer | null = null;
    let boundOnChangeNode: babelTypes.JSXExpressionContainer | null = null;

    if (props.field) {
      const fieldName = toCamelCase(props.field);
      const fieldInfo = fields.find((f) => f.name === fieldName);

      if (fieldInfo) {
        boundValueNode = babelTypes.jsxExpressionContainer(babelTypes.identifier(fieldName));

        // (e) => setX(e.target ? e.target.value : e)
        boundOnChangeNode = babelTypes.jsxExpressionContainer(
          babelTypes.arrowFunctionExpression(
            [babelTypes.identifier("e")],
            babelTypes.callExpression(babelTypes.identifier(fieldInfo.setterName), [
              babelTypes.conditionalExpression(
                babelTypes.memberExpression(babelTypes.identifier("e"), babelTypes.identifier("target")),
                babelTypes.memberExpression(
                  babelTypes.memberExpression(babelTypes.identifier("e"), babelTypes.identifier("target")),
                  babelTypes.identifier("value")
                ),
                babelTypes.identifier("e")
              )
            ])
          )
        );
      }
      delete props.field;
    }

    // 2. 特殊处理：Label Wrapper
    let needsLabelWrapper = false;
    let labelString = "";

    if (props.label && node.type === "Input") {
      needsLabelWrapper = true;
      labelString = props.label as string;
      delete props.label;
    }

    // 3. 构造子节点
    const childrenNodes: (babelTypes.JSXElement | babelTypes.JSXFragment | babelTypes.JSXExpressionContainer | babelTypes.JSXText)[] = [];

    if (node.childrenIds && node.childrenIds.length > 0) {
      node.childrenIds.forEach((childId: string) => {
        childrenNodes.push(generateJSXNode(childId));
      });
    } else if (props.children && typeof props.children === "string") {
      childrenNodes.push(babelTypes.jsxText(props.children));
    }

    // 4. 构造属性
    const attributes: babelTypes.JSXAttribute[] = [];

    // - 常规属性
    Object.entries(props).forEach(([key, value]) => {
      if (key === "style" || key === "children") return; // 单独处理

      let valNode: babelTypes.JSXAttribute["value"];
      if (isExpression(value)) {
        // 直接作为一个标识符放入 container
        valNode = babelTypes.jsxExpressionContainer(babelTypes.identifier(value.code));
      } else if (typeof value === "string") {
        valNode = babelTypes.stringLiteral(value);
      } else {
        // null, boolean, number, object
        valNode = babelTypes.jsxExpressionContainer(buildValueAST(value));
      }
      attributes.push(babelTypes.jsxAttribute(babelTypes.jsxIdentifier(key), valNode));
    });

    // - 双向绑定属性
    if (boundValueNode) {
      attributes.push(babelTypes.jsxAttribute(babelTypes.jsxIdentifier("value"), boundValueNode));
    }
    if (boundOnChangeNode) {
      attributes.push(babelTypes.jsxAttribute(babelTypes.jsxIdentifier("onChange"), boundOnChangeNode));
    }

    // - 事件监听属性
    Object.entries(events).forEach(([evtName, evtAction]) => {
      if (Array.isArray(evtAction)) {
        const arrowFn = buildActionListAST(evtAction, fields);
        attributes.push(
          babelTypes.jsxAttribute(babelTypes.jsxIdentifier(evtName), babelTypes.jsxExpressionContainer(arrowFn))
        );
      }
    });

    // - 样式属性
    if (props.style) {
      const { className, styleObj } = compileStyle(props.style);

      let finalClassName = className;
      if (className && props.className) {
        finalClassName = `${props.className} ${className}`;
      } else if (props.className) {
        finalClassName = props.className as string;
      }

      if (finalClassName) {
        attributes.push(
          babelTypes.jsxAttribute(babelTypes.jsxIdentifier("className"), babelTypes.stringLiteral(finalClassName))
        );
      }

      if (Object.keys(styleObj).length > 0) {
        const objProps = Object.entries(styleObj).map(([k, v]) =>
          babelTypes.objectProperty(
            babelTypes.identifier(k),
            typeof v === "number" ? babelTypes.numericLiteral(v) : babelTypes.stringLiteral(v as string)
          )
        );
        attributes.push(
          babelTypes.jsxAttribute(
            babelTypes.jsxIdentifier("style"),
            babelTypes.jsxExpressionContainer(babelTypes.objectExpression(objProps))
          )
        );
      }
    } else if (props.className) {
      attributes.push(
        babelTypes.jsxAttribute(babelTypes.jsxIdentifier("className"), babelTypes.stringLiteral(props.className as string))
      );
    }

    // 5. 生成当前组件 AST
    const isSelfClosing = childrenNodes.length === 0;
    const componentElement = babelTypes.jsxElement(
      babelTypes.jsxOpeningElement(babelTypes.jsxIdentifier(node.type), attributes, isSelfClosing),
      isSelfClosing ? null : babelTypes.jsxClosingElement(babelTypes.jsxIdentifier(node.type)),
      childrenNodes
    );

    // 6. 如果有 Label，包装它
    if (needsLabelWrapper) {
      return babelTypes.jsxElement(
        babelTypes.jsxOpeningElement(babelTypes.jsxIdentifier("div"), [
          babelTypes.jsxAttribute(
            babelTypes.jsxIdentifier("style"),
            babelTypes.jsxExpressionContainer(
              babelTypes.objectExpression([
                babelTypes.objectProperty(babelTypes.identifier("marginBottom"), babelTypes.numericLiteral(16))
              ])
            )
          )
        ]),
        babelTypes.jsxClosingElement(babelTypes.jsxIdentifier("div")),
        [
          babelTypes.jsxElement(
            babelTypes.jsxOpeningElement(babelTypes.jsxIdentifier("label"), [
              babelTypes.jsxAttribute(
                babelTypes.jsxIdentifier("style"),
                babelTypes.jsxExpressionContainer(
                  babelTypes.objectExpression([
                    babelTypes.objectProperty(babelTypes.identifier("display"), babelTypes.stringLiteral("block")),
                    babelTypes.objectProperty(babelTypes.identifier("marginBottom"), babelTypes.numericLiteral(8))
                  ])
                )
              )
            ]),
            babelTypes.jsxClosingElement(babelTypes.jsxIdentifier("label")),
            [babelTypes.jsxText(labelString)]
          ),
          componentElement
        ]
      );
    }

    return componentElement;
  }

  return rootId
    ? (generateJSXNode(rootId) as babelTypes.JSXElement | babelTypes.JSXFragment)
    : babelTypes.jsxFragment(babelTypes.jsxOpeningFragment(), babelTypes.jsxClosingFragment(), []);
}

function buildValueAST(val: any): babelTypes.Expression {
  if (val === null) return babelTypes.nullLiteral();
  if (typeof val === "boolean") return babelTypes.booleanLiteral(val);
  if (typeof val === "number") return babelTypes.numericLiteral(val);
  if (typeof val === "string") return babelTypes.stringLiteral(val);
  if (Array.isArray(val)) {
    return babelTypes.arrayExpression(val.map((v) => buildValueAST(v)));
  }
  if (typeof val === "object") {
    return babelTypes.objectExpression(
      Object.entries(val).map(([k, v]) => {
        // Quote invalid identifiers automatically by choosing stringLiteral as key
        const keyNode = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)
          ? babelTypes.identifier(k)
          : babelTypes.stringLiteral(k);
        return babelTypes.objectProperty(keyNode, buildValueAST(v));
      })
    );
  }
  return babelTypes.identifier("undefined");
}
