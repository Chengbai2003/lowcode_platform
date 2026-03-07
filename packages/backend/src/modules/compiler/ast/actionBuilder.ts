/**
 * Action AST 构建器
 * 精简 Action 体系 (8种)
 */

import * as babelTypes from "@babel/types";
import { FieldInfo, toCamelCase, buildValueAST } from "./utils";

/**
 * 将 ActionList 编译为 JS 闭包 AST
 *
 * 精简 Action 体系 (8种):
 * - setValue: 设置字段/状态值
 * - apiCall: API 请求
 * - navigate: 页面跳转
 * - feedback: 消息/通知
 * - dialog: 模态框/确认框
 * - if/loop: 条件分支/循环
 * - delay/log: 延迟/日志
 * - customScript: 自定义脚本
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
      // 数据操作
      case "setValue": {
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

        // 处理 state.xxx 路径
        if (action.field.startsWith("state.")) {
          const statePath = action.field.substring(6);
          const valNode =
            typeof action.value === "string"
              ? babelTypes.stringLiteral(action.value)
              : babelTypes.cloneNode(buildValueAST(action.value));

          return babelTypes.expressionStatement(
            babelTypes.callExpression(babelTypes.identifier("setState"), [
              babelTypes.objectExpression([
                babelTypes.objectProperty(
                  babelTypes.identifier(statePath),
                  valNode,
                ),
              ]),
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

      // 网络请求
      case "apiCall": {
        const urlNode =
          typeof action.url === "string"
            ? babelTypes.stringLiteral(action.url)
            : babelTypes.cloneNode(buildValueAST(action.url));
        const method = action.method || "GET";

        // 构建带错误处理的 fetch 调用
        const fetchCall = babelTypes.callExpression(
          babelTypes.memberExpression(
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
                  [], // 空的 then 回调，不打印日志
                ),
                babelTypes.identifier("catch"),
              ),
              [], // 空的 catch 回调，不打印错误
            ),
          ),
          [],
        );

        // 如果指定了 resultTo，添加结果处理逻辑
        if (action.resultTo) {
          const resultToKeys = action.resultTo.split(".");
          const lastKey = resultToKeys.pop();

          // 构建嵌套路径访问
          let targetAccess: babelTypes.Expression =
            babelTypes.identifier("data");
          for (const key of resultToKeys) {
            targetAccess = babelTypes.memberExpression(
              targetAccess,
              babelTypes.identifier(key),
            );
          }

          // 设置结果：data.xxx = response
          const assignResult = babelTypes.assignmentExpression(
            "=",
            babelTypes.memberExpression(
              targetAccess,
              babelTypes.identifier(lastKey || "result"),
            ),
            babelTypes.identifier("data"),
          );

          // 带参数的 then 回调
          fetchCall.callee.arguments = [
            babelTypes.arrowFunctionExpression(
              [babelTypes.identifier("response")],
              babelTypes.blockStatement([
                babelTypes.expressionStatement(assignResult),
              ]),
            ),
          ];
        }

        return babelTypes.expressionStatement(fetchCall);
      }

      // 路由跳转
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

      // 消息反馈
      case "feedback": {
        const level = action.level || "info";
        const kind = action.kind || "message";
        const contentNode =
          typeof action.content === "string"
            ? babelTypes.stringLiteral(action.content)
            : babelTypes.cloneNode(buildValueAST(action.content));

        if (kind === "notification") {
          return babelTypes.expressionStatement(
            babelTypes.callExpression(
              babelTypes.memberExpression(
                babelTypes.identifier("notification"),
                babelTypes.identifier(level),
              ),
              [
                babelTypes.objectExpression([
                  babelTypes.objectProperty(
                    babelTypes.identifier("message"),
                    action.title
                      ? babelTypes.stringLiteral(action.title)
                      : babelTypes.stringLiteral("通知"),
                  ),
                  babelTypes.objectProperty(
                    babelTypes.identifier("description"),
                    contentNode,
                  ),
                ]),
              ],
            ),
          );
        }

        return babelTypes.expressionStatement(
          babelTypes.callExpression(
            babelTypes.memberExpression(
              babelTypes.identifier("message"),
              babelTypes.identifier(level),
            ),
            [contentNode],
          ),
        );
      }

      // 弹窗
      case "dialog": {
        const kind = action.kind || "modal";
        const contentNode =
          typeof action.content === "string"
            ? babelTypes.stringLiteral(action.content)
            : babelTypes.cloneNode(buildValueAST(action.content));
        const titleNode = action.title
          ? babelTypes.stringLiteral(action.title)
          : babelTypes.stringLiteral(kind === "confirm" ? "确认" : "提示");

        if (kind === "confirm") {
          return babelTypes.expressionStatement(
            babelTypes.callExpression(
              babelTypes.memberExpression(
                babelTypes.identifier("Modal"),
                babelTypes.identifier("confirm"),
              ),
              [
                babelTypes.objectExpression([
                  babelTypes.objectProperty(
                    babelTypes.identifier("title"),
                    titleNode,
                  ),
                  babelTypes.objectProperty(
                    babelTypes.identifier("content"),
                    contentNode,
                  ),
                ]),
              ],
            ),
          );
        }

        return babelTypes.expressionStatement(
          babelTypes.callExpression(
            babelTypes.memberExpression(
              babelTypes.identifier("Modal"),
              babelTypes.identifier("info"),
            ),
            [
              babelTypes.objectExpression([
                babelTypes.objectProperty(
                  babelTypes.identifier("title"),
                  titleNode,
                ),
                babelTypes.objectProperty(
                  babelTypes.identifier("content"),
                  contentNode,
                ),
              ]),
            ],
          ),
        );
      }

      // 条件分支
      case "if": {
        const conditionNode =
          typeof action.condition === "string"
            ? babelTypes.identifier(action.condition)
            : babelTypes.cloneNode(buildValueAST(action.condition));

        return babelTypes.ifStatement(
          conditionNode,
          babelTypes.blockStatement(
            action.then
              ? action.then.map((a: any) =>
                  babelTypes.expressionStatement(
                    babelTypes.callExpression(
                      babelTypes.identifier("executeAction"),
                      [babelTypes.stringLiteral(a.type)],
                    ),
                  ),
                )
              : [],
          ),
          action.else
            ? babelTypes.blockStatement(
                action.else.map((a: any) =>
                  babelTypes.expressionStatement(
                    babelTypes.callExpression(
                      babelTypes.identifier("executeAction"),
                      [babelTypes.stringLiteral(a.type)],
                    ),
                  ),
                ),
              )
            : null,
        );
      }

      // 循环
      case "loop": {
        const itemVar = action.itemVar || "item";
        const overNode =
          typeof action.over === "string"
            ? babelTypes.identifier(action.over)
            : babelTypes.cloneNode(buildValueAST(action.over));

        return babelTypes.forOfStatement(
          babelTypes.variableDeclaration("const", [
            babelTypes.variableDeclarator(babelTypes.identifier(itemVar)),
          ]),
          overNode,
          babelTypes.blockStatement(
            action.actions
              ? action.actions.map((a: any) =>
                  babelTypes.expressionStatement(
                    babelTypes.callExpression(
                      babelTypes.identifier("executeAction"),
                      [babelTypes.stringLiteral(a.type)],
                    ),
                  ),
                )
              : [],
          ),
        );
      }

      // 延迟
      case "delay": {
        return babelTypes.expressionStatement(
          babelTypes.awaitExpression(
            babelTypes.newExpression(babelTypes.identifier("Promise"), [
              babelTypes.arrowFunctionExpression(
                [babelTypes.identifier("resolve")],
                babelTypes.callExpression(
                  babelTypes.callExpression(
                    babelTypes.identifier("setTimeout"),
                    [
                      babelTypes.identifier("resolve"),
                      babelTypes.numericLiteral(action.ms || 1000),
                    ],
                  ),
                  [],
                ),
              ),
            ]),
          ),
        );
      }

      // 日志
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

      // 自定义脚本
      case "customScript": {
        const emptyStmt = babelTypes.emptyStatement();
        babelTypes.addComment(
          emptyStmt,
          "leading",
          ` Custom Script: ${action.code?.substring(0, 50)}...`,
          true,
        );
        return emptyStmt;
      }

      default: {
        const emptyStmt = babelTypes.emptyStatement();
        babelTypes.addComment(
          emptyStmt,
          "leading",
          ` Unknown action: ${action.type}`,
          true,
        );
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
