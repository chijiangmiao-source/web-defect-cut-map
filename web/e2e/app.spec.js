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
});
