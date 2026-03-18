# PeakAerobic Competitive Analysis
**Date:** March 2026 | **Market:** Endurance Training & Lactate Analysis Software

---

## Table of Contents
1. [Direct Competitors](#1-direct-competitors)
2. [Indirect Competitors](#2-indirect-competitors)
3. [Comparison Matrix](#3-comparison-matrix)
4. [TOP 5 Uncontested Gaps](#4-top-5-uncontested-gaps)
5. [Marketing Differentiation Strategy](#5-marketing-differentiation-strategy)

---

## 1. Direct Competitors

### 1.1 INSCYD

**What it is:** Cloud-based metabolic profiling platform used by pro teams (Jumbo-Visma, Alpecin-Fenix, Movistar). Founded by Sebastian Weber (Tony Martin's former coach). The "industry standard" for coaches who want VO2max, VLamax, fat/carb combustion from lactate or power-only tests.

**Pricing:**
- Coach subscription starts at EUR 49/month (unlimited athletes)
- Onboarding includes 2h personal consultancy
- Partnership with NOVA (US) and CARDIOWORLD (EU) for hardware bundles
- End-user test cost via certified coaches: $149-$199 per test

**Key Features:**
- Full metabolic profile: VO2max, VLamax, MLSS, LT1, FatMax, carb/fat combustion rates
- Power-only testing option (no lactate needed via sprint protocol)
- Customizable branded PDF reports
- Cloud-based, works on any device
- Growing integration ecosystem (Garmin, CARDIOWORLD lactate meters)

**Target Audience:**
- Professional and semi-professional coaching businesses
- Sports science labs and federations
- Certified coaches who resell testing as a premium service

**Main Weaknesses / Gaps:**
- **Black box algorithm:** VLamax calculation uses proprietary constants that have never been fully published. Users must trust the model without being able to audit it.
- **No longitudinal tracking:** Each test is a standalone snapshot. No automatic trend analysis across tests over months/years.
- **No training prescription:** Produces a metabolic profile but does NOT prescribe what to do with it. The coach must interpret and plan manually.
- **No periodization engine:** Zero connection between test results and mesocycle design.
- **Sprint test validity concerns:** The power-only VLamax estimation requires specific ergometer setup (inertia, gearing, flywheel mass). Results vary with equipment.
- **Cycling-centric:** While marketed as multi-sport, the core model and most use cases are cycling/triathlon.
- **No dynamic thresholds:** Cannot update thresholds between tests without running a new full test.

**What Users Complain About (Slowtwitch, TrainerRoad Forum, CyclingNews):**
- "VLamax is BS" -- prominent exercise physiologists question whether VLamax as INSCYD calculates it is a meaningful metric
- Proprietary "magic constants" make independent validation impossible
- Expensive for amateur athletes who just want to know their zones
- No guidance on WHAT to train after getting the profile
- Sprint test accuracy highly dependent on equipment setup
- Marketing implies "non-invasive" but the lactate protocol requires blood draws

**Where PeakAerobic is BETTER:**
- **Open science:** Uses published methods (Faude 2009, Bishop 1998 ModDmax, Billat 2003) that coaches can understand and verify
- **Longitudinal tracking:** Dynamic threshold engine tracks LT1/LT2 evolution over time automatically
- **Integrated periodization:** Olbrecht-based mesocycle engine directly connects test results to training blocks
- **Automatic prescription:** Block selection engine (6 Olbrecht block types) prescribes specific training based on gaps
- **Multi-method aggregation:** 3 threshold detection methods with confidence scoring vs INSCYD's single model
- **Real thresholds vs practical thresholds:** Dual-layer system (physiological + operational) with conservative gates

**Marketing Angle:**
> "INSCYD tells you what you are. PeakAerobic tells you what to do about it."

---

### 1.2 Winlactat / Mesics (LC Lactat)

**What it is:** German-origin desktop software for lactate step test analysis, primarily used in university labs and sports medicine clinics. Rebranding from Winlactat to LC Lactat (LabConnector Lactat). Transitioned to SaaS in 2023.

**Pricing:**
- Previously one-time purchase (~$333)
- Now SaaS model (specific pricing not publicly available)
- Historically priced for institutional buyers

**Key Features:**
- Multiple lactate threshold models (Dmax, ModDmax, OBLA, individual thresholds)
- Multiparametric analysis (VO2max, METS, FatMax)
- Training zone creation from test results
- Longitudinal/cross-sectional analysis
- Integrated training calendar

**Target Audience:**
- University sports science departments
- Sports medicine clinics
- National sports federations (strong in DACH region)

**Main Weaknesses / Gaps:**
- **Legacy UX:** Desktop-first design feels dated. The SaaS transition is incomplete.
- **Lab-centric workflow:** Designed for controlled lab environments, not field testing
- **No AI/automation:** Manual threshold selection, no automatic method comparison
- **No periodization:** Provides thresholds but no training block design
- **Limited ecosystem:** Poor integration with modern platforms (Garmin, Strava, TrainingPeaks)
- **German-market focus:** Limited English documentation and support
- **No dynamic updates:** Cannot update thresholds between formal lab tests

**What Users Complain About:**
- Outdated interface compared to modern web apps
- Steep learning curve for non-scientists
- Poor mobile experience
- Limited to lab protocols; field testing is an afterthought

**Where PeakAerobic is BETTER:**
- Modern web-first UX vs legacy desktop
- Field-test friendly with flexible protocols
- Automatic multi-method threshold detection (no manual selection)
- Dynamic threshold engine updates between tests
- Full periodization engine connected to results
- Coach-athlete workflow (not lab-technician workflow)

**Marketing Angle:**
> "Lab-grade analysis without the lab. Real-world coaching without the spreadsheet."

---

### 1.3 Golden Cheetah

**What it is:** Free, open-source (GPL v2) performance analysis software for cycling/running/triathlon. Desktop application (Mac, Windows, Linux) with 300+ metrics.

**Pricing:**
- Completely free (open source)

**Key Features:**
- 300+ performance metrics
- Critical Power and W'bal modeling
- Banister impulse-response model and PMC
- Power Duration curves
- Cloud sync (Strava, Today's Plan, Withings)
- User-extensible metrics via Python/R

**Target Audience:**
- Data-savvy self-coached athletes
- Coaches who want full data ownership
- Power meter enthusiasts
- Budget-conscious athletes

**Main Weaknesses / Gaps:**
- **No lactate analysis:** Zero native support for blood lactate data entry or threshold detection
- **Power-meter required:** Most features are useless without power data
- **Terrible UX:** Widely acknowledged as intimidating, crash-prone, and ugly
- **No coaching workflow:** Single-athlete tool, no coach-athlete relationship management
- **No training prescription:** Analysis only, no workout generation or periodization
- **No mobile app:** Desktop-only in a mobile-first world
- **Community support only:** No professional support, documentation is sparse
- **No cloud platform:** Local data storage, no collaboration features

**What Users Complain About:**
- "Quirky interface that crashes occasionally"
- Requires substantial terminology knowledge to use effectively
- Not beginner-friendly at all
- Multi-sport support is limited (cycling-first)

**Where PeakAerobic is BETTER:**
- Native lactate analysis (the core feature GC completely lacks)
- Modern web UI vs clunky desktop app
- Coach-athlete workflow vs single-user tool
- Integrated periodization and workout generation
- Mobile-friendly
- Professional support and onboarding

**Marketing Angle:**
> "Golden Cheetah shows you the numbers. PeakAerobic shows you the physiology behind them."

---

### 1.4 Xert

**What it is:** AI-powered cycling training platform with real-time fitness tracking, adaptive workout selection, and MPA (Maximal Power Available) analysis. Power-meter focused.

**Pricing:**
- $10/month with 30-day free trial

**Key Features:**
- MPA (Maximal Power Available) real-time analysis
- SMART workouts that adapt on-the-fly during execution
- Forecast AI: predicts future fitness trajectory
- Adaptive Training Advisor: daily workout suggestions
- Breakthrough detection from ride data

**Target Audience:**
- Self-coached cyclists with power meters
- Data-driven indoor trainers (Zwift/Wahoo users)
- Athletes who want "set and forget" AI training

**Main Weaknesses / Gaps:**
- **Cycling-only:** No meaningful running or swimming support
- **No lactate integration:** Purely power-based model, no physiological testing
- **Complex UI:** Users find it intimidating and confusing
- **Poor outdoor training support:** Hard to hit specific power targets outdoors
- **Small workout library:** Gets repetitive quickly
- **Training hour miscalculations:** Users report AI suggesting excessive weekly volumes
- **No periodization transparency:** The AI is a black box; coaches cannot understand or override the logic
- **No multi-athlete management:** Not designed for coaching businesses

**What Users Complain About:**
- "Only suggests very few workouts which get boring quickly"
- Excessive training hours suggested even on moderate settings
- Impossible to block days for other sports (swimming/running)
- Login/account access issues reported
- Interface is "intimidating for casual cyclists"

**Where PeakAerobic is BETTER:**
- Lactate-based physiology vs power-only modeling
- Multi-sport support (running, cycling, swimming)
- Transparent Olbrecht-based periodization (coach can audit every decision)
- Dose ladder system with progressive overload logic
- Coach-athlete workflow for professional use
- Real physiological thresholds vs algorithm-derived estimates

**Marketing Angle:**
> "AI guesses your physiology. Blood lactate measures it."

---

## 2. Indirect Competitors

### 2.1 TrainingPeaks

**What it is:** The dominant endurance coaching platform. Calendar-based training log with coach-athlete workflow, workout library, and training plan marketplace.

**Pricing:**
- Athletes: $19.95/month or $134.99/year (Premium)
- Coaches: $21.99/month (basic, 5 athletes) or $54.99/month (unlimited)
- $99 coach activation fee
- Premium athlete add-ons: $5.40-$9.00/athlete/month (volume discounts)

**Key Features:**
- Industry-standard coach-athlete platform
- TSS/CTL/ATL performance management chart
- Workout builder and structured workouts
- Training plan marketplace
- Device sync with virtually every brand
- Compliance tracking and notifications

**What It Does Well:**
- Ecosystem dominance: every coach and athlete knows it
- Device integration is unmatched
- Calendar UX for planning is clean
- Training plan marketplace is a revenue channel for coaches

**What It Lacks (Lactate/Physiology):**
- **No native lactate analysis:** Users must manually enter thresholds
- **No threshold detection:** Coaches set zones by hand
- **No physiological modeling:** TSS is a simple stress metric, not physiology
- **No periodization intelligence:** The calendar is manual; no AI or engine suggests blocks
- **No metabolic profiling:** No VO2max, VLamax, fat/carb rates
- **No dynamic threshold updates:** Thresholds are static until manually changed

**What Users Complain About:**
- Price increases (annual went from $124.99 to $134.99 in 2025)
- Premium is required for basic features like performance charts
- No innovation in core analytics for years
- Coaching workflow is good but analytics are shallow

**Where PeakAerobic is BETTER:**
- Complete lactate analysis pipeline (what TP completely lacks)
- Automatic threshold detection and evolution tracking
- Physiological periodization engine
- Metabolic profiling from field tests
- Dynamic threshold updates without manual entry
- Science-backed block selection vs manual calendar planning

**Marketing Angle:**
> "TrainingPeaks is your training calendar. PeakAerobic is your training brain."

---

### 2.2 TrainerRoad

**What it is:** AI-powered structured training platform, primarily for indoor cycling. Known for AI FTP Detection and Adaptive Training that adjusts workout difficulty based on performance.

**Pricing:**
- $21.99/month or $209/year
- 30-day money-back guarantee

**Key Features:**
- AI FTP Detection (no test required)
- Adaptive Training: adjusts plan after each workout
- AI Training Simulation: models 4-week windows with hundreds of scenarios
- Fatigue Detection (present and predictive)
- Large structured workout library
- TrainNow: on-demand workout suggestions

**What It Does Well:**
- AI-driven plan adaptation is genuinely useful
- Large, high-quality workout library
- Indoor training experience is excellent
- FTP detection removes testing friction

**What It Lacks (Lactate/Physiology):**
- **No lactate integration:** FTP is estimated from power data only
- **No physiological thresholds:** No LT1, LT2, VLamax, VO2max
- **Cycling-only:** Running support is minimal
- **No metabolic profiling:** Cannot distinguish aerobic vs anaerobic limitations
- **No coaching workflow:** Single-athlete platform
- **Indoor-focused:** Outdoor training is secondary
- **Black box AI:** Athletes cannot understand why specific workouts are chosen

**What Users Complain About:**
- Cycling-only limits triathlon/running use
- Indoor-focused; outdoor workout execution is poor
- AI decisions are opaque
- No coach-athlete features

**Where PeakAerobic is BETTER:**
- Lactate-based physiological profiling vs power-only estimation
- Multi-sport support (run, bike, swim)
- Transparent periodization logic (Olbrecht model, auditable decisions)
- Coach-athlete workflow
- Identifies specific physiological gaps (LT1 vs LT2 vs VO2max)
- Dose ladder progression tied to actual test results

**Marketing Angle:**
> "TrainerRoad optimizes your next workout. PeakAerobic optimizes your next training block."

---

### 2.3 Intervals.icu

**What it is:** Free/donation-based training analysis platform created by a single developer. Web-based alternative to TrainingPeaks with surprisingly deep analytics.

**Pricing:**
- Free (core platform, no time limits)
- Supporter: $4/month (extra features + support the developer)

**Key Features:**
- Performance Management Chart (TSS/CTL/ATL)
- Automatic eFTP estimation
- Power curve comparison across seasons
- Cardiac drift analysis for aerobic fitness tracking
- Workout builder and training calendar
- Interval auto-detection
- Integration with Garmin, Polar, Suunto, Coros, Wahoo, Strava, Zwift, WHOOP, Oura

**What It Does Well:**
- Incredible value for free
- Clean, modern UI
- Active developer who ships features fast
- Good community forum
- Cardiac drift tracking is unique

**What It Lacks (Lactate/Physiology):**
- **No native lactate analysis:** Cannot input or analyze blood lactate data
- **No threshold detection from lactate:** Relies on power-based estimates only
- **No metabolic profiling:** No VO2max, VLamax, fat oxidation modeling
- **No periodization engine:** Calendar is manual
- **No coaching workflow:** Single-athlete focused
- **Single developer risk:** Bus factor of 1
- **No physiological block selection:** No intelligence connecting data to training decisions

**What Users Complain About:**
- Feature requests pile up (single developer bottleneck)
- No mobile app (web-only)
- Coach features are limited
- Occasional sync issues with certain devices

**Where PeakAerobic is BETTER:**
- Complete lactate analysis (Intervals.icu's biggest gap)
- Physiological modeling beyond power curves
- Periodization engine with Olbrecht block logic
- Professional coaching workflow
- Multi-method threshold detection with confidence scoring
- Dynamic threshold evolution tracking

**Marketing Angle:**
> "Intervals.icu analyzes what you did. PeakAerobic plans what you should do next."

---

### 2.4 WKO5

**What it is:** Advanced desktop analytics platform from TrainingPeaks. Power Duration Curve modeling, individualized training levels (iLevels), and deep data analysis. The "power user" tool.

**Pricing:**
- One-time purchase: $169.00
- WKO4 upgrade: 25% discount

**Key Features:**
- Personalized Power Duration Curve with mFTP and TTE
- Individualized training levels (iLevels)
- Dynamic Functional Reserve Capacity (dFRC)
- Training Impact Score (TIS)
- Smart Segments for ride analysis
- Customizable dashboards and charts
- Multi-athlete comparison

**Target Audience:**
- Advanced coaches and sport scientists
- Data-obsessed athletes
- Power analysis specialists

**What It Does Well:**
- Deepest power analysis available
- iLevels are genuinely individualized (not cookie-cutter zones)
- Power Duration modeling is best-in-class
- One-time cost vs recurring subscription

**What It Lacks (Lactate/Physiology):**
- **No lactate analysis:** Purely power-based modeling
- **No metabolic profiling:** Cannot determine VO2max, VLamax, or fuel utilization
- **No periodization:** Analysis only, no training prescription
- **Desktop-only:** No cloud, no mobile, no real-time collaboration
- **Steep learning curve:** Requires significant expertise to use effectively
- **No coaching workflow:** Not designed for coach-athlete communication
- **No integration with lactate meters or field testing protocols**

**What Users Complain About:**
- Complex interface, steep learning curve
- Desktop-only feels outdated
- Mac compatibility issues reported
- Requires TrainingPeaks ecosystem
- No training prescription (analysis paralysis)

**Where PeakAerobic is BETTER:**
- Native lactate analysis vs power-only
- Cloud-based with modern web UX
- Integrated periodization and prescription
- Coach-athlete workflow
- Physiological thresholds from actual blood lactate
- Connects analysis directly to actionable training decisions

**Marketing Angle:**
> "WKO5 is the microscope. PeakAerobic is the microscope, the diagnosis, and the treatment plan."

---

## 3. Comparison Matrix

| Feature | PeakAerobic | INSCYD | Winlactat | Golden Cheetah | Xert | TrainingPeaks | TrainerRoad | Intervals.icu | WKO5 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **LACTATE & PHYSIOLOGY** | | | | | | | | | |
| Blood lactate data entry & analysis | YES | YES | YES | No | No | No | No | No | No |
| Multi-method threshold detection | YES (3) | No (1) | YES | No | No | No | No | No | No |
| LT1 detection | YES | YES | YES | No | No | No | No | No | No |
| LT2 detection | YES | YES | YES | No | No | No | No | No | No |
| Real vs Practical thresholds | YES | No | No | No | No | No | No | No | No |
| Confidence scoring per threshold | YES | No | No | No | No | No | No | No | No |
| Dynamic threshold tracking (between tests) | YES | No | No | No | No | No | No | No | No |
| VO2max estimation | YES | YES | No | No | No | No | No | No | No |
| VLamax / glycolytic proxy | YES | YES | No | No | No | No | No | No | No |
| Metabolic profile (fat/carb) | No | YES | Partial | No | No | No | No | No | No |
| Outlier detection in lactate data | YES | No | No | No | No | No | No | No | No |
| **TRAINING PLANNING** | | | | | | | | | |
| Periodization engine | YES | No | No | No | Partial | No | Partial | No | No |
| Olbrecht block-type selection | YES | No | No | No | No | No | No | No | No |
| Dose ladder progression | YES | No | No | No | No | No | No | No | No |
| Mesocycle library | YES | No | No | No | No | No | No | No | No |
| Gap analysis (LT1/LT2/VO2) | YES | Partial | No | No | No | No | No | No | No |
| Block candidate scoring | YES | No | No | No | No | No | No | No | No |
| Wave principle (load cycling) | YES | No | No | No | No | No | Partial | No | No |
| Workout generation | YES | No | No | No | YES | Partial | YES | Partial | No |
| BLa check scheduling | YES | No | No | No | No | No | No | No | No |
| **PLATFORM** | | | | | | | | | |
| Web-based | YES | YES | Partial | No | YES | YES | YES | YES | No |
| Coach-athlete workflow | YES | YES | No | No | No | YES | No | No | No |
| Multi-sport (run/bike/swim) | YES | YES | YES | Partial | No | YES | Partial | YES | Partial |
| Device integrations | Garmin | Limited | Limited | Strava/ANT+ | Limited | Best | Good | Good | TP sync |
| Training calendar | YES | No | Partial | No | YES | YES | YES | YES | No |
| **PRICING** | | | | | | | | | |
| Monthly cost (coach) | TBD | EUR 49 | SaaS TBD | Free | $10 | $22-55 | $22 | Free-$4 | $169 once |

---

## 4. TOP 5 Uncontested Gaps

These are areas where PeakAerobic has **zero direct competition** -- no existing product combines these capabilities:

### GAP 1: Lactate-to-Periodization Pipeline
**What it is:** Automatic flow from blood lactate test results to Olbrecht-based mesocycle selection with dose-ladder progression.

**Why nobody else does this:** INSCYD stops at the metabolic profile. TrainerRoad/Xert have AI training but no lactate input. TrainingPeaks/Intervals.icu have calendars but no physiology engine. Winlactat has lactate analysis but no periodization.

**PeakAerobic's position:** The ONLY tool that takes raw lactate data, detects thresholds, identifies physiological gaps, selects the optimal training block type (from 6 Olbrecht categories), and generates a mesocycle with dose-appropriate sessions.

**Market value:** This is the workflow that elite coaches do manually in their heads. PeakAerobic automates it.

---

### GAP 2: Dynamic Threshold Evolution Without Re-testing
**What it is:** Multi-bracket interpolation engine that updates LT1/LT2 estimates between formal tests using accumulated session data, with LOO outlier detection and confidence-weighted blending.

**Why nobody else does this:** INSCYD requires a new full test for each update. Winlactat is test-to-test only. TrainerRoad updates FTP (a single number) but not physiological thresholds. No platform tracks how LT1 and LT2 evolve over a training cycle.

**PeakAerobic's position:** The ONLY platform where thresholds are living, breathing values that update as the athlete trains, with statistical rigor (outlier detection, confidence scoring, bracket span penalties).

---

### GAP 3: Multi-Method Threshold Detection with Transparency
**What it is:** Three independent detection methods (baseline_rise, sustained_increase, ModDmax) aggregated with median pace/power and mean lactate, plus confidence scoring and conservative gates for "real" thresholds.

**Why nobody else does this:** INSCYD uses one proprietary model. Winlactat offers multiple methods but requires manual selection. No platform automatically runs multiple methods, scores confidence, and presents the result with full auditability.

**PeakAerobic's position:** Coaches can see WHY a threshold was placed where it was, which methods agreed, and how confident the system is. This is the antithesis of INSCYD's black box.

---

### GAP 4: Physiological Block Scoring with Olbrecht Science
**What it is:** 6 Olbrecht block types (AEC, THR, AEP, ANC, ANP, COMP) scored against the athlete's current capacity profile (VO2max, VLamax proxy, LT1/LT2 gaps, phase, weeks to race) with 6 scored candidates and transparent rationale.

**Why nobody else does this:** Olbrecht's methodology exists only in his book and in the heads of elite swimming coaches. No software product has operationalized it for multi-sport endurance training. INSCYD was inspired by Olbrecht/Weber but does not prescribe training.

**PeakAerobic's position:** The ONLY platform that operationalizes "The Science of Winning" into an automated decision engine with auditability, covering running, cycling, and swimming.

---

### GAP 5: BLa Check Scheduling in Training Plans
**What it is:** Integrated blood lactate verification points within planned training blocks, allowing coaches to schedule mini-tests during key sessions to validate that the dose is producing the expected physiological response.

**Why nobody else does this:** No training platform treats blood lactate as an ongoing monitoring tool within the training plan. Lactate is universally treated as a "before/after" test, not as a real-time feedback mechanism during a mesocycle.

**PeakAerobic's position:** Closes the feedback loop. The coach knows WHEN to test, the athlete knows which session requires a blood sample, and the system uses that data to refine its model.

---

## 5. Marketing Differentiation Strategy

### Primary Positioning Statement
> **PeakAerobic is the first platform that connects blood lactate testing to automated, science-based training periodization.**

### Differentiation by Competitor

| Against | Key Message | Supporting Feature |
|---|---|---|
| INSCYD | "We don't just profile. We prescribe." | Lactate-to-periodization pipeline |
| Winlactat | "Lab precision meets modern coaching workflow." | Web-first UX + coach-athlete platform |
| Golden Cheetah | "From power curves to physiological truth." | Native lactate analysis |
| Xert | "Real physiology, not algorithmic guesses." | Blood lactate vs power-only models |
| TrainingPeaks | "The physiology layer TrainingPeaks is missing." | Potential integration/complement positioning |
| TrainerRoad | "Know the WHY behind every training block." | Transparent Olbrecht rationale |
| Intervals.icu | "Where free analytics meet professional physiology." | Lactate analysis + periodization |
| WKO5 | "From analysis to action in one platform." | Integrated prescription engine |

### Positioning by Buyer Persona

| Persona | Pain Point | PeakAerobic Message |
|---|---|---|
| **Pro Coach (20+ athletes)** | "I spend hours translating test results into training plans" | "Automate the lactate-to-plan pipeline. Spend time coaching, not calculating." |
| **Sport Scientist in Clinic** | "My software gives me thresholds but I email them to the coach separately" | "Analysis, prescription, and monitoring in one platform." |
| **Self-coached Triathlete** | "I did a lactate test but don't know what to do with the numbers" | "Upload your test. Get your mesocycle. Know exactly what to train and why." |
| **Federation / National Team** | "We need standardized testing protocols across all our coaches" | "Multi-method threshold detection with confidence scoring. Science you can audit." |

### Key Messaging Themes

1. **Transparency over black boxes** -- Every threshold decision is explainable. Every block selection shows its scoring. Coaches can audit the science.

2. **Lactate as a living metric** -- Not a one-time test number, but a continuously evolving signal that informs every training decision.

3. **Olbrecht for everyone** -- The periodization methodology of Olympic-medal-winning coaches, operationalized and accessible.

4. **Field-test friendly** -- No lab required. No specific ergometer required. Any standard step test protocol works.

5. **The missing link** -- Existing platforms do analysis OR planning. PeakAerobic does both, connected by physiology.

---

## Appendix: Market Context

- The lactate monitoring devices market is projected to grow from $164.4M (2025) to $390.9M (2035) at 9.1% CAGR
- Sports applications represent 59.1% of lactate monitoring device demand
- The trend toward field testing over lab testing favors PeakAerobic's flexible protocol approach
- INSCYD's partnership with hardware vendors (NOVA, CARDIOWORLD) signals market validation for integrated software+testing solutions

### Sources
- [INSCYD Pricing](https://inscyd.com/pricing/)
- [INSCYD 2025 in Review](https://inscyd.com/article/2025-inscyd/)
- [INSCYD Lactate Testing](https://inscyd.com/functions/lactate-testing/)
- [Mesics vs INSCYD](https://inscyd.com/article/mesics-vs-inscydthe-best-software-for-lactate-tests/)
- [Winlactat / LC Lactat](https://www.mesics.de/lclactat-en/)
- [Golden Cheetah](https://www.goldencheetah.org/)
- [Golden Cheetah on Hackaday](https://hackaday.com/2025/12/03/ride-on-with-foss-and-goldencheetah/)
- [Xert Pricing](https://www.baronbiosys.com/pricing/)
- [Xert Review - AI Fitness Engineer](https://ai-fitness-engineer.com/xerts-adaptive-training)
- [Xert User Review - Forum](https://forum.xertonline.com/t/my-experience-review/48412)
- [TrainingPeaks Pricing for Athletes](https://www.trainingpeaks.com/pricing/for-athletes/)
- [TrainingPeaks Pricing for Coaches](https://www.trainingpeaks.com/pricing/for-coaches/)
- [TrainingPeaks Price Increase - DC Rainmaker](https://www.dcrainmaker.com/2025/02/trainingpeaks-announces-subscribers.html)
- [TrainerRoad Pricing](https://www.trainerroad.com/pricing)
- [TrainerRoad AI Update](https://www.trainerroad.com/blog/whats-new-with-trainerroad-ai/)
- [TrainerRoad Review 2026 - CyclistsHub](https://www.cyclistshub.com/trainerroad-review/)
- [Intervals.icu](https://www.intervals.icu/)
- [Intervals.icu Pricing](https://www.intervals.icu/pricing/)
- [Intervals.icu Features - Fast Talk Labs](https://www.fasttalklabs.com/training/the-most-powerful-features-of-intervals-icu/)
- [WKO5](https://www.trainingpeaks.com/wko5/)
- [WKO5 New Features](https://www.wko5.com/wko-new-features)
- [INSCYD Slowtwitch Discussion](https://forum.slowtwitch.com/t/physiological-testing-with-inscyd/779555)
- [VLamax Discussion - Slowtwitch](https://forum.slowtwitch.com/t/measuring-vlamax/777730)
- [INSCYD Report Discussion - TrainerRoad Forum](https://www.trainerroad.com/forum/t/my-inscyd-report/12660)
- [Tredict](https://www.tredict.com/)
- [Lactate Monitoring Market Report](https://www.futuremarketinsights.com/reports/lactate-monitoring-devices-market)
- [Rouleur Metabolic Profiling Software Comparison](https://www.rouleur.cc/blogs/rouleur-performance/high-tech-training-and-racing-the-best-software-for-metabolic-profiling)
- [Olbrecht - Scientific Triathlon Podcast](https://scientifictriathlon.com/tts198/)
