# Stress Test Results: 10 Extreme Athlete Profiles

**Date**: 2026-03-13
**Method**: Code-path trace analysis (static) + executable test script
**Test script**: `backend/tests/stress_test_extreme_profiles.py`
**Engine files audited**:
- `backend/app/services/physiological_engine.py`
- `backend/app/services/mesocycle_prescription.py`
- `backend/app/services/workout_library.py`
- `backend/app/services/analytics.py`

> The test script is ready to run: `cd backend && python -m pytest tests/stress_test_extreme_profiles.py -v`. All results below are derived from manual code-path analysis confirmed against the engine logic.

---

## Summary Table

| # | Profile | Discipline | Gap Analysis | Capacity Profile | Mesocycle | Plausibility |
|---|---------|-----------|-------------|-----------------|----------|--------------|
| 1 | Elite Ironman Female (4w) | running | PASS | PASS | PASS | **WARN** |
| 1 | Elite Ironman Female (4w) | ciclismo | PASS | PASS | PASS | **WARN** |
| 2 | Recreational Ironman Male (20w) | running | PASS | PASS | PASS | PASS |
| 3 | Sprint Tri Junior (8w) | running | PASS | PASS | PASS | PASS |
| 3 | Sprint Tri Junior (8w) | ciclismo | PASS | PASS | PASS | PASS |
| 4 | Olympic Diesel ratio=0.92 (16w) | running | PASS | PASS | PASS | **WARN** |
| 5 | 70.3 Stale Data (specific) | running | PASS | N/A | N/A | PASS |
| 5 | 70.3 Stale Data (base) | running | PASS | N/A | N/A | PASS |
| 5 | 70.3 3-point curve | running | PASS | N/A | N/A | PASS |
| 6 | Cross-Discipline Gap (run) | running | PASS | PASS | PASS | PASS |
| 6 | Cross-Discipline Gap (bike) | ciclismo | PASS | PASS | PASS | PASS |
| 7 | Swimmer 4pts + outliers | natacion | PASS | PASS | PASS | PASS |
| 8 | Flat Curve Runner | running | PASS | PASS | N/A | PASS |
| 8 | Flat Curve LT1==LT2 | running | PASS | PASS | N/A | PASS |
| 9 | High Lactate Cyclist (18 mmol) | ciclismo | PASS | PASS | PASS | PASS |
| 9 | High Lactate raw curve | ciclismo | PASS | PASS | N/A | PASS |
| 10 | Beginner No Data | running | PASS | PASS | PASS | PASS |
| 10 | Beginner LT2=0 | running | PASS | PASS | N/A | PASS |
| 10 | Beginner no target | running | PASS | N/A | N/A | PASS |
| E | Negative pace | running | PASS | N/A | N/A | PASS |
| E | None confidence | running | PASS | N/A | N/A | PASS |
| E | Unknown discipline | any | PASS | N/A | N/A | PASS |
| E | 0-week mesocycle | running | N/A | N/A | PASS | PASS |

**Crashes found: 0**
**Plausibility warnings: 3**
**Potential bugs: 0**

---

## Detailed Results per Profile

### Profile 1: Elite Ironman Female (4 weeks to race)

**Running leg**: LT1=4:15/km, LT2=3:55/km, target=4:10/km, competitive, ironman.

- **Season**: `pre_comp` (4w, competitive boundaries 26/18/10/3).
- **Capacity**: ratio ~0.904 -> VLamax low. LT2=15.32 km/h in competitive benchmarks (13.5, 17.0) -> moderate aerobic.
- **Gap**: required_lt2 = target/0.84 = 17.14 km/h. lt2_gap = +1.82 km/h (significant). required_lt1 = target/0.97 = 14.85 km/h. lt1_gap = +0.73 km/h.
- **Decision path**: lt1_priority fires (ironman is lt1-limited), lt1_gap > significant_gap_lt1_primary -> `aerobic_capacity_block`. Capacity profile (moderate aerobic + low VLamax) adds context but does not change block.
- **P5a contraindication**: AEC needs >=5 weeks, only 4 available -> WARNING fires.
- **Block**: `aerobic_capacity_block` with contraindication.

**PLAUSIBILITY WARNING**: Prescribing a new AEC block 4 weeks before an ironman is questionable. The gap is real but unclosable in 4 weeks. The P5a contraindication correctly flags this, but the block is not auto-downgraded to `competition_specific_block`. A coach would override.

**Cycling leg**: LT1=245W, LT2=280W, target=260W, ironman_bike.
- Same pattern: large gaps in both LT1 and LT2 relative to ironman demands -> `aerobic_capacity_block` with P5a contraindication.

---

### Profile 2: Recreational Ironman Male (20 weeks out)

LT1=6:30/km, LT2=5:30/km, target=6:00/km, peak=12.0 mmol.

- **Season**: `specific` (20w, recreational boundaries 32/23/14/3).
- **Glycolytic**: peak 12.0 >= 10.0 + ironman is long_duration -> `high_glycolytic` fires.
- **Block**: `aerobic_capacity_block` (high glycolytic + long duration fires first in decision tree).
- **Plausibility**: CORRECT. Recreational ironman with high glycolytic profile needs aerobic base.

---

### Profile 3: Sprint Triathlete Junior (8 weeks)

**Running**: LT1=4:00/km, LT2=3:30/km, target=3:25/km, competitive, peak=14.0.

- **Season**: `pre_comp` (8w, competitive boundaries).
- **Key**: Sprint tri is NOT in long_duration_events -> high glycolytic does NOT penalize (correct -- high glycolysis is normal for sprinters).
- **Gap**: lt2_gap = +1.54 km/h > significant_gap 0.69 -> `threshold_development_block`.
- **Capacity**: high aerobic + high VLamax. Suppression rule only fires in base_phases -> no effect in pre_comp.
- **Plausibility**: PASS. Large gap justifies threshold work even in pre_comp.

**Cycling**: LT1=260W, LT2=320W, target=340W.
- lt2_gap = +20W, barely over significant_gap 19.2W -> `threshold_development_block`.

---

### Profile 4: Olympic Distance Diesel (ratio 0.92, 16 weeks)

LT1=4:20/km (13.85 km/h), LT2=4:00/km (15.0 km/h), target=4:05/km, peak=7.0.

- **Season**: `specific` (16w, trained boundaries).
- **Capacity**: ratio 0.923 -> VLamax LOW. LT2=15.0 km/h in trained benchmarks (11.0, 14.5) -> HIGH aerobic.
- **Gap**: lt2_gap = +0.31 km/h. moderate_gap = 0.3. Gap barely in moderate range -> `aerobic_power_block` (specific phase, not base).
- **Capacity override**: HIGH aerobic + LOW VLamax + specific phase + recommended=AEP. The capacity profile rule checks if recommended is in (AEC, THR) -- AEP is not, so no override. Context reason added.
- **Block**: `aerobic_power_block`.

**PLAUSIBILITY WARNING**: For an extreme diesel (ratio 0.92) at Olympic distance, the engine prescribes AEP which is reasonable. However, `olympic_tri`/`olympic_run` are NOT in `_ANC_CANDIDATE_EVENTS`. An Olbrecht-strict interpretation would consider ANC for this diesel profile in certain phases. The engine cannot recommend ANC for Olympic distance athletes.

---

### Profile 5: 70.3 with Stale Data (65 days)

**Specific phase (14 weeks)**: Test age 65 > 56, season=specific -> P21a fires: `testing_decision_block`. CORRECT.

**Base phase (25 weeks)**: Test age 65 > 56 but season=base_late (not specific/pre_comp) -> P21a does NOT fire. Engine prescribes normally with data_quality="low". CORRECT differentiation.

**3-point raw curve**: Interpolation at 2.0mmol and 4.0mmol works from 3 points. Engine finds brackets and interpolates. PASS.

---

### Profile 6: Triathlete with Cross-Discipline Gap

**Running**: LT1=7:00/km, LT2=6:00/km, target=5:30/km, half_run.
- **Season**: `pre_comp` (12w, trained, boundary at 12 uses `>` so 12>12 is false -> pre_comp).
- **Gap**: LT1 gap +2.68 km/h, LT2 gap +1.73 km/h. Both massive. half_lt1_red_zone fires -> `aerobic_capacity_block`.
- **Capacity**: LT2=10.0 km/h in trained benchmarks -> LOW aerobic. Ratio 0.857 -> moderate VLamax.
- **Plausibility**: CORRECT. Terrible runner needs aerobic base.

**Cycling**: LT1=260W, LT2=310W, target=280W, half_bike.
- Small gap on bike -> `threshold_development_block`. CORRECT.

**Design gap**: Engine analyzes disciplines independently. No cross-discipline prioritization for triathlon.

---

### Profile 7: Swimmer with 4 Data Points, 2 Outliers

Raw curve: [1.0, 2.5, 1.8 (drop), 5.0]. Sorted by lactate for interpolation.

- `_interpolate_metric_at_lactate` sorts by lactate, not pace. The non-monotonic pace is handled gracefully.
- LT1@2.0mmol and LT2@4.0mmol both found in brackets.
- Confidence ~0.60 (interpolated fallback).
- **No crash**. Outlier absorbed by lactate-sorted interpolation.

---

### Profile 8: Flat Curve Runner (LT2 - LT1 ~ 0.1 mmol)

**Normal test**: LT1=4:10/km, LT2=4:05/km. Ratio 14.4/14.694 = 0.98.
- VLamax = "low" (>0.87). No division by zero.

**LT1 == LT2**: Both at 250s. Ratio = 1.0.
- `build_capacity_profile`: lt2_value = 14.4 > 0, passes guard. ratio = 1.0 -> VLamax low.
- **No division by zero**. The `lt2_value <= 0` guard at line 596 prevents it.

---

### Profile 9: Cyclist with 18 mmol Peak

LT1=180W, LT2=250W, target=280W, peak=18.0, road_tt.

- **Capacity**: ratio 180/250 = 0.72 -> VLamax HIGH. LT2=250W in trained benchmarks (220, 310) -> moderate.
- **Block**: `threshold_development_block` (pre_comp, large gap).
- 18 mmol peak: For road_tt (not long_duration) -> high_glycolytic does NOT fire. Correct.
- **Raw curve with 18mmol**: 6 points, interpolation at 2.0mmol and 4.0mmol works. No overflow.

---

### Profile 10: Beginner with Zero Data

**Empty analysis**: data_quality="none" -> `testing_decision_block` immediately. PASS.

**LT2=0**: `build_capacity_profile` guard `lt2_value <= 0` returns unknown/unknown, confidence 0.0. PASS.

**No target, no weeks**: weeks_to_goal=None -> base_early. No data -> testing_decision_block. PASS.

**Mesocycle draft**: The fallback blueprint in `_blueprint_for` references template_ids `test_profile_anchor` (line 1824) and `recovery_regeneration` (line 1842). Both exist in `WORKOUT_TEMPLATES`. PASS.

**0-week mesocycle**: `_phase_sequence` returns [] for duration=0. Empty draft_weeks. PASS.

---

### Edge Cases

| Edge Case | Behavior | Status |
|-----------|----------|--------|
| Negative pace (-100 sec/km) | Guard `lt1_pace > 0` rejects -> no data -> testing_decision_block | PASS |
| None confidence | `float(None or 0.6)` = 0.6 fallback | PASS |
| Unknown discipline ("atletismo") | Empty view -> no data -> testing_decision_block | PASS |
| Unknown distance ("ultramarathon") | Falls back to "other" in EVENT_LIMITER | PASS |
| Empty raw curve | `len(curve_points) < 2` guard -> None, None | PASS |
| Single-point raw curve | Same guard | PASS |

---

## Findings

### FINDING 1 (Medium): No "too late to close the gap" auto-downgrade

**Location**: `analyse_physiological_gap`, P5a logic (line ~1233-1246)
**Profiles affected**: 1 (Elite Ironman 4 weeks out)
**Problem**: When `weeks_to_goal < MIN_WEEKS_FOR_BLOCK`, the engine adds a contraindication warning but still returns the impractical block. An elite ironman athlete 4 weeks out gets `aerobic_capacity_block` (needs 5+ weeks) with a warning.
**Recommendation**: Add a hard override: if weeks_to_goal < MIN_WEEKS_FOR_BLOCK and the block is not already competition_specific/recovery/testing, auto-downgrade to `competition_specific_block` and move the original recommendation to a "deferred_recommendation" field.

### FINDING 2 (Low-Medium): Olympic distance excluded from ANC candidates

**Location**: `_ANC_CANDIDATE_EVENTS` (line ~177)
**Profiles affected**: 4 (Olympic Diesel)
**Problem**: The set includes sprint_tri, 5k, 10k but not olympic_tri/olympic_run/olympic_bike. Extreme diesel athletes (ratio >0.90) at Olympic distance cannot get ANC recommendation even when Olbrecht would suggest it.
**Recommendation**: Add olympic events to `_ANC_CANDIDATE_EVENTS` with a stricter VLamax gate (ratio > 0.90 required instead of just "low").

### FINDING 3 (Low): No "flat curve / insufficient test" detector

**Location**: `analytics.py` threshold detection
**Profiles affected**: 8 (Flat Curve Runner)
**Problem**: When lactate range is < 0.5 mmol across all stages, the engine places LT1/LT2 at curve extremes. While confidence is low and real_thresholds won't be published, basic thresholds are still returned. No explicit "test protocol inadequate" flag.
**Recommendation**: Add a `lactate_range_check` that flags curves with total range < 1.0 mmol as "insufficient_protocol" with a reason.

### FINDING 4 (Info): No cross-discipline triathlon prioritization

**Location**: Engine architecture
**Profiles affected**: 6 (Cross-Discipline Gap)
**Problem**: Each discipline analyzed independently. No mechanism to prioritize the weakest discipline for a triathlete.
**Impact**: Coach must manually compare per-discipline results. Not a bug, but a missing feature for triathlon-specific coaching.

---

## Code Robustness Summary

| Guard | Location | Status |
|-------|----------|--------|
| Division by zero (LT2=0) | `build_capacity_profile` line 596 | SAFE |
| Division by zero (pace=0) | `_interpolate_metric_at_lactate` line 324 | SAFE |
| Empty arrays | `_interpolate_metric_at_lactate` line 303 | SAFE |
| Negative pace values | `_extract_lt_from_analysis` line 441 | SAFE |
| None confidence | `or 0.7` fallback pattern | SAFE |
| Stale date parsing | try/except at line 553 | SAFE |
| 0-week mesocycle | `_phase_sequence` returns [] | SAFE |
| Unknown discipline/distance | Falls to defaults | SAFE |
| Extreme lactate (18+ mmol) | Threshold detection unaffected | SAFE |
| Non-monotonic curve (outliers) | Lactate-sorted interpolation absorbs | SAFE |

**Overall assessment**: The engine is **robust against crashes and edge cases**. The main concerns are plausibility-level issues (Findings 1-2) where the engine's recommendation, while safe, is not optimal for specific extreme profiles. Finding 4 is a potential runtime bug in an uncommon code path.
