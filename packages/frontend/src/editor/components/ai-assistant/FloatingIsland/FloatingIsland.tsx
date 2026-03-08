import React, { useState, useEffect } from 'react';
import { Bot, X, ArrowUp, History, Sparkles } from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import type { A2UISchema } from '../../../../types';
import { useEditorStore } from '../../../store/editor-store';
import styles from './FloatingIsland.module.scss';

interface FloatingIslandProps {
  currentSchema?: A2UISchema | null;
  onSchemaUpdate?: (schema: A2UISchema) => void;
  onError?: (error: string) => void;
  isPreviewMode?: boolean;
}

export const FloatingIsland: React.FC<FloatingIslandProps> = ({
  // Reserved for future use
  // currentSchema,
  // onSchemaUpdate,
  onError,
  isPreviewMode = false,
}) => {
  // 使用 store 中的状态
  const isOpen = useEditorStore((state) => state.isFloatingIslandOpen);
  const setIsOpen = useEditorStore((state) => state.setFloatingIslandOpen);
  const toggleFloatingIsland = useEditorStore((state) => state.toggleFloatingIsland);
  const setHistoryDrawerOpen = useEditorStore((state) => state.setHistoryDrawerOpen);

  const dragControls = useDragControls();

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 预览模式下自动关闭
  useEffect(() => {
    if (isPreviewMode && isOpen) {
      setIsOpen(false);
    }
  }, [isPreviewMode, isOpen, setIsOpen]);

  // 发送消息
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue;
    setInputValue('');
    setIsLoading(true);

    try {
      // TODO: 实际发送消息到 AI 服务
      // 使用 userMessage 发送请求
      void userMessage; // 暂时忽略未使用警告
      // 模拟 AI 响应
    } catch (error) {
      console.error('Failed to send message:', error);
      onError?.('消息发送失败：' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理历史按钮点击 - 打开 HistoryDrawer
  const handleHistoryClick = () => {
    setHistoryDrawerOpen(true);
  };

  // 预览模式下不渲染
  if (isPreviewMode) {
    return null;
  }

  // 未打开时显示浮动按钮
  if (!isOpen) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className={styles.floatingButtonWrapper}
        >
          <button className={styles.floatingButton} onClick={toggleFloatingIsland}>
            <Sparkles size={28} />
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }

  // 打开时显示助手面板
  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        className={styles.floatingIsland}
      >
        {/* 头部 */}
        <div className={styles.header} onPointerDown={(e) => dragControls.start(e)}>
          <div className={styles.headerLeft}>
            <Bot size={18} />
            <span className={styles.headerTitle}>A2UI 助手</span>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.iconButton}
              onClick={() => setIsOpen(false)}
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 内容区域 - 聊天视图 */}
        <div className={styles.content}>
          <div className={styles.chatView}>
            <div className={styles.messageRow}>
              <div className={styles.avatar}>
                <Bot size={16} />
              </div>
              <div className={styles.messageBubble}>
                我已经为您生成了登录页面。您还可以让我修改样式，比如"把按钮变成圆角"，或者"添加一个忘记密码的链接"。
              </div>
            </div>
          </div>
        </div>

        {/* 输入区域 */}
        <div className={styles.inputArea}>
          <div className={styles.inputRow}>
            <button className={styles.historyToggle} title="历史记录" onClick={handleHistoryClick}>
              <History size={16} />
            </button>
            <div className={styles.inputWrapper}>
              <input
                type="text"
                placeholder="描述您的 UI..."
                className={styles.input}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isLoading}
              />
              <button
                className={`${styles.sendButton} ${!inputValue.trim() || isLoading ? styles.disabled : ''}`}
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
              >
                {isLoading ? (
                  <span className={styles.spin} style={{ display: 'inline-block' }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  </span>
                ) : (
                  <ArrowUp size={14} />
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
