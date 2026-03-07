import ReactDOM from 'react-dom/client';
import App from './App';
import 'antd/dist/reset.css';
import '@lowcode-platform/frontend/style.css';
import { LowcodeProvider } from '@lowcode-platform/frontend';

// 创建 React 根节点并渲染应用
ReactDOM.createRoot(document.getElementById('root')!).render(
  <LowcodeProvider>
    <App />
  </LowcodeProvider>
);
