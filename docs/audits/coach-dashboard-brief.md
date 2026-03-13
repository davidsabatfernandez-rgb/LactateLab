# Coach Dashboard — Design Brief

## Problem Statement

TrainingPeaks requires 5+ clicks to understand if an athlete is ready. A triathlon coach with 8 athletes across 3 disciplines drowns in data. The coach dashboard must surface the answer to "who needs my attention RIGHT NOW?" in under 3 seconds.

## Design Principles

1. **Zero-scroll triage**: The coach sees all athletes and their status on one screen. No scrolling to find the problem child.
2. **3-click rule**: From login to any decision (create mesocycle, check thresholds, view planning) in 3 clicks maximum.
3. **Discipline density, not discipline pages**: A triathlon athlete shows 3 disciplines in one compact row, not 3 separate pages.
4. **Alerts pull attention**: Red/amber signals surface to the top automatically. Green athletes fade to background.
5. **Mobile-first layout**: Cards stack vertically on mobile. No horizontal scrolling. Touch targets >= 44px.

---

## Page Structure

### 1. Command Bar (top)

A persistent top strip with:
- **Roster count** (e.g., "8 atletas")
- **Alerts count** (red badge: "3 requieren atención")
- **Quick filters**: All | Running | Ciclismo | Triathlon | Alerts only
- **Quick actions dropdown**: Create mesocycle, Generate report, View planning

### 2. Alert Banner (conditional)

Only appears when there are urgent items:
- Athletes with no test in 40+ days
- HRV/wellness declining (from Garmin data)
- Block evaluation negative
- Confidence below threshold
- Target event in < 14 days with no active block

Clicking an alert scrolls/navigates to that athlete.

### 3. Athlete Grid (main content)

Each athlete is a **compact card** showing:

#### Card Header
- Name + avatar initial
- Primary discipline badge (color-coded)
- Days to next target (countdown badge)
- Status indicator (green/amber/red dot)

#### Card Body — Discipline Strip

For each discipline (1 for runners, 3 for triathletes):
- **LT2 anchor value** (pace or watts) — the single most important number
- **Trend arrow** (improving/stable/declining based on historical evolution)
- **Confidence pill** (high/medium/low)
- **Last test recency** (e.g., "12d ago")

#### Card Footer
- Active block label + phase
- Block evaluation direction (arrow + tone)
- Quick action buttons: "Ficha" | "Planning" | "Reporte"

### 4. Comparison Drawer (expandable)

A collapsible bottom panel for multi-athlete comparison:
- Select 2-4 athletes
- Side-by-side LT2 values per discipline
- Relative improvement over last 30 days

---

## Triathlon-Specific Design

The hardest case: a triathlon coach managing athletes with 3 disciplines each.

### Discipline Strip Layout

```
[Athlete Card]
  Name: Maria Garcia          Next: Ironman Lanzarote (47d)

  NAT    4:42/100m  LT2   ↗  conf:82%  test:8d
  BIKE   268W      LT2   →  conf:74%  test:12d
  RUN    04:28/km  LT2   ↘  conf:68%  test:22d  ⚠ stale
```

Each discipline line is a single row. The coach scans vertically to see the full picture. No tabs. No clicks.

### Color Coding

- Swim: `#0ea5e9` (blue)
- Bike: `#f59e0b` (amber)
- Run: `#22c55e` (green)
- Alert: `#ef4444` (red)
- Warning: `#f97316` (orange)
- Good: `#10b981` (emerald)

---

## Alert System

### Alert Categories (sorted by severity)

| Priority | Alert | Trigger | Color |
|----------|-------|---------|-------|
| P0 | Target imminent, no block | Event < 14d, no active focus block | Red |
| P1 | Block failing | Evaluation direction = negative | Red |
| P2 | Stale thresholds | Last snapshot > 40 days | Orange |
| P3 | Low confidence | Average confidence < 60% | Orange |
| P4 | No connectivity | No Strava + no Garmin | Yellow |
| P5 | Wellness declining | HRV trend negative (Garmin) | Yellow |

### Alert Display

Alerts are NOT separate notifications. They are **embedded in the athlete card** as colored left-border and a small badge. The alert banner at the top aggregates counts.

---

## Quick Actions

### From the Dashboard (no navigation needed)

1. **Open athlete detail** — Link on card
2. **Open planning** — Link with athlete pre-selected
3. **Generate physiology report** — Button triggers API call directly
4. **View thresholds** — Expandable inline section in card

### From Alert Items

Each alert has a contextual action:
- "Stale thresholds" → Link to schedule a test session
- "Block failing" → Link to planning page
- "Target imminent" → Link to athlete targets

---

## Mobile-First Layout

### Breakpoints

- **< 640px**: Single column. Cards full-width. Discipline strip stacks.
- **640-1024px**: 2-column grid. Cards show discipline strip inline.
- **> 1024px**: 3-column grid or list view.

### Card Compression on Mobile

On mobile, the discipline strip collapses to show only:
- Discipline icon + LT2 value + trend arrow
- Tap to expand full details

---

## Data Sources (existing API endpoints)

All data comes from existing endpoints — no new backend work needed:

| Data | Endpoint | Type |
|------|----------|------|
| Athletes list | `GET /athletes` | `Athlete[]` |
| Analysis per athlete | `GET /athletes/{id}/analysis` | `AthleteAnalysis` |
| Planning overview | `GET /planning/athletes/{id}/overview` | `PlanningOverview` |
| Health overview | `GET /athlete-health/athletes/{id}/overview` | `AthleteHealthOverview` |
| Dashboard summary | `GET /analytics/dashboard` | `DashboardData` |

### Data Loading Strategy

1. Load athletes list (fast, cached in App.tsx)
2. In parallel, load analysis for each athlete (already done in DashboardPage)
3. Optionally load health overview for athletes with Garmin connected
4. Derive all alerts, thresholds, trends from the analysis data

---

## Comparison with Existing DashboardPage

The existing `DashboardPage.tsx` already has:
- Template views (coach, thresholds, monitoring, attention)
- Analysis loading for all athletes
- Goal scenario charts
- Attention items
- Threshold snapshots

The new Coach Dashboard improves on this by:
1. **Denser layout**: More athletes visible without scrolling
2. **Alert-first sorting**: Athletes needing attention float to top
3. **Inline discipline strips**: No template switching needed — all data visible at once
4. **Quick actions**: Direct links to planning/reports without entering athlete detail
5. **Triathlon-optimized**: 3 disciplines per athlete in one compact view

---

## Implementation Plan

### Phase 1 (This PR)
- `CoachDashboardPage.tsx` — Full prototype
- Alert system with sorting
- Discipline strip per athlete
- Quick action buttons
- CSS in styles.css
- Route in App.tsx

### Phase 2 (Future)
- Comparison drawer
- Garmin wellness integration
- Mobile touch optimizations
- Offline caching
