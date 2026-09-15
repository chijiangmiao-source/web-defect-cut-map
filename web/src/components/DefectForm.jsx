export default function DefectForm({
  rollLength,
  onRollLengthChange,
  defects,
  onDefectsChange,
  errorRow,
  submitting,
  onSubmit,
}) {
  function updateRow(index, field, value) {
    onDefectsChange(
      defects.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function addRow() {
    onDefectsChange([...defects, { start: "", end: "" }]);
  }

  function removeRow(index) {
    onDefectsChange(defects.filter((_, i) => i !== index));
  }

  return (
    <form className="defect-form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="roll-length">卷长（毫米）</label>
        <input
          id="roll-length"
          type="text"
          inputMode="numeric"
          value={rollLength}
          onChange={(e) => onRollLengthChange(e.target.value)}
        />
        <span className="range-hint">1 ~ 100000 的整数</span>
      </div>

      <fieldset className="defects">
        <legend>缺陷记录（{defects.length} 条）</legend>
        {defects.length === 0 && (
          <p className="empty-hint">暂无缺陷，整卷将生成一个区段。</p>
        )}
        {defects.map((row, index) => (
          <div
            key={index}
            className={
              errorRow === index + 1 ? "defect-row invalid" : "defect-row"
            }
            data-testid={`defect-row-${index + 1}`}
          >
            <span className="row-index">第 {index + 1} 行</span>
            <label>
              起点
              <input
                type="text"
                inputMode="numeric"
                aria-label={`第 ${index + 1} 行起点`}
                value={row.start}
                onChange={(e) => updateRow(index, "start", e.target.value)}
              />
            </label>
            <label>
              终点
              <input
                type="text"
                inputMode="numeric"
                aria-label={`第 ${index + 1} 行终点`}
                value={row.end}
                onChange={(e) => updateRow(index, "end", e.target.value)}
              />
            </label>
            <button
              type="button"
              className="remove"
              onClick={() => removeRow(index)}
            >
              删除
            </button>
          </div>
        ))}
        <button type="button" className="add" onClick={addRow}>
          添加缺陷
        </button>
      </fieldset>

      <button type="submit" className="submit" disabled={submitting}>
        {submitting ? "计算中…" : "计算裁切方案"}
      </button>
    </form>
  );
}
