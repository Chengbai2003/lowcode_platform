import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern',
      },
    },
  },

  // 开发服务器配置
  server: {
    port: 3000,
    open: true,
  },

  // 构建配置（应用模式）
  build: {
    outDir: 'dist',
    sourcemap: true,
    // workspace 包（schema-contract / renderer）通过 symlink 指向 packages/<pkg>/dist，
    // 不在默认的 /node_modules/ 路径下；不加入 include 会让 rollup 把 CJS 产物
    // 当成未转换的 ESM 解析，报 "X is not exported by"。
    commonjsOptions: {
      include: [/node_modules/, /packages\/[^/]+\/dist/],
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // 代码分割
          vendor: ['react', 'react-dom'],
          antd: ['antd', '@ant-design/icons'],
          editor: ['@monaco-editor/react'],
        },
      },
    },
  },

  // 路径别名
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@styles': resolve(__dirname, 'src/styles'),
      '@components': resolve(__dirname, 'src/components'),
      '@features': resolve(__dirname, 'src/features'),
      '@types': resolve(__dirname, 'src/types'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
});
