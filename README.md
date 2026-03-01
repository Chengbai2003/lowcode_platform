# 低代码平台

基于 JSON Schema 驱动的低代码平台，使用 React + TypeScript + Ant Design 构建。

## 项目架构

```
lowcode-platform/
├── packages/
│   ├── renderer/      # 运行时渲染器 (JSON Schema → React 组件)
│   ├── components/    # 组件库 (基于 Ant Design)
│   └── editor/        # 配置编辑器 (Monaco Editor + 实时预览)
├── examples/
│   └── playground/    # 示例应用
└── package.json
```

## 核心特性

- **JSON Schema 驱动**: 通过 **扁平化 (Flat)** 的 JSON Schema 定义页面结构，O(1) 查找效率高
- **AST 代码生成**: `compiler` 基于 Babel AST (抽象语法树) 构建安全的 React 代码，从根源消除 XSS 注入风险
- **样式引擎**: 内置 Tailwind 样式编译器，可将内联样式动态编译为 Tailwind CSS 原子类名组合
- **运行时渲染**: `renderer` 内置强大的 DSL 执行引擎，支持多达 20+ 种复杂的流控制和异步逻辑
- **组件化架构**: 深度集成 Ant Design 5，每个组件独立文件，便于扩展和自定义
- **实时预览**: 编辑器支持配置联动，左侧编辑 JSON，右侧实时预览

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建所有包
pnpm build

# 仅构建组件包
pnpm build:packages

# 清理构建产物
pnpm clean
```

## 包说明

| 包名                           | 说明                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `@lowcode-platform/renderer`   | 运行时渲染引擎，内置完整的 DSL 解析器和安全沙箱                |
| `@lowcode-platform/components` | 组件库，包含 Ant Design 5 组件封装和自定义组件                 |
| `@lowcode-platform/compiler`   | 代码生成器，将扁平 Schema 编译为安全的 React 源代码 (AST 驱动) |
| `@lowcode-platform/editor`     | 平台前端，包含 Monaco Editor、实时预览与 AI 助手调用           |
| `@lowcode-platform/server`     | 平台后端，基于 NestJS 构建的统一大模型接入网关                 |

## JSON Schema 格式 (A2UI Flat Schema)

项目采用了**扁平化组件树 (Flat Schema)**，摒弃了传统的深度嵌套结构，以便于跨组件引用的状态管理和 O(1) 的检索修改效率：

```json
{
  "rootId": "page_root",
  "components": {
    "page_root": {
      "id": "page_root",
      "type": "Page",
      "props": { "style": { "padding": "20px" } },
      "childrenIds": ["container_1"]
    },
    "container_1": {
      "id": "container_1",
      "type": "Container",
      "props": { "width": "md" },
      "childrenIds": ["btn_1"]
    },
    "btn_1": {
      "id": "btn_1",
      "type": "Button",
      "props": { "type": "primary", "children": "点击我" }
    }
  }
}
```

## 可用组件

### 布局组件

- `Container` - 容器组件，带默认样式
- `Div` - 通用 div
- `Space` - 间距组件
- `Divider` - 分割线

### 表单组件

- `Form` - 表单
- `FormItem` - 表单项（带 label）
- `Input` - 输入框
- `TextArea` - 文本域
- `Checkbox` - 复选框
- `Radio` - 单选框
- `Select` - 选择器
- `Switch` - 开关
- `Slider` - 滑块

### 数据展示

- `Table` - 表格
- `Card` - 卡片
- `List` - 列表
- `Tabs` - 标签页
- `Collapse` - 折叠面板
- `Typography` - 排版
- `Title` - 标题

### 反馈组件

- `Modal` - 模态框
- `Alert` - 警告提示
- `Progress` - 进度条

更多组件请参考 [`@lowcode-platform/components`](./packages/components/README.md)

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Ant Design** - UI 组件库
- **Vite** - 构建工具
- **Monaco Editor** - 代码编辑器

## 🔐 认证配置

本项目使用简单的 **Bearer Token** 认证机制，用于前端与后端之间的身份验证。

### 快速开始

**默认配置**（开箱即用）：
```
后端 API_SECRET: dev-secret-token-change-in-production
前端 VITE_API_SECRET: dev-secret-token-change-in-production
```

无需任何配置即可开始使用。

---

### 配置说明

#### 后端配置

在 `packages/server/.env` 文件中设置：

```bash
API_SECRET=your-secret-here
```

#### 前端配置

**方式一：环境变量**

在 `packages/editor/.env.local` 文件中设置：

```bash
VITE_API_SECRET=your-secret-here
```

**方式二：宿主应用注入**

```typescript
import { setApiSecret } from '@lowcode-platform/editor';

setApiSecret('your-secret-here');
```

---

### 安全建议

| 部署环境 | 默认 Token 安全性 | 建议 |
|---------|------------------|------|
| 本地开发 | ✅ 安全 | 使用默认值 |
| 内网部署 | ✅ 安全 | 使用默认值（网络隔离） |
| 公网部署 | ❌ 不安全 | **必须修改**为强随机字符串 |

**生成强随机 Token**：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 高级认证

本项目提供简单的基础认证，适合自部署场景。

如需以下功能，请 Fork 项目后自行实现：
- 🚀 JWT / Session 认证
- 🚀 用户登录系统
- 🚀 OAuth / SSO 集成
- 🚀 多租户隔离
- 🚀 动态 Token 管理

---

### API 调用示例

使用 `fetchApp` 调用 API，自动携带 Token：

```typescript
import { fetchApp } from './lib/httpClient';

const data = await fetchApp.get('/api/v1/ai/models');
await fetchApp.post('/api/v1/ai/models', config);
await fetchApp.delete('/api/v1/ai/models/delete', { id });
```

请求自动添加 `Authorization: Bearer <token>` header。

## 开发指南

### 添加自定义组件

1. 在 `packages/components/src/components/` 创建新组件文件
2. 在 `packages/components/src/index.tsx` 中导出
3. 重新构建：`pnpm build`

示例：

```tsx
// packages/components/src/components/MyComponent.tsx
import React from "react";

export interface MyComponentProps {
  title?: string;
}

export const MyComponent: React.FC<MyComponentProps> = ({
  title = "默认标题",
}) => {
  return <div className="my-component">{title}</div>;
};

export default MyComponent;
```
