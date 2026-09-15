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


class TestFeedDirection:
    PAYLOAD = {
        "roll_length": 1000,
        "defects": [
            {"start": 100, "end": 150},
            {"start": 300, "end": 320},
        ],
    }

    def test_omitted_direction_returns_original(self):
        resp = post(self.PAYLOAD)
        assert resp.status_code == 200
        body = resp.json()
        assert body["feed_direction"] == "original"
        assert body["segments"] == [
            {"start": 0, "end": 85, "length": 85, "category": "waste"},
            {"start": 165, "end": 285, "length": 120, "category": "waste"},
            {"start": 335, "end": 1000, "length": 665, "category": "cuttable"},
        ]

    def test_explicit_original_matches_omitted(self):
        omitted = post(self.PAYLOAD).json()
        explicit = post({**self.PAYLOAD, "feed_direction": "original"}).json()
        assert explicit == omitted

    def test_reversed_returns_mirrored_coordinates_in_ascending_order(self):
        resp = post({**self.PAYLOAD, "feed_direction": "reversed"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["feed_direction"] == "reversed"
        assert body["expanded_defects"] == [
            {"start": 665, "end": 715},
            {"start": 835, "end": 915},
        ]
        assert body["merged_defects"] == [
            {"start": 665, "end": 715},
            {"start": 835, "end": 915},
        ]
        assert body["segments"] == [
            {"start": 0, "end": 665, "length": 665, "category": "cuttable"},
            {"start": 715, "end": 835, "length": 120, "category": "waste"},
            {"start": 915, "end": 1000, "length": 85, "category": "waste"},
        ]
        # 长度、类别总数与汇总值不变
        assert body["summary"] == {
            "segment_count": 3,
            "cuttable_count": 1,
            "waste_count": 2,
            "cuttable_length": 665,
            "waste_length": 205,
        }

    def test_reversed_string_integers_input(self):
        resp = post(
            {
                "roll_length": "1000",
                "defects": [{"start": "100", "end": "150"}],
                "feed_direction": "reversed",
            }
        )
        assert resp.status_code == 200
        assert resp.json()["segments"] == [
            {"start": 0, "end": 835, "length": 835, "category": "cuttable"},
            {"start": 915, "end": 1000, "length": 85, "category": "waste"},
        ]

    @pytest.mark.parametrize("bad", ["reverse", "backwards", "", 1, True, None, ["reversed"]])
    def test_unsupported_direction_rejected_with_clear_422(self, bad):
        resp = post({**self.PAYLOAD, "feed_direction": bad})
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["code"] == "invalid_input"
        assert detail["field"] == "feed_direction"
        assert detail["row"] is None
        assert detail["message"]

    def test_omitted_direction_does_not_regress_classification_boundaries(self):
        # 199mm 废边 / 200mm 可裁段边界：省略 feed_direction 的旧客户端结果不变
        waste = post(
            {
                "roll_length": 1000,
                "defects": [{"start": 100, "end": 110}, {"start": 339, "end": 349}],
            }
        ).json()
        assert waste["segments"][1] == {
            "start": 125, "end": 324, "length": 199, "category": "waste",
        }
        cuttable = post(
            {
                "roll_length": 1000,
                "defects": [{"start": 100, "end": 110}, {"start": 340, "end": 350}],
            }
        ).json()
        assert cuttable["segments"][1] == {
            "start": 125, "end": 325, "length": 200, "category": "cuttable",
        }
