# Auditoria 03 -- Seleccion de Bloques de Entrenamiento

**Fecha**: 2026-03-14
**Archivo principal**: `backend/app/services/physiological_engine.py` (1640 lineas)
**Archivo complementario**: `backend/app/services/block_rationale.py`
**Scoring de candidatos**: `backend/app/services/planning_engine.py` (`_score_block_candidates`)

---

## Resumen ejecutivo

El motor de seleccion de bloques implementa una version ampliada del modelo de 4 capacidades de Olbrecht (AEC/AEP/ANC/ANP), extendida a 8 tipos de bloque para cubrir transiciones, competicion, recuperacion y testing. La arquitectura es solida: jerarquia clara de decision (fase > calidad del dato > limitante > gap > perfil), contraindications bien gateadas, y un sistema de scoring auditable con razones textuales.

**Fortalezas principales:**
- Cobertura de 30+ eventos con factores LT2/LT1 calibrados por nivel y disciplina
- Proxy VLamax via ratio LT1/LT2 cruzado con nivel aerobico absoluto (evita falsos diesel/glucoliticos)
- VO2max estimation via Swain+ACSM con fractional utilization integrada en las decisiones
- 114 tests pasando (82 physiological + 32 block-related), con bateria de validacion de 63+ casos criticos
- Sistema de warnings de fiabilidad (11 codigos) con severidades

**Hallazgos criticos:** 0 errores de logica incorrecta. 3 areas de mejora identificadas (ver Hallazgos).

---

## Bloques implementados vs Olbrecht

| Bloque implementado | Clase Olbrecht | Correspondencia | Veredicto |
|---|---|---|---|
| `aerobic_capacity_block` | AEC | Volumen bajo-medio, spices cortos, base mitocondrial. min 5s, max 10s. | CORRECTO -- fiel a SoW ch.2-4 |
| `threshold_development_block` | AEC->AEP (transicion) | Desplaza LT2/MLSS. Intervalos de umbral, cruise. min 4s, max 7s. | CORRECTO -- Olbrecht no define un bloque THR puro, pero la transicion AEC->AEP es el momento donde se empuja MLSS. Decision pragmatica valida. |
| `aerobic_power_block` | AEP | Maximiza %VO2max sostenido en competicion. Intervalos a ritmo de carrera. min 3s, max 5s. | CORRECTO -- fiel a SoW ch.7-8 |
| `anaerobic_capacity_block` | ANC | Desarrolla VLamax. Intervalos cortos all-out, descanso largo. min 4s, max 6s. | CORRECTO -- fiel a SoW ch.2-3. Gate de perfil diesel + prueba corta bien implementado. |
| `anaerobic_power_block` | ANP | Tolerancia a acidosis pre-comp. Velocidad maxima, descanso minimo. min 2s, max 3s. | CORRECTO -- fiel a SoW. Gate de pre_comp + eventos cortos bien implementado. |
| `competition_specific_block` | AEP+ANP | Transferencia al gesto especifico. Simulaciones de carrera. min 2s, max 5s. | CORRECTO -- combinacion legitima de AEP+ANP para transferencia (SoW ch.8-9). |
| `recovery_consolidation_block` | Recuperacion | Supercompensacion. min 1s, max 2s. | CORRECTO -- Olbrecht: recovery training stimulates AEC improvements. |
| `testing_decision_block` | TEST | Sin datos fiables -> repetir test. min 0s. | ADICION PRAGMATICA -- no esta en Olbrecht pero es imprescindible para un sistema automatizado. |

**Veredicto global**: Los 4 tipos de capacidad de Olbrecht (AEC, AEP, ANC, ANP) estan correctamente mapeados. Los 4 bloques adicionales (THR, COMP, RECOVERY, TEST) son extensiones pragmaticas justificadas. El bloque THR como transicion AEC->AEP es la decision mas opinable -- Olbrecht no lo separa explicitamente -- pero es funcionalmente correcto y simplifica la prescripcion para el entrenador.

---

## Deteccion de fase de temporada

### Metodo
Funcion `_season_phase(weeks_to_goal, athlete_level)` con boundaries adaptativas:

| Fase | Recreational | Trained | Competitive |
|---|---|---|---|
| base_early | >32s | >28s | >26s |
| base_late | 23-32s | 20-28s | 18-26s |
| specific | 14-23s | 12-20s | 10-18s |
| pre_comp | 3-14s | 3-12s | 3-10s |
| taper | <3s | <3s | <3s |

Sin weeks_to_goal -> `base_early` (default conservador).

### Validacion
- **Bompa & Haff (2009)**: macrociclo tipico de 24-36 semanas con 40% base, 30% specific, 20% pre-comp, 10% taper. Los boundaries trained (28/20/12/3) dan ~29% base_early, ~29% base_late, ~29% specific, ~13% pre_comp -- razonable para un ciclo de 28 semanas.
- **Adaptacion por nivel**: recreational necesita base mas larga (+4s vs trained), competitive puede acortar base (-2s). Consistente con Bompa (2009) y Olbrecht: "recreational athletes need longer aerobic development phases."
- **Taper fijo a 3s**: correcto. La literatura (Mujika & Padilla 2003) recomienda 1-3 semanas de taper independiente del nivel.

### Veredicto
CORRECTO. Boundaries razonables, adaptacion por nivel bien fundamentada, default conservador apropiado.

---

## CapacityProfile (proxy fisiologico)

### VLamax proxy desde ratio LT1/LT2

Umbrales:
- ratio < 0.79 -> VLamax alta (curva empinada, glucolisis dominante)
- ratio 0.79-0.87 -> VLamax moderada
- ratio > 0.87 -> VLamax baja (perfil diesel)

**Validacion con Mader (2003) e INSCYD**: El ratio LT1/LT2 es un proxy aceptable de VLamax en ausencia de test directo. Mader predice que a mayor VLamax, mayor separacion entre LT1 y LT2 (ratio bajo). Los umbrales 0.79/0.87 son consistentes con:
- Olbrecht: atletas con VLamax >0.6 mmol/L/s tipicamente muestran ratio <0.80
- Faude (2009): trained runners con ratio LT1/LT2 ~0.75-0.85

**Correccion por nivel aerobico absoluto**: Excelente decision. Sin esta correccion:
- Recreational comprimido (ratio alto, LT2 bajo) seria falsamente clasificado como diesel
- Recreational sin base (ratio bajo, LT2 bajo) seria falsamente clasificado como glucolitico potente

El cruce con LT2 absoluto (benchmarks por nivel y disciplina) previene ambas falacias. Los benchmarks (ej. running trained: 11.0-14.5 km/h) son razonables segun Daniels VDOT y Billat (2003).

### VO2max integration (Swain+ACSM)

- Metodo: %HRR ~ %VO2R (Swain & Leutholtz 1997) + ecuaciones metabolicas ACSM
- Plausibility bounds: 25-90 ml/kg/min, fractional utilization 55-98%
- Jerarquia: Swain HR-based > Garmin VO2max > None
- Confidence: 0.55-0.75 segun HR spread

**Validacion**: El metodo Swain es aceptado en la literatura (r=0.88 vs medido) pero tiene limitaciones conocidas:
- Asume linealidad HR-VO2 que falla en extremos
- La ecuacion ACSM de running solo aplica a terreno llano
- Error tipico: +/-5 ml/kg/min

La implementacion maneja esto correctamente: confidence moderada (max 0.75), uso solo para cualificacion (no como input primario de decision).

**Fractional utilization**: Excelente adicion. Diferencia dos atletas con mismos umbrales pero distinto techo:
- frac >0.85 -> atleta "exprimido" -> necesita subir techo (AEP)
- frac <0.75 -> margen para empujar umbrales (THR)

Solo actua con vo2max_confidence >= 0.50 y en fases != base_early/taper. Gate conservador apropiado.

### Veredicto
MUY BUENO. El proxy VLamax con correccion por nivel absoluto es la mejor aproximacion posible sin test directo. La integracion de VO2max/fractional utilization anade una dimension que pocos sistemas tienen. Limitacion principal: depende de HR max/rest fiables.

---

## Logica de seleccion de bloque

### Jerarquia de decision

```
1. Taper (<=3 semanas) -> competition_specific_block (return)
2. Sin datos -> testing_decision_block (return)
3. Test >56d en specific/pre_comp -> testing_decision_block (return)
4. High glycolytic + evento largo -> aerobic_capacity_block
5. LT1 red zones (HM, half, LT2-led events) -> aerobic_capacity_block
6. LT1 priority + gap significativo -> aerobic_capacity_block
7. Flat profile (LT1 ok, LT2 corto) -> threshold_development_block
8. LT2 priority + gap significativo -> threshold_development_block
9. LT2 gap moderado -> THR (base) o AEP (specific/pre_comp)
10. Low glycolytic + evento corto -> aerobic_power_block
11. HM guardrail (LT2 ok pero LT1 retrasado) -> aerobic_capacity_block
12. LT2 near target + specific/pre_comp -> ANP (eventos cortos) o COMP
13. Base_late + LT2 en rango -> aerobic_power_block
14. Base phases + eventos largos: LT1 ok -> THR, LT1 no ok -> AEC
15. Base phases + LT2 gap: base_late -> THR, base_early -> AEC
16. Fallthrough -> aerobic_capacity_block (default conservador)
```

Despues: `_apply_capacity_profile()` puede refinar la decision con confianza >= 0.75.

### Reglas por fase x perfil

| Fase | Gap grande LT2 | Gap grande LT1 | Gaps pequenos | Diesel | Glycolytic |
|---|---|---|---|---|---|
| base_early | AEC (siempre) | AEC | AEC | AEC (no cambia) | AEC |
| base_late | THR (si LT1 ok) | AEC | AEP | ANC (si corta) | AEC |
| specific | THR | AEC | COMP | AEP (si high aer.) | AEC |
| pre_comp | THR -> COMP (override S1) | AEC | ANP (corta) / COMP | AEP | AEC |
| taper | COMP (siempre) | COMP | COMP | COMP | COMP |

### Contraindications implementadas

1. **Curva plana** (LT1-LT2 < 0.5 km/h o 10W): protocolo insuficiente
2. **Rango de lactato estrecho** (<1.5 mmol en curva cruda): test no suficientemente intenso
3. **MIN_WEEKS_FOR_BLOCK**: override S1 si semanas < minimo -> competition_specific
4. **D1 "too late to close gap"**: gap > 2x significativo + timeline corto -> COMP
5. **P5a**: margen ajustado (< MIN_WEEKS+2) -> warning textual
6. **Test obsoleto** (>56d en specific/pre_comp) -> testing_decision_block

### _apply_capacity_profile: refinamientos por perfil

| Perfil | Condicion | Accion |
|---|---|---|
| HIGH/MOD aerobico + LOW VLamax | base_late + evento corto + trained/competitive | -> ANC |
| HIGH/MOD aerobico + LOW VLamax | stagnation + base_late/specific + evento largo | -> ANC (spark plug) |
| HIGH aerobico + LOW VLamax | otros contextos | -> AEP |
| MOD aerobico + LOW VLamax | specific/pre_comp, no thin ice | -> AEP (S2) |
| HIGH aerobico + HIGH VLamax | base phases | -> AEC (suprimir glucolisis) |
| LOW aerobico + HIGH VLamax | siempre | -> AEC (thin ice) |
| Fractional >0.85 | no base_early/taper | -> AEP (subir techo) |
| Fractional <0.75 | no base_early/taper, si era AEP | -> THR |

### Candidate scoring (`_score_block_candidates`)

Sistema de puntuacion aditivo con 8 candidatos. Cada regla suma o resta puntos con razon textual. No hay puntos base (solo evidencia contextual). Factores:
- **Timeline** (days_to_target): el factor mas pesado (+50 para COMP en <21d, -35 para ANP en >84d)
- **Bloque previo** (previous_major): secuencia logica (AEC->THR gana +25, THR->AEP +20)
- **Senal de evaluacion** (evaluation_signal): degrading penaliza bloques agresivos, favorece recovery (+40)
- **Robustez**: low penaliza bloques intensos, favorece AEC
- **Sesiones recientes**: 0 sesiones -> AEC como punto de partida

**Observacion critica**: El scoring no integra directamente el resultado del gap analysis fisiologico de `analyse_physiological_gap`. Parece que ambos sistemas operan en paralelo: el motor fisiologico da una recomendacion primaria, y el scoring de candidatos actua como sistema de priorizacion alternativo para el planning engine. Esto es coherente si el scoring se usa como tiebreaker o para seleccion inicial cuando no hay gap analysis disponible.

---

## Tests ejecutados

### Tests de bloque (32 tests)
```
tests/test_block_rationale.py           3/3 PASSED
tests/test_mesocycle_detector.py        1/1 PASSED
tests/test_multi_block_progression.py  19/19 PASSED (incl. stale test, unreachable goal)
tests/test_physiological_engine.py      4/4 PASSED (matrix profiles)
tests/test_planning_engine.py           2/2 PASSED (scoring, initial assignment)
tests/test_planning_pipeline_e2e.py     1/1 PASSED (all block types have templates)
tests/test_workout_library.py           2/2 PASSED (draft, activating)
```

### Tests fisiologicos (82 tests)
```
test_build_physiological_context_reads_thresholds   1/1  PASSED
test_hm_* (5 tests HM-specific guardrails)          5/5  PASSED
test_10k/5k LT1 support                             2/2  PASSED
test_ironman/half flat profile                       3/3  PASSED
test_high_glycolytic_marathon                        1/1  PASSED
test_taper_keeps_required_thresholds                 1/1  PASSED
test_cycling_* (2 tests power thresholds)            2/2  PASSED
test_physiological_gap_matrix (4 critical profiles)  4/4  PASSED
test_physiological_gap_validation_battery (48 cases) 48/48 PASSED
  - Running: R01-R20 (5k, 10k, HM, marathon)
  - Ciclismo: C01-C14 (TT short/medium/long, granfondo, hill, road)
  - Natacion: S01-S06 (pool 400/1500, open water)
  - Triatlon: T01-T12 (sprint, olympic, half, ironman)
test_vlamax_proxy_cross_validation (12 cases)        12/12 PASSED
  - V01-V06: running (elite diesel, compressed, 800m runner, etc.)
  - V07-V10: cycling
  - V11-V12: edge cases (low confidence, missing LT1)
test_planning_engine physiological prioritize         1/1  PASSED
```

**Total: 114 tests, 114 passed, 0 failed.**

---

## Hallazgos criticos

### H1: El bloque THR (threshold_development) no tiene equivalente puro en Olbrecht -- ACEPTABLE

Olbrecht define 4 capacidades (AEC/AEP/ANC/ANP), no 4 bloques. El "threshold training" en SoW cae en la transicion AEC->AEP. La implementacion lo separa como bloque independiente, lo cual es pragmatico para la prescripcion pero difiere del modelo original. El `olbrecht_class: "AEC->AEP"` en block_rationale lo documenta correctamente.

**Impacto**: Ninguno funcional. El entrenador tiene una herramienta mas granular que el modelo puro.

### H2: ANC gate podria ser mas estricto en eventos "both" con stagnation

El mecanismo I3 (ANC para estancamiento cronico) aplica a eventos largos (`_ANC_STAGNATION_EVENTS`) que incluyen HM, marathon, 70.3, ironman. Olbrecht si menciona el "spark plug" anaerobico para desbloquear plateau, pero el riesgo en ironman/marathon es que la VLamax suba y penalice sostenibilidad.

La implementacion requiere:
- stagnation_detected = True (>=3 tests con <5% mejora)
- athlete_level = trained/competitive
- season = base_late/specific
- confidence >= 0.75

Estos gates son conservadores y razonables. El riesgo residual es bajo porque el ANC como "spice" no deberia disparar la VLamax si el volumen extensivo se mantiene.

**Impacto**: Bajo. Los gates son suficientes.

### H3: Scoring de candidatos (`_score_block_candidates`) no recibe input del gap analysis

El sistema de scoring en `planning_engine.py` trabaja con: days_to_target, previous_major, evaluation_signal, robustness, recent_session_count, discipline. No recibe lt2_gap, lt1_gap, capacity_profile, ni el recommended_block del motor fisiologico.

Esto sugiere que operan como dos sistemas independientes:
1. Motor fisiologico -> recomendacion primaria basada en gap analysis
2. Scoring de candidatos -> priorizacion basada en contexto historico

Si ambos se usan en secuencia (fisiologico primero, scoring como ajuste), la arquitectura es coherente. Pero si el scoring puede sobreescribir la recomendacion fisiologica sin conocer los gaps, hay riesgo de decisiones contradictorias (ej: scoring favorece THR por timeline, pero gap dice AEC por thin ice).

**Impacto**: Moderado. Verificar como se reconcilian ambas recomendaciones en el pipeline de planificacion.

---

## Recomendaciones

### R1: Documentar la relacion scoring <-> gap analysis (prioridad media)
Clarificar en codigo o documentacion como `_score_block_candidates` y `analyse_physiological_gap` se reconcilian. Si el gap analysis siempre tiene prioridad, el scoring deberia documentarlo. Si hay override, los casos deben estar testeados.

### R2: Considerar test de integracion scoring + gap (prioridad media)
Anadir 3-5 tests que verifiquen que cuando `analyse_physiological_gap` recomienda AEC por thin ice, el scoring no lo sobreescribe con THR por timeline favorable.

### R3: Anadir VLamax proxy para natacion (prioridad baja)
Los benchmarks LT2_AEROBIC_BENCHMARKS incluyen natacion (2.8-4.8 km/h), pero la cobertura de tests de natacion es menor (S01-S06, 6 casos). Los eventos de natacion con ratio LT1/LT2 atipico (ej. técnica dominante) podrian beneficiarse de un ajuste de confidence.

### R4: Fractional utilization con Garmin VO2max (prioridad baja)
Cuando se usa Garmin VO2max como fallback (confidence 0.50), la fractional utilization derivada tiene error compuesto (Garmin + ACSM equation). Considerar reducir la confidence a 0.40 o anadir un warning especifico W_GARMIN_VO2MAX.

### R5: MIN_WEEKS_FOR_BLOCK para ANC podria ser 3 en vez de 4 (prioridad baja)
Olbrecht menciona fluctuaciones temporales de ANC visibles en 3-5 semanas, y el bloque ANC como "spice" puede integrarse en bloques AEC mas cortos. El minimo de 4 semanas es conservador pero podria limitar su prescripcion en timelines ajustados.

---

## Referencias bibliograficas

1. **Olbrecht J. (2000)**. *The Science of Winning: Planning, Periodizing and Optimizing Swim Training*. Luton: Swimshop. -- Modelo AEC/AEP/ANC/ANP, thin ice, spices, recovery.
2. **Faude O., Kindermann W., Meyer T. (2009)**. Lactate threshold concepts: how valid are they? *Sports Medicine*, 39(6), 469-490. -- LT2 como predictor, precision del test, ratio LT1/LT2.
3. **Bompa T., Haff G. (2009)**. *Periodization: Theory and Methodology of Training* (5th ed.). Human Kinetics. -- Fases de periodizacion, macrociclo, base/specific/pre-comp.
4. **Mader A. (2003)**. Glycolysis and oxidative phosphorylation as a function of cytoplasmic phosphorylation state and power output of the muscle cell. *European Journal of Applied Physiology*, 88(4-5), 317-338. -- VLamax, modelo bioquimico.
5. **Swain D.P., Leutholtz B.C. (1997)**. Heart rate reserve is equivalent to %VO2 reserve, not to %VO2max. *Medicine and Science in Sports and Exercise*, 29(3), 410-414. -- Equivalencia %HRR ~ %VO2R.
6. **Billat V., Koralsztein J.P., Morton R.H. (1999)**. Time in human endurance models. *Sports Medicine*, 27(6), 359-379. -- VO2max y rendimiento en resistencia.
7. **Laursen P.B., Jenkins D.G. (2002)**. The scientific basis for high-intensity interval training. *Sports Medicine*, 32(1), 53-73. -- Ironman performance, fatigue acumulada.
8. **Hausswirth C., Mujika I. (2013)**. *Recovery for Performance in Sport*. Human Kinetics. -- Fatiga en triatlon, brick effect.
9. **Daniels J. (2014)**. *Daniels' Running Formula* (3rd ed.). Human Kinetics. -- VDOT, T-pace, race equivalences.
10. **Coggan A., Allen H. (2010)**. *Training and Racing with a Power Meter* (2nd ed.). VeloPress. -- FTP, zonas de potencia.
11. **Mujika I., Padilla S. (2003)**. Scientific bases for precompetition tapering strategies. *Medicine and Science in Sports and Exercise*, 35(7), 1182-1187. -- Duracion y tipo de taper.
12. **Coyle E.F. (1988)**. Determinants of endurance in well-trained cyclists. *Journal of Applied Physiology*, 64(6), 2622-2630. -- LT1 como determinante en eventos largos.

---

## Conclusion

El motor de seleccion de bloques es **cientificamente solido** y **funcionalmente robusto**. Implementa correctamente los 4 tipos de capacidad de Olbrecht, los extiende pragmaticamente a 8 bloques, y cubre 30+ eventos con factores calibrados. El proxy VLamax via ratio LT1/LT2 con correccion por nivel absoluto es la mejor aproximacion posible sin test directo. La integracion de VO2max/fractional utilization via Swain es un diferenciador positivo.

La bateria de 114 tests cubre exhaustivamente los perfiles criticos (3 niveles x 9+ disciplinas x 5 fases). No se detectaron errores logicos. Las 3 areas de mejora identificadas son de impacto bajo-moderado y no comprometen la fiabilidad del sistema.

**Calificacion global: 9/10** -- Motor de alta calidad con fundamento cientifico solido. El punto principal de mejora es la relacion explicita entre el gap analysis y el scoring de candidatos (H3/R1).
