import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/tests/**',
      ],
    },
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./__tests__/setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@lowcode-platform/renderer': './src',
    },
  },
});
