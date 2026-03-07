# @lowcode-platform/server

低代码平台后端服务，提供 AI 集成能力，支持多种 AI Provider。

## 特性

- **NestJS 框架** - 企业级 Node.js 框架
- **多 AI Provider 支持** - OpenAI、Anthropic、Ollama、LM Studio 等
- **流式响应** - Server-Sent Events (SSE) 实现打字机效果
- **模块化架构** - 易于扩展和维护
- **类型安全** - TypeScript 全支持

## 支持的 AI Provider

| Provider | 类型 | 说明 |
|---------|------|------|
| OpenAI | 云端 | OpenAI 官方 API |
| Anthropic | 云端 | Claude API |
| Ollama | 本地 | 本地运行开源模型 |
| LM Studio | 本地 | 本地模型服务端 |
| 自定义 | 兼容 | 任意 OpenAI 兼容服务 |

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填写你的 API 密钥
```

### 启动开发服务器

```bash
pnpm dev
```

服务将在 http://localhost:3000 启动。

## API 文档

### 聊天接口

**普通聊天**

```http
POST /api/v1/ai/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "provider": "openai"
}
```

**流式聊天 (SSE)**

```http
POST /api/v1/ai/chat/stream
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "provider": "openai"
}
```

### 代码生成接口

```http
POST /api/v1/ai/generate-schema
Content-Type: application/json

{
  "description": "创建一个用户登录表单",
  "provider": "openai"
}
```

### Provider 管理接口

```http
# 获取所有可用 Provider
GET /api/v1/ai/providers

# 获取所有 Provider 状态
GET /api/v1/ai/providers/status
```

## 环境变量配置

### 基础配置

```env
NODE_ENV=development
PORT=3000
AI_DEFAULT_PROVIDER=openai
```

### OpenAI 配置

```env
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

### 本地模型配置 (Ollama)

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

### 自定义 Provider 配置

```env
CUSTOM_PROVIDER_1_NAME=siliconflow
CUSTOM_PROVIDER_1_API_KEY=...
CUSTOM_PROVIDER_1_BASE_URL=https://api.siliconflow.cn/v1
CUSTOM_PROVIDER_1_MODEL=deepseek-ai/DeepSeek-V2.5
```

## License

MIT
