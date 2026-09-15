"""避让裁切核心算法。

规则（与 README 一致）：
1. 每条缺陷 [start, end] 向左右各扩张 EXPAND_MM 毫米，并截断至 [0, roll_length]；
2. 扩张后的闭区间按起点升序合并：相交、包含或端点相接（next.start <= 当前.end）即合并；
3. 在 [0, roll_length] 内对合并结果求补集，得到候选区段；
4. 区段长度 = 终点 - 起点，不足 MIN_CUTTABLE_MM 毫米归为废边，其余归为可裁段。
"""

EXPAND_MM = 15
MIN_CUTTABLE_MM = 200

CATEGORY_CUTTABLE = "cuttable"  # 可裁段
CATEGORY_WASTE = "waste"  # 废边


def expand_defects(defects, roll_length):
    """每条缺陷向左右扩张 15mm 并截断至卷材边界，返回 [(start, end), ...]。"""
    return [
        (max(0, start - EXPAND_MM), min(roll_length, end + EXPAND_MM))
        for start, end in defects
    ]


def merge_intervals(intervals):
    """按坐标升序合并相交、包含或端点相接的闭区间。"""
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            if end > merged[-1][1]:
                merged[-1][1] = end
        else:
            merged.append([start, end])
    return [tuple(interval) for interval in merged]


def complement_intervals(merged, roll_length):
    """在 [0, roll_length] 内求合并缺陷区间的补集。"""
    segments = []
    cursor = 0
    for start, end in merged:
        if start > cursor:
            segments.append((cursor, start))
        if end > cursor:
            cursor = end
    if cursor < roll_length:
        segments.append((cursor, roll_length))
    return segments


def classify(start, end):
    """长度不足 200mm 为废边，否则为可裁段。"""
    return CATEGORY_CUTTABLE if end - start >= MIN_CUTTABLE_MM else CATEGORY_WASTE


def build_plan(roll_length, defects):
    """由卷长与缺陷列表生成完整避让裁切方案。"""
    expanded = expand_defects(defects, roll_length)
    merged = merge_intervals(expanded)
    segments = [
        {
            "start": start,
            "end": end,
            "length": end - start,
            "category": classify(start, end),
        }
        for start, end in complement_intervals(merged, roll_length)
    ]
    cuttable = [s for s in segments if s["category"] == CATEGORY_CUTTABLE]
    waste = [s for s in segments if s["category"] == CATEGORY_WASTE]
    return {
        "roll_length": roll_length,
        "expand_mm": EXPAND_MM,
        "min_cuttable_mm": MIN_CUTTABLE_MM,
        "expanded_defects": [{"start": s, "end": e} for s, e in expanded],
        "merged_defects": [{"start": s, "end": e} for s, e in merged],
        "segments": segments,
        "summary": {
            "segment_count": len(segments),
            "cuttable_count": len(cuttable),
            "waste_count": len(waste),
            "cuttable_length": sum(s["length"] for s in cuttable),
            "waste_length": sum(s["length"] for s in waste),
        },
    }
