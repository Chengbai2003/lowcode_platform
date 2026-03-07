import { useState, useCallback, useMemo } from "react";
import { ConfigProvider, theme, message } from "antd";
import type { LowcodeEditorProps } from "./types";
import type { A2UISchema } from "../types";
import { componentRegistry } from "../components";
import { compileSchema } from "./services/compilerApi";
import {
  EditorHeader,
  PreviewPane,
  PropertyPanel,
  ErrorBoundary,
} from "./components";
import { ComponentTree } from "./components/TreeView/ComponentTree";
import { useFloatingIslandHotkey } from "./hooks/useFloatingIslandHotkey";
import { FloatingIsland } from "./components/ai-assistant/FloatingIsland";
import { HistoryDrawer } from "./components/ai-assistant/HistoryDrawer";
import { useSelectionStore } from "./store/editor-store";
import styles from "./LowcodeEditor.module.scss";

/**
 * 编辑器内部组件
 */
function LowcodeEditorInner({
  initialSchema,
  components: customComponents = {},
  onChange,
  onError,
  eventContext = {},
}: LowcodeEditorProps) {
  // 初始化 Schema
  const defaultSchema: A2UISchema = useMemo(
    () => ({
      rootId: "root",
      components: {
        root: {
          id: "root",
          type: "Page",
          props: {},
          childrenIds: [],
        },
      },
    }),
    [],
  );

  const initialSchemaObj = useMemo(() => {
    if (typeof initialSchema === "string") {
      try {
        return JSON.parse(initialSchema);
      } catch {
        return defaultSchema;
      }
    }
    return initialSchema || defaultSchema;
  }, [initialSchema, defaultSchema]);

  const [schema, setSchema] = useState<A2UISchema>(initialSchemaObj);
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");

  // Selection store integration
  const selectedId = useSelectionStore((state) => state.selectedId);
  const selectComponent = useSelectionStore((state) => state.selectComponent);

  // 浮动岛快捷键
  useFloatingIslandHotkey();

  // 处理组件选择
  const handleSelectComponent = useCallback(
    (id: string) => {
      selectComponent(id);
    },
    [selectComponent],
  );

  // 处理 Schema 变化
  const handleSchemaChange = useCallback(
    (newSchema: A2UISchema) => {
      setSchema(newSchema);
      onChange?.(newSchema);
    },
    [onChange],
  );

  // 处理编译
  const handleCompile = useCallback(async () => {
    if (schema) {
      try {
        await compileSchema(schema);
        message.success("编译成功！");
        // 编译结果可用于后续操作（如预览、下载等）
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "未知错误";
        console.error(e);
        message.error("编译失败: " + errorMessage);
      }
    } else {
      message.warning("Schema 为空，无法编译");
    }
  }, [schema]);

  // 处理AI生成的Schema更新
  const handleAISchemaUpdate = useCallback(
    (newSchema: A2UISchema) => {
      setSchema(newSchema);
      onChange?.(newSchema);
      message.success("Schema 已更新！");
    },
    [onChange],
  );

  // 处理历史回滚
  const handleRollback = useCallback(
    (actionResult: unknown) => {
      if (actionResult && schema) {
        message.info("回滚功能需要完整实现 actionResult 解析");
      }
    },
    [schema],
  );

  // 合并自定义组件与默认注册表
  const allComponents = useMemo(() => {
    const componentsOnly = Object.keys(componentRegistry).reduce(
      (acc, key) => {
        acc[key] = componentRegistry[key].component;
        return acc;
      },
      {} as Record<string, React.ComponentType<Record<string, unknown>>>,
    );
    return { ...componentsOnly, ...customComponents };
  }, [customComponents]);

  // 参考 lowcode 项目的简洁布局
  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <div className={styles.lowcodeEditor}>
        {/* Header */}
        <EditorHeader
          onCompile={handleCompile}
          previewTheme={previewTheme}
          onThemeChange={setPreviewTheme}
          onUndo={() => message.info("撤销功能")}
          onRedo={() => message.info("重做功能")}
          canUndo={false}
          canRedo={false}
          historySize={0}
        />

        {/* 三栏布局 */}
        <div className={styles.mainLayout}>
          {/* 左侧：组件树 */}
          <aside className={styles.leftSidebar}>
            <ComponentTree
              schema={schema}
              selectedId={selectedId}
              onSelect={handleSelectComponent}
              onSchemaChange={handleSchemaChange}
            />
          </aside>

          {/* 中间：预览区域 */}
          <main className={styles.centerPane}>
            <PreviewPane
              schema={schema}
              allComponents={allComponents}
              eventContext={eventContext}
              previewTheme={previewTheme}
            />
            {/* AI 浮动岛 */}
            <FloatingIsland
              currentSchema={schema}
              onSchemaUpdate={handleAISchemaUpdate}
              onError={onError}
            />
          </main>

          {/* 右侧：属性面板 */}
          <aside className={styles.rightSidebar}>
            <PropertyPanel
              schema={schema}
              selectedId={selectedId}
              onSchemaChange={handleSchemaChange}
            />
          </aside>
        </div>

        {/* AI 历史抽屉 */}
        <HistoryDrawer onRollback={handleRollback} />
      </div>
    </ConfigProvider>
  );
}

/**
 * JSON Schema 编辑器，支持实时预览
 * 使用 ErrorBoundary 包裹以捕获渲染错误
 */
export function LowcodeEditor(props: LowcodeEditorProps) {
  return (
    <ErrorBoundary>
      <LowcodeEditorInner {...props} />
    </ErrorBoundary>
  );
}
