# PeakAerobic: A Multi-Method Approach to Automated Lactate Threshold Detection, Metabolic Profiling, and Individualized Training Prescription

**PeakAerobic Technical White Paper v1.0**
**March 2026**

---

## Abstract

Blood lactate profiling remains the gold standard for prescribing endurance training intensities, yet the interpretation of lactate curves is highly dependent on the detection method employed, the experience of the practitioner, and the quality of field data. PeakAerobic implements a multi-method threshold detection engine that combines three established physiological approaches --- Baseline Rise (Faude et al., 2009), Sustained Increase, and Modified Dmax (Bishop et al., 1998) --- and aggregates their outputs using a statistically principled strategy: mean for lactate concentration, median for performance variables (pace, power, heart rate). A confidence scoring system quantifies inter-method agreement, providing practitioners with transparent reliability metrics for every threshold estimate. Beyond single-session analysis, a dynamic multi-session engine applies Leave-One-Out outlier detection, multi-bracket interpolation, and exponential recency weighting across a 42-day rolling window to track threshold evolution over time. Metabolic profiling estimates VLamax from the LT1/LT2 ratio (Olbrecht, 2000; Mader, 2003) and VO2max via the Swain et al. (1994) equation combined with ACSM metabolic formulae. A physiological engine maps the resulting capacity profile to one of six Olbrecht-based training blocks, prescribing mesocycle structure via a wave-loading principle with progressive dose ladders. Race performance predictions employ the di Prampero energy cost model (1986, 2003) with Daniels & Gilbert (1979) fractional utilization functions and Zanini et al. (2025) durability corrections.

---

## 1. Introduction

The first (LT1) and second (LT2) lactate thresholds are among the strongest physiological predictors of endurance performance across running, cycling, swimming, and triathlon (Faude et al., 2009; Joyner & Coyle, 2008). LT1 marks the onset of blood lactate accumulation above resting values and corresponds approximately to the upper boundary of low-intensity training. LT2, often equated with the maximal lactate steady state (MLSS), demarcates the highest intensity at which lactate production and clearance remain in equilibrium --- the critical boundary for threshold and high-intensity training prescription.

Despite this physiological clarity, the practical detection of LT1 and LT2 from incremental step-test data is fraught with methodological disagreement. At least 25 distinct methods have been proposed in the literature (Faude et al., 2009), and the choice of method can shift the estimated threshold by 5--15% in intensity terms (Jamnick et al., 2018). Fixed blood lactate concentration approaches (e.g., OBLA at 4 mmol/L) fail to account for inter-individual variability in baseline lactate kinetics (Stegmann et al., 1981). Single-method approaches are vulnerable to noise, protocol differences, and the specific shape of the lactate-intensity curve in trained versus recreational athletes.

PeakAerobic addresses these challenges through three design principles:

1. **Multi-method redundancy.** Three detection methods, each with distinct mathematical assumptions, are applied to every dataset. Their agreement (or disagreement) is itself a signal.
2. **Statistical aggregation with domain-aware rules.** Lactate values are averaged; performance metrics are aggregated by median to ensure results correspond to actual measured data points rather than interpolated phantom values.
3. **Longitudinal tracking with robust statistics.** A dynamic engine accumulates evidence across sessions, detecting and down-weighting outliers, to provide stable threshold estimates that reflect genuine physiological adaptation rather than day-to-day measurement noise.

This document describes each component of the PeakAerobic engine in sufficient technical detail to enable independent evaluation by sports scientists and physiologists.

---

## 2. Threshold Detection Methods

### 2.1 Overview

Each lactate step-test session produces a series of paired observations: (intensity, blood lactate concentration), where intensity may be expressed as pace (s/km), power (W), or heart rate (bpm). Prior to analysis, lactate values are smoothed using a 3-point moving average with reflective boundary padding (Smith, 1997), which preserves endpoint magnitude --- a critical detail for accurate LT2 estimation in steep curves where standard zero-padding would compress peak lactate values.

Formally, given raw lactate values [L_0, L_1, ..., L_n], the reflective-padded sequence is:

```
P = [L_1, L_0, L_0, L_1, L_2, ..., L_n, L_n, L_{n-1}]
```

The smoothed value at index i is:

```
L_smooth(i) = (P(i-1) + P(i) + P(i+1)) / 3
```

Three detection methods are then applied independently.

### 2.2 Method 1: Baseline Rise

**Theoretical basis:** Faude et al. (2009) recommend identifying LT1 as the first intensity at which blood lactate rises meaningfully above the individual's baseline resting concentration, and LT2 as the point of exponential lactate accumulation.

**Implementation:**

The baseline minimum is defined as the lowest lactate value within the first four stages of the test:

```
baseline = min(L_smooth(0), L_smooth(1), ..., L_smooth(min(3, n)))
```

**LT1 detection:** The first stage i where:

```
L_smooth(i) >= baseline + 0.5 mmol/L
```

The 0.5 mmol/L criterion follows Faude et al. (2009), who identified this as the threshold rise most consistently associated with the onset of lactate accumulation in trained and untrained populations.

**LT2 detection:** The first stage j > i (LT1 index) where either:

- L_smooth(j) >= 3.2 mmol/L, *or*
- L_smooth(j) >= 4.0 mmol/L

with a verification constraint: the subsequent data point must not drop by more than 0.5 mmol/L:

```
L_smooth(j+1) >= L_smooth(j) - 0.5
```

This verification filter prevents transient spikes (e.g., from incomplete mixing or a brief anaerobic effort) from being misidentified as sustained threshold crossings.

### 2.3 Method 2: Sustained Increase

**Theoretical basis:** LT1 is identified as the first intensity at which lactate begins a sustained, monotonic rise. LT2 is identified as the breakpoint where the rate of lactate accumulation accelerates --- the transition from linear to exponential kinetics.

**LT1 detection:** The first stage i where:

- L_smooth(i) > L_smooth(i-1), *and*
- L_smooth(i) > baseline + 0.2 mmol/L, *and*
- The increase is confirmed in subsequent stages (sustained, not transient)

**LT2 detection:** The algorithm computes the first derivative (step-to-step change) of the smoothed lactate curve and identifies the stage at which this derivative shows a sustained increase --- i.e., the slope of the lactate curve itself begins to rise, indicating the transition from aerobic to anaerobic-dominated metabolism.

### 2.4 Method 3: Modified Dmax (Bishop et al., 1998)

**Theoretical basis:** The classical Dmax method (Cheng et al., 1992) fits a polynomial to the lactate curve and finds the point of maximum perpendicular distance from the line connecting the first and last data points. However, in trained athletes with convex but shallow lactate curves, all deviations from this line may be negative, causing catastrophic failure of the algorithm. Bishop et al. (1998) addressed this by modifying the start point.

**Implementation:**

1. **Start point selection:** Rather than using the first data point, the start point is defined as the first stage where:

```
L_smooth(i) >= baseline_min + 0.5 mmol/L
```

This ensures the reference line begins at the onset of meaningful lactate accumulation, not at rest. The 0.5 mmol/L criterion follows Bishop (1998).

2. **Polynomial fit:** A third-degree polynomial is fitted to all data points from the start point to the final stage:

```
L_fit(x) = a_3 * x^3 + a_2 * x^2 + a_1 * x + a_0
```

where x represents the load metric (pace, power, or heart rate).

3. **Maximum perpendicular distance:** A reference line is drawn from the start point (x_start, L_start) to the last point (x_end, L_end). For each intermediate point, the perpendicular distance from the polynomial curve to this reference line is computed. The point of maximum distance is identified as LT2.

```
d(i) = |L_fit(x_i) - L_line(x_i)| / sqrt(1 + m^2)
```

where m is the slope of the reference line.

**Note:** ModDmax estimates only LT2. It does not provide an LT1 estimate, as the start-point modification removes the low-intensity region from which LT1 would be inferred.

### 2.5 Why Three Methods

No single method is universally optimal. Baseline Rise is robust for recreational athletes with clear inflection points but can be noisy in trained athletes with low resting lactate. Sustained Increase captures the dynamic behavior of the curve but is sensitive to non-monotonic data. ModDmax is robust for trained athletes but fails when fewer than 5 stages are available above baseline. By combining all three, PeakAerobic achieves detection robustness across the full spectrum of athlete populations and test protocols.

---

## 3. Aggregation and Confidence

### 3.1 Aggregation Strategy

Once all applicable methods have produced their estimates, PeakAerobic aggregates them using domain-specific rules:

**Lactate concentration:** Arithmetic mean of all valid method estimates.

```
LT_lactate = (1/k) * SUM(L_method_i)  for i = 1..k valid methods
```

**Pace, power, and heart rate:** Median of all valid method estimates.

```
LT_pace = median(pace_method_1, pace_method_2, ..., pace_method_k)
```

**Rationale for median on performance metrics:** The arithmetic mean of pace or power values from different methods may produce a value that does not correspond to any actually measured test stage. For example, if two methods estimate LT2 at stages with paces of 4:30/km and 4:50/km, the mean (4:40/km) may fall between stages where no measurement was taken. The median, by contrast, always selects an actually observed data point, ensuring the prescribed training intensity maps to a real physiological measurement.

### 3.2 Confidence Scoring

Inter-method agreement is quantified on a continuous [0, 1] scale:

- **High agreement** (all valid methods within 0.3 mmol/L of each other): confidence >= 0.80
- **Moderate agreement** (within 0.5 mmol/L): confidence 0.60--0.79
- **Low agreement** (>0.5 mmol/L spread): confidence < 0.60

The agreement score is computed as:

```
agreement = max(0.35, min(0.95, 1 - (max(L_methods) - min(L_methods)) / (0.08 * L_reference)))
```

where L_reference is the aggregated lactate value. The normalization factor (0.08) is calibrated so that typical inter-method variability in well-conducted tests maps to the medium-high confidence range.

Evidence level labels are assigned: **"high"** (>= 0.80), **"medium"** (0.60--0.79), **"low"** (< 0.60). These labels are surfaced to the practitioner alongside every threshold estimate.

### 3.3 Real Thresholds: Conservative Gate System

In addition to the primary threshold estimates, PeakAerobic computes "real thresholds" via independent curve-shape analysis. These are subject to strict quality gates:

| Gate | Criterion | Rationale |
|------|-----------|-----------|
| Minimum stages | >= 5 stages with lactate | Polynomial fit requires sufficient degrees of freedom |
| Individual confidence | >= 0.75 | Methods must substantially agree |
| Agreement score | >= 0.62 | Cross-method validation |
| Monotonicity | >= 0.60 | Curve must show expected physiological behavior |

If any gate fails, real thresholds are set to `null` and are never displayed. This conservative approach ensures that threshold estimates are only presented when data quality warrants confidence --- a deliberate trade-off of sensitivity for specificity, following the principle that "no estimate is better than a bad estimate" (Faude et al., 2009).

**Practical thresholds** are derived from real thresholds with conservative offsets:

```
LT1_practical = LT1_real - 0.3 mmol/L
LT2_practical = LT2_real - 0.5 mmol/L
```

These offsets ensure that prescribed training zones sit safely within the intended physiological domain, accounting for day-to-day variability in lactate kinetics (~0.3--0.5 mmol/L; Foxdal et al., 1994).

---

## 4. Dynamic Multi-Session Engine

### 4.1 Motivation

A single lactate test is a snapshot: it captures threshold values on a specific day, under specific conditions (hydration, fatigue, glycogen status, ambient temperature). To track genuine physiological adaptation --- and to distinguish it from measurement noise --- PeakAerobic aggregates data across multiple sessions within a 42-day rolling window.

### 4.2 Point Weighting

Each data point from each session receives a composite weight:

```
W_total = W_recency * W_quality * W_protocol
```

**Recency weight** (exponential decay with half-life of 18 days):

```
W_recency = exp(-days_since_session / 18)
```

**Quality weight** is derived from session-level metrics:

- **Session density:** ratio of work time to total time (work + rest). Continuous protocols (density ~ 1.0) produce more representative lactate values than highly fragmented intervals.
- **Interval duration score:** Stages of 4--8 minutes receive the highest score (0.92), reflecting the time required for blood lactate to equilibrate with muscle lactate production (Beneke et al., 2011). Stages < 2 minutes (score 0.42) or > 15 minutes (score 0.50--0.64) are down-weighted.
- **Protocol score:** Combines duration score with rest-to-work ratio. Low rest ratios (<= 0.15) receive full weight; high ratios are penalized.

### 4.3 Leave-One-Out Outlier Detection

For each data point in the aggregated pool, a weighted linear regression (lactate ~ load) is fitted to all *other* points. The residual for the held-out point is computed:

```
residual_i = |L_actual(i) - L_predicted(i)|
```

Points with |residual| > 1.0 mmol/L are classified as outliers and receive a penalty factor of 0.12 (reducing their effective weight to ~12% of nominal). This approach:

- Prevents a single anomalous session from distorting threshold estimates
- Retains outlier points in the dataset (they still contribute to monotonicity and stability calculations)
- Is more robust than global regression, because the LOO procedure prevents an outlier from "pulling" the regression toward itself

**Intra-session safeguard:** If more than 40% of points within a single session would be flagged as outliers, the filter is not applied to that session. This prevents pathological behavior when an entire session is physiologically unusual (e.g., tested at altitude, after illness) --- the session is treated as internally consistent but potentially shifted.

### 4.4 Multi-Bracket Interpolation

To estimate the intensity at a target lactate concentration (e.g., 1.6 mmol/L for practical LT1 or 3.1 mmol/L for practical LT2), PeakAerobic identifies the four nearest data points on each side of the target in lactate space:

```
Lower bracket: 4 points with L < target, sorted by |L - target|
Upper bracket: 4 points with L > target, sorted by |L - target|
```

Non-outlier points are prioritized in bracket selection. Linear interpolation between the tightest bracket pair yields the intensity estimate. A **bracket span penalty** is applied when the upper bracket point is far from the target:

```
penalty = (2 / (L_upper - target))^2    when (L_upper - target) > 2.0 mmol/L
```

This prevents unreliable extrapolation from distant measurements.

### 4.5 Physiological Anchor Blending

The practical LT2 estimate from multi-bracket interpolation is blended with the physiological LT2 detected from curve-shape analysis:

```
LT2_final = (1 - alpha) * LT2_interpolated + alpha * LT2_physiological
```

where:

```
alpha = 0.35 * (1 - confidence) + 0.10
```

When confidence in the interpolated estimate is high (confidence ~ 1.0), the physiological anchor contributes only 10%. When confidence is low, the anchor contributes up to 45%, stabilizing the estimate. This reflects the epistemological principle that when direct evidence is weak, anchoring to established physiological models reduces estimation error.

---

## 5. Metabolic Profiling

### 5.1 VLamax Estimation

The maximum rate of lactate production (VLamax) is a key determinant of endurance performance, particularly at longer distances (Mader, 2003; Olbrecht, 2000). Athletes with low VLamax ("diesel" profiles) exhibit superior fat oxidation and glycogen sparing; athletes with high VLamax produce more lactate at any given intensity and deplete glycogen faster.

PeakAerobic estimates VLamax as a proxy from the ratio of LT1 to LT2 lactate concentrations:

```
ratio = LT1_lactate / LT2_lactate
```

| Ratio | VLamax Classification | Physiological Interpretation |
|-------|----------------------|------------------------------|
| > 0.87 | Low ("diesel") | LT1 and LT2 are close; lactate curve is flat and rightward-shifted. Minimal glycolytic contribution at sub-threshold intensities. |
| 0.79 -- 0.87 | Moderate | Balanced aerobic/glycolytic profile. |
| < 0.79 | High | Large gap between LT1 and LT2; steep lactate curve. High glycolytic flux even at moderate intensities. |

**Scientific basis:** Olbrecht's "two-pulley" model (Olbrecht, 2000) describes endurance performance as the interaction between VO2max (aerobic power) and VLamax (glycolytic power). When VLamax is low relative to VO2max, the lactate curve shifts right and flattens, bringing LT1 closer to LT2 in relative terms. This ratio-based proxy captures this relationship without requiring dedicated anaerobic testing.

**Confidence levels:**

| Data Source | Confidence |
|-------------|------------|
| Real thresholds (curve-shape detected) | 0.85 |
| Basic thresholds (multi-method aggregated) | 0.65 |
| Interpolated / single-method | 0.40 |

The system requires confidence >= 0.55 to act on VLamax-derived recommendations.

### 5.2 VO2max Estimation

VO2max is estimated using the Swain et al. (1994) heart rate--VO2 relationship combined with ACSM metabolic equations.

**Step 1: VO2 at LT2 intensity**

For running (ACSM, 2018):

```
VO2_LT2 = 3.5 + 0.2 * speed(m/min) + 0.9 * speed(m/min) * grade
```

where speed is derived from LT2 pace and grade is assumed to be 0 for level running.

**Step 2: Fractional utilization at LT2**

Trained endurance athletes typically exercise at LT2 at 75--85% of VO2max (Hausswirth & Brisswalter, 2008). The fractional utilization is estimated based on training status:

| Training Status | %VO2max at LT2 |
|----------------|-----------------|
| Recreational | 70--75% |
| Trained | 75--82% |
| Competitive | 80--88% |

**Step 3: VO2max extrapolation**

```
VO2max = VO2_LT2 / fractional_utilization
```

**Data quality score:** A composite quality metric Q is computed:

```
Q = 0.25 * agreement + 0.25 * stability + 0.20 * history_depth_norm + 0.15 * lt1_available + 0.15 * vo2_source
```

where each component is normalized to [0, 1]. This score modulates the confidence interval width for race predictions:

```
spread = base_spread / (0.5 + 0.5 * Q)
```

When Q = 1.0 (perfect data), spread equals the base value; when Q = 0.0, spread doubles.

### 5.3 Capacity Profile Classification

The capacity profile combines aerobic level and VLamax classification into a matrix that drives training block selection:

**Aerobic level** is determined by comparing LT2 pace/power to discipline-specific benchmarks:

| Aerobic Level | Criterion |
|--------------|-----------|
| High | LT2 >= competitive benchmark for the discipline |
| Moderate | LT2 between trained and competitive benchmarks |
| Low | LT2 below trained benchmark |
| Unknown | Insufficient data |

**Combined profile examples:**

| Aerobic Level | VLamax | Interpretation | Primary Deficit |
|--------------|--------|----------------|-----------------|
| Low | High | Underdeveloped aerobic base, excessive glycolytic reliance | Aerobic capacity |
| Moderate | Low | Good base, needs power development | Aerobic power |
| High | High | Strong engine but glycolytic; glycogen risk at long distances | VLamax reduction |
| High | Low | Diesel profile; strong endurance base | Maintenance / competition-specific |

---

## 6. Training Prescription Engine

### 6.1 Olbrecht Block Selection

PeakAerobic implements six training blocks derived from Jan Olbrecht's *Science of Winning* (2000) and the two-pulley model of VO2max/VLamax interaction:

| Block | Abbreviation | Primary Stimulus | Selection Criteria |
|-------|-------------|-----------------|-------------------|
| Aerobic Capacity | AEC | LT1, extensive volume | Base phase; significant LT1 gap; VLamax high; thin data ("thin ice") |
| Threshold Development | AEC to AEP | LT2, tempo and cruise intervals | Base_late or specific phase with significant LT2 gap |
| Anaerobic Capacity | ANC | Short high-intensity + AEC base | Base_late + VLamax low ("diesel") + short target event (5K, 10K, sprint tri) |
| Aerobic Power | AEP | VO2max intervals, race-pace work | Minimal threshold gap; aerobic base established |
| Anaerobic Power | ANP | Neuromuscular speed, max efforts | Pre-competition + short event |
| Competition Specific | AEP + comp | Race simulation, pacing | Pre-competition + long distance event |

**Season phase determination:**

```
weeks_to_event > 28  -->  base_early
20 < weeks <= 28     -->  base_late
12 < weeks <= 20     -->  specific
3 < weeks <= 12      -->  pre_comp
weeks <= 3           -->  taper
```

**Decision logic:**

The selection algorithm evaluates:

1. **Gap analysis:** Computes the difference between current LT1/LT2 and the values required for the target event (using discipline- and level-specific race factors derived from Faude 2009, Billat 2003, Daniels, Coggan, and Hausswirth & Mujika 2013).
2. **Season phase constraints:** ANC is gated out of base_early; ANP is restricted to pre_comp for short events; long-distance events in pre_comp default to competition_specific rather than ANP.
3. **Capacity profile:** High VLamax in base phases biases toward AEC; low VLamax with short events enables ANC; moderate aerobic capacity without VLamax issues directs toward threshold work.
4. **Staleness detection:** If the most recent lactate test is older than 56 days during specific/pre_comp phases, a testing decision block is recommended.
5. **Contraindication checking:** Blocks requiring more weeks than available (MIN_WEEKS + 2) are excluded.

Six block candidates are scored across multiple dimensions, and the highest-scoring candidate is selected. The scoring context and all candidate scores are stored in the payload for full auditability.

### 6.2 Mesocycle Structure: Wave Principle

Each mesocycle follows a wave-loading structure:

**4-week mesocycle:**
```
Week 1: Load        (progressive overload introduction)
Week 2: Build       (increased volume/intensity)
Week 3: Build Peak  (maximum load --- climax of the working phase)
Week 4: Recovery    (deload: reduced volume, maintained intensity)
```

**5-week mesocycle:**
```
Week 1: Load
Week 2: Build
Week 3: Build
Week 4: Build Peak
Week 5: Recovery
```

The `build_peak` phase represents the mesocycle's maximum training stress, after which the recovery week allows for supercompensation. This structure aligns with Issurin's (2010) block periodization model and Olbrecht's recommendation of concentrated loading followed by recovery.

### 6.3 Dose Ladders

Each workout family contains a **dose ladder**: a progression of volume and/or intensity steps that the athlete ascends as they demonstrate tolerance and positive adaptation. The ladder system replaces arbitrary percentage-based progressions with physiologically grounded increments.

**Example --- LT1 Extensive Running (8 steps):**

| Step | Description | Duration |
|------|-------------|----------|
| 1 | 4 x 8' LT1, 1' rest | ~45 min |
| 2 | 3 x 12' LT1, 1' rest | ~50 min |
| 3 | 2 x 18' LT1, 2' rest | ~55 min |
| 4 | 3 x 15' LT1, 1' rest | ~60 min |
| 5 | 2 x 25' LT1, 2' rest | ~65 min |
| 6 | 1 x 40' LT1 continuous | ~55 min |
| 7 | 2 x 30' LT1, 2' rest | ~75 min |
| 8 | 1 x 50' LT1 continuous | ~65 min |

Step selection is determined by:
- **Macro phase:** Build_peak uses step index + 2 (maximum); recovery uses step index - 1 (minimum).
- **Block validation signal:** Positive adaptation signals (improved lactate response) advance the step; stagnation or regression holds or retreats.
- **Family tolerance:** Historical response to this specific workout family.

### 6.4 Session Prescription and Day Assignment

Within each week, sessions are assigned to specific days using a `_smart_day_offsets()` algorithm that respects:

1. **Fatigue cost:** High-fatigue sessions (e.g., VO2max intervals) require more recovery time before the next quality session.
2. **Fresh-legs requirement:** Sessions flagged as `requires_fresh = True` are placed on Tuesday (day 2), maximizing recovery from the weekend long session.
3. **Long sessions:** Extensive/long sessions are assigned to Saturday (day 6).
4. **Key session spacing:** Two key sessions within the same week are separated by at least 2 days.
5. **Incompatible adjacencies:** Certain workout families cannot be placed on consecutive days (e.g., two high-intensity interval sessions).

---

## 7. Race Performance Prediction

### 7.1 di Prampero Energy Cost Model

Race pace predictions are derived from the di Prampero model (1986, 2003), which relates sustainable running speed to the metabolic cost of locomotion and the fraction of VO2max that can be maintained for the race duration:

```
v_race = (VO2max * F(T) - VO2_rest) / C_r
```

where:
- `v_race` = sustainable race speed (m/min)
- `VO2max` = maximal oxygen uptake (mL/kg/min)
- `F(T)` = fractional utilization as a function of race duration T (minutes)
- `VO2_rest` = resting oxygen consumption (3.5 mL/kg/min)
- `C_r` = energy cost of running (mL O2/kg/m), approximately 0.2 mL/kg/m for level running (ACSM)

### 7.2 Fractional Utilization: Daniels & Gilbert Function

The fraction of VO2max sustainable for a given race duration is modeled using the Daniels & Gilbert (1979) equation, validated against thousands of race results:

```
F(T) = 0.8 + 0.1894393 * e^(-0.012778 * T) + 0.2989558 * e^(-0.1932605 * T)
```

where T is the race duration in minutes.

This function naturally captures the observation that shorter races permit higher fractional utilization (e.g., ~98% at 5K for competitive athletes, ~85% at marathon for trained athletes). Importantly, it accounts for individual speed: a fast 5K runner (T ~ 15 min) operates at higher F than a slower 5K runner (T ~ 30 min).

### 7.3 VLamax Sensitivity Adjustment

VLamax modulates fractional utilization, particularly at longer distances where glycolytic flux determines glycogen depletion rate (Mader, 2003):

```
F_adjusted(T) = F(T) - sensitivity * (VLamax - 0.35)
```

where the sensitivity coefficient increases with race distance:

| Distance | Sensitivity |
|----------|------------|
| 5K | 0.03 |
| 10K | 0.08 |
| Half Marathon | 0.14 |
| Marathon | 0.22 |

An athlete with VLamax = 0.50 (high glycolytic flux) would see their marathon fractional utilization reduced by 0.22 * (0.50 - 0.35) = 3.3 percentage points, reflecting faster glycogen depletion and greater "wall" risk.

### 7.4 Durability Correction

For races exceeding ~60 minutes, LT2 itself declines over time due to substrate depletion and neuromuscular fatigue. PeakAerobic applies a durability correction based on Zanini et al. (2025):

```
decay = k * T^1.5
```

where k depends on the athlete's endurance profile:

| Endurance Score | k | Decay at 2h | Decay at 3h |
|----------------|---|-------------|-------------|
| High (> 0.7) | 0.013 | 3.7% | 6.8% |
| Medium (0.4--0.7) | 0.025 | 7.1% | 13.0% |
| Low (< 0.4) | 0.035 | 9.9% | 15.0% (capped) |

The medium tier is calibrated to Zanini's finding of ~7.1% LT2 decline at 120 minutes in moderately trained runners.

### 7.5 Prediction Intervals

Predictions are presented as asymmetric confidence intervals rather than point estimates:

```
pace_optimistic = pace_predicted * (1 - base_spread * asymmetry_optimistic / (0.5 + 0.5 * Q))
pace_pessimistic = pace_predicted * (1 + base_spread * asymmetry_pessimistic / (0.5 + 0.5 * Q))
```

The asymmetry increases with distance, reflecting the observation that downside risk (positive splits, hitting the wall) grows with race duration. For the marathon, the pessimistic interval is approximately twice the optimistic interval (Santos-Lozano et al., 2014; Smyth, 2021: 28% of male marathon runners "hit the wall").

---

## 8. Validation Approach

### 8.1 Internal Validation

PeakAerobic's physiological engine is validated through a comprehensive test suite of **63 test cases** covering:

- **9 disciplines:** 5K, 10K, half marathon, marathon, road cycling TT, granfondo, pool swimming, open water swimming, triathlon (sprint through Ironman)
- **3 athlete levels:** recreational, trained, competitive
- **5 season phases:** base_early, base_late, specific, pre_comp, taper

Each test case verifies that the block selection algorithm produces the physiologically appropriate training block given the specific combination of capacity profile, event demands, and season phase.

### 8.2 External Validation Targets

The threshold detection engine is designed to correlate with MLSS, the gold-standard criterion for LT2 (Beneke et al., 2011). While PeakAerobic does not directly measure MLSS (which requires multiple constant-load tests), the multi-method approach is calibrated against published correlations:

- **ModDmax vs. MLSS:** Bishop et al. (1998) reported r = 0.92 between ModDmax-derived LT2 and MLSS power in trained cyclists.
- **Baseline Rise vs. MLSS:** Faude et al. (2009) found that the individual lactate threshold (onset of accumulation above baseline) was the strongest correlate of MLSS across 25 methods reviewed.
- **LT2 and endurance performance:** Faude et al. (2009) meta-analysis: LT2 correlates with endurance performance at r = 0.80--0.98 across running, cycling, and swimming.

Race predictions are compared against the Daniels VDOT system (standard error of estimate: 2--3%; McLaughlin et al., 2010) and Roecker et al. (1998; SEE ~3.5%).

### 8.3 Limitations and Known Edge Cases

1. **Sparse data:** With <= 4 lactate stages, polynomial fits are underdetermined and LOO outlier detection has insufficient statistical power. The system flags such sessions with low confidence and relies on conservative gate thresholds to prevent unreliable estimates from being surfaced.

2. **Noisy sessions:** Sessions with high internal variability (e.g., inconsistent pacing, environmental interference) may produce high outlier rates. The 40% intra-session safeguard prevents pathological filtering but cannot improve the underlying data quality.

3. **VLamax as proxy:** The LT1/LT2 ratio provides a qualitative estimate of VLamax, not a quantitative measurement. Athletes at the boundaries between classifications (e.g., ratio = 0.79) should be interpreted with caution. Direct VLamax measurement (e.g., via sprint testing or metabolic cart) would refine this estimate.

4. **VO2max estimation:** The Swain/ACSM approach estimates VO2max from submaximal data. It is less accurate than direct measurement via gas exchange analysis. The quality score Q propagates this uncertainty into wider prediction intervals.

5. **Durability model:** The Zanini et al. (2025) durability correction is derived from a limited number of studies. Individual durability can vary significantly based on training history, heat acclimatization, and race-day nutrition strategy.

6. **Paradox of late-drop lactate curves:** In rare cases, lactate decreases at the highest test stages (possibly due to motor unit recruitment changes or lactate shuttle dynamics). ModDmax combined with median aggregation mitigates but does not fully resolve this edge case.

---

## 9. References

1. ACSM. (2018). *ACSM's Guidelines for Exercise Testing and Prescription* (10th ed.). Wolters Kluwer.

2. Allen, H., & Coggan, A. R. (2010). *Training and Racing with a Power Meter* (2nd ed.). VeloPress.

3. Bassett, D. R., & Howley, E. T. (2000). Limiting factors for maximum oxygen uptake and determinants of endurance performance. *Medicine & Science in Sports & Exercise*, 32(1), 70--84.

4. Beneke, R., Leithaeuser, R. M., & Ochentel, O. (2011). Blood lactate diagnostics in exercise testing and training. *International Journal of Sports Physiology and Performance*, 6(1), 8--24.

5. Billat, V. L., Sirvent, P., Py, G., Koralsztein, J.-P., & Mercier, J. (2003). The concept of maximal lactate steady state: a bridge between biochemistry, physiology and sport science. *Sports Medicine*, 33(6), 407--426.

6. Bishop, D., Jenkins, D. G., & Mackinnon, L. T. (1998). The relationship between plasma lactate parameters, Wpeak and 1-h cycling performance in women. *Medicine & Science in Sports & Exercise*, 30(8), 1270--1275.

7. Cheng, B., Kuipers, H., Snyder, A. C., Keizer, H. A., Jeukendrup, A., & Hesselink, M. (1992). A new approach for the determination of ventilatory and lactate thresholds. *International Journal of Sports Medicine*, 13(7), 518--522.

8. Coyle, E. F. (1988). Integration of the physiological factors determining endurance performance ability. *Exercise and Sport Sciences Reviews*, 23, 25--63.

9. Daniels, J. T., & Gilbert, R. A. (1979). *Oxygen Power: Performance Tables for Distance Runners*. Oxygen Power.

10. di Prampero, P. E. (1986). The energy cost of human locomotion on land and in water. *International Journal of Sports Medicine*, 7(2), 55--72.

11. di Prampero, P. E., Atchou, G., Bruckner, J. C., & Moia, C. (2003). The energetics of endurance running. *European Journal of Applied Physiology*, 55, 259--266.

12. Faude, O., Kindermann, W., & Meyer, T. (2009). Lactate threshold concepts: how valid are they? *Sports Medicine*, 39(6), 469--490.

13. Foxdal, P., Sjodin, B., & Sjodin, A. (1994). The validity and accuracy of blood lactate measurements for prediction of maximal endurance running capacity. Dependency of analyzed blood media in combination with test protocol. *International Journal of Sports Medicine*, 15(2), 89--95.

14. Gastin, P. B. (2001). Energy system interaction and relative contribution during maximal exercise. *Sports Medicine*, 31(10), 725--741.

15. Hausswirth, C., & Brisswalter, J. (2008). Strategies for improving performance in long duration events. *Sports Medicine*, 38(11), 881--891.

16. Hausswirth, C., & Mujika, I. (2013). *Recovery for Performance in Sport*. Human Kinetics.

17. Issurin, V. B. (2010). New horizons for the methodology and physiology of training periodization. *Sports Medicine*, 40(3), 189--206.

18. Jamnick, N. A., Botella, J., Pyne, D. B., & Bishop, D. J. (2018). Manipulating graded exercise test variables affects the validity of the lactate threshold and VO2peak. *PLoS ONE*, 13(7), e0199794.

19. Joyner, M. J., & Coyle, E. F. (2008). Endurance exercise performance: the physiology of champions. *The Journal of Physiology*, 586(1), 35--44.

20. Laursen, P. B. (2002). The scientific basis for high-intensity interval training. *Sports Medicine*, 32(1), 53--73.

21. Mader, A. (2003). Glycolysis and oxidative phosphorylation as a function of cytoplasmic phosphorylation state and power output of the muscle cell. *European Journal of Applied Physiology*, 88, 317--338.

22. Maglischo, E. W. (2003). *Swimming Fastest*. Human Kinetics.

23. McLaughlin, J. E., Howley, E. T., Bassett, D. R., Thompson, D. L., & Fitzhugh, E. C. (2010). Test of the classic model for predicting endurance running performance. *Medicine & Science in Sports & Exercise*, 42(5), 991--997.

24. Olbrecht, J. (2000). *The Science of Winning: Planning, Periodizing, and Optimizing Swim Training*. Luton.

25. Roecker, K., Schotte, O., Niess, A. M., Horstmann, T., & Dickhuth, H. H. (1998). Predicting competition performance in long-distance running by means of a treadmill test. *Medicine & Science in Sports & Exercise*, 30(10), 1552--1557.

26. Santos-Lozano, A., Collado, P. S., Foster, C., Lucia, A., & Garatachea, N. (2014). Influence of sex and level on marathon pacing strategy. *Journal of Strength and Conditioning Research*, 28(10), 2991--2997.

27. Smyth, B. (2021). How recreational marathon runners hit the wall: a large-scale data analysis of late-race pacing collapse in the marathon. *PLoS ONE*, 16(5), e0251513.

28. Spencer, M. R., & Gastin, P. B. (2001). Energy system contribution during 200- to 1500-m running in highly trained athletes. *Medicine & Science in Sports & Exercise*, 33(1), 157--162.

29. Stegmann, H., Kindermann, W., & Schnabel, A. (1981). Lactate kinetics and individual anaerobic threshold. *International Journal of Sports Medicine*, 2(3), 160--165.

30. Swain, D. P., Leutholtz, B. C., King, M. E., Haas, L. A., & Branch, J. D. (1994). Relationship between % heart rate reserve and % VO2 reserve in treadmill exercise. *Medicine & Science in Sports & Exercise*, 30(2), 318--321.

31. Zanini, D., et al. (2025). Durability of the lactate threshold during prolonged exercise in trained runners. *European Journal of Applied Physiology* (in press).

---

## Appendix A: Calibration Values and Thresholds

### A.1 Threshold Detection Parameters

| Parameter | Value | Source |
|-----------|-------|--------|
| LT1 baseline rise criterion | +0.5 mmol/L above baseline minimum | Faude et al. (2009) |
| LT2 sustained rise minimum | 3.2 mmol/L | Calibrated to MLSS literature |
| LT2 transient spike filter | Next point must not drop > 0.5 mmol/L | Billat et al. (2003) |
| ModDmax start criterion | Baseline minimum + 0.5 mmol/L | Bishop et al. (1998) |
| Outlier threshold (intra-session) | 0.5 mmol/L | Billat et al. (2003) |
| Practical LT1 target | 1.6 mmol/L | Calibrated |
| Practical LT2 target | 3.1 mmol/L | Calibrated (conservative anchor) |
| Practical LT1 offset from real | -0.3 mmol/L | Day-to-day variability margin |
| Practical LT2 offset from real | -0.5 mmol/L | Day-to-day variability margin |

### A.2 Dynamic Engine Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Rolling window | 42 days | Captures ~2 mesocycles of data |
| Recency decay half-life | 18 days | Balances recency with data retention |
| LOO outlier threshold | 1.0 mmol/L | Multi-session context (wider than intra-session) |
| Outlier penalty factor | 0.12 | Soft exclusion; retains for stability metrics |
| Intra-session safeguard | 40% of points | Prevents over-filtering noisy sessions |
| Multi-bracket candidates | 4 per side | Robust interpolation |
| Bracket span penalty threshold | 2.0 mmol/L | Penalizes distant bracket pairs |
| Physiological anchor base weight | 0.10 | Minimum contribution of curve-shape LT2 |
| Physiological anchor max weight | 0.45 | Maximum contribution when confidence is low |

### A.3 Real Threshold Gates

| Gate | Value |
|------|-------|
| Minimum stages | >= 5 |
| Minimum individual confidence | >= 0.75 |
| Minimum agreement score | >= 0.62 |
| Minimum monotonicity | >= 0.60 |

### A.4 VLamax Classification Boundaries

| Boundary | Ratio (LT1/LT2) |
|----------|-----------------|
| Low / Moderate | 0.87 |
| Moderate / High | 0.79 |

### A.5 Race Prediction Parameters

| Parameter | 5K | 10K | HM | Marathon |
|-----------|-----|------|-----|---------|
| Base spread | 2.0% | 2.5% | 3.5% | 4.5% |
| VLamax sensitivity | 0.03 | 0.08 | 0.14 | 0.22 |
| Anaerobic contribution | 6% | 3% | 1% | 0.5% |
| Asymmetry (opt/pess) | 45/55 | 42/58 | 38/62 | 35/65 |

---

## Appendix B: Decision Tree for Block Selection

```
START
  |
  v
[Season Phase?]
  |
  +-- base_early (>28 weeks) ---------------------------------> AEC (Aerobic Capacity)
  |
  +-- base_late (20-28 weeks)
  |     |
  |     +-- [Significant LT2 gap?]
  |     |     +-- Yes ----------------------------------------> THR (Threshold Development)
  |     |     +-- No
  |     |           |
  |     |           +-- [VLamax low + short event?]
  |     |           |     +-- Yes -----------------------------> ANC (Anaerobic Capacity)
  |     |           |     +-- No
  |     |           |           |
  |     |           |           +-- [Significant LT1 gap?]
  |     |           |           |     +-- Yes -----------------> AEC (Aerobic Capacity)
  |     |           |           |     +-- No
  |     |           |           |           |
  |     |           |           |           +-- [Moderate+ aerobic + high aerobic?]
  |     |           |           |                 +-- Yes -----> AEP (Aerobic Power)
  |     |           |           |                 +-- No ------> THR (Threshold Development)
  |     |
  +-- specific (12-20 weeks)
  |     |
  |     +-- [Test data > 56 days old?]
  |     |     +-- Yes ----------------------------------------> TESTING_DECISION_BLOCK
  |     |     +-- No
  |     |           |
  |     |           +-- [Significant LT2 gap?]
  |     |           |     +-- Yes -----------------------------> THR (Threshold Development)
  |     |           |     +-- No
  |     |           |           |
  |     |           |           +-- [Significant LT1 gap (long event)?]
  |     |           |           |     +-- Yes -----------------> AEC (Aerobic Capacity)
  |     |           |           |     +-- No ------------------> AEP (Aerobic Power)
  |     |
  +-- pre_comp (3-12 weeks)
  |     |
  |     +-- [Test data > 56 days old?]
  |     |     +-- Yes ----------------------------------------> TESTING_DECISION_BLOCK
  |     |     +-- No
  |     |           |
  |     |           +-- [Short event (5K, 10K, sprint tri)?]
  |     |           |     +-- Yes -----------------------------> ANP (Anaerobic Power)
  |     |           |     +-- No (long distance)
  |     |           |           +-- [LT2 gap?]
  |     |           |           |     +-- Yes -----------------> THR (with comp work)
  |     |           |           |     +-- No ------------------> COMP (Competition Specific)
  |     |
  +-- taper (<3 weeks)
        +-- Reduced volume, maintained intensity (no block change)

ADDITIONAL GATES:
  - Contraindication: weeks_remaining < MIN_WEEKS + 2 --> block excluded
  - High VLamax + long event --> prioritize AEC to reduce VLamax
  - LT2-led-LT1 red zone: only triggers when LT1/LT2 ratio >= 0.75
  - Stagnation (>=3 tests, <5% LT2 improvement) --> consider block change
```

---

*PeakAerobic --- Bridging exercise physiology and data science for evidence-based endurance training.*
