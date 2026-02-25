import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Input, Divider, Tag, Tooltip, message, Popover } from 'antd';
import {
  SendOutlined,
  BulbOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  SettingOutlined,
  DatabaseOutlined
} from '@ant-design/icons';
import type { A2UISchema } from '@lowcode-platform/types';
import { validateSchemaWithWhitelist } from '@lowcode-platform/renderer';
import { componentRegistry } from '@lowcode-platform/components';
import { aiApi } from './api';
import { serverAIService } from './ServerAIService';
import { AIConfig } from './AIConfig';
import type { AIModelConfig } from './types';
import './AIAssistant.css';

interface AIMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  schema?: A2UISchema;
  suggestions?: string[];
  status?: 'loading' | 'success' | 'error';
  modelUsed?: string;
}

interface AIAssistantProps {
  currentSchema: A2UISchema | null;
  onSchemaUpdate: (schema: A2UISchema) => void;
  onError?: (error: string) => void;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({
  currentSchema,
  onSchemaUpdate,
  onError
}) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [configVisible, setConfigVisible] = useState(false);
  const [currentModel, setCurrentModel] = useState<string>('mock');
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 加载模型列表
  const loadModels = useCallback(async () => {
    try {
      const allModels = await aiApi.getModels();
      setModels(allModels);

      // 设置当前选中模型
      if (currentModel === 'mock') { // 仅当当前未选择有效模型时才自动选择
        const defaultModel = allModels.find(m => m.isDefault && m.isAvailable) || allModels.find(m => m.isAvailable);
        if (defaultModel) {
          setCurrentModel(defaultModel.id);
        }
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      message.error('加载模型列表失败');
    }
  }, [currentModel]);

  // 滚动到最新消息
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 初始化
  useEffect(() => {
    loadModels();
    setMessages([
      {
        id: 'welcome',
        type: 'system',
        content: '🤖 AI助手已就绪！\n\n我可以帮你：\n• 根据描述生成页面结构\n• 优化现有Schema\n• 提供设计建议\n• 分析代码质量',
        timestamp: new Date()
      }
    ]);
  }, [loadModels]);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || loading) return;

    const userMessage: AIMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    // 添加 AI 消息占位符
    const aiMessageId = `ai-${Date.now()}`;
    const aiMessage: AIMessage = {
      id: aiMessageId,
      type: 'ai',
      content: '',
      timestamp: new Date(),
      status: 'loading',
      modelUsed: currentModel
    };

    setMessages(prev => [...prev, aiMessage]);

    try {
      const aiService = serverAIService;
      let fullContent = '';

      // 准备 Prompt
      let prompt = inputValue;
      let modelId = currentModel;
      const lowerInput = inputValue.toLowerCase();

      if (lowerInput.includes('分析') || lowerInput.includes('analyze') || lowerInput.includes('检查')) {
        if (currentSchema) {
          prompt = `请分析以下页面结构并提供改进建议：\n\`\`\`json\n${JSON.stringify(currentSchema, null, 2)}\n\`\`\`\n\n用户关注点：${inputValue}`;
        } else {
          // 没有 schema 时直接回答
        }
      } else if (lowerInput.includes('优化') || lowerInput.includes('optimize') || lowerInput.includes('改进')) {
        if (currentSchema) {
          prompt = `请优化以下页面结构，并返回优化后的 Schema（JSON格式）。\n\`\`\`json\n${JSON.stringify(currentSchema, null, 2)}\n\`\`\`\n\n优化需求：${inputValue}`;
        }
      }

      // 使用流式响应
      if (aiService.streamResponse) {
        await aiService.streamResponse(
          {
            prompt,
            modelId,
            context: { currentSchema: currentSchema || undefined }
          },
          (chunk) => {
            fullContent += chunk;
            setMessages(prev => prev.map(msg => {
              if (msg.id === aiMessageId) {
                return {
                  ...msg,
                  content: fullContent,
                  status: 'success' // 收到数据就开始标记为成功/进行中
                };
              }
              return msg;
            }));
          },
          (error) => {
            throw error;
          }
        );
      } else {
        // Fallback if streamResponse is not available (though it is in ServerAIService)
        const response = await aiService.generateResponse({
          prompt,
          modelId,
          context: { currentSchema: currentSchema || undefined }
        });
        fullContent = response.content;
        setMessages(prev => prev.map(msg =>
          msg.id === aiMessageId ? { ...msg, content: fullContent, status: 'success' } : msg
        ));
      }

      // 流结束后处理 Schema 解析
      let aiSchema: A2UISchema | undefined;
      try {
        const jsonMatch = fullContent.match(/```json\n([\s\S]*?)\n```/) || fullContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          aiSchema = JSON.parse(jsonStr);
        }
      } catch (e) {
        // Ignore parse error
      }

      // 更新最终消息状态（主要是添加 Schema）
      setMessages(prev => prev.map(msg => {
        if (msg.id === aiMessageId) {
          return {
            ...msg,
            schema: aiSchema,
            status: 'success'
          };
        }
        return msg;
      }));

      if (aiSchema) {
        message.success('Schema 生成完毕！');
      }

    } catch (error: any) {
      setMessages(prev => prev.map(msg => {
        if (msg.id === aiMessageId) {
          return {
            ...msg,
            content: msg.content + `\n\n[ERROR: ${error.message || '请求失败'}]`,
            status: 'error'
          };
        }
        return msg;
      }));
      onError?.(error.message || 'AI服务暂时不可用');
    } finally {
      setLoading(false);
    }
  }, [inputValue, loading, currentSchema, onSchemaUpdate, onError, currentModel]);

  const applySchema = useCallback((schema: A2UISchema) => {
    const whitelist = Object.keys(componentRegistry);
    const result = validateSchemaWithWhitelist(schema, whitelist);
    if (!result.success) {
      message.error(`AI 生成的 Schema 不合法: ${result.error.issues[0]?.message || '结构体错误'}`);
      return;
    }
    onSchemaUpdate(result.data);
    message.success('Schema已应用到编辑器！');
  }, [onSchemaUpdate]);

  const getCurrentModelName = () => {
    const model = models.find(m => m.id === currentModel);
    return model?.name || 'Unknown';
  };

  // 模型选择下拉框内容
  const modelSelectContent = (
    <div style={{ padding: '8px 0', minWidth: '200px' }}>
      <div style={{ padding: '0 12px 8px 12px', fontSize: '12px', color: '#858585' }}>选择AI模型</div>
      {models.map(model => (
        <div
          key={model.id}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: currentModel === model.id ? '#37373d' : 'transparent'
          }}
          onClick={() => {
            setCurrentModel(model.id);
            // Removed setDefaultModel call as it was local specific
          }}
        >
          <span style={{ color: '#cccccc' }}>{model.name}</span>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {model.isAvailable && <span style={{ color: '#52c41a', fontSize: '12px' }}>✓</span>}
            {model.isDefault && <span style={{ color: '#1890ff', fontSize: '12px' }}>默认</span>}
          </div>
        </div>
      ))}
      <Divider style={{ margin: '8px 0' }} />
      <div style={{ padding: '0 12px' }}>
        <Button
          type="text"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => {
            setConfigVisible(true);
          }}
          style={{ width: '100%', justifyContent: 'flex-start', color: '#cccccc' }}
        >
          管理模型
        </Button>
      </div>
    </div>
  );

  return (
    <div className="ai-assistant">
      <div className="ai-content">
        <div className="messages-container">
          {messages.map(message => (
            <div key={message.id} className={`message ${message.type}`}>
              {message.status === 'loading' ? (
                <LoadingOutlined className="loading-icon" />
              ) : message.status === 'error' ? (
                <span className="error-message">❌ {message.content}</span>
              ) : (
                <div className="message-content">
                  <div className="message-text">{message.content}</div>

                  {message.modelUsed && (
                    <div className="model-indicator">
                      <span className="model-label">模型: {message.modelUsed}</span>
                    </div>
                  )}

                  {message.suggestions && message.suggestions.length > 0 && (
                    <div className="suggestions">
                      <div className="suggestions-title">💡 建议：</div>
                      {message.suggestions.map((suggestion, index) => (
                        <Tag key={index} className="suggestion-tag">
                          {suggestion}
                        </Tag>
                      ))}
                    </div>
                  )}

                  {message.schema && (
                    <div className="schema-actions">
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        onClick={() => applySchema(message.schema!)}
                      >
                        应用此Schema
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <div className="message-time">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <Divider className="divider" />

        <div className="input-area">
          <Input.TextArea
            value={inputValue}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
            placeholder={`使用 ${getCurrentModelName()} 生成UI... 描述你想要的页面或让AI优化现有设计`}
            autoSize={{ minRows: 2, maxRows: 4 }}
            onPressEnter={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <div className="input-area-footer">
            <div className="input-area-header">
              <Popover
                content={modelSelectContent}
                trigger="click"
                placement="topLeft"
                arrow={false}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<DatabaseOutlined />}
                  style={{ color: '#cccccc' }}
                >
                  {getCurrentModelName()}
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
                  style={{ color: '#858585' }}
                />
              </Tooltip>

              <Tooltip title="AI功能说明">
                <BulbOutlined className="help-icon" />
              </Tooltip>
            </div>

            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendMessage}
              loading={loading}
              disabled={!inputValue.trim()}
              className="send-button"
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
        onConfigChange={(modelId) => setCurrentModel(modelId)}
      />
    </div>
  );
};
