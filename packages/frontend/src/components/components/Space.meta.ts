import type { ComponentPanelConfig } from "../../types";

export const SpaceMeta: ComponentPanelConfig = {
  componentType: "Space",
  displayName: "间距",
  category: "layout",
  icon: "spacing",
  properties: [
    {
      key: "direction",
      label: "方向",
      editor: "select",
      defaultValue: "horizontal",
      options: [
        { label: "水平", value: "horizontal" },
        { label: "垂直", value: "vertical" },
      ],
    },
    {
      key: "size",
      label: "间距大小",
      editor: "select",
      defaultValue: "middle",
      options: [
        { label: "小", value: "small" },
        { label: "中", value: "middle" },
        { label: "大", value: "large" },
      ],
    },
    {
      key: "align",
      label: "对齐方式",
      editor: "select",
      defaultValue: "center",
      options: [
        { label: "开始", value: "start" },
        { label: "居中", value: "center" },
        { label: "结束", value: "end" },
        { label: "拉伸", value: "stretch" },
      ],
    },
    {
      key: "wrap",
      label: "自动换行",
      editor: "boolean",
      defaultValue: false,
      group: "布局",
    },
  ],
};
