import { Injectable } from '@nestjs/common';
import { BackendComponentMeta } from './component-meta.types';

const REGISTRY: readonly BackendComponentMeta[] = [
  // --- layout ---
  {
    type: 'Container',
    displayName: '容器',
    category: 'layout',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'style', label: '样式', type: 'json' },
      { key: 'className', label: '类名', type: 'string' },
    ],
  },
  {
    type: 'Div',
    displayName: '容器',
    category: 'layout',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'style', label: '样式', type: 'json' },
      { key: 'className', label: '类名', type: 'string' },
    ],
  },
  {
    type: 'Space',
    displayName: '间距',
    category: 'layout',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'size', label: '间距大小', type: 'select', defaultValue: 'small' },
      { key: 'direction', label: '方向', type: 'select', defaultValue: 'horizontal' },
    ],
  },
  {
    type: 'Divider',
    displayName: '分割线',
    category: 'layout',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'orientation', label: '标题位置', type: 'select', defaultValue: 'center' },
      { key: 'dashed', label: '虚线', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'Row',
    displayName: '行',
    category: 'layout',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'gutter', label: '间距', type: 'number', defaultValue: 0 },
      { key: 'justify', label: '水平排列', type: 'select', defaultValue: 'start' },
      { key: 'align', label: '垂直对齐', type: 'select', defaultValue: 'top' },
    ],
  },
  {
    type: 'Col',
    displayName: '列',
    category: 'layout',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'span', label: '栅格占位', type: 'number', defaultValue: 24 },
      { key: 'offset', label: '偏移', type: 'number', defaultValue: 0 },
    ],
  },
  {
    type: 'Layout',
    displayName: '布局',
    category: 'layout',
    isContainer: true,
    textProps: [],
    properties: [{ key: 'style', label: '样式', type: 'json' }],
  },
  {
    type: 'Header',
    displayName: '页头',
    category: 'layout',
    isContainer: true,
    textProps: [],
    properties: [{ key: 'style', label: '样式', type: 'json' }],
  },
  {
    type: 'Content',
    displayName: '内容区',
    category: 'layout',
    isContainer: true,
    textProps: [],
    properties: [{ key: 'style', label: '样式', type: 'json' }],
  },
  {
    type: 'Footer',
    displayName: '页脚',
    category: 'layout',
    isContainer: true,
    textProps: [],
    properties: [{ key: 'style', label: '样式', type: 'json' }],
  },
  {
    type: 'Sider',
    displayName: '侧边栏',
    category: 'layout',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'width', label: '宽度', type: 'number', defaultValue: 200 },
      { key: 'collapsible', label: '可折叠', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'Page',
    displayName: '页面',
    category: 'layout',
    isContainer: true,
    textProps: [],
    properties: [{ key: 'style', label: '样式', type: 'json' }],
  },
  // --- form ---
  {
    type: 'Button',
    displayName: '按钮',
    category: 'form',
    isContainer: false,
    textProps: ['children'],
    properties: [
      { key: 'children', label: '文字', type: 'string', defaultValue: '按钮' },
      { key: 'type', label: '类型', type: 'select', defaultValue: 'default' },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
      { key: 'loading', label: '加载中', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'Input',
    displayName: '输入框',
    category: 'form',
    isContainer: false,
    textProps: ['placeholder', 'defaultValue'],
    properties: [
      { key: 'placeholder', label: '占位文字', type: 'string' },
      { key: 'defaultValue', label: '默认值', type: 'string' },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
      { key: 'maxLength', label: '最大长度', type: 'number' },
    ],
  },
  {
    type: 'TextArea',
    displayName: '文本域',
    category: 'form',
    isContainer: false,
    textProps: ['placeholder', 'defaultValue'],
    properties: [
      { key: 'placeholder', label: '占位文字', type: 'string' },
      { key: 'defaultValue', label: '默认值', type: 'string' },
      { key: 'rows', label: '行数', type: 'number', defaultValue: 4 },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'InputNumber',
    displayName: '数字输入框',
    category: 'form',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'min', label: '最小值', type: 'number' },
      { key: 'max', label: '最大值', type: 'number' },
      { key: 'defaultValue', label: '默认值', type: 'number' },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'Select',
    displayName: '下拉选择',
    category: 'form',
    isContainer: false,
    textProps: ['placeholder'],
    properties: [
      { key: 'placeholder', label: '占位文字', type: 'string' },
      { key: 'options', label: '选项', type: 'json' },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
      { key: 'mode', label: '模式', type: 'select' },
    ],
  },
  {
    type: 'Checkbox',
    displayName: '复选框',
    category: 'form',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'defaultChecked', label: '默认选中', type: 'boolean', defaultValue: false },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'CheckboxGroup',
    displayName: '复选框组',
    category: 'form',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'options', label: '选项', type: 'json' },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'Radio',
    displayName: '单选框',
    category: 'form',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'defaultChecked', label: '默认选中', type: 'boolean', defaultValue: false },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'RadioGroup',
    displayName: '单选框组',
    category: 'form',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'options', label: '选项', type: 'json' },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'RadioButton',
    displayName: '单选按钮',
    category: 'form',
    isContainer: false,
    textProps: [],
    properties: [{ key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false }],
  },
  {
    type: 'Switch',
    displayName: '开关',
    category: 'form',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'defaultChecked', label: '默认开启', type: 'boolean', defaultValue: false },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'Slider',
    displayName: '滑块',
    category: 'form',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'min', label: '最小值', type: 'number', defaultValue: 0 },
      { key: 'max', label: '最大值', type: 'number', defaultValue: 100 },
      { key: 'defaultValue', label: '默认值', type: 'number', defaultValue: 0 },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'Form',
    displayName: '表单',
    category: 'form',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'layout', label: '布局', type: 'select', defaultValue: 'horizontal' },
      { key: 'labelCol', label: '标签列', type: 'json' },
    ],
  },
  {
    type: 'FormItem',
    displayName: '表单项',
    category: 'form',
    isContainer: true,
    textProps: ['label'],
    properties: [
      { key: 'label', label: '标签', type: 'string' },
      { key: 'name', label: '字段名', type: 'string' },
      { key: 'required', label: '必填', type: 'boolean', defaultValue: false },
    ],
  },
  // --- display ---
  {
    type: 'Table',
    displayName: '表格',
    category: 'display',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'columns', label: '列配置', type: 'json' },
      { key: 'dataSource', label: '数据源', type: 'expression' },
      { key: 'pagination', label: '分页', type: 'boolean', defaultValue: true },
    ],
  },
  {
    type: 'Card',
    displayName: '卡片',
    category: 'display',
    isContainer: true,
    textProps: ['title'],
    properties: [
      { key: 'title', label: '标题', type: 'string' },
      { key: 'bordered', label: '边框', type: 'boolean', defaultValue: true },
      { key: 'size', label: '尺寸', type: 'select', defaultValue: 'default' },
    ],
  },
  {
    type: 'List',
    displayName: '列表',
    category: 'display',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'dataSource', label: '数据源', type: 'expression' },
      { key: 'bordered', label: '边框', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'ListItem',
    displayName: '列表项',
    category: 'display',
    isContainer: false,
    textProps: [],
    properties: [{ key: 'style', label: '样式', type: 'json' }],
  },
  {
    type: 'Tabs',
    displayName: '标签页',
    category: 'display',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'defaultActiveKey', label: '默认激活', type: 'string' },
      { key: 'type', label: '类型', type: 'select', defaultValue: 'line' },
    ],
  },
  {
    type: 'TabPane',
    displayName: '标签面板',
    category: 'display',
    isContainer: true,
    textProps: ['tab'],
    properties: [
      { key: 'tab', label: '标签名', type: 'string' },
      { key: 'key', label: 'Key', type: 'string' },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'Collapse',
    displayName: '折叠面板',
    category: 'display',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'defaultActiveKey', label: '默认展开', type: 'json' },
      { key: 'accordion', label: '手风琴', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'CollapsePanel',
    displayName: '折叠面板项',
    category: 'display',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'header', label: '标题', type: 'string' },
      { key: 'key', label: 'Key', type: 'string' },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
  // --- feedback ---
  {
    type: 'Modal',
    displayName: '弹窗',
    category: 'feedback',
    isContainer: true,
    textProps: ['title'],
    properties: [
      { key: 'title', label: '标题', type: 'string' },
      { key: 'open', label: '显示', type: 'boolean', defaultValue: false },
      { key: 'width', label: '宽度', type: 'number', defaultValue: 520 },
    ],
  },
  {
    type: 'Popover',
    displayName: '气泡卡片',
    category: 'feedback',
    isContainer: false,
    textProps: ['title'],
    properties: [
      { key: 'title', label: '标题', type: 'string' },
      { key: 'content', label: '内容', type: 'string' },
      { key: 'trigger', label: '触发方式', type: 'select', defaultValue: 'hover' },
    ],
  },
  {
    type: 'Tooltip',
    displayName: '文字提示',
    category: 'feedback',
    isContainer: false,
    textProps: ['title'],
    properties: [
      { key: 'title', label: '提示内容', type: 'string' },
      { key: 'placement', label: '位置', type: 'select', defaultValue: 'top' },
    ],
  },
  {
    type: 'Alert',
    displayName: '提示',
    category: 'feedback',
    isContainer: false,
    textProps: ['message', 'description'],
    properties: [
      { key: 'message', label: '标题', type: 'string' },
      { key: 'description', label: '描述', type: 'string' },
      { key: 'type', label: '类型', type: 'select', defaultValue: 'info' },
      { key: 'showIcon', label: '显示图标', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'Progress',
    displayName: '进度条',
    category: 'feedback',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'percent', label: '进度', type: 'number', defaultValue: 0 },
      { key: 'type', label: '类型', type: 'select', defaultValue: 'line' },
      { key: 'status', label: '状态', type: 'select' },
    ],
  },
  {
    type: 'Spin',
    displayName: '加载中',
    category: 'feedback',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'spinning', label: '加载中', type: 'boolean', defaultValue: true },
      { key: 'size', label: '尺寸', type: 'select', defaultValue: 'default' },
    ],
  },
  {
    type: 'Skeleton',
    displayName: '骨架屏',
    category: 'feedback',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'active', label: '动画效果', type: 'boolean', defaultValue: false },
      { key: 'loading', label: '显示骨架', type: 'boolean', defaultValue: true },
    ],
  },
  // --- typography ---
  {
    type: 'Typography',
    displayName: '排版',
    category: 'typography',
    isContainer: false,
    textProps: ['children'],
    properties: [{ key: 'children', label: '内容', type: 'string' }],
  },
  {
    type: 'Text',
    displayName: '文本',
    category: 'typography',
    isContainer: false,
    textProps: ['children'],
    properties: [
      { key: 'children', label: '内容', type: 'string' },
      { key: 'type', label: '类型', type: 'select' },
      { key: 'strong', label: '加粗', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'Title',
    displayName: '标题',
    category: 'typography',
    isContainer: false,
    textProps: ['children'],
    properties: [
      { key: 'children', label: '内容', type: 'string' },
      { key: 'level', label: '级别', type: 'number', defaultValue: 1 },
    ],
  },
  {
    type: 'Paragraph',
    displayName: '段落',
    category: 'typography',
    isContainer: false,
    textProps: ['children'],
    properties: [
      { key: 'children', label: '内容', type: 'string' },
      { key: 'ellipsis', label: '省略', type: 'boolean', defaultValue: false },
    ],
  },
  // --- other ---
  {
    type: 'Tag',
    displayName: '标签',
    category: 'other',
    isContainer: false,
    textProps: ['children'],
    properties: [
      { key: 'children', label: '内容', type: 'string' },
      { key: 'color', label: '颜色', type: 'string' },
      { key: 'closable', label: '可关闭', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'Badge',
    displayName: '徽标',
    category: 'other',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'count', label: '数量', type: 'number', defaultValue: 0 },
      { key: 'dot', label: '小圆点', type: 'boolean', defaultValue: false },
      { key: 'status', label: '状态', type: 'select' },
    ],
  },
  {
    type: 'Steps',
    displayName: '步骤条',
    category: 'other',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'current', label: '当前步骤', type: 'number', defaultValue: 0 },
      { key: 'direction', label: '方向', type: 'select', defaultValue: 'horizontal' },
    ],
  },
  {
    type: 'Step',
    displayName: '步骤',
    category: 'other',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'title', label: '标题', type: 'string' },
      { key: 'description', label: '描述', type: 'string' },
      { key: 'status', label: '状态', type: 'select' },
    ],
  },
  {
    type: 'DatePicker',
    displayName: '日期选择',
    category: 'other',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'placeholder', label: '占位文字', type: 'string' },
      { key: 'format', label: '格式', type: 'string', defaultValue: 'YYYY-MM-DD' },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'RangePicker',
    displayName: '日期范围选择',
    category: 'other',
    isContainer: false,
    textProps: [],
    properties: [
      { key: 'format', label: '格式', type: 'string', defaultValue: 'YYYY-MM-DD' },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
    ],
  },
];

const ALIASES = new Map<string, string>([
  ['Btn', 'Button'],
  ['btn', 'Button'],
  ['Box', 'Container'],
  ['Flex', 'Space'],
  ['FlexBox', 'Space'],
  ['Grid', 'Row'],
  ['Panel', 'Card'],
  ['Section', 'Container'],
  ['TextInput', 'Input'],
  ['TextField', 'Input'],
  ['Textarea', 'TextArea'],
  ['textarea', 'TextArea'],
  ['SelectBox', 'Select'],
  ['Dropdown', 'Select'],
  ['NumInput', 'InputNumber'],
  ['Toggle', 'Switch'],
  ['CheckBox', 'Checkbox'],
  ['Heading', 'Title'],
  ['H1', 'Title'],
  ['H2', 'Title'],
  ['H3', 'Title'],
  ['Label', 'Text'],
  ['Span', 'Text'],
  ['P', 'Paragraph'],
  ['Image', 'Container'],
  ['Img', 'Container'],
  ['Loading', 'Spin'],
  ['Progressbar', 'Progress'],
]);

@Injectable()
export class ComponentMetaRegistry {
  private readonly registry: ReadonlyMap<string, BackendComponentMeta>;

  constructor() {
    this.registry = new Map(REGISTRY.map((meta) => [meta.type, meta]));
  }

  get(type: string): BackendComponentMeta | undefined {
    return this.registry.get(type);
  }

  resolve(type: string): BackendComponentMeta | undefined {
    const resolved = ALIASES.get(type) ?? type;
    return this.registry.get(resolved);
  }

  getAllTypeNames(): string[] {
    return Array.from(this.registry.keys());
  }

  getAll(): BackendComponentMeta[] {
    return Array.from(this.registry.values());
  }

  getDisplayName(type: string): string | undefined {
    return this.resolve(type)?.displayName;
  }

  isContainer(type: string): boolean {
    return this.resolve(type)?.isContainer ?? false;
  }

  getTextProps(type: string): string[] {
    return [...(this.resolve(type)?.textProps ?? [])];
  }
}
