import { useState } from "react";
import { fetchPlan } from "./api";
import DefectForm from "./components/DefectForm";
import RollBar from "./components/RollBar";
import SegmentTable from "./components/SegmentTable";

export default function App() {
  const [rollLength, setRollLength] = useState("1000");
  const [defects, setDefects] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const plan = await fetchPlan(rollLength, defects);
      setResult(plan);
      setError(null);
    } catch (err) {
      // 整批被拒绝：清除旧结果，展示首个问题行
      setResult(null);
      setError(err.detail || { row: null, field: null, message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>卷材缺陷避让裁切规划</h1>
      <p className="hint">
        卷长与缺陷坐标均为毫米整数。缺陷将向左右各扩张 15mm
        后合并，补集中不足 200mm 的区段记为废边，其余为可裁段。
      </p>

      <DefectForm
        rollLength={rollLength}
        onRollLengthChange={setRollLength}
        defects={defects}
        onDefectsChange={setDefects}
        errorRow={error && error.row}
        submitting={submitting}
        onSubmit={handleSubmit}
      />

      {error && (
        <div role="alert" className="error-banner" data-testid="error-banner">
          {error.row != null ? `第 ${error.row} 行缺陷` : "卷长"}：{error.message}
        </div>
      )}

      {result && (
        <section className="result" data-testid="result">
          <h2>裁切方案</h2>
          <RollBar plan={result} />
          <p className="summary" data-testid="summary">
            共 {result.summary.segment_count} 段：可裁段{" "}
            {result.summary.cuttable_count} 段 /{" "}
            {result.summary.cuttable_length} mm，废边{" "}
            {result.summary.waste_count} 段 / {result.summary.waste_length} mm
          </p>
          <SegmentTable segments={result.segments} />
        </section>
      )}
    </main>
  );
}
