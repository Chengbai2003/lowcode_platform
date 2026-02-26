import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "Compiler",
      fileName: "index",
    },
    rollupOptions: {
      external: ["react", "react-dom", "antd", "@babel/types", "@babel/generator"],
      output: {
        globals: {
          "@babel/types": "babelTypes",
          "@babel/generator": "generate"
        }
      }
    },
  },
  plugins: [dts()],
});
