# @lowcode-platform/renderer

运行时渲染器，将 JSON Schema 转换为 React 组件。

## 功能

- 将 JSON Schema 解析为 React 组件树
- 支持递归渲染子组件
- 组件注册机制，支持自定义组件
- 容错处理：未知组件自动降级为 `div`

## 安装

```bash
pnpm add @lowcode-platform/renderer
```

## 使用

```tsx
import { Renderer } from '@lowcode-platform/renderer';
import { componentRegistry } from '@lowcode-platform/components';

const schema = {
  componentName: 'Page',
  props: {},
  children: [
    {
      componentName: 'Button',
      props: { type: 'primary' },
      children: '点击我'
    }
  ]
};

function App() {
  return (
    <Renderer
      schema={schema}
      components={componentRegistry}
    />
  );
}
```

## API

### Renderer Props

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `schema` | `ComponentSchema` | 是 | JSON Schema 对象 |
| `components` | `ComponentRegistry` | 否 | 自定义组件注册表 |
| `onComponentClick` | `(schema) => void` | 否 | 组件点击回调 |

### ComponentSchema

```typescript
interface ComponentSchema {
  componentName: string;    // 组件名称
  props?: Record<string, any>;  // 组件属性
  children?: ComponentSchema | ComponentSchema[] | string;
  id?: string;              // 可选的唯一标识
}
```

## 内置组件

以下组件内置在渲染器中，无需额外导入：

| 组件名 | 说明 |
|--------|------|
| `Page` | 页面容器 (div) |
| `Div` | 通用容器 |
| `Span` | 行内容器 |
| `Container` | 带默认样式的容器 |
| `Row` / `Col` | 栅格布局 |
| `Text` | 文本 |
| `Title` | 标题 (h1-h6) |
| `Paragraph` | 段落 |
| `Button` | 按钮 |
| `Input` | 输入框 |
| `TextArea` | 文本域 |

## 容错机制

当组件注册表中找不到对应组件时，会自动降级为 `div` 渲染，并保留所有 props 和 children。

```typescript
// 未知组件会渲染为:
<div {...props} data-fallback-component="UnknownComponent">
  {children}
</div>
```

## 许可证

MIT
