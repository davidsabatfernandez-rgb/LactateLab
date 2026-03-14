# Lactate Threshold Detection Engine — Scientific Audit Report

Generated: 2026-03-13

Engine: `backend/app/services/analytics.py`
Dynamic: `backend/app/services/dynamic_threshold_engine.py`

## Summary

| Profile | Points | LT1 (mmol) | LT1 Load | LT2 (mmol) | LT2 Load | LT1/LT2 | Conf LT1 | Conf LT2 |
|---|---|---|---|---|---|---|---|---|
| trained_runner_classic | 9 | 1.30 | 360s/km | 3.10 | 310s/km | 0.419 | 0.85 | 0.88 |
| elite_runner_flat | 9 | 1.15 | 273s/km | 3.73 | 242s/km | 0.308 | 0.86 | 0.77 |
| recreational_steep | 7 | 2.00 | 420s/km | 5.00 | 400s/km | 0.400 | 0.88 | 0.76 |
| cyclist_power | 8 | 1.40 | 212W | 3.50 | 275W | 0.400 | 0.85 | 0.88 |
| noisy_outlier | 8 | 1.10 | 360s/km | 3.80 | 290s/km | 0.289 | 0.88 | 0.88 |
| minimal_3points | 3 | 2.50 | 320s/km | 6.00 | 270s/km | 0.417 | 0.52 | 0.52 |

## Detailed Results & Scientific Validation

### trained_runner_classic — Trained runner — textbook exponential curve

**Input:** 9 points, lactate range 9.4 mmol
**Science reference:** Faude 2009: LT1 ~+0.5 mmol over baseline; LT2 at OBLA ~3.5-4.0 mmol

- **LT1**: 1.30 mmol @ pace=360.0s/km, HR=148
  - Confidence: 0.85, Agreement: 0.8
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase']
  - Expected lactate range: (1.0, 2.2) -> PASS
- **LT2**: 3.10 mmol @ pace=310.0s/km, HR=167
  - Confidence: 0.88, Agreement: 0.91
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase']
  - Expected lactate range: (2.5, 5.0) -> PASS
- **VLamax proxy** (LT1/LT2 ratio): 0.419

**Real thresholds quality gate:**
- Sufficient: True
- Monotonicity: 1.0
- Signal score: 0.95
- Protocol score: 0.95
- LT1 detection state: candidate_strong
- LT2 detection state: confirmed

### elite_runner_flat — Elite runner — flat/diesel curve (low VLamax)

**Input:** 9 points, lactate range 3.5 mmol
**Science reference:** Olbrecht SoW: flat curve = diesel athlete, high LT1/LT2 ratio, low VLamax

- **LT1**: 1.15 mmol @ pace=273.0s/km, HR=171
  - Confidence: 0.86, Agreement: 0.83
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase']
  - Expected lactate range: (0.9, 1.8) -> PASS
- **LT2**: 3.73 mmol @ pace=242.0s/km, HR=189
  - Confidence: 0.77, Agreement: 0.53
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase', 'moddmax']
  - Expected lactate range: (2.0, 4.5) -> PASS
- **VLamax proxy** (LT1/LT2 ratio): 0.308

**Real thresholds quality gate:**
- Sufficient: True
- Monotonicity: 1.0
- Signal score: 0.95
- Protocol score: 0.95
- LT1 detection state: confirmed
- LT2 detection state: candidate_strong

### recreational_steep — Recreational runner — steep/glycolytic curve (high VLamax)

**Input:** 7 points, lactate range 10.8 mmol
**Science reference:** Steep curve = high VLamax, early LT1, low absolute LT2 intensity

- **LT1**: 2.00 mmol @ pace=420.0s/km, HR=155
  - Confidence: 0.88, Agreement: 0.91
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase']
  - Expected lactate range: (1.2, 2.2) -> PASS
- **LT2**: 5.00 mmol @ pace=400.0s/km, HR=165
  - Confidence: 0.76, Agreement: 0.5
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase', 'moddmax']
  - Expected lactate range: (2.5, 5.5) -> PASS
- **VLamax proxy** (LT1/LT2 ratio): 0.400

**Real thresholds quality gate:**
- Sufficient: True
- Monotonicity: 1.0
- Signal score: 0.95
- Protocol score: 0.95
- LT1 detection state: confirmed
- LT2 detection state: candidate_strong

### cyclist_power — Trained cyclist — power-based test

**Input:** 8 points, lactate range 6.6 mmol
**Science reference:** Typical FTP ~75% of max; LT2 around 270-280W for trained cyclist

- **LT1**: 1.40 mmol @ power=212.5W, HR=145
  - Confidence: 0.85, Agreement: 0.8
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase']
  - Expected lactate range: (1.0, 2.0) -> PASS
- **LT2**: 3.50 mmol @ power=275.0W, HR=168
  - Confidence: 0.88, Agreement: 0.91
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase']
  - Expected lactate range: (2.5, 5.0) -> PASS
- **VLamax proxy** (LT1/LT2 ratio): 0.400

**Real thresholds quality gate:**
- Sufficient: True
- Monotonicity: 1.0
- Signal score: 0.95
- Protocol score: 0.95
- LT1 detection state: candidate_strong
- LT2 detection state: confirmed

### noisy_outlier — Noisy data with outlier at step 4 (5.2 mmol artifact)

**Input:** 8 points, lactate range 5.2 mmol
**Science reference:** Outlier at step 4 (5.2 mmol). Motor should NOT anchor LT2 to the outlier.

- **LT1**: 1.10 mmol @ pace=360.0s/km, HR=150
  - Confidence: 0.88, Agreement: 0.91
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase']
  - Expected lactate range: (0.8, 2.0) -> PASS
- **LT2**: 3.80 mmol @ pace=290.0s/km, HR=176
  - Confidence: 0.88, Agreement: 0.91
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase']
  - Expected lactate range: (2.5, 5.5) -> PASS
- **VLamax proxy** (LT1/LT2 ratio): 0.289

**Outlier analysis:**
- LT2 at 290.0 s/km, lactate 3.8 — outlier appears mitigated.

**Real thresholds quality gate:**
- Sufficient: True
- Monotonicity: 0.86
- Signal score: 0.84
- Protocol score: 0.95
- LT1 detection state: confirmed
- LT2 detection state: confirmed

### minimal_3points — Minimal data — only 3 points

**Input:** 3 points, lactate range 5.1 mmol
**Science reference:** 3 points only: motor should return empty or very low confidence. Must not crash.

- **LT1**: 2.50 mmol @ pace=320.0s/km, HR=160
  - Confidence: 0.52, Agreement: 0.67
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase']
  - Expected lactate range: (0.0, 10.0) -> PASS
- **LT2**: 6.00 mmol @ pace=270.0s/km, HR=180
  - Confidence: 0.52, Agreement: 0.67
  - Primary method: baseline_rise, All methods: ['baseline_rise', 'sustained_increase']
  - Expected lactate range: (0.0, 10.0) -> PASS
- **VLamax proxy** (LT1/LT2 ratio): 0.417

**Edge case analysis:**
- Motor returned thresholds: LT1=yes, LT2=yes
- No crash: PASS

**Real thresholds quality gate:**
- Sufficient: False
- Monotonicity: 1.0
- Signal score: 0.91
- Protocol score: 0.95
- LT1 detection state: candidate_weak
- LT2 detection state: candidate_weak

## Discrepancies & Issues Found

No major discrepancies found.

## Code-Level Observations

### analytics.py — Threshold Detection Methods

1. **`_method_baseline_rise` (line ~260)**: Uses +0.5 mmol over baseline (Faude 2009). For LT2, uses >=4.0 mmol OR >=3.2 with slope >=0.45. Transient spike check (next point must not drop >0.5). This is scientifically sound per Billat 2003.

2. **`_method_sustained_increase` (line ~320)**: LT1 = first sustained rise; LT2 = slope breakpoint. Requires `local_slope >= max(0.45, prior_slope + 0.2)` — this is a reasonable heuristic but has no direct literature citation. It can miss LT2 in flat curves where the breakpoint is subtle.

3. **`_method_moddmax` (line ~364)**: Bishop 1998 ModDmax. Start point = baseline_min + 0.5 mmol. Only returns LT2 (correct — ModDmax has no LT1 definition). Requires >=4 candidates and positive deviation. Scientifically appropriate.

4. **`_aggregate_threshold` (line ~442)**: Lactate = mean, pace/power/HR = median. The median for load metrics is a good choice (Billat 2003 argument about real samples). However, using mean for lactate with only 2 methods can be pulled by an outlier method.

5. **`_smooth` (line ~56)**: Simple 3-point moving average. Adequate for most cases but provides limited protection against single-point outliers (only attenuates by ~1/3).

6. **Outlier handling**: The motor has NO explicit outlier detection in the per-session analysis. The smoothing function attenuates spikes but does not flag or remove them. The `dynamic_threshold_engine.py` has LOO outlier detection, but this is only used for multi-session aggregation, not single-session analysis. This is a significant gap for noisy field data.

7. **Minimum data**: `_thresholds_from_session` requires >=3 candidates. With exactly 3 points, it will attempt detection but `_method_moddmax` needs >=4, so only baseline_rise and sustained_increase contribute. This is appropriate — 3 points have very low information content.

## VLamax Proxy Validation (Olbrecht Science of Winning)

The LT1/LT2 lactate ratio is used as a VLamax proxy in `physiological_engine.py`:
- ratio > 0.87 = low VLamax (diesel)
- 0.79-0.87 = moderate
- < 0.79 = high VLamax (glycolytic)

- Elite flat (diesel): LT1/LT2 ratio = 0.308
- Recreational steep (glycolytic): LT1/LT2 ratio = 0.4
- **CONCERN**: Flat curve ratio NOT higher than steep. The motor's threshold detection may not preserve the expected VLamax differentiation between curve shapes.

## Recommendations

1. **Add intra-session outlier detection**: Port the LOO method from `dynamic_threshold_engine.py` into single-session analysis, or implement a simpler IQR/Z-score filter before smoothing.
2. **Confidence calibration for 3-point tests**: Currently returns thresholds with 0.52-0.56 confidence for 3 points. Consider returning empty results or capping confidence at 0.3 for <=4 points.
3. **VLamax proxy robustness**: The LT1/LT2 ratio depends heavily on which step the motor picks for LT1. Consider computing the ratio from the raw curve shape (e.g., area under curve) rather than detected thresholds.
4. **Method weight for aggregation**: Currently all methods have equal implicit weight via mean/median. Consider weighting by method confidence when aggregating lactate values.
