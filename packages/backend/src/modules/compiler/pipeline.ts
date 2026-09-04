import {
  analyzeActionFlowDeclarations,
  analyzeComputedDeclarations,
  FORBIDDEN_DATA_PATH_KEYS,
  isSafeDataPathKey,
  isSafeLogicKey,
  normalizeFlowExecutionLimits,
  SchemaValidationError,
  type ActionFlowAnalysis,
  type ComputedLogicAnalysis,
  type PageSchema,
  type ComponentNode,
  type JsonValue,
  type FlowExecutionLimits,
} from '@lowcode-platform/schema-contract';
import jsep from 'jsep';
import { compileStyle } from './styleCompiler';
import {
  type CompileOptions,
  type FieldInfo,
  type ObjectValueNode,
  type ValueNode,
  createSetterName,
  escapeJSX,
  escapeTemplateText,
  indentBlock,
  isPlainObject,
  isValidIdentifier,
  toCamelCase,
  toObjectKeyCode,
  toQuotedString,
  toSafeIdentifier,
} from './helpers/codeHelpers';
import {
  BLOCKED_PROP_NAMES,
  BUILTIN_IDENTIFIERS,
  collectInlineExpressionIdentifiers,
  isSafeInlineExpression,
  isStaticStringValue,
  isValidExpressionPath,
  normalizeValue,
  RESERVED_GENERATED_IDENTIFIERS,
  sanitizeUrl,
} from './security/validators';
import {
  GeneratedIdentifierRegistry,
  isSafeComponentType,
  isSafeGeneratedIdentifier,
} from './registry';
import { requireValidPageSchema } from '../page-schema/schema-validation';

interface PropNode {
  name: string;
  value: ValueNode;
}

interface ActionNode {
  type: string;
  field?: string;
  method?: string;
  kind?: string;
  level?: string;
  resultTo?: string;
  itemVar?: string;
  indexVar?: string;
  ms?: number;
  merge?: boolean;
  code?: string;
  showError?: boolean;
  placement?: string;
  duration?: number;
  value?: ValueNode;
  url?: ValueNode;
  to?: ValueNode;
  content?: ValueNode;
  title?: ValueNode;
  condition?: ValueNode;
  over?: ValueNode;
  body?: ValueNode;
  headers?: Record<string, ValueNode>;
  params?: Record<string, ValueNode>;
  actions?: ActionNode[];
  then?: ActionNode[];
  else?: ActionNode[];
  onSuccess?: ActionNode[];
  onError?: ActionNode[];
  onOk?: ActionNode[];
  onCancel?: ActionNode[];
  flow?: string;
  input?: ValueNode;
}

interface EventBindingNode {
  eventName: string;
  actions: ActionNode[];
  handlerName?: string;
}

interface HandlerDeclaration {
  name: string;
  code: string;
}

interface FlatComponentNode {
  id: string;
  componentType: string;
  props: PropNode[];
  events: EventBindingNode[];
  childIds: string[];
}

interface MissingComponentNode {
  kind: 'missing';
  id: string;
}

interface CycleComponentNode {
  kind: 'cycle';
  id: string;
}

interface ResolvedComponentNode {
  kind: 'component';
  id: string;
  componentType: string;
  props: PropNode[];
  events: EventBindingNode[];
  children: ParseTreeNode[];
  codegenNode?: JSXNode;
}

type ParseTreeNode = MissingComponentNode | CycleComponentNode | ResolvedComponentNode;

interface FlowDeclarationNode {
  key: string;
  steps: ActionNode[];
  onError?: ActionNode[];
}

interface RootNode {
  type: 'root';
  schema: PageSchema;
  options: Required<CompileOptions>;
  flatComponents: FlatComponentNode[];
  children: ParseTreeNode[];
  imports: Map<string, Set<string>>;
  fields: FieldInfo[];
  handlers: HandlerDeclaration[];
  helpers: Set<string>;
  usesPageState: boolean;
  usesComputed: boolean;
  usesFlows: boolean;
  computedAnalysis?: ComputedLogicAnalysis;
  flowAnalysis?: ActionFlowAnalysis;
  flows?: FlowDeclarationNode[];
  flowRuntimeCode?: string;
  flowExecutionLimits?: FlowExecutionLimits;
}

interface JSXElementNode {
  kind: 'element';
  tag: string;
  attributes: JSXAttributeNode[];
  children: JSXNode[];
}

interface JSXFragmentNode {
  kind: 'fragment';
  children: JSXNode[];
}

interface JSXTextNode {
  kind: 'text';
  value: string;
}

interface JSXExpressionNode {
  kind: 'expression';
  code: string;
}

interface JSXConditionalNode {
  kind: 'conditional';
  condition: string;
  consequent: JSXNode;
  alternate?: JSXNode;
}

interface JSXCommentNode {
  kind: 'comment';
  text: string;
}

type JSXNode =
  | JSXElementNode
  | JSXFragmentNode
  | JSXTextNode
  | JSXExpressionNode
  | JSXConditionalNode
  | JSXCommentNode;

interface JSXAttributeNode {
  name: string;
  mode: 'string' | 'expression' | 'boolean';
  value?: string;
}

interface TransformContext {
  root: RootNode;
  imports: Map<string, Set<string>>;
  fields: FieldInfo[];
  handlers: HandlerDeclaration[];
  fieldBySourceKey: Map<string, FieldInfo>;
  fieldByName: Map<string, FieldInfo>;
  reservedHandlerNames: Set<string>;
  registry: GeneratedIdentifierRegistry;
}

function isSafePropName(name: string): boolean {
  return isValidIdentifier(name) && !BLOCKED_PROP_NAMES.has(name) && !name.startsWith('__');
}

function isSafeEventName(name: string): boolean {
  return isValidIdentifier(name) && /^on[A-Z]/.test(name) && isSafeGeneratedIdentifier(name);
}

function hasDeclaredPageState(ctx: TransformContext): boolean {
  return ctx.root.schema.logic?.states !== undefined;
}

function sanitizeStatePath(
  statePath: string,
  allowLegacyNestedPath: boolean,
): readonly string[] | undefined {
  const parts = statePath.split('.');
  if (allowLegacyNestedPath) {
    return parts.every(isSafeDataPathKey) ? parts : undefined;
  }
  return parts.length === 1 && isSafeLogicKey(parts[0]) ? parts : undefined;
}

function sanitizeResultTo(resultTo: string | undefined, ctx: TransformContext): string | undefined {
  if (!resultTo) return undefined;
  if (ctx.fieldByName.has(resultTo)) return resultTo;
  if (resultTo.startsWith('state.')) {
    const suffix = resultTo.slice(6);
    if (sanitizeStatePath(suffix, !hasDeclaredPageState(ctx))) {
      return resultTo;
    }
    return undefined;
  }
  return undefined;
}

function getStatePathValueCode(path: readonly string[]): string {
  return `state${path.map((part) => `?.[${toQuotedString(part)}]`).join('')}`;
}

function getNestedStateUpdateCode(path: readonly string[], valueCode: string): string {
  const pathCode = JSON.stringify(path);
  return `((source, path, value) => {
  const root = source !== null && typeof source === 'object'
    ? Array.isArray(source) ? [...source] : { ...source }
    : {};
  let sourceCursor = source;
  let targetCursor = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const nextSource = sourceCursor !== null && typeof sourceCursor === 'object'
      ? sourceCursor[path[index]]
      : undefined;
    const nextTarget = nextSource !== null && typeof nextSource === 'object'
      ? Array.isArray(nextSource) ? [...nextSource] : { ...nextSource }
      : {};
    targetCursor[path[index]] = nextTarget;
    sourceCursor = nextSource;
    targetCursor = nextTarget;
  }
  targetCursor[path[path.length - 1]] = value;
  return root;
})(state, ${pathCode}, ${valueCode})`;
}

function getMergedStateValueCode(currentValueCode: string, valueCode: string): string {
  const forbiddenKeysCode = JSON.stringify(FORBIDDEN_DATA_PATH_KEYS);
  return `((currentValue, resolvedValue) => {
  if (resolvedValue !== null && typeof resolvedValue === 'object') {
    const safeValue = Object.fromEntries(
      Object.entries(resolvedValue).filter(([key]) => !${forbiddenKeysCode}.includes(key)),
    );
    const base = currentValue !== null && typeof currentValue === 'object' && !Array.isArray(currentValue)
      ? currentValue
      : {};
    return { ...base, ...safeValue };
  }
  return resolvedValue;
})(${currentValueCode}, ${valueCode})`;
}

const ALLOWED_FEEDBACK_LEVELS = new Set(['info', 'success', 'warning', 'error']);
const ALLOWED_LOG_LEVELS = new Set(['info', 'success', 'warning', 'error', 'log', 'debug', 'warn']);
const COMPUTED_RUNTIME_INTRINSICS = new Set(['Array', 'Symbol', 'WeakMap', 'WeakSet']);

function sanitizeFeedbackLevel(level: string | undefined, fallback = 'info'): string {
  if (level && ALLOWED_FEEDBACK_LEVELS.has(level)) return level;
  return fallback;
}

function sanitizeLogLevel(level: string | undefined, fallback = 'log'): string {
  if (level && ALLOWED_LOG_LEVELS.has(level)) return level;
  return fallback;
}

function sanitizeLoopVar(name: string | undefined, fallback: string): string {
  if (name === undefined) {
    return fallback;
  }
  if (!isSafeGeneratedIdentifier(name)) {
    throw new Error(`非法循环变量标识符: "${name}"`);
  }
  return name;
}

function escapeComment(text: string): string {
  return text.replace(/\*\//g, '* /').replace(/\/\*/g, '/ *');
}

const LABEL_WRAPPER_MARGIN_BOTTOM = 16;
const LABEL_DISPLAY = 'block';
const LABEL_MARGIN_BOTTOM = 8;

function createCompileOptions(options?: CompileOptions): Required<CompileOptions> {
  return {
    componentSources: options?.componentSources || {},
    componentBindings: options?.componentBindings || {},
    defaultLibrary: options?.defaultLibrary || 'antd',
    allowDefaultComponentFallback: options?.allowDefaultComponentFallback ?? true,
    flowExecutionLimits: options?.flowExecutionLimits || {},
  };
}

function parseProps(props: ComponentNode['props']): PropNode[] {
  return Object.entries(props ?? {}).map(([name, value]) => ({
    name,
    value: normalizeValue(value),
  }));
}

function normalizeValueRecord(value: unknown): Record<string, ValueNode> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, normalizeValue(nestedValue)]),
  );
}

function parseAction(action: unknown): ActionNode {
  const record = isPlainObject(action) ? action : {};
  return {
    type: typeof record.type === 'string' ? record.type : 'unknown',
    field: typeof record.field === 'string' ? record.field : undefined,
    method: typeof record.method === 'string' ? record.method : undefined,
    kind: typeof record.kind === 'string' ? record.kind : undefined,
    level: typeof record.level === 'string' ? record.level : undefined,
    resultTo: typeof record.resultTo === 'string' ? record.resultTo : undefined,
    itemVar: typeof record.itemVar === 'string' ? record.itemVar : undefined,
    indexVar: typeof record.indexVar === 'string' ? record.indexVar : undefined,
    ms: typeof record.ms === 'number' ? record.ms : undefined,
    merge: typeof record.merge === 'boolean' ? record.merge : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
    showError: typeof record.showError === 'boolean' ? record.showError : undefined,
    placement: typeof record.placement === 'string' ? record.placement : undefined,
    duration: typeof record.duration === 'number' ? record.duration : undefined,
    value: record.value !== undefined ? normalizeValue(record.value) : undefined,
    url: record.url !== undefined ? normalizeValue(record.url) : undefined,
    to: record.to !== undefined ? normalizeValue(record.to) : undefined,
    content: record.content !== undefined ? normalizeValue(record.content) : undefined,
    title: record.title !== undefined ? normalizeValue(record.title) : undefined,
    condition: record.condition !== undefined ? normalizeValue(record.condition) : undefined,
    over: record.over !== undefined ? normalizeValue(record.over) : undefined,
    body: record.body !== undefined ? normalizeValue(record.body) : undefined,
    headers: normalizeValueRecord(record.headers),
    params: normalizeValueRecord(record.params),
    actions: Array.isArray(record.actions)
      ? record.actions.map((item) => parseAction(item))
      : undefined,
    then: Array.isArray(record.then) ? record.then.map((item) => parseAction(item)) : undefined,
    else: Array.isArray(record.else) ? record.else.map((item) => parseAction(item)) : undefined,
    onSuccess: Array.isArray(record.onSuccess)
      ? record.onSuccess.map((item) => parseAction(item))
      : undefined,
    onError: Array.isArray(record.onError)
      ? record.onError.map((item) => parseAction(item))
      : undefined,
    onOk: Array.isArray(record.onOk) ? record.onOk.map((item) => parseAction(item)) : undefined,
    onCancel: Array.isArray(record.onCancel)
      ? record.onCancel.map((item) => parseAction(item))
      : undefined,
    flow: typeof record.flow === 'string' ? record.flow : undefined,
    input: record.input !== undefined ? normalizeValue(record.input) : undefined,
  };
}

function parseEvents(events: ComponentNode['events']): EventBindingNode[] {
  return Object.entries(events ?? {}).map(([eventName, actions]) => ({
    eventName,
    actions: Array.isArray(actions) ? actions.map((action) => parseAction(action)) : [],
  }));
}

function valueNodeUsesPageState(value: ValueNode | undefined): boolean {
  if (!value) return false;

  switch (value.kind) {
    case 'expression':
      return collectInlineExpressionIdentifiers(value.code).has('state');
    case 'template':
      return value.parts.some(
        (part) => part.kind === 'expression' && valueNodeUsesPageState(part.value),
      );
    case 'array':
      return value.items.some(valueNodeUsesPageState);
    case 'object':
      return value.properties.some((property) => valueNodeUsesPageState(property.value));
    default:
      return false;
  }
}

function actionUsesPageState(action: ActionNode, includeExpressionReferences: boolean): boolean {
  if (action.field?.startsWith('state.') || action.resultTo?.startsWith('state.')) {
    return true;
  }

  if (includeExpressionReferences) {
    for (const value of [
      action.value,
      action.url,
      action.to,
      action.content,
      action.title,
      action.condition,
      action.over,
      action.body,
    ]) {
      if (valueNodeUsesPageState(value)) return true;
    }

    for (const values of [action.headers, action.params]) {
      if (Object.values(values ?? {}).some(valueNodeUsesPageState)) return true;
    }
  }

  return [
    action.actions,
    action.then,
    action.else,
    action.onSuccess,
    action.onError,
    action.onOk,
    action.onCancel,
  ].some(
    (actions) =>
      actions?.some((nestedAction) =>
        actionUsesPageState(nestedAction, includeExpressionReferences),
      ) ?? false,
  );
}

function componentUsesPageState(
  component: FlatComponentNode,
  includeExpressionReferences: boolean,
): boolean {
  return (
    (includeExpressionReferences &&
      component.props.some((prop) => valueNodeUsesPageState(prop.value))) ||
    component.events.some((event) =>
      event.actions.some((action) => actionUsesPageState(action, includeExpressionReferences)),
    )
  );
}

function componentDeclaresLegacyStateField(component: FlatComponentNode): boolean {
  const fieldProp = component.props.find((prop) => prop.name === 'field');
  if (
    fieldProp?.value.kind === 'literal' &&
    typeof fieldProp.value.value === 'string' &&
    resolveFieldName(fieldProp.value.value, 'field') === 'state'
  ) {
    return true;
  }

  const initialValue = component.props.find((prop) => prop.name === 'initialValue')?.value;
  const visibleProp = component.props.find((prop) => prop.name === 'visible')?.value;
  return Boolean(
    initialValue &&
    visibleProp?.kind === 'literal' &&
    visibleProp.value === false &&
    component.childIds.length === 0 &&
    resolveFieldName(component.id, 'hiddenData') === 'state',
  );
}

function parseFlatComponent(componentId: string, component: ComponentNode): FlatComponentNode {
  return {
    id: componentId,
    componentType: component.type,
    props: parseProps(component.props),
    events: parseEvents(component.events),
    childIds: Array.isArray(component.childrenIds) ? [...component.childrenIds] : [],
  };
}

function cloneActionNode(action: ActionNode): ActionNode {
  return {
    ...action,
    headers: action.headers ? { ...action.headers } : undefined,
    params: action.params ? { ...action.params } : undefined,
    actions: action.actions?.map((nested) => cloneActionNode(nested)),
    then: action.then?.map((nested) => cloneActionNode(nested)),
    else: action.else?.map((nested) => cloneActionNode(nested)),
    onSuccess: action.onSuccess?.map((nested) => cloneActionNode(nested)),
    onError: action.onError?.map((nested) => cloneActionNode(nested)),
    onOk: action.onOk?.map((nested) => cloneActionNode(nested)),
    onCancel: action.onCancel?.map((nested) => cloneActionNode(nested)),
  };
}

function buildComponentTree(
  componentId: string,
  componentMap: Map<string, FlatComponentNode>,
  path: Set<string>,
): ParseTreeNode {
  if (path.has(componentId)) {
    return { kind: 'cycle', id: componentId };
  }

  const flatComponent = componentMap.get(componentId);
  if (!flatComponent) {
    return { kind: 'missing', id: componentId };
  }

  const nextPath = new Set(path);
  nextPath.add(componentId);

  return {
    kind: 'component',
    id: flatComponent.id,
    componentType: flatComponent.componentType,
    props: flatComponent.props.map((prop) => ({ ...prop })),
    events: flatComponent.events.map((event) => ({
      eventName: event.eventName,
      actions: event.actions.map((action) => cloneActionNode(action)),
    })),
    children: flatComponent.childIds.map((childId) =>
      buildComponentTree(childId, componentMap, nextPath),
    ),
  };
}

export function parseSchema(schema: PageSchema, options?: CompileOptions): RootNode {
  const optionsConfig = createCompileOptions(options);
  const flatComponents = Object.entries(schema.components ?? {}).map(([componentId, component]) =>
    parseFlatComponent(componentId, component),
  );
  const componentMap = new Map(flatComponents.map((component) => [component.id, component]));

  const children = schema.rootId
    ? [buildComponentTree(schema.rootId, componentMap, new Set<string>())]
    : [];
  const hasLegacyStateField = flatComponents.some(componentDeclaresLegacyStateField);
  const usesComputed = schema.logic?.computed !== undefined;
  let computedAnalysis: ComputedLogicAnalysis | undefined;
  if (usesComputed) {
    const result = analyzeComputedDeclarations(schema.logic);
    if (!result.ok) throw new SchemaValidationError(result.issues);
    computedAnalysis = result.value;
  }

  const usesFlows = schema.logic?.flows !== undefined;
  let flowAnalysis: ActionFlowAnalysis | undefined;
  let flowDeclarations: FlowDeclarationNode[] | undefined;
  let flowExecutionLimits: FlowExecutionLimits | undefined;
  if (usesFlows) {
    flowExecutionLimits = normalizeFlowExecutionLimits(options?.flowExecutionLimits);
    const result = analyzeActionFlowDeclarations(
      schema.logic!.flows,
      undefined,
      ['logic', 'flows'],
      { allowLegacyNestedStateTargets: schema.logic?.states === undefined },
    );
    if (!result.ok) throw new SchemaValidationError(result.issues);
    flowAnalysis = result.value;
    flowDeclarations = Object.entries(flowAnalysis.flows).map(([key, flow]) => ({
      key,
      steps: flow.steps.map((item) => parseAction(item)),
      onError: flow.onError ? flow.onError.map((item) => parseAction(item)) : undefined,
    }));
  }

  return {
    type: 'root',
    schema,
    options: optionsConfig,
    flatComponents,
    children,
    imports: new Map(),
    fields: [],
    handlers: [],
    helpers: new Set(),
    usesComputed,
    usesFlows,
    ...(computedAnalysis ? { computedAnalysis } : {}),
    ...(flowAnalysis ? { flowAnalysis } : {}),
    ...(flowDeclarations ? { flows: flowDeclarations } : {}),
    ...(flowExecutionLimits ? { flowExecutionLimits } : {}),
    usesPageState:
      usesComputed ||
      usesFlows ||
      schema.logic?.states !== undefined ||
      flatComponents.some((component) => componentUsesPageState(component, !hasLegacyStateField)),
  };
}

function findProp(
  component: FlatComponentNode | ResolvedComponentNode,
  name: string,
): PropNode | undefined {
  return component.props.find((prop) => prop.name === name);
}

function createFieldInfo(
  name: string,
  sourceKey: string,
  source: FieldInfo['source'],
  initialValue: ValueNode,
): FieldInfo {
  return {
    name,
    setterName: createSetterName(name),
    sourceKey,
    source,
    initialValue,
  };
}

function registerField(ctx: TransformContext, field: FieldInfo) {
  if (ctx.fieldBySourceKey.has(field.sourceKey)) {
    return;
  }
  const candidate = field.name;
  const setter = createSetterName(candidate);
  ctx.registry.assertAvailable(candidate, `field:${field.sourceKey}`);
  ctx.registry.assertAvailable(setter, `setter:${field.sourceKey}`);
  ctx.registry.reserveExact(candidate, `field:${field.sourceKey}`);
  ctx.registry.reserveExact(setter, `setter:${field.sourceKey}`);
  ctx.fieldBySourceKey.set(field.sourceKey, field);
  ctx.fieldByName.set(field.name, field);
  ctx.fields.push(field);
}

function resolveFieldName(sourceKey: string, source: FieldInfo['source']): string {
  // 禁止危险名称在规范化过程中被洗白，保留原名交 registerField/registry 明确抛错（__proto__→_Proto__ 等）
  if (RESERVED_GENERATED_IDENTIFIERS.has(sourceKey) || BUILTIN_IDENTIFIERS.has(sourceKey)) {
    return sourceKey;
  }
  let candidate: string;
  if (source === 'hiddenData') {
    candidate = isValidIdentifier(sourceKey) ? sourceKey : toSafeIdentifier(sourceKey);
  } else {
    const camel = toCamelCase(sourceKey);
    if (camel && isValidIdentifier(camel)) {
      candidate = camel;
    } else {
      candidate = toSafeIdentifier(camel || sourceKey) || 'fieldValue';
    }
  }
  if (!candidate) candidate = 'fieldValue';
  if (!isValidIdentifier(candidate)) {
    candidate = toSafeIdentifier(candidate) || 'fieldValue';
  }
  // Keep reserved/builtin as-is so registerField can throw with proper owner info instead of silently renaming
  if (RESERVED_GENERATED_IDENTIFIERS.has(candidate) || BUILTIN_IDENTIFIERS.has(candidate)) {
    return candidate;
  }
  if (!isSafeGeneratedIdentifier(candidate)) {
    const sanitized = toSafeIdentifier(candidate) || 'fieldValue';
    if (isSafeGeneratedIdentifier(sanitized)) {
      candidate = sanitized;
    } else {
      const fallback = `${candidate}_`;
      if (isSafeGeneratedIdentifier(fallback)) {
        candidate = fallback;
      } else {
        candidate = `field_${toSafeIdentifier(sourceKey) || 'value'}`;
        if (!isSafeGeneratedIdentifier(candidate)) candidate = 'fieldValue';
      }
    }
  }
  if (!isSafeGeneratedIdentifier(candidate)) {
    candidate = 'fieldValue';
  }
  return candidate;
}

function resolveFieldNameForContext(
  ctx: TransformContext,
  sourceKey: string,
  source: FieldInfo['source'],
): string {
  const preferredName = resolveFieldName(sourceKey, source);
  if (
    !ctx.root.usesPageState ||
    (preferredName !== 'state' &&
      preferredName !== 'setState' &&
      createSetterName(preferredName) !== 'setState')
  ) {
    return preferredName;
  }

  throw new Error(
    `Field "${sourceKey}" conflicts with the reserved Page State binding; rename the field before enabling logic.states`,
  );
}

function collectFields(ctx: TransformContext) {
  for (const component of ctx.root.flatComponents) {
    const fieldProp = findProp(component, 'field');
    if (
      fieldProp &&
      fieldProp.value.kind === 'literal' &&
      typeof fieldProp.value.value === 'string'
    ) {
      const rawFieldName = fieldProp.value.value;
      const initialValue = findProp(component, 'defaultValue')?.value ??
        findProp(component, 'value')?.value ??
        findProp(component, 'initialValue')?.value ?? { kind: 'literal', value: '' as const };

      registerField(
        ctx,
        createFieldInfo(
          resolveFieldNameForContext(ctx, rawFieldName, 'field'),
          rawFieldName,
          'field',
          initialValue,
        ),
      );
      continue;
    }

    const initialValue = findProp(component, 'initialValue')?.value;
    const visibleProp = findProp(component, 'visible')?.value;
    if (
      initialValue &&
      visibleProp?.kind === 'literal' &&
      visibleProp.value === false &&
      component.childIds.length === 0
    ) {
      registerField(
        ctx,
        createFieldInfo(
          resolveFieldNameForContext(ctx, component.id, 'hiddenData'),
          component.id,
          'hiddenData',
          initialValue,
        ),
      );
    }
  }
}

function addImport(
  ctx: TransformContext,
  source: string,
  exportName: string,
  localName = exportName,
) {
  if (ctx.root.usesComputed && COMPUTED_RUNTIME_INTRINSICS.has(localName)) {
    throw new Error(
      `Import binding "${localName}" conflicts with the reserved Computed runtime intrinsic`,
    );
  }
  if (!ctx.imports.has(source)) {
    ctx.imports.set(source, new Set());
  }
  const set = ctx.imports.get(source);
  const specifier = exportName === localName ? exportName : `${exportName} as ${localName}`;
  if (set?.has(specifier)) return;
  set?.add(specifier);
  if (!ctx.registry.has(localName)) {
    ctx.registry.reserveExact(localName, `import:${localName}`);
  }
}

function collectImports(ctx: TransformContext) {
  ctx.imports.set('react', new Set(['useState']));
  if (!ctx.registry.has('useState')) ctx.registry.reserveExact('useState', 'import:useState');
  if (ctx.root.usesComputed) {
    addImport(ctx, 'react', 'useMemo');
    addImport(ctx, 'react', 'useRef');
  }
  if (ctx.root.usesFlows) {
    addImport(ctx, 'react', 'useRef');
    addImport(ctx, 'react', 'useEffect');
  }
  ctx.imports.set(ctx.root.options.defaultLibrary, new Set(['message']));
  if (!ctx.registry.has('message')) ctx.registry.reserveExact('message', 'import:message');

  for (const component of ctx.root.flatComponents) {
    if (!isSafeComponentType(component.componentType)) {
      continue;
    }
    const binding = ctx.root.options.componentBindings[component.componentType];
    const legacySource = ctx.root.options.componentSources[component.componentType];
    if (!binding && !legacySource && !ctx.root.options.allowDefaultComponentFallback) {
      throw new Error(`Unsupported component type for compiler preset: ${component.componentType}`);
    }
    const source = binding?.module || legacySource || ctx.root.options.defaultLibrary;
    addImport(ctx, source, binding?.exportName || component.componentType, component.componentType);
  }
}

function preCollectAllActionImports(ctx: TransformContext) {
  for (const component of ctx.root.flatComponents) {
    for (const event of component.events) {
      collectActionImports(event.actions, ctx);
    }
  }
  if (ctx.root.flows) {
    for (const flow of ctx.root.flows) {
      collectActionImports(flow.steps, ctx);
      if (flow.onError) collectActionImports(flow.onError, ctx);
    }
  }
}

function collectActionImports(actions: ActionNode[], ctx: TransformContext) {
  for (const action of actions) {
    if (action.type === 'feedback' && action.kind === 'notification') {
      addImport(ctx, ctx.root.options.defaultLibrary, 'notification');
    }
    if (action.type === 'dialog') {
      addImport(ctx, ctx.root.options.defaultLibrary, 'Modal');
    }

    for (const nestedList of [
      action.actions,
      action.then,
      action.else,
      action.onSuccess,
      action.onError,
      action.onOk,
      action.onCancel,
    ]) {
      if (nestedList) {
        collectActionImports(nestedList, ctx);
      }
    }
  }
}

function createTransformContext(root: RootNode): TransformContext {
  const registry = new GeneratedIdentifierRegistry();
  for (const name of RESERVED_GENERATED_IDENTIFIERS) {
    registry.reserveExact(name, `reserved:${name}`);
  }
  for (const name of BUILTIN_IDENTIFIERS) {
    // avoid double-reserve if already in RESERVED (none overlap but keep safe)
    if (!registry.has(name)) registry.reserveExact(name, `builtin:${name}`);
  }
  if (root.usesPageState) {
    registry.reserveExact('state', 'page-state');
    registry.reserveExact('setState', 'page-state-setter');
  }
  if (root.usesComputed) {
    registry.reserveExact('computed', 'page-computed');
    registry.reserveExact('computePageLogic', 'page-computed-evaluator');
    registry.reserveExact('stateRef', 'page-state-ref');
    registry.reserveExact('computedRef', 'page-computed-ref');
    for (const name of COMPUTED_RUNTIME_INTRINSICS) {
      registry.reserveExact(name, 'page-computed-intrinsic');
    }
  } else if (root.usesFlows) {
    registry.reserveExact('stateRef', 'page-state-ref');
  }
  if (root.usesFlows) {
    registry.reserveExact('FlowExecutionError', 'flow:error-class');
    registry.reserveExact('isNonRecoverableFlowErrorCode', 'flow:non-recoverable-check');
    registry.reserveExact('isolateFlowInput', 'flow:isolate-input');
    registry.reserveExact('buildRequestUrl', 'flow:build-request-url');
    registry.reserveExact('flowAbortControllerRef', 'flow:abort-controller-ref');
    registry.reserveExact('activeFlowControllersRef', 'flow:active-controllers-ref');
    registry.reserveExact('flowRegistry', 'flow:registry');
    registry.reserveExact('executeChildFlow', 'flow:child-flow-executor');
    registry.reserveExact('executeFlow', 'flow:root-flow-executor');
  }
  const reservedHandlerNames = new Set(root.handlers.map((handler) => handler.name));
  for (const name of reservedHandlerNames) {
    if (!registry.has(name)) registry.reserveExact(name, `handler:${name}`);
  }
  return {
    root,
    imports: root.imports,
    fields: root.fields,
    handlers: root.handlers,
    fieldBySourceKey: new Map(),
    fieldByName: new Map(),
    reservedHandlerNames,
    registry,
  };
}

function toPascalIdentifier(value: string, fallback: string): string {
  const normalized = toSafeIdentifier(toCamelCase(value));
  const safeValue = normalized || fallback;
  return `${safeValue.charAt(0).toUpperCase()}${safeValue.slice(1)}`;
}

function createEventHandlerName(componentId: string, eventName: string): string {
  const componentPart = toPascalIdentifier(componentId, 'Component');
  const rawEventName =
    eventName.startsWith('on') && eventName.length > 2 ? eventName.slice(2) : eventName;
  const eventPart = toPascalIdentifier(rawEventName, 'Event');
  return `handle${componentPart}${eventPart}`;
}

function reserveHandlerName(
  ctx: TransformContext,
  baseName: string,
  unavailableNames: ReadonlySet<string> = new Set(),
): string {
  const owner = `handler:${baseName}`;
  if (!ctx.registry.has(baseName) && !unavailableNames.has(baseName)) {
    ctx.registry.reserveExact(baseName, owner);
    ctx.reservedHandlerNames.add(baseName);
    return baseName;
  }
  let suffix = 2;
  let allocated = `${baseName}_${suffix}`;
  while (ctx.registry.has(allocated) || unavailableNames.has(allocated)) {
    suffix += 1;
    allocated = `${baseName}_${suffix}`;
  }
  ctx.registry.reserveExact(allocated, owner);
  ctx.reservedHandlerNames.add(allocated);
  return allocated;
}

function createHandlerCode(
  handlerName: string,
  bodyCode: string,
  isAsync: boolean,
  params: string[],
  usesComputed: boolean,
  usesFlows: boolean,
): string {
  const asyncKeyword = isAsync ? 'async ' : '';
  const parameterCode = params.join(', ');
  const logicPrologue = usesComputed
    ? 'let state = stateRef.current;\nlet computed = computedRef.current;'
    : usesFlows
      ? 'let state = stateRef.current;'
      : '';
  const handlerBody = [logicPrologue, bodyCode].filter(Boolean).join('\n');
  return `const ${handlerName} = ${asyncKeyword}(${parameterCode}) => {\n${indentBlock(handlerBody)}\n};`;
}

function registerHandler(
  baseName: string,
  ctx: TransformContext,
  params: string[],
  build: (handlerName: string) => { code: string; async: boolean },
  unavailableNames: ReadonlySet<string> = new Set(),
): { name: string; async: boolean } {
  const handlerName = reserveHandlerName(ctx, baseName, unavailableNames);
  const handler: HandlerDeclaration = {
    name: handlerName,
    code: '',
  };
  ctx.handlers.push(handler);

  const built = build(handlerName);
  handler.code = createHandlerCode(
    handlerName,
    built.code,
    built.async,
    params,
    ctx.root.usesComputed,
    ctx.root.usesFlows,
  );

  return {
    name: handlerName,
    async: built.async,
  };
}

function registerEventHandler(
  componentId: string,
  eventName: string,
  actions: ActionNode[],
  ctx: TransformContext,
  localScope: Set<string> = new Set(),
): string {
  return registerHandler(createEventHandlerName(componentId, eventName), ctx, [], (handlerName) =>
    buildActionBlock(actions, ctx, handlerName, localScope),
  ).name;
}

function registerNestedActionHandler(
  parentHandlerName: string,
  suffix: string,
  actions: ActionNode[],
  ctx: TransformContext,
  params: string[] = [],
  localScope: Set<string> = new Set(),
): { name: string; async: boolean } {
  return registerHandler(
    `${parentHandlerName}${suffix}`,
    ctx,
    params,
    (handlerName) => buildActionBlock(actions, ctx, handlerName, localScope),
    localScope,
  );
}

function registerNestedCodeHandler(
  parentHandlerName: string,
  suffix: string,
  ctx: TransformContext,
  params: string[],
  build: (handlerName: string) => { code: string; async: boolean },
  unavailableNames: ReadonlySet<string> = new Set(),
): { name: string; async: boolean } {
  return registerHandler(`${parentHandlerName}${suffix}`, ctx, params, build, unavailableNames);
}

function collectValueLocalReferences(
  value: ValueNode | undefined,
  visibleLocals: ReadonlySet<string>,
  referenced: Set<string>,
): void {
  if (!value) return;
  if (value.kind === 'expression') {
    for (const name of collectInlineExpressionIdentifiers(value.code)) {
      if (visibleLocals.has(name)) referenced.add(name);
    }
    return;
  }
  if (value.kind === 'template') {
    for (const part of value.parts) {
      if (part.kind === 'expression') {
        collectValueLocalReferences(part.value, visibleLocals, referenced);
      }
    }
    return;
  }
  if (value.kind === 'array') {
    for (const item of value.items) {
      collectValueLocalReferences(item, visibleLocals, referenced);
    }
    return;
  }
  if (value.kind === 'object') {
    for (const property of value.properties) {
      collectValueLocalReferences(property.value, visibleLocals, referenced);
    }
  }
}

function collectActionLocalReferences(
  actions: readonly ActionNode[],
  visibleLocals: ReadonlySet<string>,
  referenced: Set<string>,
): void {
  for (const action of actions) {
    for (const value of [
      action.value,
      action.url,
      action.to,
      action.content,
      action.title,
      action.condition,
      action.over,
      action.body,
    ]) {
      collectValueLocalReferences(value, visibleLocals, referenced);
    }
    for (const record of [action.headers, action.params]) {
      for (const value of Object.values(record ?? {})) {
        collectValueLocalReferences(value, visibleLocals, referenced);
      }
    }

    for (const nested of [action.then, action.else, action.onOk, action.onCancel]) {
      if (nested) collectActionLocalReferences(nested, visibleLocals, referenced);
    }

    if (action.type === 'loop' && action.actions) {
      const nestedLocals = new Set(visibleLocals);
      nestedLocals.delete(action.itemVar ?? 'item');
      if (action.indexVar !== undefined) nestedLocals.delete(action.indexVar);
      collectActionLocalReferences(action.actions, nestedLocals, referenced);
    } else if (action.actions) {
      collectActionLocalReferences(action.actions, visibleLocals, referenced);
    }

    if (action.onSuccess) {
      const successLocals = new Set(visibleLocals);
      successLocals.delete('response');
      collectActionLocalReferences(action.onSuccess, successLocals, referenced);
    }
    if (action.onError) {
      const errorLocals = new Set(visibleLocals);
      errorLocals.delete('error');
      collectActionLocalReferences(action.onError, errorLocals, referenced);
    }
  }
}

function actionListUsesGeneratedBinding(
  actions: readonly ActionNode[],
  ctx: TransformContext,
  bindingName: string,
): boolean {
  for (const action of actions) {
    if (action.type === 'setValue' && action.field) {
      const fieldInfo = getFieldInfo(ctx, action.field);
      if (fieldInfo?.setterName === bindingName) return true;
    }
    for (const nested of [action.then, action.else]) {
      if (nested && actionListUsesGeneratedBinding(nested, ctx, bindingName)) return true;
    }
    if (action.type === 'loop' && action.actions) {
      const shadowsBinding =
        (action.itemVar ?? 'item') === bindingName || action.indexVar === bindingName;
      if (!shadowsBinding && actionListUsesGeneratedBinding(action.actions, ctx, bindingName)) {
        return true;
      }
    } else if (action.actions && actionListUsesGeneratedBinding(action.actions, ctx, bindingName)) {
      return true;
    }
  }
  return false;
}

function getCapturedLocals(
  actions: readonly ActionNode[],
  localScope: Set<string>,
  ctx: TransformContext,
  shadowedNames: readonly string[] = [],
  additionalGeneratedBindings: ReadonlySet<string> = new Set(),
): string[] {
  const visibleLocals = new Set(localScope);
  for (const name of shadowedNames) visibleLocals.delete(name);
  const referenced = new Set<string>();
  collectActionLocalReferences(actions, visibleLocals, referenced);
  const captured = Array.from(localScope).filter((name) => referenced.has(name));
  for (const name of captured) {
    if (
      additionalGeneratedBindings.has(name) ||
      actionListUsesGeneratedBinding(actions, ctx, name)
    ) {
      throw new Error(`回调捕获变量 "${name}" 与生成标识符冲突`);
    }
  }
  return captured;
}

function buildCallbackReference(
  handlerName: string,
  runtimeParams: readonly string[],
  capturedLocals: readonly string[],
): string {
  if (capturedLocals.length === 0) {
    return handlerName;
  }
  const args = [...runtimeParams, ...capturedLocals];
  return `(${runtimeParams.join(', ')}) => ${handlerName}(${args.join(', ')})`;
}

function getFieldInfo(ctx: TransformContext, sourceKey: string): FieldInfo | undefined {
  return ctx.fieldBySourceKey.get(sourceKey) ?? ctx.fieldByName.get(sourceKey);
}

function getExpressionContextFields(ctx: TransformContext): Set<string> {
  const fields = new Set(ctx.fieldByName.keys());
  if (ctx.root.usesPageState) {
    fields.add('state');
  }
  if (ctx.root.usesComputed) fields.add('computed');
  return fields;
}

function getExpressionCode(
  value: ValueNode | undefined,
  fallback = 'undefined',
  ctxFields?: Set<string>,
  localScope?: Set<string>,
): string {
  if (!value) return fallback;

  switch (value.kind) {
    case 'literal':
      if (typeof value.value === 'string') return toQuotedString(value.value);
      if (value.value === undefined) return 'undefined';
      return String(value.value);
    case 'expression': {
      const code = value.code.trim();
      if (!code) return fallback;
      const valid =
        value.source === 'legacy'
          ? isValidExpressionPath(code)
          : isSafeInlineExpression(code, ctxFields, localScope);
      return valid ? code : fallback;
    }
    case 'template':
      return `\`${value.parts
        .map((part) =>
          part.kind === 'text'
            ? escapeTemplateText(part.value)
            : `\${${getExpressionCode(part.value, '""', ctxFields, localScope)}}`,
        )
        .join('')}\``;
    case 'array':
      return `[${value.items.map((item) => getExpressionCode(item, 'undefined', ctxFields, localScope)).join(', ')}]`;
    case 'object':
      return `{ ${value.properties
        .map(
          (property) =>
            `${toObjectKeyCode(property.key)}: ${getExpressionCode(property.value, 'undefined', ctxFields, localScope)}`,
        )
        .join(', ')} }`;
    default:
      return fallback;
  }
}

function getJsonLiteralCode(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return toQuotedString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => getJsonLiteralCode(item)).join(', ')}]`;
  }

  return `{ ${Object.entries(value)
    .map(([key, nestedValue]) => {
      const keyCode = key === '__proto__' ? `[${toQuotedString(key)}]` : toObjectKeyCode(key);
      return `${keyCode}: ${getJsonLiteralCode(nestedValue)}`;
    })
    .join(', ')} }`;
}

function canCompileStaticStyle(value: ValueNode): value is ObjectValueNode {
  if (value.kind !== 'object') {
    return false;
  }

  return value.properties.every((property) => isStaticValue(property.value));
}

function isStaticValue(value: ValueNode): boolean {
  if (value.kind === 'expression' || value.kind === 'template') {
    return false;
  }
  if (value.kind === 'array') {
    return value.items.every((item) => isStaticValue(item));
  }
  if (value.kind === 'object') {
    return value.properties.every((property) => isStaticValue(property.value));
  }
  return true;
}

function valueNodeToPlain(value: ValueNode): unknown {
  switch (value.kind) {
    case 'literal':
      return value.value;
    case 'array':
      return value.items.map((item) => valueNodeToPlain(item));
    case 'object':
      return Object.fromEntries(
        value.properties.map((property) => [property.key, valueNodeToPlain(property.value)]),
      );
    case 'expression':
      return value.source === 'legacy' ? { __expr: true, code: value.code } : `{{${value.code}}}`;
    case 'template':
      return value.raw;
    default:
      return undefined;
  }
}

function createAttribute(
  name: string,
  value: ValueNode,
  fallback = 'undefined',
  ctxFields?: Set<string>,
  localScope?: Set<string>,
): JSXAttributeNode {
  if (value.kind === 'literal' && typeof value.value === 'string') {
    return {
      name,
      mode: 'string',
      value: value.value,
    };
  }

  return {
    name,
    mode: 'expression',
    value: getExpressionCode(value, fallback, ctxFields, localScope),
  };
}

function createValueChild(
  value: ValueNode,
  ctxFields?: Set<string>,
  localScope?: Set<string>,
): JSXNode | null {
  if (value.kind === 'literal') {
    if (value.value === null || value.value === undefined) {
      return null;
    }
    if (typeof value.value === 'string') {
      return { kind: 'text', value: value.value };
    }
    return { kind: 'expression', code: getExpressionCode(value, 'null', ctxFields, localScope) };
  }

  return {
    kind: 'expression',
    code: getExpressionCode(value, '""', ctxFields, localScope),
  };
}

function buildFieldBinding(fieldInfo: FieldInfo): JSXAttributeNode[] {
  return [
    {
      name: 'value',
      mode: 'expression',
      value: fieldInfo.name,
    },
    {
      name: 'onChange',
      mode: 'expression',
      value: `e => ${fieldInfo.setterName}(e.target ? e.target.value : e)`,
    },
  ];
}

function buildLabelWrapper(label: string, componentNode: JSXNode): JSXElementNode {
  return {
    kind: 'element',
    tag: 'div',
    attributes: [
      {
        name: 'style',
        mode: 'expression',
        value: `{ marginBottom: ${LABEL_WRAPPER_MARGIN_BOTTOM} }`,
      },
    ],
    children: [
      {
        kind: 'element',
        tag: 'label',
        attributes: [
          {
            name: 'style',
            mode: 'expression',
            value: `{ display: ${toQuotedString(LABEL_DISPLAY)}, marginBottom: ${LABEL_MARGIN_BOTTOM} }`,
          },
        ],
        children: [{ kind: 'text', value: label }],
      },
      componentNode,
    ],
  };
}

function createCommentNode(text: string): JSXCommentNode {
  return { kind: 'comment', text };
}

function createMissingNode(componentId: string): JSXElementNode {
  return {
    kind: 'element',
    tag: 'div',
    attributes: [
      {
        name: 'style',
        mode: 'expression',
        value: '{ color: "red" }',
      },
    ],
    children: [{ kind: 'text', value: `Node ${componentId} Not Found` }],
  };
}

function buildComponentNode(node: ParseTreeNode, ctx: TransformContext): JSXNode {
  if (node.kind === 'missing') {
    return createMissingNode(node.id);
  }

  if (node.kind === 'cycle') {
    return {
      kind: 'fragment',
      children: [createCommentNode('Circular reference omitted')],
    };
  }

  if (!isSafeComponentType(node.componentType)) {
    return {
      kind: 'element',
      tag: 'div',
      attributes: [
        {
          name: 'style',
          mode: 'expression',
          value: '{ color: "red" }',
        },
      ],
      children: [{ kind: 'text', value: 'Invalid component' }],
    };
  }

  const ctxFields = getExpressionContextFields(ctx);
  const fieldProp = findProp(node, 'field');
  const labelProp = findProp(node, 'label');
  const styleProp = findProp(node, 'style');
  const childrenProp = findProp(node, 'children');
  const visibleProp = findProp(node, 'visible');

  const attributes: JSXAttributeNode[] = [];

  for (const prop of node.props) {
    if (prop.name === 'style' || prop.name === 'children' || prop.name === 'visible') {
      continue;
    }
    if (prop.name === 'field') {
      continue;
    }
    if (prop.name === 'className') {
      continue;
    }
    if (prop.name === 'label' && node.componentType === 'Input') {
      continue;
    }
    if (!isSafePropName(prop.name)) {
      continue;
    }

    attributes.push(createAttribute(prop.name, prop.value, '""', ctxFields));
  }

  if (
    fieldProp &&
    fieldProp.value.kind === 'literal' &&
    typeof fieldProp.value.value === 'string'
  ) {
    const fieldInfo = getFieldInfo(ctx, fieldProp.value.value);
    if (fieldInfo) {
      attributes.push(...buildFieldBinding(fieldInfo));
    }
  }

  for (const event of node.events) {
    if (!isSafeEventName(event.eventName)) {
      continue;
    }
    collectActionImports(event.actions, ctx);
    event.handlerName = registerEventHandler(node.id, event.eventName, event.actions, ctx);
    attributes.push({
      name: event.eventName,
      mode: 'expression',
      value: event.handlerName,
    });
  }

  if (styleProp) {
    if (canCompileStaticStyle(styleProp.value)) {
      const compiled = compileStyle(valueNodeToPlain(styleProp.value) as Record<string, unknown>);
      const classNameProp = findProp(node, 'className');
      let finalClassName = compiled.className;
      if (compiled.className && classNameProp && isStaticStringValue(classNameProp.value)) {
        finalClassName = `${classNameProp.value.value} ${compiled.className}`;
      } else if (classNameProp && isStaticStringValue(classNameProp.value)) {
        finalClassName = classNameProp.value.value;
      }

      if (finalClassName) {
        attributes.push({
          name: 'className',
          mode: 'string',
          value: finalClassName,
        });
      }

      if (Object.keys(compiled.styleObj).length > 0) {
        attributes.push({
          name: 'style',
          mode: 'expression',
          value: getExpressionCode(normalizeValue(compiled.styleObj), '{}', ctxFields),
        });
      }
    } else {
      attributes.push({
        name: 'style',
        mode: 'expression',
        value: getExpressionCode(styleProp.value, '{}', ctxFields),
      });
    }
  } else {
    const classNameProp = findProp(node, 'className');
    if (classNameProp && isStaticStringValue(classNameProp.value)) {
      attributes.push({
        name: 'className',
        mode: 'string',
        value: classNameProp.value.value,
      });
    } else if (classNameProp) {
      attributes.push(createAttribute('className', classNameProp.value, '""', ctxFields));
    }
  }

  const children: JSXNode[] = [];
  if (node.children.length > 0) {
    for (const child of node.children) {
      children.push(buildComponentNode(child, ctx));
    }
  } else if (childrenProp) {
    const childNode = createValueChild(childrenProp.value, ctxFields);
    if (childNode) {
      children.push(childNode);
    }
  }

  let componentNode: JSXNode = {
    kind: 'element',
    tag: node.componentType,
    attributes,
    children,
  };

  if (
    labelProp &&
    labelProp.value.kind === 'literal' &&
    typeof labelProp.value.value === 'string' &&
    node.componentType === 'Input'
  ) {
    componentNode = buildLabelWrapper(labelProp.value.value, componentNode);
  }

  if (!visibleProp) {
    return componentNode;
  }

  const conditionCode = getExpressionCode(visibleProp.value, 'false', ctxFields);
  if (visibleProp.value.kind === 'literal' && visibleProp.value.value === true) {
    return componentNode;
  }

  return {
    kind: 'conditional',
    condition: conditionCode,
    consequent: componentNode,
  };
}

function needsAsync(actions: ActionNode[]): boolean {
  return actions.some((action) => {
    if (action.type === 'delay') {
      return true;
    }

    return [
      action.actions,
      action.then,
      action.else,
      action.onSuccess,
      action.onError,
      action.onOk,
      action.onCancel,
    ].some((nested) => (nested ? needsAsync(nested) : false));
  });
}

function resolveResultTarget(
  resultTo: string | undefined,
  ctx: TransformContext,
  valueCode: string,
): string {
  if (!resultTo) {
    return valueCode;
  }
  const sanitized = sanitizeResultTo(resultTo, ctx);
  if (!sanitized) {
    return `/* invalid resultTo discarded */`;
  }
  const fieldInfo = getFieldInfo(ctx, sanitized);
  if (fieldInfo) {
    return `${fieldInfo.setterName}(${valueCode});`;
  }
  if (sanitized.startsWith('state.')) {
    const statePath = sanitizeStatePath(
      sanitized.slice('state.'.length),
      !hasDeclaredPageState(ctx),
    );
    if (!statePath) {
      return `/* invalid resultTo discarded */`;
    }
    return getStateWriteCode(statePath, valueCode, ctx);
  }
  return `/* invalid resultTo discarded */`;
}

function buildActionBlock(
  actions: ActionNode[],
  ctx: TransformContext,
  ownerHandlerName: string,
  localScope: Set<string> = new Set(),
): { code: string; async: boolean } {
  const segments = actions.map((action) =>
    buildActionStatement(action, ctx, ownerHandlerName, localScope),
  );
  const refreshCode = ctx.root.usesComputed
    ? 'state = stateRef.current;\ncomputed = computedRef.current;'
    : ctx.root.usesFlows
      ? 'state = stateRef.current;'
      : '';
  return {
    code: segments
      .map((segment) => [refreshCode, segment.code].filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n'),
    async: segments.some((segment) => segment.async),
  };
}

function getStateWriteCode(
  statePath: readonly string[],
  valueCode: string,
  ctx: TransformContext,
): string {
  const nextStateCode =
    statePath.length === 1
      ? `({ ...state, ${toObjectKeyCode(statePath[0])}: ${valueCode} })`
      : getNestedStateUpdateCode(statePath, valueCode);
  if (!ctx.root.usesComputed && !ctx.root.usesFlows) {
    return `setState((state) => ${nextStateCode});`;
  }
  if (ctx.root.usesComputed) {
    return `state = ${nextStateCode};
computed = computePageLogic(state);
stateRef.current = state;
computedRef.current = computed;
setState(state);`;
  }
  return `state = ${nextStateCode};
stateRef.current = state;
setState(state);`;
}

function buildNotificationObject(
  action: ActionNode,
  ctxFields?: Set<string>,
  localScope?: Set<string>,
): string {
  const props: string[] = [
    `message: ${getExpressionCode(action.title ?? { kind: 'literal', value: '通知' }, '"通知"', ctxFields, localScope)}`,
    `description: ${getExpressionCode(action.content ?? { kind: 'literal', value: '' }, '""', ctxFields, localScope)}`,
  ];

  if (action.placement) {
    props.push(`placement: ${toQuotedString(action.placement)}`);
  }
  if (typeof action.duration === 'number') {
    props.push(`duration: ${action.duration}`);
  }

  return `{ ${props.join(', ')} }`;
}

function buildActionStatement(
  action: ActionNode,
  ctx: TransformContext,
  ownerHandlerName: string,
  localScope: Set<string> = new Set(),
): { code: string; async: boolean } {
  const ctxFields = getExpressionContextFields(ctx);
  switch (action.type) {
    case 'setValue': {
      const valueCode = getExpressionCode(
        action.value ?? { kind: 'literal', value: '' },
        'undefined',
        ctxFields,
        localScope,
      );
      if (action.field) {
        const fieldInfo = getFieldInfo(ctx, action.field);
        if (fieldInfo) {
          if (action.merge) {
            return {
              code: `${fieldInfo.setterName}(prev => ({ ...prev, ...${valueCode} }));`,
              async: false,
            };
          }
          return { code: `${fieldInfo.setterName}(${valueCode});`, async: false };
        }

        if (action.field.startsWith('state.')) {
          const statePath = sanitizeStatePath(
            action.field.slice('state.'.length),
            !hasDeclaredPageState(ctx),
          );
          if (statePath) {
            const currentValueCode = getStatePathValueCode(statePath);
            const nextValueCode = action.merge
              ? getMergedStateValueCode(currentValueCode, valueCode)
              : valueCode;
            return {
              code: getStateWriteCode(statePath, nextValueCode, ctx),
              async: false,
            };
          }
          return { code: `/* invalid field discarded */`, async: false };
        }

        return { code: `/* Field not found */`, async: false };
      }

      return { code: '/* setValue missing field */', async: false };
    }
    case 'apiCall': {
      const method = action.method || 'GET';
      const configParts = [`method: ${toQuotedString(method)}`];
      if (action.headers) {
        configParts.push(
          `headers: ${getExpressionCode(
            {
              kind: 'object',
              properties: Object.entries(action.headers).map(([key, value]) => ({ key, value })),
            },
            '{}',
            ctxFields,
            localScope,
          )}`,
        );
      }
      if (action.body) {
        configParts.push(
          `body: JSON.stringify(${getExpressionCode(action.body, 'undefined', ctxFields, localScope)})`,
        );
      }

      const urlCode = getExpressionCode(
        action.url ?? { kind: 'literal', value: '/' },
        '"/"',
        ctxFields,
        localScope,
      );
      const requestUrlVar = ctx.registry.allocateInternal('__requestUrl', 'api:url');
      let paramsCode = `const ${requestUrlVar} = ${urlCode};`;
      if (action.params) {
        const requestParamsVar = ctx.registry.allocateInternal('__requestParams', 'api:params');
        const queryStringVar = ctx.registry.allocateInternal('__queryString', 'api:query');
        paramsCode = `const ${requestParamsVar} = ${getExpressionCode(
          {
            kind: 'object',
            properties: Object.entries(action.params).map(([key, value]) => ({ key, value })),
          },
          '{}',
          ctxFields,
          localScope,
        )};\nconst ${queryStringVar} = new URLSearchParams(Object.entries(${requestParamsVar}).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)])).toString();\nconst ${requestUrlVar} = ${queryStringVar} ? (${urlCode}).includes('?') ? ${urlCode} + '&' + ${queryStringVar} : ${urlCode} + '?' + ${queryStringVar} : ${urlCode};`;
      }

      const successGeneratedBindings = new Set<string>();
      if (action.resultTo) {
        const resultField = getFieldInfo(ctx, action.resultTo);
        if (resultField) successGeneratedBindings.add(resultField.setterName);
      }
      const successCapturedLocals = getCapturedLocals(
        action.onSuccess ?? [],
        localScope,
        ctx,
        ['response'],
        successGeneratedBindings,
      );
      const successLocals = new Set(localScope);
      successLocals.add('response');
      const successHandler =
        action.resultTo || (action.onSuccess?.length ?? 0) > 0
          ? registerNestedCodeHandler(
              ownerHandlerName,
              'OnSuccess',
              ctx,
              ['response', ...successCapturedLocals],
              (handlerName) => {
                const onSuccess = buildActionBlock(
                  action.onSuccess ?? [],
                  ctx,
                  handlerName,
                  successLocals,
                );
                const successLines: string[] = [];
                if (action.resultTo) {
                  successLines.push(resolveResultTarget(action.resultTo, ctx, 'response'));
                }
                if (onSuccess.code) {
                  successLines.push(onSuccess.code);
                }
                return {
                  code: successLines.join('\n'),
                  async: onSuccess.async,
                };
              },
              localScope,
            )
          : undefined;
      const errorCapturedLocals = getCapturedLocals(action.onError ?? [], localScope, ctx, [
        'error',
      ]);
      const errorLocals = new Set(localScope);
      errorLocals.add('error');
      const errorHandler = registerNestedCodeHandler(
        ownerHandlerName,
        'OnError',
        ctx,
        ['error', ...errorCapturedLocals],
        (handlerName) => {
          const onError = buildActionBlock(action.onError ?? [], ctx, handlerName, errorLocals);
          return {
            code: onError.code || 'console.error(error);',
            async: onError.async,
          };
        },
        localScope,
      );

      const successChain = successHandler
        ? `\n  .then(${buildCallbackReference(successHandler.name, ['response'], successCapturedLocals)})`
        : '';
      const errorReference = buildCallbackReference(
        errorHandler.name,
        ['error'],
        errorCapturedLocals,
      );

      return {
        code: `${paramsCode}\nfetch(${requestUrlVar}, { ${configParts.join(', ')} })\n  .then((res) => res.json())${successChain}\n  .catch(${errorReference});`,
        async: Boolean(successHandler?.async) || errorHandler.async,
      };
    }
    case 'navigate': {
      if (action.to?.kind === 'literal' && typeof action.to.value === 'string') {
        return {
          code: `window.location.href = ${toQuotedString(sanitizeUrl(action.to.value))};`,
          async: false,
        };
      }
      // ponytail: P0 保守降级，动态导航统一降级为 '/'，防 javascript:/data: 与可控跳转
      return {
        code: `window.location.href = '/';`,
        async: false,
      };
    }
    case 'feedback': {
      const level = sanitizeFeedbackLevel(action.level || 'info', 'info');
      if (action.kind === 'notification') {
        return {
          code: `notification.${level}(${buildNotificationObject(action, ctxFields, localScope)});`,
          async: false,
        };
      }
      return {
        code: `message.${level}(${getExpressionCode(action.content ?? { kind: 'literal', value: '' }, '""', ctxFields, localScope)});`,
        async: false,
      };
    }
    case 'dialog': {
      const kind = action.kind || 'modal';
      const titleCode = getExpressionCode(
        action.title ?? { kind: 'literal', value: kind === 'confirm' ? '确认' : '提示' },
        kind === 'confirm' ? '"确认"' : '"提示"',
        ctxFields,
        localScope,
      );
      const contentCode = getExpressionCode(
        action.content ?? { kind: 'literal', value: '' },
        '""',
        ctxFields,
        localScope,
      );
      const objectParts = [`title: ${titleCode}`, `content: ${contentCode}`];

      if (kind === 'confirm') {
        const onOkCapturedLocals = getCapturedLocals(action.onOk ?? [], localScope, ctx);
        const onCancelCapturedLocals = getCapturedLocals(action.onCancel ?? [], localScope, ctx);
        const onOkHandler = action.onOk?.length
          ? registerNestedActionHandler(
              ownerHandlerName,
              'OnOk',
              action.onOk,
              ctx,
              onOkCapturedLocals,
              localScope,
            )
          : undefined;
        const onCancelHandler = action.onCancel?.length
          ? registerNestedActionHandler(
              ownerHandlerName,
              'OnCancel',
              action.onCancel,
              ctx,
              onCancelCapturedLocals,
              localScope,
            )
          : undefined;

        if (onOkHandler) {
          objectParts.push(
            `onOk: ${buildCallbackReference(onOkHandler.name, [], onOkCapturedLocals)}`,
          );
        }
        if (onCancelHandler) {
          objectParts.push(
            `onCancel: ${buildCallbackReference(onCancelHandler.name, [], onCancelCapturedLocals)}`,
          );
        }
        return {
          code: `Modal.confirm({ ${objectParts.join(', ')} });`,
          async: Boolean(onOkHandler?.async) || Boolean(onCancelHandler?.async),
        };
      }

      return { code: `Modal.info({ ${objectParts.join(', ')} });`, async: false };
    }
    case 'if': {
      const thenBlock = buildActionBlock(action.then ?? [], ctx, ownerHandlerName, localScope);
      const elseBlock = buildActionBlock(action.else ?? [], ctx, ownerHandlerName, localScope);
      const elseCode = elseBlock.code ? ` else {\n${indentBlock(elseBlock.code)}\n}` : '';
      return {
        code: `if (${getExpressionCode(action.condition ?? { kind: 'literal', value: false }, 'false', ctxFields, localScope)}) {\n${indentBlock(thenBlock.code)}\n}${elseCode}`,
        async: thenBlock.async || elseBlock.async,
      };
    }
    case 'loop': {
      const safeItemVar = sanitizeLoopVar(action.itemVar, 'item');
      let safeIndexVar: string | undefined;
      if (action.indexVar !== undefined) {
        safeIndexVar = sanitizeLoopVar(action.indexVar, 'index');
        if (safeItemVar === safeIndexVar) {
          throw new Error(`循环变量 itemVar 与 indexVar 不能相同: "${safeItemVar}"`);
        }
      }
      for (const loopBinding of [safeItemVar, safeIndexVar]) {
        if (
          loopBinding &&
          ctx.root.usesComputed &&
          ['state', 'computed', 'stateRef', 'computedRef', 'computePageLogic'].includes(loopBinding)
        ) {
          throw new Error(`循环变量 "${loopBinding}" 与页面 Computed 运行时绑定冲突`);
        }
        if (loopBinding && actionListUsesGeneratedBinding(action.actions ?? [], ctx, loopBinding)) {
          throw new Error(`循环变量 "${loopBinding}" 与循环体生成标识符冲突`);
        }
      }
      const sourceVar = ctx.registry.allocateInternal('__loopSource', 'loop:source');
      const childScope = new Set(localScope);
      childScope.add(safeItemVar);
      if (safeIndexVar) childScope.add(safeIndexVar);
      const loopBlock = buildActionBlock(action.actions ?? [], ctx, ownerHandlerName, childScope);
      const overCode = getExpressionCode(
        action.over ?? { kind: 'array', items: [] },
        '[]',
        ctxFields,
        localScope,
      );
      if (safeIndexVar) {
        return {
          code: `const ${sourceVar} = ${overCode};\nfor (const [${safeIndexVar}, ${safeItemVar}] of ${sourceVar}.entries()) {\n${indentBlock(loopBlock.code)}\n}`,
          async: loopBlock.async,
        };
      }
      return {
        code: `const ${sourceVar} = ${overCode};\nfor (const ${safeItemVar} of ${sourceVar}) {\n${indentBlock(loopBlock.code)}\n}`,
        async: loopBlock.async,
      };
    }
    case 'delay':
      return {
        code: `await new Promise((resolve) => setTimeout(resolve, ${typeof action.ms === 'number' ? action.ms : 0}));`,
        async: true,
      };
    case 'log':
      return {
        code: `console.${sanitizeLogLevel(action.level || 'log', 'log')}(${getExpressionCode(action.value ?? { kind: 'literal', value: '' }, '""', ctxFields, localScope)});`,
        async: false,
      };
    case 'customScript': {
      const snippet = escapeComment((action.code || '').slice(0, 60).replace(/\s+/g, ' ').trim());
      return {
        code: `/* Custom Script omitted${snippet ? `: ${snippet}` : ''} */`,
        async: false,
      };
    }
    case 'runFlow': {
      const inputCode = action.input
        ? getExpressionCode(action.input, 'undefined', ctxFields, localScope)
        : 'undefined';
      return {
        code: `await executeFlow(${toQuotedString(action.flow || '')}, ${inputCode});`,
        async: true,
      };
    }
    default:
      return { code: `/* Unknown action: ${escapeComment(String(action.type))} */`, async: false };
  }
}

function sanitizeVarName(stepPath: readonly (string | number)[]): string {
  return stepPath.join('_').replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildNestedFlowStepCode(
  action: ActionNode,
  ctx: TransformContext,
  flowKey: string,
  topStepIndex: number | null,
  stepPath: readonly (string | number)[],
  localScope: Set<string>,
): string {
  const stepCode = topStepIndex === null ? 'null' : String(topStepIndex);
  const body = buildFlowStepCode(action, ctx, flowKey, topStepIndex, stepPath, localScope);
  return `try {\n${indentBlock(body)}\n} catch (stepErr) {\n  if (stepErr instanceof FlowExecutionError) throw stepErr;\n  throw flowContext.createError('FLOW_STEP_FAILED', ${toQuotedString(flowKey)}, ${stepCode}, ${JSON.stringify(stepPath)}, stepErr?.message || String(stepErr), stepErr);\n}`;
}

function buildFlowStepCode(
  action: ActionNode,
  ctx: TransformContext,
  flowKey: string,
  topStepIndex: number | null,
  stepPath: readonly (string | number)[],
  localScope: Set<string>,
): string {
  const ctxFields = getExpressionContextFields(ctx);
  const stepPathCode = JSON.stringify(stepPath);
  const flowKeyStr = toQuotedString(flowKey);
  const topStepIndexCode = topStepIndex === null ? 'null' : String(topStepIndex);
  const preamble = `flowContext.throwIfAborted(${flowKeyStr}, ${topStepIndexCode}, ${stepPathCode});
flowContext.incrementActionCount(${flowKeyStr}, ${topStepIndexCode}, ${stepPathCode});
state = stateRef.current;
${ctx.root.usesComputed ? 'computed = computedRef.current;' : ''}`;

  switch (action.type) {
    case 'setValue': {
      const valueCode = getExpressionCode(
        action.value ?? { kind: 'literal', value: '' },
        'undefined',
        ctxFields,
        localScope,
      );
      if (action.field) {
        const stateKey = action.field.startsWith('state.')
          ? action.field.slice('state.'.length)
          : action.field;
        const statePath = sanitizeStatePath(stateKey, !hasDeclaredPageState(ctx));
        if (statePath) {
          const currentValueCode = getStatePathValueCode(statePath);
          const nextValueCode = action.merge
            ? getMergedStateValueCode(currentValueCode, valueCode)
            : valueCode;
          const nextStateCode =
            statePath.length === 1
              ? `({ ...state, ${toObjectKeyCode(statePath[0])}: ${nextValueCode} })`
              : getNestedStateUpdateCode(statePath, nextValueCode);
          return `${preamble}
flowContext.throwIfAborted(${flowKeyStr}, ${topStepIndexCode}, ${stepPathCode});
state = ${nextStateCode};
stateRef.current = state;
${ctx.root.usesComputed ? 'computed = computePageLogic(state);\ncomputedRef.current = computed;' : ''}
setState(state);`;
        }
        return `${preamble}\n/* invalid state field discarded */`;
      }
      return `${preamble}\n/* setValue missing field */`;
    }

    case 'delay': {
      const ms = typeof action.ms === 'number' ? action.ms : 0;
      return `${preamble}
await flowContext.waitForDelay(
  ${ms},
  ${flowKeyStr},
  ${topStepIndexCode},
  ${stepPathCode},
);
state = stateRef.current;
${ctx.root.usesComputed ? 'computed = computedRef.current;' : ''}`;
    }

    case 'runFlow': {
      const inputCode = action.input
        ? getExpressionCode(action.input, 'undefined', ctxFields, localScope)
        : 'undefined';
      return `${preamble}
await executeChildFlow(
  ${toQuotedString(action.flow || '')},
  ${inputCode},
  flowContext,
  ${flowKeyStr},
  ${topStepIndexCode},
  ${stepPathCode},
);
state = stateRef.current;
${ctx.root.usesComputed ? 'computed = computedRef.current;' : ''}`;
    }

    case 'navigate': {
      const target =
        action.to?.kind === 'literal' && typeof action.to.value === 'string'
          ? toQuotedString(sanitizeUrl(action.to.value))
          : "'/'";
      return `${preamble}\nwindow.location.href = ${target};`;
    }

    case 'feedback': {
      const feedbackStatement =
        action.kind === 'notification'
          ? `notification.${sanitizeFeedbackLevel(action.level || 'info')}(${buildNotificationObject(action, ctxFields, localScope)});`
          : `message.${sanitizeFeedbackLevel(action.level || 'info')}(${getExpressionCode(action.content ?? { kind: 'literal', value: '' }, '""', ctxFields, localScope)});`;
      return `${preamble}\n${feedbackStatement}`;
    }

    case 'log': {
      const level = sanitizeLogLevel(action.level || 'log', 'log');
      const valCode = getExpressionCode(
        action.value ?? { kind: 'literal', value: '' },
        '""',
        ctxFields,
        localScope,
      );
      return `${preamble}\nconsole.${level}(${valCode});`;
    }

    case 'if': {
      const condCode = getExpressionCode(
        action.condition ?? { kind: 'literal', value: false },
        'false',
        ctxFields,
        localScope,
      );
      const thenSteps = (action.then ?? [])
        .map((childAction, childIndex) =>
          buildNestedFlowStepCode(
            childAction,
            ctx,
            flowKey,
            topStepIndex,
            [...stepPath, 'then', childIndex],
            localScope,
          ),
        )
        .join('\n');
      const elseSteps = (action.else ?? [])
        .map((childAction, childIndex) =>
          buildNestedFlowStepCode(
            childAction,
            ctx,
            flowKey,
            topStepIndex,
            [...stepPath, 'else', childIndex],
            localScope,
          ),
        )
        .join('\n');
      const elseCode = elseSteps ? ` else {\n${indentBlock(elseSteps)}\n}` : '';
      return `${preamble}
if (${condCode}) {
${indentBlock(thenSteps)}
}${elseCode}`;
    }

    case 'loop': {
      if (!action.actions || action.actions.length === 0) {
        return preamble;
      }
      const safeItemVar = sanitizeLoopVar(action.itemVar, 'item');
      const safeIndexVar =
        action.indexVar !== undefined ? sanitizeLoopVar(action.indexVar, 'index') : undefined;
      const childScope = new Set(localScope);
      childScope.add(safeItemVar);
      if (safeIndexVar) childScope.add(safeIndexVar);
      const overCode = getExpressionCode(
        action.over ?? { kind: 'array', items: [] },
        '[]',
        ctxFields,
        localScope,
      );
      const loopSteps = (action.actions ?? [])
        .map((childAction, childIndex) =>
          buildNestedFlowStepCode(
            childAction,
            ctx,
            flowKey,
            topStepIndex,
            [...stepPath, 'actions', childIndex],
            childScope,
          ),
        )
        .join('\n');
      const loopVarSuffix = sanitizeVarName(stepPath);
      return `${preamble}
const loopSource_${loopVarSuffix} = ${overCode};
for (const [${safeIndexVar ?? '_loopIdx'}, ${safeItemVar}] of (Array.isArray(loopSource_${loopVarSuffix}) ? loopSource_${loopVarSuffix} : []).entries()) {
  flowContext.incrementLoopIteration(${flowKeyStr}, ${topStepIndexCode}, ${stepPathCode});
  flowContext.throwIfAborted(${flowKeyStr}, ${topStepIndexCode}, ${stepPathCode});
  state = stateRef.current;
  ${ctx.root.usesComputed ? 'computed = computedRef.current;' : ''}
${indentBlock(loopSteps)}
}`;
    }

    case 'dialog': {
      const onOkSteps = (action.onOk ?? [])
        .map((childAction, childIndex) =>
          buildNestedFlowStepCode(
            childAction,
            ctx,
            flowKey,
            topStepIndex,
            [...stepPath, 'onOk', childIndex],
            localScope,
          ),
        )
        .join('\n');
      const onCancelSteps = (action.onCancel ?? [])
        .map((childAction, childIndex) =>
          buildNestedFlowStepCode(
            childAction,
            ctx,
            flowKey,
            topStepIndex,
            [...stepPath, 'onCancel', childIndex],
            localScope,
          ),
        )
        .join('\n');
      const titleCode = getExpressionCode(
        action.title ?? { kind: 'literal', value: '确认' },
        '"确认"',
        ctxFields,
        localScope,
      );
      const contentCode = getExpressionCode(
        action.content ?? { kind: 'literal', value: '' },
        '""',
        ctxFields,
        localScope,
      );
      const method = action.kind === 'confirm' ? 'confirm' : 'info';
      return `${preamble}
await flowContext.executeWithAbortRace(
  new Promise((resolve, reject) => {
    let instance;
    const onAbort = () => {
      try {
        instance?.destroy();
      } catch {}
    };
    flowContext.signal.addEventListener('abort', onAbort, { once: true });
    instance = Modal.${method}({
      title: ${titleCode},
      content: ${contentCode},
      onOk: async () => {
        flowContext.signal.removeEventListener('abort', onAbort);
        let state = stateRef.current;
        ${ctx.root.usesComputed ? 'let computed = computedRef.current;' : ''}
        try {
${indentBlock(onOkSteps)}
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      onCancel: async () => {
        flowContext.signal.removeEventListener('abort', onAbort);
        let state = stateRef.current;
        ${ctx.root.usesComputed ? 'let computed = computedRef.current;' : ''}
        try {
${indentBlock(onCancelSteps)}
          resolve();
        } catch (e) {
          reject(e);
        }
      },
    });
  }),
  ${flowKeyStr},
  ${topStepIndexCode},
  ${stepPathCode},
);
state = stateRef.current;
${ctx.root.usesComputed ? 'computed = computedRef.current;' : ''}`;
    }

    case 'apiCall': {
      const method = action.method || 'GET';
      const urlCode = getExpressionCode(
        action.url ?? { kind: 'literal', value: '/' },
        '"/"',
        ctxFields,
        localScope,
      );
      const headersCode = action.headers
        ? getExpressionCode(
            {
              kind: 'object',
              properties: Object.entries(action.headers).map(([key, value]) => ({ key, value })),
            },
            '{}',
            ctxFields,
            localScope,
          )
        : 'undefined';
      const bodyCode = action.body
        ? `JSON.stringify(${getExpressionCode(action.body, 'undefined', ctxFields, localScope)})`
        : 'undefined';
      const paramsCode = action.params
        ? getExpressionCode(
            {
              kind: 'object',
              properties: Object.entries(action.params).map(([key, value]) => ({ key, value })),
            },
            'undefined',
            ctxFields,
            localScope,
          )
        : 'undefined';

      let resultToWrite = '';
      if (action.resultTo) {
        const resultKey = action.resultTo.startsWith('state.')
          ? action.resultTo.slice('state.'.length)
          : action.resultTo;
        const statePath = sanitizeStatePath(resultKey, !hasDeclaredPageState(ctx));
        if (statePath) {
          const nextStateCode =
            statePath.length === 1
              ? `({ ...state, ${toObjectKeyCode(statePath[0])}: response })`
              : getNestedStateUpdateCode(statePath, 'response');
          resultToWrite = `flowContext.throwIfAborted(${flowKeyStr}, ${topStepIndexCode}, ${stepPathCode});
state = ${nextStateCode};
stateRef.current = state;
${ctx.root.usesComputed ? 'computed = computePageLogic(state);\ncomputedRef.current = computed;' : ''}
setState(state);`;
        }
      }

      const successScope = new Set(localScope);
      successScope.add('response');
      const onSuccessSteps = (action.onSuccess ?? [])
        .map((childAction, childIndex) =>
          buildNestedFlowStepCode(
            childAction,
            ctx,
            flowKey,
            topStepIndex,
            [...stepPath, 'onSuccess', childIndex],
            successScope,
          ),
        )
        .join('\n');

      const errorScope = new Set(localScope);
      errorScope.add('error');
      errorScope.add('errorObject');
      const onErrorSteps = (action.onError ?? [])
        .map((childAction, childIndex) =>
          buildNestedFlowStepCode(
            childAction,
            ctx,
            flowKey,
            topStepIndex,
            [...stepPath, 'onError', childIndex],
            errorScope,
          ),
        )
        .join('\n');

      const varSuffix = sanitizeVarName(stepPath);
      return `${preamble}
const requestUrl_${varSuffix} = buildRequestUrl(${urlCode}, ${paramsCode});
try {
  const response = await flowContext.executeWithAbortRace(
    (async () => {
      const res = await fetch(requestUrl_${varSuffix}, {
        method: ${toQuotedString(method)},
        ${action.headers ? `headers: ${headersCode},` : ''}
        ${action.body ? `body: ${bodyCode},` : ''}
        signal: flowContext.signal,
      });
      const contentType = res.headers.get('content-type') || '';
      const responseData = contentType.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) {
        const httpErr = new Error('HTTP ' + res.status + ': ' + res.statusText);
        httpErr.response = responseData;
        throw httpErr;
      }
      return responseData;
    })(),
    ${flowKeyStr},
    ${topStepIndexCode},
    ${stepPathCode},
  );
  state = stateRef.current;
  ${ctx.root.usesComputed ? 'computed = computedRef.current;' : ''}
${indentBlock(resultToWrite)}
${indentBlock(onSuccessSteps)}
} catch (apiErr) {
  if (apiErr instanceof FlowExecutionError && isNonRecoverableFlowErrorCode(apiErr.code)) {
    throw apiErr;
  }
  if (flowContext.signal.aborted || flowAbortControllerRef.current?.signal.aborted) {
    throw flowContext.createAbortError(${flowKeyStr}, ${topStepIndexCode}, ${stepPathCode});
  }
${
  onErrorSteps
    ? `  const error = apiErr?.message || String(apiErr);
  const errorObject = apiErr;
${indentBlock(onErrorSteps)}`
    : '  throw apiErr;'
}
}`;
    }

    default:
      return `${preamble}
throw flowContext.createError('FLOW_STEP_FAILED', ${flowKeyStr}, ${topStepIndexCode}, ${stepPathCode}, 'Unsupported flow action type: ' + ${toQuotedString(action.type)});`;
  }
}

function genFlowRuntime(root: RootNode, ctx: TransformContext): string {
  if (!root.usesFlows || !root.flows) return '';
  const limits = root.flowExecutionLimits;
  if (!limits) throw new Error('ActionFlow code generation requires normalized execution limits');
  const flowEntries: string[] = [];

  for (const flow of root.flows) {
    const flowKey = flow.key;
    const flowKeyStr = toQuotedString(flowKey);
    const stepsCode = flow.steps
      .map((stepAction, stepIndex) => {
        const stepBody = buildFlowStepCode(
          stepAction,
          ctx,
          flowKey,
          stepIndex,
          ['steps', stepIndex],
          new Set(['input']),
        );
        return `stackFrame.step = ${stepIndex};
try {
${indentBlock(stepBody)}
} catch (stepErr) {
  if (stepErr instanceof FlowExecutionError && isNonRecoverableFlowErrorCode(stepErr.code)) {
    throw stepErr;
  }
  if (flowContext.signal.aborted || flowAbortControllerRef.current?.signal.aborted) {
    throw flowContext.createAbortError(${flowKeyStr}, ${stepIndex}, ['steps', ${stepIndex}]);
  }
  throw stepErr instanceof FlowExecutionError
    ? stepErr
    : flowContext.createError(
        'FLOW_STEP_FAILED',
        ${flowKeyStr},
        ${stepIndex},
        ['steps', ${stepIndex}],
        stepErr?.message || String(stepErr),
        stepErr,
      );
}`;
      })
      .join('\n');

    let onErrorBlock = '';
    if (flow.onError && flow.onError.length > 0) {
      const onErrorSteps = flow.onError
        .map(
          (onErrorAction, onErrorIndex) =>
            `onErrorStepPath = ['onError', ${onErrorIndex}];\n${buildNestedFlowStepCode(
              onErrorAction,
              ctx,
              flowKey,
              null,
              ['onError', onErrorIndex],
              new Set(['input', 'error', 'errorObject']),
            )}`,
        )
        .join('\n');

      onErrorBlock = `stackFrame.step = null;
const error = err.message;
const errorObject = err;
let onErrorStepPath = ['onError', 0];
try {
${indentBlock(onErrorSteps)}
  return { status: 'recovered', flow: ${flowKeyStr}, recovered: true, error: err };
} catch (newErr) {
  if (newErr instanceof FlowExecutionError && isNonRecoverableFlowErrorCode(newErr.code)) {
    throw newErr;
  }
  if (flowContext.signal.aborted || flowAbortControllerRef.current?.signal.aborted) {
    throw flowContext.createAbortError(${flowKeyStr}, null, ['onError', stackFrame.step ?? 0]);
  }
  const onErrorFailedError =
    newErr instanceof FlowExecutionError
      ? new FlowExecutionError(newErr.diagnostic, err)
      : flowContext.createError(
          'FLOW_STEP_FAILED',
          ${flowKeyStr},
          null,
          onErrorStepPath,
          newErr?.message || String(newErr),
          err,
        );
  throw onErrorFailedError;
}`;
    }

    flowEntries.push(`[${flowKeyStr}]: async (input, flowContext) => {
  const flowKey = ${flowKeyStr};
  const stackFrame = flowContext.callStack[flowContext.callStack.length - 1];
  let state = stateRef.current;
  ${root.usesComputed ? 'let computed = computedRef.current;' : ''}
  try {
${indentBlock(stepsCode)}
    return { status: 'success', flow: flowKey, recovered: false };
  } catch (err) {
    if (err instanceof FlowExecutionError && isNonRecoverableFlowErrorCode(err.code)) {
      throw err;
    }
    if (flowContext.signal.aborted || flowAbortControllerRef.current?.signal.aborted) {
      throw flowContext.createAbortError(flowKey, stackFrame.step, ['steps', stackFrame.step ?? 0]);
    }
${indentBlock(onErrorBlock)}
    throw err;
  }
}`);
  }

  const runtimePreamble = `const flowAbortControllerRef = useRef(null);
const activeFlowControllersRef = useRef(new Set());
useEffect(() => {
  const mountController = new AbortController();
  flowAbortControllerRef.current = mountController;
  return () => {
    mountController.abort();
    if (flowAbortControllerRef.current === mountController) {
      flowAbortControllerRef.current = null;
    }
    activeFlowControllersRef.current.forEach((controller) => controller.abort());
    activeFlowControllersRef.current.clear();
  };
}, []);

class FlowExecutionError extends Error {
  constructor(diagnostic, cause) {
    super(diagnostic.message);
    this.name = 'FlowExecutionError';
    Object.defineProperties(this, {
      code: { value: diagnostic.code, enumerable: true, writable: true, configurable: true },
      flow: { value: diagnostic.flow, enumerable: true, writable: true, configurable: true },
      step: { value: diagnostic.step, enumerable: true, writable: true, configurable: true },
      stepPath: { value: diagnostic.stepPath, enumerable: true, writable: true, configurable: true },
      path: { value: diagnostic.path, enumerable: true, writable: true, configurable: true },
      trace: { value: diagnostic.trace, enumerable: true, writable: true, configurable: true },
    });
    this.diagnostic = Object.freeze({
      code: diagnostic.code,
      flow: diagnostic.flow,
      step: diagnostic.step,
      stepPath: Object.freeze([...diagnostic.stepPath]),
      path: Object.freeze([...diagnostic.path]),
      trace: Object.freeze(
        diagnostic.trace.map((frame) => Object.freeze({ flow: frame.flow, step: frame.step })),
      ),
      message: diagnostic.message,
    });
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

const isNonRecoverableFlowErrorCode = (code) => code !== 'FLOW_STEP_FAILED';

const isolateFlowInput = (value) => {
  if (value === null || typeof value !== 'object') return value;
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
};

const buildRequestUrl = (url, params) => {
  if (!params || typeof params !== 'object') return url;
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)]);
  if (entries.length === 0) return url;
  const queryString = new URLSearchParams(entries).toString();
  return url.includes('?') ? \`\${url}&\${queryString}\` : \`\${url}?\${queryString}\`;
};`;

  const childFlowExecutor = `const executeChildFlow = async (targetFlow, rawInput, flowContext, callerFlow, callerStepIndex, callerStepPath) => {
  flowContext.throwIfAborted(callerFlow, callerStepIndex, callerStepPath);
  if (flowContext.callStack.length + 1 > ${limits.maxFlowDepth}) {
    throw flowContext.createError(
      'FLOW_DEPTH_EXCEEDED',
      targetFlow,
      null,
      [],
      'Flow call depth exceeded: maximum depth ${limits.maxFlowDepth} allowed',
    );
  }
  if (!flowRegistry[targetFlow]) {
    throw flowContext.createError(
      'FLOW_NOT_FOUND',
      targetFlow,
      null,
      [],
      \`Flow not found: "\${targetFlow}"\`,
    );
  }
  const isolatedInput = isolateFlowInput(rawInput);
  flowContext.callStack.push({ flow: targetFlow, step: null });
  try {
    return await flowRegistry[targetFlow](isolatedInput, flowContext);
  } finally {
    flowContext.callStack.pop();
  }
};`;

  const rootFlowExecutor = `const executeFlow = async (rootFlowName, rawInput) => {
  const mountController = flowAbortControllerRef.current;
  if (!mountController || mountController.signal.aborted) {
    throw new FlowExecutionError({
      code: 'FLOW_ABORTED',
      flow: rootFlowName,
      step: null,
      stepPath: [],
      path: ['logic', 'flows', rootFlowName],
      trace: [{ flow: rootFlowName, step: null }],
      message: 'Component unmounted',
    });
  }
  if (!flowRegistry[rootFlowName]) {
    throw new FlowExecutionError({
      code: 'FLOW_NOT_FOUND',
      flow: rootFlowName,
      step: null,
      stepPath: [],
      path: ['logic', 'flows', rootFlowName],
      trace: [{ flow: rootFlowName, step: null }],
      message: \`Flow not found: "\${rootFlowName}"\`,
    });
  }
  if (activeFlowControllersRef.current.size >= ${limits.maxConcurrentRuns}) {
    throw new FlowExecutionError({
      code: 'FLOW_CONCURRENCY_EXCEEDED',
      flow: rootFlowName,
      step: null,
      stepPath: [],
      path: ['logic', 'flows', rootFlowName],
      trace: [{ flow: rootFlowName, step: null }],
      message: 'Flow concurrency limit exceeded: maximum ${limits.maxConcurrentRuns} concurrent flows allowed',
    });
  }

  const runController = new AbortController();
  activeFlowControllersRef.current.add(runController);

  const durationLimitMs = ${limits.maxDurationMs};
  const deadline = performance.now() + durationLimitMs;
  let durationTimedOut = false;
  const durationTimer = setTimeout(() => {
    durationTimedOut = true;
    runController.abort();
  }, durationLimitMs);

  const callStack = [{ flow: rootFlowName, step: null }];
  let executedActionsCount = 0;
  let loopIterationsCount = 0;

  const flowContext = {
    get signal() {
      return runController.signal;
    },
    callStack,
    throwIfAborted(flowKey, stepIndex, stepPath) {
      if (durationTimedOut || performance.now() > deadline) {
        durationTimedOut = true;
        if (!runController.signal.aborted) runController.abort();
        throw flowContext.createError(
          'FLOW_DURATION_EXCEEDED',
          flowKey,
          stepIndex,
          stepPath,
          'Flow duration exceeded: maximum ${limits.maxDurationMs}ms allowed',
        );
      }
      if (flowAbortControllerRef.current?.signal.aborted) {
        throw flowContext.createError(
          'FLOW_ABORTED',
          flowKey,
          stepIndex,
          stepPath,
          'Component unmounted',
        );
      }
      if (runController.signal.aborted) {
        throw flowContext.createError(
          'FLOW_ABORTED',
          flowKey,
          stepIndex,
          stepPath,
          'Flow execution aborted',
        );
      }
    },
    createAbortError(flowKey, stepIndex, stepPath) {
      const isDuration = durationTimedOut || performance.now() > deadline;
      const code = isDuration ? 'FLOW_DURATION_EXCEEDED' : 'FLOW_ABORTED';
      const message = isDuration
        ? 'Flow duration exceeded: maximum ${limits.maxDurationMs}ms allowed'
        : 'Flow execution aborted';
      return flowContext.createError(code, flowKey, stepIndex, stepPath, message);
    },
    createError(code, flowKey, stepIndex, stepPath, message, cause) {
      const trace = callStack.map((frame) => ({ flow: frame.flow, step: frame.step }));
      if (trace.length === 0 || trace[trace.length - 1].flow !== flowKey) {
        trace.push({ flow: flowKey, step: stepIndex });
      } else {
        trace[trace.length - 1] = { flow: flowKey, step: stepIndex };
      }
      const path = ['logic', 'flows', flowKey, ...stepPath];
      const diagnostic = {
        code,
        flow: flowKey,
        step: stepIndex,
        stepPath,
        path,
        trace,
        message,
      };
      return new FlowExecutionError(diagnostic, cause);
    },
    incrementActionCount(flowKey, stepIndex, stepPath) {
      flowContext.throwIfAborted(flowKey, stepIndex, stepPath);
      executedActionsCount += 1;
      if (executedActionsCount > ${limits.maxExecutedActions}) {
        throw flowContext.createError(
          'FLOW_ACTION_BUDGET_EXCEEDED',
          flowKey,
          stepIndex,
          stepPath,
          'Flow action execution budget exceeded: maximum ${limits.maxExecutedActions} actions allowed',
        );
      }
    },
    incrementLoopIteration(flowKey, stepIndex, stepPath) {
      flowContext.throwIfAborted(flowKey, stepIndex, stepPath);
      loopIterationsCount += 1;
      if (loopIterationsCount > ${limits.maxLoopIterations}) {
        throw flowContext.createError(
          'FLOW_ITERATION_BUDGET_EXCEEDED',
          flowKey,
          stepIndex,
          stepPath,
          'Flow loop iteration budget exceeded: maximum ${limits.maxLoopIterations} iterations allowed',
        );
      }
    },
    waitForDelay(ms, flowKey, stepIndex, stepPath) {
      flowContext.throwIfAborted(flowKey, stepIndex, stepPath);
      return new Promise((resolve, reject) => {
        let timer;
        const cleanup = () => {
          clearTimeout(timer);
          runController.signal.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
          cleanup();
          reject(flowContext.createAbortError(flowKey, stepIndex, stepPath));
        };
        timer = setTimeout(() => {
          cleanup();
          resolve();
        }, ms);
        runController.signal.addEventListener('abort', onAbort, { once: true });
      });
    },
    async executeWithAbortRace(actionPromise, flowKey, stepIndex, stepPath) {
      actionPromise.catch(() => {});
      flowContext.throwIfAborted(flowKey, stepIndex, stepPath);
      let cleanup;
      const abortPromise = new Promise((_, reject) => {
        const onAbort = () => {
          try {
            flowContext.throwIfAborted(flowKey, stepIndex, stepPath);
            reject(flowContext.createAbortError(flowKey, stepIndex, stepPath));
          } catch (err) {
            reject(err);
          }
        };
        if (
          runController.signal.aborted ||
          flowAbortControllerRef.current?.signal.aborted ||
          performance.now() > deadline
        ) {
          onAbort();
          return;
        }
        runController.signal.addEventListener('abort', onAbort, { once: true });
        cleanup = () => runController.signal.removeEventListener('abort', onAbort);
      });
      try {
        const result = await Promise.race([actionPromise, abortPromise]);
        flowContext.throwIfAborted(flowKey, stepIndex, stepPath);
        return result;
      } catch (error) {
        flowContext.throwIfAborted(flowKey, stepIndex, stepPath);
        throw error;
      } finally {
        cleanup?.();
      }
    },
  };

  const isolatedInput = isolateFlowInput(rawInput);
  try {
    return await flowRegistry[rootFlowName](isolatedInput, flowContext);
  } finally {
    clearTimeout(durationTimer);
    activeFlowControllersRef.current.delete(runController);
  }
};`;

  const flowRegistryCode = `const flowRegistry = {\n${indentBlock(flowEntries.join(',\n'))}\n};`;

  return [runtimePreamble, flowRegistryCode, childFlowExecutor, rootFlowExecutor].join('\n\n');
}

export function transform(root: RootNode): void {
  const ctx = createTransformContext(root);
  collectImports(ctx);
  preCollectAllActionImports(ctx);
  collectFields(ctx);

  root.imports = ctx.imports;
  root.fields = ctx.fields;
  root.handlers = ctx.handlers;
  if (root.usesFlows) {
    root.flowRuntimeCode = genFlowRuntime(root, ctx);
  }
  root.children = root.children.map((child) => {
    if (child.kind !== 'component') {
      return child;
    }
    return {
      ...child,
      codegenNode: buildComponentNode(child, ctx),
    };
  });
}

function genAttribute(attribute: JSXAttributeNode): string {
  switch (attribute.mode) {
    case 'boolean':
      return attribute.name;
    case 'string':
      return `${attribute.name}=${toQuotedString(attribute.value ?? '')}`;
    case 'expression':
    default:
      return `${attribute.name}={${attribute.value ?? 'undefined'}}`;
  }
}

function genJsxValue(node: JSXNode): string {
  switch (node.kind) {
    case 'element':
    case 'fragment':
      return genJsx(node);
    case 'expression':
      return node.code;
    case 'text':
      return toQuotedString(node.value);
    case 'conditional':
      return `${node.condition} ? ${genJsxValue(node.consequent)} : ${
        node.alternate ? genJsxValue(node.alternate) : 'null'
      }`;
    case 'comment':
      return 'null';
    default:
      return 'null';
  }
}

function genJsx(node: JSXNode): string {
  switch (node.kind) {
    case 'text':
      return escapeJSX(node.value);
    case 'expression':
      return `{${node.code}}`;
    case 'comment':
      return `{/* ${escapeComment(node.text)} */}`;
    case 'conditional':
      return `{${node.condition} ? ${genJsxValue(node.consequent)} : ${
        node.alternate ? genJsxValue(node.alternate) : 'null'
      }}`;
    case 'fragment':
      return `<>${node.children.map((child) => genJsx(child)).join('')}</>`;
    case 'element': {
      const attributes = node.attributes.length
        ? ` ${node.attributes.map((attribute) => genAttribute(attribute)).join(' ')}`
        : '';
      if (node.children.length === 0) {
        return `<${node.tag}${attributes} />`;
      }
      return `<${node.tag}${attributes}>${node.children.map((child) => genJsx(child)).join('')}</${node.tag}>`;
    }
    default:
      return '<></>';
  }
}

function genImports(imports: Map<string, Set<string>>): string {
  const statements: string[] = [];
  for (const [source, names] of imports.entries()) {
    if (names.size === 0) continue;
    const sortedNames = Array.from(names).sort();
    if (source === 'react') {
      statements.push(
        `import React, { ${sortedNames.join(', ')} } from ${toQuotedString(source)};`,
      );
      continue;
    }
    statements.push(`import { ${sortedNames.join(', ')} } from ${toQuotedString(source)};`);
  }
  return statements.join('\n');
}

function genComputedValueHelpers(): string {
  return `const computedSkip = Symbol("computed-skip");
const readComputedMember = (target, key) => {
  if (target === null || target === undefined) return undefined;
  try {
    const boxed = Object(target);
    const ownDescriptor = Object.getOwnPropertyDescriptor(boxed, String(key));
    if (ownDescriptor) {
      if (ownDescriptor.get || ownDescriptor.set || typeof ownDescriptor.value === "function") {
        return undefined;
      }
      return ownDescriptor.value;
    }
    let prototype = Object.getPrototypeOf(boxed);
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, String(key));
      if (descriptor) {
        if (descriptor.get || descriptor.set || typeof descriptor.value === "function") {
          return undefined;
        }
        break;
      }
      prototype = Object.getPrototypeOf(prototype);
    }
    return target[key];
  } catch {
    return undefined;
  }
};
const callComputed = (fn, receiver, args) => {
  if (typeof fn !== "function") return undefined;
  try {
    return fn.apply(receiver, args);
  } catch {
    return undefined;
  }
};
const callComputedMember = (target, key, args) => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(target, String(key));
    if (!descriptor || descriptor.get || descriptor.set || typeof descriptor.value !== "function") {
      return undefined;
    }
    if (target === Math) {
      for (const argument of args) {
        if (argument !== null && typeof argument === "object") return undefined;
      }
    }
    return descriptor.value.apply(target, args);
  } catch {
    return undefined;
  }
};
const computeUnary = (operator, value) => {
  if (
    value !== null &&
    typeof value === "object" &&
    (operator === "+" || operator === "-")
  ) {
    return undefined;
  }
  switch (operator) {
    case "!":
      return !value;
    case "+":
      return +value;
    case "-":
      return -value;
    default:
      return undefined;
  }
};
const computeBinary = (operator, left, right) => {
  const hasObjectOperand =
    (left !== null && typeof left === "object") ||
    (right !== null && typeof right === "object");
  if (hasObjectOperand && (operator === "==" || operator === "!=")) return undefined;
  switch (operator) {
    case "+":
      return hasObjectOperand ? undefined : left + right;
    case "-":
      return hasObjectOperand ? undefined : left - right;
    case "*":
      return hasObjectOperand ? undefined : left * right;
    case "/":
      return hasObjectOperand ? undefined : left / right;
    case "%":
      return hasObjectOperand ? undefined : left % right;
    case "<":
      return hasObjectOperand ? undefined : left < right;
    case "<=":
      return hasObjectOperand ? undefined : left <= right;
    case ">":
      return hasObjectOperand ? undefined : left > right;
    case ">=":
      return hasObjectOperand ? undefined : left >= right;
    case "==":
      return left == right;
    case "===":
      return left === right;
    case "!=":
      return left != right;
    case "!==":
      return left !== right;
    case "&&":
      return left && right;
    case "||":
      return left || right;
    default:
      return undefined;
  }
};
const cloneComputedInput = (value, seen = new WeakMap()) => {
  if (value === null) return null;
  if (typeof value !== "object") {
    return typeof value === "function" || typeof value === "symbol" || typeof value === "bigint"
      ? computedSkip
      : value;
  }
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const clone = [];
    seen.set(value, clone);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || descriptor.get || descriptor.set) {
        clone[index] = undefined;
        continue;
      }
      const child = cloneComputedInput(descriptor.value, seen);
      clone[index] = child === computedSkip ? undefined : child;
    }
    return clone;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return computedSkip;
  const clone = Object.create(null);
  seen.set(value, clone);
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) continue;
    const child = cloneComputedInput(descriptor.value, seen);
    if (child !== computedSkip) clone[key] = child;
  }
  return clone;
};
const freezeComputedOutput = (
  value,
  seen = new WeakMap(),
  active = new WeakSet(),
) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : computedSkip;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value !== "object") return computedSkip;
  if (active.has(value)) return computedSkip;
  if (seen.has(value)) return seen.get(value);
  const isArray = Array.isArray(value);
  if (!isArray) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return computedSkip;
  }
  const clone = isArray ? [] : Object.create(null);
  seen.set(value, clone);
  active.add(value);
  const keys = isArray
    ? Array.from({ length: value.length }, (_, index) => String(index))
    : Object.keys(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) return computedSkip;
    const child = freezeComputedOutput(descriptor.value, seen, active);
    if (child === computedSkip) return computedSkip;
    clone[key] = child;
  }
  active.delete(value);
  return Object.freeze(clone);
};`;
}

/**
 * Contract 已完成唯一的语法与能力判断；Compiler 这里只把已验证 AST 降级为带
 * fail-soft member/call 和对象运算保护的代码，避免原生 JS 隐式转换偏离 Renderer。
 */
function genValidatedComputedExpression(expression: string): string {
  const generateNode = (node: jsep.Expression): string => {
    switch (node.type) {
      case 'Compound': {
        const body = (node as jsep.Compound).body;
        if (body.length !== 1) throw new Error('Validated Computed compound must contain one node');
        return generateNode(body[0]);
      }
      case 'Literal':
        return getJsonLiteralCode((node as jsep.Literal).value as JsonValue);
      case 'Identifier':
        return (node as jsep.Identifier).name;
      case 'MemberExpression': {
        const member = node as jsep.MemberExpression;
        const property = member.computed
          ? generateNode(member.property)
          : toQuotedString((member.property as jsep.Identifier).name);
        return `readComputedMember(${generateNode(member.object)}, ${property})`;
      }
      case 'BinaryExpression':
      case 'LogicalExpression': {
        const binary = node as jsep.BinaryExpression;
        return `computeBinary(${toQuotedString(binary.operator)}, ${generateNode(binary.left)}, ${generateNode(binary.right)})`;
      }
      case 'UnaryExpression': {
        const unary = node as jsep.UnaryExpression;
        return `computeUnary(${toQuotedString(unary.operator)}, ${generateNode(unary.argument)})`;
      }
      case 'ConditionalExpression': {
        const conditional = node as jsep.ConditionalExpression;
        return `(${generateNode(conditional.test)} ? ${generateNode(conditional.consequent)} : ${generateNode(conditional.alternate)})`;
      }
      case 'ArrayExpression': {
        const array = node as jsep.ArrayExpression;
        return `[${array.elements.map((element) => generateNode(element as jsep.Expression)).join(', ')}]`;
      }
      case 'CallExpression': {
        const call = node as jsep.CallExpression;
        const args = `[${call.arguments.map((argument) => generateNode(argument)).join(', ')}]`;
        if (call.callee.type === 'Identifier') {
          return `callComputed(${(call.callee as jsep.Identifier).name}, undefined, ${args})`;
        }
        if (call.callee.type === 'MemberExpression') {
          const member = call.callee as jsep.MemberExpression;
          const property = member.computed
            ? generateNode(member.property)
            : toQuotedString((member.property as jsep.Identifier).name);
          return `callComputedMember(${generateNode(member.object)}, ${property}, ${args})`;
        }
        break;
      }
    }
    throw new Error(`Unsupported validated Computed AST node: ${node.type}`);
  };

  return generateNode(jsep(expression));
}

function genStateHooks(root: RootNode): string {
  const ctxFields = new Set(root.fields.map((field) => field.name));
  const hooks: string[] = [];
  if (root.usesPageState) {
    ctxFields.add('state');
    const initialState = root.schema.logic?.states ?? {};
    const initialStateCode =
      Object.keys(initialState).length === 0 ? '{}' : getJsonLiteralCode(initialState);
    hooks.push(`const [state, setState] = useState(${initialStateCode});`);
  }
  if (root.usesComputed) {
    ctxFields.add('computed');
    const nodes = root.computedAnalysis?.nodes ?? [];
    const assignments = nodes
      .map(
        (node) => `try {
  const value = freezeComputedOutput(${genValidatedComputedExpression(node.expression)});
  computed[${toQuotedString(node.key)}] = value === computedSkip ? undefined : value;
} catch {
  computed[${toQuotedString(node.key)}] = undefined;
}`,
      )
      .join('\n');
    const evaluatorBody = [
      genComputedValueHelpers(),
      'let state;',
      `try {
  const clonedState = cloneComputedInput(sourceState);
  state = clonedState === computedSkip ? Object.create(null) : clonedState;
} catch {
  state = Object.create(null);
}`,
      'const computed = Object.create(null);',
      assignments,
      'return Object.freeze(computed);',
    ]
      .filter(Boolean)
      .join('\n');
    hooks.push(`const computePageLogic = (sourceState) => {
${indentBlock(evaluatorBody)}
};`);

    const stateDependencies = Array.from(
      new Set(nodes.flatMap((node) => node.stateDependencies)),
    ).sort();
    const dependencyCode = stateDependencies.map((key) => getStatePathValueCode([key])).join(', ');
    hooks.push(`const computed = useMemo(() => computePageLogic(state), [${dependencyCode}]);`);
    hooks.push('const stateRef = useRef(state);');
    hooks.push('const computedRef = useRef(computed);');
    hooks.push('stateRef.current = state;');
    hooks.push('computedRef.current = computed;');
  } else if (root.usesFlows) {
    hooks.push('const stateRef = useRef(state);');
    hooks.push('stateRef.current = state;');
  }
  hooks.push(
    ...root.fields.map(
      (field) =>
        `const [${field.name}, ${field.setterName}] = useState(${getExpressionCode(field.initialValue, 'undefined', ctxFields)});`,
    ),
  );
  return hooks.join('\n');
}

function genHandlers(handlers: HandlerDeclaration[]): string {
  return handlers.map((handler) => handler.code).join('\n\n');
}

export function generate(root: RootNode): string {
  const importsCode = genImports(root.imports);
  const stateHooksCode = genStateHooks(root);
  const flowRuntimeCode = root.flowRuntimeCode ?? '';
  const handlersCode = genHandlers(root.handlers);
  const rootNode = root.children[0];
  const jsxCode =
    rootNode && rootNode.kind === 'component' && rootNode.codegenNode
      ? genJsx(rootNode.codegenNode)
      : '<></>';

  const bodySections = [stateHooksCode, flowRuntimeCode, handlersCode, `return ${jsxCode};`].filter(
    Boolean,
  );
  const lines = [importsCode, 'export default function GeneratedPage() {'];
  if (bodySections.length > 0) {
    lines.push(indentBlock(bodySections.join('\n\n')));
  }
  lines.push('}');

  return lines.filter(Boolean).join('\n');
}

export function compileSchemaToCode(schema: PageSchema, options?: CompileOptions): string {
  // 只消费 Contract 返回的 canonical 对象，绝不使用原始输入
  const canonicalSchema = requireValidPageSchema(schema as unknown);
  const ast = parseSchema(canonicalSchema as unknown as PageSchema, options);
  transform(ast);
  return generate(ast);
}
