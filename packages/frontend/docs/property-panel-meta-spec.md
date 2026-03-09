# 属性面板元数据规范（Property Meta Spec）

本文档定义组件 `*.meta.ts` 的统一基线，新增组件必须按本规范实现。

## 1. 分组规范

- 所有属性必须显式配置 `group`。
- 仅允许以下分组：
  - `基础`
  - `样式`
  - `高级`
- 禁止使用历史分组：`功能`、`布局`、`交互`、`内容` 等。

## 2. 默认值规范

- 所有属性必须显式配置 `defaultValue`。
- `defaultValue` 必须可序列化（可稳定存入 schema）：
  - 允许：`string | number | boolean | null | object | array`
  - 禁止：`function`、`symbol`、`bigint`
- 若属性语义确实需要“无值”，可显式写 `defaultValue: undefined`，禁止省略该字段。

## 3. visible 条件规范

- `visible` 必须是纯函数：`(props) => boolean`。
- 函数内部不能依赖外部副作用（网络/随机值/全局可变状态）。
- 任意默认 props 下调用不得抛异常。

示例：

```ts
{
  key: 'orientation',
  label: '标题位置',
  editor: 'select',
  defaultValue: 'center',
  group: '样式',
  options: [
    { label: '左', value: 'left' },
    { label: '中', value: 'center' },
    { label: '右', value: 'right' },
  ],
  visible: (props) => props.type !== 'vertical',
}
```

## 4. options 规范（select）

- `editor: 'select'` 必须配置 `options`。
- `options` 结构统一为：

```ts
options: Array<{ label: string; value: string | number }>;
```

- `label` 不可为空字符串。
- `value` 仅允许 `string | number`。

## 5. 推荐模板

```ts
import type { ComponentPanelConfig } from '../../types';

export const DemoMeta: ComponentPanelConfig = {
  componentType: 'Demo',
  displayName: '示例组件',
  category: 'display',
  icon: 'appstore',
  properties: [
    {
      key: 'title',
      label: '标题',
      editor: 'string',
      defaultValue: '标题',
      group: '基础',
    },
    {
      key: 'size',
      label: '尺寸',
      editor: 'select',
      defaultValue: 'middle',
      group: '样式',
      options: [
        { label: '小', value: 'small' },
        { label: '中', value: 'middle' },
        { label: '大', value: 'large' },
      ],
    },
    {
      key: 'disabled',
      label: '禁用',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
  ],
};
```

## 6. 验收要求

- 所有组件元数据通过 `component-meta-coverage` 相关测试。
- 对你新增的组件，至少保证：
  - 可在 PropertyPanel 中编辑
  - 修改可回写 schema
  - 刷新后可正确回显
