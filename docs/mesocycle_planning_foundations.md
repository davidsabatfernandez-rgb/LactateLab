# Mesocycle Planning Foundations

## Why this layer exists

The original mesocycle detector is useful as historical context, but it is not enough to drive planning on its own.
For planning, the system should start from a coach-facing library of mesocycle templates and only use the detected
history as supporting evidence.

The product goal is:

- coach-led planning
- explicit mesocycle choice
- validation by physiology and context
- no black-box auto-planning

## What the CSV actually shows

The imported coaching CSV contains recurring session families that map cleanly to a small set of mesocycle identities:

- aerobic capacity / general endurance
- LT1 extensive
- LT2 / threshold development
- aerobic power / VO2
- competition-specific sessions
- strength / mobility / technique as support
- aerobic and glycolytic testing as decision points

The strongest signal is not a calendar shape but a training ontology:

- bike: large amount of AR, D2, LT1 and long threshold work
- run: base running, LT1/LT2 and some VO2 / hills
- swim: general aerobic continuity, technique, CSS-related work and a few profile tests

Representative labels from the CSV:

- `4 x 6' LT1`
- `3 x 30' LT2 (half pace)`
- `4 x 20' LT2 (half pace)`
- `15' LT1 + 4 x 3' VO2max`
- `8 x 50m TEST (Glyc.Cap)`
- `Aerobic.profile EVAL`
- `CSS TEST`
- `Test torque`

This suggests a planning language closer to:

- block identity
- dominant metabolic target
- support modules
- test-decision points

than to a simple weekly calendar.

## Planning principles adopted

1. A mesocycle is not a calendar week.
2. Testing weeks are decision points, not standalone mesocycles by default.
3. Recovery microphases close or absorb into a mesocycle unless they are intentionally extended.
4. The planning flow should start with coach diagnosis, not with auto-generated sequence.
5. Historical detection should modulate confidence, not define the prescription by itself.

## What we borrow from Olbrecht

The current direction is intentionally aligned with the practical planning logic around Jan Olbrecht's work:

- planning should be systematic, not improvised
- testing is used to decide the next block
- capacity phases are usually longer than power / specific phases
- supercompensation matters: recovery is part of the plan, not a pause in the plan
- in triathlon, one discipline or limiter often needs to be prioritized rather than everything moving at once

That does **not** mean copying a book into code verbatim. It means translating those ideas into:

- explicit mesocycle templates
- entry / exit checks
- coach-facing block selection
- validation logic after the coach makes the choice

## Supporting evidence used

The current mesocycle library is grounded on two evidence layers:

### 1. Internal empirical layer

- recurring patterns extracted from the coach CSV
- session families that repeat across the year
- relationship between tests, threshold blocks, VO2 blocks and easier support phases

### 2. External scientific layer

- Olbrecht / *The Science of Winning*:
  systematic planning and periodization, test-informed decisions, capacity vs specificity timing
- Issurin (2010), *Sports Medicine*:
  block periodization is useful when training goals are concentrated rather than mixed continuously
- Seiler (2010), *International Journal of Sports Physiology and Performance*:
  endurance planning works best when a large proportion of work stays below threshold and high intensity is purposeful
- Mujika & Padilla (2003), *Medicine & Science in Sports & Exercise*:
  taper and recovery are performance tools, not dead time

## Product consequences

Because of the evidence above, the planning UI should revolve around:

1. athlete + discipline selection
2. manual diagnosis by the coach
3. mesocycle library by discipline
4. a provisional block that the coach edits before saving
5. the system acting as validator, not as owner of the plan

## Template families

### Running

- Base aeróbica de carrera
- Desarrollo LT1-LT2 de carrera
- Potencia aeróbica de carrera
- Especificidad de carrera

### Cycling

- Base aeróbica ciclista
- Desarrollo FTP/LT2 ciclista
- Potencia aeróbica ciclista
- Especificidad ciclista

### Swimming

- Técnica y base acuática
- Desarrollo umbral en agua

### Shared

- Consolidación y descarga

## Current product hypothesis

The best product direction is not:

- "the software detects your mesocycle for you"

but:

- "the software gives the coach a disciplined way to choose, justify and review a mesocycle"

This document is intentionally conceptual. The implementation should stay conservative, interpretable and easy to audit.
