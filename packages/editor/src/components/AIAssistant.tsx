import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Input, Space, Divider, Tag, Tooltip, message } from 'antd';
import { SendOutlined, BulbOutlined, RobotOutlined, LoadingOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { A2UISchema } from '@lowcode-platform/renderer';
import './AIAssistant.css';

interface AIMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  schema?: A2UISchema;
  suggestions?: string[];
  status?: 'loading' | 'success' | 'error';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        type: 'system',
        content: '🤖 AI助手已就绪！我可以帮你：\n• 根据描述生成页面结构\n• 优化现有Schema\n• 提供设计建议\n• 分析代码质量',
        timestamp: new Date()
      }
    ]);
  }, []);

  const generateMockResponse = async (prompt: string): Promise<{ schema?: A2UISchema, explanation: string, suggestions?: string[] }> => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('登录') || lowerPrompt.includes('login')) {
      return {
        schema: {
          rootId: 'root',
          components: {
            root: {
              id: 'root',
              type: 'Container',
              props: {
                style: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }
              },
              childrenIds: ['loginForm']
            },
            loginForm: {
              id: 'loginForm',
              type: 'Card',
              props: { title: '用户登录', style: { width: '400px' } },
              childrenIds: ['form']
            },
            form: {
              id: 'form',
              type: 'Form',
              props: { layout: 'vertical' },
              childrenIds: ['username', 'password', 'submit']
            },
            username: {
              id: 'username',
              type: 'FormItem',
              props: { label: '用户名', name: 'username' },
              childrenIds: ['usernameInput']
            },
            usernameInput: {
              id: 'usernameInput',
              type: 'Input',
              props: { placeholder: '请输入用户名' }
            },
            password: {
              id: 'password',
              type: 'FormItem',
              props: { label: '密码', name: 'password' },
              childrenIds: ['passwordInput']
            },
            passwordInput: {
              id: 'passwordInput',
              type: 'Input',
              props: { type: 'password', placeholder: '请输入密码' }
            },
            submit: {
              id: 'submit',
              type: 'FormItem',
              childrenIds: ['submitButton']
            },
            submitButton: {
              id: 'submitButton',
              type: 'Button',
              props: { type: 'primary', block: true, children: '登录' }
            }
          }
        },
        explanation: '我为你生成了一个标准的登录表单，包含用户名、密码输入框和登录按钮。布局采用垂直表单样式，整体居中显示。'
      };
    }
    
    if (lowerPrompt.includes('表格') || lowerPrompt.includes('table')) {
      return {
        schema: {
          rootId: 'root',
          components: {
            root: {
              id: 'root',
              type: 'Container',
              props: { padding: '24px' },
              childrenIds: ['table']
            },
            table: {
              id: 'table',
              type: 'Table',
              props: {
                dataSource: [],
                columns: [
                  { title: '姓名', dataIndex: 'name', key: 'name' },
                  { title: '年龄', dataIndex: 'age', key: 'age' },
                  { title: '地址', dataIndex: 'address', key: 'address' }
                ]
              }
            }
          }
        },
        explanation: '我创建了一个数据表格，包含姓名、年龄、地址三列。你可以通过设置dataSource属性来填充实际数据。'
      };
    }
    
    if (lowerPrompt.includes('分析') || lowerPrompt.includes('analyze') || lowerPrompt.includes('检查')) {
      return {
        explanation: '当前页面结构清晰，使用了基础的布局组件。整体设计简洁，符合现代UI规范。',
        suggestions: [
          '添加页面标题提升用户导航',
          '考虑添加面包屑导航',
          '为长页面添加返回顶部按钮'
        ]
      };
    }
    
    if (lowerPrompt.includes('优化') || lowerPrompt.includes('optimize') || lowerPrompt.includes('改进')) {
      return {
        explanation: '我已经分析了你的页面结构，并提供以下优化建议。',
        suggestions: [
          '建议添加响应式断点优化移动端体验',
          '考虑为表单字段添加验证规则',
          '可以为按钮添加加载状态'
        ]
      };
    }
    
    return {
      schema: {
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Container',
            props: { padding: '24px' },
            childrenIds: ['content']
          },
          content: {
            id: 'content',
            type: 'Div',
            props: { 
              style: { textAlign: 'center', padding: '48px' },
              children: 'AI为你生成的内容'
            }
          }
        },
        explanation: '我为你创建了一个基础容器结构。你可以继续告诉我需要添加什么具体内容。'
      }
    };
  };

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

    const thinkingMessage: AIMessage = {
      id: `thinking-${Date.now()}`,
      type: 'ai',
      content: '正在分析你的需求...',
      timestamp: new Date(),
      status: 'loading'
    };

    setMessages(prev => [...prev, thinkingMessage]);

    try {
      const response = await generateMockResponse(inputValue);

      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessage.id));

      const aiMessage: AIMessage = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: response.explanation,
        timestamp: new Date(),
        schema: response.schema,
        suggestions: response.suggestions,
        status: 'success'
      };

      setMessages(prev => [...prev, aiMessage]);

      if (response.schema) {
        onSchemaUpdate(response.schema);
        message.success('Schema已更新！');
      }

    } catch (error) {
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessage.id));

      const errorMessage: AIMessage = {
        id: `error-${Date.now()}`,
        type: 'ai',
        content: '抱歉，处理你的请求时遇到了问题。请稍后重试。',
        timestamp: new Date(),
        status: 'error'
      };

      setMessages(prev => [...prev, errorMessage]);
      onError?.('AI服务暂时不可用');
    } finally {
      setLoading(false);
    }
  }, [inputValue, loading, onSchemaUpdate, onError]);

  const handleQuickAction = useCallback(async (action: string) => {
    setInputValue(action);
    setTimeout(() => handleSendMessage(), 100);
  }, [handleSendMessage]);

  const applySchema = useCallback((schema: A2UISchema) => {
    onSchemaUpdate(schema);
    message.success('Schema已应用到编辑器！');
  }, [onSchemaUpdate]);

  return (
    <div className="ai-assistant">
      <div className="ai-header">
        <RobotOutlined className="ai-icon" />
        <span className="ai-title">AI 助手</span>
        <Tooltip title="AI助手可以帮助你生成、分析和优化页面结构">
          <BulbOutlined className="help-icon" />
        </Tooltip>
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
                  
                  {message.suggestions && (
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
            placeholder="描述你想要创建的页面，或者让AI优化现有设计..."
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
    </div>
  );
};