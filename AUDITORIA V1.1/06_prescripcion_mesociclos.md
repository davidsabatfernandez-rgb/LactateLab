# Auditoría 06 — Prescripción de Mesociclos

**Archivos auditados:**
- `backend/app/services/mesocycle_prescription.py`
- `backend/app/services/workout_library.py`
- `backend/app/services/triathlon_motor.py`

**Fecha:** 2026-03-15

---

## 1. Estructura semanal — `_phase_sequence()`

### 1.1 Estructura implementada

```
4 semanas: load → build → build_peak → recovery
5 semanas: load → build → build → build_peak → recovery
6 semanas: load → build → build → build_peak → recovery → recovery
```

El `build_peak` se introduce cuando `work_span >= 3` (al menos 3 semanas de trabajo). Con 2 semanas de trabajo, la secuencia es simplemente `load → build`.

### 1.2 Contraste con la evidencia

**Olbrecht (Science of Winning):**
Olbrecht describe el mesociclo como dos partes: la fase de trabajo (working phase, ~3/5 del ciclo) con incremento progresivo de carga (volumen, intensidad, frecuencia), y la fase de regeneración (~2/5). En un ciclo de 5 semanas, las semanas 1-3 son de carga progresiva y las semanas 4-5 de regeneración. Su principio fundamental es "alternación continua de periodos de mayor carga y periodos de entrenamiento reducido."

- [Science of Winning - Chapter 1](https://www.lactate.com/sciwin_ch01.html)
- [Periodisation with Macrocycles, Mesocycles and Microcycles](https://www.aixsurge.com/blog/triathlon-training-periodisation-macrocycle-mesocycle-microcycle)

**Roennestad 2014 (Block periodization):**
Estructura de 4 semanas: 1 semana con 5 sesiones HIT + 3 semanas con 1 HIT/semana y foco en LIT. Resultados superiores al formato tradicional (2 HIT/semana constante) en VO2max (+4.6%), Wmax (+2.1%) y potencia a 2 mmol (+10%).

- [Roennestad 2014 - Scand J Med Sci Sports](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1600-0838.2012.01485.x)

**Issurin 2010 (Block periodization):**
Propone secuencia de mesociclos especializados: Accumulation -> Transmutation -> Realization. Cargas altamente concentradas dirigidas a un numero minimo de capacidades objetivo.

- [Issurin 2010 - New Horizons for Periodization](https://pubmed.ncbi.nlm.nih.gov/20199119/)

### 1.3 Veredicto

| Aspecto | Estado | Nota |
|---------|--------|------|
| Estructura 4s load/build/build_peak/recovery | **ADAPTACION RAZONABLE** | Olbrecht describe carga progresiva, no nombra "build_peak" como fase separada. La idea de un climax antes de la descarga es consistente con su principio de incremento progresivo dentro del working phase. |
| Estructura 5s con doble build | **CORRECTO** | Alineado con Olbrecht: 3 semanas de trabajo progresivo + 2 de regeneracion. La proporcion 3/5 working se cumple. |
| Proporcion working/recovery | **CORRECTO** | El codigo calcula `work_span = duration - tail_recovery` y asigna la cola de recovery. La proporcion se acerca al 3/5 de Olbrecht. |
| `build_peak` como fase explicita | **INVENCION UTIL** | Olbrecht no nombra esta fase asi. El describe "semana 3" del working phase como la de mayor carga. Codificar esto como `build_peak` es una abstraccion practica que captura la idea correcta, pero no es terminologia de Olbrecht. |

### 1.4 Problema: `_week_load_label()` — "carga maxima"

La etiqueta "carga maxima" para `build_peak` puede ser confusa. En la terminologia de Olbrecht, no existe ese termino. Alternativas mas precisas:
- "climax del ciclo" (Olbrecht)
- "semana de sobresolicitacion" (Issurin: overreaching)
- "pico de carga" (uso comun en periodizacion)

**Severidad:** BAJA. Es un problema de nomenclatura, no de logica.

---

## 2. Seleccion de sesiones — WORKOUT_BLUEPRINTS

### 2.1 Coherencia fisiologica por bloque

| Bloque | Fase | Sesiones asignadas | Veredicto |
|--------|------|--------------------|-----------|
| AEC running | load | LT1 extensivo + economy strides + long aerobic + fuerza | **CORRECTO** — base clasica |
| AEC running | build | LT1 long reps + LT1 extensivo + long aerobic | **CORRECTO** — progresion dentro de AEC |
| AEC running | build_peak | ANC submax spice + LT1 long reps + regenerative long | **CORRECTO** — patron Olbrecht Tipo I: ANC al inicio + cola extensiva |
| THR running | load | LT2 cruise + LT1 extensivo + long aerobic | **CORRECTO** — introduce umbral sobre base existente |
| THR running | build | Subthreshold reps + LT1 long reps + progressive aerobic | **CORRECTO** — progresion en densidad de umbral |
| THR running | build_peak | Escalated LT1 + LT1-LT2 mix + long aerobic | **ATENCION** — build_peak de THR no incluye una sesion pura de LT2. Solo formatos mixtos. Puede ser intencionado (evitar sobresolicitacion), pero contradice la idea de "climax" del bloque de umbral. |
| AEP running | load | uLT1+VO2 combo + LT1 extensivo + long aerobic | **CORRECTO** — introduce VO2 sobre base |
| AEP running | build_peak | ANC VO2 short + VO2 hills + LT1 extensivo | **CORRECTO** — doble estimulo VO2 con soporte extensivo |
| ANC running | build_peak | ANC short reps + LT1 long reps + regenerative long | **CORRECTO** — ANC al inicio, cola extensiva (Olbrecht) |
| ANP running | specific | AEP race pace + ANP sprint tolerance + LT0 recovery | **CORRECTO** — pre-comp con estimulo anaerobico |

### 2.2 Observaciones criticas

**PROBLEMA 1: THR build_peak sin LT2 puro**
El `build_peak` del threshold_development_block usa `run_escalated_lt1` (que es LT1->LT2, no LT2 puro) y `run_lt1_lt2_mix`. Si el objetivo del bloque es desarrollar LT2, la semana de mayor carga deberia incluir al menos una sesion de LT2 cruise o threshold continuous. Alternativa: reemplazar `run_escalated_lt1` en build_peak por `run_lt2_cruise` o `run_threshold_continuous`.

**PROBLEMA 2: AEC build_peak — ANC spice como sesion KEY**
`run_anc_submax_spice` esta en dia 2 (posicion KEY). Este patron es exactamente Olbrecht Tipo I (ANC spice dentro de AEC), pero el formato "4-5x20-30'' submax + 6-8x4' LT1" es hibrido. El riesgo es que si el atleta lo ejecuta mal, la parte ANC contamina la cola LT1. La sesion deberia tener `coach_tips` explicitos sobre la separacion.

**PROBLEMA 3: Ciclismo AEP build_peak — doble VO2**
`bike_sit_lt1_progressive` + `bike_vo2_power` en la misma semana. Ambas son fatigue_cost alto. El spacing (dias 2 y 5) da 3 dias de separacion, que es suficiente para ciclismo (menos dano muscular que running), pero marginal.

### 2.3 Veredicto global

La asignacion de sesiones a (bloque, fase) es **fisiologicamente coherente en ~85% de los casos**. Los blueprints reflejan correctamente la logica de Olbrecht (ANC spice en AEC, cola extensiva, soporte tecnico transversal). Los 3 problemas identificados son menores pero merecen revision.

---

## 3. Progresion de dosis — `_base_selection_index()` y `_select_dose_step()`

### 3.1 `_base_selection_index()`

```python
index = {"load": 0, "build": 1, "build_peak": 2, "specific": 2, "recovery": 0}
```

- `build_peak` usa step 2 (maximo en escala 0-2 para 3 fases de trabajo).
- Sessions de soporte se capean a step 1.
- Robustez "low" resta 1.
- Respuesta negativa fuerza index 0.
- Horizonte cercano + specific + key fuerza minimo index 2.

**Veredicto: CORRECTO.** La progresion es conservadora y tiene multiples frenos de seguridad. El unico riesgo es que `build_peak = 2` en una escala de 0 a max_index de csv_examples puede ser insuficiente para templates con muchos ejemplos (ej: lt1_extensive tiene 4 csv_examples, index 2 = "40' continuo LT1" — razonable).

### 3.2 `_select_dose_step()` — Algoritmo de dose ladder

El algoritmo sigue esta prioridad descendente:

1. **Sin historial** -> step 1 (low/recovery) o step 2 (otros)
2. **Recovery** -> effective_last - 2
3. **Load** -> effective_last - 1
4. **Build** -> effective_last + 1
5. **Build_peak** -> min(max_step, effective_last + 2) — limitado a +2 peldanos
6. **Specific** -> effective_last + 1 si improving, else mantener
7. **Degrading** -> target - 1
8. **Negative response** -> no superar effective_last
9. **Cap por robustez** -> low: 3, medium: 5, high: max

**Analisis cientifico:**

| Regla | Evidencia | Veredicto |
|-------|-----------|-----------|
| Build_peak limitado a +2 peldanos | El codigo cita "Bompa: no mas de 10-20% incremento semanal." No hay evidencia especifica para la regla del 10% — es una convencion ampliamente aceptada sin publicacion original clara. | **ACEPTABLE** — +2 peldanos sobre ~8 peldanos es ~25% de incremento, ligeramente por encima del 20% de Bompa. Considerar +1 para atletas low/medium. |
| Recovery = last - 2 | Mujika 2010: reducir volumen 41-60%, mantener intensidad. Una bajada de 2 peldanos en la escala de dosis reduce el tiempo util pero mantiene la zona de intensidad. | **CORRECTO** |
| Cap robustez low = 3 | Conservador. Impide que un atleta sin historial reciba dosis altas. | **CORRECTO** |
| Readiness check | Si el peldano requiere "fresh" pero robustez es "low", busca uno mas bajo que no lo requiera. | **CORRECTO** — proteccion razonable |

**PROBLEMA:** La progresion build_peak = effective_last + 2 puede saltar 2 peldanos de golpe. Ejemplo: si en build el atleta uso step 3, en build_peak saltaria a step 5. Eso puede ser un salto de 3x10' LT1 a 4x12' LT1 (de 30 a 48 minutos utiles, +60%). Esto viola claramente el principio de Bompa. **Recomendacion: limitar build_peak a effective_last + 1, no +2.**

### 3.3 Diseno de los dose ladders

**Patron general de progresion:**

| Familia | Steps | Min (step 1) | Max (step max) | Progresion |
|---------|-------|--------------|----------------|------------|
| lt1_extensive | 8 | 24' utiles (3x8') | 55' cont | +3-8' por step (~lineal) |
| lt2_cruise_intervals | 6 | 16' (4x800m) | 40' (4x2km) | +4-10' por step (~lineal) |
| threshold_continuous | 6 | 20' cont | 40' cont | +4-6' por step (lineal) |
| vo2_hills | 6 | 12' (4x3') | 24' (6x4') | +2-4' por step (lineal) |
| bike_lt1_blocks | 7 | 30' (3x10') | 70' cont | +5-10' por step (lineal) |
| bike_lt2_halfpace | 6 | 24' (2x12') | 60' (3x20') | +6-10' por step (~lineal) |

**Analisis:**

1. **Progresion lineal:** La mayoria de los ladders progresan ~20-30% entre steps adyacentes en la parte baja, y ~10-15% en la parte alta. Esto es razonable — la progresion absoluta es constante pero la relativa disminuye.

2. **Step 0 seguro para principiantes:** El step 1 siempre tiene `readiness_required: "any"` (en LT1) o `"fresh"` (en LT2/VO2). Los steps de LT1 son accesibles para principiantes. Los de LT2/VO2 requieren estado fresco, lo cual protege al principiante. **CORRECTO.**

3. **Maximo vs elite real:**
   - lt1_extensive step 8: 55' continuo LT1 — razonable para elite recreativo. Un elite internacional haria 70-90' LT1 continuo.
   - lt2_cruise step 6: 4x2km LT2 (40' utiles) — agresivo para recreativo, normal para elite. Kenneally 2022 documenta sesiones de hasta 8x1km LT2 en fondistas mundialistas.
   - vo2_hills step 6: 6x4' VO2 (24' utiles) — alineado con la evidencia de Roennestad 2016 y Seiler.
   - bike_lt2 step 6: 3x20' LT2 (60') — clasico "3x20' FTP". Adecuado como maximo.

4. **Evidencia para el diseno de ladders:** No hay publicaciones que prescriban escaleras discretas de dosis. El concepto es una invencion practica del sistema, inspirado en la progresion progresiva de los planes de entrenamiento. Los steps individuales estan calibrados contra los datos del CSV de Nacho y contra la literatura (Kenneally, Roennestad, Seiler). **ACEPTABLE como diseno aplicado, sin equivalente directo en la literatura.**

---

## 4. Asignacion de dias y spacing

### 4.1 `_smart_day_offsets()` — Mono-disciplina

**Reglas implementadas:**
- KEY fatigue_cost=5 + requires_fresh -> dia 2 (martes)
- KEY fatigue_cost=4 -> dia 2 o 4
- LONG -> dia 6 (sabado)
- SUPPORT/RECOVERY -> dias restantes (1, 3, 5, 7)
- Dos KEY separadas >= 2 dias

**Veredicto:**

| Regla | Evidencia | Estado |
|-------|-----------|--------|
| KEY en martes (tras lunes descanso) | Olbrecht: sesion clave tras regeneracion. Seiler: 48h entre HIT. | **CORRECTO** |
| >= 2 dias entre KEY | Seiler 2010: 2 HIT/semana con ~48h entre sesiones produce adaptaciones optimas en elite. | **CORRECTO para running; CONSERVADOR para ciclismo** |
| LONG en sabado | Convencion practica (disponibilidad), no evidencia fisiologica. | **ACEPTABLE** |

**48h entre KEY — aplica igual a ciclismo?**

La evidencia sugiere que el ciclismo produce menos dano muscular excentrico que el running (Hausswirth & Mujika 2013). Por tanto, 48h puede ser conservador para ciclismo. Sin embargo, la fatiga central y metabolica (glycogen depletion) es similar. El spacing de 48h es una simplificacion razonable que protege contra ambos tipos de fatiga. **ACEPTABLE sin cambios.**

### 4.2 `_cross_discipline_day_assignment()` — Triatlon

**Regla 1: No 2 KEY de disciplinas diferentes en dias consecutivos**

La regla esta implementada con `min_distance=2` en la busqueda de dias para secondary KEY. Esto es mas restrictivo que "no consecutivos" (que seria `min_distance=1`).

**Evidencia:** Olbrecht en Science of Winning discute la necesidad de separar estimulos intensos de diferentes disciplinas para evitar interferencia cruzada. Hausswirth (2013, Recovery for Performance in Sport) aborda la recuperacion multi-deporte. La regla es consistente con el principio general, aunque ni Olbrecht ni Hausswirth dan una cifra exacta de "2 dias minimo."

**Veredicto: CORRECTO pero CONSERVADOR.** Podria ser 1 dia (no consecutivos) sin violar la evidencia.

**Regla 2: Brick siempre bike->run**

**Evidencia:** Millet & Vleck (2000, Br J Sports Med): el coste energetico del running tras ciclismo aumenta 1.6-11.6% segun nivel del triatleta. El orden bike->run es el patron competitivo y el que se entrena en brick sessions.

- [Millet & Vleck 2000 - PubMed](https://pubmed.ncbi.nlm.nih.gov/11049151/)
- [Better Triathlete - Science of Bike-Run Transition](https://bettertriathlete.com/bike/science-behind-bike-to-run-transition/)

**Nota sobre los numeros en el codigo:** El MEMORY.md menciona "Millet 2002 says tau=12h, -12% running economy." Los datos reales de Millet & Vleck 2000 son:
- Disminucion de economia de carrera: **1.6-11.6%** (rango segun nivel del atleta)
- No se menciona tau=12h en la publicacion original. El "tau" probablemente se refiere al time constant de recuperacion de la economia post-brick, que no esta cuantificado en la publicacion de 2000.

**Veredicto: La regla bike->run es CORRECTA. Los numeros "-12%" y "tau=12h" NO estan verificados en la publicacion original de Millet.**

**Regla 3: Swim is free in spacing**

**Evidencia parcial.** El razonamiento es que la natacion usa grupos musculares diferentes (tren superior) y produce menor impacto mecanico. Sin embargo:

1. La natacion de alta intensidad (VO2, ANC) produce fatiga central y metabolica significativa (deplecion de glucogeno, fatiga del SNC).
2. Investigacion sobre swim-to-cycle transition (PMC 2022): la modulacion de intensidad en natacion afecta parametros fisiologicos en el ciclismo posterior.
3. En competicion, nadar a >95% del ritmo de TT reduce el rendimiento en el ciclismo posterior (Peeling et al., 2005).

**Veredicto: PARCIALMENTE CORRECTO.** La natacion sub-LT1 es razonablemente "free" en spacing. La natacion de alta intensidad (VO2, ANC, CSS intensa) SI produce fatiga sistemica y deberia tener restricciones de spacing, al menos un warning cuando se coloca antes de una sesion KEY de running/ciclismo.

**Recomendacion:** Anadir un warning en `validate_triathlon_spacing()` cuando una sesion de natacion con `fatigue_cost >= 4` precede a una sesion KEY terrestre en el mismo dia o dia siguiente.

**Regla 4: Solo 1 LONG por fin de semana**

**Evidencia:** Convencion practica basada en la gestion de fatiga acumulada. No hay publicacion especifica que diga "maximo 1 LONG por fin de semana." En la practica de triatletas Ironman, es comun hacer tirada larga en bici el sabado y tirada larga en running el domingo. La regla del sistema es mas conservadora que la practica comun.

**Veredicto: CONSERVADOR pero SEGURO.** Para atletas con CTL alto y buena tolerancia, podria relajarse a "maximo 2 LONG de disciplinas diferentes."

### 4.3 Que pasa cuando no caben todas las sesiones?

En `_find_free_day()`:
```python
# Fallback: any day 1-7
for day in range(1, 8):
    if day not in used:
        return day
return 1  # worst case, double up
```

Si no hay dias libres, la funcion retorna dia 1 (lunes), lo que provocara un doble dia no planificado. El sistema **no dropea sesiones**, sino que viola spacing por doble-up.

En `_cross_discipline_day_assignment()`, las sesiones de support secundario y swim se dropean silenciosamente si no encuentran dia:
```python
if day:  # solo asigna si encuentra dia
    slot.day_offset = day
    ...
```

**Veredicto: MIXED.**
- Las sesiones KEY nunca se dropean (correcto).
- Las sesiones support/swim se dropean silenciosamente (aceptable pero sin warning).
- El fallback de doble-up en dia 1 puede crear conflictos no detectados.

**Recomendacion:** Generar un warning explicito cuando una sesion se dropa o se fuerza un doble-up.

---

## 5. Triathlon motor — Especificos

### 5.1 `discipline_tss_split()` por confianza de debilidad

| Confianza | Primary | Secondary | Swim |
|-----------|---------|-----------|------|
| high | 55% | 30% | 15% |
| moderate | 50% | 30% | 20% |
| balanced | 40% | 35% | 25% |

**Evidencia:** No hay publicacion que diga "si la debilidad es clara, asigna 55% del TSS a la disciplina primaria." La logica es intuitiva: a mayor certeza de debilidad, mas recursos a mejorarla.

- Cejuela 2022 (triatleta World Tour) muestra distribuciones de ~35-40% running, ~35-40% ciclismo, ~20-25% natacion en macrociclos reales, pero esto varia enormemente segun el perfil del atleta.

**Veredicto: RAZONABLE como heuristica.** Los valores son conservadores y no extremos. El split 55/30/15 para high confidence es agresivo pero no irracional. La clave es que el entrenador pueda overridear via `custom_tss_split`.

### 5.2 Phase coupling: primary build_peak -> secondary build

```python
_SECONDARY_PHASE_MAP = {
    "build_peak": "build",  # secondary does NOT peak when primary does
}
```

**Evidencia:** Olbrecht discute que cuando un sistema energetico esta en fase de sobresolicitacion, los demas deben estar en mantenimiento o soporte. Issurin 2010 lo formaliza como el principio de "cargas concentradas unidireccionales" — no se puede maximizar estimulos en dos direcciones simultaneamente.

**Veredicto: CORRECTO.** Alineado con Olbrecht e Issurin.

### 5.3 Multi-session days: 07:00 y 17:00

```python
slot.scheduled_time = "07:00"  # swim AM
existing.scheduled_time = "17:00"  # land PM
```

**Evidencia:**
- El modelo noruego (Seiler, Roennestad) usa "double threshold" con sesiones AM y PM separadas ~8-10h.
- Investigacion sobre cronobiologia deportiva: el rendimiento fisico pico se alcanza entre 14:00-18:00 (temperatura central maxima).
- Separacion minima recomendada: 6h entre sesiones para minimizar interferencia aguda (Robineau et al., 2016).

El spacing 07:00-17:00 = 10 horas de separacion. **CORRECTO** — alineado con la evidencia y con la practica del modelo noruego.

### 5.4 ECO load weighting

```python
_ECO_WEIGHT = {"running": 1.0, "ciclismo": 0.50, "natación": 0.75}
```

Referenciado como "Cejuela 2022 — mechanical cost by discipline." El running tiene el mayor coste mecanico (impacto excentrico), seguido de natacion (resistencia del agua, menor impacto) y ciclismo (concentrico, sin impacto). Los valores son coherentes con la fisiologia, aunque los numeros exactos son una estimacion.

**Veredicto: RAZONABLE.** Ciclismo a 0.50 es quiza demasiado bajo — la fatiga metabolica del ciclismo de alta intensidad puede ser comparable al running. Pero como ponderacion de coste mecanico, es aceptable.

### 5.5 TSS estimation: swim IF^3

```python
if discipline == "natación":
    tss = intensity_factor ** 3 * hours * 100
```

La formula estandar de TSS es IF^2 * hours * 100. Usar IF^3 para natacion produce valores mas altos a alta intensidad y mas bajos a baja intensidad. No hay evidencia publicada para esta formula. El sTSS (swim TSS) de TrainingPeaks usa IF^2 como las demas disciplinas.

**Veredicto: NO EVIDENCIADO.** La formula IF^3 no tiene soporte en la literatura. Deberia usarse IF^2 para natacion tambien, o documentar explicitamente por que se usa un exponente diferente.

---

## 6. Resumen de hallazgos

### Problemas criticos (requieren accion)

| # | Problema | Severidad | Recomendacion |
|---|----------|-----------|---------------|
| C1 | build_peak = effective_last + 2 puede saltar +60% en volumen util | **ALTA** | Limitar a +1, no +2. O anadir guard: si incremento % > 25%, capear. |
| C2 | Swim IF^3 no tiene evidencia | **MEDIA** | Cambiar a IF^2 o documentar la justificacion con datos propios. |
| C3 | THR build_peak sin sesion LT2 pura | **MEDIA** | Incluir run_lt2_cruise o run_threshold_continuous en build_peak de THR. |

### Problemas menores (considerar revision)

| # | Problema | Severidad | Recomendacion |
|---|----------|-----------|---------------|
| M1 | Swim de alta intensidad tratada como "free" en spacing | **BAJA-MEDIA** | Warning cuando swim fatigue_cost >= 4 precede KEY terrestre. |
| M2 | Sesiones dropeadas silenciosamente sin warning | **BAJA** | Generar warning explicito. |
| M3 | "carga maxima" no es terminologia de Olbrecht | **BAJA** | Cambiar a "pico de carga" o "climax del ciclo." |
| M4 | "-12% running economy" y "tau=12h" no verificados en Millet 2000 | **BAJA** | Actualizar los comentarios del codigo con los datos reales (1.6-11.6%). |
| M5 | Solo 1 LONG por fin de semana es conservador para Ironman | **BAJA** | Considerar relajar para atletas con CTL alto. |

### Aspectos correctos y bien fundamentados

| Aspecto | Evidencia |
|---------|-----------|
| Proporcion working/recovery ~3/5 | Olbrecht Science of Winning |
| ANC spice al inicio de AEC (Tipo I) | Olbrecht Science of Winning |
| Cola extensiva sub-LT1 en bloques ANC | Olbrecht Science of Winning |
| Phase coupling (secondary no peak con primary) | Olbrecht + Issurin 2010 |
| Brick bike->run | Millet & Vleck 2000 |
| Double session 07:00/17:00 (~10h spacing) | Modelo noruego, Robineau 2016 |
| Readiness check en dose_step | Principio de precaucion razonable |
| Cap de robustez en dose ladder | Proteccion correcta |
| Recovery = last - 2 + mantener intensidad | Mujika 2010 |
| Dose ladder step 1 seguro para principiantes | Diseno conservador correcto |
| Rotacion de templates con alternates | Variabilidad tipo Nacho |
| BLa check automatico (referencia + validacion) | Olbrecht: lactato valida el bloque |
| Tecnica transversal en natacion con fade progresivo | Pla 2019, Gonzalez-Rave 2022 |

---

## 7. Fuentes consultadas

- [Olbrecht - Science of Winning Ch. 1](https://www.lactate.com/sciwin_ch01.html)
- [Issurin 2010 - New Horizons for Periodization](https://pubmed.ncbi.nlm.nih.gov/20199119/)
- [Roennestad 2014 - Block Periodization in Cyclists](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1600-0838.2012.01485.x)
- [Millet & Vleck 2000 - Cycle to Run Transition](https://pubmed.ncbi.nlm.nih.gov/11049151/)
- [Hausswirth & Mujika 2013 - Recovery for Performance in Sport](https://www.amazon.com/Recovery-Performance-Institut-National-LExpertise/dp/1450434347)
- [Mujika 2010 - Intense Training Before and During Taper](https://pubmed.ncbi.nlm.nih.gov/20840559/)
- [Seiler 2010 - Best Practice for Intensity Distribution](https://pubmed.ncbi.nlm.nih.gov/20861519/)
- [Block Periodization Meta-analysis 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6802561/)
- [Cejuela 2022 - World Class Triathlete Training](https://pubmed.ncbi.nlm.nih.gov/35514361/)
- [Swim-to-Cycle Transition Review 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9556684/)
- [Norwegian Double Threshold Model 2024](https://link.springer.com/article/10.1007/s40279-024-02067-4)
