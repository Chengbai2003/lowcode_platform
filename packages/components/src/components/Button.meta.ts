import type { ComponentPanelConfig } from "@lowcode-platform/types";

export const ButtonMeta: ComponentPanelConfig = {
  componentType: "Button",
  displayName: "按钮",
  category: "form",
  icon: "cursor-click",
  properties: [
    {
      key: "type",
      label: "类型",
      editor: "select",
      defaultValue: "default",
      options: [
        { label: "默认", value: "default" },
        { label: "主要", value: "primary" },
        { label: "虚线", value: "dashed" },
        { label: "链接", value: "link" },
        { label: "文本", value: "text" },
      ],
    },
    {
      key: "children",
      label: "按钮文字",
      editor: "string",
      defaultValue: "按钮",
    },
    { key: "disabled", label: "禁用", editor: "boolean", defaultValue: false },
    { key: "loading", label: "加载中", editor: "boolean", defaultValue: false },
    {
      key: "size",
      label: "尺寸",
      editor: "select",
      defaultValue: "middle",
      options: [
        { label: "大", value: "large" },
        { label: "中", value: "middle" },
        { label: "小", value: "small" },
      ],
    },
    {
      key: "block",
      label: "撑满父容器",
      editor: "boolean",
      defaultValue: false,
      group: "样式",
    },
    {
      key: "danger",
      label: "危险按钮",
      editor: "boolean",
      defaultValue: false,
      group: "样式",
    },
  ],
};
