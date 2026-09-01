/** Ant Design runtime implementations owned by the built-in preset. */
import React, { useCallback, useMemo } from 'react';
import {
  Alert as AntAlert,
  Avatar as AntAvatar,
  Badge as AntBadge,
  Button as AntButton,
  Card as AntCard,
  Checkbox as AntCheckbox,
  Col as AntCol,
  Collapse as AntCollapse,
  DatePicker as AntDatePicker,
  Divider as AntDivider,
  Form as AntForm,
  Image as AntImage,
  Input as AntInput,
  InputNumber as AntInputNumber,
  Layout as AntLayout,
  List as AntList,
  Modal as AntModal,
  Popover as AntPopover,
  Progress as AntProgress,
  Radio as AntRadio,
  Row as AntRow,
  Select as AntSelect,
  Skeleton as AntSkeleton,
  Slider as AntSlider,
  Space as AntSpace,
  Spin as AntSpin,
  Steps as AntSteps,
  Switch as AntSwitch,
  Table as AntTable,
  Tabs as AntTabs,
  Tag as AntTag,
  Tooltip as AntTooltip,
  Typography as AntTypography,
} from 'antd';
import { useComponentRuntimeBridge, type ComponentRegistry } from '@lowcode-platform/renderer';

type Props = Record<string, unknown> & { children?: React.ReactNode };

const CONTAINER_WIDTHS: Record<string, string> = {
  xs: '100%',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  full: '100%',
};

export const Page = ({ children, ...props }: Props) => <div {...props}>{children}</div>;
export const Div = ({ children, ...props }: Props) => <div {...props}>{children}</div>;
export const Span = ({ children, ...props }: Props) => <span {...props}>{children}</span>;
export const Container = ({
  children,
  width = 'full',
  padding = '16px',
  center = true,
  style,
  ...props
}: Props) => (
  <div
    style={{
      boxSizing: 'border-box',
      width:
        typeof width === 'number'
          ? `${width}px`
          : (CONTAINER_WIDTHS[String(width)] ?? String(width)),
      padding: padding as React.CSSProperties['padding'],
      marginLeft: center ? 'auto' : undefined,
      marginRight: center ? 'auto' : undefined,
      ...(style as React.CSSProperties),
    }}
    {...props}
  >
    {children}
  </div>
);
export const Row = (props: Props) => <AntRow gutter={16} {...props} />;
export const Col = (props: Props) => <AntCol {...props} />;
export const Button = (props: Props) => <AntButton {...props} />;
export const Input = (props: Props) => {
  const { type, ...inputProps } = props;
  if (type === 'password') return <AntInput.Password {...inputProps} />;
  if (type === 'textArea') return <AntInput.TextArea {...inputProps} />;
  if (type === 'search') return <AntInput.Search {...inputProps} />;
  return <AntInput {...props} />;
};
export const TextArea = (props: Props) => <AntInput.TextArea {...props} />;
export const InputNumber = (props: Props) => <AntInputNumber {...props} />;
export const Select = (props: Props) => <AntSelect {...props} />;
export const Checkbox = (props: Props) => <AntCheckbox {...props} />;
export const CheckboxGroup = (props: Props) => <AntCheckbox.Group {...props} />;
export const Radio = (props: Props) => <AntRadio {...props} />;
export const RadioGroup = (props: Props) => <AntRadio.Group {...props} />;
export const RadioButton = (props: Props) => <AntRadio.Button {...props} />;
export const Switch = (props: Props) => <AntSwitch {...(props as any)} />;
export const Slider = (props: Props) => <AntSlider {...(props as any)} />;
export const Form = (props: Props) => <AntForm {...props} />;
export const FormItem = (props: Props) => <AntForm.Item {...props} />;
export const DatePicker = (props: Props) => <AntDatePicker {...props} />;
export const RangePicker = (props: Props) => <AntDatePicker.RangePicker {...props} />;
type TableColumn = Record<string, unknown> & {
  kind?: string;
  actions?: unknown[];
  buttons?: Array<Record<string, unknown>>;
};

export type TableProps = Props & { __componentId?: string };

const TABLE_BUTTON_TYPES = new Set(['text', 'link', 'primary', 'default']);

function normalizeActions(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (action) =>
      action !== null &&
      typeof action === 'object' &&
      typeof (action as Record<string, unknown>).type === 'string',
  );
}

function normalizeButtonType(value: unknown): 'text' | 'link' | 'primary' | 'default' {
  return typeof value === 'string' && TABLE_BUTTON_TYPES.has(value)
    ? (value as 'text' | 'link' | 'primary' | 'default')
    : 'text';
}

export const Table = ({ columns, __componentId, ...props }: TableProps) => {
  const bridge = useComponentRuntimeBridge();
  const runActions = useCallback(
    async (
      actions: unknown[],
      event: React.MouseEvent,
      record: unknown,
      rowIndex: number,
      value?: unknown,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      if (bridge && actions.length > 0) {
        await bridge.executeActions(actions as never, event.nativeEvent, {
          componentId: __componentId,
          record,
          rowIndex,
          value,
        });
      }
    },
    [__componentId, bridge],
  );
  const resolvedColumns = useMemo(
    () =>
      (Array.isArray(columns) ? columns : [])
        .filter((column): column is TableColumn => column !== null && typeof column === 'object')
        .map((column) => {
          if (column.kind === 'link') {
            const actions = normalizeActions(column.actions);
            return {
              ...column,
              actions,
              render: (value: unknown, record: unknown, rowIndex: number) => {
                const text =
                  column.textMode === 'template'
                    ? String(
                        bridge?.resolveValue(String(column.textTemplate ?? '{{value}}'), {
                          componentId: __componentId,
                          record,
                          rowIndex,
                          value,
                        }) ?? '',
                      )
                    : String(value ?? '');
                return (
                  <AntButton
                    type="link"
                    size="small"
                    disabled={!bridge || actions.length === 0}
                    onClick={(event) => runActions(actions, event, record, rowIndex, value)}
                  >
                    {text || '-'}
                  </AntButton>
                );
              },
            };
          }
          if (column.kind === 'action') {
            return {
              ...column,
              render: (_value: unknown, record: unknown, rowIndex: number) => (
                <AntSpace size={4} wrap>
                  {(column.buttons ?? [])
                    .filter((button) => button !== null && typeof button === 'object')
                    .map((button, index) => {
                      const actions = normalizeActions(button.actions);
                      return (
                        <AntButton
                          key={`${String(button.label ?? '')}-${index}`}
                          type={normalizeButtonType(button.buttonType)}
                          size="small"
                          danger={button.danger === true}
                          disabled={!bridge || actions.length === 0}
                          onClick={(event) => runActions(actions, event, record, rowIndex)}
                        >
                          {String(button.label ?? '')}
                        </AntButton>
                      );
                    })}
                </AntSpace>
              ),
            };
          }
          return column;
        }),
    [__componentId, bridge, columns, runActions],
  );
  return <AntTable {...props} columns={resolvedColumns as any} />;
};
export const Card = (props: Props) => <AntCard {...props} />;
export const List = (props: Props) => <AntList {...props} />;
export const ListItem = (props: Props) => <AntList.Item {...props} />;
export const Tabs = (props: Props) => <AntTabs type="line" {...props} />;
export const TabPane = (props: Props) => <AntTabs.TabPane {...props} />;
export const Collapse = (props: Props) => <AntCollapse {...props} />;
export const CollapsePanel = (props: Props) => <AntCollapse.Panel {...(props as any)} />;
export const Modal = (props: Props) => <AntModal width={520} {...props} />;
export const Popover = (props: Props) => <AntPopover {...props} />;
export const Tooltip = (props: Props) => <AntTooltip {...props} />;
export const Space = (props: Props) => <AntSpace size="middle" {...props} />;
export const Divider = (props: Props) => <AntDivider {...props} />;
export const Layout = (props: Props) => <AntLayout {...props} />;
export const Header = (props: Props) => <AntLayout.Header {...props} />;
export const Content = (props: Props) => <AntLayout.Content {...props} />;
export const Footer = (props: Props) => <AntLayout.Footer {...props} />;
export const Sider = (props: Props) => <AntLayout.Sider {...props} />;
export const Typography = (props: Props) => <AntTypography {...props} />;
export const Text = (props: Props) => <AntTypography.Text {...props} />;
export const Title = ({ level = 1, ...props }: Props) => (
  <AntTypography.Title level={level as 1 | 2 | 3 | 4 | 5} {...props} />
);
export const Paragraph = (props: Props) => <AntTypography.Paragraph {...props} />;
export const Tag = (props: Props) => <AntTag {...props} />;
export const Badge = (props: Props) => <AntBadge {...props} />;
export const Alert = (props: Props) => <AntAlert {...(props as any)} />;
export const Steps = ({ current = 0, ...props }: Props) => (
  <AntSteps current={current as number} {...props} />
);
export const Step = (props: Props) => <AntSteps.Step {...(props as any)} />;
export const Progress = ({ percent = 0, ...props }: Props) => (
  <AntProgress percent={percent as number} {...props} />
);
export const Spin = (props: Props) => <AntSpin {...props} />;
export const Skeleton = (props: Props) => <AntSkeleton {...props} />;
export const Avatar = (props: Props) => <AntAvatar {...props} />;
export const Image = (props: Props) => <AntImage {...props} />;
export const Link = ({ children, ...props }: Props) => <a {...props}>{children}</a>;

export const antdRuntime: ComponentRegistry = {
  Page,
  Div,
  Span,
  Container,
  Row,
  Col,
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
  Table,
  Card,
  List,
  ListItem,
  Tabs,
  TabPane,
  Collapse,
  CollapsePanel,
  Modal,
  Popover,
  Tooltip,
  Space,
  Divider,
  Layout,
  Header,
  Content,
  Footer,
  Sider,
  Typography,
  Text,
  Title,
  Paragraph,
  Tag,
  Badge,
  Alert,
  Steps,
  Step,
  Progress,
  Spin,
  Skeleton,
  Avatar,
  Image,
  Link,
};
