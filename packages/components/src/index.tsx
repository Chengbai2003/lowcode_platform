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

/**
 * 组件注册表：将 Schema 组件名映射到实际组件
 */
export const componentRegistry: Record<string, React.ComponentType<any>> = {
  // 布局组件
  Container,
  Div: (props: any) => <div {...props} />,

  // 基础组件
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

  // 表单
  Form,
  FormItem,

  // 数据展示
  Table,
  Card,
  List,
  ListItem,
  Tabs,
  TabPane,
  Collapse,
  CollapsePanel,

  // 反馈
  Modal,
  Popover,
  Tooltip,
  Alert,

  // 布局
  Space,
  Divider,
  Row,
  Col,
  Layout,
  Header,
  Content,
  Footer,
  Sider: AntSider,

  // 排版
  Typography,
  Text,
  Title,
  Paragraph,

  // 其他
  Tag,
  Badge,
  Steps,
  Step,
  Progress,
  Spin,
  Skeleton,

  // 日期/时间
  DatePicker,
  RangePicker,
};
