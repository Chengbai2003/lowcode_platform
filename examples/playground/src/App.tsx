import { LowcodeEditor } from '@lowcode-platform/editor';

/**
 * 登录注册页面的初始 Schema
 */
const loginPageSchema = {
  componentName: 'Container',
  props: {
    style: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    },
    "width": 'full'
  },
  children: [
    {
      componentName: 'Card',
      props: {
        title: '用户登录',
        style: { width: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }
      },
      children: [
        {
          componentName: 'Form',
          id: 'loginForm',
          props: {
            layout: 'vertical',
            style: { maxWidth: '100%' },
            defaultValue: {
              username: '',
              password: '',
              remember: false
            }
          },
          events: {
            onFinish: `
              console.log("表单提交事件: onFinish",event);
              // 1. 获取 Redux Store 状态
              const state = getState();
              // 2. 通过组件 ID ('username_input') 获取值
              const FromStore = state.components.data['loginForm'];
              console.log("从 Store 获取的用户名:", FromStore);
              
              // 3. 对比表单直接返回的值 (Form 管理的)
              console.log("Ant Design Form 返回的数据:", event.values);
            `
          },
          children: [
            {
              componentName: 'FormItem',
              props: {
                label: '用户名',
                name: 'username',
                rules: [
                  { required: true, message: '请输入用户名!' }
                ]
              },
              children: [
                {
                  componentName: 'Input',
                  id: 'username_input',
                  props: {
                    placeholder: '请输入用户名',
                    size: 'large',
                    initialValue: 'Admin'
                  },
                  events: {
                    onChange: 'console.log("用户名变更:", event.target.value);'
                  }
                }
              ]
            },
            {
              componentName: 'FormItem',
              props: {
                label: '密码',
                name: 'password',
                rules: [
                  { required: true, message: '请输入密码!' }
                ]
              },
              children: [
                {
                  componentName: 'Input',
                  id: 'password_input',
                  props: {
                    type: 'password',
                    placeholder: '请输入密码',
                    size: 'large'
                  },
                  events: {
                    onChange: 'console.log("密码变更:", event.target.value);'
                  }
                }
              ]
            },
            {
              componentName: 'FormItem',
              props: {
                name: 'remember',
                valuePropName: 'checked'
              },
              children: [
                {
                  componentName: 'Checkbox',
                  id: 'remember_checkbox',
                  children: '记住我',
                  events: {
                    onChange: 'console.log("记住我变更:", event.target.checked);'
                  }
                }
              ]
            },
            {
              componentName: 'FormItem',
              children: [
                {
                  componentName: 'Button',
                  props: {
                    type: 'primary',
                    htmlType: 'submit',
                    block: true,
                    size: 'large'
                  },
                  children: '登录'
                }
              ]
            },
            {
              componentName: 'Div',
              props: {
                style: { marginTop: '16px', textAlign: 'center' }
              },
              children: [
                {
                  componentName: 'Text',
                  props: {
                    style: { color: '#666' }
                  },
                  children: '还没有账号？'
                },
                {
                  componentName: 'Button',
                  props: {
                    type: 'text'
                  },
                  children: '立即注册',
                  events: {
                    onClick: 'console.log("注册按钮点击事件: onClick"); console.log("跳转到注册页面");'
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

/**
 * 示例应用
 * 演示低代码编辑器的使用
 */
function App() {
  // 处理 Schema 变化
  const handleSchemaChange = (schema: any) => {
    console.log('Schema 变化:', schema);
  };

  // 处理错误
  const handleError = (error: string) => {
    console.error('Schema 错误:', error);
  };

  // 事件上下文：在事件代码中可以使用的变量和函数
  const eventContext = {
    appName: '低代码平台',
    version: '1.0.0',
    // 可以添加更多上下文变量，如 API 方法、状态管理等
  };

  return (
    <div style={{ margin: 0, padding: 0 }}>
      <LowcodeEditor
        initialSchema={loginPageSchema}
        onChange={handleSchemaChange}
        onError={handleError}
        height="100vh"
        editorWidth="40%"
        theme="vs-dark"
        eventContext={eventContext}
      />
    </div>
  );
}

export default App;
