# A2UI 低代码平台 — 项目文档

> **最后更新时间**：2026-03-19
> **当前版本**：v0.2.5-alpha
> **架构状态**：2 包 Monorepo（frontend + backend）
> **完成度**：Sprint 3 Phase 1 进行中

---

## 一、项目概览

这是一个基于 **Google A2UI（Agent to User Interface）协议** 的 **AI 驱动低代码平台**，采用精简的 2 包 Monorepo 架构。

| 包名                         | 定位                                        | 核心技术                            |
| ---------------------------- | ------------------------------------------- | ----------------------------------- |
| `@lowcode-platform/frontend` | 前端整合包（类型 + 渲染器 + 组件 + 编辑器） | React 18 + Zustand + Ant Design 5   |
| `@lowcode-platform/backend`  | 后端服务包（AI 服务 + 编译器）              | NestJS + Babel AST + 多 AI Provider |

**技术栈**：React 18 · TypeScript · Ant Design 5 · Vite · Zustand · NestJS · Anthropic/OpenAI/Ollama

**核心价值链**：

```
用户描述需求 → AI 对话 → 生成 A2UI Schema
                         ↓              ↓
                    Renderer        Compiler
                         ↓              ↓
                   实时预览 UI    导出 React 代码
```

**差异化优势**：

- **遵循 Google A2UI 协议**：采用扁平 ID→Component 映射（非嵌套树）
- **AI 对话优先**：自然语言交互代替传统拖拽
- **双输出通道**：同一份 Schema 既可实时渲染预览，又可编译为标准 React 代码
- **企业级安全**：表达式沙箱 + URL 白名单 + 后端 API 鉴权

---

## 二、核心架构深度解析

### 2.1 扁平化 Schema 设计（A2UI 协议）

**传统嵌套树 vs 扁平 Map**：

```typescript
// ❌ 传统嵌套树（AI 生成容易出错）
{
  type: 'Container',
  children: [
    { type: 'Button', children: [...] },  // 嵌套层级深
  ]
}

// ✅ A2UI 扁平 Map（AI 友好）
{
  rootId: 'root',
  components: {
    'root': { type: 'Container', childrenIds: ['btn1'] },
    'btn1': { type: 'Button', parentId: 'root' }
  }
}
```

**优势**：

- **O(1) 查找效率**：直接 `components[id]` 访问
- **增量更新友好**：修改单个组件只需更新一个 entry
- **AI 生成准确率高**：无需处理复杂嵌套结构

### 2.2 DSL 执行引擎（10 种 Action）

```
┌─────────────────────────────────────────────────────┐
│                  DSLExecutor                         │
│  ┌─────────────────────────────────────────────┐    │
│  │  Action Registry (Handler 映射表)            │    │
│  │  setValue → dataActions.setValue            │    │
│  │  apiCall  → asyncActions.apiCall            │    │
│  │  if/loop  → flowActions.if/loop             │    │
│  └─────────────────────────────────────────────┘    │
│                       ↓                              │
│  ┌─────────────────────────────────────────────┐    │
│  │  ExecutionContext (运行时上下文)             │    │
│  │  - data/state/formData                      │    │
│  │  - dispatch/getState (Redux)                │    │
│  │  - ui/api/navigate (服务注入)                │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

**嵌套 Action 支持**：

```typescript
// if/loop 支持 Action[] 嵌套
{
  type: 'if',
  condition: '{{formData.valid}}',
  then: [
    { type: 'apiCall', url: '/api/submit' },
    { type: 'feedback', level: 'success' }
  ],
  else: [
    { type: 'feedback', level: 'error' }
  ]
}
```

### 2.3 安全表达式引擎

**设计决策**：拒绝 `eval` / `new Function`，使用 **jsep AST 解析 + 白名单求值**。

```
{{input1.value + input2.value}}
         ↓
    jsep 解析 AST
         ↓
    ┌─────────────────────────────────┐
    │  evaluateNode(ast, context)      │
    │                                  │
    │  1. Identifier → 查 context/白名单│
    │  2. MemberExpression → 安全访问  │
    │  3. CallExpression → 检查白名单  │
    │  4. 拦截 __proto__/constructor  │
    └─────────────────────────────────┘
         ↓
    返回求值结果
```

**安全措施**：

- **原型链保护**：拦截 `__proto__`、`prototype`、`constructor`
- **白名单全局对象**：仅 Math、JSON、Date、parseInt 等
- **多语句拒绝**：Compound 节点只执行第一个表达式
- **AST 缓存**：LRU 缓存避免重复解析

### 2.4 响应式运行时（ReactiveRuntime）

**核心设计**：类似 Vue 3 的依赖追踪，使用 Proxy + 微任务批量更新。

```
┌─────────────────────────────────────────────────────┐
│               ReactiveRuntime                        │
│                                                      │
│  data/state/formData/components (内部状态)           │
│         ↓                                            │
│  ┌─────────────────┐    ┌─────────────────┐        │
│  │ TrackingScope   │←───│ SnapshotManager │        │
│  │ (依赖追踪)       │    │ (不可变快照)     │        │
│  └─────────────────┘    └─────────────────┘        │
│         ↓                      ↓                     │
│  createTrackingProxy()   getSnapshot()              │
│  (只读代理，收集依赖)      (React 安全读取)           │
│                                                      │
│  subscribe() → 兼容 useSyncExternalStore            │
└─────────────────────────────────────────────────────┘
```

**批量更新流程**：

```typescript
runtime.set('input1', 'value1'); // 立即写入
runtime.set('input2', 'value2'); // 立即写入
// 微任务调度 → 批量通知 → React 重渲染
```

### 2.5 编译器（Schema → React 代码）

**AST 驱动编译流程**：

```
A2UI Schema
     ↓
┌─────────────────────────────────────────────┐
│ generator.ts (入口)                          │
│   1. 全局收集 Field → useState 声明          │
│   2. 收集组件 import                         │
└─────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────┐
│ jsxBuilder.ts                               │
│   - 递归构建 JSX Element AST                 │
│   - Field 双向绑定 → value/onChange          │
│   - 事件 → ArrowFunction AST                 │
└─────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────┐
│ @babel/generator                            │
│   - AST → 代码字符串                         │
│   - jsescOption.minimal: 中文保护            │
└─────────────────────────────────────────────┘
     ↓
Prettier 格式化 → 输出 React 组件
```

**关键特性**：

- **全局 Field 收集**：一次遍历提取所有 useState，避免条件性 Hook
- **循环引用检测**：visited Set 标记，生成注释而非报错
- **样式双轨输出**：可映射的转 Tailwind，复杂值保留内联 style

---

## 三、前端核心模块详解

### 3.1 渲染器（Renderer）

| 文件                    | 职责         | 关键技术                           |
| ----------------------- | ------------ | ---------------------------------- |
| `Renderer.tsx`          | 主渲染器入口 | useMemo 稳定引用                   |
| `EventDispatcher.ts`    | 事件分发中心 | 持有 DSLExecutor + ReactiveRuntime |
| `ComponentRenderer.tsx` | 组件渲染器   | useSyncExternalStore 响应式更新    |

**渲染流程**：

```
Schema 变化
     ↓
flattenSchemaValues() → 扁平化初始数据
     ↓
EventDispatcher 初始化 → ReactiveRuntime 初始化
     ↓
ComponentRenderer 递归渲染
     ↓
createTrackingProxy() → 收集依赖
     ↓
数据变化 → runtime.set() → flush → React 重渲染
```

### 3.2 状态管理架构

**混合架构**：Zustand（编辑器）+ Redux（运行时兼容层）

```
┌─────────────────────────────────────────────────┐
│                 Zustand Stores                   │
│  ┌───────────────┐  ┌───────────────┐          │
│  │ editor-store  │  │ history.ts    │          │
│  │ - selectedId  │  │ - undoStack   │          │
│  │ - sessions    │  │ - redoStack   │          │
│  └───────────────┘  └───────────────┘          │
└─────────────────────────────────────────────────┘
                       ↓ 兼容层
┌─────────────────────────────────────────────────┐
│                 Redux Store                      │
│  componentSlice (运行时组件数据)                  │
│  - 兼容旧代码路径                                 │
│  - 逐步迁移到 ReactiveRuntime                    │
└─────────────────────────────────────────────────┘
```

**Undo/Redo 实现**：Command Pattern

```typescript
interface Command {
  execute(): void; // 执行
  undo(): void; // 撤销
  redo(): void; // 重做
  description: string;
}

// 示例：更新属性命令
class UpdatePropsCommand implements Command {
  execute() {
    /* 应用新属性 */
  }
  undo() {
    /* 恢复旧属性 */
  }
  redo() {
    /* 重新应用新属性 */
  }
}
```

### 3.3 属性面板（PropertyPanel）

**动态表单生成**：根据组件元数据 `.meta.ts` 动态渲染编辑器。

```typescript
// Button.meta.ts
export const ButtonMeta: ComponentMeta = {
  type: 'Button',
  properties: [
    { name: 'type', type: 'select', options: ['default', 'primary'] },
    { name: 'children', type: 'text', defaultValue: '按钮' },
    { name: 'disabled', type: 'boolean', defaultValue: false },
  ],
  events: ['onClick'],
};
```

**编辑器类型映射**：

| 类型      | 编辑器组件     | 适用场景 |
| --------- | -------------- | -------- |
| `string`  | Input.TextArea | 文本内容 |
| `number`  | InputNumber    | 数值配置 |
| `boolean` | Switch         | 开关选项 |
| `select`  | Select         | 枚举选择 |
| `color`   | ColorPicker    | 颜色配置 |
| `json`    | Monaco Editor  | 复杂对象 |

---

## 四、后端核心模块详解

### 4.1 AI 服务架构

```
┌─────────────────────────────────────────────────┐
│                 AI Module                        │
│                                                  │
│  ┌───────────────┐  ┌───────────────────────┐  │
│  │ ai.controller │  │ prompt-builder.ts      │  │
│  │ POST /chat    │  │ - 注入 Action 类型说明 │  │
│  │               │  │ - 注入组件列表         │  │
│  └───────────────┘  └───────────────────────┘  │
│         ↓                                        │
│  ┌───────────────────────────────────────────┐  │
│  │ ai-provider.factory.ts                     │  │
│  │ - OpenAI / Anthropic / Ollama              │  │
│  │ - Vercel AI SDK 6 统一接口                 │  │
│  └───────────────────────────────────────────┘  │
│         ↓                                        │
│  流式 SSE 响应 → 前端 AI Assistant              │
└─────────────────────────────────────────────────┘
```

**多 Provider 支持**：

```typescript
// 环境变量配置
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-xxx
OLLAMA_BASE_URL=http://localhost:11434
```

### 4.2 编译器模块

**API 端点**：

```
POST /api/v1/compiler/export
Request:  { schema: A2UISchema, options?: CompileOptions }
Response: { code: string }
```

**安全措施**：

| 措施               | 实现                      | 说明                  |
| ------------------ | ------------------------- | --------------------- |
| 表达式路径白名单   | `isValidExpressionPath()` | 只允许合法标识符      |
| URL 开放重定向防护 | `sanitizeUrl()`           | 拒绝 javascript: 协议 |
| AST 代码生成       | Babel types               | 从根源消除 XSS        |

---

## 五、组件库（49 个组件元数据）

### 5.1 分类统计

| 分类     | 组件数量 | 代表组件                    |
| -------- | -------- | --------------------------- |
| 表单     | 10       | Button, Input, Select, Form |
| 布局     | 4        | Container, Space, Divider   |
| 数据展示 | 4        | Table, Card, Tabs           |
| 反馈     | 3        | Modal, Alert, Typography    |

### 5.2 元数据系统

每个组件可配置 `.meta.ts` 文件：

```typescript
export const InputMeta: ComponentMeta = {
  type: 'Input',
  displayName: '输入框',
  category: 'form',
  icon: 'Input',
  properties: [
    { name: 'placeholder', type: 'string', defaultValue: '请输入' },
    { name: 'disabled', type: 'boolean', defaultValue: false },
    { name: 'field', type: 'string', description: '双向绑定字段名' },
  ],
  events: ['onChange', 'onFocus', 'onBlur'],
};
```

---

## 六、安全特性

### 6.1 表达式沙箱

| 措施           | 实现                            |
| -------------- | ------------------------------- |
| AST 解析       | jsep 替代 eval                  |
| 白名单全局对象 | Math, JSON, Date 等             |
| 原型链保护     | 拦截 `__proto__`, `constructor` |
| 多语句拒绝     | Compound 节点只执行首表达式     |

### 6.2 后端防护

| 措施              | 状态 | 说明                       |
| ----------------- | ---- | -------------------------- |
| Bearer Token 认证 | ✅   | 所有 AI 接口启用 AuthGuard |
| API Key 过滤      | ✅   | sanitizeModel() 移除密钥   |
| 限流保护          | ✅   | 10次/秒，100次/分钟        |
| CORS 控制         | ✅   | 环境变量驱动               |

---

## 七、测试覆盖

| 包       | 框架   | 覆盖范围                           |
| -------- | ------ | ---------------------------------- |
| frontend | Vitest | DSL 引擎、表达式解析、响应式运行时 |
| backend  | Jest   | AI 服务、编译器、Controller        |

**关键测试文件**：

- `renderer/__tests__/` — DSL 引擎测试
- `renderer/executor/__tests__/` — 表达式沙箱测试
- `renderer/reactive/__tests__/` — 响应式运行时测试

---

## 八、常用命令

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev                    # 前端 5173 + 后端 3000
pnpm --filter @lowcode-platform/frontend dev
pnpm --filter @lowcode-platform/backend dev

# 构建
pnpm build

# 测试
pnpm test

# 代码质量
pnpm lint
pnpm format
```

---

## 九、架构决策记录

| 决策        | 选择                 | 理由                         |
| ----------- | -------------------- | ---------------------------- |
| Schema 结构 | 扁平 Map             | AI 生成准确，增量更新简单    |
| 状态管理    | Zustand + Redux 混用 | 历史原因，逐步统一到 Zustand |
| 持久化      | IndexedDB            | 浏览器原生，无需后端         |
| 表达式引擎  | jsep + 自定义求值    | 安全可控，避免 eval 风险     |
| 编译器位置  | 后端 NestJS          | 可扩展为云端编译             |
| AI SDK      | Vercel AI SDK 6      | 多 Provider 统一接口         |

---

## 十、综合评分

| 维度       |  评分   | 说明                                       |
| ---------- | :-----: | ------------------------------------------ |
| 架构设计   |  **9**  | 2 包精简架构，依赖清晰                     |
| 功能完整度 | **8.5** | DSL 引擎强大，核心功能完备                 |
| 代码质量   |  **7**  | 注释详尽，但 any 过度使用                  |
| 安全性     |  **9**  | 表达式沙箱 + 编译器安全 + 后端鉴权         |
| 测试覆盖   | **8.5** | 单元测试覆盖，E2E 待加强                   |
| 工程化     |  **7**  | ESLint + Prettier + Husky，CI/CD 待建设    |
| **综合**   | **8.5** | **安全基线达标 + 架构精简 + 核心功能完备** |

---

**文档更新时间**：2026-03-19 · **Sprint 3 Phase 1 进行中**
