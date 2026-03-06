import { useState, useCallback, useMemo, useEffect } from "react";
import { ConfigProvider, theme, message, Modal } from "antd";
import type { LowcodeEditorProps } from "./types";
import type { A2UISchema } from "@lowcode-platform/types";
import { safeValidateSchema } from "@lowcode-platform/renderer";
import { componentRegistry } from "@lowcode-platform/components";
import { compileSchema } from "./services/compilerApi";
import {
  EditorHeader,
  ActivityBar,
  EditorPane,
  PreviewPane,
  PropertyPanel,
  ErrorBoundary,
} from "./components";
import { useDraftStorage } from "./hooks/useDraftStorage";
import { useSchemaHistory } from "./hooks/useSchemaHistory";
import { useFloatingIslandHotkey } from "./hooks/useFloatingIslandHotkey";
import { FloatingIsland } from "./components/ai-assistant/FloatingIsland";
import { HistoryDrawer } from "./components/ai-assistant/HistoryDrawer";
import { useSelectionStore } from "./store/editor-store";
import styles from "./LowcodeEditor.module.css";

/**
 * 编辑器内部组件
 */
function LowcodeEditorInner({
  initialSchema,
  editorWidth = "50%",
  theme: editorTheme = "vs-dark",
  height = "100vh",
  components: customComponents = {},
  onChange,
  onError,
  showLineNumbers = true,
  wordWrap = true,
  eventContext = {},
}: LowcodeEditorProps) {
  // 将 initialSchema 转换为 JSON 字符串
  const initialJson = useMemo(() => {
    if (typeof initialSchema === "string") {
      return initialSchema;
    }
    return initialSchema
      ? JSON.stringify(initialSchema, null, 2)
      : JSON.stringify(
          {
            rootId: "root",
            components: {
              root: {
                id: "root",
                type: "Page",
                props: {},
                childrenIds: [],
              },
            },
          },
          null,
          2,
        );
  }, [initialSchema]);

  const {
    present: json,
    push: setJson,
    forcePush: setJsonForce,
    undo,
    redo,
    canUndo,
    canRedo,
    historySize,
  } = useSchemaHistory(initialJson);
  const [schema, setSchema] = useState<A2UISchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"json" | "visual" | "code">(
    "json",
  );
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [compiledCode, setCompiledCode] = useState<string>("");

  const { saveDraft, loadDraft, clearDraft } = useDraftStorage("default");

  // Selection store integration
  const selectedId = useSelectionStore((state) => state.selectedId);
  const selectComponent = useSelectionStore((state) => state.selectComponent);

  // 浮动岛快捷键
  useFloatingIslandHotkey();

  // 处理组件选择（用于 ComponentTree）
  const handleSelectComponent = useCallback(
    (id: string) => {
      selectComponent(id);
    },
    [selectComponent],
  );

  // 处理 Schema 变化（用于 ComponentTree 右键菜单操作）
  const handleSchemaChangeFromTree = useCallback(
    (newSchema: A2UISchema) => {
      setSchema(newSchema);
      setJsonForce(JSON.stringify(newSchema, null, 2));
      onChange?.(newSchema);
    },
    [onChange, setJsonForce],
  );

  // 挂载时检查草稿
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.json !== initialJson) {
      const savedTime = new Date(draft.savedAt).toLocaleTimeString();
      Modal.confirm({
        title: "发现未保存的草稿",
        content: `上次编辑于 ${savedTime}，是否恢复？`,
        onOk: () => setJsonForce(draft.json),
        onCancel: () => clearDraft(),
      });
    }
  }, [loadDraft, clearDraft, initialJson, setJsonForce]);

  // 解析 JSON 并更新 schema
  useEffect(() => {
    try {
      const raw = JSON.parse(json);
      const result = safeValidateSchema(raw);

      if (!result.success) {
        throw new Error(
          `Schema 校验失败: ${result.error.issues[0]?.message || "非法 Schema"}`,
        );
      }

      setSchema(result.data);
      setError(null);
      onChange?.(result.data);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "无效的 JSON";
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [json, onChange, onError]);

  // 处理编辑器内容变化
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        setJson(value);
        saveDraft(value);
      }
    },
    [setJson, saveDraft],
  );

  // 编译处理函数
  const handleCompile = useCallback(async () => {
    if (schema) {
      try {
        // 调用后端编译 API
        const code = await compileSchema(schema);
        setCompiledCode(code);
        setActiveTab("code");
        message.success("编译成功！");
        clearDraft();
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "未知错误";
        console.error(e);
        message.error("编译失败: " + errorMessage);
      }
    } else {
      message.warning("Schema 为空，无法编译");
    }
  }, [schema, clearDraft]);

  // 处理AI生成的Schema更新
  const handleAISchemaUpdate = useCallback(
    (newSchema: A2UISchema) => {
      setSchema(newSchema);
      setJsonForce(JSON.stringify(newSchema, null, 2));
      onChange?.(newSchema);
      message.success("Schema 已更新！");
    },
    [onChange, setJsonForce],
  );

  // 处理历史回滚
  const handleRollback = useCallback(
    (actionResult: unknown) => {
      // 根据 actionResult 类型处理回滚
      if (actionResult && schema) {
        // 简单实现：重新加载历史 schema
        // 实际实现需要根据 actionResult.updates 等信息恢复
        message.info("回滚功能需要完整实现 actionResult 解析");
      }
    },
    [schema],
  );

  // 全局键盘快捷键 (Undo/Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };

    // 只在当前没有其它输入框捕获焦点时处理全局快捷键（Monaco 内部本身有撤销，这里主要是对整个工具链的保证）
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // 合并自定义组件与默认注册表（只取组件部分，不包含元数据）
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

  // 设置CSS变量
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-height",
      typeof height === "number" ? `${height}px` : height,
    );
  }, [height]);

  // 简化的布局逻辑：使用 flexbox
  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <div className={styles.lowcodeEditor}>
        <div className={styles.editorLayout}>
          <EditorHeader
            onCompile={handleCompile}
            previewTheme={previewTheme}
            onThemeChange={(t) => setPreviewTheme(t)}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            historySize={historySize}
          />
          <div className={styles.layoutWithHeader}>
            <ActivityBar activeTab={activeTab} setActiveTab={setActiveTab} />
            <EditorPane
              activeTab={activeTab}
              width={editorWidth}
              json={json}
              schema={schema}
              compiledCode={compiledCode}
              editorTheme={editorTheme}
              showLineNumbers={showLineNumbers}
              wordWrap={wordWrap}
              selectedId={selectedId}
              onSchemaChange={handleSchemaChangeFromTree}
              onSelectComponent={handleSelectComponent}
              handleEditorChange={handleEditorChange}
            />
            <div className={styles.mainContent}>
              <PreviewPane
                error={error}
                schema={schema}
                allComponents={allComponents}
                eventContext={eventContext}
                previewTheme={previewTheme}
              />
              <PropertyPanel
                schema={schema}
                selectedId={selectedId}
                onSchemaChange={handleSchemaChangeFromTree}
              />
            </div>
          </div>
        </div>
        {/* AI 浮动岛 */}
        <FloatingIsland
          currentSchema={schema}
          onSchemaUpdate={handleAISchemaUpdate}
          onError={onError}
        />
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
