import { defineConfig } from "@playwright/test";

// 默认假设 Docker Compose 栈已启动（WEB_PORT=8080）；
// 设置 E2E_BASE_URL 可指向任意已运行的部署。
// 若设置 E2E_LOCAL=1，则本地拉起 uvicorn + vite dev 进行真实联调。
const baseURL = process.env.E2E_BASE_URL || "http://localhost:8080";
const localServers = process.env.E2E_LOCAL
  ? [
      {
        command: "python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000",
        cwd: "../api",
        port: 8000,
        reuseExistingServer: true,
      },
      {
        command: "npm run dev -- --port 8080 --strictPort",
        port: 8080,
        reuseExistingServer: true,
      },
    ]
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: { baseURL },
  webServer: localServers,
});
