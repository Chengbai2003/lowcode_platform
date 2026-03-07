import type { ComponentPanelConfig } from "../../types";

export const ContainerMeta: ComponentPanelConfig = {
  componentType: "Container",
  displayName: "容器",
  category: "layout",
  icon: "box",
  properties: [
    {
      key: "display",
      label: "显示类型",
      editor: "select",
      defaultValue: "block",
      options: [
        { label: "块级", value: "block" },
        { label: "行内块", value: "inline-block" },
        { label: "弹性布局", value: "flex" },
        { label: "网格布局", value: "grid" },
      ],
    },
    { key: "width", label: "宽度", editor: "string", defaultValue: "100%" },
    { key: "height", label: "高度", editor: "string", defaultValue: "auto" },
    { key: "padding", label: "内边距", editor: "string", defaultValue: "0" },
    { key: "margin", label: "外边距", editor: "string", defaultValue: "0" },
    {
      key: "backgroundColor",
      label: "背景色",
      editor: "color",
      defaultValue: "#ffffff",
      group: "样式",
    },
    {
      key: "border",
      label: "边框",
      editor: "string",
      defaultValue: "none",
      group: "样式",
    },
    {
      key: "borderRadius",
      label: "圆角",
      editor: "string",
      defaultValue: "0",
      group: "样式",
    },
    {
      key: "shadow",
      label: "阴影",
      editor: "string",
      defaultValue: "none",
      group: "样式",
    },
  ],
};
