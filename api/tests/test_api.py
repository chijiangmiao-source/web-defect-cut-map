"""API 集成测试：合法输入、边界值与整批拒绝。"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def post(payload):
    return client.post("/api/plan", json=payload)


class TestHealth:
    def test_health_ok(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestValidPlans:
    def test_empty_defects_one_cuttable_segment(self):
        resp = post({"roll_length": 1000, "defects": []})
        assert resp.status_code == 200
        body = resp.json()
        assert body["segments"] == [
            {"start": 0, "end": 1000, "length": 1000, "category": "cuttable"}
        ]
        assert body["merged_defects"] == []

    def test_defects_omitted_defaults_to_empty(self):
        resp = post({"roll_length": 500})
        assert resp.status_code == 200
        assert resp.json()["segments"] == [
            {"start": 0, "end": 500, "length": 500, "category": "cuttable"}
        ]

    def test_string_integers_accepted(self):
        # 前端表单以字符串提交，纯数字字符串应被接受
        resp = post(
            {"roll_length": "1000", "defects": [{"start": "100", "end": "150"}]}
        )
        assert resp.status_code == 200
        assert resp.json()["segments"] == [
            {"start": 0, "end": 85, "length": 85, "category": "waste"},
            {"start": 165, "end": 1000, "length": 835, "category": "cuttable"},
        ]

    def test_roll_length_boundaries_accepted(self):
        assert post({"roll_length": 1, "defects": []}).status_code == 200
        assert post({"roll_length": 100000, "defects": []}).status_code == 200

    def test_defect_touching_roll_boundaries_accepted(self):
        resp = post(
            {"roll_length": 1000, "defects": [{"start": 0, "end": 1000}]}
        )
        assert resp.status_code == 200
        assert resp.json()["segments"] == []

    def test_expansion_merge_complement_end_to_end(self):
        resp = post(
            {
                "roll_length": 1000,
                "defects": [
                    {"start": 100, "end": 150},
                    {"start": 300, "end": 320},
                ],
            }
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["expanded_defects"] == [
            {"start": 85, "end": 165},
            {"start": 285, "end": 335},
        ]
        assert body["segments"] == [
            {"start": 0, "end": 85, "length": 85, "category": "waste"},
            {"start": 165, "end": 285, "length": 120, "category": "waste"},
            {"start": 335, "end": 1000, "length": 665, "category": "cuttable"},
        ]
        assert body["summary"] == {
            "segment_count": 3,
            "cuttable_count": 1,
            "waste_count": 2,
            "cuttable_length": 665,
            "waste_length": 205,
        }


class TestRollLengthValidation:
    @pytest.mark.parametrize("value", [0, -1, 100001, 200000])
    def test_out_of_range_rejected(self, value):
        resp = post({"roll_length": value, "defects": []})
        assert resp.status_code == 422
        assert resp.json()["detail"]["field"] == "roll_length"
        assert resp.json()["detail"]["row"] is None

    @pytest.mark.parametrize("value", ["abc", "10.5", "", "  ", 10.5, True, None, [1]])
    def test_non_integer_rejected(self, value):
        resp = post({"roll_length": value, "defects": []})
        assert resp.status_code == 422
        assert resp.json()["detail"]["field"] == "roll_length"

    def test_missing_roll_length_rejected(self):
        resp = post({"defects": []})
        assert resp.status_code == 422
        assert resp.json()["detail"]["field"] == "roll_length"


class TestDefectValidation:
    def test_inverted_defect_rejected(self):
        resp = post({"roll_length": 1000, "defects": [{"start": 500, "end": 100}]})
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["row"] == 1
        assert detail["code"] == "invalid_input"

    def test_zero_length_defect_rejected(self):
        resp = post({"roll_length": 1000, "defects": [{"start": 100, "end": 100}]})
        assert resp.status_code == 422
        assert resp.json()["detail"]["row"] == 1

    def test_negative_start_rejected(self):
        resp = post({"roll_length": 1000, "defects": [{"start": -5, "end": 10}]})
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["row"] == 1
        assert detail["field"] == "start"

    def test_end_beyond_roll_length_rejected(self):
        resp = post({"roll_length": 1000, "defects": [{"start": 0, "end": 1001}]})
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["row"] == 1
        assert detail["field"] == "end"

    @pytest.mark.parametrize("bad", ["abc", "1.5", "", 1.5, False, None])
    def test_non_integer_defect_values_rejected(self, bad):
        resp = post({"roll_length": 1000, "defects": [{"start": bad, "end": 10}]})
        assert resp.status_code == 422
        assert resp.json()["detail"]["row"] == 1

    def test_first_problem_row_reported(self):
        # 第 2 行才是首个问题行
        resp = post(
            {
                "roll_length": 1000,
                "defects": [
                    {"start": 10, "end": 20},
                    {"start": 900, "end": 100},
                    {"start": "x", "end": 5},
                ],
            }
        )
        assert resp.status_code == 422
        assert resp.json()["detail"]["row"] == 2

    def test_batch_rejected_as_a_whole(self):
        # 其余行均合法，仅一行越界：整批拒绝，不返回任何区段
        resp = post(
            {
                "roll_length": 1000,
                "defects": [
                    {"start": 10, "end": 20},
                    {"start": 30, "end": 2000},
                ],
            }
        )
        assert resp.status_code == 422
        assert "segments" not in resp.json()

    def test_defects_must_be_a_list(self):
        resp = post({"roll_length": 1000, "defects": "none"})
        assert resp.status_code == 422
