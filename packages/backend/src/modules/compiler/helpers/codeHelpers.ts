export interface CompileOptions {
  componentSources?: Record<string, string>;
  defaultLibrary?: string;
}

export interface ExpressionNode {
  __expr: true;
  code: string;
}

export type NormalizedLiteral = string | number | boolean | null | undefined;

export interface LiteralValueNode {
  kind: 'literal';
  value: NormalizedLiteral;
}

export interface ExpressionValueNode {
  kind: 'expression';
  code: string;
  source: 'legacy' | 'mustache';
}

export interface TemplatePartText {
  kind: 'text';
  value: string;
}

export interface TemplatePartExpression {
  kind: 'expression';
  value: ExpressionValueNode;
}

export interface TemplateValueNode {
  kind: 'template';
  parts: Array<TemplatePartText | TemplatePartExpression>;
  raw: string;
}

export interface ArrayValueNode {
  kind: 'array';
  items: ValueNode[];
}

export interface ObjectValueNode {
  kind: 'object';
  properties: Array<{ key: string; value: ValueNode }>;
}

export type ValueNode =
  | LiteralValueNode
  | ExpressionValueNode
  | TemplateValueNode
  | ArrayValueNode
  | ObjectValueNode;

export interface FieldInfo {
  name: string;
  setterName: string;
  initialValue: ValueNode;
  sourceKey: string;
  source: 'field' | 'hiddenData';
}

export function isExpression(value: unknown): value is ExpressionNode {
  return typeof value === 'object' && value !== null && '__expr' in value;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toCamelCase(str: string): string {
  if (!str) return '';
  return str.replace(/([-_.\s][a-zA-Z])/g, (group) =>
    group.toUpperCase().replace(/[-_.\s]/g, ''),
  );
}

export function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

export function toSafeIdentifier(name: string): string {
  if (!name) return '';
  if (isValidIdentifier(name)) return name;

  const normalized = name
    .replace(/[^A-Za-z0-9_$]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((segment, index) => {
      if (segment.length === 0) return '';
      if (index === 0) return segment;
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join('');

  if (!normalized) {
    return 'stateValue';
  }

  if (isValidIdentifier(normalized)) {
    return normalized;
  }

  const prefixed = normalized.replace(/^[^A-Za-z_$]+/, '');
  return isValidIdentifier(prefixed) ? prefixed : `state${prefixed}`;
}

export function createSetterName(name: string): string {
  if (!name) return 'setValue';
  return `set${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

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

export function escapeTemplateText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

export function toQuotedString(value: string): string {
  return JSON.stringify(value);
}

export function toObjectKeyCode(key: string): string {
  return isValidIdentifier(key) ? key : JSON.stringify(key);
}

export function indentBlock(code: string, level = 1): string {
  const indent = '  '.repeat(level);
  return code
    .split('\n')
    .map((line) => (line.length > 0 ? `${indent}${line}` : line))
    .join('\n');
}

export function stripOuterParens(code: string): string {
  const trimmed = code.trim();
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
