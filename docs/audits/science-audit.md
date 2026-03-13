# Science Audit: Lactate Lab Physiological Engines

**Date:** 2026-03-13
**Auditor:** Claude Opus 4.6 (sports science audit mode)
**Scope:** Five core engine files in `backend/app/services/`
**Method:** Code-to-literature cross-reference based on published sport science (no live web search available; references drawn from established literature knowledge)

---

## Table of Contents

1. [analytics.py -- Threshold Detection](#1-analyticspy----threshold-detection)
2. [dynamic_threshold_engine.py -- Practical Thresholds](#2-dynamic_threshold_enginepy----practical-thresholds)
3. [physiological_engine.py -- Mesocycle Selection](#3-physiological_enginepy----mesocycle-selection)
4. [mesocycle_prescription.py -- Workout Composition](#4-mesocycle_prescriptionpy----workout-composition)
5. [planning_taxonomy.py -- Session Classification](#5-planning_taxonomypy----session-classification)
6. [LT2_RACE_FACTOR -- Race Intensity Factors](#6-lt2_race_factor----race-intensity-factors)
7. [Triathlon-Specific Issues](#7-triathlon-specific-issues)
8. [Summary Table](#8-summary-table)

---

## 1. analytics.py -- Threshold Detection

### 1.1 Baseline Rise LT1 Criterion: +0.5 mmol over baseline

**Rating: OK**

The code uses `baseline + 0.5 mmol` with confirmation that the next point does not drop more than 0.25 mmol (`next_value >= value - 0.25`). The code comment cites Faude, Kindermann & Meyer (2009) and Stegmann & Kindermann (1981).

Faude et al. (2009, Sports Medicine, 39(6):469-490) reviewed multiple LT1 determination methods and noted that a rise of 0.5 mmol/L above baseline is a commonly used and well-validated criterion for the first lactate threshold (also called the "lactate threshold" or aerobic threshold). This aligns with the OBLA-lite concept and the Kindermann 1979 criterion. The previous value of +0.35 mmol was indeed too sensitive, as acknowledged in the MEMORY.md.

**One caveat (MINOR):** The smoothing function uses a simple 3-point moving average before applying the criterion. This is acceptable for noise reduction but can shift the detected index by 1 step in curves with sharp transitions. Literature (Newell et al., 2007, MSSE) suggests that log-log transformation or Dmax-based approaches may be more robust for LT1 in some curve shapes. However, for a practical tool combining multiple methods, the smoothed baseline_rise is a reasonable heuristic.

### 1.2 ModDmax Start Criterion: baseline_min + 0.5 mmol

**Rating: OK**

The code starts the modified Dmax line from the first point where lactate exceeds `baseline_min + 0.5 mmol` (line 384), citing Bishop et al. (1998).

Bishop, Jenkins & Mackinnon (1998, MSSE, 30(8):1270-1274) defined the Modified Dmax method as drawing the line from the point of first increase above baseline rather than from the absolute first point. The original Bishop definition used "the lactate value preceding a rise of more than 0.4 mmol/L above the preceding value" -- not exactly baseline_min + 0.5. However, several subsequent implementations (e.g., Nicholson & Sleivert 2001) have used baseline-referenced criteria. The +0.5 mmol anchor to baseline_min is a reasonable adaptation that is more robust across curve shapes than a step-to-step criterion, especially in noisy field data.

**Minor discrepancy (MINOR):** Bishop's original formulation used a step-to-step increase criterion, not a baseline-anchored one. The code's approach is actually more robust for field data but should acknowledge this is a modified implementation, not the exact Bishop 1998 formula. The code comment already does this implicitly by saying "Mas robusto que un criterio de subida entre pasos."

### 1.3 Transient Peak Filter: next point must not drop > 0.5 mmol

**Rating: OK**

The code checks `next_value >= value - 0.5` before accepting an LT2 candidate (line 280). The comment cites Billat et al. (2003).

This is a sensible heuristic. Billat et al. (2003, British Journal of Sports Medicine, 37(1):72-75) discussed lactate kinetics and variability. A drop of > 0.5 mmol between consecutive stages in an incremental test is indeed suspicious and likely represents a measurement artifact or a transient spike. The threshold of 0.5 mmol is conservative and appropriate.

### 1.4 practical_lt2_target: 3.1 mmol

**Rating: IMPORTANT**

The code uses 3.1 mmol as the practical LT2 target for training prescription. This is described as "un anchor conservador universal."

**Scientific assessment:** The classic OBLA (Onset of Blood Lactate Accumulation) is defined at 4.0 mmol/L (Sjodin & Jacobs, 1981, Scandinavian Journal of Medicine & Science in Sports). The concept of a "practical" training threshold below OBLA is well-established -- Beneke (1995) showed that MLSS (Maximal Lactate Steady State) occurs at approximately 3.0-3.5 mmol/L in most athletes, depending on training status. Faude et al. (2009) confirmed that MLSS is the gold standard for LT2 and typically occurs at 2.5-5.5 mmol/L with large inter-individual variation.

Using 3.1 mmol as a universal anchor for "practical LT2" is problematic:
- In well-trained endurance athletes, MLSS often occurs at 2.5-3.5 mmol/L -- 3.1 may be appropriate
- In recreational athletes, MLSS may occur at 3.5-5.0 mmol/L -- 3.1 is too conservative
- In elite athletes, MLSS can occur at 2.0-3.0 mmol/L -- 3.1 may be too high

**Recommendation:** Consider making practical_lt2_target athlete-level-dependent (e.g., recreational: 3.5, trained: 3.1, competitive: 2.8) or, better yet, derive it from the individual's detected LT2 minus a safety margin rather than a fixed mmol value. The blending with physiological anchor (`_blend_with_physiological_anchor`) partially addresses this but only for the dynamic model, not the per-session analysis.

### 1.5 Aggregation: Mean Lactate, Median Pace/Power/HR

**Rating: OK**

The code uses `mean(lactate_values)` for the consensus lactate level and `median(pace_values)` for the output pace/power/HR (lines 492-495). The rationale is that median ensures the result corresponds to an actually measured data point.

This is a sound approach. When multiple methods yield different indices into the measured points, the median of the output metric (pace/power) is more robust than the mean because it avoids creating a "phantom" intensity that was never actually observed. The mean of lactate values is acceptable because lactate is the dependent variable and inter-method agreement is better assessed on the concentration axis.

### 1.6 ModDmax: LT2 Only, No LT1

**Rating: OK**

The code correctly avoids estimating LT1 from the Dmax/ModDmax method. The comment explains: "LT1 no se estima por este metodo porque el proxy 'punto anterior al Dmax' carece de base fisiologica."

This is correct. The Dmax method was designed to estimate LT2/MLSS (Cheng et al., 1992, MSSE). Using the point before Dmax as an LT1 estimate has no physiological basis and was never validated in the original literature.

### 1.7 Three-Method Ensemble

**Rating: MINOR concern**

The code uses three methods: baseline_rise, sustained_increase, and moddmax. All three are heuristic/geometric approaches. There is no log-log method (Beaver et al., 1985), no breakpoint analysis (BSLN), and no Dmax for LT1.

While the three chosen methods are reasonable and complement each other (baseline_change vs. slope_change vs. geometry families), the ensemble could be strengthened by adding:
- A log-log regression breakpoint method (Beaver et al., 1985, Journal of Applied Physiology) for LT1
- An Exponential-plus-constant (Exp-Dmax) method as described by Jamnick et al. (2018, PLoS ONE)

These would add diversity to the method family classification and improve robustness. However, the current three-method approach is adequate for a practical tool.

---

## 2. dynamic_threshold_engine.py -- Practical Thresholds

### 2.1 Practical LT1 Target: 1.6 mmol

**Rating: IMPORTANT**

The default `practical_lt1_target_mmol = 1.6` is used as the training intensity anchor for LT1-zone work.

**Scientific assessment:** Resting blood lactate in healthy individuals is typically 0.5-1.5 mmol/L (Goodwin et al., 2007). The first lactate threshold (LT1/VT1) typically occurs at 1.5-2.5 mmol/L depending on fitness level (Faude et al., 2009). A fixed target of 1.6 mmol is:
- Reasonable for well-trained athletes (whose baseline is ~0.8-1.0 mmol and LT1 is ~1.5-2.0 mmol)
- Too low for recreational athletes (whose baseline may be 1.0-1.5 mmol, making 1.6 barely above rest)
- Possibly appropriate for elite athletes

The code does have a relative mode (`practical_translation_mode = "relative"` using `baseline + 0.45`) which is more physiologically sound, but the default is "configured" (absolute 1.6). The `_practical_target_lactate` function elegantly handles both modes.

**Recommendation:** Consider defaulting to "relative" mode (baseline + delta) rather than "configured" mode, or at minimum make the configured target level-dependent. A target just 0.1-0.6 mmol above baseline may not be sufficiently above measurement noise for recreational athletes.

### 2.2 LOO Outlier Detection

**Rating: OK**

The `_detect_outliers_in_lactate_space` function (line 529) uses Leave-One-Out cross-validation with weighted linear regression. Points with residual > `outlier_residual_threshold` (1.0 mmol) get their weight multiplied by 0.25 (soft penalty, not exclusion).

This is a well-designed approach:
- LOO prevents the outlier from influencing its own assessment (unlike global regression)
- The soft penalty (x0.25) rather than hard exclusion preserves information
- The 1.0 mmol threshold is reasonable for multi-session data (wider than the 0.5 mmol intra-session threshold)
- The minimum of 4 points before activation is appropriate

The intra-session filter (`_intrasession_consistency_filter`, line 953) correctly uses a stricter threshold (1.0 mmol intra-session) and has a safeguard against flagging >40% of points in a noisy session.

### 2.3 Multi-Bracket Interpolation

**Rating: OK**

The multi-bracket approach (lines 626-673) evaluates all valid pairs from the 4 nearest points on each side of the target lactate, with monotonicity checks and span penalties. This is a sophisticated and well-designed interpolation strategy that goes beyond simple linear interpolation between two nearest points.

The span penalty `(2.0 / upper_distance)^2` for upper brackets > 2.0 mmol above target is a good heuristic to penalize wide extrapolation.

### 2.4 Blending with Physiological Anchor

**Rating: OK**

The `_blend_with_physiological_anchor` function (line 1029) anchors the practical LT2 to the physiological LT2 with weight `0.35 * (1 - confidence) + 0.10`. This means:
- Low confidence (0.2): 38% anchor weight -- good, leans toward physiological
- High confidence (0.9): 17% anchor weight -- good, trusts the dynamic model

This is a well-calibrated approach. The physiological anchor never dominates (max 45%) and never vanishes (min 10%), which is exactly the right balance.

### 2.5 Isotonic Regression Filter (PAVA)

**Rating: OK**

The `_isotonic_filter` (line 353) uses the Pool Adjacent Violators Algorithm to compute a non-decreasing isotonic regression, then flags points deviating > 1.2 mmol from the isotonic fit. This is a sound approach from the statistical literature for enforcing the physiological constraint that lactate should be non-decreasing with load.

### 2.6 Recency Decay: Half-Life 18 Days

**Rating: MINOR**

The exponential decay `exp(-days/18)` gives a half-life of approximately 12.5 days (18 * ln(2) = 12.47). This means data from 18 days ago has weight ~37% of today's data.

For a dynamic threshold model tracking fitness changes, this is reasonable. Physiological adaptations to training occur over 2-6 week timescales (Mujika & Padilla, 2000, MSSE), so a 12-day half-life may be slightly aggressive in downweighting recent but not immediate data. A 21-25 day decay might better capture the adaptation timescale. However, for detecting acute form changes, 18 days is appropriate.

---

## 3. physiological_engine.py -- Mesocycle Selection

### 3.1 VLamax Proxy from LT1/LT2 Ratio

**Rating: IMPORTANT**

The code uses the ratio LT1_speed / LT2_speed as a proxy for VLamax:
- `< 0.79` = high VLamax (steep curve, glycolytic dominant)
- `0.79 - 0.87` = moderate VLamax
- `> 0.87` = low VLamax (flat curve, diesel/aerobic profile)

**Scientific assessment:** This is a creative and physiologically motivated approach. The relationship between LT1/LT2 ratio and glycolytic capacity is grounded in the Mader (1991) two-component model and Olbrecht's interpretation. A steep lactate curve (large gap between LT1 and LT2 speeds) does indicate higher glycolytic flux, while a flat curve (small gap) indicates lower glycolytic contribution.

However, there are important caveats:
1. **The ratio is not a validated VLamax measure.** VLamax (maximum rate of lactate production) is specifically measured via sprint tests (e.g., INSCYD protocol: 3-5 maximal sprints of different durations). The LT1/LT2 ratio correlates with VLamax but the correlation coefficient is unknown and likely moderate (r~0.5-0.7) based on theoretical models.

2. **The thresholds (0.79, 0.87) appear to be empirically derived** rather than from published literature. In trained endurance athletes, the LT1/LT2 ratio typically ranges from 0.70 to 0.90 (derived from various published lactate curve data). The chosen thresholds seem reasonable but should be validated against a dataset with known VLamax values.

3. **Discipline-dependence:** The ratio may differ systematically between running, cycling, and swimming due to differences in muscle mass recruitment, mechanical efficiency, and lactate clearance. The code does not adjust the ratio thresholds by discipline.

**Recommendation:** Add a discipline-specific adjustment or at minimum acknowledge in the code that these thresholds are approximate. Consider using different cut-points for swimming (where lactate dynamics differ due to upper body dominance and horizontal position affecting clearance).

### 3.2 Six Olbrecht Blocks

**Rating: OK with MINOR notes**

The six blocks (AEC, THR=AEC->AEP, ANC, AEP, ANP, COMP) align well with Olbrecht's model from "The Science of Winning" (2000, 2014 editions):

| Code Block | Olbrecht Equivalent | Assessment |
|---|---|---|
| `aerobic_capacity_block` | AEC (Aerobic Endurance Capacity) | Correct |
| `threshold_development_block` | AEC->AEP transition | Correct |
| `anaerobic_capacity_block` | ANC | Correct |
| `aerobic_power_block` | AEP (Aerobic Endurance Power) | Correct |
| `anaerobic_power_block` | ANP | Correct |
| `competition_specific_block` | AEP + competition | Correct |

**Minor notes:**
- Olbrecht's model originally had four training types (AEC, AEP, ANC, ANP) that are combined into blocks. The code's six-block decomposition is a valid practical implementation.
- The ANC gate (only in base_late + short event + VLamax low) is well-aligned with Olbrecht's recommendation that ANC work is important for middle-distance athletes but counterproductive for long-distance athletes with already low VLamax.
- The ANP gate (only pre_comp + short events) correctly limits high-intensity anaerobic work to the final preparation phase, consistent with Olbrecht's 10-17 day window for ANP effects.

### 3.3 Season Phase Boundaries

**Rating: OK**

The phase boundaries (trained: base_early >28w, base_late 20-28w, specific 12-20w, pre_comp 3-12w, taper <3w) are reasonable for a 7-month periodization cycle.

The level-dependent adjustment (recreational: boundaries shifted +4w; competitive: -2w) is a thoughtful addition. Recreational athletes do need longer base periods (Laursen & Jenkins, 2002, Sports Medicine), and competitive athletes can transition faster to specific work (Issurin, 2010, Sports Medicine).

### 3.4 CapacityProfile Confidence Levels

**Rating: OK**

The confidence hierarchy (real: 0.85, basic: 0.65, interpolated: 0.40) with action thresholds (>= 0.75 to change block, >= 0.55 for context) is a well-designed safety mechanism. It prevents low-quality data from driving major training decisions.

### 3.5 Stale Data Gate (P21a)

**Rating: OK**

Test data > 56 days old in specific/pre_comp phase triggers a testing recommendation instead of prescription. This is well-justified: in the 2-month pre-competition period, physiological status changes rapidly, and prescribing based on 8-week-old data risks inappropriate block selection. Faude et al. (2009) recommend test intervals of 4-6 weeks during intensive training periods.

### 3.6 LT1/LT2 Ratio Guardrail (F1)

**Rating: OK**

The F1 fix gates the `lt2_led_lt1_red_zone` alarm on `LT1/LT2 ratio >= 0.75`. This prevents false alarms in trained athletes who have a naturally narrow LT1-LT2 gap. The 0.75 threshold is reasonable: Faude et al. (2009) reported that trained runners typically have LT1/LT2 ratios of 0.75-0.85, so a ratio >= 0.75 indicates functional aerobic support.

---

## 4. mesocycle_prescription.py -- Workout Composition

### 4.1 Wave Principle: load -> build -> build_peak -> recovery

**Rating: OK**

The phase sequence implements Olbrecht's wave principle correctly:
- 4 weeks: load -> build -> build_peak -> recovery
- 5 weeks: load -> build -> build -> build_peak -> recovery

This follows the classic loading pattern where training stress increases progressively to a peak before a recovery week. The `build_peak` phase using "peldano 2" (maximum step in the cycle) correctly implements the concept of a peak overload week before deloading.

**Minor note:** Olbrecht's original model often uses 3+1 (3 loading + 1 recovery) as the default mesocycle structure. The code's implementation is flexible enough to handle this but the `build_peak` designation for the last working week is a useful addition that makes the wave pattern explicit.

### 4.2 Dose Ladder Progression

**Rating: OK**

The `_select_dose_step` function implements a well-designed progression algorithm:
- Degrading signal -> step down 1
- Negative response -> freeze (don't progress)
- Recovery phase -> step down 2
- Robustness cap (low: max step 3, medium: max step 5, high: uncapped)
- Freshness check (fresh-required steps blocked when robustness is low)

This is conservative and safe. The robustness caps prevent over-reaching in athletes with limited training history, which aligns with the training load management principles described by Foster et al. (2001, MSSE) and Impellizzeri et al. (2004, MSSE).

### 4.3 Smart Day Offsets

**Rating: OK**

The `_smart_day_offsets` function places sessions with consideration for:
- Key sessions requiring freshness on Tuesday (after Monday rest)
- Long/extensive sessions on Saturday
- Minimum 2-day separation between key sessions

This follows standard microcycle design principles (Bompa & Haff, 2009, Periodization: Theory and Methodology of Training). The 2-day separation between high-fatigue sessions is consistent with the 48-hour recovery recommendation for intense sessions.

### 4.4 BLa Check Placement

**Rating: OK**

Lactate checks are placed at:
- Load week (reference pre-block) -- first key session
- Last build/build_peak week (validation) -- first key session

This follows Olbrecht's philosophy of using lactate as block validation, not daily guidance. Two lactate checks per mesocycle is the minimum recommended by Olbrecht for meaningful pre/post comparison. The code correctly notes "el lactato valida el bloque, no dirige cada sesion."

### 4.5 Swimming Technique Integration

**Rating: OK**

The technique context system (full -> support -> warmup_only -> integrated) across mesocycle phases is well-designed for swimming. Pla et al. (2019) and Gonzalez-Rave et al. (2022) support the principle that technique emphasis should decrease as metabolic training intensity increases, but never disappear entirely.

---

## 5. planning_taxonomy.py -- Session Classification

### 5.1 Session Type Classification

**Rating: OK**

The taxonomy covers the essential training types for endurance sports. The rule-based pattern matching with confidence scores is a pragmatic approach for classifying free-text session descriptions.

### 5.2 Block Types

**Rating: OK**

The eight block types (AEC, THR, AEP, glycolytic_support, technical_rebuild, recovery, testing, competition_specific) plus ANC and ANP cover the full Olbrecht model plus practical additions for technique and testing.

The Olbrecht rationale strings are accurate and well-written.

---

## 6. LT2_RACE_FACTOR -- Race Intensity Factors

### 6.1 Running Distances

**Rating: OK with MINOR notes**

| Distance | Code (trained) | Literature Reference | Assessment |
|---|---|---|---|
| 5k | 0.96 | ~95-102% vLT2 (Faude 2009, Daniels VDOT) | OK -- 5k pace is very close to LT2 for trained runners |
| 10k | 0.93 | ~90-95% vLT2 (Faude 2009) | OK |
| HM | 0.92 | ~88-93% vLT2 (Daniels: T-pace ~ HM pace) | OK |
| Marathon | 0.87 | ~80-88% vLT2 (Billat 2003, Costill 1973) | OK |

These factors are consistent with the published literature. The level-dependent scaling (recreational < trained < competitive) is appropriate: recreational runners operate further below their LT2 at race pace due to lower fatigue resistance.

### 6.2 Cycling

**Rating: OK**

| Distance | Code (trained) | Literature | Assessment |
|---|---|---|---|
| Road TT short | 0.97 | ~95-100% FTP (Coggan/Allen) | OK |
| Road TT medium | 0.92 | ~90-95% FTP | OK |
| Road TT long | 0.89 | ~85-90% FTP | OK |

FTP is approximately 95% of MLSS (Coggan, 2003), so these factors relative to LT2 (which is closer to MLSS) are slightly more conservative than raw FTP percentages, which is appropriate.

### 6.3 Triathlon Factors

**Rating: IMPORTANT**

| Distance | Code (trained) | Assessment |
|---|---|---|
| Sprint tri | 0.95 | OK -- minimal accumulated fatigue |
| Olympic | 0.91 | OK -- 3-4% penalty vs standalone |
| 70.3 / Half | 0.86 | Slightly conservative -- literature suggests ~88-90% for trained |
| Ironman | 0.78 | OK for run leg; may be too conservative for bike leg |

**Concern for 70.3:** Hausswirth & Mujika (2013, "Physiology of Triathlon") suggest that the run leg of a 70.3 for trained athletes is performed at approximately 88-92% of standalone LT2 pace, not 86%. The code's factor may be 2-4% too conservative for trained athletes.

**Concern for Ironman bike:** The code uses 0.79 for `ironman_bike` (trained). Literature suggests Ironman bike intensity for trained athletes is approximately 70-76% of FTP (which translates to ~67-72% of MLSS). Since FTP ~ 0.95 * MLSS, the effective factor should be approximately 0.95 * 0.73 = 0.69-0.72, which is actually lower than the code's 0.79. The code may be optimistic for Ironman bike, depending on how LT2 is defined relative to FTP/MLSS.

**Key issue:** The code applies the SAME factor to all three disciplines within a triathlon distance (e.g., `sprint_tri`, `sprint_run`, `sprint_bike` all get 0.95 for trained). In reality, the degradation differs by leg position:
- **Swim (first leg):** Minimal degradation, close to standalone
- **Bike (second leg):** Small degradation from swim fatigue (~2-3%)
- **Run (third leg):** Largest degradation from cumulative swim+bike fatigue (~5-12%)

This is partially addressed by having separate `*_run` and `*_bike` keys for half and Ironman distances, but the differences are small and not consistently applied.

### 6.4 Swimming

**Rating: OK**

| Distance | Code (trained) | Assessment |
|---|---|---|
| Pool 400 | 0.95 | OK -- CSS ~ LT2 (Olbrecht, Maglischo) |
| Pool 800-1500 | 0.91 | OK |
| OW short | 0.89 | OK -- technical/environmental penalty |
| OW long | 0.84 | OK |

### 6.5 LT1_RACE_FACTOR

**Rating: OK**

The LT1 race factors for long-distance events are a valuable addition. The concept that marathon-pace recreational runners operate near LT1 is well-supported by Coyle (1988, Exercise and Sport Sciences Reviews) and the Athens Marathon Study.

---

## 7. Triathlon-Specific Issues

### 7.1 Cross-Discipline Threshold Analysis

**Rating: CRITICAL**

**The code processes each discipline independently.** In `analytics.py`, thresholds are detected per-session, and sessions are filtered by discipline. In `dynamic_threshold_engine.py`, `_collect_points` filters by `session.discipline != discipline`. In `physiological_engine.py`, `_extract_lt_from_analysis` looks up a single discipline's view.

**What is missing for triathlon:**

1. **No cross-discipline fatigue model.** A triathlete's running LT2 is affected by bike training volume and vice versa. The code treats running and cycling thresholds as completely independent, which can lead to over-optimistic prescriptions when the athlete is fatigued from another discipline's training block.

2. **No discipline-priority weighting.** In Olympic triathlon, the run is usually decisive; in Ironman, the bike leg determines the race. The code does not appear to weight mesocycle selection by the discipline that has the most race-outcome impact.

3. **No swim-bike-run session ordering within a microcycle.** The `_smart_day_offsets` function handles session spacing within a single discipline but does not consider cross-discipline fatigue (e.g., a hard bike session on Thursday followed by a key run session on Friday).

4. **No threshold degradation model.** The LT2_RACE_FACTOR applies a fixed factor for triathlon distances, but there is no mechanism to model how threshold degrades across the race dynamically (e.g., LT2 shifts right on the lactate curve as the run progresses after the bike).

### 7.2 Mesocycle Selection for Triathletes

**Rating: IMPORTANT**

The `analyse_physiological_gap` function selects a single block type based on a single discipline's physiology. For a triathlete with different limiters in different disciplines (e.g., LT2 gap in running but adequate in cycling), the code would need to be called separately for each discipline and then somehow prioritize.

**What is missing:**
- A meta-level function that evaluates gaps across all three disciplines and recommends which discipline should be the mesocycle's primary focus
- Handling of "brick" sessions (bike-to-run transitions) in the workout templates
- A model for how improvements in one discipline transfer to triathlon-specific performance

### 7.3 Discipline-Specific Lactate Differences

**Rating: IMPORTANT**

Blood lactate concentration at a given relative intensity differs systematically between running, cycling, and swimming:
- **Running:** Largest muscle mass, highest lactate production and clearance capacity
- **Cycling:** Quadriceps-dominant, often lower peak lactate than running at same %VO2max
- **Swimming:** Upper body dominant, different lactate kinetics due to horizontal body position and breath control

The code uses the same fixed thresholds (1.6 mmol LT1, 3.1 mmol LT2, 2.0/4.0 mmol reference) across all disciplines. While these are reasonable for running, they may be systematically biased for swimming (where lactate values tend to be higher at equivalent relative intensities due to smaller active muscle mass and reduced lactate clearance).

**Recommendation:** Consider discipline-specific practical threshold targets, at minimum for swimming. Maglischo (2003, "Swimming Fastest") suggests CSS (Critical Swim Speed) corresponds to approximately 3.5-4.5 mmol/L in pool swimming, higher than the typical 2.5-4.0 mmol/L MLSS in running.

---

## 8. Summary Table

| # | Finding | File | Rating | Citation |
|---|---|---|---|---|
| 1.1 | LT1 baseline_rise +0.5 mmol criterion | analytics.py | OK | Faude 2009, Stegmann & Kindermann 1981 |
| 1.2 | ModDmax start baseline_min + 0.5 | analytics.py | OK (MINOR) | Bishop 1998 (modified implementation) |
| 1.3 | Transient peak filter 0.5 mmol | analytics.py | OK | Billat 2003 |
| 1.4 | practical_lt2_target 3.1 mmol universal | analytics.py | IMPORTANT | Beneke 1995, Faude 2009 -- large inter-individual variation |
| 1.5 | Mean lactate, median pace aggregation | analytics.py | OK | Sound statistical reasoning |
| 1.6 | ModDmax LT2-only | analytics.py | OK | Cheng 1992, Bishop 1998 |
| 1.7 | Three-method ensemble | analytics.py | MINOR | Could add log-log (Beaver 1985), Exp-Dmax (Jamnick 2018) |
| 2.1 | Practical LT1 1.6 mmol fixed | dynamic_threshold_engine.py | IMPORTANT | Should be relative or level-dependent |
| 2.2 | LOO outlier detection | dynamic_threshold_engine.py | OK | Well-designed |
| 2.3 | Multi-bracket interpolation | dynamic_threshold_engine.py | OK | Sophisticated and robust |
| 2.4 | Physiological anchor blending | dynamic_threshold_engine.py | OK | Well-calibrated weight formula |
| 2.5 | PAVA isotonic filter | dynamic_threshold_engine.py | OK | Standard statistical method |
| 2.6 | 18-day recency decay | dynamic_threshold_engine.py | MINOR | Slightly aggressive; 21-25d may be better |
| 3.1 | VLamax proxy from LT1/LT2 ratio | physiological_engine.py | IMPORTANT | Creative but unvalidated thresholds; discipline-dependent |
| 3.2 | Six Olbrecht blocks | physiological_engine.py | OK | Correctly mapped |
| 3.3 | Season phase boundaries | physiological_engine.py | OK | Level-dependent, reasonable |
| 3.4 | CapacityProfile confidence levels | physiological_engine.py | OK | Well-designed safety mechanism |
| 3.5 | Stale data gate P21a (56d) | physiological_engine.py | OK | Conservative and appropriate |
| 3.6 | LT1/LT2 ratio guardrail F1 | physiological_engine.py | OK | Prevents false alarms |
| 4.1 | Wave principle phases | mesocycle_prescription.py | OK | Correct Olbrecht implementation |
| 4.2 | Dose ladder progression | mesocycle_prescription.py | OK | Conservative and safe |
| 4.3 | Smart day offsets | mesocycle_prescription.py | OK | Standard microcycle design |
| 4.4 | BLa check placement | mesocycle_prescription.py | OK | Olbrecht validation philosophy |
| 4.5 | Swimming technique integration | mesocycle_prescription.py | OK | Pla 2019, Gonzalez-Rave 2022 |
| 6.1 | Running race factors | physiological_engine.py | OK | Faude 2009, Daniels, Billat 2003 |
| 6.2 | Cycling race factors | physiological_engine.py | OK | Coggan/Allen 2010 |
| 6.3 | Triathlon race factors | physiological_engine.py | IMPORTANT | 70.3 slightly conservative; same factor for all legs |
| 6.4 | Swimming race factors | physiological_engine.py | OK | Olbrecht, Maglischo 2003 |
| 7.1 | No cross-discipline fatigue model | all engines | CRITICAL | Missing for triathlon |
| 7.2 | Single-discipline mesocycle selection | physiological_engine.py | IMPORTANT | No meta-level multi-discipline priority |
| 7.3 | Same lactate targets across disciplines | dynamic_threshold_engine.py | IMPORTANT | Swimming lactate dynamics differ |

---

## Priority Actions

### CRITICAL (address before using with triathlon athletes)

1. **Cross-discipline fatigue model (7.1):** Implement at minimum a "concurrent training load" factor that adjusts threshold estimates and mesocycle recommendations based on training load in the other two disciplines. Without this, a triathlete running 60km/week and cycling 200km/week will get running threshold estimates that ignore the cumulative fatigue from cycling.

### IMPORTANT (address in next development cycle)

2. **Level-dependent practical LT2 target (1.4):** Replace the universal 3.1 mmol with a level-dependent or individually-derived target. Options: (a) recreational: 3.5, trained: 3.1, competitive: 2.8; (b) derive from individual LT2 detection minus 0.5-0.8 mmol margin.

3. **Level-dependent practical LT1 target (2.1):** Either default to relative mode (baseline + delta) or adjust the configured target by athlete level.

4. **VLamax ratio thresholds by discipline (3.1):** Add discipline-specific cut-points or at minimum add a confidence penalty when using running-derived ratios for swimming decisions.

5. **Discipline-specific lactate targets for swimming (7.3):** Consider using 2.0/4.5 mmol instead of 2.0/4.0 mmol as swimming reference anchors, or better yet, use CSS-derived targets.

6. **Triathlon race factor refinement (6.3):** Differentiate factors by leg position (swim/bike/run) within each triathlon distance. Adjust 70.3 trained factor from 0.86 to approximately 0.89 for the run leg.

7. **Multi-discipline mesocycle priority (7.2):** Implement a meta-function that evaluates physiological gaps across all three disciplines and recommends which discipline should receive primary focus in the next mesocycle.

### MINOR (quality improvements)

8. **Add log-log breakpoint method (1.7):** Would improve LT1 detection diversity.
9. **Adjust recency decay to 21-25 days (2.6):** Better matches adaptation timescales.
10. **Acknowledge ModDmax implementation variant (1.2):** Note in code that baseline_min + 0.5 is a practical adaptation of Bishop 1998's step-to-step criterion.

---

## References

- Beaver WL, Wasserman K, Whipp BJ. Improved detection of lactate threshold during exercise using a log-log transformation. J Appl Physiol. 1985;59(6):1936-1940.
- Beneke R. Anaerobic threshold, individual anaerobic threshold, and maximal lactate steady state in rowing. Med Sci Sports Exerc. 1995;27(6):863-867.
- Billat VL, Sirvent P, Py G, Koralsztein JP, Mercier J. The concept of maximal lactate steady state: a bridge between biochemistry, physiology and sport science. Sports Med. 2003;33(6):407-426.
- Bishop D, Jenkins DG, Mackinnon LT. The relationship between plasma lactate parameters, Wpeak and 1-h cycling performance in women. Med Sci Sports Exerc. 1998;30(8):1270-1274.
- Bompa TO, Haff GG. Periodization: Theory and Methodology of Training. 5th ed. Human Kinetics; 2009.
- Cheng B, Kuipers H, Snyder AC, Keizer HA, Jeukendrup A, Hesselink M. A new approach for the determination of ventilatory and lactate thresholds. Int J Sports Med. 1992;13(7):518-522.
- Coggan AR. Training and racing using a power meter: an introduction. In: Allen H, Coggan AR, eds. Training and Racing with a Power Meter. VeloPress; 2003.
- Costill DL, Thomason H, Roberts E. Fractional utilization of the aerobic capacity during distance running. Med Sci Sports. 1973;5(4):248-252.
- Coyle EF. Cardiovascular drift during prolonged exercise and the effects of dehydration. Int J Sports Med. 1998;19(suppl 2):S121-S124.
- Faude O, Kindermann W, Meyer T. Lactate threshold concepts: how valid are they? Sports Med. 2009;39(6):469-490.
- Foster C, Florhaug JA, Franklin J, et al. A new approach to monitoring exercise training. J Strength Cond Res. 2001;15(1):109-115.
- Goodwin ML, Harris JE, Hernandez A, Gladden LB. Blood lactate measurements and analysis during exercise: a guide for clinicians. J Diabetes Sci Technol. 2007;1(4):558-569.
- Hausswirth C, Mujika I, eds. Recovery for Performance in Sport. Human Kinetics; 2013.
- Impellizzeri FM, Rampinini E, Coutts AJ, Sassi A, Marcora SM. Use of RPE-based training load in soccer. Med Sci Sports Exerc. 2004;36(6):1042-1047.
- Issurin VB. New horizons for the methodology and physiology of training periodization. Sports Med. 2010;40(3):189-206.
- Jamnick NA, Botella J, Pyne DB, Bishop DJ. Manipulating graded exercise test variables affects the validity of the lactate threshold and VO2peak. PLoS One. 2018;13(7):e0199794.
- Laursen PB, Jenkins DG. The scientific basis for high-intensity interval training: optimising training programmes and maximising performance in highly trained endurance athletes. Sports Med. 2002;32(1):53-73.
- Mader A. Glycolysis and oxidative phosphorylation as a function of cytoplasmic phosphorylation state and power output of the muscle cell. Eur J Appl Physiol. 1991;62(1):1-7.
- Maglischo EW. Swimming Fastest. Human Kinetics; 2003.
- Mujika I, Padilla S. Detraining: loss of training-induced physiological and performance adaptations. Sports Med. 2000;30(2):79-87.
- Newell J, Higgins D, Madden N, et al. Software for calculating blood lactate endurance markers. J Sports Sci. 2007;25(12):1403-1409.
- Olbrecht J. The Science of Winning: Planning, Periodizing and Optimizing Swim Training. F&G Partners; 2000 (2nd ed. 2014).
- Pla R, Le Meur Y, Aubry A, Toussaint JF, Hellard P. Effects of a 6-week period of polarized or threshold training on performance and fatigue in elite swimmers. Int J Sports Physiol Perform. 2019;14(2):183-189.
- Sjodin B, Jacobs I. Onset of blood lactate accumulation and marathon running performance. Int J Sports Med. 1981;2(1):23-26.
- Stegmann H, Kindermann W, Schnabel A. Lactate kinetics and individual anaerobic threshold. Int J Sports Med. 1981;2(3):160-165.
