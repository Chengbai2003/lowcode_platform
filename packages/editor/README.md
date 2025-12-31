# @lowcode-platform/editor

低代码编辑器组件，左侧 Monaco Editor 编辑 JSON，右侧实时预览。

## 功能

- **Monaco Editor**: VS Code 同款编辑器
- **实时预览**: JSON 修改即时渲染
- **错误提示**: JSON 语法错误实时显示
- **可自定义**: 支持自定义主题、宽度、组件注册表

## 安装

```bash
pnpm add @lowcode-platform/editor
```

## 使用

```tsx
import { LowcodeEditor } from '@lowcode-platform/editor';
import { componentRegistry } from '@lowcode-platform/components';

function App() {
  return (
    <LowcodeEditor
      height="100vh"
      editorWidth="40%"
      theme="vs-dark"
      components={componentRegistry}
      onChange={(schema) => console.log('Schema changed:', schema)}
      onError={(error) => console.error('Error:', error)}
    />
  );
}
```

## API

### LowcodeEditor Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `initialSchema` | `ComponentSchema\|string` | 空页面 | 初始 JSON Schema |
| `editorWidth` | `string\|number` | `'50%'` | 编辑器宽度 |
| `theme` | `'vs'\|'vs-dark'\|'hc-black'` | `'vs-dark'` | 编辑器主题 |
| `height` | `string\|number` | `'100vh'` | 编辑器高度 |
| `components` | `ComponentRegistry` | - | 自定义组件注册表 |
| `onChange` | `(schema) => void` | - | Schema 变化回调 |
| `onError` | `(error) => void` | - | 错误回调 |
| `showLineNumbers` | `boolean` | `true` | 显示行号 |
| `wordWrap` | `boolean` | `true` | 自动换行 |

### 组件注册表

```tsx
import { Button, Input } from '@lowcode-platform/components';

const components = {
  Button,
  Input,
  // ... 更多组件
};

<LowcodeEditor components={components} />
```

## 示例

### 基础表单

```json
{
  "componentName": "Page",
  "children": [
    {
      "componentName": "Container",
      "props": { "width": "md" },
      "children": [
        {
          "componentName": "Form",
          "props": { "layout": "vertical" },
          "children": [
            {
              "componentName": "FormItem",
              "props": { "label": "用户名" },
              "children": [
                {
                  "componentName": "Input",
                  "props": { "placeholder": "请输入用户名" }
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### 卡片列表

```json
{
  "componentName": "Container",
  "props": { "padding": "40px" },
  "children": [
    {
      "componentName": "Row",
      "props": { "gutter": 16 },
      "children": [
        {
          "componentName": "Col",
          "props": { "span": 8 },
          "children": [
            {
              "componentName": "Card",
              "props": { "title": "卡片1" },
              "children": "卡片内容"
            }
          ]
        }
      ]
    }
  ]
}
```

## 布局

编辑器采用左右分栏布局：

```
┌─────────────────────────────────────────────┐
│                  Layout                      │
├──────────────────────┬──────────────────────┤
│   JSON Editor       │    Live Preview       │
│   (Monaco Editor)    │    (Renderer)        │
│                      │                      │
│                      │                      │
└──────────────────────┴──────────────────────┘
```

## 许可证

MIT
