import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRetry?: () => void;
  /** 是否在生产环境显示错误详情，默认 false */
  showErrorDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * 检测是否为开发环境
 */
const isDevelopment = (): boolean => {
  return (
    process.env.NODE_ENV === "development" ||
    (typeof window !== "undefined" && window.location?.hostname === "localhost")
  );
};

/**
 * ErrorBoundary - React 错误边界组件
 * 捕获子组件树中的 JavaScript 错误，显示友好的错误界面
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    // 仅在开发环境输出错误到控制台
    if (isDevelopment()) {
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, showErrorDetails = false } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      // 只在开发环境或明确要求时显示错误详情
      const shouldShowDetails = showErrorDetails || isDevelopment();

      return (
        <div className={styles.errorBoundary}>
          <div className={styles.errorContent}>
            <div className={styles.iconWrapper}>
              <AlertTriangle size={48} strokeWidth={1.5} />
            </div>
            <h2 className={styles.title}>出现了一些问题</h2>
            <p className={styles.description}>
              页面遇到了错误，请尝试刷新或联系技术支持。
            </p>
            {error && shouldShowDetails && (
              <div className={styles.errorDetails}>
                <details>
                  <summary>错误详情</summary>
                  <pre className={styles.errorStack}>
                    {error.toString()}
                    {errorInfo?.componentStack && (
                      <>
                        {"\n\n组件堆栈:"}
                        {errorInfo.componentStack}
                      </>
                    )}
                  </pre>
                </details>
              </div>
            )}
            <div className={styles.actions}>
              <button className={styles.retryButton} onClick={this.handleRetry}>
                <RefreshCw size={16} />
                重试
              </button>
              <button
                className={styles.reloadButton}
                onClick={() => window.location.reload()}
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * withErrorBoundary - 高阶组件，用于包装组件添加错误边界
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, "children">,
): React.FC<P> {
  const displayName =
    WrappedComponent.displayName || WrappedComponent.name || "Component";

  const ComponentWithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}
