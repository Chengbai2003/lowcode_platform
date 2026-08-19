import {
  type ExpressionValueNode,
  type TemplateValueNode,
  type ValueNode,
  type ExpressionNode,
  isExpression,
  isPlainObject,
} from '../helpers/codeHelpers';

const ALLOWED_PROTOCOLS = ['http:', 'https:', ''];
const DANGEROUS_TOKENS = [
  '__proto__',
  'prototype',
  'constructor',
  'eval',
  'Function',
  'import(',
  'require(',
  'globalThis',
  'process',
  'document',
  'window.',
  'window[',
  'XMLHttpRequest',
];

const MUSTACHE_REGEX = /\{\{([\s\S]+?)\}\}/g;

export function isValidExpressionPath(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const dangerousKeywords = [
    '__proto__',
    'prototype',
    'constructor',
    'eval',
    'exec',
    'Function',
    'setTimeout',
    'setInterval',
    'process',
    'require',
    'window',
    'document',
    'global',
  ];

  for (const keyword of dangerousKeywords) {
    if (code.includes(keyword)) return false;
  }

  return /^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*|\[\d+\])*$/.test(code);
}

const ALLOWED_AST_TYPES = new Set([
  'Literal',
  'Identifier',
  'MemberExpression',
  'BinaryExpression',
  'LogicalExpression',
  'UnaryExpression',
  'ConditionalExpression',
  'CallExpression',
  'ArrayExpression',
  'Compound',
]);

const BLOCKED_CALLEE_NAMES = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'toJSON',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'assign',
  'defineProperty',
  'setPrototypeOf',
  'freeze',
  'seal',
  'preventExtensions',
  'eval',
  'Function',
]);

function isAllowedASTNode(node: any): boolean {
  if (!node || typeof node !== 'object' || !node.type) return true;
  if (!ALLOWED_AST_TYPES.has(node.type)) return false;
  switch (node.type) {
    case 'Compound': {
      const body = (node as any).body;
      if (!Array.isArray(body) || body.length !== 1) return false;
      return isAllowedASTNode(body[0]);
    }
    case 'MemberExpression': {
      const prop = (node as any).property;
      const propName =
        (node as any).computed === false && prop && prop.type === 'Identifier'
          ? prop.name
          : typeof prop?.value === 'string'
            ? prop.value
            : typeof prop?.name === 'string'
              ? prop.name
              : '';
      if (propName && BLOCKED_CALLEE_NAMES.has(propName)) return false;
      return isAllowedASTNode((node as any).object) && isAllowedASTNode(prop);
    }
    case 'BinaryExpression':
    case 'LogicalExpression': {
      return isAllowedASTNode((node as any).left) && isAllowedASTNode((node as any).right);
    }
    case 'UnaryExpression': {
      return isAllowedASTNode((node as any).argument);
    }
    case 'ConditionalExpression': {
      return (
        isAllowedASTNode((node as any).test) &&
        isAllowedASTNode((node as any).consequent) &&
        isAllowedASTNode((node as any).alternate)
      );
    }
    case 'CallExpression': {
      const callee = (node as any).callee;
      if (!callee) return false;
      if (callee.type === 'Identifier') {
        if (BLOCKED_CALLEE_NAMES.has(callee.name)) return false;
      } else if (callee.type === 'MemberExpression') {
        if (!isAllowedASTNode(callee)) return false;
      } else {
        return false;
      }
      const args = (node as any).arguments || [];
      for (const arg of args) {
        if (!isAllowedASTNode(arg)) return false;
      }
      return true;
    }
    case 'ArrayExpression': {
      const elems = (node as any).elements || [];
      for (const el of elems) {
        if (el && !isAllowedASTNode(el)) return false;
      }
      return true;
    }
    case 'Literal':
    case 'Identifier':
      return true;
    default:
      return false;
  }
}

export function isSafeInlineExpression(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim();
  if (!trimmed) return false;

  for (const token of DANGEROUS_TOKENS) {
    if (trimmed.includes(token)) {
      return false;
    }
  }

  if (/[;`]/.test(trimmed)) {
    return false;
  }

  if (/\b(function|class|while|for|try|catch|throw|return|new)\b/.test(trimmed)) {
    return false;
  }

  if (/(^|[^=!<>])=($|[^=])/m.test(trimmed)) {
    return false;
  }

  // secondary block for dangerous method names even without AST (fallback)
  for (const token of BLOCKED_CALLEE_NAMES) {
    if (trimmed.includes(token)) {
      return false;
    }
  }

  // AST whitelist (primary)
  try {
    let jsep: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      jsep = require('jsep');
    } catch {
      try {
        // fallback to frontend's jsep if backend doesn't have direct dep
        // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
        jsep = require('../../../../frontend/node_modules/jsep/dist/jsep.js');
      } catch {
        jsep = null;
      }
    }
    if (jsep) {
      const parseFn = typeof jsep === 'function' ? jsep : jsep.default || jsep.parse;
      if (typeof parseFn === 'function') {
        const ast = parseFn(trimmed);
        if (!isAllowedASTNode(ast)) return false;
      }
    }
  } catch {
    return false;
  }

  return true;
}

export function containsMustache(value: string): boolean {
  return /\{\{([\s\S]+?)\}\}/.test(value);
}

export function getExactMustacheExpression(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^\{\{([\s\S]+?)\}\}$/);
  if (!match) return null;
  const body = match[1].trim();
  return body.length > 0 ? body : null;
}

export function parseTemplateParts(value: string): TemplateValueNode['parts'] {
  const parts: TemplateValueNode['parts'] = [];
  let lastIndex = 0;
  const regex = new RegExp(MUSTACHE_REGEX);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    const [rawMatch, exprBody] = match;
    if (match.index > lastIndex) {
      parts.push({ kind: 'text', value: value.slice(lastIndex, match.index) });
    }

    const body = exprBody.trim();
    parts.push({
      kind: 'expression',
      value: {
        kind: 'expression',
        code: body,
        source: 'mustache',
      },
    });

    lastIndex = match.index + rawMatch.length;
  }

  if (lastIndex < value.length) {
    parts.push({ kind: 'text', value: value.slice(lastIndex) });
  }

  return parts;
}

export function normalizeValue(value: unknown): ValueNode {
  if (isExpression(value)) {
    return normalizeLegacyExpression(value);
  }

  if (value === null || value === undefined) {
    return { kind: 'literal', value };
  }

  if (typeof value === 'string') {
    const expressionBody = getExactMustacheExpression(value);
    if (expressionBody) {
      return {
        kind: 'expression',
        code: expressionBody,
        source: 'mustache',
      };
    }

    if (containsMustache(value)) {
      return {
        kind: 'template',
        parts: parseTemplateParts(value),
        raw: value,
      };
    }

    return { kind: 'literal', value };
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return { kind: 'literal', value };
  }

  if (Array.isArray(value)) {
    return {
      kind: 'array',
      items: value.map((item) => normalizeValue(item)),
    };
  }

  if (isPlainObject(value)) {
    return {
      kind: 'object',
      properties: Object.entries(value).map(([key, nestedValue]) => ({
        key,
        value: normalizeValue(nestedValue),
      })),
    };
  }

  return { kind: 'literal', value: String(value) };
}

export function normalizeLegacyExpression(value: ExpressionNode): ExpressionValueNode {
  return {
    kind: 'expression',
    code: typeof value.code === 'string' ? value.code.trim() : '',
    source: 'legacy',
  };
}

export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '/';

  const trimmedUrl = url.trim();
  const lowerUrl = trimmedUrl.toLowerCase();

  if (
    lowerUrl.startsWith('javascript:') ||
    lowerUrl.startsWith('data:') ||
    lowerUrl.startsWith('file:')
  ) {
    return '/';
  }

  if (trimmedUrl.startsWith('/') || trimmedUrl.startsWith('#') || !trimmedUrl.includes('://')) {
    return trimmedUrl;
  }

  try {
    const urlObj = new URL(trimmedUrl);
    if (!ALLOWED_PROTOCOLS.includes(urlObj.protocol)) {
      return '/';
    }

    const hostname = urlObj.hostname.toLowerCase();
    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^0\.0\.0\.0$/,
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i,
    ];

    if (blockedPatterns.some((pattern) => pattern.test(hostname))) {
      return '/';
    }

    return trimmedUrl;
  } catch {
    return '/';
  }
}

export function isStaticStringValue(node: ValueNode): node is { kind: 'literal'; value: string } {
  return node.kind === 'literal' && typeof node.value === 'string';
}
