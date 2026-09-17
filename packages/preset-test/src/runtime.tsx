/**
 * @lowcode-platform/preset-test/runtime
 *
 * 第二个可信 Preset 的最小 Runtime（Issue #39 / M1F-2 B4）。
 *
 * 只使用 React 与基础 DOM 元素，不依赖任何 UI 库。三个组件都带
 * `data-preset-test` 标记与可辨识的等宽/虚线样式：如果页面被错误地
 * 用 AntD Preset 渲染（或反之），DOM 标记与样式会立刻暴露错配。
 *
 * 组件不直接调用执行器：交互行为统一由 Renderer 的 events 机制
 * （buildEventHandlers → eventDispatcher）在 Manifest 净化之后注入。
 *
 * 安全语义（review P1）：Renderer 渲染路径有 Manifest 白名单净化，但
 * Compiler 生成代码直接消费本模块、不经过该净化。因此组件对未知 Props
 * 自身 fail-close：只透传白名单标量 DOM 属性与 `on[A-Z]` 且值为函数的
 * 事件 handler（events 机制的合法形态），其余（含字符串型 on* 、危险
 * HTML、任意属性）一律丢弃，保证两条消费路径的 DOM 输出一致。
 */

import type { ComponentRegistry } from '@lowcode-platform/renderer';

type Props = Record<string, unknown> & { children?: React.ReactNode };

const MONOSPACE_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const CONTAINER_WIDTHS: Record<string, string> = {
  xs: '100%',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  full: '100%',
};

const BUTTON_VARIANTS = new Set(['solid', 'outline', 'ghost']);

const TEXT_SIZES: Record<string, string> = {
  sm: '12px',
  md: '16px',
  lg: '20px',
  xl: '28px',
};

/** 允许透传到 DOM 的标量属性白名单（与 Manifest 公共白名单对标）。 */
const SAFE_DOM_ATTRIBUTES = new Set(['className', 'id', 'title']);

function isEventPropName(name: string): boolean {
  return /^on[A-Z]/.test(name);
}

/**
 * 只保留安全 DOM 属性与函数型事件 handler：
 * - `className` / `id` / `title` 仅接受标量值；
 * - `on[A-Z]` 开头且值为函数的 Props 是 events 机制注入的合法 handler；
 * - 其余 Props（未知属性、字符串型 on* 、dangerouslySetInnerHTML 等）全部丢弃。
 */
function pickSafeDomProps(props: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) {
    if (SAFE_DOM_ATTRIBUTES.has(name)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        safe[name] = value;
      }
      continue;
    }
    if (isEventPropName(name) && typeof value === 'function') {
      safe[name] = value;
    }
  }
  return safe;
}

function toWidth(width: unknown): string {
  if (typeof width === 'number') return `${width}px`;
  return CONTAINER_WIDTHS[String(width)] ?? String(width);
}

export const Container = ({
  children,
  width = 'full',
  padding = '12px',
  center = true,
  style,
  ...props
}: Props) => (
  <div
    {...pickSafeDomProps(props)}
    data-preset-test="container"
    style={{
      boxSizing: 'border-box',
      fontFamily: MONOSPACE_STACK,
      width: toWidth(width),
      padding: padding as React.CSSProperties['padding'],
      marginLeft: center === false ? undefined : 'auto',
      marginRight: center === false ? undefined : 'auto',
      ...(style as React.CSSProperties),
    }}
  >
    {children}
  </div>
);

export const Text = ({ children, strong = false, size = 'md', style, ...props }: Props) => (
  <span
    {...pickSafeDomProps(props)}
    data-preset-test="text"
    data-size={String(size)}
    style={{
      fontFamily: MONOSPACE_STACK,
      fontWeight: strong ? 700 : 400,
      fontSize: TEXT_SIZES[String(size)] ?? undefined,
      letterSpacing: '0.02em',
      ...(style as React.CSSProperties),
    }}
  >
    {children}
  </span>
);

export const Button = ({
  children,
  variant = 'outline',
  block = false,
  disabled,
  style,
  ...props
}: Props) => {
  const variantName = BUTTON_VARIANTS.has(String(variant)) ? String(variant) : 'outline';
  const isDisabled = disabled === true || disabled === 'true';
  return (
    <button
      {...pickSafeDomProps(props)}
      type="button"
      disabled={isDisabled}
      data-preset-test="button"
      data-variant={variantName}
      style={{
        fontFamily: MONOSPACE_STACK,
        fontSize: '14px',
        padding: '4px 14px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        borderWidth: '2px',
        borderStyle: 'dashed',
        borderRadius: '4px',
        background: variantName === 'solid' ? '#4f46e5' : 'transparent',
        borderColor: '#4f46e5',
        color:
          variantName === 'ghost' ? '#64748b' : variantName === 'solid' ? '#ffffff' : '#4f46e5',
        width: block === true || block === 'true' ? '100%' : undefined,
        opacity: isDisabled ? 0.5 : 1,
        ...(style as React.CSSProperties),
      }}
    >
      {children}
    </button>
  );
};

export const testRuntime: ComponentRegistry = {
  Container,
  Text,
  Button,
};

type FeedbackLevel = 'success' | 'error' | 'warning' | 'info';
type FeedbackFn = (content?: unknown) => void;

function consoleFeedback(level: string): FeedbackFn {
  return (content?: unknown) => {
    // eslint-disable-next-line no-console
    console.info(`[preset-test:${level}]`, content);
  };
}

/**
 * Compiler 生成的 feedback 动作会从 defaultLibrary（本包 /runtime 子路径）导入
 * `message` / `notification`。本 Preset 不依赖 UI 库，提供最小 console 实现
 * 保证生成代码可直接运行；四个 level 与 antd 同名 API 保持一致。
 */
export const message: Readonly<Record<FeedbackLevel, FeedbackFn>> = Object.freeze({
  success: consoleFeedback('success'),
  error: consoleFeedback('error'),
  warning: consoleFeedback('warning'),
  info: consoleFeedback('info'),
});

export const notification: Readonly<Record<FeedbackLevel, FeedbackFn>> = Object.freeze({
  success: consoleFeedback('notification:success'),
  error: consoleFeedback('notification:error'),
  warning: consoleFeedback('notification:warning'),
  info: consoleFeedback('notification:info'),
});
