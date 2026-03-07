import React, { useState, useEffect } from "react";
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
  Card,
} from "antd";
import {
  SettingOutlined,
  ApiOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";
import { aiApi } from "../api/ai-api";
import { serverAIService } from "../api/ServerAIService";
import type { AIModelConfig } from "../types/ai-types";
import styles from "./AIConfig.module.css";

const { Option } = Select;
const { Title, Text } = Typography;

interface AIConfigProps {
  visible: boolean;
  onClose: () => void;
  onConfigChange?: (modelId: string) => void;
}

type ViewMode = "list" | "edit" | "add";

export const AIConfig: React.FC<AIConfigProps> = ({
  visible,
  onClose,
  onConfigChange,
}) => {
  const [form] = Form.useForm();
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadModels();
    }

    setViewMode("list");
    setEditingModel(null);
  }, [visible]);

  const loadModels = async () => {
    const allModels = await aiApi.getModels();
    setModels(allModels);
  };

  const handleAddModel = () => {
    setViewMode("add");
    setEditingModel(null);
    form.resetFields();
    form.setFieldsValue({
      provider: "openai",
      baseURL: "",
    });
  };

  const handleEditModel = (model: AIModelConfig) => {
    setViewMode("edit");
    setEditingModel(model.id);
    form.setFieldsValue({
      name: model.name,
      provider: model.provider,
      model: model.model,
      apiKey: model.apiKey || "",
      baseURL: model.baseURL || "",
      maxTokens: model.maxTokens || 2000,
      temperature: model.temperature || 0.7,
    });
  };

  const handleBackToList = () => {
    setViewMode("list");
    setEditingModel(null);
    form.resetFields();
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      if (viewMode === "add") {
        // 新增模型
        const id = `${values.provider}-${Date.now()}`;
        await aiApi.saveModel({
          id,
          name: values.name,
          provider: values.provider,
          model: values.model,
          apiKey: values.apiKey,
          baseURL: values.baseURL,
          maxTokens: values.maxTokens,
          temperature: values.temperature,
          isAvailable: true,
        });
        message.success("模型添加成功！");
      } else if (viewMode === "edit" && editingModel) {
        // 更新模型
        // Update needs full object or we fetch existing first.
        // Ideally saveModel handles upsert.
        // We need to pass the ID.
        await aiApi.saveModel({
          id: editingModel,
          name: values.name,
          provider: values.provider,
          model: values.model,
          apiKey: values.apiKey,
          baseURL: values.baseURL,
          maxTokens: values.maxTokens,
          temperature: values.temperature,
          isAvailable: true,
        } as any);
        message.success("模型更新成功！");
      }

      // 重新加载模型列表
      loadModels();
      setViewMode("list");
      setEditingModel(null);
    } catch (error: any) {
      message.error(`保存失败: ${error.message || "未知错误"}`);
    }
  };

  const handleDelete = async (modelId: string) => {
    if (await aiApi.deleteModel(modelId)) {
      message.success("模型已删除");
      loadModels();
    } else {
      message.warning("无法删除该模型");
    }
  };

  const handleSetDefault = async (modelId: string) => {
    // Currently API doesn't support setting default per user in a simple way
    // without updating the whole model config.
    // For simplicity, we just trigger the callback to let UI know.
    // Ideally we update the model isDefault flag on server.
    const model = models.find((m) => m.id === modelId);
    if (model) {
      await aiApi.saveModel({ ...model, isDefault: true });
      // We should also unset others, but server side 'saveModel' logic
      // in 'ModelConfigService.ts' I wrote earlier handles unsetting others!
    }
    loadModels();
    message.success("已设为默认模型");
    onConfigChange?.(modelId);
  };

  const handleTest = async (model: AIModelConfig) => {
    setTesting(model.id);

    try {
      // 临时更新配置进行测试 (注意：现在 server 端模式下，test 可能需要保存后才能测试，或者专门的 test 接口)
      // 由于我们现在是 ServerAIService，它依赖于 saved config or passing config in request
      // 简单起见，我们只能测试已保存的模型，或者我们构造一个临时的测试请求

      // 如果是在编辑模式，我们可能还没保存，这时候测试会用旧配置。
      // 为了支持编辑时测试，我们需要 Server 端支持 "validate config" 接口，或者我们前端构造一个临时 ServerAIService (但这稍微复杂)
      //
      // 策略：提示用户先保存再测试，或者只在 List 模式下允许测试。
      // 目前 UI 上 Edit 模式也有 Test 按钮吗？看代码 card actions 里有，但 form 里好像没有 Test 按钮。
      //
      // 修正：handleTest 是在 Card 上触发的，那时候不在编辑模式，所以可以直接用 model.id

      /*
      const currentValues = form.getFieldsValue();
      if (viewMode !== 'list') {
         // ...
      }
      */

      const service = serverAIService;

      // 测试简单的请求
      await service.generateResponse({
        prompt: "你好",
        modelId: model.id,
        options: { maxTokens: 50 },
      });

      message.success(`${model.name} 连接测试成功！`);
    } catch (error: any) {
      message.error(`连接测试失败：${error.message || "未知错误"}`);
    } finally {
      setTesting(null);
    }
  };

  const getProviderLabel = (provider: string) => {
    const labels: Record<string, string> = {
      openai: "OpenAI Compatible (GLM/GPT)",
      anthropic: "Anthropic",
      ollama: "Ollama (Local)",
      mock: "Mock AI",
    };
    return labels[provider] || provider;
  };

  const getProviderDefaultBaseURL = (provider: string) => {
    const defaults: Record<string, string> = {
      openai: "", // Default to empty for custom compatible models
      anthropic: "https://api.anthropic.com",
      ollama: "http://localhost:11434",
    };
    return defaults[provider] || "";
  };

  const handleProviderChange = (provider: string) => {
    form.setFieldValue("baseURL", getProviderDefaultBaseURL(provider));
  };

  const renderList = () => (
    <div className={styles.modelListContainer}>
      <div className={styles.modelListHeader}>
        <Title level={4}>AI 模型管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddModel}>
          添加模型
        </Button>
      </div>

      <List
        dataSource={models}
        renderItem={(model) => (
          <List.Item key={model.id}>
            <Card
              size="small"
              className={styles.modelCard}
              actions={[
                <Button
                  icon={<EditOutlined />}
                  type="text"
                  size="small"
                  onClick={() => handleEditModel(model)}
                >
                  编辑
                </Button>,
                model.provider !== "mock" && (
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
                model.provider !== "mock" && (
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
                ),
              ].filter(Boolean)}
            >
              <Card.Meta
                avatar={
                  <DatabaseOutlined
                    style={{
                      fontSize: "24px",
                      color: model.isAvailable ? "#52c41a" : "#858585",
                    }}
                  />
                }
                title={
                  <Space>
                    <span>{model.name}</span>
                    {model.isDefault && (
                      <span style={{ color: "#1890ff", fontSize: "12px" }}>
                        默认
                      </span>
                    )}
                    {model.isAvailable && (
                      <span style={{ color: "#52c41a", fontSize: "12px" }}>
                        ✓ 可用
                      </span>
                    )}
                  </Space>
                }
                description={
                  <Space
                    direction="vertical"
                    size="small"
                    style={{ width: "100%" }}
                  >
                    <Text type="secondary" style={{ fontSize: "12px" }}>
                      提供商: {getProviderLabel(model.provider)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: "12px" }}>
                      模型: {model.model}
                    </Text>
                    {model.baseURL && (
                      <Text type="secondary" style={{ fontSize: "12px" }}>
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
    const isEdit = viewMode === "edit";

    return (
      <div className={styles.modelFormContainer}>
        <div className={styles.modelFormHeader}>
          <Button onClick={handleBackToList}>← 返回</Button>
          <Title level={4}>{isEdit ? "编辑模型" : "添加模型"}</Title>
        </div>

        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="模型名称"
            rules={[{ required: true, message: "请输入模型名称" }]}
          >
            <Input placeholder="例如: My Custom Model" />
          </Form.Item>

          <Form.Item
            name="provider"
            label="提供商"
            rules={[{ required: true, message: "请选择提供商" }]}
          >
            <Select
              placeholder="Select Provider"
              onChange={handleProviderChange}
            >
              <Option value="openai">
                OpenAI Compatible (GLM, DeepSeek, etc.)
              </Option>
              <Option value="anthropic">Anthropic</Option>
              <Option value="ollama">Ollama</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="model"
            label="Model ID"
            rules={[{ required: true, message: "Please input Model ID" }]}
            extra={
              <Text type="secondary" style={{ fontSize: "12px" }}>
                Example: glm-4, gpt-4o, llama3
              </Text>
            }
          >
            <Input placeholder="e.g. glm-4" />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.provider !== curr.provider}
          >
            {({ getFieldValue }) => {
              const provider = getFieldValue("provider");
              if (provider === "ollama") {
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
              if (provider === "openai") {
                return (
                  <Alert
                    message="OpenAI Compatible Configuration"
                    description="Enter your API Key and Base URL (if using a proxy or custom provider like GLM)."
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                );
              }
              if (provider === "anthropic") {
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
              const provider = getFieldValue("provider");
              if (provider === "ollama") {
                return null; // Ollama 不需要 API Key
              }
              return (
                <Form.Item
                  name="apiKey"
                  label="API Key"
                  rules={[
                    {
                      required: provider !== "ollama",
                      message: "请输入 API Key",
                    },
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
            <Input placeholder="e.g. https://open.bigmodel.cn/api/paas/v4/" />
          </Form.Item>

          <Divider />

          <Title level={5}>高级选项</Title>

          <Form.Item name="maxTokens" label="最大 Token 数" initialValue={2000}>
            <InputNumber min={100} max={128000} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            name="temperature"
            label="Temperature (温度)"
            initialValue={0.7}
            extra="值越高越有创意，值越低越确定性"
          >
            <InputNumber min={0} max={2} step={0.1} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </div>
    );
  };

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SettingOutlined />
          <span>AI 模型配置</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={700}
      footer={
        viewMode === "list" ? (
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
      className={styles.aiConfigModal}
    >
      <div className={styles.aiConfig}>
        {viewMode === "list" ? renderList() : renderForm()}
      </div>
    </Modal>
  );
};
