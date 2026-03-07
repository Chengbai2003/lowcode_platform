import type { ComponentPanelConfig } from "../../types";

export const SelectMeta: ComponentPanelConfig = {
  componentType: "Select",
  displayName: "选择器",
  category: "form",
  icon: "select",
  properties: [
    {
      key: "placeholder",
      label: "占位符",
      editor: "string",
      defaultValue: "请选择",
    },
    {
      key: "mode",
      label: "模式",
      editor: "select",
      defaultValue: "default",
      options: [
        { label: "单选", value: "default" },
        { label: "多选", value: "multiple" },
        { label: "标签", value: "tags" },
      ],
    },
    {
      key: "defaultValue",
      label: "默认值",
      editor: "string",
      defaultValue: "",
    },
    { key: "disabled", label: "禁用", editor: "boolean", defaultValue: false },
    {
      key: "allowClear",
      label: "允许清除",
      editor: "boolean",
      defaultValue: false,
      group: "功能",
    },
    {
      key: "showSearch",
      label: "可搜索",
      editor: "boolean",
      defaultValue: false,
      group: "功能",
    },
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
      group: "样式",
    },
  ],
};
