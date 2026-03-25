/**
 * @lowcode-platform/frontend
 *
 * A2UI 低代码平台前端统一入口
 * 包含：类型定义、渲染引擎、组件库、编辑器
 */

// Styles
import './style.css';

// ============================================
// Types
// ============================================
export * from './types';

// ============================================
// Components
// ============================================
export {
  // Layout Components
  Container,
  Space,
  Divider,
  Row,
  Col,
  Layout,
  Header,
  Content,
  Footer,
  // Form Components
  Button,
  Input,
  TextArea,
  InputNumber,
  Select,
  Checkbox,
  CheckboxGroup,
  Radio,
  RadioGroup,
  RadioButton,
  Switch,
  Slider,
  Form,
  FormItem,
  DatePicker,
  RangePicker,
  // Data Display Components
  Table,
  Card,
  List,
  ListItem,
  Tabs,
  TabPane,
  Collapse,
  CollapsePanel,
  // Feedback Components
  Modal,
  Popover,
  Tooltip,
  Alert,
  // Typography Components
  Typography,
  Text,
  Title,
  Paragraph,
  // Other Components
  Tag,
  Badge,
  Steps,
  Step,
  Progress,
  Spin,
  Skeleton,
  // Registry
  componentRegistry,
  getComponentMeta,
  getAllComponentMetas,
} from './components';

export type { ComponentRegistry } from './components';

// ============================================
// Renderer
// ============================================
export {
  Renderer,
  EventDispatcher,
  LowcodeProvider,
  renderFromJSON,
  builtInComponents,
  // Validation exports
  validateSchema,
  safeValidateSchema,
  validateSchemaWithWhitelist,
  validateAndAutoFix,
  autoFixSchema,
} from './renderer';

export type { RendererProps, A2UIComponent } from './renderer';

// ============================================
// Editor
// ============================================
export { LowcodeEditor, AIAssistant } from './editor';
export type { LowcodeEditorProps } from './editor';

// API management
export { setApiSecret, setApiBaseURL, getApiBaseURL } from './editor';

// Store exports
export {
  useHistoryStore,
  useCanUndo,
  useCanRedo,
  useUndoStackSize,
  useRedoStackSize,
  useIsExecuting,
  useUndoHistory,
  useRedoHistory,
  createCommandOptions,
  useSelectionStore,
  useEditorStore,
} from './editor';
export type { Command, CommandOptions, CommandFactory } from './editor';

// Command exports
export {
  UpdateSchemaCommand,
  createUpdateSchemaCommand,
  ComponentCommand,
  createAddComponentCommand,
  createDeleteComponentCommand,
  createMoveComponentCommand,
  createUpdatePropsCommand,
  MacroCommand,
  createMacroCommand,
} from './editor';
export type { SchemaChangeCallback, ComponentOperation } from './editor';

// Hook exports
export {
  useSchemaHistoryStore,
  useSchemaCommands,
  useFloatingIslandHotkey,
  useDraftStorage,
} from './editor';
export type { SchemaHistoryOptions } from './editor';

// Component exports
export { UndoRedoButtons, useUndoRedoShortcuts } from './editor';
