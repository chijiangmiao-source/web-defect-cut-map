"""核心算法单元测试：扩张、截断、合并、补集、分类。"""

from app.planner import (
    CATEGORY_CUTTABLE,
    CATEGORY_WASTE,
    build_plan,
    classify,
    complement_intervals,
    expand_defects,
    merge_intervals,
)


class TestExpand:
    def test_expands_15mm_each_side(self):
        assert expand_defects([(100, 150)], 1000) == [(85, 165)]

    def test_clamps_at_roll_start(self):
        assert expand_defects([(0, 10)], 1000) == [(0, 25)]

    def test_clamps_at_roll_end(self):
        assert expand_defects([(990, 1000)], 1000) == [(975, 1000)]

    def test_clamps_both_sides_when_defect_covers_roll(self):
        assert expand_defects([(0, 100)], 100) == [(0, 100)]


class TestMerge:
    def test_empty(self):
        assert merge_intervals([]) == []

    def test_disjoint_intervals_keep_order_by_start(self):
        assert merge_intervals([(50, 60), (10, 20)]) == [(10, 20), (50, 60)]

    def test_overlapping_intervals_merge(self):
        assert merge_intervals([(0, 50), (40, 90)]) == [(0, 90)]

    def test_contained_interval_merges(self):
        assert merge_intervals([(0, 100), (10, 20)]) == [(0, 100)]

    def test_touching_endpoints_merge(self):
        # 闭区间端点相接（如 [0,50] 与 [50,80]）必须合并
        assert merge_intervals([(0, 50), (50, 80)]) == [(0, 80)]

    def test_gap_of_one_stays_separate(self):
        assert merge_intervals([(0, 50), (51, 80)]) == [(0, 50), (51, 80)]

    def test_chain_merge(self):
        assert merge_intervals([(0, 10), (5, 15), (14, 20), (100, 200)]) == [
            (0, 20),
            (100, 200),
        ]


class TestComplement:
    def test_no_defects_covers_full_roll(self):
        assert complement_intervals([], 1000) == [(0, 1000)]

    def test_middle_defect_splits_roll(self):
        assert complement_intervals([(100, 200)], 1000) == [(0, 100), (200, 1000)]

    def test_defect_at_start(self):
        assert complement_intervals([(0, 30)], 500) == [(30, 500)]

    def test_defect_at_end(self):
        assert complement_intervals([(470, 500)], 500) == [(0, 470)]

    def test_full_coverage_leaves_nothing(self):
        assert complement_intervals([(0, 500)], 500) == []


class TestClassify:
    def test_199_is_waste(self):
        assert classify(0, 199) == CATEGORY_WASTE

    def test_200_is_cuttable(self):
        assert classify(0, 200) == CATEGORY_CUTTABLE

    def test_zero_length_is_waste(self):
        assert classify(50, 50) == CATEGORY_WASTE


class TestBuildPlan:
    def test_empty_defects_single_cuttable_segment(self):
        plan = build_plan(1000, [])
        assert plan["segments"] == [
            {"start": 0, "end": 1000, "length": 1000, "category": "cuttable"}
        ]
        assert plan["summary"]["cuttable_length"] == 1000
        assert plan["summary"]["waste_length"] == 0

    def test_expansion_merge_and_classification(self):
        # 缺陷 (100,150) 与 (160,180) 扩张为 [85,165]、[145,195]，合并为 [85,195]
        plan = build_plan(1000, [(100, 150), (160, 180)])
        assert plan["merged_defects"] == [{"start": 85, "end": 195}]
        assert plan["segments"] == [
            {"start": 0, "end": 85, "length": 85, "category": "waste"},
            {"start": 195, "end": 1000, "length": 805, "category": "cuttable"},
        ]

    def test_touching_expanded_intervals_merge(self):
        # [85,165] 与 [165,215] 端点相接，合并为 [85,215]
        plan = build_plan(1000, [(100, 150), (180, 200)])
        assert plan["merged_defects"] == [{"start": 85, "end": 215}]
        assert plan["segments"] == [
            {"start": 0, "end": 85, "length": 85, "category": "waste"},
            {"start": 215, "end": 1000, "length": 785, "category": "cuttable"},
        ]

    def test_gap_of_exactly_200_is_cuttable_199_is_waste(self):
        # 缺陷 (100,110) 扩张为 [85,125]
        cuttable = build_plan(1000, [(100, 110), (340, 350)])
        assert cuttable["segments"][1] == {
            "start": 125,
            "end": 325,
            "length": 200,
            "category": "cuttable",
        }
        waste = build_plan(1000, [(100, 110), (339, 349)])
        assert waste["segments"][1] == {
            "start": 125,
            "end": 324,
            "length": 199,
            "category": "waste",
        }

    def test_defect_at_boundaries_clamped(self):
        plan = build_plan(500, [(0, 20), (480, 500)])
        assert plan["expanded_defects"] == [
            {"start": 0, "end": 35},
            {"start": 465, "end": 500},
        ]
        assert plan["segments"] == [
            {"start": 35, "end": 465, "length": 430, "category": "cuttable"}
        ]

    def test_roll_fully_consumed_by_defects(self):
        plan = build_plan(100, [(0, 100)])
        assert plan["segments"] == []
        assert plan["summary"]["segment_count"] == 0
