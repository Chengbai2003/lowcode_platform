/**
 * Action AST 构建器
 */

import * as babelTypes from "@babel/types";
import { FieldInfo, toCamelCase, buildValueAST } from "./utils";

/** Label wrapper 的底部边距 */
const LABEL_MARGIN_BOTTOM = 16;

/**
 * 将 ActionList 编译为 JS 闭包 AST
 */
export function buildActionListAST(
  actions: any[],
  fields: FieldInfo[],
): babelTypes.ArrowFunctionExpression {
  if (!actions || actions.length === 0) {
    return babelTypes.arrowFunctionExpression(
      [],
      babelTypes.blockStatement([]),
    );
  }

  const statements: babelTypes.Statement[] = actions.map((action) => {
    switch (action.type) {
      case "setField": {
        const fieldName = toCamelCase(action.field);
        const field = fields.find((f) => f.name === fieldName);
        if (field) {
          const valNode =
            typeof action.value === "string"
              ? babelTypes.stringLiteral(action.value)
              : babelTypes.cloneNode(buildValueAST(action.value));

          return babelTypes.expressionStatement(
            babelTypes.callExpression(babelTypes.identifier(field.setterName), [
              valNode,
            ]),
          );
        }
        const emptyStmt = babelTypes.emptyStatement();
        babelTypes.addComment(
          emptyStmt,
          "leading",
          ` Field ${action.field} not found`,
          true,
        );
        return emptyStmt;
      }

      case "message": {
        const msgType = action.messageType || "info";
        const contentNode =
          typeof action.content === "string"
            ? babelTypes.stringLiteral(action.content)
            : babelTypes.cloneNode(buildValueAST(action.content));

        return babelTypes.expressionStatement(
          babelTypes.callExpression(
            babelTypes.memberExpression(
              babelTypes.identifier("message"),
              babelTypes.identifier(msgType),
            ),
            [contentNode],
          ),
        );
      }

      case "navigate": {
        const toNode =
          typeof action.to === "string"
            ? babelTypes.stringLiteral(action.to)
            : babelTypes.cloneNode(buildValueAST(action.to));

        return babelTypes.expressionStatement(
          babelTypes.assignmentExpression(
            "=",
            babelTypes.memberExpression(
              babelTypes.memberExpression(
                babelTypes.identifier("window"),
                babelTypes.identifier("location"),
              ),
              babelTypes.identifier("href"),
            ),
            toNode,
          ),
        );
      }

      case "apiCall": {
        const urlNode =
          typeof action.url === "string"
            ? babelTypes.stringLiteral(action.url)
            : babelTypes.cloneNode(buildValueAST(action.url));
        const method = action.method || "GET";

        // 生成带错误处理的 fetch 调用
        // fetch(url, { method }).then(res => res.json()).then(data => console.log(data)).catch(err => console.error(err))
        return babelTypes.expressionStatement(
          babelTypes.callExpression(
            babelTypes.memberExpression(
              babelTypes.callExpression(
                babelTypes.memberExpression(
                  babelTypes.callExpression(
                    babelTypes.memberExpression(
                      babelTypes.callExpression(
                        babelTypes.identifier("fetch"),
                        [
                          urlNode,
                          babelTypes.objectExpression([
                            babelTypes.objectProperty(
                              babelTypes.identifier("method"),
                              babelTypes.stringLiteral(method),
                            ),
                          ]),
                        ],
                      ),
                      babelTypes.identifier("then"),
                    ),
                    [
                      babelTypes.arrowFunctionExpression(
                        [babelTypes.identifier("res")],
                        babelTypes.callExpression(
                          babelTypes.memberExpression(
                            babelTypes.identifier("res"),
                            babelTypes.identifier("json"),
                          ),
                          [],
                        ),
                      ),
                    ],
                  ),
                  babelTypes.identifier("then"),
                ),
                [
                  babelTypes.arrowFunctionExpression(
                    [babelTypes.identifier("data")],
                    babelTypes.callExpression(
                      babelTypes.memberExpression(
                        babelTypes.identifier("console"),
                        babelTypes.identifier("log"),
                      ),
                      [babelTypes.identifier("data")],
                    ),
                  ),
                ],
              ),
              babelTypes.identifier("catch"),
            ),
            [
              babelTypes.arrowFunctionExpression(
                [babelTypes.identifier("err")],
                babelTypes.callExpression(
                  babelTypes.memberExpression(
                    babelTypes.identifier("console"),
                    babelTypes.identifier("error"),
                  ),
                  [babelTypes.identifier("err")],
                ),
              ),
            ],
          ),
        );
      }

      case "log": {
        const level = action.level || "log";
        const valNode =
          typeof action.value === "string"
            ? babelTypes.stringLiteral(action.value)
            : babelTypes.cloneNode(buildValueAST(action.value));

        return babelTypes.expressionStatement(
          babelTypes.callExpression(
            babelTypes.memberExpression(
              babelTypes.identifier("console"),
              babelTypes.identifier(level),
            ),
            [valNode],
          ),
        );
      }

      case "customAction": {
        if (action.plugin === "submit") {
          const objProps = fields.map((f) =>
            babelTypes.objectProperty(
              babelTypes.identifier(f.name),
              babelTypes.identifier(f.name),
              false,
              true,
            ),
          );

          return babelTypes.blockStatement([
            babelTypes.expressionStatement(
              babelTypes.callExpression(
                babelTypes.memberExpression(
                  babelTypes.identifier("console"),
                  babelTypes.identifier("log"),
                ),
                [
                  babelTypes.stringLiteral("Submit"),
                  babelTypes.objectExpression(objProps),
                ],
              ),
            ),
            babelTypes.expressionStatement(
              babelTypes.callExpression(
                babelTypes.memberExpression(
                  babelTypes.identifier("message"),
                  babelTypes.identifier("success"),
                ),
                [babelTypes.stringLiteral("提交成功")],
              ),
            ),
          ]);
        }

        const emptyStmt = babelTypes.emptyStatement();
        babelTypes.addComment(
          emptyStmt,
          "leading",
          ` Custom Action: ${action.plugin}`,
          true,
        );
        return emptyStmt;
      }

      default: {
        const emptyStmt = babelTypes.emptyStatement();

        // 废弃的 Action 类型
        const deprecatedActions = [
          "clearField",
          "openTab",
          "closeTab",
          "back",
          "dispatch",
          "resetForm",
          "parallel",
          "sequence",
          "debug",
          "customScript",
        ];

        // 高级 Action 类型
        const advancedActions = [
          "notification",
          "waitCondition",
          "loop",
          "switch",
          "mergeField",
          "modal",
          "confirm",
          "setState",
          "delay",
          "if",
          "tryCatch",
        ];

        if (deprecatedActions.includes(action.type)) {
          babelTypes.addComment(
            emptyStmt,
            "leading",
            ` DEPRECATED: Action "${action.type}" is deprecated and will be removed in v1.0`,
            true,
          );
        } else if (advancedActions.includes(action.type)) {
          babelTypes.addComment(
            emptyStmt,
            "leading",
            ` TODO: Implement advanced action: ${action.type}`,
            true,
          );
        } else {
          babelTypes.addComment(
            emptyStmt,
            "leading",
            ` Unknown action: ${action.type}`,
            true,
          );
        }
        return emptyStmt;
      }
    }
  });

  // Flatten block statements
  const flattenedStmts: babelTypes.Statement[] = [];
  statements.forEach((stmt) => {
    if (babelTypes.isBlockStatement(stmt)) {
      flattenedStmts.push(...stmt.body);
    } else {
      flattenedStmts.push(stmt);
    }
  });

  return babelTypes.arrowFunctionExpression(
    [],
    babelTypes.blockStatement(flattenedStmts),
  );
}
