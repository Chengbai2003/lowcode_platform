import type { A2UISchema, A2UIComponent } from '../schema-context/types/schema.types';
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
  isSafeInlineExpression,
  isStaticStringValue,
  isValidExpressionPath,
  normalizeValue,
  sanitizeUrl,
} from './security/validators';

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
  children: ComponentNode[];
  codegenNode?: JSXNode;
}

type ComponentNode = MissingComponentNode | CycleComponentNode | ResolvedComponentNode;

interface RootNode {
  type: 'root';
  schema: A2UISchema;
  options: Required<CompileOptions>;
  flatComponents: FlatComponentNode[];
  children: ComponentNode[];
  imports: Map<string, Set<string>>;
  fields: FieldInfo[];
  handlers: HandlerDeclaration[];
  helpers: Set<string>;
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
}

const LABEL_WRAPPER_MARGIN_BOTTOM = 16;
const LABEL_DISPLAY = 'block';
const LABEL_MARGIN_BOTTOM = 8;

function createCompileOptions(options?: CompileOptions): Required<CompileOptions> {
  return {
    componentSources: options?.componentSources || {},
    defaultLibrary: options?.defaultLibrary || 'antd',
  };
}

function parseProps(props: A2UIComponent['props']): PropNode[] {
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
    actions: Array.isArray(record.actions) ? record.actions.map((item) => parseAction(item)) : undefined,
    then: Array.isArray(record.then) ? record.then.map((item) => parseAction(item)) : undefined,
    else: Array.isArray(record.else) ? record.else.map((item) => parseAction(item)) : undefined,
    onSuccess: Array.isArray(record.onSuccess)
      ? record.onSuccess.map((item) => parseAction(item))
      : undefined,
    onError: Array.isArray(record.onError) ? record.onError.map((item) => parseAction(item)) : undefined,
    onOk: Array.isArray(record.onOk) ? record.onOk.map((item) => parseAction(item)) : undefined,
    onCancel: Array.isArray(record.onCancel)
      ? record.onCancel.map((item) => parseAction(item))
      : undefined,
  };
}

function parseEvents(events: A2UIComponent['events']): EventBindingNode[] {
  return Object.entries(events ?? {}).map(([eventName, actions]) => ({
    eventName,
    actions: Array.isArray(actions) ? actions.map((action) => parseAction(action)) : [],
  }));
}

function parseFlatComponent(componentId: string, component: A2UIComponent): FlatComponentNode {
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
): ComponentNode {
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
    children: flatComponent.childIds.map((childId) => buildComponentTree(childId, componentMap, nextPath)),
  };
}

export function parseSchema(schema: A2UISchema, options?: CompileOptions): RootNode {
  const optionsConfig = createCompileOptions(options);
  const flatComponents = Object.entries(schema.components ?? {}).map(([componentId, component]) =>
    parseFlatComponent(componentId, component),
  );
  const componentMap = new Map(flatComponents.map((component) => [component.id, component]));

  const children = schema.rootId
    ? [buildComponentTree(schema.rootId, componentMap, new Set<string>())]
    : [];

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
  };
}

function findProp(component: FlatComponentNode | ResolvedComponentNode, name: string): PropNode | undefined {
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
  ctx.fieldBySourceKey.set(field.sourceKey, field);
  ctx.fieldByName.set(field.name, field);
  ctx.fields.push(field);
}

function resolveFieldName(sourceKey: string, source: FieldInfo['source']): string {
  if (source === 'hiddenData') {
    return isValidIdentifier(sourceKey) ? sourceKey : toSafeIdentifier(sourceKey);
  }
  return toCamelCase(sourceKey);
}

function collectFields(ctx: TransformContext) {
  for (const component of ctx.root.flatComponents) {
    const fieldProp = findProp(component, 'field');
    if (fieldProp && fieldProp.value.kind === 'literal' && typeof fieldProp.value.value === 'string') {
      const rawFieldName = fieldProp.value.value;
      const initialValue =
        findProp(component, 'defaultValue')?.value ??
        findProp(component, 'value')?.value ??
        findProp(component, 'initialValue')?.value ?? { kind: 'literal', value: '' as const };

      registerField(
        ctx,
        createFieldInfo(resolveFieldName(rawFieldName, 'field'), rawFieldName, 'field', initialValue),
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
          resolveFieldName(component.id, 'hiddenData'),
          component.id,
          'hiddenData',
          initialValue,
        ),
      );
    }
  }
}

function addImport(ctx: TransformContext, source: string, name: string) {
  if (!ctx.imports.has(source)) {
    ctx.imports.set(source, new Set());
  }
  ctx.imports.get(source)?.add(name);
}

function collectImports(ctx: TransformContext) {
  ctx.imports.set('react', new Set(['useState']));
  ctx.imports.set(ctx.root.options.defaultLibrary, new Set(['message']));

  for (const component of ctx.root.flatComponents) {
    if (!/^[A-Z]/.test(component.componentType)) {
      continue;
    }
    const source =
      ctx.root.options.componentSources[component.componentType] || ctx.root.options.defaultLibrary;
    addImport(ctx, source, component.componentType);
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
  return {
    root,
    imports: root.imports,
    fields: root.fields,
    handlers: root.handlers,
    fieldBySourceKey: new Map(),
    fieldByName: new Map(),
    reservedHandlerNames: new Set(root.handlers.map((handler) => handler.name)),
  };
}

function toPascalIdentifier(value: string, fallback: string): string {
  const normalized = toSafeIdentifier(toCamelCase(value));
  const safeValue = normalized || fallback;
  return `${safeValue.charAt(0).toUpperCase()}${safeValue.slice(1)}`;
}

function createEventHandlerName(componentId: string, eventName: string): string {
  const componentPart = toPascalIdentifier(componentId, 'Component');
  const rawEventName = eventName.startsWith('on') && eventName.length > 2 ? eventName.slice(2) : eventName;
  const eventPart = toPascalIdentifier(rawEventName, 'Event');
  return `handle${componentPart}${eventPart}`;
}

function reserveHandlerName(ctx: TransformContext, baseName: string): string {
  let candidate = baseName;
  let suffix = 2;

  while (ctx.reservedHandlerNames.has(candidate)) {
    candidate = `${baseName}${suffix}`;
    suffix += 1;
  }

  ctx.reservedHandlerNames.add(candidate);
  return candidate;
}

function createHandlerCode(
  handlerName: string,
  bodyCode: string,
  isAsync: boolean,
  params: string[],
): string {
  const asyncKeyword = isAsync ? 'async ' : '';
  const parameterCode = params.join(', ');
  return `const ${handlerName} = ${asyncKeyword}(${parameterCode}) => {\n${indentBlock(bodyCode)}\n};`;
}

function registerHandler(
  baseName: string,
  ctx: TransformContext,
  params: string[],
  build: (handlerName: string) => { code: string; async: boolean },
): { name: string; async: boolean } {
  const handlerName = reserveHandlerName(ctx, baseName);
  const handler: HandlerDeclaration = {
    name: handlerName,
    code: '',
  };
  ctx.handlers.push(handler);

  const built = build(handlerName);
  handler.code = createHandlerCode(handlerName, built.code, built.async, params);

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
): string {
  return registerHandler(createEventHandlerName(componentId, eventName), ctx, [], (handlerName) =>
    buildActionBlock(actions, ctx, handlerName),
  ).name;
}

function registerNestedActionHandler(
  parentHandlerName: string,
  suffix: string,
  actions: ActionNode[],
  ctx: TransformContext,
  params: string[] = [],
): { name: string; async: boolean } {
  return registerHandler(`${parentHandlerName}${suffix}`, ctx, params, (handlerName) =>
    buildActionBlock(actions, ctx, handlerName),
  );
}

function registerNestedCodeHandler(
  parentHandlerName: string,
  suffix: string,
  ctx: TransformContext,
  params: string[],
  build: (handlerName: string) => { code: string; async: boolean },
): { name: string; async: boolean } {
  return registerHandler(`${parentHandlerName}${suffix}`, ctx, params, build);
}

function getFieldInfo(ctx: TransformContext, sourceKey: string): FieldInfo | undefined {
  return ctx.fieldBySourceKey.get(sourceKey) ?? ctx.fieldByName.get(sourceKey);
}

function getExpressionCode(value: ValueNode | undefined, fallback = 'undefined'): string {
  if (!value) return fallback;

  switch (value.kind) {
    case 'literal':
      if (typeof value.value === 'string') return toQuotedString(value.value);
      if (value.value === undefined) return 'undefined';
      return String(value.value);
    case 'expression': {
      const code = value.code.trim();
      if (!code) return fallback;
      const valid = value.source === 'legacy' ? isValidExpressionPath(code) : isSafeInlineExpression(code);
      return valid ? code : fallback;
    }
    case 'template':
      return `\`${value.parts
        .map((part) =>
          part.kind === 'text'
            ? escapeTemplateText(part.value)
            : `\${${getExpressionCode(part.value, '""')}}`,
        )
        .join('')}\``;
    case 'array':
      return `[${value.items.map((item) => getExpressionCode(item, 'undefined')).join(', ')}]`;
    case 'object':
      return `{ ${value.properties
        .map((property) => `${toObjectKeyCode(property.key)}: ${getExpressionCode(property.value, 'undefined')}`)
        .join(', ')} }`;
    default:
      return fallback;
  }
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

function createAttribute(name: string, value: ValueNode, fallback = 'undefined'): JSXAttributeNode {
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
    value: getExpressionCode(value, fallback),
  };
}

function createValueChild(value: ValueNode): JSXNode | null {
  if (value.kind === 'literal') {
    if (value.value === null || value.value === undefined) {
      return null;
    }
    if (typeof value.value === 'string') {
      return { kind: 'text', value: value.value };
    }
    return { kind: 'expression', code: getExpressionCode(value, 'null') };
  }

  return {
    kind: 'expression',
    code: getExpressionCode(value, '""'),
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

function buildComponentNode(node: ComponentNode, ctx: TransformContext): JSXNode {
  if (node.kind === 'missing') {
    return createMissingNode(node.id);
  }

  if (node.kind === 'cycle') {
    return {
      kind: 'fragment',
      children: [createCommentNode(`Circular ref: ${node.id}`)],
    };
  }

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

    attributes.push(createAttribute(prop.name, prop.value, '""'));
  }

  if (fieldProp && fieldProp.value.kind === 'literal' && typeof fieldProp.value.value === 'string') {
    const fieldInfo = getFieldInfo(ctx, fieldProp.value.value);
    if (fieldInfo) {
      attributes.push(...buildFieldBinding(fieldInfo));
    }
  }

  for (const event of node.events) {
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
          value: getExpressionCode(normalizeValue(compiled.styleObj), '{}'),
        });
      }
    } else {
      attributes.push({
        name: 'style',
        mode: 'expression',
        value: getExpressionCode(styleProp.value, '{}'),
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
      attributes.push(createAttribute('className', classNameProp.value, '""'));
    }
  }

  const children: JSXNode[] = [];
  if (node.children.length > 0) {
    for (const child of node.children) {
      children.push(buildComponentNode(child, ctx));
    }
  } else if (childrenProp) {
    const childNode = createValueChild(childrenProp.value);
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

  const conditionCode = getExpressionCode(visibleProp.value, 'false');
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

function resolveResultTarget(resultTo: string | undefined, ctx: TransformContext, valueCode: string): string {
  if (!resultTo) {
    return valueCode;
  }

  const fieldInfo = getFieldInfo(ctx, resultTo);
  if (fieldInfo) {
    return `${fieldInfo.setterName}(${valueCode});`;
  }

  if (resultTo.startsWith('state.')) {
    const stateKey = resultTo.slice(6);
    return `setState({ ${toObjectKeyCode(stateKey)}: ${valueCode} });`;
  }

  return `${resultTo} = ${valueCode};`;
}

function buildActionBlock(
  actions: ActionNode[],
  ctx: TransformContext,
  ownerHandlerName: string,
): { code: string; async: boolean } {
  const segments = actions.map((action) => buildActionStatement(action, ctx, ownerHandlerName));
  return {
    code: segments.map((segment) => segment.code).filter(Boolean).join('\n'),
    async: segments.some((segment) => segment.async),
  };
}

function buildNotificationObject(action: ActionNode): string {
  const props: string[] = [
    `message: ${getExpressionCode(action.title ?? { kind: 'literal', value: '通知' }, '"通知"')}`,
    `description: ${getExpressionCode(action.content ?? { kind: 'literal', value: '' }, '""')}`,
  ];

  if (action.placement) {
    props.push(`placement: ${toQuotedString(action.placement)}`);
  }
  if (typeof action.duration === 'number') {
    props.push(`duration: ${action.duration}`);
  }

  return `{ ${props.join(', ')} }`;
}

function buildActionStatement(action: ActionNode, ctx: TransformContext, ownerHandlerName: string): { code: string; async: boolean } {
  switch (action.type) {
    case 'setValue': {
      const valueCode = getExpressionCode(action.value ?? { kind: 'literal', value: '' }, 'undefined');
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
          const stateKey = action.field.slice(6);
          return {
            code: `setState({ ${toObjectKeyCode(stateKey)}: ${valueCode} });`,
            async: false,
          };
        }

        return { code: `/* Field ${action.field} not found */`, async: false };
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
          )}`,
        );
      }
      if (action.body) {
        configParts.push(`body: JSON.stringify(${getExpressionCode(action.body, 'undefined')})`);
      }

      const urlCode = getExpressionCode(action.url ?? { kind: 'literal', value: '/' }, '"/"');
      const paramsCode = action.params
        ? `const requestParams = ${getExpressionCode(
            {
              kind: 'object',
              properties: Object.entries(action.params).map(([key, value]) => ({ key, value })),
            },
            '{}',
          )};\nconst queryString = new URLSearchParams(Object.entries(requestParams).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)])).toString();\nconst requestUrl = queryString ? (${urlCode}).includes('?') ? ${urlCode} + '&' + queryString : ${urlCode} + '?' + queryString : ${urlCode};`
        : `const requestUrl = ${urlCode};`;

      const successHandler =
        action.resultTo || (action.onSuccess?.length ?? 0) > 0
          ? registerNestedCodeHandler(ownerHandlerName, 'OnSuccess', ctx, ['response'], (handlerName) => {
              const onSuccess = buildActionBlock(action.onSuccess ?? [], ctx, handlerName);
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
            })
          : undefined;
      const errorHandler = registerNestedCodeHandler(ownerHandlerName, 'OnError', ctx, ['error'], (handlerName) => {
        const onError = buildActionBlock(action.onError ?? [], ctx, handlerName);
        return {
          code: onError.code || 'console.error(error);',
          async: onError.async,
        };
      });

      const successChain = successHandler ? `\n  .then(${successHandler.name})` : '';

      return {
        code: `${paramsCode}\nfetch(requestUrl, { ${configParts.join(', ')} })\n  .then((res) => res.json())${successChain}\n  .catch(${errorHandler.name});`,
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
      return {
        code: `window.location.href = ${getExpressionCode(action.to ?? { kind: 'literal', value: '/' }, '"/"')};`,
        async: false,
      };
    }
    case 'feedback': {
      const level = action.level || 'info';
      if (action.kind === 'notification') {
        return { code: `notification.${level}(${buildNotificationObject(action)});`, async: false };
      }
      return {
        code: `message.${level}(${getExpressionCode(action.content ?? { kind: 'literal', value: '' }, '""')});`,
        async: false,
      };
    }
    case 'dialog': {
      const kind = action.kind || 'modal';
      const titleCode = getExpressionCode(
        action.title ?? { kind: 'literal', value: kind === 'confirm' ? '确认' : '提示' },
        kind === 'confirm' ? '"确认"' : '"提示"',
      );
      const contentCode = getExpressionCode(action.content ?? { kind: 'literal', value: '' }, '""');
      const objectParts = [`title: ${titleCode}`, `content: ${contentCode}`];

      if (kind === 'confirm') {
        const onOkHandler = action.onOk?.length
          ? registerNestedActionHandler(ownerHandlerName, 'OnOk', action.onOk, ctx)
          : undefined;
        const onCancelHandler = action.onCancel?.length
          ? registerNestedActionHandler(ownerHandlerName, 'OnCancel', action.onCancel, ctx)
          : undefined;

        if (onOkHandler) {
          objectParts.push(`onOk: ${onOkHandler.name}`);
        }
        if (onCancelHandler) {
          objectParts.push(`onCancel: ${onCancelHandler.name}`);
        }
        return {
          code: `Modal.confirm({ ${objectParts.join(', ')} });`,
          async: Boolean(onOkHandler?.async) || Boolean(onCancelHandler?.async),
        };
      }

      return { code: `Modal.info({ ${objectParts.join(', ')} });`, async: false };
    }
    case 'if': {
      const thenBlock = buildActionBlock(action.then ?? [], ctx, ownerHandlerName);
      const elseBlock = buildActionBlock(action.else ?? [], ctx, ownerHandlerName);
      const elseCode = elseBlock.code ? ` else {\n${indentBlock(elseBlock.code)}\n}` : '';
      return {
        code: `if (${getExpressionCode(action.condition ?? { kind: 'literal', value: false }, 'false')}) {\n${indentBlock(thenBlock.code)}\n}${elseCode}`,
        async: thenBlock.async || elseBlock.async,
      };
    }
    case 'loop': {
      const loopBlock = buildActionBlock(action.actions ?? [], ctx, ownerHandlerName);
      const itemVar = action.itemVar || 'item';
      if (action.indexVar) {
        return {
          code: `for (const [${action.indexVar}, ${itemVar}] of ${getExpressionCode(action.over ?? { kind: 'array', items: [] }, '[]')}.entries()) {\n${indentBlock(loopBlock.code)}\n}`,
          async: loopBlock.async,
        };
      }
      return {
        code: `for (const ${itemVar} of ${getExpressionCode(action.over ?? { kind: 'array', items: [] }, '[]')}) {\n${indentBlock(loopBlock.code)}\n}`,
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
        code: `console.${action.level || 'log'}(${getExpressionCode(action.value ?? { kind: 'literal', value: '' }, '""')});`,
        async: false,
      };
    case 'customScript': {
      const snippet = (action.code || '').slice(0, 60).replace(/\s+/g, ' ').trim();
      return {
        code: `/* Custom Script omitted${snippet ? `: ${snippet}` : ''} */`,
        async: false,
      };
    }
    default:
      return { code: `/* Unknown action: ${action.type} */`, async: false };
  }
}

export function transform(root: RootNode): void {
  const ctx = createTransformContext(root);
  collectImports(ctx);
  collectFields(ctx);

  root.imports = ctx.imports;
  root.fields = ctx.fields;
  root.handlers = ctx.handlers;
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
      return `{/* ${node.text} */}`;
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
      statements.push(`import React, { ${sortedNames.join(', ')} } from ${toQuotedString(source)};`);
      continue;
    }
    statements.push(`import { ${sortedNames.join(', ')} } from ${toQuotedString(source)};`);
  }
  return statements.join('\n');
}

function genStateHooks(fields: FieldInfo[]): string {
  return fields
    .map(
      (field) =>
        `const [${field.name}, ${field.setterName}] = useState(${getExpressionCode(field.initialValue, 'undefined')});`,
    )
    .join('\n');
}

function genHandlers(handlers: HandlerDeclaration[]): string {
  return handlers.map((handler) => handler.code).join('\n\n');
}

export function generate(root: RootNode): string {
  const importsCode = genImports(root.imports);
  const stateHooksCode = genStateHooks(root.fields);
  const handlersCode = genHandlers(root.handlers);
  const rootNode = root.children[0];
  const jsxCode =
    rootNode && rootNode.kind === 'component' && rootNode.codegenNode
      ? genJsx(rootNode.codegenNode)
      : '<></>';

  const bodySections = [stateHooksCode, handlersCode, `return ${jsxCode};`].filter(Boolean);
  const lines = [importsCode, 'export default function GeneratedPage() {'];
  if (bodySections.length > 0) {
    lines.push(indentBlock(bodySections.join('\n\n')));
  }
  lines.push('}');

  return lines.filter(Boolean).join('\n');
}

export function compileSchemaToCode(schema: A2UISchema, options?: CompileOptions): string {
  const ast = parseSchema(schema, options);
  transform(ast);
  return generate(ast);
}





