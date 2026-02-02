import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Form, 
  Input, 
  Select, 
  Button, 
  Space, 
  message,
  Divider,
  Typography,
  Alert
} from 'antd';
import { SettingOutlined, ApiOutlined } from '@ant-design/icons';
import { aiModelManager } from './manager';
import type { AIModelConfig } from './types';
import './AIConfig.css';

const { Option } = Select;
const { Title, Text } = Typography;

interface AIConfigProps {
  visible: boolean;
  onClose: () => void;
  onConfigChange?: (modelId: string) => void;
}

export const AIConfig: React.FC<AIConfigProps> = ({
  visible,
  onClose,
  onConfigChange
}) => {
  const [form] = Form.useForm();
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('mock');
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadModels();
    }
  }, [visible]);

  const loadModels = () => {
    const allModels = aiModelManager.getAllModels();
    setModels(allModels);
    
    // 设置当前选中模型
    const defaultModel = allModels.find(m => m.isDefault);
    if (defaultModel) {
      setSelectedModel(defaultModel.id);
      form.setFieldsValue({
        modelId: defaultModel.id,
        apiKey: defaultModel.apiKey || '',
        baseURL: defaultModel.baseURL || ''
      });
    }
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    const model = models.find(m => m.id === modelId);
    if (model) {
      form.setFieldsValue({
        apiKey: model.apiKey || '',
        baseURL: model.baseURL || ''
      });
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      // 更新模型配置
      aiModelManager.updateModelConfig(selectedModel, {
        apiKey: values.apiKey,
        baseURL: values.baseURL
      });

      // 如果设置了API key，将其设为默认
      if (values.apiKey && selectedModel !== 'mock') {
        aiModelManager.setDefaultModel(selectedModel);
      }

      // 保存配置
      aiModelManager.saveConfigs();

      message.success('配置保存成功！');
      onConfigChange?.(selectedModel);
      
      // 重新加载模型列表
      loadModels();
    } catch (error) {
      message.error('配置保存失败');
    }
  };

  const handleTest = async () => {
    setTesting(selectedModel);
    
    try {
      const values = form.getFieldsValue();
      
      // 临时更新配置进行测试
      aiModelManager.updateModelConfig(selectedModel, {
        apiKey: values.apiKey,
        baseURL: values.baseURL
      });

      const service = aiModelManager.getActiveService(selectedModel);
      
      // 测试简单的请求
      await service.generateResponse({
        prompt: '测试连接',
        options: { maxTokens: 50 }
      });

      message.success(`${models.find(m => m.id === selectedModel)?.name} 连接测试成功！`);
    } catch (error: any) {
      message.error(`连接测试失败：${error.message || '未知错误'}`);
    } finally {
      setTesting(null);
    }
  };

  const handleReset = () => {
    aiModelManager.updateModelConfig(selectedModel, {
      apiKey: '',
      baseURL: ''
    });
    aiModelManager.saveConfigs();
    loadModels();
    message.success('配置已重置');
  };

  const currentModel = models.find(m => m.id === selectedModel);

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SettingOutlined />
          <span>AI模型配置</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={600}
      footer={
        <Space>
          <Button onClick={handleReset}>重置配置</Button>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSave}>保存配置</Button>
        </Space>
      }
    >
      <div className="ai-config">
        <div className="config-section">
          <Title level={4}>选择AI模型</Title>
          <Text type="secondary">
            选择你想要使用的AI模型，Mock AI作为兜底方案始终可用
          </Text>
          
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item
              name="modelId"
              label="AI模型"
              rules={[{ required: true, message: '请选择AI模型' }]}
            >
              <Select
                value={selectedModel}
                onChange={handleModelChange}
                placeholder="选择AI模型"
              >
                {models.map(model => (
                  <Option key={model.id} value={model.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{model.name}</span>
                      <Space>
                        {model.isAvailable && <span style={{ color: '#52c41a' }}>✓ 可用</span>}
                        {model.isDefault && <span style={{ color: '#1890ff' }}>默认</span>}
                      </Space>
                    </div>
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Divider />

            {currentModel && currentModel.provider !== 'local' && (
              <>
                <Title level={5}>API配置</Title>
                
                {currentModel.provider === 'openai' && (
                  <Alert
                    message="OpenAI配置"
                    description="需要有效的OpenAI API Key，可在 https://platform.openai.com/api-keys 获取"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                )}

                {currentModel.provider === 'anthropic' && (
                  <Alert
                    message="Anthropic配置"
                    description="需要有效的Anthropic API Key，可在 https://console.anthropic.com/ 获取"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                )}

                <Form.Item
                  name="apiKey"
                  label="API Key"
                  rules={[
                    { required: currentModel.provider !== 'mock', message: '请输入API Key' }
                  ]}
                >
                  <Input.Password
                    placeholder={currentModel.provider === 'openai' ? 'sk-...' : 'your-api-key'}
                  />
                </Form.Item>

                <Form.Item
                  name="baseURL"
                  label="Base URL (可选)"
                  help="如使用代理或自定义端点"
                >
                  <Input
                    placeholder={currentModel.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com'}
                  />
                </Form.Item>

                <Form.Item>
                  <Button
                    icon={<ApiOutlined />}
                    loading={testing === selectedModel}
                    onClick={handleTest}
                    disabled={!form.getFieldValue('apiKey')}
                  >
                    测试连接
                  </Button>
                </Form.Item>

                <Divider />
              </>
            )}

            <Title level={5}>模型信息</Title>
            <div className="model-info">
              <div><strong>模型：</strong>{currentModel?.name}</div>
              <div><strong>提供商：</strong>{currentModel?.provider}</div>
              <div><strong>模型ID：</strong>{currentModel?.model}</div>
              <div><strong>状态：</strong>
                <span style={{ color: currentModel?.isAvailable ? '#52c41a' : '#ff4d4f' }}>
                  {currentModel?.isAvailable ? '可用' : '需要配置'}
                </span>
              </div>
              <div><strong>兜底方案：</strong>
                <span style={{ color: '#1890ff' }}>Mock AI始终可用</span>
              </div>
            </div>
          </Form>
        </div>
      </div>
    </Modal>
  );
};