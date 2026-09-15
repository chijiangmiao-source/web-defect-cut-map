# 卷材缺陷避让裁切规划

柔性包装卷材上机前，分切机准备员在页面录入卷长与缺陷记录，服务端把可能重叠的
缺陷转换为唯一可核对的避让裁切图：前端（React）与 API（FastAPI）真实联调，
图形与明细来自同一份接口结果，无任何固定响应或占位计算。

## 输入规则

- **卷长**：1 至 100000 的整数（毫米）。
- **缺陷列表**：零条或多条，每条含起点、终点，均为整数且满足
  `0 ≤ 起点 < 终点 ≤ 卷长`。空列表合法，生成覆盖全长的一个区段。
- 表单中的原始输入（含字符串）原样提交，整数解析与全部校验在服务端完成。
- **整批拒绝**：任一行含非整数、倒置（起点 ≥ 终点）或越界值时，整批不予计算，
  接口返回 422 与**首个问题行**（行号从 1 开始），前端展示该错误、高亮问题行
  并清除旧结果。

## 计算规则（服务端）

1. 每条缺陷 `[start, end]` 向左右各扩张 **15mm**，并截断至卷材边界 `[0, 卷长]`；
2. 扩张后的闭区间按坐标升序合并：**相交、包含或端点相接**（下一区间起点 ≤
   当前合并区间终点）即合并；
3. 在 `[0, 卷长]` 内对合并结果求**补集**，得到候选区段；
4. 区段长度 = 终点 − 起点；长度 **< 200mm 归为废边**，**≥ 200mm 归为可裁段**
   （分类规则对所有补集区段一致适用；卷长 ≥ 200 时空缺陷列表即得到覆盖全长的
   一个可裁段）。

接口同时返回扩张后缺陷、合并后缺陷与区段明细，前端按比例 SVG 卷材条与区段
表格均直接渲染该结果，保证图形与明细一致。

## 真实接口

### `POST /api/plan`

请求体（数字或纯数字字符串均可）：

```json
{
  "roll_length": 1000,
  "defects": [{ "start": 100, "end": 150 }, { "start": 300, "end": 320 }]
}
```

200 响应：

```json
{
  "roll_length": 1000,
  "expand_mm": 15,
  "min_cuttable_mm": 200,
  "expanded_defects": [{ "start": 85, "end": 165 }, { "start": 285, "end": 335 }],
  "merged_defects": [{ "start": 85, "end": 165 }, { "start": 285, "end": 335 }],
  "segments": [
    { "start": 0, "end": 85, "length": 85, "category": "waste" },
    { "start": 165, "end": 285, "length": 120, "category": "waste" },
    { "start": 335, "end": 1000, "length": 665, "category": "cuttable" }
  ],
  "summary": {
    "segment_count": 3,
    "cuttable_count": 1,
    "waste_count": 2,
    "cuttable_length": 665,
    "waste_length": 205
  }
}
```

422 响应（整批拒绝，`row` 为首个问题行号，卷长问题时为 `null`）：

```json
{
  "detail": {
    "code": "invalid_input",
    "row": 2,
    "field": "end",
    "message": "终点不能超过卷长 1000，收到 2000"
  }
}
```

### `GET /api/health`

返回 `{"status": "ok"}`，用于 api 容器健康检查。前端容器另有
`GET /__health`（nginx 直接返回 200，不依赖静态文件与代理），用于 web
服务健康检查。

## 架构与启动（Docker Compose）

```
浏览器 ──► web（nginx：静态资源 + /api 反向代理）──► api（FastAPI/uvicorn）
verify（一次性容器）：对真实 api 与 web 代理执行验收断言后退出
```

```bash
# 启动前端与 API（默认 Web http://localhost:8080，API http://localhost:8000）
docker compose up --build

# 等待接口与页面均健康后再返回（常用于脚本 / CI）
docker compose up --build --wait

# 覆盖宿主端口
WEB_PORT=9000 API_PORT=9001 docker compose up --build
```

- `WEB_PORT`：前端页面宿主端口（默认 8080），浏览器只需访问此端口，
  `/api` 由 nginx 代理至 API 容器；
- `API_PORT`：API 宿主端口（默认 8000），供直接调用接口或调试。

> 默认启动只包含 `api` 与 `web` 两个常驻服务，均带健康检查，`--wait`
> 会等到接口与页面都健康。`verify` 是一次性容器，执行完即退出——若纳入
> 默认启动，`up --wait` 会把这个已退出的容器误判为整套服务启动失败，
> 因此它通过 `profiles: ["verify"]` 隔离，仅在验收时显式启动。

## 验收

```bash
# 一次性验收：启动 api、web 与 verify，verify 全部断言通过后退出码为 0
docker compose --profile verify up --build --exit-code-from verify verify

# 或在栈已运行时单独执行一次验收
docker compose run --rm verify
```

verify 服务对真实运行的服务断言：空缺陷列表、15mm 扩张与边界截断、
相交/包含/端点相接合并、补集分类（199mm 废边 / 200mm 可裁段）、卷长边界
1 与 100000、整批拒绝与首个问题行、非整数与越界输入，以及前端 nginx 代理
与直连 API 结果一致。

## 测试

```bash
# 后端：pytest（58 例，算法单元 + 接口边界）
cd api
pip install -r requirements-dev.txt
python -m pytest tests/ -q

# 前端：Vitest（8 例，组件渲染、比例 SVG、错误清除）
cd web
npm install
npm test

# 端到端：Playwright（6 例，真实浏览器 + 真实 API）
# 方式一：Compose 栈已启动（默认打 http://localhost:8080）
docker compose up -d --build
cd web && npx playwright install chromium && npm run e2e
# 方式二：本地进程联调（自动拉起 uvicorn 与 vite dev）
cd web && E2E_LOCAL=1 npm run e2e
# 指向其它部署：E2E_BASE_URL=http://host:port npm run e2e
```

## 本地开发

```bash
cd api && pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload --port 8000

cd web && npm install && npm run dev   # http://localhost:5173，/api 代理至 8000
```

## 目录结构

```
├── docker-compose.yml      # web / api / verify 编排，WEB_PORT、API_PORT 可覆盖
├── api/                    # FastAPI：校验 + 扩张/合并/补集/分类
│   ├── app/{main,planner}.py
│   └── tests/              # pytest
├── web/                    # React + Vite：表单、比例 SVG、区段明细
│   ├── src/__tests__/      # Vitest
│   └── e2e/                # Playwright
└── verify/                 # 一次性验收服务（真实 HTTP 断言）
```
