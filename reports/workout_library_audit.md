# Workout Library vs Garmin Generation Audit

**Date**: 2026-03-17
**Auditor**: Automated code trace through workout_library.py -> workout_definition_builder.py -> garmin.py

---

## Summary

- **61 templates** cataloged in WORKOUT_TEMPLATES
- **24 templates with dose_ladder** (the rest use csv_examples only)
- Total dose steps across all ladders: **~120 steps**

| Category   | Count | Details |
|-----------|-------|---------|
| BROKEN     | 7     | Labels that cannot be parsed correctly or produce wrong workouts |
| MISMATCH   | 5     | Description/structure says one thing, generated workout does another |
| SUSPICIOUS | 11    | Might work but looks wrong or fragile |
| OK         | ~97   | Verified correct or not applicable (no dose_ladder) |

---

## Findings

### BROKEN

#### 1. `run_lt2_short_reps` dose step 5: `2×(6×3')`
- **Problem**: `_infer_reps_count()` returns `None` for labels containing parentheses (line 462: `if "(" in label: return None`). This means the label falls through to `_split_outside_parentheses()` which splits on `+`. Since there is no `+`, it becomes a single part. Then `_parse_library_label_length()` tries to parse `"2×(6×3')"` and finds `3'` = 180s. The result is a **single steady step of 180 seconds** instead of the intended 2 blocks of 6x3min.
- **Expected**: 2 repeat groups, each with 6 reps of 3min work + 2min rest, with a macro rest between groups.
- **Actual**: A single 3-minute steady step at LT2 zone. The `useful_duration_min=36` and `rest_min=2.0` are completely ignored in terms of structure.
- **Fix suggestion**: Add nested repeat support to `_build_library_main_steps()`, or create a specific handler for `N×(M×T')` format. At minimum, detect this pattern and flatten to `12×3'` with rest.

#### 2. `run_escalated_intervals` all dose steps: `3×(3'LT1+3'LT2)`, `4×(3'LT1+3'LT2)`, etc.
- **Problem**: Same parentheses guard in `_infer_reps_count()` returns `None`. Then `_split_outside_parentheses()` splits nothing (no `+` outside parens). `_parse_library_label_length()` finds `3'` = 180s inside. Result: **single 3-minute step** instead of the multi-zone escalated format.
- **Expected**: N repeats, each containing LT1 segment + LT2 segment (+ optional LT2b segment).
- **Actual**: Single 180-second step. Zone is "LT1->LT2" or "LT1->LT2b" which won't match any zone in the resolver.
- **Fix suggestion**: Parse the `(A'X+B'Y+C'Z)` pattern inside parentheses into multi-zone repeat children.

#### 3. `run_anc_submax_spice` all dose steps: `4×20'' + 6×4' LT1`, etc.
- **Problem**: `_infer_reps_count()` matches `^(\d+)\s*[x×]` and returns `4`. Then `_build_library_main_steps()` divides `useful_duration_min` (e.g. 25) by 4 reps = 6.25 min per rep = 375 seconds. But the label says `4×20''` (20 seconds!) followed by a separate `6×4'` block. The builder produces **4 reps of 6min15s** instead of 4x20s sprints + 6x4min LT1.
- **Expected**: Two distinct blocks: 4 reps of 20s ANC sprint + 6 reps of 4min LT1.
- **Actual**: 4 reps of 375s work at "AEC" zone with 2min rest. Completely wrong structure.
- **Fix suggestion**: Detect `+` separator in labels indicating multi-block workouts. Split into independent step groups.

#### 4. `bike_anc_submax_spice` all dose steps: `5×10'' + 5×7' LT1`, etc.
- **Problem**: Identical to #3. `_infer_reps_count()` returns 5, divides total time by 5, producing ~7min reps instead of 10-second sprints + 7-minute LT1 blocks.
- **Expected**: 5x10s MAX sprints + 5x7min LT1.
- **Actual**: 5 reps of ~432s each at "AEC" zone.
- **Fix suggestion**: Same as #3.

#### 5. `bike_sit_lt1_progressive` all dose steps: `6×30'' SIT + 3×15' LT1`, etc.
- **Problem**: Same `_infer_reps_count()` issue. Returns 6, divides 48 min by 6 = 8 min per rep. But the intended structure is 6x30s SIT sprints + 3x15min LT1.
- **Expected**: 6 reps of 30s SIT + 3 reps of 15min LT1.
- **Actual**: 6 reps of 480s at "AEP" zone.
- **Fix suggestion**: Same as #3.

#### 6. `run_anc_vo2_short` all dose steps: `8' LT1 + 20×20''/15''`, etc.
- **Problem**: `_infer_reps_count()` matches `^(\d+)\s*[x×]` but `8'` starts with `8` followed by `'` not `x`, so it returns `None`. Falls to `_split_outside_parentheses()` which splits on `+` producing two parts: `"8' LT1"` and `"20×20''/15''"`. The first part parses OK (8min = 480s). The second part `_parse_library_label_length("20×20''/15''")` matches seconds pattern `20''` = 20s. Result: two steps, first 480s, second 20s. The 20 reps of 20/15 structure is **completely lost**.
- **Expected**: 8min LT1 block + 20 reps of (20s work / 15s rest).
- **Actual**: Two steps: 8min + 20s. Total ~8.3min instead of ~20min.
- **Fix suggestion**: When `_split_outside_parentheses` produces parts, check each part for repeat patterns and generate repeat steps accordingly.

#### 7. `bike_fatmax_intervals` all dose steps: `20'E1+3×6'LT1+20'E1`, etc.
- **Problem**: `_infer_reps_count()` matches `^(\d+)\s*[x×]` — but `20'E1+3×6'LT1+20'E1` starts with `20'` which doesn't match. Falls to split on `+`. Produces 3 parts: `"20'E1"`, `"3×6'LT1"`, `"20'E1"`. For the middle part, `_parse_library_label_length("3×6'LT1")` matches minutes pattern `6'` = 360s. **But it should be 3 reps of 6min, not a single 6min step.** The `rest_min` between the 3 parts is applied between the three sequential steps, not within the 3x6' as repeat structure.
- **Expected**: 20min E1 + 3 repeats of 6min LT1 with 4min rest + 20min E1.
- **Actual**: Three sequential steps: 20min + 6min + 20min, with 4min rest between each. Loses the 3-rep structure.
- **Fix suggestion**: Within `_build_library_main_steps()` non-repeat path, check each split part for a repeat pattern and generate a repeat step for it.

---

### MISMATCH

#### 1. `bike_fuerza_q2` dose steps: total_useful_time_min = 1 or 2
- **Problem**: `total_useful_time_min` is 1 or 2 minutes for steps like `6×8''`, `8×8''`, `10×8''`, `12×10''`. At face value this is correct (6x8s = 48s < 1min, 12x10s = 2min). But `_build_library_main_steps()` calculates `per_rep_seconds = (1/6)*60 = 10s` per rep, which happens to be correct. However, the `rest_min=3.0` means each rep has 3 minutes of recovery. The Garmin workout will show "6 reps of 10s work + 3min rest" which is correct. **But the total_duration_min is 60-90 min**, which implies a long cool-down tail (30min enfriamiento_min). The mismatch: Garmin workout total = 6*(10s+180s) = ~19min of structure, but session is labeled as 60min. The remaining ~26min of warmup + cooldown is only 45min (15+30). Math checks out for the smallest step: 15min WU + 19min work + 30min CD = 64min vs 60min total. Close enough for step 1, but step 4 `12×10''` = 12*(10+180)=38min + 15+30 = 83min vs 90min total. OK, roughly correct.
- **Verdict**: Downgraded from MISMATCH to **SUSPICIOUS** (see below).

#### 2. `run_escalated_lt1` dose steps: `12-10-8-6' LT1` and similar dash-separated labels
- **Problem**: `_infer_reps_count()` doesn't match the dash format (no `×` character). Falls to `_split_outside_parentheses()` which splits on `+` (none). Then `_parse_library_label_length("12-10-8-6' LT1")` matches minutes pattern `6'` = 360s. **Only a single 6min step** is generated instead of 4 descending intervals (12+10+8+6=36min).
- **Expected**: 4 intervals of decreasing duration: 12min, 10min, 8min, 6min with rest between.
- **Actual**: Single 6-minute step. `useful_duration_min=36` is completely ignored.
- **Fix suggestion**: Detect dash-separated decreasing format `N-M-K-...' ZONE` and generate sequential steps.

#### 3. `bike_cadmax_lt1_combo` dose steps: `10×10''CadMax+3×9'LT1`, etc.
- **Problem**: `_infer_reps_count()` returns 10 (matches `10×`). Divides `useful_duration_min=27` by 10 = 2.7min = 162s per rep. But the label says 10x10s CadMax + 3x9min LT1. Generates **10 reps of 162s** at "mix" zone.
- **Expected**: 10 reps of 10s CadMax sprints + 3 reps of 9min LT1 blocks.
- **Actual**: 10 reps of 2min42s. Completely wrong.
- **Fix suggestion**: Same as BROKEN #3 — detect `+` separator for multi-block workouts.

#### 4. `swim_lt1_broken_sets` dose steps 1-4: `3×(4×100m) c/15''`, `4×(4×150m) c/20''`, etc.
- **Problem**: Parentheses guard in `_infer_reps_count()` returns `None`. Falls to split on `+` (none). `_parse_library_label_length("3×(4×100m) c/15''")` matches distance `100m` = 100. Result: single step of 100m distance. The 3 sets of 4x100m structure is lost.
- **Expected**: 3 macro sets, each with 4 reps of 100m + rest.
- **Actual**: Single 100m step.
- **Fix suggestion**: Handle `N×(M×Dm)` nested repeat pattern.

#### 5. Intensity zones that don't resolve to Garmin targets
- **Problem**: Many dose steps use custom zone labels that don't exist in `_ZONE_LABEL_ALIASES`: `"AEC"`, `"uLT1+VO2"`, `"LT1→LT2"`, `"LT1→LT2b"`, `"HM_pace"`, `"SUB-T"`, `"AEP"`, `"ANC"`, `"mix"`, `"E1+LT1"`, `"LT1-LT2"`. The zone resolver will fail to find a match for these, falling back to `target_type="other"` with a text label. In Garmin, this becomes `"no.target"` — the watch shows no pace/HR/power target for work intervals.
- **Expected**: Concrete pace/HR/power targets on the Garmin watch.
- **Actual**: "No target" for most dose-ladder workouts with non-standard zone labels.
- **Fix suggestion**: Expand `_ZONE_LABEL_ALIASES` to map all custom zones. For compound zones like `"LT1→LT2"`, consider mapping to the dominant zone (LT2) or splitting into sub-steps with different targets.

---

### SUSPICIOUS

#### 1. `run_lt1_extensive` dose step 8: `55' cont`
- **Status**: `_infer_reps_count("55' cont")` returns `None` (no `×`). Falls to `_parse_library_label_length("55' cont")` which matches `55'` = 3300s. Produces a single steady step of 55min. **This is correct**, but the step_type is `"steady"` (since `len(parts)==1`), which maps to `"interval"` stepTypeId=3 in Garmin. Functionally OK.
- **Verdict**: OK but could be cleaner.

#### 2. `bike_lt1_blocks` dose step 5: `55' cont` — same as above. OK.

#### 3. Distance-based labels: `4×800m`, `4×1km`, `3×2km`, etc. (`run_lt2_cruise`)
- **Status**: `_infer_reps_count("4×800m")` returns 4. `useful_duration_min=16`, so `per_rep_seconds = (16/4)*60 = 240s` = 4min per rep. But the label says 800m, not 4 minutes. The Garmin step uses `length_type="time"` with 240s, **NOT** `length_type="distance"` with 800m. The athlete sees "4 reps of 4:00" on their watch instead of "4 reps of 800m".
- **Expected**: Distance-based reps (800m).
- **Actual**: Time-based reps (4:00). Athletes might prefer distance-based for track workouts.
- **Verdict**: SUSPICIOUS — functionally similar but semantically different. For LT2 cruise, 800m at LT2 ~= 3:20-4:00 depending on level, so 4min is a rough approximation.

#### 4. `run_lt1_long_reps` dose steps: `3×2km`, `4×3km`, etc.
- **Same issue as #3**. Distance labels get converted to time-based steps. `3×2km` with 30min useful = 10min per rep. An athlete running 2km at LT1 might take ~9-11min, so 10min is reasonable but imprecise.

#### 5. `swim_aerobic_continuity` dose steps 5-6: `2000m AEC frac.`, `2500m AEC frac.`
- **Problem**: `_infer_reps_count()` returns `None`. `_parse_library_label_length("2000m AEC frac.")` matches `2000m` = 2000. Produces a single step of distance=2000m. But `useful_duration_min=40` and `rest_min=0.25` are ignored. The Garmin workout is just "swim 2000m" with no rest breaks.
- **Expected**: Fractioned 2000m (e.g., 10x200m with 15s rest).
- **Actual**: Single 2000m continuous step.
- **Verdict**: SUSPICIOUS — the "frac." implies fractioned but the builder can't parse this.

#### 6. `swim_css_threshold` dose step 2: `6×150m CSS c/20''`
- **Problem**: `_infer_reps_count("6×150m CSS c/20''")` returns 6. `per_rep_seconds = (16/6)*60 = 160s` each. Creates time-based 160s reps. But label says 150m — swimmers think in distance, not time.
- **Verdict**: SUSPICIOUS — same time-vs-distance issue as running templates.

#### 7. `bike_over_under_threshold` labels: `2×10' O/U`, `3×12' O/U`
- **Problem**: `_infer_reps_count("2×10' O/U")` returns 2. Total 20min / 2 = 10min per rep = 600s. Creates 2 reps of 10min at zone "LT1-LT2". But over-under should alternate between two zones within each rep. The Garmin workout has a flat zone target.
- **Expected**: Each rep should have alternating LT1/LT2 segments within it.
- **Actual**: Each rep is 10min at a single zone "LT1-LT2" (which won't resolve to a concrete target).
- **Verdict**: SUSPICIOUS — structurally wrong for over-under but functionally passable if the description tells the athlete what to do.

#### 8. `run_halfpace_progressive` zone `"HM_pace"`
- **Problem**: `_ZONE_LABEL_ALIASES` and `_library_zone_from_family` don't include `"HM_pace"`. Won't resolve to concrete targets. Falls to `"no.target"`.
- **Verdict**: SUSPICIOUS — workout sends to Garmin with no pace target.

#### 9. `bike_fuerza_q2` total_useful_time_min = 1 or 2
- **Problem**: As described above, the actual work time is <2 minutes for all steps (8-10 seconds per rep). The Garmin workout structure is technically correct (N reps of Xs work + 3min rest), but the per_rep_seconds calculation gives 10s which is correct. However, the intensity_label is "ANC" which won't resolve.
- **Verdict**: SUSPICIOUS — structure OK, zone won't resolve.

#### 10. `run_e2_progressive_medium` — no dose_ladder, calentamiento_min=0, enfriamiento_min=0
- **Problem**: This template has no dose ladder and no warmup/cooldown. The `csv_examples` describe a multi-zone progressive run (`10' E1 + 30' E2 + 20' D2 + 10' LT1 + 10' E1`). When used via `build_library_workout_definition()` with `source="example"`, the label would need to be parsed. The `+` separator would split into 5 parts, each parsed individually. This actually works correctly for simple minute labels. But the zone of each part comes from the template family zone (all parts get the same "SUB-T / Zona media" zone) instead of the zone specified in each part label (E1, E2, D2, LT1).
- **Verdict**: SUSPICIOUS — structurally OK but zones are wrong (all same zone instead of progressive).

#### 11. Templates without dose_ladder or calentamiento/enfriamiento
- **Problem**: 37 templates have no `dose_ladder`. When used via the publishing pipeline with `source="dose"`, they will raise `ValueError("Dose step not found...")`. When used via `source="example"`, they rely on free-text label parsing which is best-effort.
- **Verdict**: SUSPICIOUS — not broken per se, but these templates produce less structured workouts. Many are support/recovery sessions where structure matters less.

---

### OK (templates with dose_ladder verified correct)

These templates have simple `NxT'` or `T' cont` labels that parse correctly:

| template_id | Steps verified | Notes |
|---|---|---|
| `run_lt1_extensive` steps 1-7 | OK | `3×8'`, `3×10'`, etc. — standard NxT' format. Step 8 `55' cont` also OK. |
| `run_lt2_cruise` steps 1-6 | SUSPICIOUS | Distance labels converted to time (see above). Functionally OK. |
| `run_vo2_hills` steps 1-6 | OK | `4×3'`, `5×3'`, etc. — clean format. |
| `run_threshold_continuous` steps 1-6 | OK | `20' cont`, `2×12'`, `25' cont`, etc. — all parse correctly. |
| `run_lt2_short_reps` steps 1-4 | OK | `6×3'`, `8×3'`, `9×3'`, `10×3'` — clean format. Step 5 BROKEN (see above). |
| `bike_lt1_blocks` steps 1-7 | OK | Standard NxT' and T' cont formats. |
| `bike_lt2_halfpace` steps 1-6 | OK | `2×12'`, `3×12'`, etc. |
| `bike_over_under_threshold` steps 1-5 | SUSPICIOUS | Zone label issue (see above). |
| `bike_subthreshold_blocks` steps 1-5 | OK | `4×10' SUB-T`, etc. — text after minutes is ignored by parser. |
| `bike_lt1_to_lt2_blocks` steps 1-3 | OK | `4×6' LT1→LT2` — parser ignores text after `6'`. |
| `swim_aerobic_continuity` steps 1-4 | OK | `3×400m c/30''`, etc. — distance labels converted to time. |
| `swim_css_threshold` steps 1-6 | SUSPICIOUS | Distance labels to time (see above). |
| `swim_lt1_broken_sets` steps 5-6 | SUSPICIOUS | `8×200m LT1 c/20''`, `6×300m LT1 c/25''` — distance to time, but OK. Steps 1-4 BROKEN (nested parens). |
| `run_subthreshold_reps` steps 1-6 | OK | `3×6'`, `2×10'`, etc. |
| `run_halfpace_progressive` steps 1-5 | OK | `3×10'`, `3×12'`, etc. — zone issue separate. |
| `bike_anc_power_sprints` steps 1-4 | OK | `6×8'' ANC`, etc. — seconds parsed correctly. |

---

## Label Parsing Coverage

### Formats that parse correctly

| Format | Example | Result |
|--------|---------|--------|
| `NxT'` | `3×10'` | N reps of T minutes (time-based) |
| `NxT''` | `6×8''` | N reps of T seconds (time-based) |
| `T' cont` | `55' cont` | Single steady step of T minutes |
| `T' ZONE` | `20' cont` | Single steady step (zone text ignored by length parser) |
| `NxDkm` | `3×2km` | N reps of time (useful_duration_min/N), NOT distance |
| `NxDm` | `4×800m` | N reps of time (useful_duration_min/N), NOT distance |
| `A' + B' + C'` | `20'E1+3×6'LT1+20'E1` | Split into parts on `+`, each parsed separately |

### Formats that FAIL or produce wrong results

| Format | Example | Problem |
|--------|---------|---------|
| `Nx(MxT')` | `2×(6×3')` | Parentheses guard returns None reps; falls to single step |
| `Nx(A'X+B'Y)` | `3×(3'LT1+3'LT2)` | Same parentheses issue |
| `NxA'' + MxB' ZONE` | `4×20'' + 6×4' LT1` | First `N×` matches, divides total time incorrectly |
| `NxA''X+MxB'Y` | `10×10''CadMax+3×9'LT1` | Same — first `N×` grabs all the time |
| `N-M-K-J' ZONE` | `15-12-10-8-6' LT1` | No `×`, last number's `'` matched as sole duration |
| `T' ZONE + NxT''/T'' ZONE` | `8' LT1 + 20×20''/15''` | Split works, but second part parsed as single 20s step |
| `NxDm ZONE c/T''` | `3×(4×100m) c/15''` | Parentheses guard; single 100m step |

---

## Zone Mapping Issues

### Zones that resolve correctly (via `_ZONE_LABEL_ALIASES`)
- `LT1` -> maps to athlete's LT1 zone (pace/HR/power)
- `LT2` -> maps to athlete's LT2 zone
- `VO2` -> maps to athlete's VO2 zone
- `CSS` -> maps via alias to LT2
- `SUB-T` -> maps to athlete's SUB-T zone (if exists)

### Zones that DO NOT resolve (become "no.target" in Garmin)
| Zone label | Templates using it | Count |
|---|---|---|
| `AEC` | run_anc_submax_spice, run_escalated_lt1, bike_anc_submax_spice | ~12 steps |
| `AEP` | bike_sit_lt1_progressive, run_anc_vo2_short | ~6 steps |
| `ANC` | bike_fuerza_q2, bike_anc_power_sprints | ~8 steps |
| `uLT1+VO2` | run_uLT1_vo2_combo | 3 steps |
| `LT1→LT2` | run_escalated_intervals (steps 1-2) | 2 steps |
| `LT1→LT2b` | run_escalated_intervals (steps 3-4) | 2 steps |
| `HM_pace` | run_halfpace_progressive | 5 steps |
| `mix` | bike_cadmax_lt1_combo | 4 steps |
| `E1+LT1` | bike_fatmax_intervals | 5 steps |
| `LT1-LT2` | bike_over_under_threshold, bike_lt1_to_lt2_blocks | 8 steps |

**Total: ~55 dose steps with unresolvable zone targets** out of ~120 total.

### Impact
When a zone doesn't resolve, Garmin shows "no target" for the work intervals. The athlete sees the instructions text but has no pace/HR/power guidance on the watch screen. This defeats the purpose of structured workouts.

---

## Warmup/Cooldown Issues

### Warmup generation
- When `calentamiento_min > 0`: generates a warmup step with `length_type="time"`, `length_value=calentamiento_min * 60` seconds, `target_type="easy"`.
- **Correct** for all templates that declare calentamiento_min.
- **Issue**: 37 templates have `calentamiento_min=0` (no warmup generated). Some of these have `calentamiento_template` text set (e.g., `swim_aerobic_continuity` has `calentamiento_template` but `calentamiento_min=0` — the template text would never appear in the workout).

### Templates with calentamiento_template but calentamiento_min=0
| template_id | calentamiento_template | calentamiento_min |
|---|---|---|
| `swim_aerobic_continuity` | "400m suave + 6×50m..." | 0 (inherited default) |
| `swim_css_threshold` | "400m suave + 4×50m..." | 0 |
| `swim_race_pace_specific` | "300m suave + 4×50m..." | 0 |
| `swim_lt1_broken_sets` | "400m suave + 4×50m..." | 0 |
| `swim_pull_snorkel_alignment` | "200m suave + 4×50m..." | 0 |
| `swim_vo2_anaerobic` | "400m suave + 4×50m..." | 0 |
| `swim_speed_turns` | "300m suave + 4×50m..." | 0 |
| `swim_open_water_specific` | "400m suave + 4×50m..." | 0 |
| `swim_recovery_drills` (no template) | — | 0 |
| `swim_varied_aerobic` | "300m suave + 4×50m..." | 0 |
| `swim_aec_base` | "400m suave + 6×50m..." | 0 |
| `swim_team_quality` | "300m suave + técnica..." | 0 |
| `swim_anc_speed_combo` | "400m suave + 4×50m..." | 0 |
| `swim_strength_velocity` | "400m suave + 4×50m..." | 0 |

**14 swim templates** have warmup descriptions but no warmup minutes, so the Garmin workout gets no warmup step. This means the warmup description only appears in the notes, never as a structured step.

### Cooldown generation
Same pattern — `enfriamiento_min` controls whether a cooldown step is generated. All templates with `enfriamiento_min > 0` generate correct cooldown steps.

### Duration math check (warmup + work + rest + cooldown vs total_duration_min)

Selected checks for templates with `total_duration_min` set:

| Template | Step | WU | Work | Rest | CD | Calculated | Declared | Delta |
|---|---|---|---|---|---|---|---|---|
| run_lt1_extensive | step 1: 3×8' | 20 | 24 | 3×1.5=4.5 | 10 | 58.5 | 57 | +1.5 |
| run_lt1_extensive | step 8: 55' cont | 20 | 55 | 0 | 10 | 85 | 87 | -2 |
| run_lt2_cruise | step 1: 4×800m | 20 | 16 | 3×1=3 | 10 | 49 | 49 | 0 |
| run_vo2_hills | step 6: 6×4' | 20 | 24 | 5×4=20 | 10 | 74 | 74 | 0 |
| bike_lt1_blocks | step 7: 70' cont | 0 | 70 | 0 | 0 | 70 | 100 | -30 |
| bike_fuerza_q2 | step 3: 10×8'' | 15 | 1.3 | 9×3=27 | 30 | 73 | 80 | -7 |

**Note**: `bike_lt1_blocks` has no calentamiento/enfriamiento declared (both 0), so the 70' cont becomes a 70min workout. But `total_duration_min=100` implies 30 minutes of warmup+cooldown that don't exist in the structured workout. This is a **silent mismatch** — the Garmin workout will be 70 min, but the planning system thinks it's 100 min.

---

## Critical Path: What Athletes Actually See on Garmin

The end-to-end flow is:
1. PlannedSession -> `build_structured_workout_for_planned_session()` -> `build_library_workout_definition()`
2. WorkoutDefinition -> `resolve_workout_targets()` (replaces zone labels with concrete values)
3. WorkoutDefinition dict -> `workout_definition_to_garmin_payload()` -> Garmin API POST
4. Garmin Connect -> Athlete's watch

### Key observations:
1. **Step ordering in Garmin repeats**: The `_build_garmin_repeat_step()` function puts child step orders BEFORE the repeat group order (children get incremented first, then the group). This is the correct Garmin format.
2. **Intensity mapping**: warmup=WARMUP, cooldown=COOLDOWN, interval/steady/other=ACTIVE, recovery=RECOVERY. This is correct.
3. **End conditions**: time=seconds, distance=meters. Both are passed correctly.
4. **Missing target values**: When `target_type` is `"other"` (unresolved zones), Garmin gets `workoutTargetTypeId: 1` ("no.target") with null values. Athlete sees no guidance.

---

## Recommendations (Priority Order)

### P0 — Fix BROKEN labels (7 templates, ~25 dose steps)
1. **Multi-block labels with `+`**: Detect `A + B` pattern where both A and B can be repeat patterns. Split into independent step groups. Affects: `run_anc_submax_spice`, `bike_anc_submax_spice`, `bike_sit_lt1_progressive`, `run_anc_vo2_short`, `bike_fatmax_intervals`, `bike_cadmax_lt1_combo`.
2. **Nested repeats with `()`**: Detect `N×(M×T')` and `N×(A'+B')` patterns. Either flatten to sequential repeats or implement nested repeat support. Affects: `run_lt2_short_reps` step 5, `run_escalated_intervals` all steps, `swim_lt1_broken_sets` steps 1-4.
3. **Dash-separated descending**: Detect `N-M-K-J' ZONE` format and generate sequential interval steps. Affects: `run_escalated_lt1` all steps.

### P1 — Fix zone resolution (~55 dose steps)
4. Add aliases to `_ZONE_LABEL_ALIASES`: AEC->LT1, AEP->VO2, ANC->VO2, HM_pace->SUB-T, mix->LT1.
5. For compound zones (LT1→LT2, LT1-LT2, E1+LT1): map to the primary zone or split steps with different targets.

### P2 — Fix swim warmup minutes (14 templates)
6. Set `calentamiento_min` to appropriate values (10-15 for most swim templates) so the warmup description actually generates a Garmin step.

### P3 — Distance vs time for track/pool workouts
7. When the label specifies a distance (`800m`, `2km`, `100m`), generate distance-based steps instead of time-based. This requires passing the distance from the label rather than computing time from `useful_duration_min`.
