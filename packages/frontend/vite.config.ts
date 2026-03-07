import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      include: ["src/**/*.ts", "src/**/*.tsx"],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "LowcodeFrontend",
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "antd",
        "@ant-design/icons",
        "@monaco-editor/react",
        "redux",
        "react-redux",
        "zustand",
        "jsep",
        "@jsep-plugin/new",
        "zod",
        "idb-keyval",
        "lucide-react",
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
          antd: "antd",
          "@ant-design/icons": "AntDesignIcons",
          "@monaco-editor/react": "MonacoEditor",
          redux: "Redux",
          "react-redux": "ReactRedux",
          zustand: "Zustand",
          jsep: "Jsep",
          "@jsep-plugin/new": "JsepNew",
          zod: "Zod",
          "idb-keyval": "IdbKeyval",
          "lucide-react": "LucideReact",
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "style.css") {
            return "style.css";
          }
          return assetInfo.name || "asset";
        },
      },
    },
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});