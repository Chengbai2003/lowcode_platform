import { LowcodeEditor } from '@lowcode-platform/editor';
import type { A2UISchema } from '@lowcode-platform/renderer';

/**
 * 登录注册页面的初始 Schema (A2UI Flat Structure)
 */
const loginPageSchema: A2UISchema = {
  rootId: 'root',
  components: {
    'root': {
      id: 'root',
      type: 'Container',
      props: {
        style: {
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100%',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        },
        width: 'full'
      },
      childrenIds: ['card_1']
    },
    'card_1': {
      id: 'card_1',
      type: 'Card',
      props: {
        title: '用户登录',
        style: { width: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }
      },
      childrenIds: ['loginForm']
    },
    'loginForm': {
      id: 'loginForm',
      type: 'Form',
      props: {
        layout: 'vertical',
        style: { maxWidth: '100%' },
        initialValues: {
          username: '',
          password: '',
          remember: false
        }
      },
      events: {
        onFinish: `
          console.log("表单提交事件: onFinish", event);
          // 1. 获取 Redux Store 状态
          const state = getState();
          // 2. 通过组件 ID ('username_input') 获取值
          const FromStore = state.components.data['loginForm'];
          console.log("从 Store 获取的用户名:", FromStore);
          
          // 3. 对比表单直接返回的值 (Form 管理的)
          console.log("Ant Design Form 返回的数据:", event.values);
        `
      },
      childrenIds: ['item_user', 'item_pass', 'item_remember', 'item_submit', 'div_footer']
    },
    'item_user': {
      id: 'item_user',
      type: 'FormItem',
      props: {
        label: '用户名',
        name: 'username',
        rules: [{ required: true, message: '请输入用户名!' }]
      },
      childrenIds: ['username_input']
    },
    'username_input': {
      id: 'username_input',
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
    'item_pass': {
      id: 'item_pass',
      type: 'FormItem',
      props: {
        label: '密码',
        name: 'password',
        rules: [{ required: true, message: '请输入密码!' }]
      },
      childrenIds: ['password_input']
    },
    'password_input': {
      id: 'password_input',
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
    'item_remember': {
      id: 'item_remember',
      type: 'FormItem',
      props: {
        name: 'remember',
        valuePropName: 'checked'
      },
      childrenIds: ['remember_checkbox']
    },
    'remember_checkbox': {
      id: 'remember_checkbox',
      type: 'Checkbox',
      props: {
        children: '记住我'
      },
      events: {
        onChange: 'console.log("记住我变更:", event.target.checked);'
      }
    },
    'item_submit': {
      id: 'item_submit',
      type: 'FormItem',
      childrenIds: ['btn_submit']
    },
    'btn_submit': {
      id: 'btn_submit',
      type: 'Button',
      props: {
        type: 'primary',
        htmlType: 'submit',
        block: true,
        size: 'large',
        children: '登录'
      }
    },
    'div_footer': {
      id: 'div_footer',
      type: 'Div',
      props: {
        style: { marginTop: '16px', textAlign: 'center' }
      },
      childrenIds: ['text_no_account', 'btn_register']
    },
    'text_no_account': {
      id: 'text_no_account',
      type: 'Text',
      props: {
        style: { color: '#666' },
        children: '还没有账号？'
      }
    },
    'btn_register': {
      id: 'btn_register',
      type: 'Button',
      props: {
        type: 'text',
        children: '立即注册'
      },
      events: {
        onClick: 'console.log("注册按钮点击事件: onClick"); console.log("跳转到注册页面");'
      }
    }
  }
};

/**
 * 示例应用
 * 演示低代码编辑器的使用
 */
function App() {
  // 处理 Schema 变化
  const handleSchemaChange = (schema: A2UISchema) => {
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
