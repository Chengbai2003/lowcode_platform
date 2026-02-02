import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Input, Space, Divider, Tag, Tooltip, message, Dropdown } from 'antd';
import { 
  SendOutlined, 
  BulbOutlined, 
  RobotOutlined, 
  LoadingOutlined, 
  CheckCircleOutlined,
  SettingOutlined,
  DownOutlined
} from '@ant-design/icons';
import type { A2UISchema } from '@lowcode-platform/renderer';
import { aiModelManager } from './manager';
import { AIConfig } from './AIConfig';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 滚动到最新消息
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 初始化消息和模型
  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        type: 'system',
        content: '🤖 AI助手已就绪！\n\n我可以帮你：\n• 根据描述生成页面结构\n• 优化现有Schema\n• 提供设计建议\n• 分析代码质量\n\n💡 点击右上角设置按钮配置AI模型',
        timestamp: new Date()
      }
    ]);
    
    // 获取当前模型
    const models = aiModelManager.getAllModels();
    const defaultModel = models.find(m => m.isDefault);
    if (defaultModel) {
      setCurrentModel(defaultModel.id);
    }
  }, []);

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

    // 添加思考中的消息
    const thinkingMessage: AIMessage = {
      id: `thinking-${Date.now()}`,
      type: 'ai',
      content: '正在分析你的需求...',
      timestamp: new Date(),
      status: 'loading',
      modelUsed: currentModel
    };

    setMessages(prev => [...prev, thinkingMessage]);

    try {
      // 获取当前AI服务
      const aiService = aiModelManager.getActiveService(currentModel);
      let response;

      // 根据用户输入判断意图
      const lowerInput = inputValue.toLowerCase();
      
      if (lowerInput.includes('分析') || lowerInput.includes('analyze') || lowerInput.includes('检查')) {
        if (currentSchema && aiService.analyzeSchema) {
          response = await aiService.analyzeSchema(currentSchema);
        } else {
          response = { analysis: '当前没有可分析的页面结构。请先创建一些内容。', issues: [], suggestions: [] };
        }
      } else if (lowerInput.includes('优化') || lowerInput.includes('optimize') || lowerInput.includes('改进')) {
        if (currentSchema && aiService.optimizeSchema) {
          response = await aiService.optimizeSchema(currentSchema);
        } else {
          response = { optimizedSchema: currentSchema || {}, suggestions: ['请先创建页面内容以进行优化'] };
        }
      } else {
        // 生成Schema
        response = await aiService.generateResponse({
          prompt: inputValue,
          context: { currentSchema: currentSchema || undefined }
        });
      }

      // 移除思考中的消息
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessage.id));

      // 构建AI回复
      let aiContent = '';
      let aiSchema: A2UISchema | undefined;
      let aiSuggestions: string[] = [];

      if ('content' in response) {
        aiContent = response.content;
        if ('schema' in response) aiSchema = response.schema;
        if ('suggestions' in response) aiSuggestions = response.suggestions || [];
      } else if ('analysis' in response) {
        aiContent = response.analysis;
        if ('suggestions' in response) aiSuggestions = response.suggestions || [];
      } else if ('optimizedSchema' in response) {
        aiContent = '我已经优化了你的页面结构，主要改进包括性能提升和用户体验优化。';
        aiSchema = response.optimizedSchema as A2UISchema;
        if ('suggestions' in response) aiSuggestions = response.suggestions || [];
      }

      const aiMessage: AIMessage = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: aiContent,
        timestamp: new Date(),
        schema: aiSchema,
        suggestions: aiSuggestions,
        status: 'success',
        modelUsed: currentModel
      };

      setMessages(prev => [...prev, aiMessage]);

      // 如果有Schema，自动应用
      if (aiSchema) {
        onSchemaUpdate(aiSchema);
        message.success('Schema已更新！');
      }

    } catch (error: any) {
      // 移除思考中的消息
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessage.id));

      const errorMessage: AIMessage = {
        id: `error-${Date.now()}`,
        type: 'ai',
        content: `处理失败：${error.message || '未知错误'}。请检查模型配置或重试。`,
        timestamp: new Date(),
        status: 'error',
        modelUsed: currentModel
      };

      setMessages(prev => [...prev, errorMessage]);
      onError?.(error.message || 'AI服务暂时不可用');
    } finally {
      setLoading(false);
    }
  }, [inputValue, loading, currentSchema, onSchemaUpdate, onError, currentModel]);

  const handleQuickAction = useCallback(async (action: string) => {
    setInputValue(action);
    setTimeout(() => handleSendMessage(), 100);
  }, [handleSendMessage]);

  const applySchema = useCallback((schema: A2UISchema) => {
    onSchemaUpdate(schema);
    message.success('Schema已应用到编辑器！');
  }, [onSchemaUpdate]);

  // 模型下拉菜单
  const modelMenu = {
    items: aiModelManager.getAllModels().map(model => ({
      key: model.id,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{model.name}</span>
          <Space>
            {model.isAvailable && <span style={{ color: '#52c41a', fontSize: '12px' }}>✓</span>}
            {model.isDefault && <span style={{ color: '#1890ff', fontSize: '12px' }}>默认</span>}
          </Space>
        </div>
      ),
      onClick: () => {
        setCurrentModel(model.id);
        aiModelManager.setDefaultModel(model.id);
      }
    }))
  };

  const getCurrentModelName = () => {
    const model = aiModelManager.getAllModels().find(m => m.id === currentModel);
    return model?.name || 'Unknown';
  };

  return (
    <div className="ai-assistant">
      <div className="ai-header">
        <RobotOutlined className="ai-icon" />
        <span className="ai-title">AI 助手</span>
        <div className="header-actions">
          <Dropdown menu={modelMenu} placement="bottomRight">
            <Button type="text" size="small" icon={<DownOutlined />}>
              {getCurrentModelName()}
            </Button>
          </Dropdown>
          <Tooltip title="AI模型配置">
            <Button
              type="text"
              size="small"
              icon={<SettingOutlined />}
              onClick={() => setConfigVisible(true)}
            />
          </Tooltip>
          <Tooltip title="AI功能说明">
            <BulbOutlined className="help-icon" />
          </Tooltip>
        </div>
      </div>

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

        <div className="quick-actions">
          <Space wrap>
            <Button 
              size="small" 
              onClick={() => handleQuickAction('生成一个登录页面')}
            >
              登录页面
            </Button>
            <Button 
              size="small" 
              onClick={() => handleQuickAction('生成一个数据表格')}
            >
              数据表格
            </Button>
            <Button 
              size="small" 
              onClick={() => handleQuickAction('生成一个导航栏')}
            >
              导航栏
            </Button>
            <Button 
              size="small" 
              onClick={() => handleQuickAction('优化当前页面布局')}
            >
              优化布局
            </Button>
            <Button 
              size="small" 
              onClick={() => handleQuickAction('分析当前页面设计')}
            >
              分析设计
            </Button>
          </Space>
        </div>

        <div className="input-area">
          <Input.TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`使用 ${getCurrentModelName()} 生成UI... 描述你想要的页面或让AI优化现有设计`}
            autoSize={{ minRows: 2, maxRows: 4 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            loading={loading}
            disabled={!inputValue.trim()}
          >
            发送
          </Button>
        </div>
      </div>

      <AIConfig
        visible={configVisible}
        onClose={() => setConfigVisible(false)}
        onConfigChange={(modelId) => setCurrentModel(modelId)}
      />
    </div>
  );
};