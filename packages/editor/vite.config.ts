import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'LowcodeEditor',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'antd', '@monaco-editor/react', '@lowcode-platform/renderer', '@lowcode-platform/components'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          antd: 'antd',
          '@monaco-editor/react': 'MonacoEditor',
          '@lowcode-platform/renderer': 'LowcodeRenderer',
          '@lowcode-platform/components': 'LowcodeComponents',
        },
      },
    },
  },
});
