import type { ComponentPanelConfig } from "../../types";

export const TitleMeta: ComponentPanelConfig = {
  componentType: "Title",
  displayName: "标题",
  category: "typography",
  icon: "heading",
  properties: [
    {
      key: "children",
      label: "标题内容",
      editor: "string",
      defaultValue: "标题",
    },
    {
      key: "level",
      label: "标题级别",
      editor: "select",
      defaultValue: 1,
      options: [
        { label: "H1", value: 1 },
        { label: "H2", value: 2 },
        { label: "H3", value: 3 },
        { label: "H4", value: 4 },
        { label: "H5", value: 5 },
        { label: "H6", value: 6 },
      ],
    },
    {
      key: "type",
      label: "文本类型",
      editor: "select",
      defaultValue: "",
      options: [
        { label: "默认", value: "" },
        { label: "次要", value: "secondary" },
        { label: "警告", value: "warning" },
        { label: "危险", value: "danger" },
      ],
    },
    {
      key: "copyable",
      label: "可复制",
      editor: "boolean",
      defaultValue: false,
      group: "交互",
    },
  ],
};
