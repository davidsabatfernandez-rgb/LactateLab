# Auditoría Científica v1.1 — Motor Fisiológico de Selección de Bloques

**Archivo auditado:** `backend/app/services/physiological_engine.py`
**Archivo complementario:** `backend/app/services/block_rationale.py`
**Fecha:** 2026-03-15
**Auditor:** Claude Opus 4.6

---

## Resumen Ejecutivo

El motor fisiológico implementa un sistema de selección de mesociclo basado en el modelo de Jan Olbrecht (Science of Winning, 2000) con extensiones propias para VO2max (Swain+ACSM) y proxy de VLamax (ratio LT1/LT2). El diseño general es sólido y conservador, con safety gates razonables. Se identifican **4 hallazgos de riesgo medio**, **6 hallazgos de riesgo bajo** y **3 recomendaciones de mejora**.

**Veredicto global: APROBADO con observaciones.** No se detectan rutas de prescripción peligrosas. Las principales debilidades son: (1) el proxy LT1/LT2 para VLamax no está validado en la literatura como tal, (2) el error del VO2max estimado por Swain+ACSM es mayor de lo que la confianza asignada sugiere, y (3) los umbrales de ratio para VLamax (0.79/0.87) son invenciones propias sin respaldo directo en Mader ni Olbrecht.

---

## 1. CapacityProfile / VLamax Proxy

### 1.1 Ratio LT1/LT2 como proxy de VLamax

**Implementación:**
- Ratio > 0.87 = VLamax baja (diesel)
- Ratio 0.79-0.87 = VLamax moderada
- Ratio < 0.79 = VLamax alta (glucolítico)

**Análisis científico:**

| Aspecto | Valoración |
|---|---|
| Concepto base | PARCIALMENTE VÁLIDO |
| Rangos exactos | SIN RESPALDO DIRECTO |
| Corrección por nivel aeróbico | BUENA IDEA, sin validación |

**Detalle:**

El modelo de Mader (1984, 2003) establece que la posición de los umbrales de lactato es función de VO2max y VLamax. Esto es correcto: a igual VO2max, un atleta con mayor VLamax tendrá su LT2 a un %VO2max menor, y los umbrales estarán más separados en velocidad/potencia. INSCYD confirma esta relación: "Higher VLamax results in higher lactate production rates at sub-maximum speeds and creates a higher lactate concentration" (INSCYD whitepaper).

Sin embargo:

- **Mader 2003 no define rangos de ratio LT1/LT2.** Su modelo usa 33 ecuaciones diferenciales para simular la cinética del lactato, no ratios simples.
- **Olbrecht no define estos rangos numéricos** en Science of Winning. Su clasificación de atletas (Type I/Type II) se basa en tests de lactato con protocolo específico, no en ratios.
- **Los valores 0.79 y 0.87 son invenciones propias** del desarrollador. No se encuentran en la literatura revisada.
- **La dirección del proxy es correcta** (ratio alto = VLamax baja, ratio bajo = VLamax alta), pero la cuantificación exacta carece de validación.

**Riesgo: MEDIO.** El motor usa el ratio con confianza >= 0.75 para cambiar bloques. Si los umbrales están mal calibrados, podría prescribir ANC a un atleta que no lo necesita (o AEC cuando necesita THR).

**Mitigación actual:** La corrección por nivel aeróbico absoluto (líneas 789-798) es una buena salvaguarda que evita falsos "diesel" en recreativos con curva comprimida. Esto reduce el riesgo real.

**Recomendación:**
1. Documentar explícitamente que los rangos 0.79/0.87 son heurísticos propios, no derivados de Mader/Olbrecht.
2. Considerar validación empírica: correlacionar el ratio con VLamax medida (INSCYD o sprint test) en atletas del sistema.
3. Ampliar la zona "moderate" (ej. 0.76-0.89) para reducir falsos positivos en los extremos.

### 1.2 Corrección por nivel aeróbico absoluto

**Implementación (líneas 789-798):** Cuando `aerobic_level == "low"`, cualquier valor extremo de `raw_vlamax` se reclasifica como "moderate".

**Valoración: CORRECTO conceptualmente.** Un atleta recreativo con LT2 bajo puede tener ratio alto simplemente porque su curva está comprimida en un rango estrecho de velocidades, no porque sea "diesel". Esta corrección evita ese error.

**Observación:** La corrección es simétrica (tanto "high" como "low" se fuerzan a "moderate" cuando aerobic_level es "low"), lo cual es razonable pero podría ser demasiado agresivo. Un recreativo con ratio genuinamente bajo (0.65) probablemente SÍ tiene VLamax relativa alta.

---

## 2. VO2max Estimation (Swain + ACSM)

### 2.1 Ecuación implementada

```
Running: VO2 = 0.2 * speed(m/min) + 3.5
Cycling: VO2 = (power * 10.8 / weight) + 7.0
VO2max = (VO2_at_LT2 - 3.5) / %HRR + 3.5
```

**Análisis científico:**

| Aspecto | Valoración |
|---|---|
| Ecuación running ACSM | CORRECTA (coeficientes estándar) |
| Ecuación cycling ACSM | CORRECTA (leg ergometer equation) |
| %HRR ~ %VO2R (Swain 1997) | CORRECTO (PubMed 9139182) |
| Confianza asignada (0.55-0.75) | PROBABLEMENTE DEMASIADO ALTA |

**Detalle:**

- **Swain & Leutholtz (1997)** demostraron que %HRR es equivalente a %VO2R (no a %VO2max). La implementación usa correctamente VO2 Reserve en el denominador (línea 687: `(vo2_at_lt2 - _VO2_REST) / hrr_fraction + _VO2_REST`).

- **Error de la estimación ACSM:** La literatura muestra errores significativos:
  - SEE de 4.6-5.0 ml/kg/min en poblaciones generales
  - Sobreestimación del 14.6% en atletas (PMC3743617)
  - Error del ~15% por deflexión HR-VO2 a altas intensidades
  - En un atleta con VO2max real de 60 ml/kg/min, el error puede ser de +-7-9 ml/kg/min

- **Confianza asignada (0.55-0.75):** El motor asigna confianza basada en el HR spread (línea 700-701). Un spread de 100+ bpm da confianza 0.75. Dado el error real de +-15%, esta confianza parece optimista.

**Riesgo: MEDIO.** La fractional utilization (VO2_LT2/VO2max) se usa para cambiar bloques (líneas 1161-1179). Si el VO2max está sobreestimado un 15%, la fractional utilization se subestima, y el motor podría prescribir THR ("empujar umbral") cuando debería prescribir AEP ("subir techo").

**Mitigación actual:** El motor requiere `vo2max_confidence >= 0.50` para actuar sobre fractional utilization, y solo cambia bloques con profile confidence >= 0.75. Esto limita el impacto, pero no lo elimina.

**Recomendaciones:**
1. Reducir el techo de confianza de Swain HR a 0.65 (no 0.75). Reservar 0.75+ para VO2max medido directamente.
2. Documentar el error esperado: "+-5-9 ml/kg/min en atletas entrenados".
3. Considerar añadir la ecuación de Daniels (más precisa para running) como alternativa o cross-check.

### 2.2 Nota sobre ACSM 2021

La búsqueda web no reveló cambios en los coeficientes de las ecuaciones metabólicas entre versiones de las ACSM Guidelines. Los coeficientes 0.2 (running) y 10.8 (cycling) se mantienen desde ediciones anteriores. La edición 2021 (11th) no modifica estas ecuaciones fundamentales.

---

## 3. Los 6 Bloques Olbrecht

### 3.1 Correspondencia con Olbrecht

| Bloque en código | Clase Olbrecht | Presente en SoW | Notas |
|---|---|---|---|
| `aerobic_capacity_block` | AEC | SI | Correcto |
| `threshold_development_block` | AEC->AEP | PARCIAL | Olbrecht no define un bloque THR explícito; es una transición |
| `anaerobic_capacity_block` | ANC | SI | Correcto |
| `aerobic_power_block` | AEP | SI | Correcto |
| `anaerobic_power_block` | ANP | SI | Correcto |
| `competition_specific_block` | AEP+ANP | PARCIAL | Olbrecht combina AEP+comp, no un bloque separado |

**Análisis:**

Olbrecht define 4 tipos de entrenamiento fundamentales: AEC, AEP, ANC, ANP. Su sistema no es un conjunto de "bloques" discretos en el sentido de Issurin, sino una filosofía de periodización donde se manipulan las proporciones de cada tipo a lo largo de la temporada.

La implementación del motor traduce esto a 6 bloques discretos (+ recovery + testing), lo cual es una simplificación válida para un sistema automatizado. Las dos adiciones (THR como transición AEC->AEP, y COMP como bloque pre-carrera) son pragmáticas y razonables.

**Hallazgo: `threshold_development_block` clasificado como "AEC->AEP"** es una interpretación del desarrollador, no terminología de Olbrecht. Olbrecht diría que el trabajo de umbral es parte del continuo AEC-AEP, no una etapa separada. Sin embargo, para un sistema automatizado, esta discretización es operativamente útil.

### 3.2 Decision tree para selección de bloques

La lógica de `analyse_physiological_gap()` sigue esta jerarquía:

1. **Sin datos** -> testing_decision_block
2. **Taper** (<3 semanas) -> competition_specific_block
3. **Test obsoleto** (>56d en specific/pre_comp) -> testing_decision_block
4. **Señal glucolítica alta** + evento largo -> AEC
5. **LT1 red zone** (varias variantes) -> AEC
6. **LT2 gap > significant** (en base_late+) -> THR
7. **LT2 gap moderado** -> THR o AEP según fase
8. **LT2 en rango** + pre_comp + ANP events -> ANP
9. **LT2 en rango** + specific/pre_comp -> COMP
10. **Base phases** sin gap claro -> AEC
11. **CapacityProfile override** (diesel, thin ice, fractional util)
12. **D1 override**: gap demasiado grande + timeline corto -> COMP
13. **S1 override**: semanas insuficientes -> COMP

**Valoración: CONSERVADOR Y RAZONABLE.** El default es AEC (el bloque menos arriesgado), y cada decisión requiere evidencia positiva para saltar a un bloque más agresivo. Esto es consistente con Olbrecht: "when in doubt, build the base."

**Observación importante:** Olbrecht no prescribiría exactamente así. Su método requiere tests de lactato regulares (cada 3-4 semanas) y la decisión se toma observando la *evolución* de la curva, no un snapshot. El motor trabaja con snapshots, lo cual es una limitación inherente.

---

## 4. Safety Gates

### 4.1 ANC Gate

**Implementación:**
- `base_early` siempre da AEC (nunca ANC)
- ANC solo en `base_late` + prueba corta (_ANC_CANDIDATE_EVENTS) + VLamax baja + trained/competitive
- ANC por estancamiento (I3): base_late/specific + eventos largos + stagnation_detected

**Valoración: CORRECTO y CONSERVADOR.**

Olbrecht confirma: "ANC is important even for middle-distance athletes" pero solo cuando el perfil lo justifica. El gate de base_early es correcto: no tiene sentido desarrollar VLamax cuando la base aeróbica no existe.

El gate de recreational es discutible: Olbrecht no excluye recreativos de ANC explícitamente, pero la lógica de "necesitan base aeróbica primero" es razonable.

**El pathway I3 (ANC por estancamiento en eventos largos)** es una adición propia basada en la cita de Olbrecht sobre "spark plug". La interpretación es correcta: Olbrecht sí habla de que un mínimo de capacidad glucolítica es necesario para "activar" adaptaciones aeróbicas estancadas. Sin embargo, automatizar esta decisión es arriesgado si la detección de estancamiento es imprecisa. **Riesgo: BAJO** dado que requiere >=3 tests sin mejora.

### 4.2 ANP Gate

**Implementación:**
- Solo en `pre_comp`
- Solo para _ANP_EVENTS (5k, 10k, sprint_tri, pool_400, hill_climb, road_race)

**Valoración: CORRECTO.** Olbrecht es explícito: "sprinters and middle distance athletes concentrate on ANP in the competition training period; long distance athletes use AEP." La exclusión de eventos largos y fases tempranas es acertada.

**Observación:** El motor no incluye `road_tt_short` en _ANP_EVENTS pero sí en _ANC_CANDIDATE_EVENTS. Un TT corto (<30 min) podría beneficiarse de ANP en pre_comp. **Riesgo: BAJO** (solo pierde una oportunidad de optimización, no prescribe algo peligroso).

### 4.3 `lt2_led_lt1_red_zone` gated por ratio >= 0.75

**Implementación (líneas 1506-1518):** Solo dispara alarma de "base subumbral insuficiente" cuando el ratio LT1/LT2 < 0.75.

**Valoración: RAZONABLE.** Faude 2009 reporta que runners entrenados tienen LT1/LT2 ratios de 0.75-0.85. Usar 0.75 como suelo para "base funcional" evita alarmas falsas en atletas entrenados con gap alto por factor de carrera estricto. La fuente citada (Faude 2009) es correcta.

### 4.4 Test > 56 días -> testing_decision_block

**Implementación:** Solo dispara en `specific` y `pre_comp`.

**Valoración: RAZONABLE.** 56 días = 8 semanas. En estas fases, las adaptaciones cambian rápidamente y un test antiguo puede llevar a prescripciones erróneas. En base phases, 8+ semanas de antigüedad es menos problemático porque las adaptaciones son más lentas. La lógica de no forzar retest en base es práctica.

**Observación:** 56 días es conservador (algunos coaches retestean cada 4 semanas en específico). Pero como gate automático, 8 semanas es razonable.

### 4.5 Confianza < 0.55

**Implementación (línea 1050):** `_apply_capacity_profile` no actúa si confidence < 0.55.

**Valoración: CORRECTO.** Con interpolated thresholds (confianza ~0.40), el perfil VO2max/VLamax no es fiable. El motor deja que el gap analysis mande, lo cual es la decisión correcta.

### 4.6 Sin datos de lactato

**Implementación (líneas 1305-1327):** Si no hay LT1 ni LT2, devuelve `testing_decision_block` con `primary_limiter="no_data"`.

**Valoración: CORRECTO Y SEGURO.** No prescribe a ciegas. Esta es la ruta más segura posible.

---

## 5. Season Phases

### 5.1 Boundaries

| Nivel | base_early | base_late | specific | pre_comp | taper |
|---|---|---|---|---|---|
| Recreational | >32s | 23-32s | 14-23s | 3-14s | <3s |
| Trained | >28s | 20-28s | 12-20s | 3-12s | <3s |
| Competitive | >26s | 18-26s | 10-18s | 3-10s | <3s |

**Análisis:**

La literatura sobre periodización (Issurin 2010, Bompa 2009) establece:
- Preparación general (base): ~50-60% del macrociclo
- Preparación específica: ~20-30% del macrociclo
- Competición + taper: ~10-20%

Para un macrociclo de 40 semanas (trained):
- Base (>20s): 20 semanas = 50% -- CORRECTO
- Specific (12-20s): 8 semanas = 20% -- CORRECTO
- Pre_comp (3-12s): 9 semanas = 22.5% -- CORRECTO
- Taper (<3s): 3 semanas = 7.5% -- CORRECTO

**Valoración: RAZONABLE.** Las proporciones están dentro de los rangos aceptados en la literatura. La adaptación por nivel (recreational con base más largo, competitive con base más corto) es consistente con Olbrecht y con la lógica fisiológica: recreativos necesitan más tiempo de construcción aeróbica.

**Observación:** Estas boundaries asumen un objetivo único con macrociclo lineal. No modelan doble/triple pico ni periodización ondulante. Esto es una limitación, no un error.

**Hallazgo:** El taper de <3 semanas para todos los niveles es quizás corto para Ironman (donde se recomiendan 2-3 semanas de taper). Pero el motor compensa porque `competition_specific_block` ya reduce volumen.

---

## 6. Block Rationale

### 6.1 BLOCK_RATIONALE dict

| Bloque | Precisión científica | Notas |
|---|---|---|
| AEC | EXCELENTE | Citas de Olbrecht sobre spices y detraining son correctas. Dudley 1982 bien referenciado. |
| THR | BUENA | Faude 2009 correctamente citado. La cita de Olbrecht "thin ice" está en el contexto correcto. |
| AEP | BUENA | La distinción capacity vs power es Olbrecht puro. |
| ANC | BUENA | Olbrecht checklist (25-50m, casi máximo, descanso doble) es correcto para natación. Para running las duraciones (15-60s) son apropiadas. La nota sobre "cambios innatos 6-18 meses" es correcta. |
| ANP | BUENA | "Effects in 10-17 days" y "2x2 weeks" son citas fieles de Olbrecht. |
| COMP | BUENA | Hausswirth & Mujika 2013 es la referencia correcta para triatlón. |
| Recovery | CORRECTA | "Mitocondrias se pierden a partir de 5-7 días" es consistente con Mujika & Padilla 2000. |
| Testing | CORRECTA | Pragmática, no requiere validación científica. |

**Valoración global: MUY BUENA.** Los rationale son precisos, las citas son verificables, y el lenguaje está orientado al entrenador.

### 6.2 Duraciones min/max de bloques

| Bloque | min_weeks | max_weeks | Evidencia |
|---|---|---|---|
| AEC | 5 | 10 | Olbrecht: 6-8 semanas para adaptaciones mitocondriales. 5 semanas como mínimo es razonable. |
| THR | 4 | 7 | Faude 2009: 3-5 semanas para desplazamiento medible de LT2. 4 como mínimo es conservador. |
| ANC | 4 | 6 | Olbrecht: cambios temporales en 3-5 semanas. 4 como mínimo es correcto. |
| AEP | 3 | 5 | Olbrecht: AEP solo unas pocas semanas. 3-5 es correcto. |
| ANP | 2 | 3 | Olbrecht: "effects in 10-17 days". 2-3 semanas es correcto. |
| COMP | 2 | 5 | 2-4 semanas es lo habitual en la literatura. 5 como máximo es generoso. |
| Recovery | 1 | 2 | Mujika 2000: detraining real empieza a 5-7 días. 1-2 semanas es correcto. |

**Valoración: CORRECTA.** Todas las duraciones están dentro de rangos aceptados.

### 6.3 Reliability Warnings (W_* codes)

| Warning | Umbral | Valoración |
|---|---|---|
| W_INTERPOLATED_THRESHOLDS | conf ~0.60 | Correcto: interpolados son poco fiables |
| W_LOW_CONFIDENCE | conf < 0.75 | Correcto: perfil no opera completamente |
| W_STALE_DATA_MILD | 43-56 días | Razonable (6-8 semanas) |
| W_STALE_DATA_CRITICAL | >56 días + specific/pre_comp | Correcto |
| W_BORDERLINE_GAP | +-15% del umbral | Razonable dada la precisión de tests de campo |
| W_INSUFFICIENT_WEEKS | <min_weeks+2 | Conservador y correcto |
| W_NO_TARGET | sin objetivo | Correcto: sin gap analysis real |
| W_PROFILE_UNCERTAIN | conf < 0.55 | Correcto |
| W_NO_LT1 | sin LT1 + evento lt1-led | Correcto. Laursen 2002 correctamente citado. |
| W_IMPLAUSIBLE_RATIO | <0.50 o >1.05 | Correcto: fuera de rango fisiológico |

**Valoración: EXCELENTE.** Sistema de warnings completo y bien calibrado. Los umbrales son razonables y las severidades están correctamente asignadas.

---

## 7. LT2_RACE_FACTOR

### 7.1 Verificación contra literatura

| Distancia | Nivel | Factor impl. | Literatura | Fuente | Valoración |
|---|---|---|---|---|---|
| 5k trained | 0.96 | ~0.95-0.98 | Daniels VDOT: T-pace ~ 5k pace para trained | CORRECTO |
| 10k trained | 0.93 | ~0.90-0.94 | Daniels: 10k ~ 93% VO2max | CORRECTO |
| HM trained | 0.92 | ~0.90-0.95 | Daniels: T-pace ~ HM pace | CORRECTO |
| Marathon trained | 0.87 | ~0.85-0.93 | Billat 2003: elite ~87-93% MLSS | CORRECTO |
| Marathon competitive | 0.93 | ~0.87-0.93 | Billat 2003 | CORRECTO (límite superior) |
| Road TT trained | 0.92 | ~0.90-0.95 | Coggan: FTP ~ 95% MLSS, TT ~ 95-100% FTP | CORRECTO |
| Ironman trained | 0.74 | ~0.72-0.78 | Laursen 2002: IM bike ~73%, run ~74% MLSS | CORRECTO |
| Ironman competitive | 0.80 | ~0.78-0.82 | Hausswirth 2013 | CORRECTO |
| Ironman bike trained | 0.73 | ~0.70-0.76 | Laursen 2002 | CORRECTO |

**Valoración global: MUY BUENA.** Los factores están dentro de los rangos reportados en la literatura. Las fuentes citadas son correctas y verificables.

**Observación menor:** El factor `5k competitive = 1.01` implica que el LT2 requerido es ligeramente MENOR que el race pace (el atleta corre por encima de su LT2). Esto es fisiológicamente correcto para atletas de elite en 5k (que corren a ~98% VO2max, por encima de MLSS).

---

## 8. Hallazgos Clasificados por Riesgo

### RIESGO MEDIO (4)

| # | Hallazgo | Líneas | Impacto |
|---|---|---|---|
| M1 | Rangos de ratio VLamax (0.79/0.87) son invenciones propias sin validación | 229-231 | Puede cambiar bloques incorrectamente si los umbrales están mal calibrados |
| M2 | Confianza de Swain VO2max (0.55-0.75) es optimista dado el error real de +-15% | 700-701 | Fractional utilization puede cambiar bloques con datos imprecisos |
| M3 | La fractional utilization depende de VO2max estimado; si este tiene error +-15%, la decisión de AEP vs THR (líneas 1161-1179) puede ser incorrecta | 1161-1179 | Prescripción subóptima (no peligrosa, pero ineficiente) |
| M4 | La ecuación ACSM running sobreestima VO2 en un 14.6% en atletas (PMC3743617) | 621-633 | Sesgo sistemático que subestima fractional utilization |

### RIESGO BAJO (6)

| # | Hallazgo | Líneas | Impacto |
|---|---|---|---|
| B1 | THR como bloque discreto no existe en Olbrecht (es transición AEC->AEP) | BLOCK_RATIONALE | Solo terminológico, no funcional |
| B2 | COMP como bloque separado no existe en Olbrecht (es AEP+ANP combinado) | BLOCK_RATIONALE | Pragmáticamente correcto |
| B3 | `road_tt_short` no está en _ANP_EVENTS | 198-201 | Pierde oportunidad de ANP para TT corto |
| B4 | Corrección VLamax por aerobic_level="low" es simétrica (high->moderate y low->moderate) | 789-798 | Puede subestimar VLamax genuinamente alta en recreativos |
| B5 | Phase boundaries no modelan doble/triple pico | 400-416 | Limitación inherente, no error |
| B6 | Taper < 3 semanas puede ser corto para Ironman | 406 | Compensado por COMP block |

### RECOMENDACIONES DE MEJORA (3)

| # | Recomendación | Prioridad |
|---|---|---|
| R1 | Validar empíricamente los rangos de ratio VLamax contra INSCYD o sprint tests en atletas del sistema | ALTA |
| R2 | Reducir confianza máxima de Swain HR a 0.65; reservar 0.75+ para VO2max medido | MEDIA |
| R3 | Considerar cross-validation: cuando Garmin VO2max y Swain difieren >15%, reducir confianza a 0.40 | MEDIA |

---

## 9. Rutas de Prescripción Peligrosas

### 9.1 Rutas verificadas (todas seguras)

| Escenario | Resultado | Seguro? |
|---|---|---|
| Sin datos de lactato | testing_decision_block | SI |
| Confianza < 0.5 | CapacityProfile no actúa; gap analysis manda | SI |
| VLamax alta + base_early | Siempre AEC | SI |
| ANP en evento largo | No puede ocurrir (_ANP_EVENTS lo impide) | SI |
| ANC en base_early | No puede ocurrir (gate de fase) | SI |
| Timeline imposible (gap enorme + pocas semanas) | D1 override a COMP | SI |
| ANC en recreativo | No puede ocurrir (gate de nivel) | SI |

### 9.2 Ruta potencialmente subóptima (no peligrosa)

**Escenario:** Atleta entrenado con VO2max real de 65 ml/kg/min. Swain estima 75 ml/kg/min (+15%). Fractional utilization se calcula como 73% (real: 84%). El motor prescribe THR ("empujar umbral, hay margen") cuando debería prescribir AEP ("subir al techo").

**Impacto:** Bloque subóptimo pero no peligroso. THR para un atleta que necesita AEP es ineficiente pero no causa daño fisiológico.

**Probabilidad:** MEDIA (el error de ACSM en atletas es documentado).

---

## 10. Comparación con Block Periodization (Issurin/Ronnestad)

El motor implementa bloques concentrados al estilo de Issurin (2010) pero con la filosofía de selección de Olbrecht. La duración de los mesociclos (2-10 semanas) es consistente con Issurin's "2-4 week mesocycles with highly concentrated workloads" y con Ronnestad 2014 (1 semana HIT + 3 semanas LIT como bloque).

La evidencia de Ronnestad 2014 muestra que block periodization "provides superior training effects in trained cyclists" comparado con periodización tradicional. El motor implementa correctamente la concentración de estímulos por bloque, no un mix diluido.

---

## 11. Conclusiones

### Fortalezas del motor:
1. **Default conservador** (AEC) con escalada progresiva por evidencia
2. **Safety gates completos** que impiden prescripciones peligrosas
3. **Sistema de warnings bien diseñado** que comunica incertidumbre
4. **LT2_RACE_FACTORs bien calibrados** contra literatura verificable
5. **Block rationale científicamente preciso** con citas verificables
6. **Testing decision block** como salvaguarda cuando los datos no son fiables

### Debilidades:
1. **Proxy VLamax** (ratio LT1/LT2) con rangos no validados
2. **VO2max Swain** con confianza optimista dado el error documentado
3. **No modela evolución** (solo snapshot) -- limitación inherente del diseño

### Veredicto final:
**APROBADO con observaciones.** El motor es conservador, seguro, y fundamentado en la literatura. Las debilidades identificadas producen prescripciones subóptimas, no peligrosas. Las recomendaciones M1-M4 y R1-R3 mejorarían la precisión sin cambiar la arquitectura.

---

## Sources

- [Olbrecht - The Science of Winning (Amazon)](https://www.amazon.com/Science-Winning-Planning-Periodizing-Optimizing-ebook/dp/B009JTJ676)
- [Scientific Triathlon - Training structure with Jan Olbrecht EP#198](https://scientifictriathlon.com/tts198/)
- [Lactate Thresholds and Mader Model (Frontiers/PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9353623/)
- [INSCYD - Lactate Threshold 1 Whitepaper](https://inscyd.com/whitepaper/lactate-threshold-1/)
- [INSCYD - VLamax: Elite Coaches Secret Weapon](https://inscyd.com/article/vlamax1/)
- [Swain & Leutholtz 1997 - %HRR equivalent to %VO2R (PubMed)](https://pubmed.ncbi.nlm.nih.gov/9139182/)
- [Swain 2004 - Validation of VO2max estimation based on VO2R (PubMed)](https://pubmed.ncbi.nlm.nih.gov/15292752/)
- [ACSM VO2max estimation accuracy in athletes (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3743617/)
- [VO2max prediction external validation (PLoS ONE)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0280897)
- [Block periodization systematic review (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6802561/)
- [Ronnestad 2014 - Block periodization in cyclists (Wiley)](https://onlinelibrary.wiley.com/doi/10.1111/j.1600-0838.2012.01485.x)
- [Billat 2003 - Concept of MLSS (PDF)](https://publications.billatraining.com/publications/2003/Billat_concept_of_MLSS.pdf)
- [Olbrecht - Physiological Training Models (PDF)](https://www.southeastswimming.org/wp-content/uploads/2020/05/Physiological-Training-Models-P2.pdf)
- [Coggan FTP and MLSS relationship (PubMed)](https://pubmed.ncbi.nlm.nih.gov/30676826/)
- [Olbrecht - lactate.com training methodology](https://lactate.com/triathlon/lactate_triathlon_anaerobic_controlling.html)
