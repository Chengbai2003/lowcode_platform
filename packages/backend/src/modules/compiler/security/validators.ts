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


