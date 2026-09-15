const OPTIONS = [
  { value: "original", label: "原向" },
  { value: "reversed", label: "调头" },
];

/**
 * 结果区的“原向 / 调头”切换。默认原向；选择调头时由 App 携带同一份
 * 卷长与缺陷重新请求，坐标以机台进料端为准整体镜像。
 */
export default function DirectionSwitch({ value, disabled, onChange }) {
  return (
    <div
      className="direction-switch"
      role="group"
      aria-label="进料方向切换"
      data-testid="direction-switch"
    >
      {OPTIONS.map((option) => (
        <label
          key={option.value}
          className={
            value === option.value ? "dir-option active" : "dir-option"
          }
        >
          <input
            type="radio"
            name="feed-direction"
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            data-testid={`direction-${option.value}`}
          />
          {option.label}
        </label>
      ))}
      <span className="dir-hint" data-testid="direction-hint">
        {value === "reversed"
          ? "机台进料端坐标（卷材调头）"
          : "卷材原向坐标"}
      </span>
    </div>
  );
}
