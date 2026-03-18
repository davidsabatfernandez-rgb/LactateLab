---
title: "ModDmax Lactate Threshold: The Complete Guide for Coaches (2026)"
meta_description: "Learn how the ModDmax method detects lactate threshold more reliably than Dmax or fixed 4mmol. Step-by-step guide with examples for coaches and practitioners."
target_keyword: "ModDmax lactate threshold"
secondary_keywords:
  - "Dmax method lactate"
  - "Bishop 1998 lactate threshold"
  - "lactate threshold detection methods"
  - "modified Dmax method"
date: 2026-03-18
author: PeakAerobic
---

# ModDmax Lactate Threshold: The Complete Guide for Coaches (2026)

If you have ever run a lactate step test on an athlete and wondered whether the threshold you identified was *real* or just an artifact of how the test was set up, you are not alone. The ModDmax method, introduced by Bishop et al. in 1998, was designed to solve exactly this problem — and yet almost no practical coaching content explains how it actually works.

This guide changes that. We will walk through the original Dmax method, show where it breaks down, explain how ModDmax fixes it, and give you a concrete numerical example you can follow with your own data. No PhD required.

## Why Threshold Detection Matters Beyond "4 mmol/L"

For decades, coaches have relied on a single number: 4 mmol/L. If your athlete's lactate hits 4 millimoles per liter, that is their lactate threshold. Simple. Clean. And often wrong.

The 4 mmol/L fixed threshold (Heck et al., 1985) was derived from population averages. It works reasonably well for moderately trained individuals, but it systematically overestimates the threshold in highly trained endurance athletes and underestimates it in less trained individuals. A well-trained marathoner might have a true LT2 at 2.8 mmol/L, while a sprinter could tolerate 5.5 mmol/L at their threshold.

As Faude, Kindermann, and Meyer noted in their landmark 2009 review, **individualized methods consistently outperform fixed thresholds** for prescribing training intensity and predicting endurance performance. The question is: which individualized method should you use?

That is where ModDmax enters the picture.

## The Original Dmax Method (Cheng et al. 1992)

### How Dmax Works

In 1992, Cheng and colleagues introduced the Dmax method as a mathematically elegant way to find the lactate threshold without relying on any fixed blood lactate concentration.

Here is the procedure:

1. **Collect lactate data** from a graded exercise test — typically 5 to 10 stages at progressively higher intensities.
2. **Fit a third-degree polynomial curve** (a smooth S-shaped line) through all the lactate-intensity data points.
3. **Draw a straight line** from the very first data point (resting or lowest intensity) to the very last data point (exhaustion).
4. **Find the point on the polynomial curve** that is the farthest perpendicular distance from this straight line.

That point of maximum distance is the Dmax threshold.

### Visualizing the Dmax Method

Imagine a graph where the x-axis is running speed (or power output) and the y-axis is blood lactate. Your data points form the classic J-shaped lactate curve — relatively flat at low intensities, then curving sharply upward as intensity increases.

Now picture a straight diagonal line drawn from the bottom-left point (low intensity, low lactate) to the top-right point (high intensity, high lactate). The polynomial curve bulges away from this line in the middle section, right where the lactate inflection occurs. The point where that bulge is greatest — where the curve is farthest from the straight line — is the Dmax threshold.

It is a clever geometric approach: instead of asking "where does lactate hit some arbitrary number?", it asks "where does the lactate curve deviate most from a simple linear relationship?"

### Why Dmax Was a Step Forward

Compared to fixed thresholds, Dmax had clear advantages:

- **No arbitrary lactate value.** The method adapts to each athlete's individual curve.
- **Mathematically objective.** Two practitioners analyzing the same data will get the same result.
- **Strong initial validation.** Cheng et al. showed it correlated well with endurance performance markers.

But Dmax had a flaw — a serious one — that only became apparent as more coaches started using it in practice.

## The Problem with Dmax

### The Anchor Point Problem

The Dmax method depends critically on two points: the first data point and the last data point. These two points define the straight reference line, and everything flows from there.

Here is where it breaks down.

**Problem 1: The first data point is unstable.**

Resting lactate varies significantly depending on what the athlete ate, how nervous they are, whether they warmed up, and even what time of day the test is conducted. A nervous athlete might show resting lactate of 1.8 mmol/L instead of their typical 0.9 mmol/L. This shifts the starting anchor of the reference line upward, which tilts the line, which moves the point of maximum distance. The threshold result changes — not because the athlete's physiology changed, but because they were anxious before the test.

**Problem 2: The last data point depends on motivation.**

If the athlete stops one stage early because they are having a bad day, or the coach ends the test conservatively, the final data point changes. This shifts the other end of the reference line, again moving the detected threshold.

Bishop, Jenkins, and Mackinnon demonstrated this problem rigorously in their 1998 study. They showed that **removing the final exercise stage shifted the Dmax-derived threshold by a meaningful amount**, even though the athlete's actual physiology had not changed. The method was detecting protocol artifacts, not physiological reality.

### A Real-World Example of the Problem

Consider an athlete tested on two occasions one week apart, with identical fitness:

- **Test A:** Resting lactate 0.9 mmol/L. Pushes to true exhaustion at 18 km/h (lactate 10.2 mmol/L). Dmax identifies LT2 at 14.8 km/h.
- **Test B:** Resting lactate 1.6 mmol/L (coffee before the test, pre-race nerves). Stops at 17 km/h (lactate 7.8 mmol/L — coach ends test early). Dmax identifies LT2 at 13.9 km/h.

Same athlete. Same fitness. Nearly 1 km/h difference in the detected threshold. That is the difference between prescribing threshold intervals at 4:03/km versus 4:19/km — a completely different training stimulus.

## Enter ModDmax (Bishop 1998)

### The Key Insight

Bishop et al. realized the fix was elegant: **do not use the first data point as the anchor.** Instead, use the point where lactate first rises meaningfully above baseline.

The logic is physiological, not mathematical. Lactate production at low exercise intensities is minimal and variable. The real information about an athlete's threshold starts at the point where lactate begins to accumulate — where production first exceeds clearance in a detectable way. Everything before that point is noise.

### What Changed

In the Modified Dmax (ModDmax) method:

- The **start of the reference line** is anchored to the first data point where lactate exceeds baseline by at least 0.5 mmol/L (based on Bishop's criterion, later supported by Faude et al. 2009).
- The **end of the reference line** remains at the last data point.
- Everything else — the polynomial fit, the perpendicular distance calculation — stays the same.

This single change eliminates the sensitivity to resting lactate variability. Whether the athlete's baseline is 0.8 or 1.6 mmol/L, the method finds the first *physiologically significant* rise and starts from there.

## How ModDmax Works Step by Step

Let us work through a complete example with real numbers.

### Example Data

An athlete completes an 8-stage lactate step test on a treadmill (3-minute stages, 1 km/h increments):

| Stage | Speed (km/h) | Lactate (mmol/L) |
|-------|--------------|-------------------|
| 1     | 10           | 0.9               |
| 2     | 11           | 1.0               |
| 3     | 12           | 1.1               |
| 4     | 13           | 1.5               |
| 5     | 14           | 2.1               |
| 6     | 15           | 3.4               |
| 7     | 16           | 5.8               |
| 8     | 17           | 8.5               |

### Step 1: Find the Baseline Minimum

Scan all lactate values and identify the lowest: **0.9 mmol/L** at 10 km/h. This is the baseline.

### Step 2: Find the First Significant Rise

Calculate the threshold for significant rise: baseline + 0.5 = 0.9 + 0.5 = **1.4 mmol/L**.

Now scan forward through the data to find the first point where lactate reaches or exceeds 1.4 mmol/L:

- Stage 1: 0.9 — below 1.4
- Stage 2: 1.0 — below 1.4
- Stage 3: 1.1 — below 1.4
- Stage 4: 1.5 — **above 1.4** (first significant rise)

The ModDmax start point is **Stage 4: 13 km/h, 1.5 mmol/L**.

### Step 3: Draw the Reference Line

Draw a straight line from the ModDmax start point (13 km/h, 1.5 mmol/L) to the last data point (17 km/h, 8.5 mmol/L).

This line has:
- Slope: (8.5 - 1.5) / (17 - 13) = 7.0 / 4.0 = 1.75 mmol/L per km/h
- Equation: lactate = 1.75 x (speed - 13) + 1.5

### Step 4: Fit a Third-Degree Polynomial

Using all 8 data points, fit a cubic polynomial: y = ax^3 + bx^2 + cx + d.

The resulting curve passes smoothly through the data, capturing the characteristic exponential-like rise in lactate at higher intensities.

### Step 5: Find the Maximum Perpendicular Distance

For each speed value between 13 and 17 km/h, calculate:
1. The lactate value predicted by the polynomial curve.
2. The lactate value on the reference line.
3. The perpendicular distance between them.

The polynomial curve bulges *below* the reference line in the transition zone (because lactate rises exponentially, not linearly). The point where this bulge is greatest — in this example, approximately **14.6 km/h with a predicted lactate of 2.5 mmol/L** — is the ModDmax lactate threshold.

### Interpreting the Result

The ModDmax LT2 for this athlete is approximately 14.6 km/h (roughly 4:06/km pace). This represents the intensity at which lactate accumulation begins to accelerate — the upper boundary of sustainable aerobic work.

Notice that the detected threshold lactate (2.5 mmol/L) is well below the fixed 4 mmol/L value. Using the traditional 4 mmol/L approach, you would have identified a threshold closer to 15.2 km/h — prescribing intervals that are too fast and pushing the athlete above their actual sustainable intensity.

## ModDmax vs Other Threshold Detection Methods

Understanding where ModDmax fits in the landscape of threshold methods helps coaches make informed decisions about which to use.

### Fixed 4 mmol/L (OBLA) — Heck et al. 1985

**How it works:** LT2 is the intensity where lactate equals exactly 4.0 mmol/L, found by interpolation.

**Strengths:** Dead simple. Requires no curve fitting. Any coach can do it with a calculator.

**Weaknesses:** Ignores individual variation. Systematically overestimates threshold in trained athletes whose curves are shifted right. Underestimates in less trained athletes.

**When it agrees with ModDmax:** In moderately trained athletes whose LT2 happens to fall near 4 mmol/L.

**When it diverges:** In highly trained endurance athletes (ModDmax typically identifies a lower lactate concentration) and in less trained individuals (ModDmax typically identifies a higher one).

### Original Dmax — Cheng et al. 1992

**How it works:** As described above — reference line from first to last data point.

**Strengths:** Individualized. Mathematically objective.

**Weaknesses:** Sensitive to resting lactate and test termination point.

**When it agrees with ModDmax:** When the athlete has a stable, low resting lactate and is pushed to true exhaustion.

**When it diverges:** When resting lactate is elevated or the test ends prematurely. Divergence can be 0.5 to 1.5 km/h — a clinically meaningful difference.

### IAT — Stegmann, Kindermann & Schnabel 1981

**How it works:** Uses post-exercise lactate recovery kinetics to identify the intensity at which lactate production equals elimination. Requires blood samples during recovery.

**Strengths:** Strong physiological rationale. Considered a gold standard by many researchers.

**Weaknesses:** Requires recovery blood samples (extra 8-10 minutes of testing). More complex protocol. Not feasible in all settings.

**When it agrees with ModDmax:** Frequently — both methods target the maximal lactate steady state (MLSS) region. Bishop (1998) showed strong correlations.

**When it diverges:** In athletes with unusually fast or slow lactate clearance kinetics.

### Baseline Rise Methods

**How they work:** LT1 is identified where lactate first rises above baseline by a defined amount (typically 0.5 mmol/L per Faude 2009). LT2 is where lactate rises sharply and sustainedly.

**Strengths:** Intuitive. Detect both LT1 and LT2. Low computational requirement.

**Weaknesses:** Subjective element in defining "sustained rise." Sensitive to noisy data.

**Best used:** In combination with ModDmax, as a cross-validation check. If ModDmax and baseline rise agree within 0.5 km/h, confidence is high.

## Validation: What the Research Shows

### Bishop et al. 1998 — The Original Validation

Bishop and colleagues tested ModDmax against cycling time trial performance in trained female cyclists. The key finding: **ModDmax correlated with 40 km time trial performance at r = 0.92** — an exceptionally strong relationship in exercise science. Critically, this correlation was stronger than the original Dmax method, demonstrating that removing the resting lactate anchor point improved the method's predictive validity.

### Nicholson & Sleivert 2001 — Running Performance

Nicholson and Sleivert extended the validation to running, examining multiple lactate threshold methods against 10 km race performance. Their results showed that **ModDmax predicted endurance running performance better than the original Dmax method**, supporting Bishop's original findings across a different exercise modality and competition distance.

### Faude, Kindermann & Meyer 2009 — The Comprehensive Review

Faude et al.'s landmark review in *Sports Medicine* evaluated every major lactate threshold concept published up to that point. Their conclusions were clear:

1. **Fixed thresholds (4 mmol/L) are inferior** to individualized methods for most applications.
2. **Individual methods should account for baseline lactate variation** — a principle that ModDmax embodies by design.
3. **The 0.5 mmol/L rise criterion** for identifying the first significant lactate increase is physiologically sound and practically reliable.
4. **Multi-method approaches**, where multiple detection algorithms are applied and compared, provide the highest confidence.

## Practical Tips for Coaches Using ModDmax

### Protocol Design Matters

ModDmax can only be as good as the data you feed it. Follow these guidelines:

**Step duration: 4 to 5 minutes.** Faude et al. (2009) emphasized that lactate needs time to equilibrate between muscle and blood. Three-minute stages can work for fit athletes but may produce artificially low lactate readings at submaximal intensities, distorting the curve shape. If in doubt, use 4-minute stages.

**Number of data points: minimum 6, ideally 8 to 10.** A third-degree polynomial needs enough points to produce a stable fit. With fewer than 6 points, the curve can oscillate wildly, producing unreliable threshold estimates. More data points yield smoother, more reliable curves.

**Warm-up: 10 minutes easy before the first stage.** This stabilizes baseline lactate and reduces the impact of pre-test variability. A proper warm-up can drop resting lactate from 1.5 mmol/L (if the athlete walks in cold) to 0.8 mmol/L, giving the ModDmax algorithm a cleaner starting signal.

**Push to exhaustion when safe.** While ModDmax is less sensitive to the last data point than Dmax, having a true maximal effort improves the polynomial fit in the high-intensity region. The last 2 to 3 stages should show clearly accelerating lactate.

### Interpreting Results with Confidence

**Cross-validate with other methods.** No single method is perfect. If ModDmax says LT2 is at 15.0 km/h and a baseline rise method says 15.3 km/h, your confidence is high. If they disagree by more than 1 km/h, investigate: the data may have outliers, insufficient points, or protocol issues.

**Look at the lactate value at the detected threshold.** ModDmax identifies an *intensity* (speed, power, pace), but the corresponding *lactate concentration* is informative. In trained endurance athletes, expect ModDmax LT2 between 2.0 and 4.0 mmol/L. Values outside this range are not impossible, but warrant a second look at the data.

**Track trends, not single tests.** A single lactate test is a snapshot. The real power comes from serial testing — running ModDmax every 4 to 8 weeks and tracking how the threshold intensity changes over a training block. Consistent rightward shifts of the lactate curve (higher speeds at the same lactate) confirm that aerobic adaptations are occurring.

### Common Mistakes to Avoid

1. **Skipping warm-up.** Elevated resting lactate from a cold start does not ruin ModDmax (that is the whole point), but it does reduce the number of usable data points in the low-intensity zone.

2. **Too few stages.** Five stages might technically be enough, but the polynomial fit will be fragile. One outlier data point can shift the result significantly.

3. **Inconsistent stage increments.** Mixing 0.5 km/h and 1.5 km/h increments within a single test creates uneven spacing that can distort the polynomial fit. Use consistent increments.

4. **Ignoring outliers.** If one data point is clearly anomalous (a lactate reading of 4.5 mmol/L sandwiched between 2.1 and 2.3), investigate before including it in the analysis. Contaminated samples, measurement errors, and sampling technique problems all occur in real-world testing.

## Why PeakAerobic Uses ModDmax

At PeakAerobic, we do not rely on any single threshold detection method. Our engine applies **three independent algorithms** to every lactate dataset:

1. **ModDmax (Bishop 1998)** — the mathematically rigorous approach described in this article, anchored to physiologically meaningful baseline departure rather than an arbitrary first data point.
2. **Baseline Rise** — detecting the first sustained elevation above baseline (LT1) and the subsequent acceleration point (LT2), calibrated to Faude et al.'s 0.5 mmol/L criterion.
3. **Sustained Increase** — identifying where lactate begins rising consistently between consecutive stages, capturing the inflection through a different geometric lens.

The three methods vote. When they agree, confidence is high. When they disagree, the system flags the discrepancy and applies a median aggregation strategy — using the median rather than the mean — to ensure the final threshold estimate corresponds to an intensity the athlete actually performed during the test, not a mathematical average that falls between two real data points.

On top of this, PeakAerobic applies **automated outlier detection** using a leave-one-out residual analysis. Each data point is temporarily removed, the curve is refit without it, and the residual (how far the removed point falls from the new curve) is measured. Points with high residuals are flagged and down-weighted, preventing a single bad blood sample from corrupting the threshold estimate.

The result: threshold estimates that are **robust to protocol variation, resilient to noisy data, and anchored to real physiology** — not to fixed lactate concentrations that ignore individual differences.

## Frequently Asked Questions

### Is ModDmax better than Dmax?

Yes, for practical coaching purposes. ModDmax eliminates the sensitivity to resting lactate variation that plagues the original Dmax method. Bishop et al. (1998) demonstrated that ModDmax correlated more strongly with time trial performance (r = 0.92) than the original Dmax. The improvement is most noticeable when testing conditions are not perfectly standardized — which is the reality in most coaching environments.

### How many data points do I need for ModDmax?

A minimum of 6 data points is required for a reliable third-degree polynomial fit. With 8 to 10 points, the method becomes robust to individual outliers. Below 5 points, the polynomial can overfit the data and produce unreliable or meaningless threshold estimates. If you only have 4 to 5 points, consider using simpler methods like fixed thresholds or baseline rise as your primary analysis.

### Does ModDmax detect LT1 or LT2?

ModDmax detects **LT2** (the second lactate threshold, also called the anaerobic threshold, lactate turnpoint, or onset of blood lactate accumulation). It identifies the intensity above which lactate accumulation accelerates sharply. It does not detect LT1 (the first lactate threshold or aerobic threshold). For LT1 detection, baseline rise or sustained increase methods are more appropriate.

### Can I calculate ModDmax in Excel?

Yes, with some effort. You need to:
1. Use Excel's `LINEST` function or the `Trendline` feature to fit a third-degree polynomial to your lactate-speed data.
2. Identify the ModDmax start point manually (first point where lactate exceeds baseline + 0.5 mmol/L).
3. Calculate the equation of the reference line between the start point and the last point.
4. Calculate perpendicular distances for each speed value.
5. Find the maximum.

It is feasible but tedious, especially for repeated testing. Dedicated software like PeakAerobic automates this entirely and adds cross-validation with other methods that would be impractical to implement in a spreadsheet.

### What is the difference between ModDmax and OBLA?

OBLA (Onset of Blood Lactate Accumulation) uses a **fixed lactate concentration** — typically 4 mmol/L — to define the threshold. You simply interpolate the intensity at which lactate equals 4.0 mmol/L. ModDmax uses the **shape of the individual's lactate curve** to find the threshold, without reference to any fixed lactate value. The result is that ModDmax adapts to each athlete's physiology. A trained athlete with a rightward-shifted curve might have a ModDmax LT2 at 2.5 mmol/L, while OBLA would force the threshold to 4.0 mmol/L — overestimating the sustainable intensity by a significant margin.

### How does altitude or heat affect ModDmax results?

Environmental stressors shift the entire lactate curve upward and to the left (lactate rises earlier and at lower intensities). ModDmax handles this better than fixed thresholds because it tracks the *shape* of the curve, not the absolute values. However, you should not compare ModDmax results between a sea-level test and an altitude test as if they represent the same condition. Each test reflects the threshold under those specific conditions.

---

## References

- Bishop D, Jenkins DG, Mackinnon LT. The relationship between plasma lactate parameters, Wpeak and 1-h cycling performance in women. *Med Sci Sports Exerc*. 1998;30(8):1270-1275.
- Cheng B, Kuipers H, Snyder AC, Keizer HA, Jeukendrup A, Hesselink M. A new approach for the determination of ventilatory and lactate thresholds. *Int J Sports Med*. 1992;13(7):518-522.
- Faude O, Kindermann W, Meyer T. Lactate threshold concepts: how valid are they? *Sports Med*. 2009;39(6):469-490.
- Heck H, Mader A, Hess G, Mucke S, Muller R, Hollmann W. Justification of the 4-mmol/l lactate threshold. *Int J Sports Med*. 1985;6(3):117-130.
- Nicholson RM, Sleivert GG. Indices of lactate threshold and their relationship with 10-km running velocity. *Med Sci Sports Exerc*. 2001;33(2):339-345.
- Stegmann H, Kindermann W, Schnabel A. Lactate kinetics and individual anaerobic threshold. *Int J Sports Med*. 1981;2(3):160-165.
