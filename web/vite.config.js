import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = `http://localhost:${process.env.API_PORT || 8000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 本地开发时将 /api 转发给真实 FastAPI 服务
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.js",
    exclude: ["e2e/**", "node_modules/**"],
  },
});
