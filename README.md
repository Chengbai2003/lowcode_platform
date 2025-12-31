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

- **JSON Schema 驱动**: 通过 JSON Schema 定义页面结构
- **运行时渲染**: 实时将 JSON Schema 渲染为 React 组件
- **组件化架构**: 每个组件独立文件，便于扩展和自定义
- **容错处理**: 未知组件自动降级为 div
- **实时预览**: 左侧编辑 JSON，右侧实时预览

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

| 包名 | 说明 |
|------|------|
| `@lowcode-platform/renderer` | 运行时渲染器，将 JSON Schema 转换为 React 组件 |
| `@lowcode-platform/components` | 组件库，包含 Ant Design 组件封装和自定义组件 |
| `@lowcode-platform/editor` | 编辑器组件，Monaco Editor + 实时预览 |

## JSON Schema 格式

```json
{
  "componentName": "Page",
  "props": {
    "style": { "padding": "20px" }
  },
  "children": [
    {
      "componentName": "Container",
      "props": { "width": "md" },
      "children": [
        {
          "componentName": "Button",
          "props": { "type": "primary" },
          "children": "点击我"
        }
      ]
    }
  ]
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

## 开发指南

### 添加自定义组件

1. 在 `packages/components/src/components/` 创建新组件文件
2. 在 `packages/components/src/index.tsx` 中导出
3. 重新构建：`pnpm build`

示例：
```tsx
// packages/components/src/components/MyComponent.tsx
import React from 'react';

export interface MyComponentProps {
  title?: string;
}

export const MyComponent: React.FC<MyComponentProps> = ({ title = '默认标题' }) => {
  return <div className="my-component">{title}</div>;
};

export default MyComponent;
```

## License

MIT
