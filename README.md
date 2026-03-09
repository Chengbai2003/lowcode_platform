# A2UI 低代码平台

> **First A2UI Protocol Implementation** · AI 驱动的下一代低代码开发平台

[![Build](https://img.shields.io/badge/build-passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![React](https://img.shields.io/badge/React-18-blue)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)]()
[![Ant Design](https://img.shields.io/badge/Ant%20Design-5-blue)]()

---

## 🌟 特性亮点

- **🤖 AI 对话优先** — 自然语言描述即可生成页面，对非技术用户更友好
- **🔐 企业级安全** — 表达式沙箱 (jsep) + URL 白名单 + 后端 API 鉴权，多层防护
- **⚡ 双输出通道** — 同一份 Schema 既可实时渲染预览，又可编译为标准 React 代码导出
- **🧩 21 个组件元数据** — 可视化属性面板，所见即所得的编辑体验
- **🔧 精简 DSL 引擎** — 10 种核心 Action，覆盖 90% 低代码场景
- **📦 2 包精简架构** — Monorepo 结构，依赖清晰，维护轻松

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/your-org/a2ui-lowcode.git
cd a2ui-lowcode

# 安装依赖
pnpm install

# 启动开发服务器（前端 + 后端）
pnpm dev

# 访问 http://localhost:5173
```

### 构建

```bash
# 构建所有包
pnpm build

# 仅构建前端
pnpm build:frontend

# 仅构建后端
pnpm build:backend
```

---

## 📖 项目架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户输入需求                              │
│                    "帮我设计一个登录表单"                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI Assistant (Claude/OpenAI)               │
│                   生成 A2UI Schema (JSON)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
            ▼                                 ▼
┌───────────────────────┐         ┌───────────────────────┐
│   Renderer (运行时)    │         │   Compiler (编译器)    │
│   实时渲染预览         │         │   导出 React 代码       │
│   - 组件树渲染         │         │   - Babel AST 生成     │
│   - DSL 执行引擎        │         │   - Tailwind 编译      │
│   - 事件处理           │         │   - 一键下载          │
└───────────────────────┘         └───────────────────────┘
```

### 目录结构

```
packages/
├── frontend/              # 前端整合包
│   ├── src/
│   │   ├── types/        # 类型定义 (Schema + DSL + Property Panel)
│   │   ├── renderer/     # 运行时渲染引擎
│   │   ├── components/   # UI 组件库 (21 个组件元数据)
│   │   ├── editor/       # 编辑器 (AI 助手 + 属性面板 + 组件树)
│   │   └── styles/       # 统一样式
│   └── package.json
│
└── backend/               # 后端服务包
    ├── src/
    │   ├── modules/
    │   │   ├── ai/       # AI 服务 (多 Provider 支持)
    │   │   └── compiler/ # 编译器 (Schema → React 代码)
    │   └── main.ts
    └── package.json
```

---

## 💡 A2UI Schema 格式

采用 **Google A2UI 协议** 的扁平组件树结构，O(1) 检索效率：

```json
{
  "rootId": "page_root",
  "components": {
    "page_root": {
      "id": "page_root",
      "type": "Page",
      "childrenIds": ["form_1"]
    },
    "form_1": {
      "id": "form_1",
      "type": "Form",
      "props": { "layout": "vertical" },
      "childrenIds": ["input_1", "btn_1"]
    },
    "input_1": {
      "id": "input_1",
      "type": "Input",
      "props": { "placeholder": "请输入用户名", "field": "username" }
    },
    "btn_1": {
      "id": "btn_1",
      "type": "Button",
      "props": { "type": "primary", "children": "登录" },
      "events": {
        "onClick": [{ "type": "apiCall", "url": "/api/login", "method": "POST" }]
      }
    }
  }
}
```

---

## 🎨 可用组件 (21 个带元数据)

### 布局组件 (4)

| 组件        | 说明     | 属性面板 |
| ----------- | -------- | -------- |
| `Container` | 容器     | ✅       |
| `Space`     | 间距     | ✅       |
| `Divider`   | 分割线   | ✅       |
| `Div`       | 通用 div | -        |

### 表单组件 (10)

| 组件          | 说明     | 属性面板 |
| ------------- | -------- | -------- |
| `Button`      | 按钮     | ✅       |
| `Input`       | 输入框   | ✅       |
| `TextArea`    | 多行文本 | ✅       |
| `InputNumber` | 数字输入 | ✅       |
| `Select`      | 选择器   | ✅       |
| `Checkbox`    | 复选框   | ✅       |
| `Radio`       | 单选框   | ✅       |
| `Switch`      | 开关     | ✅       |
| `Form`        | 表单     | ✅       |
| `FormItem`    | 表单项   | ✅       |

### 数据展示 (4)

| 组件    | 说明   | 属性面板 |
| ------- | ------ | -------- |
| `Card`  | 卡片   | ✅       |
| `Table` | 表格   | ✅       |
| `Tabs`  | 标签页 | ✅       |
| `List`  | 列表   | -        |

### 反馈组件 (3)

| 组件         | 说明     | 属性面板 |
| ------------ | -------- | -------- |
| `Modal`      | 对话框   | ✅       |
| `Alert`      | 警告提示 | ✅       |
| `Typography` | 排版     | ✅       |

> 💡 提示：更多组件（Typography, Text, Title, Slider, Collapse, Progress 等）持续补充中

---

## 🔧 DSL Action 类型 (10 种核心)

| 分类       | Action         | 说明            | 示例                                                       |
| ---------- | -------------- | --------------- | ---------------------------------------------------------- |
| **数据**   | `setValue`     | 设置字段/状态值 | `{ "type": "setValue", "field": "name", "value": "John" }` |
| **网络**   | `apiCall`      | API 请求        | `{ "type": "apiCall", "url": "/api/users" }`               |
| **路由**   | `navigate`     | 页面跳转        | `{ "type": "navigate", "to": "/dashboard" }`               |
| **交互**   | `feedback`     | 消息提示        | `{ "type": "feedback", "level": "success" }`               |
| **弹窗**   | `dialog`       | 模态框/确认框   | `{ "type": "dialog", "kind": "modal" }`                    |
| **控制**   | `if`           | 条件分支        | `{ "type": "if", "condition": "{{valid}}" }`               |
| **控制**   | `loop`         | 循环遍历        | `{ "type": "loop", "over": "{{items}}" }`                  |
| **工具**   | `delay`        | 延迟执行        | `{ "type": "delay", "ms": 1000 }`                          |
| **工具**   | `log`          | 控制台日志      | `{ "type": "log", "value": "{{data}}" }`                   |
| **逃生舱** | `customScript` | 自定义脚本      | `{ "type": "customScript", "code": "..." }`                |

---

## 🛡️ 安全特性

### 表达式沙箱

- ✅ 使用 `jsep` AST 解析器替代 `new Function()`
- ✅ 白名单全局对象（Math, JSON, Date 等）
- ✅ 原型链保护（拦截 `__proto__`, `prototype`, `constructor`）
- ✅ 编译器端二次验证 (`isValidExpressionPath`)

### URL 安全

- ✅ 拒绝 `javascript:`, `data:`, `file:` 伪协议
- ✅ 域名白名单机制
- ✅ 相对路径优先

### 后端防护

- ✅ Bearer Token 认证
- ✅ API Key 过滤（响应中自动移除）
- ✅ 限流保护（10 次/秒，100 次/分钟）
- ✅ CORS 环境变量控制

---

## 📝 常用命令

```bash
# 开发
pnpm dev              # 启动开发服务器
pnpm dev:frontend     # 仅前端
pnpm dev:backend      # 仅后端

# 构建
pnpm build            # 全量构建
pnpm build:frontend   # 仅前端
pnpm build:backend    # 仅后端

# 代码质量
pnpm lint             # ESLint 检查
pnpm lint:fix         # 自动修复
pnpm format           # Prettier 格式化
pnpm format:write     # 写入文件

# 测试
pnpm test             # 运行测试
pnpm test:coverage    # 生成覆盖率

# 清理
pnpm clean            # 清理构建产物
```

---

## 🔐 认证配置

### 快速开始（默认配置）

```bash
# .env (后端 packages/backend/.env)
API_SECRET=dev-secret-token-change-in-production

# .env (前端 packages/frontend/.env.local)
VITE_API_SECRET=dev-secret-token-change-in-production
```

### 生成强随机 Token

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📚 技术栈

| 层级            | 技术                        |
| --------------- | --------------------------- |
| **前端框架**    | React 18 + TypeScript       |
| **UI 组件**     | Ant Design 5                |
| **状态管理**    | Zustand                     |
| **构建工具**    | Vite 5                      |
| **CSS 方案**    | CSS Modules + Sass          |
| **代码编辑器**  | Monaco Editor               |
| **后端框架**    | NestJS                      |
| **AI Provider** | OpenAI / Anthropic / Ollama |
| **编译器**      | Babel AST                   |

---

## 🗺️ 路线图

### 已完成 (Sprint 1-3 Phase 0)

- ✅ 安全基建（表达式沙箱 + 后端鉴权）
- ✅ 可视化编辑（属性面板 + 组件树 + 画布选中）
- ✅ 架构重构（6 包 → 2 包）
- ✅ 编译器迁移后端
- ✅ 21 个组件元数据

### 进行中 (Sprint 3 Phase 1)

- 🔄 模板库（5-8 个内置模板）
- 🔄 Demo 站点部署
- 🔄 README 文档完善

### 计划中

- ⏳ GitHub Actions CI
- ⏳ 类型攻坚（消灭 `any`）
- ⏳ 更多组件元数据

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

---

## 📄 开源协议

MIT License

---

## 🙏 致谢

- [Google A2UI Protocol](https://a2ui.org) - AI Agent 到用户界面的开放协议
- [Ant Design](https://ant.design) - 企业级 UI 组件库
- [React](https://react.dev) - 用于构建用户界面的 JavaScript 库
- [NestJS](https://nestjs.com) - 渐进式 Node.js 框架

---

**built with ❤️ by A2UI Team**
