# Criterios de Examen — Auditoria v1.2

23 criterios organizados en 6 modulos. Cada criterio tiene:
- Que se verifica (assertion concreta)
- Por que importa (evidencia o logica)
- Que atletas lo estresan

---

## Modulo 1: Motor de curvas de lactato (analytics.py)

### E01 — Deteccion LT1 coherente
- **Assert:** LT1.lactate < LT2.lactate SIEMPRE (B2 gate)
- **Assert:** LT1 pace > LT2 pace (mas lento = menor intensidad)
- **Assert:** Si 3 metodos dan resultado, agreement > 0.4
- **Atletas:** R01-R08, C09-C15, S16-S20

### E02 — Robustez ante ruido y outliers
- **Assert:** Outlier (>p90*1.3 o >7.0) NO desplaza LT1 ni LT2
- **Assert:** Con 3-4 puntos, confidence <= 0.60 (P6 cap)
- **Assert:** El sistema no crashea con ninguna curva (incluidas inversas y ruidosas)
- **Atletas:** R04, E31, E32, E33, E36, S18, C14

### E03 — Umbrales REAL con gates conservadores
- **Assert:** Si monotonicity < 0.60, real_thresholds = None
- **Assert:** Si agreement < 0.62, real_thresholds = None
- **Assert:** Si < 5 stages, real_thresholds = None
- **Assert:** Cuando REAL pasan, LT1_real.lactate < LT2_real.lactate
- **Atletas:** R01(deberia pasar), E33(deberia fallar), R04(deberia fallar)

### E04 — Zonas 5-zona ordenadas y ancladas
- **Assert:** Z1 < Z2 < Z3 < Z4 < Z5 en pace/power/HR (si disponible)
- **Assert:** Z3 boundaries = [LT1, LT2] exactamente
- **Assert:** Z4 upper = LT2 * 1.05
- **Assert:** Con solo HR (sin pace/power), zonas en HR validas
- **Atletas:** Todos los que tienen test. E35(solo pace).

### E05 — Suavizado endpoints
- **Assert:** |smooth(values)[0] - values[0]| / values[0] < 0.05
- **Assert:** |smooth(values)[-1] - values[-1]| / values[-1] < 0.05
- **Assert:** smooth preserva monotonicity de curvas monotónicas
- **Atletas:** Validacion directa de la funcion _smooth().

---

## Modulo 2: Motor dinamico (dynamic_threshold_engine.py)

### E06 — Multi-sesion coherente
- **Assert:** Con 2+ tests, threshold dinamico esta entre min y max de tests individuales
- **Assert:** No hay extrapolacion (threshold fuera del rango de datos observados)
- **Atletas:** R03, C13, T30, P38, P39

### E07 — Outlier LOO funcional
- **Assert:** Punto con residual > 1.0 mmol recibe penalizacion (weight < 0.30)
- **Assert:** El threshold sin vs con el outlier difiere < 10% (el outlier no domina)
- **Atletas:** R04, E32

### E08 — Decaimiento temporal
- **Assert:** Test de hace 60d tiene weight < 0.15 (exp(-60/18) ~ 0.036)
- **Assert:** Test reciente (< 7d) tiene weight > 0.65
- **Assert:** Con 2 tests (viejo + nuevo), el threshold se acerca mas al nuevo
- **Atletas:** S20, R07, T28, P38(test 1 viejo)

### E09 — Progresion real reflejada
- **Assert:** Si test 2 mejora vs test 1, threshold dinamico mejora
- **Assert:** Si test 3 empeora, threshold se acerca al peor (recency)
- **Atletas:** R03(mejora), R07(regresion), P38(mejora-meseta-mejora)

---

## Modulo 3: Motor fisiologico (physiological_engine.py)

### E10 — Seleccion de bloque coherente con perfil
- **Assert:** base_early → SIEMPRE AEC
- **Assert:** trained + VLamax low + short event + base_late → ANC
- **Assert:** competitive + pre_comp + short event → ANP
- **Assert:** competitive + pre_comp + long event → competition_specific
- **Assert:** thin_ice (low aerobic + high VLamax) → SIEMPRE AEC
- **Atletas:** C15(base_early→AEC), T29(high VLamax→AEC no ANC), C14(ANP),
  R01(comp_specific), T24(sprint tri→ANP o AEP)

### E11 — Fase de temporada correcta
- **Assert:** 30+ semanas → base_early (recreational)
- **Assert:** 8 semanas → pre_comp (competitive) o specific (trained)
- **Assert:** < 3 semanas → taper
- **Atletas:** Todos (cada uno tiene semanas al objetivo)

### E12 — CapacityProfile coherente
- **Assert:** VLamax proxy coherente con ratio LT1/LT2
- **Assert:** Ratio > 0.87 → VLamax "low"
- **Assert:** Ratio < 0.79 → VLamax "high"
- **Assert:** VO2max estimado en rango plausible (25-90 ml/kg/min)
- **Assert:** Fractional utilization 0.55-0.98
- **Atletas:** R01(diesel), C14(glycolytic), R05(BUG: ratio bajo != VLamax high)

### E13 — Warnings y contradicciones
- **Assert:** Datos >56d → W_STALE_DATA_MILD o CRITICAL
- **Assert:** Confidence < 0.55 → W_LOW_CONFIDENCE
- **Assert:** Ratio > 0.95 o < 0.50 → W_IMPLAUSIBLE_RATIO
- **Assert:** Sin target → W_NO_TARGET
- **Atletas:** S20(stale), R04(low confidence), R05(ratio bajo)

### E14 — suggest_athlete_level() coherente
- **Assert:** Atleta con LT2 en rango competitive → sugiere competitive
- **Assert:** Atleta recreational con LT2 bajo → sugiere recreational
- **Assert:** Confidence alta cuando datos claros, baja cuando ambiguos
- **Assert:** evidence list no vacia
- **Atletas:** R01(competitive), R06(sin datos→no suggestion), T26(diferente por disciplina)

---

## Modulo 4: Mesociclos y prescripcion (mesocycle_prescription.py + workout_library.py)

### E15 — Wave principle respetado
- **Assert:** Secuencia 4 semanas = [load, build, build_peak, recovery]
- **Assert:** build_peak tiene dose_step >= build
- **Assert:** recovery tiene carga menor que load
- **Assert:** load_type labels: acumulacion, construccion, carga_maxima, descarga
- **Atletas:** Todos los que generan mesociclo

### E16 — Dose ladder monotónico
- **Assert:** Para cada template con ladder, step[i].total_useful_time_min <= step[i+1].total_useful_time_min
- **Assert:** O step[i].intensity_zone <= step[i+1].intensity_zone (si cambia zona)
- **Validacion:** Sobre TODOS los templates, no solo los usados

### E17 — Spacing y fatiga
- **Assert:** Sesiones con requires_fresh=True no estan dia despues de fatigue_cost >= 4
- **Assert:** Sesiones KEY separadas >= 2 dias
- **Assert:** No hay familias incompatibles en dias adyacentes
- **Atletas:** Todos los que generan mesociclo con >= 3 sesiones/semana

### E18 — Prescripcion completa
- **Assert:** Toda sesion planificada tiene: scheduled_date, dose_prescription,
  selection_reason, template_id
- **Assert:** dose_prescription no es string vacio
- **Assert:** selection_reason menciona logica (peldano, wave, perfil)
- **Atletas:** Todos los que generan mesociclo

---

## Modulo 5: Prediccion de rendimiento (prediction_engine.py)

### E19 — Prediccion realista vs benchmarks
- **Assert:** Runner competitive LT2 @ 3:20/km → maraton predicho 2:25-2:50
- **Assert:** Runner recreational LT2 @ 6:00/km → maraton predicho > 4:30
- **Assert:** Banda de incertidumbre crece con distancia (5K < 10K < HM < M)
- **Atletas:** R01(elite marathon), E37(inalcanzable), F42(VLamax alta marathon)

### E20 — VLamax impact en prediccion
- **Assert:** Mismo LT2, VLamax alta vs baja → maraton difiere > 5%
- **Assert:** Para 5K, VLamax impacto < 3% (sensibilidad 0.03)
- **Assert:** Glycogen risk HIGH cuando VLamax > 0.45 y distancia >= HM
- **Atletas:** F42(VLamax alta marathon), R01(diesel marathon)

### E21 — Sanity check ratio_to_lt2
- **Assert:** Pace predicho / LT2 pace dentro de rangos por distancia
- **Assert:** Si fuera de rango, el sistema lo clampea (no da resultados absurdos)
- **Atletas:** Todos los que tienen prediccion

---

## Modulo 6: Coherencia cross-modulo (pipeline end-to-end)

### E22 — Pipeline completo sin crashes
- **Assert:** Para los 42 atletas, el pipeline lactato→thresholds→zones→block→mesociclo
  se ejecuta sin excepciones
- **Assert:** Ningun campo critico es None cuando hay datos suficientes
- **Assert:** Campos opcionales son None (no crash) cuando datos insuficientes
- **Atletas:** TODOS (42)

### E23 — Coherencia logica end-to-end
- **Assert:** Atleta que mejora LT2 → bloque siguiente es mas avanzado (o mismo)
- **Assert:** Atleta con datos stale → warnings presentes
- **Assert:** Atleta sin datos → no se generan predicciones (graceful None)
- **Assert:** VLamax proxy coherente entre disciplinas del mismo atleta (±0.15)
- **Assert:** Zonas de un atleta no se solapan (Z1 < Z2 < Z3 < Z4 < Z5)
- **Assert:** Si objetivo es inalcanzable, prediccion lo refleja (pace predicho >> target pace)
- **Atletas:** TODOS, con enfasis en T21(cross-discipline), E37/F41/F42(inalcanzable),
  R06(sin datos)

---

## Resumen: 23 criterios x 42 atletas

| Modulo | Criterios | Assertions estimadas |
|--------|-----------|---------------------|
| Curvas de lactato | E01-E05 | ~120 |
| Motor dinamico | E06-E09 | ~60 |
| Motor fisiologico | E10-E14 | ~100 |
| Mesociclos | E15-E18 | ~80 |
| Prediccion | E19-E21 | ~50 |
| Coherencia | E22-E23 | ~200 |
| **TOTAL** | **23** | **~610** |
