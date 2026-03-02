import type { A2UISchema } from "@lowcode-platform/renderer";

/**
 * 模拟 AI 服务
 * 用于开发和测试，后续可替换为真实的 AI 服务
 */
export class MockAIService {
  private static instance: MockAIService;

  static getInstance(): MockAIService {
    if (!MockAIService.instance) {
      MockAIService.instance = new MockAIService();
    }
    return MockAIService.instance;
  }

  async generateSchema(
    prompt: string,
  ): Promise<{ schema: A2UISchema; explanation: string }> {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes("登录") || lowerPrompt.includes("login")) {
      return {
        schema: {
          rootId: "root",
          components: {
            root: {
              id: "root",
              type: "Container",
              props: {
                style: {
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  minHeight: "100vh",
                },
              },
              childrenIds: ["loginForm"],
            },
            loginForm: {
              id: "loginForm",
              type: "Card",
              props: {
                title: "用户登录",
                style: { width: "400px" },
              },
              childrenIds: ["form"],
            },
            form: {
              id: "form",
              type: "Form",
              props: { layout: "vertical" },
              childrenIds: ["username", "password", "submit"],
            },
            username: {
              id: "username",
              type: "FormItem",
              props: { label: "用户名", name: "username" },
              childrenIds: ["usernameInput"],
            },
            usernameInput: {
              id: "usernameInput",
              type: "Input",
              props: { placeholder: "请输入用户名" },
            },
            password: {
              id: "password",
              type: "FormItem",
              props: { label: "密码", name: "password" },
              childrenIds: ["passwordInput"],
            },
            passwordInput: {
              id: "passwordInput",
              type: "Input",
              props: { type: "password", placeholder: "请输入密码" },
            },
            submit: {
              id: "submit",
              type: "FormItem",
              childrenIds: ["submitButton"],
            },
            submitButton: {
              id: "submitButton",
              type: "Button",
              props: { type: "primary", block: true, children: "登录" },
            },
          },
        },
        explanation:
          "我为你生成了一个标准的登录表单，包含用户名、密码输入框和登录按钮。布局采用垂直表单样式，整体居中显示。",
      };
    }

    if (lowerPrompt.includes("表格") || lowerPrompt.includes("table")) {
      return {
        schema: {
          rootId: "root",
          components: {
            root: {
              id: "root",
              type: "Container",
              props: { padding: "24px" },
              childrenIds: ["table"],
            },
            table: {
              id: "table",
              type: "Table",
              props: {
                dataSource: [],
                columns: [
                  { title: "姓名", dataIndex: "name", key: "name" },
                  { title: "年龄", dataIndex: "age", key: "age" },
                  { title: "地址", dataIndex: "address", key: "address" },
                ],
              },
            },
          },
        },
        explanation:
          "我创建了一个数据表格，包含姓名、年龄、地址三列。你可以通过设置 dataSource 属性来填充实际数据。",
      };
    }

    // 默认返回一个简单的容器
    return {
      schema: {
        rootId: "root",
        components: {
          root: {
            id: "root",
            type: "Container",
            props: { padding: "24px" },
            childrenIds: ["content"],
          },
          content: {
            id: "content",
            type: "Div",
            props: {
              style: { textAlign: "center", padding: "48px" },
            },
            childrenIds: ["text"],
          },
          text: {
            id: "text",
            type: "Text",
            props: { children: "AI 为你生成的内容" },
          },
        },
      },
      explanation:
        "我为你创建了一个基础容器结构。你可以继续告诉我需要添加什么具体内容。",
    };
  }

  async optimizeSchema(
    schema: A2UISchema,
  ): Promise<{ optimizedSchema: A2UISchema; suggestions: string[] }> {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      optimizedSchema: schema,
      suggestions: [
        "建议添加响应式断点优化移动端体验",
        "考虑为表单字段添加验证规则",
        "可以为按钮添加加载状态",
      ],
    };
  }

  async analyzeSchema(
    schema: A2UISchema,
  ): Promise<{ analysis: string; issues: string[]; suggestions: string[] }> {
    await new Promise((resolve) => setTimeout(resolve, 800));

    return {
      analysis:
        "当前页面结构清晰，使用了基础的布局组件。整体设计简洁，符合现代 UI 规范。",
      issues: [],
      suggestions: [
        "添加页面标题提升用户导航",
        "考虑添加面包屑导航",
        "为长页面添加返回顶部按钮",
      ],
    };
  }
}
