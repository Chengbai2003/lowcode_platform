import React, { useState } from "react";
import { Layout, ConfigProvider, theme } from "antd";
import Editor from "@monaco-editor/react";
import type { ComponentRegistry, A2UISchema } from "../../../../types";
import { SelectableCanvas } from "./SelectableCanvas";
import { NoSchemaEmptyState } from "../../EmptyState";
import styles from "./PreviewPane.module.scss";

const { Content } = Layout;

interface PreviewPaneProps {
  schema: A2UISchema | null;
  allComponents: ComponentRegistry;
  eventContext: Record<string, unknown>;
  previewTheme: "light" | "dark";
}

// 生成 React 代码
const generateReactCode = (schema: A2UISchema | null): string => {
  if (!schema) return "// 暂无 Schema";

  return `import React from 'react';

export default function GeneratedComponent() {
  return (
    <div>
      {/* Schema Root: ${schema.rootId} */}
      {/* 此代码为自动生成，仅供参考 */}
    </div>
  );
}`;
};

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  schema,
  allComponents,
  eventContext,
  previewTheme,
}) => {
  const [activeTab, setActiveTab] = useState<"preview" | "json" | "code">(
    "preview",
  );
  const [compiledCode, setCompiledCode] = useState<string>("");
  const [isCompiled, setIsCompiled] = useState(false);

  // 编译按钮点击
  const handleCompile = () => {
    // 模拟编译过程
    setCompiledCode(generateReactCode(schema));
    setIsCompiled(true);
    setActiveTab("code");
  };

  const jsonValue = schema ? JSON.stringify(schema, null, 2) : "{}";

  return (
    <Content
      className={`${styles.previewPane} ${styles[`${previewTheme}-theme`]}`}
    >
      {/* 标签页切换 */}
      <div className={styles.tabBar}>
        <button
          onClick={() => setActiveTab("preview")}
          className={`${styles.tab} ${activeTab === "preview" ? styles.active : ""}`}
        >
          实时预览
        </button>
        <button
          onClick={() => setActiveTab("json")}
          className={`${styles.tab} ${activeTab === "json" ? styles.active : ""}`}
        >
          JSON
        </button>
        <button
          onClick={() => isCompiled && setActiveTab("code")}
          className={`${styles.tab} ${activeTab === "code" ? styles.active : ""} ${!isCompiled ? styles.disabled : ""}`}
          title={!isCompiled ? "请先点击编译按钮生成代码" : "编译后的代码"}
        >
          代码
        </button>
        <div className={styles.tabActions}>
          <button
            onClick={handleCompile}
            className={styles.compileButton}
            disabled={!schema}
          >
            编译
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className={styles.previewContainer}>
        <ConfigProvider
          theme={{
            algorithm:
              previewTheme === "dark"
                ? theme.darkAlgorithm
                : theme.defaultAlgorithm,
          }}
        >
          {activeTab === "preview" ? (
            !schema ? (
              <NoSchemaEmptyState />
            ) : (
              <SelectableCanvas
                schema={schema}
                allComponents={allComponents}
                eventContext={eventContext}
              />
            )
          ) : activeTab === "json" ? (
            <div className={styles.editorContainer}>
              <Editor
                height="100%"
                defaultLanguage="json"
                theme={previewTheme === "dark" ? "vs-dark" : "light"}
                value={jsonValue}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                  padding: { top: 16 },
                  readOnly: false,
                  automaticLayout: true,
                }}
              />
            </div>
          ) : (
            <div className={styles.editorContainer}>
              <Editor
                height="100%"
                defaultLanguage="typescript"
                theme={previewTheme === "dark" ? "vs-dark" : "light"}
                value={compiledCode}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                  padding: { top: 16 },
                  readOnly: true,
                  automaticLayout: true,
                }}
              />
            </div>
          )}
        </ConfigProvider>
      </div>
    </Content>
  );
};
