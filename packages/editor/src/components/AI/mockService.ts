import type { AIService, AIRequest, AIResponse } from './types';
import type { A2UISchema } from '@lowcode-platform/renderer';

// Mock AI服务 - 作为兜底方案
export class MockAIService implements AIService {
  name = 'Mock AI';
  
  isAvailable(): boolean {
    return true; // 始终可用
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    // 模拟API延迟
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
    
    const prompt = request.prompt.toLowerCase();
    
    // 基于关键词的规则引擎
    if (prompt.includes('登录') || prompt.includes('login')) {
      return {
        content: '我为你生成了一个标准的登录表单，包含用户名、密码输入框和登录按钮。布局采用垂直表单样式，整体居中显示。',
        schema: {
          rootId: 'root',
          components: {
            root: {
              id: 'root',
              type: 'Container',
              props: {
                style: { 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  minHeight: '100vh',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                }
              },
              childrenIds: ['loginCard']
            },
            loginCard: {
              id: 'loginCard',
              type: 'Card',
              props: {
                title: '用户登录',
                style: { width: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }
              },
              childrenIds: ['loginForm']
            },
            loginForm: {
              id: 'loginForm',
              type: 'Form',
              props: { 
                layout: 'vertical',
                initialValues: { username: '', password: '', remember: false }
              },
              childrenIds: ['usernameField', 'passwordField', 'rememberField', 'submitField']
            },
            usernameField: {
              id: 'usernameField',
              type: 'FormItem',
              props: { 
                label: '用户名', 
                name: 'username',
                rules: [{ required: true, message: '请输入用户名!' }]
              },
              childrenIds: ['usernameInput']
            },
            usernameInput: {
              id: 'usernameInput',
              type: 'Input',
              props: { 
                placeholder: '请输入用户名',
                size: 'large',
                field: 'username'
              },
              events: {
                onChange: 'console.log("用户名变更:", event.target.value);'
              }
            },
            passwordField: {
              id: 'passwordField',
              type: 'FormItem',
              props: { 
                label: '密码', 
                name: 'password',
                rules: [{ required: true, message: '请输入密码!' }]
              },
              childrenIds: ['passwordInput']
            },
            passwordInput: {
              id: 'passwordInput',
              type: 'Input',
              props: { 
                type: 'password', 
                placeholder: '请输入密码',
                size: 'large',
                field: 'password'
              },
              events: {
                onChange: 'console.log("密码变更:", event.target.value);'
              }
            },
            rememberField: {
              id: 'rememberField',
              type: 'FormItem',
              props: { name: 'remember', valuePropName: 'checked' },
              childrenIds: ['rememberCheckbox']
            },
            rememberCheckbox: {
              id: 'rememberCheckbox',
              type: 'Checkbox',
              props: { children: '记住我' },
              events: {
                onChange: 'console.log("记住我变更:", event.target.checked);'
              }
            },
            submitField: {
              id: 'submitField',
              type: 'FormItem',
              childrenIds: ['submitButton']
            },
            submitButton: {
              id: 'submitButton',
              type: 'Button',
              props: { 
                type: 'primary', 
                block: true, 
                size: 'large',
                children: '登录',
                htmlType: 'submit'
              }
            }
          }
        },
        suggestions: [
          '建议添加表单验证规则',
          '考虑添加记住密码功能',
          '可以增加第三方登录选项',
          '优化移动端响应式布局'
        ]
      };
    }

    if (prompt.includes('表格') || prompt.includes('table')) {
      return {
        content: '我创建了一个数据表格，包含姓名、年龄、地址三列。你可以通过设置dataSource属性来填充实际数据。',
        schema: {
          rootId: 'root',
          components: {
            root: {
              id: 'root',
              type: 'Container',
              props: { padding: '24px' },
              childrenIds: ['table']
            },
            table: {
              id: 'table',
              type: 'Table',
              props: {
                dataSource: [],
                columns: [
                  { title: '姓名', dataIndex: 'name', key: 'name' },
                  { title: '年龄', dataIndex: 'age', key: 'age' },
                  { title: '地址', dataIndex: 'address', key: 'address' }
                ],
                pagination: { pageSize: 10, showSizeChanger: true },
                scroll: { x: 800 }
              }
            }
          }
        },
        suggestions: [
          '添加搜索和筛选功能',
          '实现行选择和批量操作',
          '支持排序和分页',
          '添加导出功能'
        ]
      };
    }

    if (prompt.includes('导航') || prompt.includes('navbar') || prompt.includes('header')) {
      return {
        content: '我为你设计了一个现代化的导航栏，包含Logo、菜单项和用户操作区域。',
        schema: {
          rootId: 'root',
          components: {
            root: {
              id: 'root',
              type: 'Container',
              props: { padding: '0' },
              childrenIds: ['navbar']
            },
            navbar: {
              id: 'navbar',
              type: 'Container',
              props: {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0 24px',
                  height: '64px',
                  background: '#fff',
                  borderBottom: '1px solid #f0f0f0',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                }
              },
              childrenIds: ['logo', 'menu', 'user']
            },
            logo: {
              id: 'logo',
              type: 'Text',
              props: {
                style: { fontSize: '18px', fontWeight: 'bold', color: '#1890ff' },
                children: 'Logo'
              }
            },
            menu: {
              id: 'menu',
              type: 'Container',
              props: {
                style: { display: 'flex', gap: '24px' }
              },
              childrenIds: ['home', 'products', 'about']
            },
            home: {
              id: 'home',
              type: 'Text',
              props: { children: '首页' }
            },
            products: {
              id: 'products',
              type: 'Text',
              props: { children: '产品' }
            },
            about: {
              id: 'about',
              type: 'Text',
              props: { children: '关于' }
            },
            user: {
              id: 'user',
              type: 'Button',
              props: { children: '用户' }
            }
          }
        },
        suggestions: [
          '添加响应式菜单（移动端汉堡菜单）',
          '实现下拉子菜单',
          '添加搜索框',
          '集成用户头像和下拉菜单'
        ]
      };
    }

    // 默认响应
    return {
      content: '我为你创建了一个基础容器结构。你可以继续告诉我需要添加什么具体内容，比如"添加一个按钮"、"生成一个表单"等。',
      schema: {
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Container',
            props: { 
              padding: '24px',
              style: { textAlign: 'center' }
            },
            childrenIds: ['content']
          },
          content: {
            id: 'content',
            type: 'Div',
            props: { 
              style: { padding: '48px', background: '#f5f5f5', borderRadius: '8px' },
              children: '请描述你想要的UI界面，我会帮你生成相应的结构。'
            }
          }
        }
      },
      suggestions: [
        '尝试说："生成一个登录页面"',
        '尝试说："创建一个数据表格"',
        '尝试说："设计一个导航栏"',
        '或者描述你想要的具体功能'
      ]
    };
  }

  async analyzeSchema(schema: A2UISchema): Promise<{ analysis: string; issues: string[]; suggestions: string[] }> {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const componentCount = Object.keys(schema.components).length;
    const hasForm = Object.values(schema.components).some(comp => comp.type === 'Form');
    const hasTable = Object.values(schema.components).some(comp => comp.type === 'Table');
    
    return {
      analysis: `当前页面包含${componentCount}个组件${hasForm ? '，包含表单元素' : ''}${hasTable ? '，包含数据表格' : ''}。整体结构清晰，使用了基础的布局组件。设计风格简洁，符合现代UI规范。`,
      issues: [],
      suggestions: [
        '建议添加页面标题提升用户导航',
        '考虑添加面包屑导航结构',
        '为长页面添加返回顶部按钮',
        '优化移动端响应式体验',
        '添加加载状态和错误处理'
      ]
    };
  }

  async optimizeSchema(schema: A2UISchema): Promise<{ optimizedSchema: A2UISchema; suggestions: string[] }> {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      optimizedSchema: schema,
      suggestions: [
        '优化组件层级结构，减少嵌套深度',
        '添加响应式断点优化移动端体验',
        '考虑为表单字段添加验证规则',
        '为按钮添加加载状态和禁用状态',
        '优化颜色对比度提升可访问性',
        '添加微交互动画提升用户体验'
      ]
    };
  }
}