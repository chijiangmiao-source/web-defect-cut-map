"""FastAPI 入口：避让裁切方案接口。

POST /api/plan  接收卷长与缺陷列表（允许数字或纯数字字符串），整批校验：
- 卷长为 1..100000 的整数；
- 每条缺陷满足 0 <= start < end <= 卷长，且均为整数；
- feed_direction 仅接受 original（原向，默认）或 reversed（调头）；
- 任一行含非整数、倒置或越界值时整批拒绝，返回 422 与首个问题行；
  feed_direction 不受支持时同样返回 422。
GET  /api/health 健康检查。
"""

import re

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .planner import FEED_DIRECTIONS, FEED_ORIGINAL, build_plan

ROLL_LENGTH_MIN = 1
ROLL_LENGTH_MAX = 100000

_INTEGER_RE = re.compile(r"-?\d+")


class InputError(ValueError):
    """单条输入校验失败，row 为 1 起始的缺陷行号，卷长问题为 None。"""

    def __init__(self, field, message, row=None):
        super().__init__(message)
        self.row = row
        self.field = field
        self.message = message


def parse_integer(value, field, row=None):
    """只接受整数或纯整数字符串，拒绝浮点、布尔、小数串与非数字串。"""
    if isinstance(value, bool):
        raise InputError(field, f"{field} 必须为整数，收到布尔值", row)
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        text = value.strip()
        if _INTEGER_RE.fullmatch(text):
            return int(text)
        raise InputError(field, f"{field} 必须为整数，收到 {value!r}", row)
    raise InputError(field, f"{field} 必须为整数，收到 {value!r}", row)


def validate_payload(payload):
    """整批校验，发现首个问题即抛出 InputError。"""
    if not isinstance(payload, dict):
        raise InputError("body", "请求体必须为 JSON 对象")
    if "roll_length" not in payload:
        raise InputError("roll_length", "缺少卷长 roll_length")
    roll_length = parse_integer(payload["roll_length"], "roll_length")
    if not ROLL_LENGTH_MIN <= roll_length <= ROLL_LENGTH_MAX:
        raise InputError(
            "roll_length",
            f"卷长必须在 {ROLL_LENGTH_MIN} 到 {ROLL_LENGTH_MAX} 毫米之间，收到 {roll_length}",
        )

    raw_defects = payload.get("defects", [])
    if not isinstance(raw_defects, list):
        raise InputError("defects", "defects 必须为数组")

    defects = []
    for index, item in enumerate(raw_defects):
        row = index + 1  # 展示给用户的行号从 1 开始
        if not isinstance(item, dict):
            raise InputError("row", "该行必须为对象", row)
        start = parse_integer(item.get("start"), "start", row)
        end = parse_integer(item.get("end"), "end", row)
        if start < 0:
            raise InputError("start", f"起点不能小于 0，收到 {start}", row)
        if end > roll_length:
            raise InputError(
                "end", f"终点不能超过卷长 {roll_length}，收到 {end}", row
            )
        if start >= end:
            raise InputError(
                "start",
                f"起点必须小于终点，收到 start={start}, end={end}",
                row,
            )
        defects.append((start, end))

    # feed_direction 仅在缺省时按原向返回（兼容旧客户端）；
    # 字段一旦给出（含 null），就必须是受支持的取值，否则明确拒绝。
    if "feed_direction" not in payload:
        feed_direction = FEED_ORIGINAL
    else:
        feed_direction = payload["feed_direction"]
        if not isinstance(feed_direction, str) or feed_direction not in FEED_DIRECTIONS:
            supported = " / ".join(repr(value) for value in FEED_DIRECTIONS)
            raise InputError(
                "feed_direction",
                f"进料方向仅支持 {supported}，收到 {feed_direction!r}",
            )
    return roll_length, defects, feed_direction


app = FastAPI(title="卷材缺陷避让裁切 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/plan")
def create_plan(payload: dict = Body(...)):
    try:
        roll_length, defects, feed_direction = validate_payload(payload)
    except InputError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_input",
                "row": exc.row,
                "field": exc.field,
                "message": exc.message,
            },
        ) from exc
    return build_plan(roll_length, defects, feed_direction)
