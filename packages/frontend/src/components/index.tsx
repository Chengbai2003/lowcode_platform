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

// P1 批次组件元数据
import { CheckboxMeta } from './components/Checkbox.meta';
import { RadioMeta } from './components/Radio.meta';
import { SwitchMeta } from './components/Switch.meta';
import { InputNumberMeta } from './components/InputNumber.meta';
import { TextAreaMeta } from './components/TextArea.meta';
import { TabsMeta } from './components/Tabs.meta';
import { ModalMeta } from './components/Modal.meta';
import { AlertMeta } from './components/Alert.meta';
import { TableMeta } from './components/Table.meta';
import { FormMeta } from './components/Form.meta';
import { FormItemMeta } from './components/FormItem.meta';
import { DivMeta } from './components/Div.meta';
import { CheckboxGroupMeta } from './components/CheckboxGroup.meta';
import { RadioGroupMeta } from './components/RadioGroup.meta';
import { RadioButtonMeta } from './components/RadioButton.meta';
import { SliderMeta } from './components/Slider.meta';
import { ListMeta } from './components/List.meta';
import { ListItemMeta } from './components/ListItem.meta';
import { TabPaneMeta } from './components/TabPane.meta';
import { CollapseMeta } from './components/Collapse.meta';
import { CollapsePanelMeta } from './components/CollapsePanel.meta';
import { PopoverMeta } from './components/Popover.meta';
import { TooltipMeta } from './components/Tooltip.meta';
import { RowMeta } from './components/Row.meta';
import { ColMeta } from './components/Col.meta';
import { LayoutMeta } from './components/Layout.meta';
import { HeaderMeta } from './components/Header.meta';
import { ContentMeta } from './components/Content.meta';
import { FooterMeta } from './components/Footer.meta';
import { SiderMeta } from './components/Sider.meta';
import { TagMeta } from './components/Tag.meta';
import { BadgeMeta } from './components/Badge.meta';
import { StepsMeta } from './components/Steps.meta';
import { StepMeta } from './components/Step.meta';
import { ProgressMeta } from './components/Progress.meta';
import { SpinMeta } from './components/Spin.meta';
import { SkeletonMeta } from './components/Skeleton.meta';
import { DatePickerMeta } from './components/DatePicker.meta';
import { RangePickerMeta } from './components/RangePicker.meta';

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
  Div: { component: (props: any) => <div {...props} />, meta: DivMeta },

  // 基础组件
  Button: { component: Button, meta: ButtonMeta },
  Input: { component: Input, meta: InputMeta },
  TextArea: { component: TextArea, meta: TextAreaMeta },
  InputNumber: { component: InputNumber, meta: InputNumberMeta },
  Select: { component: Select, meta: SelectMeta },
  Checkbox: { component: Checkbox, meta: CheckboxMeta },
  CheckboxGroup: { component: CheckboxGroup, meta: CheckboxGroupMeta },
  Radio: { component: Radio, meta: RadioMeta },
  RadioGroup: { component: RadioGroup, meta: RadioGroupMeta },
  RadioButton: { component: RadioButton, meta: RadioButtonMeta },
  Switch: { component: Switch, meta: SwitchMeta },
  Slider: { component: Slider, meta: SliderMeta },

  // 表单
  Form: { component: Form, meta: FormMeta },
  FormItem: { component: FormItem, meta: FormItemMeta },

  // 数据展示
  Table: { component: Table, meta: TableMeta },
  Card: { component: Card, meta: CardMeta },
  List: { component: List, meta: ListMeta },
  ListItem: { component: ListItem, meta: ListItemMeta },
  Tabs: { component: Tabs, meta: TabsMeta },
  TabPane: { component: TabPane, meta: TabPaneMeta },
  Collapse: { component: Collapse, meta: CollapseMeta },
  CollapsePanel: { component: CollapsePanel, meta: CollapsePanelMeta },

  // 反馈
  Modal: { component: Modal, meta: ModalMeta },
  Popover: { component: Popover, meta: PopoverMeta },
  Tooltip: { component: Tooltip, meta: TooltipMeta },
  Alert: { component: Alert, meta: AlertMeta },

  // 布局
  Space: { component: Space, meta: SpaceMeta },
  Divider: { component: Divider, meta: DividerMeta },
  Row: { component: Row, meta: RowMeta },
  Col: { component: Col, meta: ColMeta },
  Layout: { component: Layout, meta: LayoutMeta },
  Header: { component: Header, meta: HeaderMeta },
  Content: { component: Content, meta: ContentMeta },
  Footer: { component: Footer, meta: FooterMeta },
  Sider: { component: AntSider, meta: SiderMeta },

  // 排版
  Typography: { component: Typography, meta: TypographyMeta },
  Text: { component: Text, meta: TextMeta },
  Title: { component: Title, meta: TitleMeta },
  Paragraph: { component: Paragraph, meta: TextMeta }, // Paragraph 共享 Text 的元数据

  // 其他
  Tag: { component: Tag, meta: TagMeta },
  Badge: { component: Badge, meta: BadgeMeta },
  Steps: { component: Steps, meta: StepsMeta },
  Step: { component: Step, meta: StepMeta },
  Progress: { component: Progress, meta: ProgressMeta },
  Spin: { component: Spin, meta: SpinMeta },
  Skeleton: { component: Skeleton, meta: SkeletonMeta },

  // 日期/时间
  DatePicker: { component: DatePicker, meta: DatePickerMeta },
  RangePicker: { component: RangePicker, meta: RangePickerMeta },
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
