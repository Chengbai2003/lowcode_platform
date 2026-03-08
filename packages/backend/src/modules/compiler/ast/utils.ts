/**
 * 编译器 AST 工具函数
 */

import * as babelTypes from '@babel/types';

/**
 * 字段信息接口
 */
export interface FieldInfo {
  name: string;
  setterName: string;
  initialValue: any;
}

/**
 * 编译选项
 */
export interface CompileOptions {
  componentSources?: Record<string, string>;
  defaultLibrary?: string;
}

/**
 * 表达式节点标记
 */
export interface ExpressionNode {
  __expr: true;
  code: string;
}

/**
 * 判断是否为表达式节点
 */
export function isExpression(value: unknown): value is ExpressionNode {
  return typeof value === 'object' && value !== null && '__expr' in value;
}

/**
 * 转换为驼峰命名
 */
export function toCamelCase(str: string): string {
  if (!str) return '';
  return str.replace(/([-_.\s][a-z])/g, (group) =>
    group.toUpperCase().replace('-', '').replace('_', '').replace('.', '').replace(' ', ''),
  );
}

/**
 * 转义 JSX 特殊字符
 */
export function escapeJSX(str: unknown): string {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

/**
 * 将基础值转化为 Babel AST Expression
 * 支持 null, boolean, number, string, array, object
 */
export function buildValueAST(val: any): babelTypes.Expression {
  if (val === null) return babelTypes.nullLiteral();
  if (typeof val === 'boolean') return babelTypes.booleanLiteral(val);
  if (typeof val === 'number') return babelTypes.numericLiteral(val);
  if (typeof val === 'string') return babelTypes.stringLiteral(val);
  if (Array.isArray(val)) {
    return babelTypes.arrayExpression(val.map((v) => buildValueAST(v)));
  }
  if (typeof val === 'object') {
    return babelTypes.objectExpression(
      Object.entries(val).map(([k, v]) => {
        const keyNode = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)
          ? babelTypes.identifier(k)
          : babelTypes.stringLiteral(k);
        return babelTypes.objectProperty(keyNode, buildValueAST(v));
      }),
    );
  }
  return babelTypes.identifier('undefined');
}
