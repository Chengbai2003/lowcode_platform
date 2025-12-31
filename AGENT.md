# 低代码平台项目 - AI 助手指南

## 项目概述

这是一个基于 JSON Schema 驱动的低代码平台，使用 React + TypeScript + Ant Design 构建。

**核心架构：**
- **Monorepo 结构**：使用 pnpm workspace 管理多个包
- **JSON Schema 驱动**：通过 JSON Schema 定义页面结构
- **实时渲染**：左侧编辑 JSON，右侧实时预览
- **组件化架构**：每个组件独立文件，便于扩展

## 项目结构

```
lowcode_platform/
├── packages/
│   ├── renderer/      # 运行时渲染器：JSON Schema → React 组件
│   ├── components/    # 组件库：Ant Design 封装 + 自定义组件
│   └── editor/        # 编辑器：Monaco Editor + 实时预览
├── examples/
│   └── playground/    # 示例应用
├── package.json       # 根 package.json
├── pnpm-workspace.yaml # pnpm workspace 配置
└── tsconfig.base.json  # TypeScript 基础配置
```

## 核心包说明

### 1. @lowcode-platform/renderer (渲染器)

**功能：** 将 JSON Schema 转换为 React 组件树

**关键文件：**
- `src/Renderer.tsx` - 核心渲染逻辑
- `src/types.ts` - 类型定义
- `src/index.ts` - 导出入口

**核心概念：**
- `ComponentSchema`: 组件 Schema 类型定义
- `ComponentRegistry`: 组件注册表
- **容错机制**: 未知组件自动降级为 `div`

### 2. @lowcode-platform/components (组件库)

**功能：** 提供 UI 组件，每个组件独立文件

**目录结构：**
```
src/
├── components/       # 所有组件文件
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Form.tsx
│   ├── Container.tsx  # 容器组件，带默认样式
│   └── ...
└── index.tsx         # 统一导出和注册
```

**每个组件文件结构：**
```tsx
import React from 'react';
import { Component as AntComponent } from 'antd';

export interface ComponentProps extends React.ComponentProps<typeof AntComponent> {}

export const Component: React.FC<ComponentProps> = ({ defaultValue, ...props }) => {
  return <AntComponent defaultValue={defaultValue ?? xxx} {...props} />;
};

Component.displayName = 'Component';
export default Component;
```

### 3. @lowcode-platform/editor (编辑器)

**功能：** Monaco Editor + 实时预览

**关键文件：**
- `src/LowcodeEditor.tsx` - 编辑器主组件
- `src/types.ts` - 类型定义

**布局：** 左右分栏，左侧编辑 JSON，右侧实时渲染预览

## JSON Schema 格式

```json
{
  "componentName": "Page",    // 必需：组件名称
  "props": {},                // 可选：组件属性
  "id": "unique-id",          // 可选：唯一标识
  "children": []              // 可选：子组件
}
```

**children 可以是：**
- 单个 `ComponentSchema`
- `ComponentSchema[]`
- 字符串（文本内容）

## 可用组件

### 布局组件
- `Container` - 容器（width: xs/sm/md/lg/xl/full, padding, center）
- `Div` - 通用 div
- `Space` - 间距布局
- `Row` / `Col` - 栅格布局
- `Divider` - 分割线

### 表单组件
- `Form` - 表单容器
- `FormItem` - 表单项（带 label 属性）
- `Input` - 输入框
- `TextArea` - 文本域
- `InputNumber` - 数字输入
- `Select` - 选择器
- `Checkbox` - 复选框
- `Radio` - 单选框
- `Switch` - 开关
- `Slider` - 滑块

### 数据展示
- `Table` - 表格
- `Card` - 卡片
- `List` - 列表
- `Tabs` - 标签页
- `Collapse` - 折叠面板
- `Typography` / `Text` / `Title` / `Paragraph` - 排版

### 反馈组件
- `Modal` - 模态框
- `Alert` - 警告提示
- `Progress` - 进度条
- `Spin` - 加载中

## 常用命令

```bash
# 安装依赖
pnpm install

# 启动开发服务器（playground）
pnpm dev

# 构建所有包
pnpm build

# 仅构建组件包
pnpm build:packages

# 清理构建产物
pnpm clean
```

## 添加新组件的步骤

1. **创建组件文件**：`packages/components/src/components/MyComponent.tsx`

2. **实现组件**：
```tsx
import React from 'react';
import { Component as AntComponent } from 'antd';

export interface MyComponentProps extends React.ComponentProps<typeof AntComponent> {
  // 自定义属性
  customProp?: string;
}

export const MyComponent: React.FC<MyComponentProps> = (props) => {
  return <AntComponent {...props} />;
};

export default MyComponent;
```

3. **更新 index.tsx**：
   - 在导出列表中添加组件
   - 在 `componentRegistry` 中注册组件

4. **重新构建**：`pnpm build`

## 容错处理

渲染器有自动容错机制：
- 如果组件注册表中找不到组件，自动降级为 `div`
- 保留所有 props 和 children
- 添加 `data-fallback-component` 属性标记未知组件

## 注意事项

1. **Monorepo**: 修改一个包后，可能需要重新构建依赖它的包
2. **类型安全**: 所有组件都有完整的 TypeScript 类型定义
3. **组件注册**: 新组件必须在 `componentRegistry` 中注册才能使用
4. **构建顺序**: 通常先构建 `components`，再构建 `renderer` 和 `editor`

## 开发流程

1. 修改组件或添加新功能
2. 运行 `pnpm build` 构建相关包
3. 在 playground 中测试 (`pnpm dev`)
4. 确认无问题后提交代码

## 调试技巧

- 查看浏览器控制台是否有组件注册错误
- 使用 `console.log` 查看 schema 解析结果
- 检查 `componentRegistry` 是否包含所需组件
