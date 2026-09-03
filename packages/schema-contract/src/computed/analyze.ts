import jsep from 'jsep';
import type { ComputedExpression, PageLogic } from '../types/logic';
import { FORBIDDEN_LOGIC_KEYS, isSafeDataPathKey, isSafeLogicKey } from '../types/logic';
import type { SchemaValidationLimits } from '../types/limits';
import { normalizeValidationLimits } from '../types/limits';
import type { SchemaContractIssue } from '../validation/issues';

export interface ComputedNodeAnalysis {
  readonly key: string;
  readonly expression: ComputedExpression;
  readonly stateDependencies: readonly string[];
  readonly computedDependencies: readonly string[];
}

export interface ComputedLogicAnalysis {
  /** 依赖优先、同层按 key 字典序稳定排列。 */
  readonly nodes: readonly ComputedNodeAnalysis[];
}

export type ComputedLogicAnalysisResult =
  | { readonly ok: true; readonly value: ComputedLogicAnalysis }
  | { readonly ok: false; readonly issues: readonly SchemaContractIssue[] };

interface ExpressionReferences {
  readonly statePaths: Set<string>;
  readonly computedKeys: Set<string>;
}

interface AnalysisFailure {
  readonly code: string;
  readonly message: string;
}

interface AstBudgetResult {
  readonly nodeCount: number;
  readonly failure?: AnalysisFailure;
}

const ALLOWED_BINARY_OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '===',
  '!=',
  '!==',
  '<',
  '<=',
  '>',
  '>=',
  '&&',
  '||',
]);
const ALLOWED_UNARY_OPERATORS = new Set(['!', '+', '-']);
const ALLOWED_DIRECT_CALLS = new Set(['String', 'Number', 'Boolean', 'parseInt', 'parseFloat']);
const ALLOWED_MATH_CALLS = new Set(['abs', 'max', 'min', 'round', 'floor', 'ceil']);
const ALLOWED_MATH_MEMBERS = new Set([
  'E',
  'LN2',
  'LN10',
  'LOG2E',
  'LOG10E',
  'PI',
  'SQRT1_2',
  'SQRT2',
]);
const FORBIDDEN_MEMBER_SET = new Set<string>(FORBIDDEN_LOGIC_KEYS);

function compareLogicKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function issue(code: string, key: string | undefined, message: string): SchemaContractIssue {
  return {
    code,
    path: key === undefined ? ['logic', 'computed'] : ['logic', 'computed', key],
    message,
  };
}

function readLogicNamespace(
  logic: PageLogic | undefined,
  key: 'states' | 'computed',
):
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly issue: SchemaContractIssue } {
  if (logic === undefined) return { ok: true, value: {} };
  const descriptor = Object.getOwnPropertyDescriptor(logic, key);
  if (descriptor === undefined || ('value' in descriptor && descriptor.value === undefined)) {
    return { ok: true, value: {} };
  }
  if (!('value' in descriptor)) {
    return {
      ok: false,
      issue: {
        code: 'COMPUTED_ANALYSIS_INPUT_INVALID',
        path: ['logic', key],
        message: `Computed analysis requires a canonical data property for logic.${key}`,
      },
    };
  }
  const value = descriptor.value as unknown;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      issue: {
        code: 'COMPUTED_ANALYSIS_INPUT_INVALID',
        path: ['logic', key],
        message: `Computed analysis requires logic.${key} to be an object`,
      },
    };
  }
  return { ok: true, value: value as Readonly<Record<string, unknown>> };
}

function astChildren(node: jsep.Expression): readonly jsep.Expression[] {
  switch (node.type) {
    case 'Compound':
      return (node as jsep.Compound).body;
    case 'MemberExpression': {
      const member = node as jsep.MemberExpression;
      return [member.object, member.property];
    }
    case 'BinaryExpression':
    case 'LogicalExpression': {
      const binary = node as jsep.BinaryExpression;
      return [binary.left, binary.right];
    }
    case 'UnaryExpression':
      return [(node as jsep.UnaryExpression).argument];
    case 'ConditionalExpression': {
      const conditional = node as jsep.ConditionalExpression;
      return [conditional.test, conditional.consequent, conditional.alternate];
    }
    case 'CallExpression': {
      const call = node as jsep.CallExpression;
      return [call.callee, ...call.arguments];
    }
    case 'ArrayExpression':
      return (node as jsep.ArrayExpression).elements.filter(
        (element): element is jsep.Expression => element !== null,
      );
    default:
      return [];
  }
}

function inspectAstBudget(
  ast: jsep.Expression,
  limits: SchemaValidationLimits,
  remainingNodes: number,
): AstBudgetResult {
  let nodeCount = 0;

  const visit = (node: jsep.Expression, depth: number): AnalysisFailure | undefined => {
    if (depth > limits.maxComputedAstDepth) {
      return {
        code: 'COMPUTED_AST_DEPTH_EXCEEDED',
        message: `Computed expression AST depth exceeded limit of ${limits.maxComputedAstDepth}`,
      };
    }

    nodeCount += 1;
    if (nodeCount > remainingNodes) {
      return {
        code: 'COMPUTED_AST_TOTAL_BUDGET_EXCEEDED',
        message: `Computed AST node count exceeded total limit of ${limits.maxComputedAstNodes}`,
      };
    }

    for (const child of astChildren(node)) {
      const failure = visit(child, depth + 1);
      if (failure) return failure;
    }
    return undefined;
  };

  const failure = visit(ast, 1);
  return failure ? { nodeCount, failure } : { nodeCount };
}

function staticMemberKey(member: jsep.MemberExpression): string | undefined {
  if (!member.computed && member.property.type === 'Identifier') {
    return (member.property as jsep.Identifier).name;
  }
  if (member.computed && member.property.type === 'Literal') {
    const value = (member.property as jsep.Literal).value;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return String(value);
  }
  return undefined;
}

function readStaticMemberPath(
  expression: jsep.MemberExpression,
): { readonly root: string; readonly parts: readonly string[] } | AnalysisFailure {
  const parts: string[] = [];
  let current: jsep.Expression = expression;

  while (current.type === 'MemberExpression') {
    const member = current as jsep.MemberExpression;
    const key = staticMemberKey(member);
    if (key === undefined) {
      return {
        code: 'COMPUTED_DYNAMIC_ACCESS_FORBIDDEN',
        message: 'Computed expressions only allow statically known member access',
      };
    }
    if (!isSafeDataPathKey(key) || FORBIDDEN_MEMBER_SET.has(key)) {
      return {
        code: 'COMPUTED_MEMBER_FORBIDDEN',
        message: `Computed expression member "${key}" is forbidden`,
      };
    }
    parts.unshift(key);
    current = member.object;
  }

  if (current.type !== 'Identifier') {
    return {
      code: 'COMPUTED_NAMESPACE_FORBIDDEN',
      message: 'Computed member access must start from state, computed, or Math',
    };
  }

  return { root: (current as jsep.Identifier).name, parts };
}

function validateMemberReference(
  member: jsep.MemberExpression,
  stateKeys: ReadonlySet<string>,
  computedKeys: ReadonlySet<string>,
  references: ExpressionReferences,
): AnalysisFailure | undefined {
  const path = readStaticMemberPath(member);
  if ('code' in path) return path;

  const firstKey = path.parts[0];
  if (path.root === 'Math') {
    if (path.parts.length === 1 && ALLOWED_MATH_MEMBERS.has(firstKey)) return undefined;
    return {
      code: 'COMPUTED_MEMBER_FORBIDDEN',
      message: `Math member "${path.parts.join('.')}" is not allowed`,
    };
  }

  if (path.root === 'state') {
    if (!firstKey || !isSafeLogicKey(firstKey) || !stateKeys.has(firstKey)) {
      return {
        code: 'COMPUTED_REFERENCE_MISSING',
        message: `Computed expression references undeclared State "${firstKey ?? ''}"`,
      };
    }
    // State 的公开写入边界是顶层 Logic Key；用结构无歧义的 key 做失效依赖。
    references.statePaths.add(firstKey);
    return undefined;
  }

  if (path.root === 'computed') {
    if (!firstKey || !isSafeLogicKey(firstKey) || !computedKeys.has(firstKey)) {
      return {
        code: 'COMPUTED_REFERENCE_MISSING',
        message: `Computed expression references undeclared Computed "${firstKey ?? ''}"`,
      };
    }
    references.computedKeys.add(firstKey);
    return undefined;
  }

  return {
    code: 'COMPUTED_NAMESPACE_FORBIDDEN',
    message: `Computed expression namespace "${path.root}" is not allowed`,
  };
}

function validateExpressionAst(
  ast: jsep.Expression,
  stateKeys: ReadonlySet<string>,
  computedKeys: ReadonlySet<string>,
  references: ExpressionReferences,
): AnalysisFailure | undefined {
  switch (ast.type) {
    case 'Compound': {
      const body = (ast as jsep.Compound).body;
      const first = body[0];
      if (first?.type === 'Identifier' && (first as jsep.Identifier).name === 'new') {
        return {
          code: 'COMPUTED_CONSTRUCTOR_FORBIDDEN',
          message: 'Computed expressions do not allow constructors',
        };
      }
      if (first?.type === 'Identifier' && (first as jsep.Identifier).name === 'typeof') {
        return {
          code: 'COMPUTED_OPERATOR_FORBIDDEN',
          message: 'Computed unary operator "typeof" is not allowed',
        };
      }
      if (body.length !== 1) {
        return {
          code: 'COMPUTED_SINGLE_EXPRESSION_REQUIRED',
          message: 'Computed declaration must contain exactly one expression',
        };
      }
      return validateExpressionAst(body[0], stateKeys, computedKeys, references);
    }
    case 'Literal': {
      const value = (ast as jsep.Literal).value;
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      ) {
        return undefined;
      }
      return {
        code: 'COMPUTED_LITERAL_FORBIDDEN',
        message: 'Computed expressions only allow finite JSON literals',
      };
    }
    case 'MemberExpression':
      return validateMemberReference(
        ast as jsep.MemberExpression,
        stateKeys,
        computedKeys,
        references,
      );
    case 'BinaryExpression':
    case 'LogicalExpression': {
      const binary = ast as jsep.BinaryExpression;
      if (!ALLOWED_BINARY_OPERATORS.has(binary.operator)) {
        return {
          code: 'COMPUTED_OPERATOR_FORBIDDEN',
          message: `Computed binary operator "${binary.operator}" is not allowed`,
        };
      }
      return (
        validateExpressionAst(binary.left, stateKeys, computedKeys, references) ??
        validateExpressionAst(binary.right, stateKeys, computedKeys, references)
      );
    }
    case 'UnaryExpression': {
      const unary = ast as jsep.UnaryExpression;
      if (!ALLOWED_UNARY_OPERATORS.has(unary.operator)) {
        return {
          code: 'COMPUTED_OPERATOR_FORBIDDEN',
          message: `Computed unary operator "${unary.operator}" is not allowed`,
        };
      }
      return validateExpressionAst(unary.argument, stateKeys, computedKeys, references);
    }
    case 'ConditionalExpression': {
      const conditional = ast as jsep.ConditionalExpression;
      return (
        validateExpressionAst(conditional.test, stateKeys, computedKeys, references) ??
        validateExpressionAst(conditional.consequent, stateKeys, computedKeys, references) ??
        validateExpressionAst(conditional.alternate, stateKeys, computedKeys, references)
      );
    }
    case 'ArrayExpression': {
      const elements = (ast as jsep.ArrayExpression).elements;
      if (elements.some((element) => element === null)) {
        return {
          code: 'COMPUTED_LITERAL_FORBIDDEN',
          message: 'Computed array literals must not contain holes',
        };
      }
      for (const element of elements) {
        const failure = validateExpressionAst(
          element as jsep.Expression,
          stateKeys,
          computedKeys,
          references,
        );
        if (failure) return failure;
      }
      return undefined;
    }
    case 'CallExpression': {
      const call = ast as jsep.CallExpression;
      const callee = call.callee;
      let allowed = false;
      if (callee.type === 'Identifier') {
        allowed = ALLOWED_DIRECT_CALLS.has((callee as jsep.Identifier).name);
      } else if (callee.type === 'MemberExpression') {
        const path = readStaticMemberPath(callee as jsep.MemberExpression);
        allowed =
          !('code' in path) &&
          path.root === 'Math' &&
          path.parts.length === 1 &&
          ALLOWED_MATH_CALLS.has(path.parts[0]);
      }
      if (!allowed) {
        return {
          code: 'COMPUTED_CALL_FORBIDDEN',
          message: 'Computed expression call is not in the deterministic pure-function whitelist',
        };
      }
      for (const argument of call.arguments) {
        const failure = validateExpressionAst(argument, stateKeys, computedKeys, references);
        if (failure) return failure;
      }
      return undefined;
    }
    case 'Identifier':
      return {
        code: 'COMPUTED_IDENTIFIER_FORBIDDEN',
        message: `Bare identifier "${(ast as jsep.Identifier).name}" is not allowed`,
      };
    case 'NewExpression':
      return {
        code: 'COMPUTED_CONSTRUCTOR_FORBIDDEN',
        message: 'Computed expressions do not allow constructors',
      };
    default:
      return {
        code: 'COMPUTED_SYNTAX_FORBIDDEN',
        message: `Computed expression syntax "${ast.type}" is not allowed`,
      };
  }
}

function pushMinHeap(heap: string[], key: string): void {
  let index = heap.length;
  heap.push(key);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareLogicKeys(heap[parent], key) <= 0) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = key;
}

function popMinHeap(heap: string[]): string | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (first === undefined || last === undefined || heap.length === 0) return first;

  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const smaller =
      right < heap.length && compareLogicKeys(heap[right], heap[left]) < 0 ? right : left;
    if (compareLogicKeys(last, heap[smaller]) <= 0) break;
    heap[index] = heap[smaller];
    index = smaller;
  }
  heap[index] = last;
  return first;
}

function stableTopologicalOrder(nodes: readonly ComputedNodeAnalysis[]): readonly string[] {
  const indegree = new Map(nodes.map((node) => [node.key, node.computedDependencies.length]));
  const dependents = new Map(nodes.map((node) => [node.key, [] as string[]]));

  for (const node of nodes) {
    for (const dependency of node.computedDependencies) {
      dependents.get(dependency)?.push(node.key);
    }
  }
  for (const values of dependents.values()) values.sort(compareLogicKeys);

  const ready: string[] = [];
  for (const node of nodes) {
    if (indegree.get(node.key) === 0) pushMinHeap(ready, node.key);
  }
  const order: string[] = [];

  while (ready.length > 0) {
    const key = popMinHeap(ready)!;
    order.push(key);
    for (const dependent of dependents.get(key) ?? []) {
      const nextDegree = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, nextDegree);
      if (nextDegree === 0) pushMinHeap(ready, dependent);
    }
  }

  return order;
}

function freezeAnalysis(nodes: ComputedNodeAnalysis[]): ComputedLogicAnalysis {
  for (const node of nodes) {
    Object.freeze(node.stateDependencies);
    Object.freeze(node.computedDependencies);
    Object.freeze(node);
  }
  return Object.freeze({ nodes: Object.freeze(nodes) });
}

export function analyzeComputedDeclarations(
  logic: PageLogic | undefined,
  customLimits?: Partial<SchemaValidationLimits>,
): ComputedLogicAnalysisResult {
  const limits = normalizeValidationLimits(customLimits);
  const statesResult = readLogicNamespace(logic, 'states');
  if (!statesResult.ok) return { ok: false, issues: [statesResult.issue] };
  const computedResult = readLogicNamespace(logic, 'computed');
  if (!computedResult.ok) return { ok: false, issues: [computedResult.issue] };
  const states = statesResult.value;
  const computed = computedResult.value;
  const stateKeys = new Set(Object.getOwnPropertyNames(states));
  const computedKeys = Object.getOwnPropertyNames(computed).sort(compareLogicKeys);
  const computedKeySet = new Set(computedKeys);
  const issues: SchemaContractIssue[] = [];
  const nodes: ComputedNodeAnalysis[] = [];
  let dependencyCount = 0;
  let astNodeCount = 0;

  if (computedKeys.length > limits.maxComputedEntries) {
    return {
      ok: false,
      issues: [
        issue(
          'COMPUTED_ENTRIES_BUDGET_EXCEEDED',
          undefined,
          `Computed entry count (${computedKeys.length}) exceeded limit of ${limits.maxComputedEntries}`,
        ),
      ],
    };
  }

  for (const key of computedKeys) {
    if (issues.length >= limits.maxIssues) break;
    if (!isSafeLogicKey(key)) {
      issues.push(
        issue('INVALID_COMPUTED_KEY', key, `Computed key "${key}" must be a safe identifier`),
      );
      continue;
    }

    const expressionDescriptor = Object.getOwnPropertyDescriptor(computed, key);
    const rawExpression =
      expressionDescriptor && 'value' in expressionDescriptor
        ? (expressionDescriptor.value as unknown)
        : undefined;
    if (typeof rawExpression !== 'string' || rawExpression.trim().length === 0) {
      issues.push(
        issue(
          'COMPUTED_EXPRESSION_REQUIRED',
          key,
          'Computed declaration must be a non-empty expression string',
        ),
      );
      continue;
    }
    const expression = rawExpression.trim();
    if (expression.includes('{{') || expression.includes('}}')) {
      issues.push(
        issue(
          'COMPUTED_MUSTACHE_FORBIDDEN',
          key,
          'Computed declarations store the expression body without {{ }} wrappers',
        ),
      );
      continue;
    }
    if (expression.length > limits.maxComputedExpressionLength) {
      issues.push(
        issue(
          'COMPUTED_EXPRESSION_TOO_LONG',
          key,
          `Computed expression length (${expression.length}) exceeded limit of ${limits.maxComputedExpressionLength}`,
        ),
      );
      continue;
    }

    let ast: jsep.Expression;
    try {
      ast = jsep(expression);
    } catch {
      issues.push(
        issue('COMPUTED_EXPRESSION_PARSE_ERROR', key, 'Computed expression could not be parsed'),
      );
      continue;
    }

    const astBudget = inspectAstBudget(ast, limits, limits.maxComputedAstNodes - astNodeCount);
    if (astBudget.failure) {
      issues.push(issue(astBudget.failure.code, key, astBudget.failure.message));
      break;
    }
    astNodeCount += astBudget.nodeCount;

    const references: ExpressionReferences = {
      statePaths: new Set<string>(),
      computedKeys: new Set<string>(),
    };
    const validationFailure = validateExpressionAst(ast, stateKeys, computedKeySet, references);
    if (validationFailure) {
      issues.push(issue(validationFailure.code, key, validationFailure.message));
      continue;
    }

    const stateDependencies = [...references.statePaths].sort(compareLogicKeys);
    const computedDependencies = [...references.computedKeys].sort(compareLogicKeys);
    dependencyCount += stateDependencies.length + computedDependencies.length;
    if (dependencyCount > limits.maxComputedDependencies) {
      issues.push(
        issue(
          'COMPUTED_GRAPH_BUDGET_EXCEEDED',
          undefined,
          `Computed dependency count exceeded limit of ${limits.maxComputedDependencies}`,
        ),
      );
      break;
    }

    nodes.push({ key, expression, stateDependencies, computedDependencies });
  }

  if (issues.length > 0) return { ok: false, issues: Object.freeze(issues) };

  const order = stableTopologicalOrder(nodes);
  if (order.length !== nodes.length) {
    const orderedKeys = new Set(order);
    const cycleKeys = nodes
      .map((node) => node.key)
      .filter((key) => !orderedKeys.has(key))
      .sort(compareLogicKeys);
    return {
      ok: false,
      issues: [
        issue(
          'COMPUTED_CYCLE',
          undefined,
          `Computed dependency cycle leaves unresolved keys: ${cycleKeys.join(', ')}`,
        ),
      ],
    };
  }

  const nodesByKey = new Map(nodes.map((node) => [node.key, node]));
  return {
    ok: true,
    value: freezeAnalysis(order.map((key) => nodesByKey.get(key)!)),
  };
}
