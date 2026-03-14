/**
 * Action 类型配置和工具函数
 * 从 EventFlowEditor.tsx 提取，用于动作编辑器配置
 */
import type { FC, SVGProps } from 'react';
import {
  Variable,
  Database,
  MessageSquare,
  ArrowRight,
  Code,
  LayoutTemplate,
  Clock,
  FileText,
  Equal,
  RotateCcw,
} from 'lucide-react';
import type { Action, Value } from '../../../types';

/** Action 类型常量 */
export const ACTION_TYPE = {
  setValue: 'setValue',
  apiCall: 'apiCall',
  navigate: 'navigate',
  feedback: 'feedback',
  dialog: 'dialog',
  if: 'if',
  loop: 'loop',
  delay: 'delay',
  log: 'log',
  customScript: 'customScript',
} as const;

export type ActionType = (typeof ACTION_TYPE)[keyof typeof ACTION_TYPE];
export type ActionUpdate = (partial: Partial<Action>) => void;

/** Action 类型提取 */
export type FeedbackActionItem = Extract<Action, { type: typeof ACTION_TYPE.feedback }>;
export type SetValueActionItem = Extract<Action, { type: typeof ACTION_TYPE.setValue }>;
export type ApiCallActionItem = Extract<Action, { type: typeof ACTION_TYPE.apiCall }>;
export type NavigateActionItem = Extract<Action, { type: typeof ACTION_TYPE.navigate }>;
export type DialogActionItem = Extract<Action, { type: typeof ACTION_TYPE.dialog }>;
export type DelayActionItem = Extract<Action, { type: typeof ACTION_TYPE.delay }>;
export type LogActionItem = Extract<Action, { type: typeof ACTION_TYPE.log }>;
export type CustomScriptActionItem = Extract<Action, { type: typeof ACTION_TYPE.customScript }>;
export type IfActionItem = Extract<Action, { type: typeof ACTION_TYPE.if }>;
export type LoopActionItem = Extract<Action, { type: typeof ACTION_TYPE.loop }>;

/** Action 类型配置 */
export const ACTION_TYPE_CONFIG: Record<
  ActionType,
  {
    icon: FC<SVGProps<SVGSVGElement>>;
    color: string;
    bg: string;
    title: string;
    desc: string;
  }
> = {
  [ACTION_TYPE.setValue]: {
    icon: Variable,
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    title: '设置变量',
    desc: '设置字段/状态值',
  },
  [ACTION_TYPE.apiCall]: {
    icon: Database,
    color: 'text-purple-600',
    bg: 'bg-purple-100',
    title: 'API 请求',
    desc: '发送 HTTP 请求',
  },
  [ACTION_TYPE.navigate]: {
    icon: ArrowRight,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100',
    title: '页面跳转',
    desc: '路由导航',
  },
  [ACTION_TYPE.feedback]: {
    icon: MessageSquare,
    color: 'text-amber-600',
    bg: 'bg-amber-100',
    title: '消息提示',
    desc: 'Toast 或弹窗提示',
  },
  [ACTION_TYPE.dialog]: {
    icon: LayoutTemplate,
    color: 'text-pink-600',
    bg: 'bg-pink-100',
    title: '控制弹窗',
    desc: '打开或关闭页面弹窗',
  },
  [ACTION_TYPE.if]: {
    icon: Equal,
    color: 'text-cyan-600',
    bg: 'bg-cyan-100',
    title: '条件判断',
    desc: 'If/Else 逻辑分支',
  },
  [ACTION_TYPE.loop]: {
    icon: RotateCcw,
    color: 'text-indigo-600',
    bg: 'bg-indigo-100',
    title: '循环',
    desc: '遍历数组执行动作',
  },
  [ACTION_TYPE.delay]: {
    icon: Clock,
    color: 'text-orange-600',
    bg: 'bg-orange-100',
    title: '延迟',
    desc: '延时执行后续动作',
  },
  [ACTION_TYPE.log]: {
    icon: FileText,
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    title: '日志',
    desc: '输出调试日志',
  },
  [ACTION_TYPE.customScript]: {
    icon: Code,
    color: 'text-red-600',
    bg: 'bg-red-100',
    title: '自定义脚本',
    desc: '执行 JavaScript',
  },
};

/** 格式化值为字符串 */
export const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const MAX_VALUE_INPUT_LENGTH = 5000;

/** 解析输入值为 Value 类型 */
export const parseValueInput = (input: string): Value => {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.length > MAX_VALUE_INPUT_LENGTH) return input;
  try {
    return JSON.parse(trimmed) as Value;
  } catch {
    return input;
  }
};

/** 解析数字输入 */
export const parseNumberInput = (input: string): number | undefined => {
  if (!input.trim()) return undefined;
  const num = Number(input);
  return Number.isNaN(num) ? undefined : num;
};
