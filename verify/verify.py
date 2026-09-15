"""一次性验收服务：对真实运行的 API 与前端代理执行端到端断言。

通过 docker compose 启动（依赖 api 健康、web 已启动），全部检查通过后以 0 退出，
任一断言失败以 1 退出。不 mock 任何响应，所有预期值均为手工推算的确定结果。
"""

import os
import sys
import time

import requests

API_BASE = os.environ.get("API_BASE_URL", "http://api:8000").rstrip("/")
WEB_BASE = os.environ.get("WEB_BASE_URL", "http://web").rstrip("/")
TIMEOUT = 10

failures = []


def check(name, fn):
    try:
        fn()
    except Exception as exc:  # noqa: BLE001 - 验收脚本需要汇总所有失败
        failures.append(f"{name}: {exc}")
        print(f"FAIL  {name}: {exc}")
    else:
        print(f"PASS  {name}")


def wait_ready(url, deadline=90):
    start = time.time()
    while time.time() - start < deadline:
        try:
            resp = requests.get(url, timeout=3)
            if resp.status_code == 200:
                return
        except requests.RequestException:
            pass
        time.sleep(1)
    raise RuntimeError(f"等待服务就绪超时: {url}")


def post_plan(base, payload):
    return requests.post(f"{base}/api/plan", json=payload, timeout=TIMEOUT)


def expect_segments(payload, expected):
    resp = post_plan(API_BASE, payload)
    assert resp.status_code == 200, f"期望 200，实际 {resp.status_code}: {resp.text}"
    body = resp.json()
    assert body["segments"] == expected, (
        f"区段不符\n期望: {expected}\n实际: {body['segments']}"
    )
    return body


def expect_422(payload, expected_row, expected_field):
    resp = post_plan(API_BASE, payload)
    assert resp.status_code == 422, f"期望 422，实际 {resp.status_code}: {resp.text}"
    detail = resp.json()["detail"]
    assert detail["row"] == expected_row, f"问题行不符: {detail}"
    assert detail["field"] == expected_field, f"问题字段不符: {detail}"
    assert detail.get("message"), f"缺少错误消息: {detail}"


def main():
    wait_ready(f"{API_BASE}/api/health")
    wait_ready(f"{WEB_BASE}/")
    print(f"API={API_BASE} WEB={WEB_BASE} 已就绪，开始验收\n")

    check("空缺陷列表生成覆盖全长的一个可裁段", lambda: expect_segments(
        {"roll_length": 1000, "defects": []},
        [{"start": 0, "end": 1000, "length": 1000, "category": "cuttable"}],
    ))

    check("缺陷扩张 15mm、合并、补集与废边分类", lambda: expect_segments(
        {"roll_length": 1000,
         "defects": [{"start": 100, "end": 150}, {"start": 300, "end": 320}]},
        [
            {"start": 0, "end": 85, "length": 85, "category": "waste"},
            {"start": 165, "end": 285, "length": 120, "category": "waste"},
            {"start": 335, "end": 1000, "length": 665, "category": "cuttable"},
        ],
    ))

    check("端点相接的扩张区间被合并", lambda: expect_segments(
        {"roll_length": 1000,
         "defects": [{"start": 100, "end": 150}, {"start": 180, "end": 200}]},
        [
            {"start": 0, "end": 85, "length": 85, "category": "waste"},
            {"start": 215, "end": 1000, "length": 785, "category": "cuttable"},
        ],
    ))

    check("缺陷在卷材两端时扩张被截断至边界", lambda: expect_segments(
        {"roll_length": 500,
         "defects": [{"start": 0, "end": 20}, {"start": 480, "end": 500}]},
        [{"start": 35, "end": 465, "length": 430, "category": "cuttable"}],
    ))

    check("补集 199mm 为废边、200mm 为可裁段", lambda: (
        expect_segments(
            {"roll_length": 1000,
             "defects": [{"start": 100, "end": 110}, {"start": 339, "end": 349}]},
            [
                {"start": 0, "end": 85, "length": 85, "category": "waste"},
                {"start": 125, "end": 324, "length": 199, "category": "waste"},
                {"start": 364, "end": 1000, "length": 636, "category": "cuttable"},
            ],
        ),
        expect_segments(
            {"roll_length": 1000,
             "defects": [{"start": 100, "end": 110}, {"start": 340, "end": 350}]},
            [
                {"start": 0, "end": 85, "length": 85, "category": "waste"},
                {"start": 125, "end": 325, "length": 200, "category": "cuttable"},
                {"start": 365, "end": 1000, "length": 635, "category": "cuttable"},
            ],
        ),
    ))

    check("卷长边界 1 与 100000 均合法", lambda: (
        expect_segments({"roll_length": 1, "defects": []},
                        [{"start": 0, "end": 1, "length": 1, "category": "waste"}]),
        expect_segments({"roll_length": 100000, "defects": []},
                        [{"start": 0, "end": 100000, "length": 100000,
                          "category": "cuttable"}]),
    ))

    check("倒置缺陷行返回 422 且指向首个问题行", lambda: expect_422(
        {"roll_length": 1000,
         "defects": [{"start": 10, "end": 20}, {"start": 500, "end": 100}]},
        2, "start",
    ))

    check("非整数输入返回 422", lambda: (
        expect_422({"roll_length": "abc", "defects": []}, None, "roll_length"),
        expect_422({"roll_length": 1000,
                    "defects": [{"start": 1.5, "end": 10}]}, 1, "start"),
    ))

    check("越界输入返回 422", lambda: (
        expect_422({"roll_length": 0, "defects": []}, None, "roll_length"),
        expect_422({"roll_length": 100001, "defects": []}, None, "roll_length"),
        expect_422({"roll_length": 1000,
                    "defects": [{"start": -1, "end": 10}]}, 1, "start"),
        expect_422({"roll_length": 1000,
                    "defects": [{"start": 0, "end": 1001}]}, 1, "end"),
    ))

    def check_web_proxy():
        # 通过前端 nginx 代理提交，与直连 API 的结果必须一致（真实联调）
        payload = {"roll_length": 1000,
                   "defects": [{"start": 100, "end": 150}]}
        direct = post_plan(API_BASE, payload).json()
        proxied = post_plan(WEB_BASE, payload)
        assert proxied.status_code == 200, f"代理请求失败: {proxied.status_code}"
        assert proxied.json()["segments"] == direct["segments"], "代理与直连结果不一致"

    def check_web_page():
        resp = requests.get(f"{WEB_BASE}/", timeout=TIMEOUT)
        assert resp.status_code == 200, f"首页状态码 {resp.status_code}"
        assert 'id="root"' in resp.text, "首页缺少 root 挂载点"
        check_web_proxy()

    check("前端页面可访问且 /api 经 nginx 代理与直连结果一致", check_web_page)

    print()
    if failures:
        print(f"验收失败 {len(failures)} 项:")
        for item in failures:
            print(f"  - {item}")
        return 1
    print("全部验收检查通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
