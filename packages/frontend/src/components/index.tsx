/**
 * @lowcode-platform/components
 *
 * 低代码平台组件库
 * 每个组件都在独立的文件中，便于自定义
 */

// 导出所有组件
export { default as Container } from './components/Container';
export { default as Button } from './components/Button';
export { default as Input, TextArea } from './components/Input';
export { default as InputNumber } from './components/InputNumber';
export { default as Select } from './components/Select';
export { default as Checkbox, CheckboxGroup } from './components/Checkbox';
export { default as Radio, RadioGroup, RadioButton } from './components/Radio';
export { default as Switch } from './components/Switch';
export { default as Slider } from './components/Slider';
export { default as Form, FormItem } from './components/Form';
export { default as DatePicker, RangePicker } from './components/DatePicker';
export { default as Table } from './components/Table';
export { default as Card } from './components/Card';
export { default as List, ListItem } from './components/List';
export { default as Tabs, TabPane } from './components/Tabs';
export { default as Collapse, CollapsePanel } from './components/Collapse';
export { default as Modal } from './components/Modal';
export { default as Popover } from './components/Popover';
export { default as Tooltip } from './components/Tooltip';
export { default as Space } from './components/Space';
export { default as Divider } from './components/Divider';
export { default as Row, Col } from './components/Grid';
export { default as Layout, Header, Content, Footer, Sider } from './components/Layout';
export { default as Typography, Text, Title, Paragraph } from './components/Typography';
export { default as Tag } from './components/Tag';
export { default as Badge } from './components/Badge';
export { default as Alert } from './components/Alert';
export { default as Steps, Step } from './components/Steps';
export { default as Progress } from './components/Progress';
export { default as Spin } from './components/Spin';
export { default as Skeleton } from './components/Skeleton';

// Export icons
export * from '@ant-design/icons';

// 导入所有组件用于注册表
import Container from './components/Container';
import Button from './components/Button';
import Input, { TextArea } from './components/Input';
import InputNumber from './components/InputNumber';
import Select from './components/Select';
import Checkbox, { CheckboxGroup } from './components/Checkbox';
import Radio, { RadioGroup, RadioButton } from './components/Radio';
import Switch from './components/Switch';
import Slider from './components/Slider';
import Form, { FormItem } from './components/Form';
import DatePicker, { RangePicker } from './components/DatePicker';
import Table from './components/Table';
import Card from './components/Card';
import List, { ListItem } from './components/List';
import Tabs, { TabPane } from './components/Tabs';
import Collapse, { CollapsePanel } from './components/Collapse';
import Modal from './components/Modal';
import Popover from './components/Popover';
import Tooltip from './components/Tooltip';
import Space from './components/Space';
import Divider from './components/Divider';
import { Row, Col } from './components/Grid';
import { Layout, Header, Content, Footer, Sider as AntSider } from './components/Layout';
import Typography, { Text, Title, Paragraph } from './components/Typography';
import Tag from './components/Tag';
import Badge from './components/Badge';
import Alert from './components/Alert';
import Steps, { Step } from './components/Steps';
import Progress from './components/Progress';
import Spin from './components/Spin';
import Skeleton from './components/Skeleton';

// 导入组件元数据
import { ButtonMeta } from './components/Button.meta';
import { InputMeta } from './components/Input.meta';
import { SelectMeta } from './components/Select.meta';
import { CardMeta } from './components/Card.meta';
import { ContainerMeta } from './components/Container.meta';
import { SpaceMeta } from './components/Space.meta';
import { DividerMeta } from './components/Divider.meta';
import { TextMeta } from './components/Text.meta';
import { TitleMeta } from './components/Title.meta';
import { TypographyMeta } from './components/Typography.meta';

import type { ComponentPanelConfig } from '../types';

interface ComponentRegistryEntry {
  component: React.ComponentType<any>;
  meta?: ComponentPanelConfig;
}

/**
 * 组件注册表：将 Schema 组件名映射到实际组件和元数据
 */
export const componentRegistry: Record<string, ComponentRegistryEntry> = {
  // 布局组件
  Container: { component: Container, meta: ContainerMeta },
  Div: { component: (props: any) => <div {...props} />, meta: undefined },

  // 基础组件
  Button: { component: Button, meta: ButtonMeta },
  Input: { component: Input, meta: InputMeta },
  TextArea: { component: TextArea, meta: InputMeta }, // TextArea 共享 Input 的元数据
  InputNumber: { component: InputNumber, meta: InputMeta },
  Select: { component: Select, meta: SelectMeta },
  Checkbox: { component: Checkbox, meta: undefined },
  CheckboxGroup: { component: CheckboxGroup, meta: undefined },
  Radio: { component: Radio, meta: undefined },
  RadioGroup: { component: RadioGroup, meta: undefined },
  RadioButton: { component: RadioButton, meta: undefined },
  Switch: { component: Switch, meta: undefined },
  Slider: { component: Slider, meta: undefined },

  // 表单
  Form: { component: Form, meta: undefined },
  FormItem: { component: FormItem, meta: undefined },

  // 数据展示
  Table: { component: Table, meta: undefined },
  Card: { component: Card, meta: CardMeta },
  List: { component: List, meta: undefined },
  ListItem: { component: ListItem, meta: undefined },
  Tabs: { component: Tabs, meta: undefined },
  TabPane: { component: TabPane, meta: undefined },
  Collapse: { component: Collapse, meta: undefined },
  CollapsePanel: { component: CollapsePanel, meta: undefined },

  // 反馈
  Modal: { component: Modal, meta: undefined },
  Popover: { component: Popover, meta: undefined },
  Tooltip: { component: Tooltip, meta: undefined },
  Alert: { component: Alert, meta: undefined },

  // 布局
  Space: { component: Space, meta: SpaceMeta },
  Divider: { component: Divider, meta: DividerMeta },
  Row: { component: Row, meta: undefined },
  Col: { component: Col, meta: undefined },
  Layout: { component: Layout, meta: undefined },
  Header: { component: Header, meta: undefined },
  Content: { component: Content, meta: undefined },
  Footer: { component: Footer, meta: undefined },
  Sider: { component: AntSider, meta: undefined },

  // 排版
  Typography: { component: Typography, meta: TypographyMeta },
  Text: { component: Text, meta: TextMeta },
  Title: { component: Title, meta: TitleMeta },
  Paragraph: { component: Paragraph, meta: TextMeta }, // Paragraph 共享 Text 的元数据

  // 其他
  Tag: { component: Tag, meta: undefined },
  Badge: { component: Badge, meta: undefined },
  Steps: { component: Steps, meta: undefined },
  Step: { component: Step, meta: undefined },
  Progress: { component: Progress, meta: undefined },
  Spin: { component: Spin, meta: undefined },
  Skeleton: { component: Skeleton, meta: undefined },

  // 日期/时间
  DatePicker: { component: DatePicker, meta: undefined },
  RangePicker: { component: RangePicker, meta: undefined },
};

/**
 * 获取组件的元数据配置
 */
export function getComponentMeta(type: string): ComponentPanelConfig | undefined {
  return componentRegistry[type]?.meta;
}

/**
 * 获取所有带有元数据的组件
 */
export function getAllComponentMetas(): ComponentPanelConfig[] {
  return Object.values(componentRegistry)
    .map((entry) => entry.meta)
    .filter((meta): meta is ComponentPanelConfig => meta !== undefined);
}

/**
 * 组件注册表类型定义（仅为类型检查使用）
 */
export type ComponentRegistry = typeof componentRegistry;
