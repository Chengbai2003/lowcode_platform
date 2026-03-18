import React, { useState, useCallback } from 'react';
import { Button, Input, Divider, Tooltip, message, Popover } from 'antd';
import { SendOutlined, BulbOutlined, SettingOutlined, DatabaseOutlined } from '@ant-design/icons';
import type { A2UISchema } from '../../../../types';
import { validateAndAutoFixA2UISchema } from '../../../../schema/schemaValidation';
import { componentRegistry } from '../../../../components';
import { builtInComponents } from '../../../../renderer';
import { AIConfig } from '../AIConfig/AIConfig';
import type { AIModelConfig } from '../types/ai-types';
import { useAIModels } from './useAIModels';
import { useAIAssistantChat } from './useAIAssistantChat';
import { AIAssistantMessageList } from './AIAssistantMessageList';
import styles from './AIAssistant.module.scss';

interface AIAssistantProps {
  currentSchema: A2UISchema | null;
  pageId?: string;
  pageVersion?: number | null;
  selectedId?: string | null;
  onSchemaUpdate?: (schema: A2UISchema) => void;
  onError?: (error: string) => void;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({
  currentSchema,
  pageId,
  pageVersion,
  selectedId,
  onSchemaUpdate,
  onError,
}) => {
  const [configVisible, setConfigVisible] = useState(false);
  const {
    models,
    currentModel,
    setCurrentModel,
    loadModels,
    ensureModelsLoaded,
    currentModelName,
  } = useAIModels();

  const { messages, inputValue, setInputValue, loading, sendMessage, messagesEndRef } =
    useAIAssistantChat({
      currentSchema,
      currentModel,
      pageId,
      pageVersion,
      selectedId,
      models,
      loadModels,
      ensureModelsLoaded,
      onError,
    });

  const applySchema = useCallback(
    (schema: A2UISchema) => {
      const whitelist = Array.from(
        new Set([...Object.keys(builtInComponents), ...Object.keys(componentRegistry)]),
      );
      const result = validateAndAutoFixA2UISchema(schema, whitelist);

      if (result.fixes.length > 0) {
        message.info(`已自动修复 ${result.fixes.length} 处 AI 生成错误`);
      }

      if (!result.success) {
        message.error(
          `AI 生成的 Schema 不合法: ${result.error?.issues?.[0]?.message || '结构体错误'}`,
        );
        return;
      }
      if (result.data) {
        onSchemaUpdate?.(result.data);
        message.success('Schema已应用到编辑器！');
      }
    },
    [onSchemaUpdate],
  );

  const selectedComponent =
    selectedId && currentSchema ? currentSchema.components[selectedId] : null;

  const modelSelectContent = (
    <div className={styles.modelSelectContent}>
      <div className={styles.modelSelectHeader}>选择AI模型</div>
      {models.map((model: AIModelConfig) => (
        <div
          key={model.id}
          className={`${styles.modelItem} ${currentModel === model.id ? styles.selectedModel : ''}`}
          onClick={() => {
            setCurrentModel(model.id);
          }}
        >
          <span className={styles.modelName}>{model.name}</span>
          <div className={styles.modelStatus}>
            {model.isAvailable && <span className={styles.availableIndicator}>✓</span>}
            {model.isDefault && <span className={styles.defaultLabel}>默认</span>}
          </div>
        </div>
      ))}
      <Divider className={styles.divider} />
      <div className={styles.configButtonContainer}>
        <Button
          type="text"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => {
            setConfigVisible(true);
          }}
          className={styles.manageModelsButton}
        >
          管理模型
        </Button>
      </div>
    </div>
  );

  return (
    <div className={styles.aiAssistant}>
      <div className={styles.aiContent}>
        <AIAssistantMessageList
          messages={messages}
          onApplySchema={applySchema}
          endRef={messagesEndRef}
        />

        <Divider className={styles.divider} />

        <div className={styles.inputArea}>
          {selectedComponent && (
            <div className={styles.selectionContext}>
              <span className={styles.selectionContextLabel}>当前选中</span>
              <span className={styles.selectionContextValue}>
                {selectedComponent.type} ({selectedId})
              </span>
            </div>
          )}
          <Input.TextArea
            value={inputValue}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
            placeholder={`使用 ${currentModelName} 生成UI... 描述你想要的页面或让AI优化现有设计`}
            autoSize={{ minRows: 2, maxRows: 4 }}
            onPressEnter={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (!e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <div className={styles.inputAreaFooter}>
            <div className={styles.inputAreaHeader}>
              <Popover
                content={modelSelectContent}
                trigger="click"
                placement="topLeft"
                arrow={false}
                onOpenChange={(open) => {
                  if (open) ensureModelsLoaded();
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<DatabaseOutlined />}
                  className={styles.modelButton}
                >
                  {currentModelName}
                </Button>
              </Popover>

              <Tooltip title="管理AI模型">
                <Button
                  type="text"
                  size="small"
                  icon={<SettingOutlined />}
                  onClick={() => {
                    loadModels();
                    setConfigVisible(true);
                  }}
                  className={styles.configButton}
                />
              </Tooltip>

              <Tooltip title="AI功能说明">
                <BulbOutlined className={styles.helpIcon} />
              </Tooltip>
            </div>

            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={sendMessage}
              loading={loading}
              disabled={!inputValue.trim()}
              className={styles.sendButton}
            >
              发送
            </Button>
          </div>
        </div>
      </div>

      <AIConfig
        visible={configVisible}
        onClose={() => {
          setConfigVisible(false);
          loadModels();
        }}
        onConfigChange={(modelId: string) => setCurrentModel(modelId)}
      />
    </div>
  );
};
