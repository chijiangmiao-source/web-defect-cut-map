const CATEGORY_LABELS = {
  cuttable: "可裁段",
  waste: "废边",
};

export default function SegmentTable({ segments }) {
  if (segments.length === 0) {
    return (
      <p className="empty-hint" data-testid="no-segments">
        整卷均被缺陷避让区覆盖，无可裁区段。
      </p>
    );
  }
  return (
    <table className="segment-table" data-testid="segment-table">
      <thead>
        <tr>
          <th>序号</th>
          <th>起点 (mm)</th>
          <th>终点 (mm)</th>
          <th>长度 (mm)</th>
          <th>类别</th>
        </tr>
      </thead>
      <tbody>
        {segments.map((s, i) => (
          <tr key={i} data-testid="segment-row" data-category={s.category}>
            <td>{i + 1}</td>
            <td>{s.start}</td>
            <td>{s.end}</td>
            <td>{s.length}</td>
            <td className={`category ${s.category}`}>
              {CATEGORY_LABELS[s.category]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
