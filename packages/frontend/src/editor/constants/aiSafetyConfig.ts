/**
 * AI 安全配置
 * 定义组件类型白名单、属性范围、危险模式等安全策略
 */

import type { AISafetyConfig } from '../utils/validationTypes';

/**
 * 组件类型白名单
 * AI 只能操作这些已注册的组件类型
 */
export const ALLOWED_COMPONENT_TYPES: string[] = [
  // 布局组件
  'Container',
  'Div',
  'Space',
  'Divider',
  'Row',
  'Col',
  'Layout',
  'Header',
  'Content',
  'Footer',
  'Sider',

  // 基础组件
  'Button',
  'Input',
  'TextArea',
  'InputNumber',
  'Select',
  'Checkbox',
  'CheckboxGroup',
  'Radio',
  'RadioGroup',
  'RadioButton',
  'Switch',
  'Slider',

  // 表单
  'Form',
  'FormItem',

  // 数据展示
  'Table',
  'Card',
  'List',
  'ListItem',
  'Tabs',
  'TabPane',
  'Collapse',
  'CollapsePanel',

  // 反馈
  'Modal',
  'Popover',
  'Tooltip',
  'Alert',
  'Progress',
  'Spin',
  'Skeleton',

  // 排版
  'Typography',
  'Text',
  'Title',
  'Paragraph',

  // 其他
  'Tag',
  'Badge',
  'Steps',
  'Step',
  'DatePicker',
  'RangePicker',

  // 特殊
  'Page', // 页面根组件
];

/**
 * 组件类型别名映射（AI 幻觉修正）
 */
export const COMPONENT_TYPE_ALIASES: Record<string, string> = {
  // Layout aliases
  Btn: 'Button',
  btn: 'Button',
  Box: 'Container',
  Flex: 'Space',
  FlexBox: 'Space',
  Grid: 'Row',
  Panel: 'Card',
  Section: 'Container',
  Div: 'Container',

  // Form aliases
  TextInput: 'Input',
  TextField: 'Input',
  Textarea: 'TextArea',
  textarea: 'TextArea',
  SelectBox: 'Select',
  Dropdown: 'Select',
  NumInput: 'InputNumber',
  Toggle: 'Switch',
  CheckBox: 'Checkbox',

  // Typography aliases
  Heading: 'Title',
  H1: 'Title',
  H2: 'Title',
  H3: 'Title',
  Label: 'Text',
  Span: 'Text',
  Paragraph: 'Text',
  P: 'Paragraph',

  // Media aliases
  Image: 'Container',
  Img: 'Container',
  Loading: 'Spin',
  Progressbar: 'Progress',
};

/**
 * 每个组件允许的属性白名单
 * 限制 AI 可操作的属性范围
 */
export const ALLOWED_PROPERTIES: Record<string, string[]> = {
  // 通用属性（所有组件都有）
  _common: ['id', 'className', 'style', 'children', 'key'],

  // 布局组件
  Container: ['className', 'style', 'children'],
  Space: ['size', 'direction', 'align', 'wrap', 'split'],
  Divider: ['type', 'orientation', 'dashed', 'plain', 'children'],

  // 基础组件
  Button: [
    'type',
    'children',
    'disabled',
    'loading',
    'size',
    'block',
    'danger',
    'icon',
    'href',
    'target',
  ],
  Input: [
    'value',
    'defaultValue',
    'placeholder',
    'disabled',
    'size',
    'prefix',
    'suffix',
    'allowClear',
    'maxLength',
    'type',
  ],
  TextArea: [
    'value',
    'defaultValue',
    'placeholder',
    'disabled',
    'rows',
    'maxLength',
    'allowClear',
    'showCount',
  ],
  InputNumber: [
    'value',
    'defaultValue',
    'placeholder',
    'disabled',
    'min',
    'max',
    'step',
    'precision',
    'size',
  ],
  Select: [
    'value',
    'defaultValue',
    'placeholder',
    'disabled',
    'size',
    'mode',
    'allowClear',
    'showSearch',
    'options',
  ],
  Switch: ['checked', 'defaultChecked', 'disabled', 'size', 'loading'],
  Checkbox: ['checked', 'defaultChecked', 'disabled', 'indeterminate', 'children'],
  Radio: ['checked', 'defaultChecked', 'disabled', 'value'],

  // 数据展示
  Card: ['title', 'extra', 'bordered', 'loading', 'size', 'hoverable', 'children'],
  Table: ['columns', 'dataSource', 'rowKey', 'pagination', 'loading', 'size', 'bordered'],
  List: ['dataSource', 'renderItem', 'loading', 'size', 'bordered', 'split'],
  Tabs: ['activeKey', 'defaultActiveKey', 'type', 'size', 'tabPosition', 'items'],
  TabPane: ['tab', 'key', 'disabled', 'forceRender'],

  // 反馈组件
  Alert: ['message', 'description', 'type', 'closable', 'showIcon', 'banner'],
  Modal: ['open', 'title', 'children', 'footer', 'closable', 'maskClosable', 'width', 'centered'],
  Progress: ['percent', 'type', 'size', 'status', 'strokeWidth', 'showInfo'],
  Spin: ['spinning', 'size', 'tip', 'delay'],
  Tooltip: ['title', 'placement', 'trigger', 'open'],

  // 排版
  Typography: ['children'],
  Text: [
    'children',
    'type',
    'disabled',
    'mark',
    'code',
    'copyable',
    'delete',
    'underline',
    'strong',
    'italic',
  ],
  Title: ['children', 'level', 'type'],
  Paragraph: ['children', 'ellipsis', 'copyable'],

  // 其他
  Tag: ['children', 'color', 'closable', 'bordered'],
  Badge: ['count', 'dot', 'size', 'color', 'overflowCount', 'showZero'],
  Steps: ['current', 'items', 'size', 'direction', 'status'],
  Form: ['layout', 'size', 'labelAlign', 'labelCol', 'wrapperCol'],
  FormItem: ['label', 'name', 'required', 'rules', 'valuePropName'],
};

/**
 * 必填属性（按组件类型）
 */
export const REQUIRED_PROPERTIES: Record<string, string[]> = {
  Button: ['children'],
  Input: [],
  Select: ['options'],
  Alert: ['message'],
  Progress: ['percent'],
};

/**
 * 危险属性模式（正则表达式）
 * 这些属性可能被用于注入攻击
 */
export const DANGEROUS_PROPERTY_PATTERNS: string[] = [
  'dangerouslySetInnerHTML',
  '__html',
  'innerHTML',
  'outerHTML',
  'document\\.',
  'window\\.',
  'eval',
  'Function',
];

/**
 * 危险值模式
 * 检测可能包含恶意代码的属性值
 */
export const DANGEROUS_VALUE_PATTERNS: string[] = [
  // JavaScript 代码注入
  'javascript:',
  'data:text/html',
  'vbscript:',

  // XSS 相关
  '<script',
  '</script>',
  'onerror=',
  'onload=',
  'onclick=',
  'onmouseover=',
  'onfocus=',
  'onblur=',

  // 表达式注入
  '\\$\\{[^}]*\\}', // 模板字符串注入
  '\\{\\{[^}]*\\}\\}', // 模板语法注入

  // eval 相关
  'eval(',
  'setTimeout(',
  'setInterval(',
  'new Function(',

  // DOM 操作
  'document\\.cookie',
  'document\\.write',
  'document\\.writeln',
  '\\.innerHTML\\s*=',
  '\\.outerHTML\\s*=',

  // 敏感信息
  'password',
  'secret',
  'apikey',
  'api_key',
  'access_token',
];

/**
 * 禁止的事件处理器模式
 * AI 不应生成这些事件处理器
 */
export const BLOCKED_EVENT_PATTERNS: string[] = [
  // 可能执行任意代码的事件
  'onLoad.*eval',
  'onError.*eval',
  'onMessage.*eval',

  // 危险 DOM 操作
  '.*document\\.cookie.*',
  '.*document\\.write.*',
];

/**
 * 禁止的事件动作类型
 * 这些动作类型可能执行任意代码
 */
export const DANGEROUS_ACTION_TYPES: string[] = [
  'eval',
  'execute',
  'runCode',
  'exec',
  'runScript',
  'evaluate',
];

/**
 * 默认 Schema 限制
 */
export const DEFAULT_LIMITS = {
  maxSchemaSize: 1024 * 1024, // 1MB
  maxComponents: 500, // 最多 500 个组件
  maxDepth: 10, // 最大嵌套 10 层
  maxPropsPerComponent: 50, // 每个组件最多 50 个属性
  maxStringLength: 10000, // 字符串属性最大长度
};

/**
 * 获取完整的安全配置
 */
export function getAISafetyConfig(): AISafetyConfig {
  return {
    allowedComponentTypes: ALLOWED_COMPONENT_TYPES,
    allowedProperties: ALLOWED_PROPERTIES,
    requiredProperties: REQUIRED_PROPERTIES,
    dangerousPropertyPatterns: DANGEROUS_PROPERTY_PATTERNS,
    dangerousValuePatterns: DANGEROUS_VALUE_PATTERNS,
    blockedEventPatterns: BLOCKED_EVENT_PATTERNS,
    limits: DEFAULT_LIMITS,
  };
}

/**
 * 获取规范化的组件类型
 * 将 AI 可能生成的非标准名称转换为标准名称
 */
export function normalizeComponentType(type: string): string {
  return COMPONENT_TYPE_ALIASES[type] || type;
}

/**
 * 检查组件类型是否在白名单中
 */
export function isComponentTypeAllowed(type: string, customWhitelist?: string[]): boolean {
  const whitelist = customWhitelist || ALLOWED_COMPONENT_TYPES;
  return whitelist.includes(type) || whitelist.includes(normalizeComponentType(type));
}

/**
 * 检查属性是否允许
 */
export function isPropertyAllowed(componentType: string, propertyKey: string): boolean {
  const commonProps = ALLOWED_PROPERTIES['_common'] || [];
  const componentProps = ALLOWED_PROPERTIES[componentType] || [];

  return commonProps.includes(propertyKey) || componentProps.includes(propertyKey);
}

/**
 * 检查值是否包含危险模式
 */
export function containsDangerousPattern(value: unknown): {
  dangerous: boolean;
  pattern?: string;
} {
  if (typeof value !== 'string') {
    return { dangerous: false };
  }

  for (const pattern of DANGEROUS_VALUE_PATTERNS) {
    try {
      const regex = new RegExp(pattern, 'gi');
      if (regex.test(value)) {
        return { dangerous: true, pattern };
      }
    } catch {
      // 忽略无效正则
    }
  }

  return { dangerous: false };
}
