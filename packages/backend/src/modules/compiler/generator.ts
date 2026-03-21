/**
 * 代码生成器
 * 将 A2UI Flat Schema 编译为 React 组件代码字符串
 */

import type { A2UISchema } from './schema.types';
import * as prettier from 'prettier';
import { type CompileOptions, escapeJSX, isExpression, toCamelCase } from './helpers/codeHelpers';
import { compileSchemaToCode } from './pipeline';

export { isExpression, toCamelCase, escapeJSX } from './helpers/codeHelpers';

export function compileToCode(schema: Record<string, any>, options?: CompileOptions): string {
  return compileSchemaToCode(schema as A2UISchema, options);
}

export async function formatCode(code: string): Promise<string> {
  try {
    return await prettier.format(code, {
      parser: 'babel',
      semi: true,
      singleQuote: false,
      trailingComma: 'es5',
      printWidth: 100,
      tabWidth: 2,
    });
  } catch {
    return code;
  }
}
