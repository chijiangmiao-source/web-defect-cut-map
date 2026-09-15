"""核心算法单元测试：扩张、截断、合并、补集、分类与调头镜像。"""

from app.planner import (
    CATEGORY_CUTTABLE,
    CATEGORY_WASTE,
    FEED_ORIGINAL,
    FEED_REVERSED,
    build_plan,
    classify,
    complement_intervals,
    expand_defects,
    merge_intervals,
    reverse_interval,
    reverse_plan,
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


class TestReverse:
    def test_reverse_interval_mirrors_around_roll_center(self):
        assert reverse_interval(100, 200, 1000) == (800, 900)
        assert reverse_interval(0, 50, 1000) == (950, 1000)
        assert reverse_interval(950, 1000, 1000) == (0, 50)
        # 区间长度保持不变
        start, end = reverse_interval(123, 456, 1000)
        assert end - start == 333

    def test_asymmetric_defects_exact_reversed_coordinates_and_order(self):
        plan = build_plan(
            1000, [(100, 150), (300, 320)], feed_direction=FEED_REVERSED
        )
        # 扩张缺陷镜像后按新坐标升序
        assert plan["expanded_defects"] == [
            {"start": 665, "end": 715},
            {"start": 835, "end": 915},
        ]
        assert plan["merged_defects"] == [
            {"start": 665, "end": 715},
            {"start": 835, "end": 915},
        ]
        # 区段镜像并整体倒置：可裁段从原向的卷尾转到调头后的卷首
        assert plan["segments"] == [
            {"start": 0, "end": 665, "length": 665, "category": "cuttable"},
            {"start": 715, "end": 835, "length": 120, "category": "waste"},
            {"start": 915, "end": 1000, "length": 85, "category": "waste"},
        ]
        assert plan["feed_direction"] == FEED_REVERSED

    def test_reversed_keeps_lengths_categories_and_summary(self):
        original = build_plan(1000, [(100, 150), (300, 320)])
        reversed_ = build_plan(
            1000, [(100, 150), (300, 320)], feed_direction=FEED_REVERSED
        )
        for key in ("segments", "expanded_defects", "merged_defects"):
            orig_spans = sorted(item["end"] - item["start"] for item in original[key])
            rev_spans = sorted(item["end"] - item["start"] for item in reversed_[key])
            assert orig_spans == rev_spans
        assert [s["category"] for s in reversed_["segments"]] != [
            s["category"] for s in original["segments"]
        ]
        assert reversed_["summary"] == original["summary"]

    def test_reverse_is_involution(self):
        # 调头两次应回到原向坐标
        original = build_plan(1000, [(100, 150), (300, 320)])
        reversed_ = build_plan(
            1000, [(100, 150), (300, 320)], feed_direction=FEED_REVERSED
        )
        assert reverse_plan(reversed_)["segments"] == original["segments"]
        assert reverse_plan(reversed_)["expanded_defects"] == original["expanded_defects"]

    def test_symmetric_defect_keeps_interval_but_segments_reorder(self):
        # 缺陷位于卷材正中：扩张区间 [385,615] 关于卷中心对称，镜像后不变
        plan = build_plan(1000, [(400, 600)], feed_direction=FEED_REVERSED)
        assert plan["merged_defects"] == [{"start": 385, "end": 615}]
        assert plan["segments"] == [
            {"start": 0, "end": 385, "length": 385, "category": "cuttable"},
            {"start": 615, "end": 1000, "length": 385, "category": "cuttable"},
        ]

    def test_empty_and_full_coverage_rolls(self):
        empty = build_plan(1000, [], feed_direction=FEED_REVERSED)
        assert empty["segments"] == [
            {"start": 0, "end": 1000, "length": 1000, "category": "cuttable"}
        ]
        assert empty["feed_direction"] == FEED_REVERSED

        full = build_plan(100, [(0, 100)], feed_direction=FEED_REVERSED)
        assert full["segments"] == []
        assert full["merged_defects"] == [{"start": 0, "end": 100}]

    def test_default_direction_is_original(self):
        assert build_plan(1000, [])["feed_direction"] == FEED_ORIGINAL
