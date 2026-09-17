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
    {...props}
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
    {...props}
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
      {...props}
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

function consoleFeedback(level: FeedbackLevel): FeedbackFn {
  return (content?: unknown) => {
    // eslint-disable-next-line no-console
    console.info(`[preset-test:${level}]`, content);
  };
}

/**
 * Compiler 生成的 feedback 动作会从 defaultLibrary（本包 /runtime 子路径）导入
 * `message`。本 Preset 不依赖 UI 库，提供最小 console 实现保证生成代码可直接
 * 运行；四个 level 与 antd message 的方法名保持一致。
 */
export const message: Readonly<Record<FeedbackLevel, FeedbackFn>> = Object.freeze({
  success: consoleFeedback('success'),
  error: consoleFeedback('error'),
  warning: consoleFeedback('warning'),
  info: consoleFeedback('info'),
});
