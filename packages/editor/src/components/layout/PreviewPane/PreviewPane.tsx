import React from "react";
import { Layout, ConfigProvider, theme } from "antd";
import type { ComponentRegistry, A2UISchema } from "@lowcode-platform/types";
import { SelectableCanvas } from "./SelectableCanvas";
import styles from "./PreviewPane.module.css";

const { Content } = Layout;

interface PreviewPaneProps {
  schema: A2UISchema | null;
  allComponents: ComponentRegistry;
  eventContext: Record<string, unknown>;
  previewTheme: "light" | "dark";
  error: string | null;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  schema,
  allComponents,
  eventContext,
  previewTheme,
  error,
}) => {
  return (
    <Content
      className={`${styles.previewPane} ${styles[`${previewTheme}-theme`]}`}
    >
      <div className={styles.previewContainer}>
        <ConfigProvider
          theme={{
            algorithm:
              previewTheme === "dark"
                ? theme.darkAlgorithm
                : theme.defaultAlgorithm,
          }}
        >
          {error ? (
            <div className={styles.errorContainer}>
              <h3 className={styles.errorTitle}>渲染错误</h3>
              <pre>{error}</pre>
            </div>
          ) : (
            <SelectableCanvas
              schema={schema}
              allComponents={allComponents}
              eventContext={eventContext}
            />
          )}
        </ConfigProvider>
      </div>
    </Content>
  );
};
