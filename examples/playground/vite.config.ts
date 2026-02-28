import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  return {
    plugins: [react()],
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode || "development"),
      // 将 API_SECRET 暴露给前端（仅用于开发环境）
      "process.env.VITE_API_SECRET": JSON.stringify(
        env.VITE_API_SECRET || "dev-secret-token-change-in-production",
      ),
    },
    server: {
      port: 3000,
      open: true,
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
        },
      },
    },
  };
});
