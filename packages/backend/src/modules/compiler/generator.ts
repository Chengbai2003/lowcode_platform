/**
 * 代码生成器
 * 将 A2UI Flat Schema 编译为 React 组件代码字符串
 */

import type { PageSchema } from '@lowcode-platform/schema-contract';
import * as prettier from 'prettier';
import { type CompileOptions, escapeJSX, isExpression, toCamelCase } from './helpers/codeHelpers';
import { compileSchemaToCode } from './pipeline';

export { isExpression, toCamelCase, escapeJSX } from './helpers/codeHelpers';

export function compileToCode(schema: Record<string, any>, options?: CompileOptions): string {
  return compileSchemaToCode(schema as PageSchema, options);
}

export async function formatCode(code: string): Promise<string> {
  try {
    const prettierModule = await import('prettier');
    if (prettierModule && typeof prettierModule.format === 'function') {
      return await prettierModule.format(code, {
        parser: 'babel',
        semi: true,
        singleQuote: false,
        trailingComma: 'es5',
        printWidth: 100,
        tabWidth: 2,
      });
    }
    return code;
  } catch {
    return code;
  }
}
