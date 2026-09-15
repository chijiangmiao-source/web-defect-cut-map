import { useRef, useState } from "react";
import { fetchPlan } from "./api";
import DefectForm from "./components/DefectForm";
import DirectionSwitch from "./components/DirectionSwitch";
import RollBar from "./components/RollBar";
import SegmentTable from "./components/SegmentTable";

function describeErrorTarget(error) {
  if (error.row != null) return `第 ${error.row} 行缺陷`;
  if (error.field === "feed_direction") return "进料方向";
  return "卷长";
}

export default function App() {
  const [rollLength, setRollLength] = useState("1000");
  const [defects, setDefects] = useState([]);
  const [direction, setDirection] = useState("original");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // 单调递增的请求序号：切换方向时忽略较早返回的过期响应
  const requestSeq = useRef(0);

  async function requestPlan(nextDirection) {
    const seq = ++requestSeq.current;
    setSubmitting(true);
    try {
      const plan = await fetchPlan(rollLength, defects, nextDirection);
      if (seq !== requestSeq.current) return;
      setResult(plan);
      setDirection(plan.feed_direction || nextDirection);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      // 整批被拒绝：清除旧结果，展示问题
      const detail =
        err.detail || { row: null, field: null, message: err.message };
      setResult(null);
      setError(detail);
      if (detail.field === "feed_direction") {
        // 方向不受支持：单选回到合法的原向，等待重新选择
        setDirection("original");
      }
    } finally {
      if (seq === requestSeq.current) setSubmitting(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    requestPlan(direction);
  }

  function handleDirectionChange(nextDirection) {
    if (nextDirection === direction || submitting) return;
    // 携带同一卷长、同一份缺陷与新 feed_direction 重新请求
    requestPlan(nextDirection);
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
          {error.field === "feed_direction"
            ? `${error.message}，请重新选择进料方向`
            : `${describeErrorTarget(error)}：${error.message}`}
        </div>
      )}

      {(result || error?.field === "feed_direction") && (
        <section className="result" data-testid="result">
          <h2>裁切方案</h2>
          <DirectionSwitch
            value={direction}
            disabled={submitting}
            onChange={handleDirectionChange}
          />
          {result && (
            <>
              <RollBar plan={result} />
              <p className="summary" data-testid="summary">
                {direction === "reversed" ? "调头（机台进料端）坐标 · " : ""}
                共 {result.summary.segment_count} 段：可裁段{" "}
                {result.summary.cuttable_count} 段 /{" "}
                {result.summary.cuttable_length} mm，废边{" "}
                {result.summary.waste_count} 段 / {result.summary.waste_length}{" "}
                mm
              </p>
              <SegmentTable segments={result.segments} />
            </>
          )}
        </section>
      )}
    </main>
  );
}
