/**
 * 调用真实 FastAPI 接口。表单中的原始字符串原样提交，
 * 整数解析与边界校验全部在服务端完成。
 */
export async function fetchPlan(rollLength, defects) {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roll_length: rollLength,
      defects: defects.map((d) => ({ start: d.start, end: d.end })),
    }),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const detail = data && data.detail ? data.detail : null;
    const error = new Error(
      (detail && detail.message) || `请求失败（HTTP ${response.status}）`
    );
    error.detail = detail;
    throw error;
  }
  return data;
}
