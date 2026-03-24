import { LowcodeEditor } from './editor';
import type { A2UISchema, Action } from './types';

/**
 * 登录注册页面的初始 Schema (A2UI Flat Structure)
 */
const loginPageSchema: A2UISchema = {
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
          minHeight: '100%',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        },
        width: 'full',
      },
      childrenIds: ['card_1'],
    },
    card_1: {
      id: 'card_1',
      type: 'Card',
      props: {
        title: '用户登录',
        style: { width: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
      },
      childrenIds: ['loginForm'],
    },
    loginForm: {
      id: 'loginForm',
      type: 'Form',
      props: {
        layout: 'vertical',
        style: { maxWidth: '100%' },
        initialValues: {
          username: '',
          password: '',
          remember: false,
        },
      },
      events: {
        onFinish: [] as Action[],
      },
      childrenIds: ['item_user', 'item_pass', 'item_remember', 'item_submit', 'div_footer'],
    },
    item_user: {
      id: 'item_user',
      type: 'FormItem',
      props: {
        label: '用户名',
        name: 'username',
        rules: [{ required: true, message: '请输入用户名!' }],
      },
      childrenIds: ['username_input'],
    },
    username_input: {
      id: 'username_input',
      type: 'Input',
      props: {
        placeholder: '请输入用户名',
        size: 'large',
        field: 'username',
      },
      events: {
        onChange: [] as Action[],
      },
    },
    item_pass: {
      id: 'item_pass',
      type: 'FormItem',
      props: {
        label: '密码',
        name: 'password',
        rules: [{ required: true, message: '请输入密码!' }],
      },
      childrenIds: ['password_input'],
    },
    password_input: {
      id: 'password_input',
      type: 'Input',
      props: {
        type: 'password',
        placeholder: '请输入密码',
        size: 'large',
        field: 'password',
      },
      events: {
        onChange: [] as Action[],
      },
    },
    item_remember: {
      id: 'item_remember',
      type: 'FormItem',
      props: {
        name: 'remember',
        valuePropName: 'checked',
      },
      childrenIds: ['remember_checkbox'],
    },
    remember_checkbox: {
      id: 'remember_checkbox',
      type: 'Checkbox',
      props: {
        children: '记住我',
      },
      events: {
        onChange: [] as Action[],
      },
    },
    item_submit: {
      id: 'item_submit',
      type: 'FormItem',
      childrenIds: ['btn_submit'],
    },
    btn_submit: {
      id: 'btn_submit',
      type: 'Button',
      props: {
        type: 'primary',
        htmlType: 'submit',
        block: true,
        size: 'large',
        children: '登录',
      },
    },
    div_footer: {
      id: 'div_footer',
      type: 'Div',
      props: {
        style: { marginTop: '16px', textAlign: 'center' },
      },
      childrenIds: ['text_no_account', 'btn_register'],
    },
    text_no_account: {
      id: 'text_no_account',
      type: 'Text',
      props: {
        style: { color: '#666' },
        children: '还没有账号？',
      },
    },
    btn_register: {
      id: 'btn_register',
      type: 'Button',
      props: {
        type: 'text',
        children: '立即注册',
      },
      events: {
        onClick: [] as Action[],
      },
    },
  },
};

/**
 * 开发环境 Demo
 */
function App() {
  const handleSchemaChange = (_schema: A2UISchema) => {};

  const handleError = (_error: string) => {};

  const eventContext = {
    appName: '低代码平台',
    version: '1.0.0',
  };

  return (
    <div style={{ margin: 0, padding: 0 }}>
      <LowcodeEditor
        pageId="demo-login-page"
        projectName="登录注册页"
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
