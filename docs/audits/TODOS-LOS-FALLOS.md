# Consolidado de fallos — Auditorías 13 marzo 2026

Todas las auditorías completadas. Este archivo es el índice para revisión.
Detalle completo en cada archivo individual.

---

## LIMITACIÓN DOCUMENTADA (3) — Triatlón cross-disciplina

Decisión 2026-03-13: rebajados de CRITICAL a limitación documentada. La degradación cross-disciplina (swim→bike→run) es un problema de ejecución en carrera, no de umbrales fisiológicos. Los tests de lactato solo miden umbrales standalone — la degradación real depende de economía post-fatiga, gestión de intensidad, nutrición y entrenamiento brick, que solo el coach puede evaluar en contexto. Un motor automático de degradación sería falsa precisión. Trabajaremos en dar herramientas al coach (race factors visibles, override manual, alertas de gaps asimétricos).

| # | Limitación | Fuente | Plan |
|---|------------|--------|------|
| L1 | **Sin modelo de degradación de umbrales swim→bike→run** — el sistema trata cada disciplina independiente | Audit ciencia | Mostrar race factors al coach + permitir override manual por atleta |
| L2 | **Sin selección de mesociclo integrada cross-disciplina** — 3 recomendaciones independientes sin priorización | Audit ciencia | Añadir vista comparativa de gaps por disciplina para que el coach priorice |
| L3 | **Sin blueprints multi-disciplina ni sesiones brick** — el entrenador construye manualmente | Audit ciencia | Añadir sesiones brick a la biblioteca de workout (futuro) |

---

## IMPORTANT (7)

| # | Fallo | Fuente | Estado |
|---|-------|--------|--------|
| I1 | **Ironman run race factor +4% optimista** (0.78→0.74 trained, 0.84→0.80 competitive) | Audit ciencia | ✅ ARREGLADO — también diferenciados sprint/olympic bike≠run |
| I2 | **VLamax proxy ratios (0.79/0.87) sin validación publicada** — cortes empíricos, no prospectivos | Audit ciencia | Pendiente: documentar como orientativo |
| I3 | **Practical LT2 fijo 3.1 mmol** — debería usar LT2_REAL−0.5 cuando está disponible (Beneke 2011: MLSS varía 2.5-7.0) | Audit ciencia | Pendiente |
| I4 | **Sin sesiones brick en biblioteca de workout** | Audit ciencia | Pendiente |
| I5 | **`peak_lactate` stripped por Pydantic** — `SessionAnalysisRead` no declara el campo → VLaMax proxy line nunca renderiza en gráficos | API audit | Pendiente (1 línea) |
| I6 | **`is_peak` stripped de curve points** — `CurvePoint` no declara el campo → futuras features de peak-highlight bloqueadas | API audit | Pendiente (1 línea) |
| I7 | **~15 métodos API con `Promise<unknown>`** — zero type safety en frontend, `as` casts sin verificar | API audit | Pendiente |
| I8 | **Practical LT1 fijo 1.6 mmol demasiado bajo para recreativos** — baseline puede ser 1.0-1.5 mmol, debería ser relativo (baseline+delta) | Audit ciencia R1 | Pendiente |
| I9 | **Mismos targets de lactato para todas las disciplinas** — natación tiene dinámicas diferentes (Maglischo 2003), 3.1 mmol puede ser sistemáticamente bajo para swim | Audit ciencia R1 | Pendiente |
| I10 | **70.3 race factor ligeramente conservador** (~0.86 trained vs literatura ~0.89) | Audit ciencia R1 | Pendiente |

---

## PRESCRIPCIONES IMPLAUSIBLES del stress test (3)

| # | Perfil | Fallo | Impacto |
|---|--------|-------|---------|
| S1 | **Elite Ironman femenina, 4 semanas** — prescribe `threshold_development_block` en vez de `competition_specific_block`. P5a añade warning pero no override | Stress test | El atleta entrenaría umbrales a 4 semanas de un Ironman |
| S2 | **Olympic diesel (ratio 0.92)** — threshold development prescrito, pero no existe path AEP para moderate aerobic + low VLamax en specific phase fuera de ANC-candidate events | Stress test | Atleta diesel sin opción de potencia aeróbica |
| S3 | **Runner curva plana (LT2-LT1=0.1 mmol)** — LT1/LT2 colocados en extremos de la curva sin flag "protocolo de test insuficiente" | Stress test | Puede dar prescripciones basadas en datos no fiables |

---

## CRASH POTENCIAL (1)

| # | Fallo | Fuente |
|---|-------|--------|
| X1 | **Perfil principiante sin datos** — fallback blueprint referencia `test_profile_anchor` y `recovery_regeneration` template_ids que podrían no existir en `WORKOUT_TEMPLATES` → `AttributeError` en `template.csv_examples` | Stress test |

---

## DESIGN GAPS del stress test (5)

| # | Gap |
|---|-----|
| D1 | **No hay override "too late to close the gap"** — con gap grande y timeline corto, sigue prescribiendo bloques de desarrollo |
| D2 | **No hay priorización cross-disciplina para triatlón** (= C2) |
| D3 | **No hay detector de curva plana / rango de test insuficiente** |
| D4 | **No hay path AEP para atletas diesel en specific phase** (mid-distance events) |
| D5 | **Template_ids de fallback blueprint no verificados contra WORKOUT_TEMPLATES** |

---

## SILENT BUGS del API audit (6)

| # | Bug | Severidad |
|---|-----|-----------|
| B1 | `peak_lactate` stripped por Pydantic (= I5) | Funcionalidad muerta |
| B2 | `is_peak` stripped de CurvePoint (= I6) | Feature bloqueada |
| B3 | `active_focus_block` usa `Optional[dict]` sin tipo — cualquier refactor backend rompe frontend silenciosamente | Fragilidad |
| B4 | `contextual_details` usa `list[dict]` sin tipo — mismo riesgo | Fragilidad |
| B5 | ~15 métodos API con `Promise<unknown>` (= I7) | Zero type safety |
| B6 | Frontend types más permisivos que backend (optional donde backend siempre provee) | Cosmético |

---

## MINOR (7) — de la auditoría científica

| # | Fallo | Detalle |
|---|-------|---------|
| M1 | LT1 confirmación laxa (`next_value >= value - 0.25`) | Faude 2009 dice sostenido → endurecer a -0.10 |
| M2 | `sustained_increase` LT1 sensible a ruido | Solo requiere 1 paso de ascenso, debería ser ≥0.2 mmol |
| M3 | LT2 cruise dose ladder agresiva (150% rango) | Rate limiter 2 peldaños/semana |
| M4 | ANC gate demasiado estricto (solo base_late) | Olbrecht: permitir en specific con VLamax confirmada |
| M5 | Benchmarks ciclismo sin normalizar a W/kg | Coggan/Allen: usar W/kg |
| M6 | Sprint/Olympic tri: bike=run factor | Ya arreglado en I1 |
| M7 | Docstring LT1 baseline rise desactualizado (dice +0.35, código usa +0.5) | Cosmético |

---

## COSMÉTICO del API audit (5)

| # | Issue |
|---|-------|
| K1 | `coach_id` falta en tipo TypeScript de Athlete |
| K2 | `dose_step_override` falta en tipo TS de PlannedSession |
| K3 | `swapped_template_id` falta en tipo TS de PlannedSession |
| K4 | 2 endpoints legacy `/reports/*` sin uso |
| K5 | Endpoint `reasoning-interpretation` inalcanzable |

---

## Resumen por prioridad

| Prioridad | Count | Arreglados |
|-----------|-------|------------|
| LIMITACIÓN DOC. | 3 | 0 (herramientas para coach, no motor automático) |
| IMPORTANT | 10 | 1 (I1: race factors) |
| CRASH | 1 | 0 |
| IMPLAUSIBLE | 3 | 0 |
| DESIGN GAP | 5 | 0 |
| SILENT BUG | 6 | 0 |
| MINOR | 7 | 1 (M6: = I1) |
| COSMÉTICO | 5 | 0 |
| **TOTAL** | **40** | **2** |

---

*Archivos fuente:*
- `docs/audits/science-audit.md` — auditoría científica completa
- `docs/audits/api-contract-audit.md` — auditoría API backend↔frontend
- `docs/audits/stress-test-results.md` — stress test 10 perfiles extremos
