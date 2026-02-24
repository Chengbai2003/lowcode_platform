import * as babelTypes from '@babel/types';

/**
 * 将收集到的组件按源分组，生成对应的 import 声明 AST 节点数组
 */
export function buildImports(
  importsBySource: Record<string, Set<string>>
): babelTypes.ImportDeclaration[] {
  return Object.entries(importsBySource)
    .filter(([_, set]) => set.size > 0)
    .map(([source, set]) => {
      const specifiers = Array.from(set).sort().map((name) =>
        babelTypes.importSpecifier(babelTypes.identifier(name), babelTypes.identifier(name))
      );

      // React 特殊处理，需要引入默认的 React 以及 useState 等钩子
      if (source === 'react') {
        const hasReactDefault = specifiers.some(s =>
          babelTypes.isImportSpecifier(s) && babelTypes.isIdentifier(s.imported) && s.imported.name === 'React'
        );

        const reactSpecifiers: (babelTypes.ImportDefaultSpecifier | babelTypes.ImportSpecifier)[] =
          hasReactDefault ? [] : [babelTypes.importDefaultSpecifier(babelTypes.identifier('React'))];

        return babelTypes.importDeclaration(
          [...reactSpecifiers, ...specifiers],
          babelTypes.stringLiteral(source)
        );
      }

      return babelTypes.importDeclaration(specifiers, babelTypes.stringLiteral(source));
    });
}
