# PeakAerobic Pain Points Research

**Document**: 02 — Pain Points & Market Gaps
**Date**: March 2026
**Purpose**: Map the real frustrations of coaches and athletes to PeakAerobic features, and identify high-leverage content angles for organic marketing.

---

## Table of Contents

1. [Coach Pain Points](#1-coach-pain-points)
2. [Athlete Pain Points](#2-athlete-pain-points)
3. [Reddit & Forum Insights](#3-reddit--forum-insights)
4. [How PeakAerobic Solves Each Pain Point](#4-how-peakaerobic-solves-each-pain-point)
5. [Content Angle Opportunities](#5-content-angle-opportunities)
6. [Summary Table: Pain Points to Features to Content](#6-summary-table)

---

## 1. Coach Pain Points

These are the recurring frustrations expressed by endurance coaches who perform lactate testing, prescribe training zones, and plan periodization for their athletes. They range from technical analysis problems to business-level cost barriers.

### CP-1: Analyzing lactate tests manually in Excel is time-consuming and error-prone

The typical workflow after a lactate step test: the coach sits down with a spreadsheet, manually enters heart rate, pace/power, and lactate values for each step, then tries to plot a curve and eyeball the inflection points. This takes 20-40 minutes per test, per athlete. Mistakes happen constantly: a decimal in the wrong column, a formula referencing the wrong cell, a curve that "looks right" but is actually being distorted by a single outlier. Coaches who test 5-10 athletes per week can lose half a day just processing data.

### CP-2: Fixed 4 mmol threshold applied universally

The 4 mmol "OBLA" concept from the 1980s persists because it is simple. Many coaches, even experienced ones, still default to telling athletes their LT2 is wherever lactate crosses 4.0 mmol/L. This ignores decades of research showing massive individual variation. A well-trained ironman athlete may have their true LT2 at 2.8 mmol/L. A sprinter might not hit meaningful inflection until 5.5 mmol/L. Using 4 mmol universally leads to some athletes training too hard in what they think is "threshold" and others training too easy.

### CP-3: No confidence score on threshold detection

Even coaches who use more sophisticated methods (Dmax, modified Dmax, log-log) have no way to quantify how reliable their threshold estimate is. Was it a clean curve with a clear inflection, or a noisy dataset where the "threshold" could be anywhere in a 15 bpm range? Without a confidence metric, the coach has to rely on gut feeling, and the athlete gets a number presented as fact when it might be a rough guess.

### CP-4: Translating test results into actionable training zones

Finding a threshold is only half the job. The coach then needs to derive training zones: Zone 1 boundaries, Zone 2 ceiling, tempo range, threshold range, VO2max intervals. Most coaches use percentage-based formulas (e.g., "Zone 2 = 75-85% of LT2 heart rate") that may or may not reflect the athlete's actual physiology. The translation step introduces another layer of error and subjectivity.

### CP-5: Periodization planning without data-driven tools

Planning a mesocycle is an art, but it should also be informed by data. What block type does this athlete need right now? Is their aerobic capacity the limiter, or their anaerobic power? Most coaches answer these questions based on experience and intuition alone. They lack a systematic framework that integrates the athlete's current physiological profile (LT1/LT2 gap, VLamax, fractional utilization) with periodization science (Olbrecht, Seiler, Issurin).

### CP-6: Managing multiple athletes' longitudinal data

A coach with 15-30 athletes needs to track test results over time, compare trends, flag athletes whose thresholds are stagnating or regressing. Spreadsheets become unmanageable. Some coaches resort to folders of PDFs from lab reports, losing the ability to trend or compare. There is no central dashboard that lets a coach see "which of my athletes haven't been tested in 8 weeks" or "whose LT1/LT2 gap has widened this season."

### CP-7: Communicating results clearly to athletes

After analysis, the coach needs to explain what the numbers mean to an athlete who may have zero background in exercise physiology. "Your LT1 is at 145 bpm and your LT2 is at 168 bpm" means nothing to most athletes. Visual reports, progress charts, and plain-language summaries are needed but rarely available from the tools coaches currently use.

### CP-8: Keeping training plans updated after retesting

An athlete retests every 6-8 weeks. New thresholds come in. Now every prescribed zone, every workout target, every pace band in the training plan is stale. The coach has to manually go through and update everything. In practice, many coaches just verbally tell the athlete the new zones and hope they remember. Prescribed sessions from two weeks ago are still referencing old numbers.

### CP-9: Cost of existing professional tools

INSCYD charges $200+ per test analysis. For a coach testing 20 athletes 4 times per year, that is $16,000/year just for analysis software. TrainingPeaks premium for coaches runs $20-50/month but offers limited lactate analysis. WKO5 is $179 one-time but focused on power modeling, not lactate. For many coaches, especially those in developing markets or working with age-group athletes, these costs are prohibitive and force them back to Excel.

### CP-10: Lack of scientific rigor in many coaching platforms

Most training platforms treat zones as static, use simplistic models, and do not reference the underlying exercise physiology literature. Coaches who have read Olbrecht, Mader, or Billat find that available tools do not reflect the science they trust. The gap between what the literature says and what software tools actually implement creates frustration and distrust.

### CP-11: No integration between testing and workout prescription

Even with good analysis, the output is a PDF or a set of numbers. There is no direct pipeline from "these are your thresholds" to "here is a structured workout targeting LT1 with the correct duration and intensity, pushed to your Garmin." The coach has to manually build every workout.

### CP-12: Difficulty identifying the right training stimulus for each athlete

Two athletes can have identical LT2 values but very different physiological profiles (one with high VLamax and moderate aerobic capacity, the other the reverse). They need fundamentally different training. Most tools do not surface this distinction, so the coach prescribes the same type of block for both.

---

## 2. Athlete Pain Points

These are frustrations experienced directly by the athletes, whether self-coached or working with a coach. Many overlap with coach pain points but are experienced from a different angle.

### AP-1: Not understanding their lactate test results

The athlete pays $100-300 for a lab test, receives a PDF with charts and numbers, and has no idea what it means. "Your MLSS is 3.4 mmol/L at 285 watts" is meaningless without context. Is that good? Bad? What should they do differently? The gap between data collection and actionable understanding is enormous.

### AP-2: Training in the wrong zones for months

This is arguably the most damaging pain point. An athlete who thinks they are doing "Zone 2" but is actually at 85% of LT2 is accumulating fatigue, not building aerobic base. An athlete training "at threshold" who is actually 10 bpm below it is getting a tempo stimulus when they need a threshold stimulus. Wrong zones mean wrong adaptations, which means wasted months of training.

### AP-3: Generic training plans that are not individualized

Most plans from books, apps, or even coaches follow a template: "Week 1: 3 easy runs, 1 tempo, 1 long run." But what intensity is "easy" for this athlete? What pace is "tempo" given their specific physiology? Without grounding the plan in tested thresholds, every prescription is a guess dressed up as a plan.

### AP-4: No visibility into their own data and progress over time

Athletes want to see trends. "Am I improving?" "Has my LT1 shifted right since January?" "Is the gap between my LT1 and LT2 closing?" Most athletes have no access to their longitudinal data. Each test is an isolated event rather than a point on a trajectory.

### AP-5: Expensive lab tests with minimal actionable output

A full lactate profile at a sports science lab can cost $150-400. The athlete gets a one-page report and maybe a 15-minute debrief. The cost-to-insight ratio feels poor, discouraging regular retesting. But without regular retesting, zones go stale (see AP-10).

### AP-6: Zone 2 confusion

"Zone 2" has become the most discussed and most misunderstood concept in endurance training since 2022. Depending on the system (Coggan, Seiler, Friel, heart rate vs. power vs. pace), "Zone 2" refers to different physiological intensities. Athletes read conflicting advice daily: "Zone 2 should feel easy," "Zone 2 is where you can still talk," "Zone 2 is below 2 mmol/L," "Zone 2 is 55-75% of FTP." The confusion leads to paralysis or, worse, confident execution of the wrong intensity.

### AP-7: No way to predict race performance from physiology

Athletes want to know: "What marathon time can I expect with my current fitness?" Physiological models (di Prampero, Daniels VDOT) can estimate this, but athletes have no access to these models integrated with their actual test data. They resort to online calculators that use recent race times, which is circular (you need a race to predict a race).

### AP-8: VLamax is unknown and unexplained

VLamax (maximum rate of lactate production) is increasingly discussed in cycling and triathlon circles thanks to INSCYD marketing. Athletes hear that "lowering your VLamax is key for long-distance performance" but have no idea what their VLamax is, how to estimate it, or what training would change it. It remains a black box accessible only to those who pay for INSCYD analysis.

### AP-9: Overtraining and undertraining without objective data

Without clear, personalized zones and a periodization framework, athletes oscillate between doing too much (driven by Strava peer pressure and "more is better" culture) and doing too little (driven by fear of overtraining after reading an article). Objective physiological data provides guardrails that subjective feel cannot.

### AP-10: Stale training zones from tests done months ago

Training adaptations shift thresholds. An athlete tested in January who is still using January zones in April is likely training at wrong intensities. But retesting requires scheduling, cost, and logistics. Many athletes go 6-12 months between tests, during which their zones may shift by 5-15%.

### AP-11: No connection between test data and daily training

Even athletes who get tested regularly experience a disconnect: the test produces numbers, but those numbers do not flow into their daily training app. They have to manually calculate paces, set zones in Garmin, build workouts. The friction is high enough that many athletes just approximate.

### AP-12: Fear of lactate testing being "only for pros"

A significant psychological barrier exists. Many age-group athletes believe lactate testing is only for elite athletes, too expensive for their level, or that they are "not fast enough" to benefit. This keeps a large market segment away from testing entirely, even though age-groupers arguably benefit more from individualized zones than elites who have years of self-knowledge.

---

## 3. Reddit & Forum Insights

The following are synthesized from recurring themes in r/running, r/triathlon, r/Velo, r/AdvancedRunning, r/cycling, Slowtwitch forums, and TrainingPeaks community boards. They represent the language real people use to express these frustrations.

### Theme 1: "Lactate testing is expensive and I don't know what to do with the results"

This is the single most common sentiment. Appears in multiple forms:

- *"Paid $250 for a lactate test, got a PDF with graphs I don't understand. My coach just said 'keep doing what you're doing.' What was the point?"*
- *"Is lactate testing worth it for a 4:00 marathon runner or is it only useful for sub-elites?"*
- *"Got tested, was told my LT2 is at 165bpm. Now what? How do I use this?"*

The recurring pattern: willingness to invest in testing, followed by disappointment at the lack of actionable interpretation.

### Theme 2: "My coach uses 4 mmol for everyone"

- *"Found out my coach just uses 4mmol for all his athletes. Is this a red flag?"*
- *"Debate: is OBLA (4mmol) still valid or should we be using individual thresholds?"*
- *"I've read that 4mmol is outdated but every test report I've seen uses it. Are there better methods?"*

This comes up especially in r/Velo and r/triathlon where athletes tend to be more data-literate.

### Theme 3: "I've been doing Zone 2 wrong for months"

The Zone 2 discourse is relentless:

- *"Just got a lactate test and realized my 'Zone 2' was actually Zone 3. I've been going too hard on every easy run for 6 months."*
- *"What IS Zone 2? Maffetone says 180-age, my Garmin says something else, my coach says something else. Help."*
- *"Finally did a lactate test and my Zone 2 ceiling is way lower than I thought. Ego crushed but probably explains why I'm always tired."*

This is a massive content opportunity because the emotional resonance is high (wasted effort, frustration, revelation).

### Theme 4: "INSCYD is too expensive for age-groupers"

- *"My coach wants me to do INSCYD but it's $200 per test. Is there a cheaper alternative that gives similar insights?"*
- *"INSCYD seems great but the cost model is clearly designed for pro teams. Anyone know a free or cheaper option?"*
- *"Tried to get VLamax testing but the only option near me is INSCYD at $250. Can I estimate it from a standard step test?"*

This is a direct market opening. Athletes and coaches want INSCYD-level analysis at a price point that allows regular retesting.

### Theme 5: "TrainingPeaks doesn't help me interpret my lactate data"

- *"I use TrainingPeaks but there's no way to input lactate data and have it calculate thresholds. I still do everything in Excel."*
- *"WKO5 models my FTP from power data but I want to integrate my actual lactate tests. Is there a tool for this?"*
- *"I log my lactate results in the notes field of TrainingPeaks. There has to be a better way."*

The gap in the market is clear: major platforms do not integrate lactate data analysis. It is treated as external.

### Theme 6: Zone 2 debates, threshold confusion, VLamax mystique

- *"Can someone ELI5 what VLamax is and why I should care?"*
- *"LT1 vs LT2 vs MLSS vs FTP vs Threshold -- can someone make a diagram?"*
- *"Is VLamax just marketing from INSCYD or is there real science behind it?"*
- *"How do you actually know if you should be doing more Zone 2 or more threshold work? Everyone just says 'polarized' but how do you decide?"*

The knowledge gap is real. Athletes are hungry for education delivered in accessible language, connected to tools they can actually use.

### Theme 7: "I want to push structured workouts to my watch"

- *"I build my intervals in a spreadsheet and then manually create them on Garmin Connect. Takes forever."*
- *"Is there a tool that lets me define a workout with specific HR/pace targets and push it to my Garmin?"*
- *"TrainingPeaks workout builder is ok but I wish it could auto-populate targets from my test results."*

The desire for end-to-end workflow (test analysis to workout on the wrist) is strong.

### Theme 8: "How do I know what training block to do next?"

- *"I'm 16 weeks out from my A race. Should I be doing base, threshold, or VO2max work right now?"*
- *"My coach changes my block type every 4 weeks but never explains the logic. How do coaches decide?"*
- *"Is there a systematic way to choose between an aerobic capacity block and a threshold block based on my test results?"*

This is the periodization pain point expressed in athlete language. They want the engine, not just the zones.

---

## 4. How PeakAerobic Solves Each Pain Point

### Coach Pain Points: Solutions

| Pain Point | PeakAerobic Feature | Detail |
|---|---|---|
| **CP-1**: Manual Excel analysis | **Automated multi-method threshold detection** | Upload test data, get LT1/LT2 in seconds via three independent methods (baseline_rise, sustained_increase, ModDmax) aggregated with median for pace/power and mean for lactate. No spreadsheet needed. |
| **CP-2**: Fixed 4 mmol for everyone | **Individualized threshold detection** | PeakAerobic detects the actual inflection points in each athlete's curve, not a fixed mmol target. LT2 practical is anchored at 3.1 mmol as a conservative reference but the true physiological threshold is identified from curve shape. |
| **CP-3**: No confidence score | **Per-method and aggregate confidence scores** | Each method produces a confidence value (0-1). Agreement score measures cross-method consistency. Real thresholds only display when confidence exceeds 0.75 and agreement exceeds 0.62. The coach sees exactly how trustworthy the estimate is. |
| **CP-4**: Translating results to zones | **Automatic zone derivation from thresholds** | Once thresholds are detected, training zones are calculated automatically, anchored to real physiological landmarks rather than arbitrary percentages. |
| **CP-5**: Periodization without data | **Olbrecht-based physiological engine** | The planning engine assesses the athlete's CapacityProfile (aerobic level, VLamax proxy, LT1/LT2 gap), determines the current macro phase, and recommends one of 6 Olbrecht block types with scientific rationale. |
| **CP-6**: Managing multiple athletes | **Multi-athlete dashboard** | Central view of all athletes, their last test date, threshold trends, and testing recency alerts. |
| **CP-7**: Communicating results | **Visual reports with progress charts** | Lactate curves with marked thresholds, longitudinal trend charts, and plain-language summaries the athlete can understand without a physiology degree. |
| **CP-8**: Updating plans after retest | **Dynamic thresholds** | The dynamic threshold engine recalculates thresholds incorporating new test data, with LOO outlier detection and multi-bracket interpolation. New zones propagate to the training plan automatically. |
| **CP-9**: Tool cost ($200+/test) | **Free** | PeakAerobic is free. Zero cost per test, per athlete, per month. Removes the financial barrier entirely. |
| **CP-10**: Lack of scientific rigor | **Published methods with citations** | Every algorithm references its source: ModDmax (Bishop 1998), baseline criteria (Faude 2009), outlier thresholds (Billat 2003), periodization (Olbrecht Science of Winning). |
| **CP-11**: No test-to-workout pipeline | **Garmin workout push** | Structured workouts generated from the periodization engine can be pushed directly to Garmin Connect and onto the athlete's watch. |
| **CP-12**: Identifying the right stimulus | **CapacityProfile + block selection** | VLamax proxy, aerobic level assessment, and LT1/LT2 gap analysis determine whether the athlete needs aerobic capacity, threshold development, anaerobic capacity, or power work. |

### Athlete Pain Points: Solutions

| Pain Point | PeakAerobic Feature | Detail |
|---|---|---|
| **AP-1**: Not understanding results | **Visual curve + threshold markers + plain-language summary** | The athlete sees their lactate curve with LT1 and LT2 clearly marked, plus zones highlighted in color. No jargon-heavy PDF. |
| **AP-2**: Training in wrong zones | **Individualized zones from real thresholds** | Zones derived from actual inflection points, not formulas. Zone 2 ceiling is LT1, not a percentage of max HR. |
| **AP-3**: Generic plans | **Periodization engine with dose ladders** | Workouts are prescribed based on the athlete's physiology, current block type, and dose step (progressive overload within each family). 10 workout families with 5-8 dose steps each. |
| **AP-4**: No visibility into progress | **Longitudinal threshold tracking** | Every test creates a snapshot. The athlete sees LT1 and LT2 trends over weeks and months, with confidence bands. |
| **AP-5**: Expensive tests, little output | **Maximum insight from standard step tests** | PeakAerobic extracts LT1, LT2, practical thresholds, real thresholds, VLamax proxy, VO2max estimate, and race predictions from a single step test. No proprietary protocol required. |
| **AP-6**: Zone 2 confusion | **LT1-anchored Zone 2** | Zone 2 is defined as the intensity range below LT1. No ambiguity. The athlete sees exactly what heart rate, pace, or power corresponds to their personal Zone 2. |
| **AP-7**: No race predictions | **Di Prampero + VLamax race prediction model** | Race time estimates derived from the athlete's physiological profile (VO2max via Swain+ACSM, fractional utilization, running economy). Not based on previous race results. |
| **AP-8**: VLamax unknown | **VLamax estimation from LT1/LT2 ratio** | VLamax proxy calculated from the ratio of LT1 to LT2 (Mader 2003 framework). Athletes see whether their glycolytic capacity is low, moderate, or high, with practical training implications. |
| **AP-9**: Over/undertraining | **Data-driven block prescription + recovery weeks** | The wave principle ensures build-peak-recovery cycles. Block selection is grounded in physiology, not vibes. Contraindication warnings flag when weeks-to-race are insufficient for a given block type. |
| **AP-10**: Stale zones | **Dynamic threshold engine** | Thresholds update with each new test. Weighted recency model means the most recent test has the strongest influence. Alerts when last test is >42 days old. |
| **AP-11**: No connection to daily training | **Garmin push + structured workout format** | Workouts with correct pace/HR/power targets pushed to the athlete's Garmin watch. Warm-up and cool-down templates included. No manual zone entry. |
| **AP-12**: "Only for pros" perception | **Free, accessible, no equipment needed** | PeakAerobic removes the cost barrier. Any athlete who has access to a lactate meter (Lactate Pro 2 costs ~$300 and is reusable) can test themselves and get professional-grade analysis for free. |

---

## 5. Content Angle Opportunities

Each pain point can be turned into content. The best marketing hooks combine emotional resonance (frustration, revelation, empowerment) with educational value (the audience learns something) and a natural product tie-in (PeakAerobic is the solution, not a forced pitch).

### Tier 1: Highest-Impact Content Hooks

These pain points generate the strongest emotional responses and the widest audience reach.

**"You've been doing Zone 2 wrong"** (AP-6, AP-2)
- Format: Instagram carousel or short-form video
- Hook: Show a real lactate curve where an athlete's perceived Zone 2 was actually Zone 3
- Content: Explain LT1-based Zone 2 vs. formula-based Zone 2
- CTA: "Upload your test data and find your real Zone 2"
- Why it works: Zone 2 is the most searched and debated topic in endurance training. The revelation moment ("I was going too hard") is universally relatable.

**"Your coach uses 4 mmol for everyone. Here's why that's wrong."** (CP-2, AP-2)
- Format: Educational carousel or long-form video
- Hook: Side-by-side lactate curves of two athletes with identical 4 mmol crossings but very different true thresholds
- Content: History of OBLA, why individual detection matters, real examples
- CTA: "Find your real threshold, not a textbook number"
- Why it works: Challenges conventional wisdom, positions PeakAerobic as scientifically advanced.

**"$200 per test analysis vs. free"** (CP-9, AP-5)
- Format: Comparison post or video
- Hook: Cost breakdown of INSCYD ($200/test x 4 tests/year x 10 athletes = $8,000/year)
- Content: What PeakAerobic gives you for free that others charge hundreds for
- CTA: "Same science. Zero cost."
- Why it works: Price is the most concrete, indisputable differentiator. Age-groupers and budget-conscious coaches will share this.

### Tier 2: Strong Educational Hooks

**"What is VLamax and why should you care?"** (AP-8)
- Format: Educational carousel
- Hook: "VLamax is the single number that explains why some athletes blow up in races"
- Content: ELI5 of VLamax, how PeakAerobic estimates it from a standard test
- Why it works: VLamax mystique creates curiosity. Demystifying it positions PeakAerobic as the accessible alternative to INSCYD.

**"Your training zones expired 8 weeks ago"** (AP-10, CP-8)
- Format: Short-form video or carousel
- Hook: Calendar graphic showing zone drift over time
- Content: Why zones shift, how often to retest, how dynamic thresholds solve this
- Why it works: Creates urgency to retest, which drives platform usage.

**"From lactate test to Garmin workout in 60 seconds"** (CP-11, AP-11)
- Format: Screen recording / demo video
- Hook: Speed-run showing test upload to workout on wrist
- Content: The full pipeline working in real time
- Why it works: Demonstrates concrete value in the most compelling format (show, don't tell).

**"What training block should you do next? The science of block selection"** (CP-5, CP-12)
- Format: Long carousel or educational video
- Hook: Decision tree showing how physiology determines block type
- Content: Olbrecht's framework simplified, with PeakAerobic screenshots
- Why it works: Educates while showcasing the periodization engine, the deepest moat feature.

### Tier 3: Community and Trust Builders

**"Lactate testing is not just for pros"** (AP-12)
- Format: Athlete testimonial or data story
- Hook: Age-group athlete discovers their real zones and improves by X%
- Content: Democratization narrative, accessibility of portable lactate meters
- Why it works: Expands the addressable market by reducing perceived barriers.

**"How we detect outliers in your lactate data"** (CP-3, CP-10)
- Format: Deep-dive educational post
- Hook: "One bad data point can shift your threshold by 10 bpm. Here's how we catch it."
- Content: LOO outlier detection explained visually
- Why it works: Builds trust in the algorithm, differentiates from black-box tools.

**"Predict your marathon time from your lactate test"** (AP-7)
- Format: Interactive post or calculator CTA
- Hook: "Your physiology says you can run a 3:12 marathon. Let's see if you agree."
- Content: Di Prampero model simplified, show predictions vs. actual race results
- Why it works: Race predictions are irresistible to athletes. High shareability.

**"Confidence score: how sure are we about your threshold?"** (CP-3)
- Format: Carousel
- Hook: Two test results side by side, one with 0.92 confidence, one with 0.58
- Content: Why confidence matters, what a noisy curve looks like, what to do about it
- Why it works: No other tool does this. Pure differentiation.

---

## 6. Summary Table

| # | Pain Point | Who | PeakAerobic Feature | Best Content Angle | Content Tier |
|---|---|---|---|---|---|
| CP-1 | Manual Excel analysis | Coach | Auto multi-method detection | "Stop analyzing tests in Excel" | 2 |
| CP-2 | Fixed 4 mmol threshold | Coach | Individualized curve-shape detection | "4 mmol is wrong for most athletes" | 1 |
| CP-3 | No confidence score | Coach | Per-method confidence + agreement score | "How sure are we about your threshold?" | 3 |
| CP-4 | Translating results to zones | Coach | Automatic zone derivation | "From test to zones in seconds" | 2 |
| CP-5 | No data-driven periodization | Coach | Olbrecht physiological engine | "What block should you do next?" | 2 |
| CP-6 | Managing multiple athletes | Coach | Multi-athlete dashboard | "One dashboard for all your athletes" | 3 |
| CP-7 | Communicating results to athletes | Coach | Visual reports + summaries | "Reports your athletes will actually read" | 3 |
| CP-8 | Stale plans after retest | Coach | Dynamic threshold propagation | "Your zones expired 8 weeks ago" | 2 |
| CP-9 | Cost of tools ($200+/test) | Coach | Free platform | "$200/test vs. free" | 1 |
| CP-10 | Lack of scientific rigor | Coach | Cited methods (Bishop, Faude, Billat) | "Every algorithm has a citation" | 3 |
| CP-11 | No test-to-workout pipeline | Coach | Garmin workout push | "Test to Garmin in 60 seconds" | 2 |
| CP-12 | Can't identify right stimulus | Coach | CapacityProfile + block selection | "Two athletes, same LT2, different blocks" | 2 |
| AP-1 | Don't understand test results | Athlete | Visual curve + plain-language summary | "What your lactate test actually means" | 2 |
| AP-2 | Training in wrong zones | Athlete | Individualized zones from real thresholds | "You've been doing Zone 2 wrong" | 1 |
| AP-3 | Generic non-individualized plans | Athlete | Dose ladders + physiological prescription | "Your plan should match your physiology" | 2 |
| AP-4 | No visibility into progress | Athlete | Longitudinal threshold tracking | "Are you actually improving? Now you can see." | 3 |
| AP-5 | Expensive tests, little output | Athlete | Maximum insight from standard tests | "Get more from your lactate test" | 2 |
| AP-6 | Zone 2 confusion | Athlete | LT1-anchored Zone 2 definition | "What IS your real Zone 2?" | 1 |
| AP-7 | No race predictions | Athlete | Di Prampero race prediction model | "Your physiology predicts a 3:12 marathon" | 3 |
| AP-8 | VLamax unknown | Athlete | VLamax proxy from LT1/LT2 ratio | "What is VLamax?" | 2 |
| AP-9 | Over/undertraining | Athlete | Wave principle + recovery scheduling | "Train smarter, not harder (with data)" | 3 |
| AP-10 | Stale zones | Athlete | Dynamic threshold engine | "When did you last update your zones?" | 2 |
| AP-11 | No connection to daily training | Athlete | Garmin push + structured workouts | "From test to your wrist" | 2 |
| AP-12 | "Only for pros" perception | Athlete | Free + accessible | "Lactate testing is not just for pros" | 3 |

---

## Key Takeaways for Marketing Strategy

1. **Lead with Zone 2 confusion and the 4 mmol myth.** These two topics have the highest organic reach potential because they tap into active, ongoing debates in every endurance community. They are emotionally charged (people feel cheated or vindicated) and naturally lead to the product.

2. **Price is the clearest differentiator.** "Free vs. $200/test" requires no explanation and no nuance. Use it early and often in comparison content.

3. **Education is the marketing.** The target audience (data-literate coaches and self-coached athletes) does not respond to hype. They respond to depth. Every piece of content should teach something real and position PeakAerobic as the team that understands the science.

4. **Show the full pipeline.** The most compelling demo is not a feature list but a screen recording: upload test data, see thresholds with confidence scores, get a block recommendation, push a workout to Garmin. End-to-end value in 60 seconds.

5. **Target Reddit and forum communities directly.** The language, questions, and frustrations documented in Section 3 should inform the exact wording of social media hooks. Speak the language of the community, not the language of a product page.

6. **VLamax is a curiosity magnet.** It is the most "mysterious" metric in endurance sports right now. Demystifying it (and showing that PeakAerobic estimates it for free from a standard test) is a powerful differentiation play against INSCYD's premium positioning.

7. **Confidence scores are a trust builder, not a headline.** Most athletes do not care about confidence scores upfront, but coaches do. Use confidence scores in coach-facing content to build credibility. Use Zone 2 and race predictions in athlete-facing content to build excitement.

---

*Document prepared for PeakAerobic marketing strategy. All pain points sourced from community research, user interviews, and competitive analysis.*
