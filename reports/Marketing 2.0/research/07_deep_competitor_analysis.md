# Deep Competitive Analysis -- PeakAerobic vs. Market
**Date:** 2026-03-18
**Scope:** 10 competitors across lactate analysis, training planning, and endurance coaching software
**PeakAerobic context:** Free web app. Lactate test analysis (3 methods: ModDmax, baseline rise, sustained increase), VLamax estimation from lactate curve, VO2max estimation (Swain+ACSM), Olbrecht-based periodization (6 block types), training zone calculation, race prediction (di Prampero model), dose ladders for progressive mesocycles, Garmin workout push. Free tier + Coach Pro at EUR 39/mo.

---

## 1. INSCYD

### Overview
INSCYD is the market leader in metabolic profiling software for endurance coaches. Founded by Sebastian Weber (physiologist for Team Jumbo-Visma), INSCYD models the interaction between VO2max, VLamax, and other metabolic parameters to produce a "360-degree" athlete profile. Used by WorldTour cycling teams (Jumbo-Visma, Alpecin-Fenix, Movistar), USA Triathlon's Project Podium, and a growing base of independent coaches.

### Pricing (2025-2026)
- **Software subscription:** Starts at EUR 49/month (unlimited athletes)
- **Higher tiers exist** but pricing is not publicly listed -- coaches must schedule a call with INSCYD's Partnership Manager
- **Certification camps:** INSCYD ran fully-booked 4-Day Coaching & Testing Camps in 2025 (Park City, Leuven, Frankfurt, Girona, Manchester). Cost not publicly disclosed but estimated at EUR 1,500-2,500 based on similar programs
- **Per-test cost to end athletes:** Coaches typically charge GBP 150-275 per INSCYD test, keeping margin on the subscription

### Key Features
- VO2max + VLamax modeling from power-only tests (no blood required)
- Power-Performance Decoder (PPD) for running
- Training Zone Builder (customized zones from metabolic profile)
- Fat/carb combustion rates, FatMax zone
- Performance prediction (time-trial power at target lactate)
- Longitudinal tracking of metabolic changes
- Can integrate lactate test data to improve model accuracy

### What INSCYD Does NOT Do
- **No training prescription or periodization.** INSCYD gives you the numbers (VO2max, VLamax, thresholds, zones) but does NOT tell you what to do with them. The coach must design the mesocycle, select session types, and decide block sequencing independently.
- **No workout builder or Garmin push.** Coaches must use TrainingPeaks or another tool to deliver workouts.
- **No dose progression system.** No concept of dose ladders or progressive overload within a block.
- **No race prediction model** comparable to di Prampero (INSCYD can predict time-trial performance but not multi-discipline race outcomes).

### User Sentiment (Forums, Reviews)
- **Slowtwitch:** Mixed. Coaches appreciate the metabolic depth. Athletes often report confusion about what the numbers mean practically. The "post-analysis gap" is a recurring theme -- coaches get beautiful charts but must translate them to training plans manually.
- **Molab review:** Called INSCYD a "virtual lab" but noted it is a diagnostic tool, not a coaching tool.
- **BikeRadar:** Praised INSCYD for going "well beyond FTP" but acknowledged the steep learning curve.
- **Common complaint:** "I got my INSCYD numbers but my coach didn't change my training" -- the gap between diagnosis and prescription is real.

### Estimated Market Position
- Dominant in the cycling/triathlon coaching niche for metabolic profiling
- Estimated 2,000-5,000 coach subscribers (based on camp attendance patterns and partner listings)
- Strong brand in pro cycling; weaker penetration in amateur/self-coached market
- Annual revenue estimated at EUR 1.5-3M (subscription only, excluding certification revenue)

### Key Weakness PeakAerobic Can Exploit
**The prescription gap.** INSCYD stops at diagnosis. PeakAerobic goes from lactate test to Olbrecht block selection to dose-laddered mesocycle to Garmin-pushed workouts -- the full pipeline. A coach using INSCYD still needs TrainingPeaks + their own knowledge to prescribe. PeakAerobic does it in one tool.

### Key Strength We Should NOT Compete With
INSCYD's power-only testing (no blood required) via the PPD is a massive accessibility advantage. Their brand credibility with WorldTour teams is unassailable in the short term. We should not try to replicate the PPD -- instead, position PeakAerobic as the tool for coaches who DO perform lactate tests and want the full pipeline from test to prescription.

---

## 2. TrainingPeaks

### Overview
TrainingPeaks is the dominant platform for endurance coaching workflow -- calendar, workout delivery, athlete communication, and training plan marketplace. Founded in 1999, headquartered in Louisville, CO. ~115 employees, ~USD 17.2M annual revenue. Used by virtually every professional endurance coach.

### Pricing (2025-2026)
**For Coaches:**
- Coach Edition: USD 21.99/mo (1 free Premium athlete + 4 Basic athletes)
- Coach Edition Unlimited: USD 54.99/mo (1 free Premium athlete + unlimited Basic athletes)
- Per-athlete Premium add-on: Starting at USD 9/athlete/mo (volume discounts available)
- Price increase effective April 2, 2025

**For Athletes:**
- Free tier (basic logging)
- Premium: USD 149/year (monthly) or USD 134.99/year (annual, increased from USD 124.99 in April 2025)

**WKO5 (separate product, same company):**
- USD 179 one-time purchase + annual updates
- Adds power-duration modeling, individualized training levels (iLevels), critical power analysis

### Lactate-Related Features
- **Minimal.** TrainingPeaks has no built-in lactate test analysis
- WKO5 references lactate threshold conceptually for zone boundaries but does not analyze lactate curves
- Coaches can manually set LTHR/LTP zones but there is no automated detection
- No VLamax estimation, no lactate curve modeling

### User Complaints (2025)
- "Way too expensive" -- recurring Trustpilot theme
- "Has not really added any features or functionality to its core product in years"
- "Horrible service department" -- reports of unexpected downgrades and billing issues
- Mobile app analytics described as inferior to desktop
- Athletes leaving for Intervals.icu (free) when not working with a coach
- Interface feels dated compared to newer competitors
- Cannot combine multiple training plans simultaneously

### Market Position
- De facto standard for coach-athlete workflow (calendar + workout delivery)
- Network effects: most coaches are on TrainingPeaks, so athletes must be too
- Training plan marketplace generates significant revenue
- Losing self-coached athletes to Intervals.icu and other free alternatives

### Key Weakness PeakAerobic Can Exploit
**TrainingPeaks is a delivery mechanism, not an intelligence layer.** It does not analyze lactate, estimate VO2max, select training blocks, or build progressive mesocycles. PeakAerobic provides the physiological intelligence that TrainingPeaks lacks. The ideal positioning is PeakAerobic as the brain, with optional TrainingPeaks/Garmin as the delivery channel.

### Key Strength We Should NOT Compete With
TrainingPeaks' coach-athlete workflow, calendar UX, and marketplace are deeply entrenched. We should not try to replace TrainingPeaks as a daily coaching platform. Instead, integrate with it or position PeakAerobic as a complementary tool.

---

## 3. Intervals.icu

### Overview
Free, community-supported training analytics platform built by a single developer (David Tinker). Positioned as the "free TrainingPeaks alternative" for self-coached athletes. Over 160,000 athletes on the platform.

### Pricing (2025-2026)
- **Free tier:** Full analytics, zone management, calendar, workout builder
- **Supporter tier:** USD 4/month (optional, adds some features + supports development)
- **Strava sync:** Became a paid feature in 2023 due to API rate limits
- Revenue model: community-supported, not venture-backed

### Lactate Features
- Can import lactate data from Q-LAC continuous lactate monitors
- Lactate chart on activity timeline
- Min/max/average lactate interval fields
- **No lactate curve analysis, no threshold detection, no VLamax estimation**
- Forum feature request for "Lactate threshold detection" exists but is not implemented
- Forum request for "INSCYD-like modelling" exists but is not implemented

### API
- Full public REST API with OAuth 2.0 and API key authentication
- 200+ third-party integrations
- Can upload/download activities, manage wellness data, create workouts, receive webhooks

### User Sentiment
- Overwhelmingly positive for the price (free)
- Users migrating from TrainingPeaks cite better data visualization and no cost
- Main wishes: better mobile app, more advanced modeling, lactate analysis (!)
- One user: "I did a 3-month experiment replacing TrainingPeaks with Intervals.icu and I'm quite happy"

### Key Weakness PeakAerobic Can Exploit
**No lactate analysis at all.** Intervals.icu users who do lactate tests have nowhere to analyze them within the platform. This is a clear gap PeakAerobic fills. Additionally, Intervals.icu has no periodization engine, no block selection, no dose progression.

### Key Strength We Should NOT Compete With
The breadth of free analytics (power modeling, fitness/fatigue charts, zone analysis) is impossible to compete with at our price point. We should not try to replicate Intervals.icu's general analytics -- instead, focus on the lactate-specific and periodization-specific value that Intervals.icu explicitly lacks.

---

## 4. Athletica.ai

### Overview
AI-powered adaptive training platform for runners, cyclists, triathletes, and hybrid athletes. Founded by sports scientists, Athletica uses machine learning to generate and adapt daily training plans based on HRV, sleep, and workout data.

### Pricing (2025-2026)
- USD 19.90/month
- USD 99/6 months
- USD 189/year
- 2-week free trial

### Key Features
- AI-generated daily adaptive training plans
- Drag-and-drop weekly planning
- HRV, sleep, resting HR integration into programming
- Post-workout AI coach feedback
- Multi-sport support (triathlon, duathlon, running, cycling, rowing, HYROX)
- Period tracker for female athletes

### Limitations
- Races can only be scheduled on weekends (hard constraint)
- Occasional sync glitches with less popular wearables
- App freezing during workout tracking reported
- No lactate analysis
- No physiological testing integration
- "Black box" AI -- athletes and coaches cannot see the reasoning behind decisions
- Frequent updates without notice, sometimes breaking features

### User Sentiment
- Generally positive for the price
- Users report fewer injuries and smarter pacing
- Responsive customer support
- Some users find it overwhelming at first
- TrainerRoad forum: mixed, some praise science-based approach, others find HIIT emphasis excessive

### Key Weakness PeakAerobic Can Exploit
**Black box vs. transparent physiology.** Athletica's AI makes decisions but does not explain them in physiological terms. PeakAerobic shows the Olbrecht block rationale, capacity profiles, and gap analysis -- the coach understands WHY. Additionally, Athletica has zero lactate integration.

### Key Strength We Should NOT Compete With
Athletica's daily adaptive adjustment based on HRV/sleep/recovery is sophisticated and well-executed. We should not try to replicate real-time daily adaptation. Our strength is in the macro-level physiological planning, not micro-level daily adjustment.

---

## 5. AI Endurance

### Overview
AI-powered training plan generator for runners, cyclists, and triathletes. Uses machine learning on workout data from Garmin, Strava, Polar, Suunto, Coros, Wahoo, Oura, Whoop, and Stryd to generate personalized plans.

### Pricing (2025-2026)
- USD 9.99/month
- USD 99.99/year
- 2-week free trial

### Key Features
- AI-generated training plans adapted in real-time based on recovery and performance
- Recovery insights
- Nutrition tool
- AI-powered assistant (ChatGPT integration)
- Multi-device sync

### Limitations
- No lactate test analysis
- No VLamax or VO2max from physiological testing
- No periodization framework (Olbrecht or otherwise)
- No workout push to devices
- Relatively basic compared to INSCYD or PeakAerobic for physiological depth

### Key Weakness PeakAerobic Can Exploit
**Surface-level physiology.** AI Endurance adapts plans based on training data patterns but does not model underlying physiology (lactate dynamics, VLamax, aerobic/anaerobic capacity balance). PeakAerobic's approach is fundamentally different -- rooted in measured lactate data and established physiological models.

---

## 6. JOIN Cycling

### Overview
Cycling-focused AI coaching app designed by professional cycling coaches. Positioned as a "professional cycling coach in your pocket."

### Pricing (2025-2026)
- EUR 16.99/month
- EUR 119.99/year
- 7-day free trial

### Key Features
- 400+ structured workouts (endurance, strength, threshold, VO2max)
- Adaptive scheduling (auto-adjusts when you miss workouts or go outdoors)
- Running workouts (recently added)
- Period tracker for female athletes
- Indoor trainer integration

### Limitations
- Cycling-only focus (running recently added but secondary)
- No lactate analysis
- No physiological testing integration
- No triathlon/swimming support
- No periodization based on metabolic profiling
- No VLamax/VO2max estimation

### Key Weakness PeakAerobic Can Exploit
**Generic workout library vs. physiologically-driven prescription.** JOIN's 400+ workouts are pre-built templates. PeakAerobic selects the specific block type and dose step based on the athlete's actual lactate curve and capacity profile. The same athlete at different points in their season gets fundamentally different prescriptions.

---

## 7. Winlactat / LC Lactat (Mesics GmbH)

### Overview
The legacy standard for laboratory lactate test analysis. Originally a desktop Windows application ("Winlactat"), now transitioning to a SaaS product ("LC Lactat" = LabConnector Lactat). Used primarily by sports science labs, Olympic training centers, and sports federations.

### Pricing (2025-2026)
- **EUR 98/month** (billed annually)
- Olympic training centers and research institutions receive discounts
- Transitioned from one-time license to SaaS subscription in 2023
- Includes all updates, commercial license, developer-level support, and seminars

### Key Features
- Multiparametric analysis (VO2max, METS, Fatmax, etc.)
- Variable lactate and ventilatory thresholds (multiple detection methods)
- Scientific test comparison (longitudinal analysis)
- Training zone creation
- Clinical evidence auto-generation (templates)
- Spiroergometry integration
- Training calendar creation

### Limitations
- **EUR 98/month is 2.5x PeakAerobic's Coach Pro price** for what is essentially just the analysis component
- Legacy UI -- designed for lab technicians, not modern coaches
- No Olbrecht-based periodization
- No dose ladders or progressive mesocycle design
- No Garmin/device push
- No race prediction
- No VLamax estimation from lactate curve
- Transitioning from desktop to SaaS has been rocky (user reports of migration issues)
- German-centric -- documentation and support primarily in German

### Key Weakness PeakAerobic Can Exploit
**Price and scope.** LC Lactat costs EUR 98/mo for lab-grade analysis without prescription. PeakAerobic costs EUR 39/mo for analysis + periodization + workout delivery. For field-testing coaches (not lab technicians), PeakAerobic is the better value proposition by a wide margin.

### Key Strength We Should NOT Compete With
LC Lactat's spiroergometry integration and clinical-grade reporting (for medical/research use) is not our target market. We should not try to serve sports medicine labs -- our market is field-testing coaches.

---

## 8. SELFLOOPS

### Overview
Sports performance analytics platform focused on heart rate monitoring, power analysis, and general fitness tracking. NOT a dedicated lactate analysis tool.

### Pricing
- Subscription-based, pricing depends on number of users and features
- Not publicly listed -- requires contacting sales
- Free trial available

### Lactate Features
- **Essentially none.** Can display SmO2 and THb from muscle oxygen sensors
- No lactate curve analysis
- No threshold detection from blood lactate data
- No VLamax estimation

### Relevance to PeakAerobic
**Minimal direct competition.** SELFLOOPS is a general performance tracking platform, not a lactate analysis tool. It appears in searches for "lactate analysis software" due to SmO2 monitoring, but it does not compete in our core space.

---

## 9. Golden Cheetah

### Overview
Open-source, community-developed performance analysis software for cyclists, runners, and triathletes. Free. Desktop application (Windows, Mac, Linux). Active since 2006, currently on version 3.7 with v3.8 in development.

### Pricing
- **Free** (open source, GPLv2)

### Lactate Features
- Can set lactate threshold HR/power manually (user input)
- LNP (Lactate Normalized Power) for running
- **No lactate curve analysis from blood lactate test data**
- **No automated threshold detection**
- Forum discussions about INSCYD-like VLamax modeling exist but are not implemented
- Power-duration modeling (CP, W') but not lactate-derived

### Current Status (2025)
- v3.7 SP1 released, v3.8 in development
- Migration to Qt 6 underway
- Active Google Groups community
- Development pace is slow (volunteer-driven)

### Key Weakness PeakAerobic Can Exploit
**No lactate analysis, no periodization.** Golden Cheetah is a post-ride analysis tool. It cannot process lactate tests, build training blocks, or push workouts. The entire PeakAerobic value proposition is additive to what Golden Cheetah offers.

---

## 10. Xert

### Overview
Cycling-focused fitness analytics platform built around the concept of "breakthroughs" -- detecting when an athlete exceeds their predicted Maximum Power Available (MPA) during any ride. Includes adaptive training advisor.

### Pricing (2025-2026)
- **Free plan** (basic features)
- **Premium Yearly:** USD 8.33/month (USD 99.95/year)
- **Premium Monthly:** USD 14.99/month

### Key Features
- Automatic fitness signature detection from every ride (no dedicated test required)
- MPA (Maximum Power Available) modeling
- "Breakthrough" detection when athlete exceeds predicted MPA
- Xert Strain Score, Focus, Equivalent Power metrics
- Adaptive Training Advisor (adjusts based on fitness, goals, fatigue)
- Zwift and Strava sync
- Workout player with real-time targets

### Limitations
- **Cycling-only** (no running, swimming, triathlon)
- No lactate analysis
- No VLamax estimation
- Steep learning curve -- proprietary metrics (XSS, Focus, etc.) are confusing
- Workout advisor tends to push sweet spot training despite marketing polarized approaches
- "Suggested workouts are okay at best" -- forum feedback
- No periodization framework

### User Sentiment
- Mixed. Power users love the breakthrough concept
- Casual users find it overwhelming and confusing
- Sweet spot bias in recommendations is a recurring complaint
- Data visualization inferior to Intervals.icu

### Key Weakness PeakAerobic Can Exploit
**No lactate, no periodization, cycling-only.** Xert's approach is fundamentally different (continuous power-based modeling vs. discrete lactate testing). PeakAerobic serves multi-sport coaches who use lactate data -- a market Xert cannot reach.

---

## Additional Competitors Discovered During Research

### Powertest / Aerotune
- Performs VO2max and VLamax estimation from power-only tests (similar to INSCYD PPD)
- 95% accuracy claim vs. lab testing
- Based on Prof. Mader's research
- Smart Coaching feature with personalized training plans
- Potential future competitor if they add periodization

### dPAC
- Endurance sports performance analysis
- VLamax, FATmax, VO2max, lactate threshold metrics
- Less known, smaller market presence

### Sentiero
- Metabolic profiling close to INSCYD
- Strong nutrition features (energy expenditure prediction)
- Can integrate with lactate tests

### Ergonizer
- Lactate and performance analysis for lab/field testing
- Treadmill, bike ergometer, swimming, canoe support
- Training recommendations from exercise testing
- German market focus

---

## Competitive Opportunity Matrix

### Where PeakAerobic Has NO Competition (Unique Features)

| Feature | Nearest Competitor | Gap |
|---|---|---|
| Olbrecht-based block selection (6 block types) from lactate data | None | No competitor automates Olbrecht periodization from lactate tests |
| Dose ladders for progressive mesocycles | None | No competitor has structured dose progression within blocks |
| Full pipeline: lactate test --> thresholds --> block selection --> mesocycle --> Garmin push | None | INSCYD stops at diagnosis; TrainingPeaks stops at delivery; nobody connects them |
| 3 lactate threshold detection methods with aggregation (ModDmax + baseline rise + sustained increase) | Winlactat/LC Lactat (multiple methods) | LC Lactat has methods but costs EUR 98/mo and lacks prescription |
| VLamax estimation from lactate curve shape (ratio-based) | INSCYD (from power tests) | Different input data; PeakAerobic uses actual blood lactate, INSCYD uses power |
| Race prediction via di Prampero model | None in lactate software | INSCYD can predict TT performance but not multi-event race outcomes |
| Capacity profiles with automatic block contraindication logic | None | No tool says "don't do this block because your aerobic capacity profile contradicts it" |
| Block rationale with scientific citations (Olbrecht, Faude, Billat) | None | No competitor explains the physiological WHY behind each block choice |

### Where PeakAerobic Is Better (Same Feature, Better Execution)

| Feature | Competitor | Why PeakAerobic Is Better |
|---|---|---|
| Lactate analysis + prescription in one tool | INSCYD + TrainingPeaks (2 tools) | One platform, one price, end-to-end |
| Price for coaches (EUR 39/mo) | INSCYD (EUR 49/mo), LC Lactat (EUR 98/mo) | 20-60% cheaper with MORE features (prescription, Garmin push) |
| Transparent physiology (shows rationale) | Athletica.ai, AI Endurance (black box AI) | Coach sees and understands every decision |
| Multi-sport lactate analysis | Xert (cycling only), JOIN (cycling only) | Running, cycling, swimming, triathlon from day one |
| Free tier for athletes | TrainingPeaks (USD 134.99/yr for Premium) | Athletes can view their analysis for free |

### Where Competitors Are Better (Honest Assessment)

| Feature | Competitor | Why They Are Better |
|---|---|---|
| Power-only testing (no blood required) | INSCYD PPD, Powertest/Aerotune | Massive accessibility advantage -- coaches can test remotely without lactate meters |
| Daily adaptive adjustment (HRV/sleep) | Athletica.ai, TrainerRoad | PeakAerobic plans at the mesocycle level, not the daily level |
| Coach-athlete workflow (calendar, messaging) | TrainingPeaks | Deeply entrenched, 25+ years of development |
| General ride/run analytics | Intervals.icu, Golden Cheetah | Power curves, fitness/fatigue charts, segment analysis -- we don't do this |
| Brand credibility with pro teams | INSCYD (Jumbo-Visma, Movistar) | We have no pro team endorsements yet |
| Training plan marketplace | TrainingPeaks | Revenue stream we don't have |
| Real-time workout guidance | Xert (MPA in real-time) | We push workouts but don't provide real-time feedback |
| User base / network effects | TrainingPeaks (millions), Intervals.icu (160K+) | We are early-stage |
| Spiroergometry / clinical reporting | LC Lactat (Mesics) | Lab-grade reporting for medical contexts -- not our target |

### Strategic Recommendations

**1. Own the "Lactate Test to Training Plan" pipeline.**
No competitor connects lactate analysis to periodized training prescription. This is PeakAerobic's moat. Every marketing message should emphasize: "Other tools give you numbers. PeakAerobic gives you the plan."

**2. Position against INSCYD's prescription gap.**
INSCYD coaches are our ideal early adopters. They already believe in metabolic profiling but are frustrated by the manual work of translating numbers into training plans. Message: "You already know your athlete's VLamax. Now let PeakAerobic tell you what to do about it."

**3. Do NOT try to replace TrainingPeaks or Intervals.icu.**
These are workflow/analytics platforms with massive network effects. Instead, integrate with them. PeakAerobic should be the intelligence layer that feeds into the coach's existing delivery system.

**4. Exploit the price advantage.**
At EUR 39/mo, PeakAerobic is cheaper than INSCYD (EUR 49/mo) AND delivers more (prescription + Garmin push). It is 2.5x cheaper than LC Lactat (EUR 98/mo). Lead with price + scope in marketing.

**5. Differentiate from AI black boxes.**
Athletica.ai and AI Endurance make decisions without explaining them. Coaches (especially science-literate coaches who do lactate tests) want to understand the reasoning. PeakAerobic's block rationale, capacity profiles, and Olbrecht citations are a trust-building advantage.

**6. Build the "Olbrecht method, digitized" brand.**
Jan Olbrecht's methodology is respected but poorly served by software. His book is the reference, but no tool implements it computationally. PeakAerobic is the only software that does. This is a powerful positioning statement for the swimming and triathlon coaching markets where Olbrecht is most influential.

**7. Consider future integration with continuous lactate monitors.**
Intervals.icu already imports Q-LAC data. The continuous lactate monitoring market is emerging (IDRO, Supersapiens successor). PeakAerobic should be ready to analyze continuous lactate data, not just step-test data.

**8. Target market segmentation:**

| Segment | Current Tool(s) | PeakAerobic Value Proposition |
|---|---|---|
| Coaches who do lactate tests + want prescription | INSCYD + manual planning | Full automation of the test-to-plan pipeline |
| Self-coached athletes with lactate meters | Spreadsheets, nothing | Free tier with real threshold detection |
| Coaches frustrated with TrainingPeaks pricing | TrainingPeaks + manual zones | Cheaper + smarter (but position as complementary) |
| Swimming coaches using Olbrecht methods | Books + spreadsheets | The only digital implementation of Olbrecht |
| Lab technicians doing field tests | LC Lactat (EUR 98/mo) | 60% cheaper, modern UI, adds prescription |

---

## Pricing Comparison Summary

| Platform | Monthly Price | Lactate Analysis | Training Prescription | Workout Push |
|---|---|---|---|---|
| **PeakAerobic Coach Pro** | **EUR 39** | **3 methods + aggregation** | **Olbrecht 6-block + dose ladders** | **Garmin** |
| INSCYD | EUR 49+ | Via power tests (not blood) | Zones only (no periodization) | No |
| TrainingPeaks Coach | USD 22-55 + per-athlete | No | No (delivery only) | Yes (all devices) |
| LC Lactat (Mesics) | EUR 98 | Lab-grade, multiple methods | Basic training calendar | No |
| Intervals.icu | Free (USD 4 supporter) | Import only (no analysis) | No | No |
| Athletica.ai | USD 19.90 | No | AI-generated (black box) | Yes |
| AI Endurance | USD 9.99 | No | AI-generated (black box) | No |
| JOIN Cycling | EUR 16.99 | No | Pre-built templates | Yes |
| Xert | USD 8.33-14.99 | No | Adaptive advisor (cycling only) | Zwift |
| Golden Cheetah | Free | No | No | No |

---

## Bottom Line

PeakAerobic occupies a unique position in the market: **the only tool that connects lactate test analysis to physiologically-driven training prescription in a single platform.** The competitive landscape is fragmented between diagnostic tools (INSCYD, LC Lactat) that stop at numbers, delivery platforms (TrainingPeaks) that don't understand physiology, and AI black boxes (Athletica, AI Endurance) that cannot explain their reasoning.

The biggest risk is not a direct competitor -- it is the trend toward power-only testing (INSCYD PPD, Aerotune Powertest) that could reduce the market of coaches who perform blood lactate tests. The mitigation is to expand PeakAerobic's input methods (accept power-only data alongside lactate) while maintaining the lactate-first positioning as the gold standard.

The biggest opportunity is the INSCYD coach base: thousands of coaches already committed to metabolic profiling who are underserved on the prescription side. Converting even 5-10% of INSCYD's coach base would be transformative for PeakAerobic's growth.
