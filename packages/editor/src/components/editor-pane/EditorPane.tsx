import React from "react";
import { Layout } from "antd";
import Editor from "@monaco-editor/react";
import { ComponentTree } from "../TreeView/ComponentTree";
import type { A2UISchema } from "@lowcode-platform/types";
import styles from "./EditorPane.module.css";

const { Sider } = Layout;

interface EditorPaneProps {
  activeTab: "json" | "visual" | "code";
  width: number | string;
  json: string;
  schema: A2UISchema | null;
  compiledCode?: string;
  editorTheme: string;
  showLineNumbers: boolean;
  wordWrap: boolean;
  selectedId: string | null;
  onSchemaChange: (schema: A2UISchema) => void;
  onSelectComponent: (id: string) => void;
  handleEditorChange: (value: string | undefined) => void;
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  activeTab,
  width,
  json,
  schema,
  compiledCode,
  editorTheme,
  showLineNumbers,
  wordWrap,
  selectedId,
  onSchemaChange,
  onSelectComponent,
  handleEditorChange,
}) => {
  return (
    <Sider width={width} className={styles.editorPane}>
      <div className={styles.editorPaneContent}>
        <div className={styles.editorHeader}>
          <span>
            {activeTab === "json"
              ? "JSON SCHEMA"
              : activeTab === "code"
                ? "REACT CODE"
                : "VISUAL EDITOR"}
          </span>
        </div>

        <div className={styles.editorBody}>
          {activeTab === "json" ? (
            <Editor
              key="json"
              height="100%"
              defaultLanguage="json"
              theme={editorTheme}
              value={json}
              onChange={handleEditorChange}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: showLineNumbers ? "on" : "off",
                wordWrap: wordWrap ? "on" : "off",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                formatOnPaste: true,
                formatOnType: true,
              }}
            />
          ) : activeTab === "code" ? (
            <Editor
              key="code"
              height="100%"
              defaultLanguage="typescript"
              theme={editorTheme}
              value={compiledCode || '// 点击上方"编译运行"按钮生成代码'}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: showLineNumbers ? "on" : "off",
                wordWrap: wordWrap ? "on" : "off",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          ) : activeTab === "visual" ? (
            <div className={styles.visualEditorContainer}>
              <ComponentTree
                schema={schema}
                selectedId={selectedId}
                onSelect={onSelectComponent}
                onSchemaChange={onSchemaChange}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Sider>
  );
};
