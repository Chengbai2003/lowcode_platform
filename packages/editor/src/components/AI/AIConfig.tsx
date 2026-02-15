import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Space,
  message,
  Divider,
  Typography,
  Alert,
  List,
  Popconfirm,
  Card
} from 'antd';
import {
  SettingOutlined,
  ApiOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  DatabaseOutlined
} from '@ant-design/icons';
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

type ViewMode = 'list' | 'edit' | 'add';

export const AIConfig: React.FC<AIConfigProps> = ({
  visible,
  onClose,
  onConfigChange
}) => {
  const [form] = Form.useForm();
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadModels();
      setViewMode('list');
      setEditingModel(null);
    }
  }, [visible]);

  const loadModels = () => {
    const allModels = aiModelManager.getAllModels();
    setModels(allModels);
  };

  const handleAddModel = () => {
    setViewMode('add');
    setEditingModel(null);
    form.resetFields();
    form.setFieldsValue({
      provider: 'openai',
      baseURL: 'https://api.openai.com/v1'
    });
  };

  const handleEditModel = (model: AIModelConfig) => {
    setViewMode('edit');
    setEditingModel(model.id);
    form.setFieldsValue({
      name: model.name,
      provider: model.provider,
      model: model.model,
      apiKey: model.apiKey || '',
      baseURL: model.baseURL || '',
      maxTokens: model.maxTokens || 2000,
      temperature: model.temperature || 0.7
    });
  };

  const handleBackToList = () => {
    setViewMode('list');
    setEditingModel(null);
    form.resetFields();
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      if (viewMode === 'add') {
        // 新增模型
        const id = `${values.provider}-${Date.now()}`;
        aiModelManager.addModel({
          id,
          name: values.name,
          provider: values.provider,
          model: values.model,
          apiKey: values.apiKey,
          baseURL: values.baseURL,
          maxTokens: values.maxTokens,
          temperature: values.temperature
        });
        message.success('模型添加成功！');
      } else if (viewMode === 'edit' && editingModel) {
        // 更新模型
        aiModelManager.updateModelConfig(editingModel, {
          name: values.name,
          model: values.model,
          apiKey: values.apiKey,
          baseURL: values.baseURL,
          maxTokens: values.maxTokens,
          temperature: values.temperature
        });
        message.success('模型更新成功！');
      }

      // 保存配置
      aiModelManager.saveConfigs();

      // 重新加载模型列表
      loadModels();
      setViewMode('list');
      setEditingModel(null);

    } catch (error) {
      message.error('保存失败');
    }
  };

  const handleDelete = (modelId: string) => {
    if (aiModelManager.deleteModel(modelId)) {
      message.success('模型已删除');
      loadModels();
    } else {
      message.warning('无法删除该模型');
    }
  };

  const handleSetDefault = (modelId: string) => {
    aiModelManager.setDefaultModel(modelId);
    aiModelManager.saveConfigs();
    loadModels();
    message.success('已设为默认模型');
    onConfigChange?.(modelId);
  };

  const handleTest = async (model: AIModelConfig) => {
    setTesting(model.id);

    try {
      // 临时更新配置进行测试
      const currentValues = form.getFieldsValue();
      if (viewMode !== 'list') {
        aiModelManager.updateModelConfig(model.id, {
          apiKey: currentValues.apiKey,
          baseURL: currentValues.baseURL
        });
      }

      const service = aiModelManager.getActiveService(model.id);

      // 测试简单的请求
      await service.generateResponse({
        prompt: '你好',
        options: { maxTokens: 50 }
      });

      message.success(`${model.name} 连接测试成功！`);
    } catch (error: any) {
      message.error(`连接测试失败：${error.message || '未知错误'}`);
    } finally {
      setTesting(null);
    }
  };

  const getProviderLabel = (provider: string) => {
    const labels: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      ollama: 'Ollama (本地)',
      mock: 'Mock AI'
    };
    return labels[provider] || provider;
  };

  const getProviderDefaultBaseURL = (provider: string) => {
    const defaults: Record<string, string> = {
      openai: 'https://api.openai.com/v1',
      anthropic: 'https://api.anthropic.com',
      ollama: 'http://localhost:11434'
    };
    return defaults[provider] || '';
  };

  const handleProviderChange = (provider: string) => {
    form.setFieldValue('baseURL', getProviderDefaultBaseURL(provider));
  };

  const renderList = () => (
    <div className="model-list-container">
      <div className="model-list-header">
        <Title level={4}>AI 模型管理</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddModel}
        >
          添加模型
        </Button>
      </div>

      <List
        dataSource={models}
        renderItem={(model) => (
          <List.Item key={model.id}>
            <Card
              size="small"
              className="model-card"
              actions={[
                <Button
                  icon={<EditOutlined />}
                  type="text"
                  size="small"
                  onClick={() => handleEditModel(model)}
                >
                  编辑
                </Button>,
                model.provider !== 'mock' && (
                  <Button
                    icon={<ApiOutlined />}
                    type="text"
                    size="small"
                    loading={testing === model.id}
                    onClick={() => handleTest(model)}
                  >
                    测试
                  </Button>
                ),
                !model.isDefault && (
                  <Button
                    icon={<CheckCircleOutlined />}
                    type="text"
                    size="small"
                    onClick={() => handleSetDefault(model.id)}
                  >
                    设为默认
                  </Button>
                ),
                model.provider !== 'mock' && (
                  <Popconfirm
                    title="确认删除"
                    description="确定要删除这个模型吗？"
                    onConfirm={() => handleDelete(model.id)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      icon={<DeleteOutlined />}
                      type="text"
                      size="small"
                      danger
                    >
                      删除
                    </Button>
                  </Popconfirm>
                )
              ].filter(Boolean)}
            >
              <Card.Meta
                avatar={<DatabaseOutlined style={{ fontSize: '24px', color: model.isAvailable ? '#52c41a' : '#858585' }} />}
                title={
                  <Space>
                    <span>{model.name}</span>
                    {model.isDefault && <span style={{ color: '#1890ff', fontSize: '12px' }}>默认</span>}
                    {model.isAvailable && <span style={{ color: '#52c41a', fontSize: '12px' }}>✓ 可用</span>}
                  </Space>
                }
                description={
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      提供商: {getProviderLabel(model.provider)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      模型: {model.model}
                    </Text>
                    {model.baseURL && (
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        地址: {model.baseURL}
                      </Text>
                    )}
                  </Space>
                }
              />
            </Card>
          </List.Item>
        )}
      />
    </div>
  );

  const renderForm = () => {
    const isEdit = viewMode === 'edit';

    return (
      <div className="model-form-container">
        <div className="model-form-header">
          <Button onClick={handleBackToList}>
            ← 返回
          </Button>
          <Title level={4}>{isEdit ? '编辑模型' : '添加模型'}</Title>
        </div>

        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="模型名称"
            rules={[{ required: true, message: '请输入模型名称' }]}
          >
            <Input placeholder="例如: My Custom Model" />
          </Form.Item>

          <Form.Item
            name="provider"
            label="提供商"
            rules={[{ required: true, message: '请选择提供商' }]}
          >
            <Select placeholder="选择AI提供商" onChange={handleProviderChange}>
              <Option value="openai">OpenAI (GPT 系列)</Option>
              <Option value="anthropic">Anthropic (Claude 系列)</Option>
              <Option value="ollama">Ollama (本地模型)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="model"
            label="模型 ID"
            rules={[{ required: true, message: '请输入模型 ID' }]}
            extra={
              <Text type="secondary" style={{ fontSize: '12px' }}>
                OpenAI: gpt-4, gpt-3.5-turbo | Anthropic: claude-3-opus-20240229, claude-3-sonnet-20240229 | Ollama: llama2, mistral, codellama
              </Text>
            }
          >
            <Input placeholder="例如: gpt-4, claude-3-opus-20240229, llama2" />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.provider !== curr.provider}
          >
            {({ getFieldValue }) => {
              const provider = getFieldValue('provider');
              if (provider === 'ollama') {
                return (
                  <Alert
                    message="Ollama 配置"
                    description="确保 Ollama 已在本地运行，默认地址 http://localhost:11434"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                );
              }
              if (provider === 'openai') {
                return (
                  <Alert
                    message="OpenAI 配置"
                    description="需要有效的 OpenAI API Key，可在 https://platform.openai.com/api-keys 获取"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                );
              }
              if (provider === 'anthropic') {
                return (
                  <Alert
                    message="Anthropic 配置"
                    description="需要有效的 Anthropic API Key，可在 https://console.anthropic.com/ 获取"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                );
              }
              return null;
            }}
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.provider !== curr.provider}
          >
            {({ getFieldValue }) => {
              const provider = getFieldValue('provider');
              if (provider === 'ollama') {
                return null; // Ollama 不需要 API Key
              }
              return (
                <Form.Item
                  name="apiKey"
                  label="API Key"
                  rules={[
                    { required: provider !== 'ollama', message: '请输入 API Key' }
                  ]}
                >
                  <Input.Password placeholder="sk-..." />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item
            name="baseURL"
            label="Base URL (可选)"
            extra="如使用代理或自定义端点"
          >
            <Input placeholder="例如: https://api.openai.com/v1" />
          </Form.Item>

          <Divider />

          <Title level={5}>高级选项</Title>

          <Form.Item
            name="maxTokens"
            label="最大 Token 数"
            initialValue={2000}
          >
            <InputNumber min={100} max={128000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="temperature"
            label="Temperature (温度)"
            initialValue={0.7}
            extra="值越高越有创意，值越低越确定性"
          >
            <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </div>
    );
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SettingOutlined />
          <span>AI 模型配置</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={700}
      footer={
        viewMode === 'list' ? (
          <Button onClick={onClose}>关闭</Button>
        ) : (
          <Space>
            <Button onClick={handleBackToList}>取消</Button>
            <Button type="primary" onClick={handleSave}>
              保存
            </Button>
          </Space>
        )
      }
      className="ai-config-modal"
    >
      <div className="ai-config">
        {viewMode === 'list' ? renderList() : renderForm()}
      </div>
    </Modal>
  );
};
