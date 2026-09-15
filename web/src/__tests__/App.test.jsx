import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

function mockFetchResponse(payload, { ok = true, status = 200 } = {}) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
}

const PLAN_EMPTY = {
  roll_length: 1000,
  feed_direction: "original",
  expand_mm: 15,
  min_cuttable_mm: 200,
  expanded_defects: [],
  merged_defects: [],
  segments: [{ start: 0, end: 1000, length: 1000, category: "cuttable" }],
  summary: {
    segment_count: 1,
    cuttable_count: 1,
    waste_count: 0,
    cuttable_length: 1000,
    waste_length: 0,
  },
};

const PLAN_WITH_DEFECT = {
  roll_length: 1000,
  feed_direction: "original",
  expand_mm: 15,
  min_cuttable_mm: 200,
  expanded_defects: [{ start: 85, end: 165 }],
  merged_defects: [{ start: 85, end: 165 }],
  segments: [
    { start: 0, end: 85, length: 85, category: "waste" },
    { start: 165, end: 1000, length: 835, category: "cuttable" },
  ],
  summary: {
    segment_count: 2,
    cuttable_count: 1,
    waste_count: 1,
    cuttable_length: 835,
    waste_length: 85,
  },
};

const PLAN_REVERSED = {
  roll_length: 1000,
  feed_direction: "reversed",
  expand_mm: 15,
  min_cuttable_mm: 200,
  expanded_defects: [{ start: 835, end: 915 }],
  merged_defects: [{ start: 835, end: 915 }],
  segments: [
    { start: 0, end: 835, length: 835, category: "cuttable" },
    { start: 915, end: 1000, length: 85, category: "waste" },
  ],
  summary: {
    segment_count: 2,
    cuttable_count: 1,
    waste_count: 1,
    cuttable_length: 835,
    waste_length: 85,
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("空缺陷列表提交后渲染覆盖全长的唯一可裁段", async () => {
    vi.stubGlobal("fetch", mockFetchResponse(PLAN_EMPTY));
    render(<App />);

    fireEvent.change(screen.getByLabelText("卷长（毫米）"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "计算裁切方案" }));

    const rows = await screen.findAllByTestId("segment-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("0");
    expect(rows[0]).toHaveTextContent("1000");
    expect(rows[0]).toHaveTextContent("可裁段");

    const rects = screen.getAllByTestId("segment-rect");
    expect(rects).toHaveLength(1);
    expect(rects[0]).toHaveAttribute("width", "1000");
  });

  it("提交缺陷后表格与 SVG 均来自同一份 API 结果且按比例绘制", async () => {
    const fetchMock = mockFetchResponse(PLAN_WITH_DEFECT);
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.change(screen.getByLabelText("卷长（毫米）"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加缺陷" }));
    fireEvent.change(screen.getByLabelText("第 1 行起点"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("第 1 行终点"), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByRole("button", { name: "计算裁切方案" }));

    const rows = await screen.findAllByTestId("segment-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("废边");
    expect(rows[0]).toHaveTextContent("85");
    expect(rows[1]).toHaveTextContent("可裁段");
    expect(rows[1]).toHaveTextContent("835");

    // SVG 宽度与区段长度严格成比例（scale = 1000 / 卷长）
    const rects = screen.getAllByTestId("segment-rect");
    expect(rects[0]).toHaveAttribute("width", "85");
    expect(rects[1]).toHaveAttribute("width", "835");
    expect(rects[0]).toHaveAttribute("data-category", "waste");
    expect(rects[1]).toHaveAttribute("data-category", "cuttable");

    // 缺陷避让区同样按比例渲染
    const defectRects = screen.getAllByTestId("defect-rect");
    expect(defectRects).toHaveLength(1);
    expect(defectRects[0]).toHaveAttribute("x", "85");
    expect(defectRects[0]).toHaveAttribute("width", "80");

    // 原始字符串原样发往服务端校验，默认携带原向
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      roll_length: "1000",
      defects: [{ start: "100", end: "150" }],
      feed_direction: "original",
    });
  });

  it("整批被拒绝时展示首个问题行并清除旧结果", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(PLAN_EMPTY),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({
            detail: {
              code: "invalid_input",
              row: 1,
              field: "start",
              message: "起点必须小于终点，收到 start=500, end=100",
            },
          }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    // 先得到一份合法结果
    fireEvent.click(screen.getByRole("button", { name: "计算裁切方案" }));
    await screen.findByTestId("segment-table");

    // 再提交倒置的缺陷行
    fireEvent.click(screen.getByRole("button", { name: "添加缺陷" }));
    fireEvent.change(screen.getByLabelText("第 1 行起点"), {
      target: { value: "500" },
    });
    fireEvent.change(screen.getByLabelText("第 1 行终点"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "计算裁切方案" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("第 1 行缺陷");
    expect(alert).toHaveTextContent("起点必须小于终点");

    // 旧结果被清除
    expect(screen.queryByTestId("segment-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("roll-bar")).not.toBeInTheDocument();

    // 问题行高亮
    expect(screen.getByTestId("defect-row-1")).toHaveClass("invalid");
  });

  it("卷长非法时错误提示指向卷长字段", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(
        {
          detail: {
            code: "invalid_input",
            row: null,
            field: "roll_length",
            message: "卷长必须在 1 到 100000 毫米之间，收到 0",
          },
        },
        { ok: false, status: 422 }
      )
    );
    render(<App />);

    fireEvent.change(screen.getByLabelText("卷长（毫米）"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "计算裁切方案" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("卷长");
    expect(alert).toHaveTextContent("1 到 100000");
  });

  it("默认原向，切换到调头时携带同一输入请求并翻转坐标与首尾标识", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(PLAN_WITH_DEFECT),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(PLAN_REVERSED),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "计算裁切方案" }));
    await screen.findAllByTestId("segment-row");

    // 默认原向：缺陷避让区在卷首一侧，左端为卷材头
    expect(screen.getByTestId("roll-bar")).toHaveAttribute(
      "data-direction",
      "original"
    );
    expect(screen.getByTestId("feed-end-label")).toHaveTextContent("卷材头");
    expect(screen.getByTestId("tail-end-label")).toHaveTextContent("卷材尾");
    expect(screen.getByTestId("direction-original")).toBeChecked();

    // 切到调头：携带同一卷长与缺陷，仅 feed_direction 改变
    fireEvent.click(screen.getByTestId("direction-reversed"));

    const rows = await screen.findAllByTestId("segment-row");
    // 展示顺序翻转：调头后可裁段在卷首
    expect(rows[0]).toHaveTextContent("可裁段");
    expect(rows[0]).toHaveTextContent("835");
    expect(rows[1]).toHaveTextContent("废边");

    const requestBody = (index) =>
      JSON.parse(fetchMock.mock.calls[index][1].body);
    expect(requestBody(1).feed_direction).toBe("reversed");
    expect(requestBody(1).roll_length).toBe(requestBody(0).roll_length);
    expect(requestBody(1).defects).toEqual(requestBody(0).defects);

    // SVG 按调头坐标重绘，首尾标识对调
    expect(screen.getByTestId("roll-bar")).toHaveAttribute(
      "data-direction",
      "reversed"
    );
    const rects = screen.getAllByTestId("segment-rect");
    expect(rects[0]).toHaveAttribute("x", "0");
    expect(rects[0]).toHaveAttribute("width", "835");
    expect(screen.getByTestId("defect-rect")).toHaveAttribute("x", "835");
    expect(screen.getByTestId("feed-end-label")).toHaveTextContent("卷材尾");
    expect(screen.getByTestId("tail-end-label")).toHaveTextContent("卷材头");
  });

  it("从调头切回原向时恢复原结果", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(PLAN_WITH_DEFECT),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(PLAN_REVERSED),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(PLAN_WITH_DEFECT),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "计算裁切方案" }));
    await screen.findAllByTestId("segment-row");

    fireEvent.click(screen.getByTestId("direction-reversed"));
    await screen.findByText("机台进料端坐标（卷材调头）");

    fireEvent.click(screen.getByTestId("direction-original"));
    await screen.findByText("卷材原向坐标");

    // 第三次请求携带 original
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).feed_direction).toBe(
      "original"
    );
    // 恢复原向结果：废边段回到卷首
    const rows = screen.getAllByTestId("segment-row");
    expect(rows[0]).toHaveTextContent("废边");
    expect(rows[0]).toHaveTextContent("85");
    expect(screen.getByTestId("roll-bar")).toHaveAttribute(
      "data-direction",
      "original"
    );
  });

  it("方向值不受支持时清除旧图、提示重新选择并回到原向", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(PLAN_WITH_DEFECT),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({
            detail: {
              code: "invalid_input",
              row: null,
              field: "feed_direction",
              message: "进料方向仅支持 'original' / 'reversed'，收到 'sideways'",
            },
          }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "计算裁切方案" }));
    await screen.findByTestId("roll-bar");

    // 模拟用户选择后服务端判定方向非法
    fireEvent.click(screen.getByTestId("direction-reversed"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("进料方向");
    expect(alert).toHaveTextContent("请重新选择");

    // 旧图被清除
    expect(screen.queryByTestId("roll-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("segment-table")).not.toBeInTheDocument();
    // 单选回到合法的原向
    expect(screen.getByTestId("direction-original")).toBeChecked();
    expect(screen.getByTestId("direction-reversed")).not.toBeChecked();
  });
});
