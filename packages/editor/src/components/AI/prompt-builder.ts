import { PromptConfig } from "@lowcode-platform/types";

export class PromptBuilder {
  private config: Required<PromptConfig>;

  constructor(config: PromptConfig = {}) {
    this.config = {
      language: config.language || "zh",
      supportedComponents: config.supportedComponents || [],
      schemaExample: config.schemaExample || this.getDefaultSchemaExample(),
      includeExplanation: config.includeExplanation !== false,
      includeSuggestions: config.includeSuggestions !== false,
    };
  }

  private getDefaultSchemaExample() {
    return {
      rootId: "root",
      components: {
        root: {
          id: "root",
          type: "Container",
          props: { style: { padding: "20px" } },
          childrenIds: ["btn1"],
        },
        btn1: {
          id: "btn1",
          type: "Button",
          props: { type: "primary", children: "Click Me" },
          childrenIds: [],
        },
      },
    };
  }

  buildSystemPrompt(): string {
    const isZh = this.config.language === "zh";

    const role = isZh
      ? "你是一个专业的低代码平台AI助手，专门帮助用户生成、分析和优化UI界面。"
      : "You are a professional low-code platform AI assistant, specializing in generating, analyzing, and optimizing UI interfaces.";

    const capabilities = isZh
      ? [
          "1. 根据自然语言描述生成A2UI Schema格式的JSON结构",
          "2. 分析现有Schema并提供优化建议",
          "3. 理解UI设计原则和最佳实践",
        ]
      : [
          "1. Generate A2UI Schema JSON structures based on natural language descriptions",
          "2. Analyze existing Schema and provide optimization suggestions",
          "3. Understand UI design principles and best practices",
        ];

    const componentList =
      this.config.supportedComponents.length > 0
        ? isZh
          ? `支持的组件类型：${this.config.supportedComponents.join(", ")}`
          : `Supported component types: ${this.config.supportedComponents.join(", ")}`
        : "";

    const formatHeading = isZh ? "A2UI Schema格式：" : "A2UI Schema Format:";
    const outputFormat = isZh
      ? "请始终以以下格式回复：\n**说明**：[对生成内容的详细说明]\n**Schema**：[JSON格式的A2UI Schema]\n**建议**：[可选的优化建议列表]"
      : "Please always respond in the following format:\n**Explanation**: [Detailed explanation of generated content]\n**Schema**: [JSON format A2UI Schema]\n**Suggestions**: [Optional list of optimization suggestions]";

    const result = [
      role,
      "",
      isZh ? "你的能力包括：" : "Your capabilities include:",
      ...capabilities,
      "",
      componentList,
      "",
      formatHeading,
      JSON.stringify(this.config.schemaExample, null, 2),
      "",
      outputFormat,
    ]
      .filter(Boolean)
      .join("\n");

    return result;
  }

  static create(config?: PromptConfig): PromptBuilder {
    return new PromptBuilder(config);
  }
}
