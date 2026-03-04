import React from "react";
import { Layout } from "antd";
import Editor from "@monaco-editor/react";
import styles from "./EditorPane.module.css";

const { Sider } = Layout;

interface EditorPaneProps {
  activeTab: "json" | "visual" | "code";
  width: number | string;
  json: string;
  compiledCode?: string;
  editorTheme: string;
  showLineNumbers: boolean;
  wordWrap: boolean;
  handleEditorChange: (value: string | undefined) => void;
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  activeTab,
  width,
  json,
  compiledCode,
  editorTheme,
  showLineNumbers,
  wordWrap,
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
            <div className={styles.visualEditorPlaceholder}>
              <div className={styles.constructionIcon}>🚧</div>
              <div className={styles.visualEditorTitle}>可视化编辑器开发中</div>
              <div className={styles.visualEditorDescription}>
                即将支持拖拽布局与属性配置
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Sider>
  );
};
