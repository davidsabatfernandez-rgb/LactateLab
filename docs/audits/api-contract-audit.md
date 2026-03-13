# API Contract Audit -- Backend vs Frontend

**Date**: 2026-03-13 (updated)
**Scope**: All Pydantic schemas, FastAPI routes, TypeScript types, and API calls
**Method**: Systematic cross-reference of every endpoint, field, and type

---

## 1. Backend Endpoint Catalog (42 endpoints + 2 root)

### Auth (`/api/auth`) -- 5 endpoints

| Method | Path | Request Schema | Response Schema |
|--------|------|----------------|-----------------|
| POST | `/auth/login` | `LoginRequest` (email, password) | `TokenResponse` (access_token, token_type) |
| GET | `/auth/me` | -- | `UserRead` (id, email, role, full_name, athlete_id?) |
| GET | `/auth/strava/start` | Query: athlete_id?, return_path? | `StravaConnectStartResponse` |
| GET | `/auth/strava/callback` | Query: code?, state?, error?, scope? | Redirect (302) |
| POST | `/auth/strava/test-connect` | `StravaTestConnectRequest` | `StravaTestConnectResponse` |

### Athletes (`/api/athletes`) -- 18 endpoints

| Method | Path | Request Schema | Response Schema |
|--------|------|----------------|-----------------|
| GET | `/athletes` | -- | `list[AthleteRead]` |
| POST | `/athletes` | `AthleteCreate` | `AthleteRead` (201) |
| GET | `/athletes/{id}` | -- | `AthleteRead` |
| PATCH | `/athletes/{id}` | `AthleteUpdate` | `AthleteRead` |
| DELETE | `/athletes/{id}` | -- | 204 |
| POST | `/athletes/{id}/weights` | `AthleteWeightHistoryCreate` | `AthleteWeightHistoryRead` (201) |
| POST | `/athletes/{id}/focus-blocks` | `AthleteFocusBlockCreate` | `AthleteFocusBlockRead` (201) |
| PATCH | `/athletes/{id}/focus-blocks/{bid}` | `AthleteFocusBlockUpdate` | `AthleteFocusBlockRead` |
| DELETE | `/athletes/{id}/focus-blocks/{bid}` | -- | 204 |
| POST | `/athletes/{id}/targets` | `AthleteTargetCreate` | `AthleteTargetRead` (201) |
| PATCH | `/athletes/{id}/targets/{tid}` | `AthleteTargetUpdate` | `AthleteTargetRead` |
| DELETE | `/athletes/{id}/targets/{tid}` | -- | 204 |
| POST | `/athletes/{id}/recalculate` | -- | dict (no response_model) |
| GET | `/athletes/{id}/analysis` | -- | `AthleteAnalysisRead` |
| POST | `/athletes/{id}/physiology-report` | Query: discipline?, power_source? | `PhysiologyReportRead` |
| GET | `/athletes/{id}/physiology-report/pdf` | Query: discipline?, power_source? | StreamingResponse (PDF blob) |
| POST | `/athletes/{id}/ai-interpretation` | `AthleteAIInterpretationRequest` | `AthleteAIInterpretationResponse` |
| POST | `/athletes/{id}/reasoning-interpretation` | `AthleteReasoningInterpretationRequest` | `AthleteReasoningInterpretationResponse` |
| POST | `/athletes/generate-demo` | -- | `AthleteRead` (201) |
| POST | `/athletes/generate-demo-chim` | -- | `AthleteRead` (201) |

### Sessions (`/api/sessions`) -- 10 endpoints

| Method | Path | Request Schema | Response Schema |
|--------|------|----------------|-----------------|
| GET | `/sessions` | -- | `list[SessionRead]` |
| POST | `/sessions` | `SessionCreate` | `SessionRead` (201) |
| GET | `/sessions/{id}` | -- | `SessionRead` |
| PATCH | `/sessions/{id}` | `SessionUpdate` | `SessionRead` |
| DELETE | `/sessions/{id}` | -- | 204 |
| PATCH | `/sessions/intervals/{iid}` | `SessionIntervalUpdate` | `SessionRead` |
| DELETE | `/sessions/intervals/{iid}/lactate-sample` | -- | 204 |
| GET | `/sessions/{id}/analysis` | -- | `SessionAnalysisRead` |
| POST | `/sessions/import/preview` | FormData | `ImportPreviewResponse` |
| POST | `/sessions/import/commit` | FormData | `ImportCommitResponse` |

### Analytics (`/api/analytics`) -- 6 endpoints

| Method | Path | Request Schema | Response Schema |
|--------|------|----------------|-----------------|
| GET | `/analytics/dashboard` | -- | `DashboardRead` |
| GET | `/analytics/compare` | Query: session_a, session_b | dict (no response_model) |
| GET | `/analytics/athletes/{id}/dynamic-thresholds` | Query: discipline?, power_source? | `DynamicThresholdsRead` |
| GET | `/analytics/athletes/{id}/dynamic-thresholds/acute` | Query: discipline?, power_source? | `DynamicThresholdModelRead` |
| GET | `/analytics/athletes/{id}/dynamic-thresholds/chronic` | Query: discipline?, power_source? | `DynamicThresholdModelRead` |
| GET | `/analytics/athletes/{id}/dynamic-thresholds/history` | Query: discipline?, power_source? | dict (no response_model) |

### Planning (`/api/planning`) -- 8 endpoints

| Method | Path | Request Schema | Response Schema |
|--------|------|----------------|-----------------|
| GET | `/planning/athletes/{id}/overview` | Query: discipline? | `PlanningOverviewRead` |
| GET | `/planning/athletes/{id}/mesocycles` | Query: discipline? | `list[PlanningDetectedMesocycleRead]` |
| GET | `/planning/athletes/{id}/recommendation` | Query: discipline? | `MesocycleRecommendationRead` |
| GET | `/planning/athletes/{id}/workout-library` | Query: discipline? | `list[PlanningWorkoutTemplateRead]` |
| GET | `/planning/workout-library` | Query: discipline (required) | `list[PlanningWorkoutTemplateRead]` |
| GET | `/planning/athletes/{id}/mesocycle-draft` | Query: discipline? | `PlanningMesocycleDraftRead` |
| PATCH | `/planning/planned-sessions/{sid}/bla-check` | `BlaCheckUpdateRequest` | `PlanningPlannedSessionRead` |
| PATCH | `/planning/planned-sessions/{sid}/coach-edit` | `CoachSessionEditRequest` | `PlanningPlannedSessionRead` |

### Reports (`/api/reports`) -- 2 endpoints

| Method | Path | Response |
|--------|------|----------|
| GET | `/reports/athlete/{id}` | dict (no response_model) |
| GET | `/reports/session/{id}` | dict (no response_model) |

### Strava (`/api/strava`) -- 1 endpoint

| Method | Path | Response Schema |
|--------|------|-----------------|
| GET | `/strava/athletes/{id}/activities` | `StravaActivitiesImportResponse` |

### Garmin (`/api/garmin`) -- 3 endpoints

| Method | Path | Response Schema |
|--------|------|-----------------|
| POST | `/garmin/athletes/{id}/connect` | `GarminConnectResponse` |
| GET | `/garmin/athletes/{id}/preview` | `GarminActivitiesPreviewResponse` |
| GET | `/garmin/athletes/{id}/activities/{aid}` | `GarminActivityRead` |

### Athlete Health (`/api/athlete-health`) -- 1 endpoint

| Method | Path | Response Schema |
|--------|------|-----------------|
| GET | `/athlete-health/athletes/{id}/overview` | `AthleteHealthOverviewRead` |

---

## 2. Frontend API Call Catalog (42 methods in `api.ts`)

| Frontend Method | HTTP | Backend Path | Match? |
|-----------------|------|-------------|--------|
| `login` | POST | `/auth/login` | OK |
| `me` | GET | `/auth/me` | OK |
| `stravaConnectStart` | GET | `/auth/strava/start` | OK |
| `stravaTestConnect` | POST | `/auth/strava/test-connect` | OK |
| `stravaActivities` | GET | `/strava/athletes/{id}/activities` | OK |
| `garminConnect` | POST | `/garmin/athletes/{id}/connect` | OK |
| `garminPreview` | GET | `/garmin/athletes/{id}/preview` | OK |
| `garminActivityDetail` | GET | `/garmin/athletes/{id}/activities/{aid}` | OK |
| `athleteHealthOverview` | GET | `/athlete-health/athletes/{id}/overview` | OK |
| `dashboard` | GET | `/analytics/dashboard` | OK |
| `athletes` | GET | `/athletes` | OK |
| `createAthlete` | POST | `/athletes` | OK |
| `generateDemoAthlete` | POST | `/athletes/generate-demo` | OK |
| `generateChimAthlete` | POST | `/athletes/generate-demo-chim` | OK |
| `updateAthlete` | PATCH | `/athletes/{id}` | OK |
| `generatePhysiologyReport` | POST | `/athletes/{id}/physiology-report` | OK |
| `downloadPhysiologyReportPdf` | GET | `/athletes/{id}/physiology-report/pdf` | OK |
| `addAthleteWeight` | POST | `/athletes/{id}/weights` | OK |
| `addFocusBlock` | POST | `/athletes/{id}/focus-blocks` | OK |
| `updateFocusBlock` | PATCH | `/athletes/{id}/focus-blocks/{bid}` | OK |
| `deleteFocusBlock` | DELETE | `/athletes/{id}/focus-blocks/{bid}` | OK |
| `addAthleteTarget` | POST | `/athletes/{id}/targets` | OK |
| `updateAthleteTarget` | PATCH | `/athletes/{id}/targets/{tid}` | OK |
| `deleteAthleteTarget` | DELETE | `/athletes/{id}/targets/{tid}` | OK |
| `athleteAIInterpretation` | POST | `/athletes/{id}/ai-interpretation` | OK |
| `deleteAthlete` | DELETE | `/athletes/{id}` | OK |
| `athleteAnalysis` | GET | `/athletes/{id}/analysis` | OK |
| `planningOverview` | GET | `/planning/athletes/{id}/overview` | OK |
| `planningMesocycles` | GET | `/planning/athletes/{id}/mesocycles` | OK |
| `planningRecommendation` | GET | `/planning/athletes/{id}/recommendation` | OK |
| `planningWorkoutLibrary` | GET | `/planning/athletes/{id}/workout-library` | OK |
| `generalPlanningWorkoutLibrary` | GET | `/planning/workout-library` | OK |
| `planningMesocycleDraft` | GET | `/planning/athletes/{id}/mesocycle-draft` | OK |
| `toggleBlaCheck` | PATCH | `/planning/planned-sessions/{sid}/bla-check` | OK |
| `coachEditSession` | PATCH | `/planning/planned-sessions/{sid}/coach-edit` | OK |
| `sessions` | GET | `/sessions` | OK |
| `createSession` | POST | `/sessions` | OK |
| `updateInterval` | PATCH | `/sessions/intervals/{iid}` | OK |
| `deleteLactateSample` | DELETE | `/sessions/intervals/{iid}/lactate-sample` | OK |
| `sessionAnalysis` | GET | `/sessions/{id}/analysis` | OK |
| `athleteDynamicThresholds` | GET | `/analytics/athletes/{id}/dynamic-thresholds` | OK |
| `importPreview` | POST | `/sessions/import/preview` | OK |
| `importCommit` | POST | `/sessions/import/commit` | OK |
| `compare` | GET | `/analytics/compare` | OK |

**Result: 42/42 URL+method matches. Zero missing endpoints.**

---

## 3. Issues Found

### ISSUE 1 -- `peak_lactate` stripped from session analysis response

| Aspect | Detail |
|--------|--------|
| Endpoint | `GET /sessions/{id}/analysis` |
| Backend | `SessionAnalysisRead` does NOT include `peak_lactate` |
| Backend service | `analyze_session()` returns `"peak_lactate": peak` in dict |
| Frontend type | `SessionAnalysis.peak_lactate?: PeakLactate` (types.ts:1170) |
| Severity | **SILENT_BUG** |
| Impact | Pydantic v2's `response_model` strips `peak_lactate`. Peak lactate reference line never renders in session charts. CurveChart guards with null check so no crash, but the feature is dead. |
| Fix | Add `peak_lactate: Optional[dict] = None` to `SessionAnalysisRead` in `backend/app/schemas/analytics.py`. |

### ISSUE 2 -- `is_peak` stripped from CurvePoint in all responses

| Aspect | Detail |
|--------|--------|
| Endpoint | `GET /sessions/{id}/analysis`, `GET /athletes/{id}/analysis` |
| Backend | `CurvePoint` schema does NOT include `is_peak` |
| Backend service | `_curve_points()` adds `"is_peak": True/False` to each point dict |
| Frontend type | `CurvePoint.is_peak?: boolean` (types.ts:424) |
| Severity | **SILENT_BUG** |
| Impact | Field stripped by Pydantic. Currently no component reads it, so zero visual impact, but any future feature relying on it will silently fail. |
| Fix | Add `is_peak: bool = False` to `CurvePoint` in `backend/app/schemas/analytics.py`. |

### ISSUE 3 -- `coach_id` missing from frontend `Athlete` type

| Aspect | Detail |
|--------|--------|
| Backend | `AthleteRead.coach_id: Optional[int]` (athlete.py:157) |
| Frontend | `Athlete` type (types.ts:1-26) does NOT include `coach_id` |
| Severity | **COSMETIC** |
| Impact | Field arrives in JSON but ignored. No crash. Only matters if multi-coach features are built. |
| Fix | Add `coach_id?: number \| null` to `Athlete` type. |

### ISSUE 4 -- `dose_step_override` and `swapped_template_id` missing from frontend `PlanningPlannedSession`

| Aspect | Detail |
|--------|--------|
| Backend | `PlanningPlannedSessionRead` has both fields (planning.py:203-204) |
| Frontend | `PlanningPlannedSession` (types.ts:898-919) omits them |
| Severity | **COSMETIC** |
| Impact | Fields arrive in JSON but unused. Coach edit flow works because it sends via PATCH body, not from state. |
| Fix | Add `dose_step_override?: number \| null` and `swapped_template_id?: string \| null`. |

### ISSUE 5 -- `AthleteTarget.objective` nullability mismatch

| Aspect | Detail |
|--------|--------|
| Backend | `AthleteTargetBase.objective: Optional[str] = None` -- can be null |
| Frontend | `AthleteTarget.objective: string` -- declared required non-null |
| Severity | **SILENT_BUG** (low probability) |
| Impact | Backend normalizer always populates the field today, so no crash. But if normalization is bypassed, frontend renders "null"/"undefined" as text. |
| Fix | Either make frontend `objective?: string \| null` or add Pydantic validator to guarantee non-null. |

### ISSUE 6 -- Multiple API calls lack explicit return type generics

| Aspect | Detail |
|--------|--------|
| Frontend | ~15 API methods call `request(path)` without type parameter, returning `Promise<unknown>` |
| Impact | No compile-time type safety. Callers cast with `as AthleteAnalysis` etc. which is unchecked. |
| Severity | **SILENT_BUG** (type safety) |
| Fix | Add explicit generics: `request<AthleteAnalysis>(path, options)`. |

### ISSUE 7 -- `compare` endpoint has no response_model and no frontend type

| Aspect | Detail |
|--------|--------|
| Backend | `GET /analytics/compare` returns raw dict, no `response_model` |
| Frontend | `api.compare()` returns untyped result |
| Severity | **SILENT_BUG** |
| Impact | No schema validation on either side. |
| Fix | Create `CompareSessionsRead` Pydantic schema and matching TypeScript type. |

### ISSUE 8 -- Legacy report endpoints orphaned

| Aspect | Detail |
|--------|--------|
| Backend | `GET /reports/athlete/{id}`, `GET /reports/session/{id}` -- ad-hoc dicts, no response_model |
| Frontend | No API call or component consumes these |
| Severity | **COSMETIC** |
| Fix | Deprecate/remove or add schemas. |

### ISSUE 9 -- `recalculate` endpoint has no response_model

| Aspect | Detail |
|--------|--------|
| Backend | `POST /athletes/{id}/recalculate` -- untyped return |
| Frontend | Not consumed |
| Severity | **COSMETIC** |
| Fix | Add response_model or mark as internal. |

### ISSUE 10 -- `contextual_details` uses untyped `list[dict]` in schema

| Aspect | Detail |
|--------|--------|
| Backend | `SessionAnalysisRead.contextual_details: list[dict]` |
| Frontend | `SessionAnalysis.contextual_details` is fully typed (interval_id, order_index, etc.) |
| Severity | **SILENT_BUG** (low probability) |
| Impact | No Pydantic validation on shape. Backend refactor could silently break frontend. |
| Fix | Create `ContextualDetailRead` Pydantic model. |

### ISSUE 11 -- `LactateSample.id` optionality mismatch

| Aspect | Detail |
|--------|--------|
| Backend | `LactateSampleRead.id: int` -- always present |
| Frontend | `LactateSample.id?: number` -- declared optional |
| Severity | **OK** |
| Impact | Frontend over-cautious. Harmless. |

### ISSUE 12 -- `active_focus_block` typed as `Optional[dict]` in backend schema

| Aspect | Detail |
|--------|--------|
| Backend | `AthleteAnalysisRead.active_focus_block: Optional[dict] = None` |
| Frontend | Fully typed: `(AthleteFocusBlock & { evaluation?: AthleteFocusBlockEvaluation })` |
| Severity | **SILENT_BUG** (low probability) |
| Fix | Create `ActiveFocusBlockRead` Pydantic model. |

### ISSUE 13 -- `reasoning-interpretation` endpoint has no frontend consumer

| Aspect | Detail |
|--------|--------|
| Backend | `POST /athletes/{id}/reasoning-interpretation` -- full implementation |
| Frontend | No `api.reasoningInterpretation()` method |
| Severity | **COSMETIC** |
| Fix | Add to `api.ts` if planned, or remove endpoint. |

### ISSUE 14 -- `Athlete.weights`/`focus_blocks`/`targets` declared optional in frontend but always present in backend

| Aspect | Detail |
|--------|--------|
| Backend | Default `[]` -- always present |
| Frontend | Declared with `?` -- optional |
| Severity | **OK** |
| Impact | Frontend more permissive. Harmless. |

---

## 4. Unused Backend Endpoints (15 endpoints not called from frontend)

| Method | Path | Reason Unused |
|--------|------|---------------|
| GET | `/athletes/{id}` | Frontend uses athlete list + analysis instead |
| PATCH | `/sessions/{id}` | Frontend only updates intervals |
| DELETE | `/sessions/{id}` | No delete session UI |
| GET | `/sessions/{id}` | Frontend uses session list |
| POST | `/athletes/{id}/recalculate` | Called internally by backend after mutations |
| POST | `/athletes/{id}/reasoning-interpretation` | No frontend consumer |
| GET | `/reports/athlete/{id}` | Superseded by physiology-report |
| GET | `/reports/session/{id}` | Superseded by session-analysis |
| GET | `/analytics/athletes/{id}/dynamic-thresholds/acute` | Data included in parent endpoint |
| GET | `/analytics/athletes/{id}/dynamic-thresholds/chronic` | Data included in parent endpoint |
| GET | `/analytics/athletes/{id}/dynamic-thresholds/history` | Data included in parent endpoint |
| GET | `/planning/athletes/{id}/mesocycles` | Data included in `/overview` |
| GET | `/planning/athletes/{id}/recommendation` | Data included in `/overview` |
| GET | `/planning/athletes/{id}/workout-library` | Frontend uses `generalPlanningWorkoutLibrary` |
| GET | `/planning/athletes/{id}/mesocycle-draft` | Data included in `/overview` |

---

## 5. Missing Backend Endpoints (Frontend calls without backend)

**None found.**

---

## 6. Schema Alignment Detail

### 6.1 Auth Schemas -- ALL OK
All 6 schemas match exactly between Pydantic and TypeScript.

### 6.2 Athlete Schemas -- MINOR DRIFT
- `AthleteRead.coach_id` missing from frontend (Issue #3)
- `AthleteTarget.objective` nullability mismatch (Issue #5)
- `weights`/`focus_blocks`/`targets` optionality mismatch (Issue #14, harmless)

### 6.3 Session Schemas -- OK
- `SessionRead` / `SessionSummary` align
- `SessionIntervalRead` / `SessionInterval` align
- `LactateSampleRead.id` optionality mismatch (Issue #11, harmless)

### 6.4 Analytics Schemas -- DRIFT
- `SessionAnalysisRead` missing `peak_lactate` (Issue #1)
- `CurvePoint` missing `is_peak` (Issue #2)
- `contextual_details` untyped (Issue #10)
- `active_focus_block` untyped (Issue #12)
- All other fields align (AthleteAnalysis, DashboardRead, DynamicThresholds, etc.)

### 6.5 Planning Schemas -- MINOR DRIFT
- `PlanningPlannedSession` missing `dose_step_override`/`swapped_template_id` (Issue #4)
- All other planning types (Overview, Recommendation, Draft, WorkoutTemplate, DoseStep, BlockCandidate, etc.) align exactly

### 6.6 Garmin Schemas -- ALL OK
All fields match between `GarminActivityRead`/`GarminActivity` and `GarminActivitiesPreviewResponse`.

### 6.7 Strava Schemas -- ALL OK
All fields match between `StravaActivityRead`/`StravaActivity` and `StravaActivitiesImportResponse`.

### 6.8 Athlete Health Schemas -- ALL OK
All nested types (providers, summary, metrics, daily, activities, calendar) match exactly.

### 6.9 Physiology Report Schemas -- ALL OK
All fields match including individual_thresholds additions.

### 6.10 AI Schemas -- OK
Request/response shapes match for `ai-interpretation`. `reasoning-interpretation` has no frontend consumer (Issue #13).

### 6.11 Import Schemas -- ALL OK
`ImportPreviewResponse` and `ImportCommitResponse` match frontend usage.

---

## 7. Summary

| Category | Count |
|----------|-------|
| Total backend endpoints | 44 (42 + 2 root) |
| Total frontend API methods | 42 |
| URL + method matches | 42/42 (100%) |
| Request body mismatches | 0 |
| Query parameter mismatches | 0 |
| Missing backend endpoints | 0 |
| Unused backend endpoints | 15 |
| Schema field drifts | 14 issues total |

### By Severity

| Severity | Count | Issues |
|----------|-------|--------|
| **WILL_CRASH** | 0 | -- |
| **SILENT_BUG** | 6 | #1, #2, #5, #6, #10, #12 |
| **SILENT_BUG (type safety)** | 1 | #7 |
| **COSMETIC** | 5 | #3, #4, #8, #9, #13 |
| **OK** | 2 | #11, #14 |

### Priority Fixes

1. **Issue #1** -- Add `peak_lactate` to `SessionAnalysisRead`. Restores VLaMax proxy rendering. One-line fix.
2. **Issue #2** -- Add `is_peak` to `CurvePoint`. Prepares for peak-highlighting. One-line fix.
3. **Issue #6** -- Add return type generics to `api.ts` methods. Largest type safety improvement.
4. **Issue #12** -- Type `active_focus_block` as proper Pydantic model. Guards evaluation shape.
5. **Issue #10** -- Type `contextual_details` as proper Pydantic model. Guards session detail rendering.
