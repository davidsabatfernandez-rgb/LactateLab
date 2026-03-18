# PeakAerobic -- Pricing Strategy

**Document:** 02 -- Pricing Strategy
**Date:** 2026-03-18
**Status:** Pre-launch draft
**Author:** Strategy team

---

## Table of Contents

1. [Competitive Pricing Landscape](#1-competitive-pricing-landscape)
2. [Recommended Tier Structure](#2-recommended-tier-structure)
3. [Trial Strategy](#3-trial-strategy)
4. [Annual vs Monthly](#4-annual-vs-monthly)
5. [Pricing Psychology](#5-pricing-psychology)
6. [Monetization Timeline](#6-monetization-timeline)
7. [Revenue Projections](#7-revenue-projections)
8. [Risks and Mitigations](#8-risks-and-mitigations)
9. [Pricing Page Copy (EN + ES)](#9-pricing-page-copy)

---

## 1. COMPETITIVE PRICING LANDSCAPE

### Direct Competitors (Lactate / Metabolic Analysis)

| Platform | Model | Base Price | Per-Athlete Fee | Notes |
|----------|-------|-----------|-----------------|-------|
| **INSCYD** | Subscription | **EUR 49/mo** (coach account) | Included (unlimited athletes) | Gold standard in metabolic profiling. Requires certified training. Individual athlete tests sold by coaches at $200-450 each. Closed ecosystem. |
| **WKO5** | One-time license | **$179** (perpetual) | None | Desktop-only. Power-focused. No lactate analysis. No periodization. 14-day trial. |

### Adjacent Competitors (Training Platforms)

| Platform | Model | Coach Price | Per-Athlete Fee | Notes |
|----------|-------|-----------|-----------------|-------|
| **TrainingPeaks** (Coach Edition) | Subscription | **$21.99/mo** (Basic) / **$54.99/mo** (Unlimited) | **$9/athlete/mo** (Premium), volume discounts down to $4.50 at 1000+ athletes | Market leader for training plans. Per-athlete fee is a pain point for coaches. Coach Paid Premium tiers: <10 athletes = $9, 10-19 = $8.55, 20-49 = $8.10, 50-99 = $7.65, 100-199 = $7.20, 200-499 = $6.30, 500+ = $5.40-$4.50. |
| **Intervals.icu** | Freemium / donation | **Free** core / **$4/mo** supporter | None | Extremely popular among power users. Open, community-driven. Billed quarterly ($12/quarter). No lactate analysis. No periodization engine. |
| **Athletica.ai** | Subscription | **$19.90/mo** / $99 for 6mo / **$189/year** | None | AI-driven training plans. Athlete-facing (not coach tool). 14-day free trial. Based on HIIT Science research. |

### Competitive Position Summary

```
Price axis (monthly, coach account)
$0 ---|--- Intervals.icu (free/$4)
     |
$20 ---|--- Athletica.ai ($19.90) -- athlete-facing, not a coach tool
     ---|--- TrainingPeaks Basic ($21.99) -- but +$9/athlete
     |
$39 ---|--- >> PeakAerobic Coach Pro << -- NO per-athlete fee
     |
$49 ---|--- INSCYD (EUR 49) -- requires certification
$55 ---|--- TrainingPeaks Unlimited ($54.99) -- still +$9/athlete
     |
$99 ---|--- >> PeakAerobic Team <<
```

**Key insight:** PeakAerobic at EUR 39/mo sits below INSCYD (EUR 49) and below TrainingPeaks Unlimited ($55 + per-athlete fees), while offering metabolic analysis that neither TrainingPeaks nor Athletica provide. The zero per-athlete fee is a major differentiator against TrainingPeaks, where a coach with 20 athletes pays $54.99 + 20 x $8.10 = $217/mo.

---

## 2. RECOMMENDED TIER STRUCTURE

### Free Tier -- "Try the Aha Moment"

**Goal:** Let coaches experience the core value proposition in under 5 minutes. Paste lactate data, see thresholds with confidence scores, feel the magic -- then hit a wall that makes upgrading obvious.

| Feature | Free Tier |
|---------|-----------|
| Athletes | 1 |
| Lactate tests stored | Last 3 tests only |
| Threshold detection (LT1/LT2) | Full analysis with confidence score |
| Training zones | Basic 5-zone model only |
| Threshold trend over time | Hidden (blurred preview) |
| Dynamic threshold engine | Not available |
| Periodization engine (Olbrecht) | Not available |
| Mesocycle builder | Not available |
| Garmin workout push | Not available |
| PDF reports | Not available |
| CSV/data export | Not available |
| BLa check reminders | Not available |

**Why these limits work:**

- **1 athlete** -- enough to test with yourself or one client. Not enough to run a coaching business.
- **Last 3 tests** -- enough to see the analysis quality. Not enough to see longitudinal trends (the second "aha moment").
- **Full threshold analysis** -- this IS the product. Gating it would prevent the aha moment. Let them see the confidence score, the multi-method agreement, the real vs practical thresholds.
- **No periodization** -- the upgrade trigger. Once they trust the analysis, they want the prescription. "Your athlete's LT2 gap suggests a Threshold Development block. Unlock periodization to see the full plan."
- **Blurred preview** -- show THAT the trend exists but not the values. Creates curiosity and FOMO.

**Upgrade pressure points (in-app nudges):**

1. After first analysis: "See how your athlete's thresholds evolve over time -- upgrade to Pro"
2. After adding 2nd athlete attempt: "Free accounts support 1 athlete. Upgrade to Pro for unlimited athletes."
3. After viewing blurred trend: "Your athlete has improved 3.2% in LT2 pace. Unlock the full trend."
4. On periodization tab: "Based on this data, we recommend an Aerobic Capacity block. Start your free Pro trial to see the full plan."

---

### Coach Pro -- EUR 39/month (EUR 349/year)

**The core revenue tier.** Everything a coach needs, no per-athlete gotchas.

| Feature | Coach Pro |
|---------|-----------|
| Athletes | **Unlimited** |
| Lactate tests | **Unlimited** (full history) |
| Threshold detection | Full multi-method with confidence scores |
| Real thresholds (curve-shape) | Included |
| Dynamic threshold engine | Included |
| Training zones | Olbrecht-calibrated zones |
| Threshold trend over time | Full interactive charts |
| Periodization engine | Full Olbrecht 6-block engine |
| Mesocycle builder | Full library + custom |
| Workout builder | Full with dose ladders |
| Garmin workout push | Included |
| BLa check reminders | Included |
| PDF reports | Standard template (PeakAerobic branding) |
| CSV export | Included |
| API access | Not included |
| White-label reports | Not included |

**Why EUR 39/month:**

- **Below INSCYD (EUR 49/mo):** Removes the price objection. Coaches already paying for INSCYD see an immediate saving. Coaches who considered INSCYD but found it too expensive now have an accessible alternative.
- **Below TrainingPeaks effective cost:** A coach with 15 athletes on TrainingPeaks Unlimited pays $54.99 + 15 x $8.55 = $183/mo. PeakAerobic Pro is EUR 39/mo for unlimited athletes. This comparison sells itself.
- **Above "hobby tool" perception:** EUR 39/mo signals professional-grade software. Below EUR 20 risks being perceived as a toy. The EUR 30-50 range is the sweet spot for independent coach tools.
- **No per-athlete fee (THE differentiator):** Coaches hate per-athlete fees because they create a marginal cost for growing their business. PeakAerobic grows WITH the coach, not against them.

---

### Team / Lab -- EUR 99/month (EUR 899/year)

**For performance labs, coaching companies, and multi-coach operations.**

| Feature | Team / Lab |
|---------|-----------|
| Everything in Coach Pro | Included |
| White-label PDF reports | Coach's logo, branding, colors |
| Custom CSV import templates | Map any lab equipment output |
| Multi-coach accounts | Up to 5 coaches under 1 billing |
| API access | RESTful API for integrations |
| Priority support | 24h response SLA |
| Custom training zones | Define non-standard zone models |
| Data retention | Extended (unlimited history) |
| Bulk athlete import | CSV batch upload |

**Target customers:**

- Performance testing labs (e.g., university sports science departments)
- Coaching companies with 2-5 coaches
- Triathlon/cycling clubs with a head coach + assistants
- National federation regional centers

**Why EUR 99/month:**

- 2.5x the Pro price, justified by white-labeling and multi-seat access.
- Still far below the cost of building custom analysis software.
- Labs charging EUR 100-300 per test can justify EUR 99/mo with 1-2 additional tests per month.

---

### Enterprise -- Custom Pricing

**For national federations, Olympic programs, university research labs, and sports technology companies.**

| Feature | Enterprise |
|---------|-----------|
| Everything in Team | Included |
| Unlimited coach seats | Custom |
| Volume licensing | Negotiated per organization |
| Custom integrations | Dedicated engineering support |
| On-premise deployment option | For data sovereignty requirements |
| SLA guarantee | 99.9% uptime, 4h response |
| Custom physiological models | Adapt engine to specific protocols |
| Research data export | IRB-compatible anonymized exports |
| Training + onboarding | Dedicated sessions |

**Pricing approach:**

- Minimum EUR 500/mo (signals seriousness, filters out non-enterprise leads)
- Typical range: EUR 500-2,000/mo depending on seat count and customization
- Annual contracts only (minimum 12 months)
- Quoted after discovery call -- never published on website

---

## 3. TRIAL STRATEGY

### Recommended: Hybrid Model (Free Tier + 21-day Pro Trial)

**Structure:**

1. User signs up -> lands on **Free tier** (no credit card, no time limit)
2. User pastes first lactate data -> sees full analysis (aha moment #1)
3. Prompt: "Unlock periodization, unlimited athletes, and Garmin push -- start your 21-day Pro trial"
4. User activates trial -> **21 days of full Coach Pro** (still no credit card)
5. Trial ends -> user is **downgraded to Free** (not locked out)
6. All data is preserved. Periodization views are blurred. Upgrade CTA is persistent but not aggressive.

**Why this hybrid beats pure freemium or pure trial:**

| Model | Typical Conversion Rate | Pros | Cons |
|-------|------------------------|------|------|
| **Freemium only** | 2-5% (median ~3%) | Low friction, large user base | Very low conversion, hard to monetize |
| **Free trial (opt-in, no CC)** | 18-25% | Higher conversion, clear deadline | Users who don't convert are lost |
| **Free trial (opt-out, CC required)** | 40-60% | Highest conversion | High friction at signup, angry churners |
| **Hybrid (Free + Trial)** | 8-15% of total signups | Best of both: low friction + upgrade path | Slightly more complex to implement |

**Benchmark data (2025-2026 SaaS industry):**

- Opt-in free trials (no CC): 18-25% conversion rate
- Freemium self-serve: 2.6-5% conversion rate
- Trials under 7 days: 40% conversion (but high churn)
- Trials 14-21 days: 25-30% conversion (better retention)
- Healthcare/sports tech SaaS: ~21% trial conversion

**Why 21 days (not 14 or 30):**

- 14 days is too short for coaches to run a full test-analyze-prescribe cycle with a real athlete
- 30 days reduces urgency (conversion drops with longer trials)
- 21 days = enough time to test with 2-3 athletes and see at least one longitudinal comparison
- 21 days creates natural urgency: "Your trial ends in 3 days" lands on a weekday, not a weekend

**Trial activation triggers (contextual, not time-based):**

| Trigger | Message |
|---------|---------|
| First analysis complete | "Your athlete's LT2 is at 4:12/km with 87% confidence. Want to see the recommended training block? Start your free Pro trial." |
| Attempt to add 2nd athlete | "Unlimited athletes included in Pro. Try it free for 21 days." |
| Click on periodization tab | "This athlete's profile suggests an Aerobic Capacity block. Unlock the full periodization engine." |
| Click on Garmin push | "Push this workout directly to Garmin. Available in Pro." |

**Post-trial retention:**

- Downgrade to Free (never lock out -- reduces anxiety and keeps the door open)
- All historical data preserved (loss aversion: "Your 47 tests are safe. Upgrade anytime to access them all.")
- Monthly "what you're missing" email: "3 of your athletes had new tests this month. Upgrade to see their trends."
- Win-back offer at day 30 post-trial: 20% off first 3 months

---

## 4. ANNUAL vs MONTHLY

### Pricing Table

| Plan | Monthly | Annual | Annual Savings | Effective Monthly |
|------|---------|--------|---------------|-------------------|
| Coach Pro | EUR 39/mo | EUR 349/year | **25% off** (EUR 119 saved) | EUR 29.08/mo |
| Team/Lab | EUR 99/mo | EUR 899/year | **24% off** (EUR 289 saved) | EUR 74.92/mo |

### Why 25% Annual Discount

**Industry benchmarks:**

- Most SaaS companies offer 15-25% annual discounts
- 20% is the most common (2 months free on a 12-month plan)
- 25% (3 months free) is on the aggressive side but justified for a new product seeking early commitment

**Why we go to 25% (not 20%):**

1. **Cash flow priority over margin in year 1.** EUR 349 upfront is better than EUR 39 x 4 months before churn (average SaaS churn for SMB is 3-5% monthly).
2. **Lock-in during the critical adoption window.** Annual subscribers have 12 months to build habits. Monthly subscribers churn at the first slow month.
3. **Competitive positioning.** At EUR 29.08/mo effective, we are firmly below every metabolic analysis competitor.
4. **Retention data supports it.** SaaS companies offering annual plans with visible discounts report 30% better retention rates.

### Quarterly Option?

**Recommendation: Do NOT offer quarterly billing at launch.**

- Adds complexity to the pricing page (paradox of choice)
- Cannibalizes annual plans without meaningfully reducing churn vs monthly
- Consider adding at month 6+ only if data shows a segment that wants commitment but balks at annual

### Display Strategy

- Default toggle: **Annual** (pre-selected on pricing page)
- Show monthly price crossed out next to annual effective price
- "Save 25%" badge on annual toggle
- Display: "EUR 29/mo billed annually" (not "EUR 349/year" -- monthly framing feels smaller)

---

## 5. PRICING PSYCHOLOGY

### 5.1 Anchoring

**On the pricing page, show tiers in this order: Team (EUR 99) -> Pro (EUR 39) -> Free**

- The first number a visitor sees is EUR 99. This anchors their perception of the product's value.
- When they then see EUR 39, it feels like a bargain -- "I get professional metabolic analysis for less than half the Team price."
- The Free tier at the end serves as a safety net ("I can always start free"), reducing decision anxiety.

**Alternative anchoring: INSCYD comparison banner**

At the top of the pricing page:
> "Professional metabolic profiling. Previously only available through INSCYD at EUR 49/mo + certification costs. Now accessible to every coach."

This anchors the perceived value at EUR 49+ before they even see the EUR 39 price.

### 5.2 Per-Athlete Comparison (The Killer Argument)

**Dedicated section on pricing page:**

> **No per-athlete fees. Ever.**
>
> | Scenario | TrainingPeaks | PeakAerobic |
> |----------|--------------|-------------|
> | 10 athletes | $55 + 10 x $9 = **$145/mo** | **EUR 39/mo** |
> | 25 athletes | $55 + 25 x $8.10 = **$257/mo** | **EUR 39/mo** |
> | 50 athletes | $55 + 50 x $7.65 = **$437/mo** | **EUR 39/mo** |
> | 100 athletes | $55 + 100 x $7.20 = **$775/mo** | **EUR 39/mo** |
>
> Your price stays the same as your coaching business grows.

This comparison is devastating because it highlights the structural disadvantage of per-athlete pricing. Coaches who are scaling their business will immediately see the value.

### 5.3 Value Framing

**"Less than one lactate test per month"**

- A single lactate test at a sports lab costs EUR 50-150
- PeakAerobic Pro costs EUR 39/mo
- Frame: "For the cost of one lab visit, analyze unlimited tests for all your athletes, every month."

**"Less than EUR 1.30/day"**

- EUR 39/mo = EUR 1.30/day
- "Professional metabolic analysis for less than a coffee."

### 5.4 Loss Aversion

**Trial expiration sequence:**

| Day | Message | Channel |
|-----|---------|---------|
| Day 14 | "You've analyzed 12 tests across 4 athletes. Your trial continues for 7 more days." | In-app |
| Day 18 | "Your Pro trial ends in 3 days. Your athletes' periodization plans will be paused." | Email |
| Day 20 | "Tomorrow your trial ends. Lock in annual pricing and save 25%." | In-app + email |
| Day 21 | "Your trial has ended. Your data is safe. Your 4 athletes and 12 tests are waiting." | Email |
| Day 28 | "It's been a week. [Athlete name]'s next recommended test is in 5 days. Upgrade to stay on track." | Email |

**Key psychological triggers:**

- Named athletes, not abstract "data" -- "Maria's threshold trend will be paused"
- Specific numbers -- "12 tests across 4 athletes" (sunk cost)
- Future loss -- "next recommended test in 5 days" (what they'll miss)
- Safety reassurance -- "your data is safe" (reduces anxiety that pressures unsubscribe)

### 5.5 Price Ending

- Use EUR 39, not EUR 39.99 -- clean numbers signal confidence and professionalism in B2B SaaS
- EUR 349/year, not EUR 348.99 -- same principle
- Research confirms: charm pricing ($X.99) works in B2C retail but can feel cheap in B2B professional tools

### 5.6 Social Proof on Pricing Page

- "Trusted by X coaches across Y countries" (update dynamically)
- 2-3 short testimonials from beta users next to the Pro tier
- Logos of any recognizable teams/federations using the platform

---

## 6. MONETIZATION TIMELINE

### Phase 1: Foundation (Month 1-3)

**Goal:** Build user base, validate product-market fit, collect feedback.

| Action | Detail |
|--------|--------|
| Pricing | **Free tier only** + 21-day Pro trial |
| Revenue | EUR 0 (intentional) |
| Focus | Onboarding UX, trial activation rate, feature usage tracking |
| Metrics to track | Signups, trial activations, tests analyzed, periodization views, trial-to-intent |
| Grandfather promise | "Everyone who signs up before [date] gets 30% off Pro for life" |

**Why no paid tier in month 1-3:**

- Need real usage data before committing to pricing
- Early users are beta testers -- charging them creates wrong incentives
- Building a base of 100+ free users creates social proof and word-of-mouth
- Grandfather discount creates urgency to sign up early AND loyalty

### Phase 2: Monetization (Month 3-6)

**Goal:** Launch Pro tier, convert trial users, validate pricing.

| Action | Detail |
|--------|--------|
| Launch | **Coach Pro at EUR 39/mo** (EUR 349/year) |
| Grandfather | Early users get **EUR 27/mo** (30% off) locked for 12 months |
| Target | 15-50 paying coaches |
| Revenue target | EUR 585 - EUR 1,950 MRR |
| Key metric | Trial-to-paid conversion rate (target: >15%) |
| Iteration | A/B test pricing page copy, trial length, feature gates |

### Phase 3: Expansion (Month 6-12)

**Goal:** Launch Team tier, expand revenue per account.

| Action | Detail |
|--------|--------|
| Launch | **Team/Lab at EUR 99/mo** (EUR 899/year) |
| Upsell | In-app prompts for Pro users: "Add your coaching company logo to reports" |
| Target | 50-200 Pro coaches + 5-15 Team accounts |
| Revenue target | EUR 1,950 - EUR 7,800 MRR (Pro) + EUR 500 - EUR 1,500 MRR (Team) |
| New features | White-label reports, API, multi-coach |

### Phase 4: Scale (Month 12+)

**Goal:** Enterprise deals, API licensing, international expansion.

| Action | Detail |
|--------|--------|
| Launch | **Enterprise tier** (custom pricing) |
| Sales | Outbound to federations, university programs, pro teams |
| API licensing | Third-party integrations (training platforms, wearable companies) |
| Revenue target | EUR 10,000+ MRR |
| Consideration | Hiring a part-time sales person for enterprise outreach |

---

## 7. REVENUE PROJECTIONS

### Conservative Scenario

Based on master strategy growth targets and industry conversion benchmarks.

**Assumptions:**

- Free signups grow 30% month-over-month in months 1-6, then 20% m/m
- Trial activation rate: 40% of free users start a Pro trial
- Trial-to-paid conversion: 15% (conservative for niche B2B SaaS)
- Monthly churn (Pro): 4% (typical for SMB SaaS)
- Annual plan adoption: 35% of paid users choose annual

| Month | Free Users (cumulative) | Trial Starts | New Paid | Total Paid | MRR (EUR) | ARR (EUR) |
|-------|------------------------|-------------|----------|-----------|-----------|-----------|
| 1 | 50 | -- | -- | -- | 0 | 0 |
| 2 | 80 | -- | -- | -- | 0 | 0 |
| 3 | 120 | 48 | 15 | 15 | 585 | 7,020 |
| 4 | 160 | 64 | 10 | 24 | 936 | 11,232 |
| 5 | 210 | 84 | 13 | 35 | 1,365 | 16,380 |
| 6 | 275 | 110 | 17 | 50 | 1,950 | 23,400 |
| 9 | 500 | 200 | 30 | 105 | 4,095 | 49,140 |
| 12 | 900 | 360 | 54 | 200 | 7,800 | 93,600 |

**Notes:**

- Churn is factored into "Total Paid" (net of ~4% monthly loss)
- Team tier revenue (starting month 6) not included in this table -- adds ~15-20% on top
- Annual plan impact: 35% of paid users pay EUR 349 upfront -> improves cash flow by ~EUR 2,000-5,000 in months 3-6

### Annual Plan Cash Flow Impact

| Scenario | Monthly-only Cash | With 35% Annual Adoption |
|----------|------------------|-------------------------|
| Month 3 (15 paid) | EUR 585 | EUR 585 + 5 annual x EUR 349 = **EUR 2,330** |
| Month 6 (50 paid) | EUR 1,950 | EUR 1,950 + 18 annual x EUR 349 = **EUR 8,232** |
| Month 12 (200 paid) | EUR 7,800 | EUR 7,800 + 70 annual x EUR 349 = **EUR 32,230** |

Annual plans create significant cash flow spikes that can fund development without external investment.

### Optimistic Scenario (Strong Product-Market Fit)

If trial-to-paid conversion exceeds 20% and word-of-mouth accelerates growth:

| Month | Total Paid | MRR (EUR) |
|-------|-----------|-----------|
| 6 | 80 | 3,120 |
| 12 | 350 | 13,650 |

### Break-Even Analysis

**Estimated monthly costs (lean operation):**

| Cost | EUR/mo |
|------|--------|
| Hosting (VPS + DB) | 50-100 |
| Domain + email | 10 |
| Stripe fees (~2.9%) | ~3% of revenue |
| Marketing (content, ads) | 200-500 |
| **Total** | **~300-650** |

**Break-even: 8-17 paid coaches** (depending on marketing spend).

At 15 paid coaches (month 3 target), the product is already cash-flow positive on operational costs.

---

## 8. RISKS AND MITIGATIONS

### Risk 1: Free Tier Too Generous

**Symptom:** High free user count, low trial activation, low conversion.
**Cause:** Users get enough value from 1 athlete + 3 tests and never need more.

**Mitigations:**

- Monitor "free user satisfaction" -- if >80% of free users never hit a limit, tighten the gates
- Reduce free tests from 3 to 2, or limit to basic threshold detection (no confidence score)
- Add time-decay: free tests older than 90 days are archived (blurred, not deleted)
- Nuclear option: remove free tier entirely, go trial-only (only if conversion data supports it)

### Risk 2: Price Perceived as Too Low ("Amateur Tool")

**Symptom:** Enterprise prospects dismiss the product; coaches question data quality.
**Cause:** EUR 39 is 20% below INSCYD; some coaches equate price with quality.

**Mitigations:**

- Never compete on price alone -- lead with scientific credibility (Olbrecht, Faude, Bishop references)
- Publish validation studies comparing PeakAerobic threshold detection vs lab gold standard
- Offer the Team tier (EUR 99) prominently -- anchors perceived value higher
- Consider raising to EUR 45/mo at month 6 if brand perception is strong (still below INSCYD)
- Enterprise tier at EUR 500+/mo signals institutional-grade capability

### Risk 3: Price Too High vs Free Alternatives

**Symptom:** Users try the free tier, love it, but choose Intervals.icu ($4/mo) + spreadsheets over paying EUR 39.
**Cause:** DIY coaches with few athletes don't see enough incremental value.

**Mitigations:**

- Sharpen the differentiation: lactate analysis and periodization are things Intervals.icu literally cannot do
- Create educational content showing what coaches miss without proper threshold detection
- Offer a "Solo Coach" tier at EUR 19/mo (5 athletes, no periodization) if data shows demand -- but only after month 6
- The free tier itself is the mitigation: users who won't pay EUR 39 stay on Free and contribute to user count / social proof

### Risk 4: INSCYD Drops Price or Launches Free Tier

**Symptom:** Direct competitive response from the established player.
**Cause:** PeakAerobic gains enough traction to appear on INSCYD's radar.

**Mitigations:**

- This is actually a GOOD sign -- it means we're relevant
- INSCYD's strength (certification ecosystem) is also its weakness (can't easily go free/cheap without devaluing their certified coaches)
- Our advantage: speed of iteration, modern UX, Olbrecht periodization (INSCYD does analysis, not prescription)
- If INSCYD drops to EUR 39, we stay at EUR 39 and compete on features, not price

### Risk 5: High Churn After Month 2-3

**Symptom:** Coaches subscribe, use the tool for a testing cycle, then cancel until the next cycle.
**Cause:** Seasonal usage pattern -- coaches test athletes 2-3 times per year, not monthly.

**Mitigations:**

- The periodization engine is the churn killer -- it provides continuous value between tests
- Dynamic thresholds update with training data, not just test data
- Annual plans lock in revenue regardless of usage patterns
- Add features that require ongoing access: athlete progress tracking, training load monitoring, BLa check reminders

### Risk 6: Currency Risk (EUR pricing, global users)

**Symptom:** Non-Eurozone coaches face fluctuating prices; US coaches see different USD amounts each month.

**Mitigations:**

- Price in EUR for European market, USD for North American market
- Consider GBP for UK market if significant adoption
- Use Stripe's multi-currency support
- Lock exchange rate at subscription start for annual plans

---

## 9. PRICING PAGE COPY

### English Version

---

#### Headline

**Professional lactate analysis and periodization. For every coach.**

#### Subheadline

Paste your lactate data. Get lab-grade threshold detection with confidence scores. Build Olbrecht-based training blocks. No per-athlete fees.

---

#### Tier Cards

**[MOST POPULAR badge on Coach Pro]**

##### Free

**EUR 0** /forever

Everything you need to evaluate PeakAerobic with zero commitment.

- 1 athlete
- Last 3 tests
- Full LT1/LT2 detection with confidence score
- Basic 5-zone model
- Community support

**[Get Started -- no credit card required]**

---

##### Coach Pro

~~EUR 39/mo~~ **EUR 29/mo** billed annually

or EUR 39/month, billed monthly

Save 25% with annual billing

The complete toolkit for coaches who use lactate testing.

- **Unlimited athletes** -- no per-athlete fees, ever
- **Unlimited test history** -- full longitudinal tracking
- Real + practical threshold detection (multi-method)
- Dynamic threshold engine (trends between tests)
- Olbrecht 6-block periodization engine
- Mesocycle builder with dose ladders
- Garmin workout push
- PDF athlete reports
- CSV data export
- BLa check reminders
- Email support (48h response)

**[Start 21-day free trial]**

---

##### Team / Lab

~~EUR 99/mo~~ **EUR 75/mo** billed annually

or EUR 99/month, billed monthly

Save 24% with annual billing

For performance labs and coaching companies.

- Everything in Coach Pro, plus:
- **White-label reports** -- your logo, your brand
- **Up to 5 coach accounts** under one billing
- **API access** for custom integrations
- Custom CSV import templates (map any lab output)
- Bulk athlete import
- Priority support (24h response)

**[Start 21-day free trial]**

---

##### Enterprise

**Custom pricing**

For federations, national teams, and research institutions.

- Everything in Team, plus:
- Unlimited coach seats
- Volume licensing
- Custom integrations and on-premise deployment
- SLA guarantee (99.9% uptime)
- Dedicated onboarding and training
- Research-grade data export

**[Contact us]**

---

#### Comparison Callout

> **Why coaches switch from per-athlete pricing**
>
> Traditional platforms charge $4.50-$9 per athlete per month. With 20 athletes, that is over $150/month just for athlete access -- before you even pay for your own subscription.
>
> PeakAerobic charges a flat EUR 39/month. Add 5 athletes or 500. Your price never changes.

---

#### "How we compare to INSCYD" Section

| Feature | INSCYD | PeakAerobic Pro |
|---------|--------|----------------|
| Monthly price | EUR 49+ | **EUR 39** (EUR 29 annual) |
| Certification required | Yes (paid course) | **No** |
| LT1/LT2 detection | Yes | **Yes** (multi-method + confidence score) |
| VO2max / VLamax modeling | Yes (proprietary) | **Yes** (Swain + ACSM + Mader) |
| Periodization engine | No | **Yes** (Olbrecht 6-block) |
| Garmin workout push | No | **Yes** |
| Training zones | Basic | **Olbrecht-calibrated** |
| White-label reports | Enterprise only | **Team tier** (EUR 99/mo) |

---

#### FAQ

**Do I need a credit card to start?**
No. The free tier and the 21-day Pro trial both require zero payment information. You only enter payment details when you choose to subscribe.

**What happens when my trial ends?**
You are downgraded to the Free tier. You are never locked out. All your data is preserved. You can upgrade to Pro at any time to regain full access.

**Is there a per-athlete fee?**
No. Never. Coach Pro includes unlimited athletes at a flat EUR 39/month. We believe per-athlete pricing punishes coaches for growing their business.

**Can I cancel anytime?**
Yes. Monthly subscriptions can be cancelled at any time with no penalty. Annual subscriptions are non-refundable but you retain access until the end of your billing period.

**What payment methods do you accept?**
Credit card, debit card, and SEPA direct debit (for Eurozone customers). All payments are processed securely through Stripe.

**Do you offer discounts for students or non-profits?**
Yes. University sports science programs and registered non-profit sports organizations qualify for 40% off any tier. Contact us with proof of status.

**Can I switch between monthly and annual billing?**
Yes. You can switch to annual billing at any time to lock in the 25% discount. If you switch mid-cycle, the remaining monthly credit is applied to your annual plan.

**Is my athletes' data safe?**
All data is encrypted in transit (TLS 1.3) and at rest (AES-256). We comply with GDPR. You own your data and can export it at any time.

---

### Spanish Version (ES)

---

#### Titular

**Analisis profesional de lactato y periodizacion. Para cada entrenador.**

#### Subtitular

Pega tus datos de lactato. Obtiene deteccion de umbrales con grado de laboratorio e indices de confianza. Construye bloques de entrenamiento basados en Olbrecht. Sin coste por deportista.

---

#### Tarjetas de Plan

**[badge MAS POPULAR en Coach Pro]**

##### Gratis

**EUR 0** /para siempre

Todo lo que necesitas para evaluar PeakAerobic sin compromiso.

- 1 deportista
- Ultimos 3 tests
- Deteccion completa de LT1/LT2 con indice de confianza
- Modelo basico de 5 zonas
- Soporte comunidad

**[Empezar gratis -- sin tarjeta de credito]**

---

##### Coach Pro

~~EUR 39/mes~~ **EUR 29/mes** facturado anualmente

o EUR 39/mes, facturacion mensual

Ahorra un 25% con facturacion anual

El kit completo para entrenadores que usan tests de lactato.

- **Deportistas ilimitados** -- sin coste por deportista, nunca
- **Historial de tests ilimitado** -- seguimiento longitudinal completo
- Deteccion de umbrales reales y practicos (multi-metodo)
- Motor de umbrales dinamicos (tendencias entre tests)
- Motor de periodizacion Olbrecht de 6 bloques
- Constructor de mesociclos con escalas de dosis
- Envio de entrenamientos a Garmin
- Informes PDF para deportistas
- Exportacion de datos CSV
- Recordatorios de control de BLa
- Soporte por email (respuesta en 48h)

**[Empezar prueba gratuita de 21 dias]**

---

##### Team / Lab

~~EUR 99/mes~~ **EUR 75/mes** facturado anualmente

o EUR 99/mes, facturacion mensual

Ahorra un 24% con facturacion anual

Para laboratorios de rendimiento y empresas de coaching.

- Todo lo incluido en Coach Pro, mas:
- **Informes con tu marca** -- tu logo, tu identidad
- **Hasta 5 cuentas de entrenador** bajo una sola facturacion
- **Acceso API** para integraciones personalizadas
- Plantillas de importacion CSV personalizadas (mapea cualquier salida de laboratorio)
- Importacion masiva de deportistas
- Soporte prioritario (respuesta en 24h)

**[Empezar prueba gratuita de 21 dias]**

---

##### Enterprise

**Precio personalizado**

Para federaciones, selecciones nacionales e instituciones de investigacion.

- Todo lo incluido en Team, mas:
- Cuentas de entrenador ilimitadas
- Licencias por volumen
- Integraciones personalizadas y despliegue on-premise
- Garantia SLA (99.9% disponibilidad)
- Onboarding y formacion dedicados
- Exportacion de datos para investigacion

**[Contactanos]**

---

#### Comparativa destacada

> **Por que los entrenadores abandonan el precio por deportista**
>
> Las plataformas tradicionales cobran entre 4,50 y 9 USD por deportista al mes. Con 20 deportistas, eso supone mas de 150 USD/mes solo por el acceso de los deportistas, antes de pagar tu propia suscripcion.
>
> PeakAerobic cobra una tarifa plana de EUR 39/mes. Anade 5 deportistas o 500. Tu precio nunca cambia.

---

#### Seccion "Como nos comparamos con INSCYD"

| Caracteristica | INSCYD | PeakAerobic Pro |
|---------------|--------|----------------|
| Precio mensual | EUR 49+ | **EUR 39** (EUR 29 anual) |
| Certificacion requerida | Si (curso de pago) | **No** |
| Deteccion LT1/LT2 | Si | **Si** (multi-metodo + indice de confianza) |
| Modelado VO2max / VLamax | Si (propietario) | **Si** (Swain + ACSM + Mader) |
| Motor de periodizacion | No | **Si** (Olbrecht 6 bloques) |
| Envio a Garmin | No | **Si** |
| Zonas de entrenamiento | Basicas | **Calibradas Olbrecht** |
| Informes con marca propia | Solo Enterprise | **Plan Team** (EUR 99/mes) |

---

#### Preguntas frecuentes

**Necesito tarjeta de credito para empezar?**
No. El plan gratuito y la prueba de 21 dias de Pro no requieren datos de pago. Solo introduces datos de pago cuando decides suscribirte.

**Que pasa cuando termina mi prueba?**
Bajas al plan Gratis. Nunca te bloqueamos el acceso. Todos tus datos se conservan. Puedes subir a Pro en cualquier momento para recuperar el acceso completo.

**Hay coste por deportista?**
No. Nunca. Coach Pro incluye deportistas ilimitados por una tarifa plana de EUR 39/mes. Creemos que el precio por deportista penaliza a los entrenadores por hacer crecer su negocio.

**Puedo cancelar en cualquier momento?**
Si. Las suscripciones mensuales se pueden cancelar en cualquier momento sin penalizacion. Las suscripciones anuales no son reembolsables, pero conservas el acceso hasta el final de tu periodo de facturacion.

**Que metodos de pago aceptais?**
Tarjeta de credito, tarjeta de debito y domiciliacion SEPA (para clientes de la zona euro). Todos los pagos se procesan de forma segura a traves de Stripe.

**Ofreceis descuentos para estudiantes u organizaciones sin animo de lucro?**
Si. Los programas universitarios de ciencias del deporte y las organizaciones deportivas sin animo de lucro registradas tienen un 40% de descuento en cualquier plan. Contactanos con documentacion acreditativa.

**Puedo cambiar entre facturacion mensual y anual?**
Si. Puedes cambiar a facturacion anual en cualquier momento para obtener el descuento del 25%. Si cambias a mitad de ciclo, el credito mensual restante se aplica a tu plan anual.

**Estan seguros los datos de mis deportistas?**
Todos los datos estan cifrados en transito (TLS 1.3) y en reposo (AES-256). Cumplimos con el RGPD. Tus datos son tuyos y puedes exportarlos en cualquier momento.

---

## Sources

Competitor pricing research:
- [INSCYD Pricing](https://inscyd.com/pricing/)
- [TrainingPeaks Coach Pricing](https://www.trainingpeaks.com/pricing/for-coaches/)
- [TrainingPeaks Coach Pricing Update (April 2025)](https://help.trainingpeaks.com/hc/en-us/articles/34619661884941-TrainingPeaks-Coach-Subscription-Pricing-Update)
- [TrainingPeaks Coach Account Pricing and Billing](https://help.trainingpeaks.com/hc/en-us/articles/204072544-TrainingPeaks-Coach-Account-Pricing-and-Billing)
- [Intervals.icu Pricing](https://www.intervals.icu/pricing/)
- [Athletica.ai Pricing](https://support.athletica.ai/hc/en-us/articles/25518917283483-Athletica-Pricing)
- [WKO5 Product Page](https://www.trainingpeaks.com/wko5/)

SaaS pricing benchmarks:
- [SaaS Free Trial Conversion Rate Benchmarks -- First Page Sage](https://firstpagesage.com/seo-blog/saas-free-trial-conversion-rate-benchmarks/)
- [SaaS Freemium Conversion Rates: 2026 Report -- First Page Sage](https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/)
- [Free Trial Conversion Statistics 2025 -- Amra and Elma](https://www.amraandelma.com/free-trial-conversion-statistics/)
- [SaaS Average Conversion Rate -- Userpilot](https://userpilot.com/blog/saas-average-conversion-rate/)
- [SaaS Pricing Psychology -- Dodo Payments](https://dodopayments.com/blogs/pricing-psychology)
- [Advanced SaaS Pricing Psychology 2026](https://ghl-services-playbooks-automation-crm-marketing.ghost.io/advanced-saas-pricing-psychology-beyond-basic-tiered-models/)
