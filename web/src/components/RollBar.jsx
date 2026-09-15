const VIEWBOX_WIDTH = 1000;
const COLORS = {
  cuttable: "#2e9e5b",
  waste: "#9aa0a6",
  defect: "#c0392b",
};

/**
 * 按比例绘制卷材条：上层为合并后的缺陷避让区，下层为裁切区段。
 * 所有坐标均来自同一份 API 结果，保证图形与明细表一致。
 * feed_direction 为 reversed 时，坐标以机台进料端为准整体镜像：
 * 左端始终是进料端（坐标 0），而卷材首/尾标识随之对调。
 */
export default function RollBar({ plan }) {
  const scale = VIEWBOX_WIDTH / plan.roll_length;
  const reversed = plan.feed_direction === "reversed";
  // 原向：进料端即卷材头；调头：卷材尾先进机台
  const leftHeadLabel = reversed ? "进料端 · 卷材尾" : "进料端 · 卷材头";
  const rightHeadLabel = reversed ? "卷材头" : "卷材尾";
  return (
    <figure className="roll-bar">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} 96`}
        role="img"
        aria-label={
          reversed ? "卷材区段比例图（调头坐标）" : "卷材区段比例图"
        }
        data-testid="roll-bar"
        data-direction={plan.feed_direction || "original"}
      >
        <line x1="0" y1="6" x2={VIEWBOX_WIDTH} y2="6" stroke="#666" />
        <text x="0" y="20" fontSize="12" fill="#333">
          0
        </text>
        <text x={VIEWBOX_WIDTH} y="20" fontSize="12" fill="#333" textAnchor="end">
          {plan.roll_length} mm
        </text>
        <text
          x="0"
          y="34"
          fontSize="11"
          fill="#1e5a8a"
          data-testid="feed-end-label"
        >
          ◂ {leftHeadLabel}
        </text>
        <text
          x={VIEWBOX_WIDTH}
          y="34"
          fontSize="11"
          fill="#1e5a8a"
          textAnchor="end"
          data-testid="tail-end-label"
        >
          {rightHeadLabel} ▸
        </text>

        {plan.merged_defects.map((d, i) => (
          <rect
            key={`defect-${i}`}
            data-testid="defect-rect"
            x={d.start * scale}
            y={42}
            width={(d.end - d.start) * scale}
            height={12}
            fill={COLORS.defect}
          />
        ))}

        {plan.segments.map((s, i) => (
          <rect
            key={`segment-${i}`}
            data-testid="segment-rect"
            data-start={s.start}
            data-end={s.end}
            data-category={s.category}
            x={s.start * scale}
            y={60}
            width={s.length * scale}
            height={26}
            fill={COLORS[s.category]}
            stroke="#2c3e50"
            strokeWidth="0.5"
          />
        ))}
      </svg>
      <figcaption className="legend">
        <span className="legend-item">
          <i style={{ background: COLORS.cuttable }} /> 可裁段
        </span>
        <span className="legend-item">
          <i style={{ background: COLORS.waste }} /> 废边
        </span>
        <span className="legend-item">
          <i style={{ background: COLORS.defect }} /> 缺陷避让区（含两侧各 15mm）
        </span>
      </figcaption>
    </figure>
  );
}
