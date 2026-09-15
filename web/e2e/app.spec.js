import { expect, test } from "@playwright/test";

test.describe("卷材缺陷避让裁切规划（真实 API 联调）", () => {
  test("空缺陷列表生成覆盖全长的一个可裁段", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("卷长（毫米）").fill("1000");
    await page.getByRole("button", { name: "计算裁切方案" }).click();

    const rows = page.getByTestId("segment-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("0");
    await expect(rows.first()).toContainText("1000");
    await expect(rows.first()).toContainText("可裁段");
    await expect(page.getByTestId("summary")).toContainText("可裁段 1 段 / 1000 mm");
  });

  test("缺陷扩张合并后按比例绘制 SVG 并列出全部区段", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("卷长（毫米）").fill("1000");
    await page.getByRole("button", { name: "添加缺陷" }).click();
    await page.getByLabel("第 1 行起点").fill("100");
    await page.getByLabel("第 1 行终点").fill("150");
    await page.getByRole("button", { name: "添加缺陷" }).click();
    await page.getByLabel("第 2 行起点").fill("300");
    await page.getByLabel("第 2 行终点").fill("320");
    await page.getByRole("button", { name: "计算裁切方案" }).click();

    // 服务端计算：[85,165]、[285,335] → 补集 [0,85] [165,285] [335,1000]
    const rows = page.getByTestId("segment-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("废边");
    await expect(rows.nth(1)).toContainText("废边");
    await expect(rows.nth(2)).toContainText("可裁段");

    const cells = page.getByTestId("segment-row").locator("td");
    await expect(cells.nth(1)).toHaveText("0");
    await expect(cells.nth(2)).toHaveText("85");
    await expect(cells.nth(3)).toHaveText("85");
    await expect(cells.nth(6)).toHaveText("165");
    await expect(cells.nth(7)).toHaveText("285");
    await expect(cells.nth(8)).toHaveText("120");
    await expect(cells.nth(11)).toHaveText("335");
    await expect(cells.nth(12)).toHaveText("1000");
    await expect(cells.nth(13)).toHaveText("665");

    // SVG 与明细来自同一份结果：宽度与长度成比例（scale = 1）
    const rects = page.getByTestId("segment-rect");
    await expect(rects).toHaveCount(3);
    await expect(rects.nth(0)).toHaveAttribute("width", "85");
    await expect(rects.nth(1)).toHaveAttribute("width", "120");
    await expect(rects.nth(2)).toHaveAttribute("width", "665");
    await expect(page.getByTestId("defect-rect")).toHaveCount(2);
  });

  test("倒置缺陷行整批拒绝：展示首个问题行并清除旧结果", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("卷长（毫米）").fill("1000");
    await page.getByRole("button", { name: "计算裁切方案" }).click();
    await expect(page.getByTestId("segment-row")).toHaveCount(1);

    await page.getByRole("button", { name: "添加缺陷" }).click();
    await page.getByLabel("第 1 行起点").fill("500");
    await page.getByLabel("第 1 行终点").fill("100");
    await page.getByRole("button", { name: "计算裁切方案" }).click();

    await expect(page.getByRole("alert")).toContainText("第 1 行缺陷");
    await expect(page.getByTestId("segment-row")).toHaveCount(0);
    await expect(page.getByTestId("roll-bar")).toHaveCount(0);
  });

  test("非整数输入被服务端拒绝并提示", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("卷长（毫米）").fill("1000");
    await page.getByRole("button", { name: "添加缺陷" }).click();
    await page.getByLabel("第 1 行起点").fill("abc");
    await page.getByLabel("第 1 行终点").fill("200");
    await page.getByRole("button", { name: "计算裁切方案" }).click();

    await expect(page.getByRole("alert")).toContainText("第 1 行缺陷");
    await expect(page.getByRole("alert")).toContainText("整数");
  });

  test("越界终点被拒绝，且首个问题行为实际出错行", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("卷长（毫米）").fill("1000");
    await page.getByRole("button", { name: "添加缺陷" }).click();
    await page.getByLabel("第 1 行起点").fill("10");
    await page.getByLabel("第 1 行终点").fill("20");
    await page.getByRole("button", { name: "添加缺陷" }).click();
    await page.getByLabel("第 2 行起点").fill("30");
    await page.getByLabel("第 2 行终点").fill("2000");
    await page.getByRole("button", { name: "计算裁切方案" }).click();

    await expect(page.getByRole("alert")).toContainText("第 2 行缺陷");
    await expect(page.getByRole("alert")).toContainText("卷长 1000");
    await expect(page.getByTestId("segment-row")).toHaveCount(0);
  });

  test("卷长越界被拒绝", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("卷长（毫米）").fill("100001");
    await page.getByRole("button", { name: "计算裁切方案" }).click();
    await expect(page.getByRole("alert")).toContainText("卷长");
  });

  test("非对称缺陷调头后坐标与展示顺序精确翻转，切回原向恢复原结果", async ({
    page,
  }) => {
    // 记录发往 /api/plan 的请求体，核对同一卷长/缺陷与 feed_direction
    const planRequests = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/plan")) {
        planRequests.push(JSON.parse(request.postData()));
      }
    });

    await page.goto("/");
    await page.getByLabel("卷长（毫米）").fill("1000");
    await page.getByRole("button", { name: "添加缺陷" }).click();
    await page.getByLabel("第 1 行起点").fill("100");
    await page.getByLabel("第 1 行终点").fill("150");
    await page.getByRole("button", { name: "添加缺陷" }).click();
    await page.getByLabel("第 2 行起点").fill("300");
    await page.getByLabel("第 2 行终点").fill("320");
    await page.getByRole("button", { name: "计算裁切方案" }).click();

    // 原向：[0,85] 废、[165,285] 废、[335,1000] 可裁
    let rows = page.getByTestId("segment-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toContainText("可裁段");
    await expect(page.getByTestId("roll-bar")).toHaveAttribute(
      "data-direction",
      "original"
    );
    await expect(page.getByTestId("feed-end-label")).toContainText("卷材头");
    await expect(page.getByTestId("tail-end-label")).toContainText("卷材尾");

    // 切到调头：携带同一卷长与同一份缺陷重新请求
    await page.getByTestId("direction-reversed").click();

    rows = page.getByTestId("segment-row");
    await expect(rows).toHaveCount(3);
    // 展示顺序整体翻转：可裁段从卷尾转到进料端卷首
    await expect(rows.nth(0)).toContainText("可裁段");
    await expect(rows.nth(1)).toContainText("废边");
    await expect(rows.nth(2)).toContainText("废边");

    const cells = page.getByTestId("segment-row").locator("td");
    // [0,665] 可裁
    await expect(cells.nth(1)).toHaveText("0");
    await expect(cells.nth(2)).toHaveText("665");
    await expect(cells.nth(3)).toHaveText("665");
    // [715,835] 废（原 [165,285] 镜像）
    await expect(cells.nth(6)).toHaveText("715");
    await expect(cells.nth(7)).toHaveText("835");
    await expect(cells.nth(8)).toHaveText("120");
    // [915,1000] 废（原 [0,85] 镜像）
    await expect(cells.nth(11)).toHaveText("915");
    await expect(cells.nth(12)).toHaveText("1000");
    await expect(cells.nth(13)).toHaveText("85");

    // SVG 按调头坐标重绘（scale=1）：缺陷避让区位于进料端对侧
    const rects = page.getByTestId("segment-rect");
    await expect(rects.nth(0)).toHaveAttribute("x", "0");
    await expect(rects.nth(0)).toHaveAttribute("width", "665");
    await expect(rects.nth(1)).toHaveAttribute("x", "715");
    await expect(rects.nth(2)).toHaveAttribute("x", "915");
    const defectRects = page.getByTestId("defect-rect");
    await expect(defectRects.nth(0)).toHaveAttribute("x", "665");
    await expect(defectRects.nth(1)).toHaveAttribute("x", "835");

    // 首尾方向标识同步翻转
    await expect(page.getByTestId("roll-bar")).toHaveAttribute(
      "data-direction",
      "reversed"
    );
    await expect(page.getByTestId("feed-end-label")).toContainText("卷材尾");
    await expect(page.getByTestId("tail-end-label")).toContainText("卷材头");

    // 长度、类别与汇总值不变
    await expect(page.getByTestId("summary")).toContainText("可裁段 1 段 / 665 mm");
    await expect(page.getByTestId("summary")).toContainText("废边 2 段 / 205 mm");

    // 第二次请求仅方向变为 reversed，卷长与缺陷不变
    expect(planRequests[1]).toEqual({
      roll_length: "1000",
      defects: [
        { start: "100", end: "150" },
        { start: "300", end: "320" },
      ],
      feed_direction: "reversed",
    });
    expect(planRequests[1].defects).toEqual(planRequests[0].defects);
    expect(planRequests[1].roll_length).toBe(planRequests[0].roll_length);

    // 切回原向：恢复原结果
    await page.getByTestId("direction-original").click();
    rows = page.getByTestId("segment-row");
    await expect(rows.nth(0)).toContainText("废边");
    const restoredCells = page.getByTestId("segment-row").locator("td");
    await expect(restoredCells.nth(1)).toHaveText("0");
    await expect(restoredCells.nth(2)).toHaveText("85");
    await expect(restoredCells.nth(11)).toHaveText("335");
    await expect(restoredCells.nth(12)).toHaveText("1000");
    await expect(page.getByTestId("roll-bar")).toHaveAttribute(
      "data-direction",
      "original"
    );
    expect(planRequests[2].feed_direction).toBe("original");
  });

  test("非法 feed_direction 返回字段明确的 422，省略字段时分类边界不回归", async ({
    request,
  }) => {
    const bad = await request.post("/api/plan", {
      data: {
        roll_length: 1000,
        defects: [{ start: 100, end: 150 }],
        feed_direction: "sideways",
      },
    });
    expect(bad.status()).toBe(422);
    const detail = (await bad.json()).detail;
    expect(detail.code).toBe("invalid_input");
    expect(detail.field).toBe("feed_direction");
    expect(detail.row).toBeNull();
    expect(detail.message).toBeTruthy();
    expect(detail.message).toContain("reversed");

    // 省略 feed_direction 的旧客户端：199mm 仍为废边
    const waste = await request.post("/api/plan", {
      data: {
        roll_length: 1000,
        defects: [
          { start: 100, end: 110 },
          { start: 339, end: 349 },
        ],
      },
    });
    expect(waste.status()).toBe(200);
    const wasteBody = await waste.json();
    expect(wasteBody.feed_direction).toBe("original");
    expect(wasteBody.segments[1]).toMatchObject({
      start: 125,
      end: 324,
      length: 199,
      category: "waste",
    });

    // 200mm 仍为可裁段
    const cuttable = await request.post("/api/plan", {
      data: {
        roll_length: 1000,
        defects: [
          { start: 100, end: 110 },
          { start: 340, end: 350 },
        ],
      },
    });
    const cuttableBody = await cuttable.json();
    expect(cuttableBody.segments[1]).toMatchObject({
      start: 125,
      end: 325,
      length: 200,
      category: "cuttable",
    });
  });
});
