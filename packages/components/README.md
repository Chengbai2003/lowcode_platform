# @lowcode-platform/components

低代码平台组件库，基于 Ant Design 封装。

## 特性

- 每个组件独立文件，便于扩展和自定义
- 支持默认参数配置
- 完整的 TypeScript 类型定义
- 与 Ant Design 完全兼容

## 安装

```bash
pnpm add @lowcode-platform/components
```

## 组件列表

### 布局组件

| 组件 | 说明 | 默认参数 |
|------|------|----------|
| `Container` | 容器组件 | `padding: 16px`, `center: true` |
| `Space` | 间距组件 | `size: middle` |
| `Divider` | 分割线 | - |
| `Row` / `Col` | 栅格布局 | `gutter: 16` |

### 表单组件

| 组件 | 说明 | 默认参数 |
|------|------|----------|
| `Form` | 表单 | - |
| `FormItem` | 表单项 | - |
| `Input` | 输入框 | - |
| `TextArea` | 文本域 | - |
| `InputNumber` | 数字输入 | - |
| `Select` | 选择器 | - |
| `Checkbox` | 复选框 | - |
| `Radio` | 单选框 | - |
| `Switch` | 开关 | - |
| `Slider` | 滑块 | - |

### 数据展示

| 组件 | 说明 | 默认参数 |
|------|------|----------|
| `Table` | 表格 | - |
| `Card` | 卡片 | - |
| `List` | 列表 | - |
| `Tabs` | 标签页 | `type: line` |
| `Collapse` | 折叠面板 | - |
| `Typography` | 排版 | - |
| `Text` | 文本 | - |
| `Title` | 标题 | - |
| `Paragraph` | 段落 | - |

### 反馈组件

| 组件 | 说明 | 默认参数 |
|------|------|----------|
| `Modal` | 模态框 | `width: 520` |
| `Alert` | 警告提示 | - |
| `Progress` | 进度条 | - |
| `Spin` | 加载中 | - |
| `Skeleton` | 骨架屏 | - |

### 其他

| 组件 | 说明 |
|------|------|
| `Button` | 按钮 |
| `Tag` | 标签 |
| `Badge` | 徽标 |
| `Tooltip` | 文字提示 |
| `Popover` | 气泡卡片 |
| `Steps` | 步骤条 |
| `DatePicker` | 日期选择 |
| `RangePicker` | 日期范围选择 |

## Container 组件

容器组件，带有默认样式：

```tsx
import { Container } from '@lowcode-platform/components';

<Container width="md" padding="24px">
  {/* 内容 */}
</Container>
```

**Props:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `width` | `'xs'\|'sm'\|'md'\|'lg'\|'xl'\|'full'\|number` | `'lg'` | 容器宽度 |
| `padding` | `string\|number` | `16px` | 内边距 |
| `center` | `boolean` | `true` | 是否居中 |
| `style` | `CSSProperties` | - | 自定义样式 |

**宽度预设:**

| 值 | 宽度 |
|----|------|
| `xs` | 100% |
| `sm` | 640px |
| `md` | 768px |
| `lg` | 1024px |
| `xl` | 1280px |
| `full` | 100% |

## 添加自定义组件

1. 创建组件文件：

```tsx
// src/components/MyComponent.tsx
import React from 'react';

export interface MyComponentProps {
  title?: string;
  size?: 'small' | 'medium' | 'large';
}

export const MyComponent: React.FC<MyComponentProps> = ({
  title = '默认标题',
  size = 'medium'
}) => {
  return (
    <div className={`my-component my-component-${size}`}>
      {title}
    </div>
  );
};

export default MyComponent;
```

2. 在 `index.tsx` 中导出并注册：

```tsx
export { default as MyComponent } from './components/MyComponent';

// 在 componentRegistry 中添加
export const componentRegistry = {
  // ...
  MyComponent,
};
```

## 许可证

MIT
