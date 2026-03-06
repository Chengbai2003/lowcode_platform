import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/__tests__/**",
      ],
    },
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    exclude: ["node_modules", "dist"],
  },
  resolve: {
    alias: {
      "@lowcode-platform/components": path.resolve(
        __dirname,
        "../components/src",
      ),
      "@lowcode-platform/renderer": path.resolve(__dirname, "../renderer/src"),
    },
  },
});
