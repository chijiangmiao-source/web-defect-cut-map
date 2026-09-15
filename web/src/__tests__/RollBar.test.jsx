import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RollBar from "../components/RollBar";
import SegmentTable from "../components/SegmentTable";

const PLAN = {
  roll_length: 500,
  expand_mm: 15,
  min_cuttable_mm: 200,
  expanded_defects: [{ start: 185, end: 215 }],
  merged_defects: [{ start: 185, end: 215 }],
  segments: [
    { start: 0, end: 185, length: 185, category: "waste" },
    { start: 215, end: 500, length: 285, category: "cuttable" },
  ],
  summary: {
    segment_count: 2,
    cuttable_count: 1,
    waste_count: 1,
    cuttable_length: 285,
    waste_length: 185,
  },
};

describe("RollBar", () => {
  it("按卷长比例缩放区段与缺陷区", () => {
    render(<RollBar plan={PLAN} />);
    // scale = 1000 / 500 = 2
    const segments = screen.getAllByTestId("segment-rect");
    expect(segments[0]).toHaveAttribute("x", "0");
    expect(segments[0]).toHaveAttribute("width", "370");
    expect(segments[1]).toHaveAttribute("x", "430");
    expect(segments[1]).toHaveAttribute("width", "570");

    const defects = screen.getAllByTestId("defect-rect");
    expect(defects[0]).toHaveAttribute("x", "370");
    expect(defects[0]).toHaveAttribute("width", "60");
  });

  it("缺陷区与区段无缝衔接（图形与明细坐标一致）", () => {
    render(<RollBar plan={PLAN} />);
    const segments = screen.getAllByTestId("segment-rect");
    const defects = screen.getAllByTestId("defect-rect");
    const seg0End =
      parseFloat(segments[0].getAttribute("x")) +
      parseFloat(segments[0].getAttribute("width"));
    expect(seg0End).toBeCloseTo(parseFloat(defects[0].getAttribute("x")));
    const defectEnd =
      parseFloat(defects[0].getAttribute("x")) +
      parseFloat(defects[0].getAttribute("width"));
    expect(defectEnd).toBeCloseTo(parseFloat(segments[1].getAttribute("x")));
  });
});

describe("SegmentTable", () => {
  it("列出全部区段的坐标、长度与类别", () => {
    render(<SegmentTable segments={PLAN.segments} />);
    const rows = screen.getAllByTestId("segment-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("185");
    expect(rows[0]).toHaveTextContent("废边");
    expect(rows[1]).toHaveTextContent("285");
    expect(rows[1]).toHaveTextContent("可裁段");
  });

  it("无区段时展示整卷被覆盖提示", () => {
    render(<SegmentTable segments={[]} />);
    expect(screen.getByTestId("no-segments")).toHaveTextContent("无可裁区段");
  });
});
