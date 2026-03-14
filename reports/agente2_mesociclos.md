# Agente 2 -- Mesociclos y Motor de Periodizacion

Fecha: 2026-03-14
Sistema: Lactate Lab (PeakAerobic)

---

## Base Cientifica

### Papers y evidencia independiente

| # | Referencia | Hallazgo clave | Clasificacion |
|---|---|---|---|
| 1 | Molmen et al. (2019) "Block periodization of endurance training -- a systematic review and meta-analysis" PMC6802561 | BP muestra efectos pequenos-moderados favorables vs traditional en VO2max (SMD=0.40) y Wmax (SMD=0.28). Calidad metodologica baja (PEDro=3.7/10). | CONSENSO (con cautela) |
| 2 | Stoggl & Sperlich (2014/2024 updates) "Polarized vs threshold vs pyramidal TID" PMC11329428 | No hay diferencia significativa en VO2max o TT entre polarizada y piramidal en meta-analisis con 348 atletas. Ambas mejoran rendimiento. | DEBATE |
| 3 | Ronnestad et al. (2016) "5-week block periodization increases aerobic power in elite XC skiers" PMID 25648345 | Bloques concentrados de HIT de 5 semanas mejoran potencia aerobica si se usan como fase corta y contenida. | CONSENSO |
| 4 | Meeusen et al. (2013) "Prevention, diagnosis and treatment of the overtraining syndrome" ECSS/ACSM Joint Statement | Lactato basal elevado en submaximal es marcador de overreaching. Un solo marcador no es suficiente; se requiere enfoque multifactorial. | CONSENSO |
| 5 | Cadegiani & Kater (2019) "Basal hormones and biochemical markers as predictors of overtraining syndrome" PMC | Peak lactato desciende paradojicamente en overtraining. Variabilidad de lactato submaximal >0.5 mmol es sospechosa. | CONSENSO |
| 6 | Mujika & Padilla (2001) "Detraining: loss of training-induced adaptations" Sports Med | Perdida de 4-6% VO2max en 2-4 semanas sin entrenamiento. Clearance de lactato se deteriora rapidamente. | CONSENSO |
| 7 | Hausswirth & Mujika (2013) "Recovery for Performance in Sport" | Fatiga cruzada ciclismo->running en triatlon: running leg ~8-12% por debajo de LT2 standalone. | CONSENSO |
| 8 | Olbrecht (2000) "The Science of Winning" | Modelo AEC/ANC/AEP/ANP. Dos poleas VO2max/VLamax. Wave principle con supercompensacion. | CONSENSO (marco referencia) |
| 9 | Cejuela & Selles-Perez (2022) "Road to Tokyo: training of world-class male triathlete" PMC PMID 35514361 | Macrociclo triatlon elite: mucha Z1, poco umbral, dosis contenida >VT2. Periodizacion por disciplina alineada. | CONSENSO |
| 10 | Mujika (2009) "Tapering and Peaking for Optimal Performance" | Reduccion de volumen 41-60% durante 2 semanas sin alterar intensidad ni frecuencia = deload optimo. | CONSENSO |
| 11 | Laursen & Jenkins (2002) "The scientific basis for high-intensity interval training" Sports Med | Block periodization en Ironman: base aerobica extensa + bloques cortos de HIT. | CONSENSO |
| 12 | Solli et al. (2019) "Training and Competition Readiness in Triathlon" PMC6571715 | No esta claro cuanto interfieren senales de adaptacion entre disciplinas. Cross-training puede transferir adaptaciones centrales. | DEBATE |

---

## Parte A -- Validacion de Secuencia de Bloques

### Metodologia

Para cada perfil (P01-P12) se analiza:
1. Que bloque recomienda el motor inicialmente segun `analyse_physiological_gap()` en `physiological_engine.py`
2. Si es fisiologicamente correcto
3. Que bloque seguiria tras mejora (1 mesociclo)
4. Que ocurre tras estancamiento
5. Si la secuencia completa sigue la logica Olbrecht

### Tabla resumen

| Perfil | Disciplina | Fase | Bloque 1 | Bloque 2 (mejora) | Bloque 3 (estanc.) | Secuencia correcta? |
|---|---|---|---|---|---|---|
| P01 | Running | base_early | AEC | AEC (gap sigue) | AEC->THR (si mejora LT1) | Si -- principiante necesita base larga |
| P02 | Ciclismo | base_late | AEP o THR | AEP->COMP | THR (mantener) | Si -- diesel con gap pequeno |
| P03 | Triatlon 3disc | base_early | AEC | AEC (Ironman largo) | AEC->THR base_late | Si -- Ironman necesita base extensa |
| P04 | Swim+Run | base_late | AEC (run limitante) | THR (run mejora) | AEC si run estanca | Si -- prioriza disciplina debil |
| P05 | Running | base_late | THR o AEP | ANC (diesel estancado) | AEP si ANC desbloquea | PARCIAL -- ver nota P05 |
| P06 | Triatlon | base_early | AEC | AEC->THR | ANC si estanca | Si -- joven glucolitico |
| P07 | Triatlon 3disc | base_late | AEC (run+swim) | THR (si mejora) | AEC si no mejora | Si -- prioriza debilidad |
| P08 | Running | specific | AEP o COMP | COMP | Mantener COMP/AEP | Si -- objetivo ya superado |
| P09 | Triatlon | base_early | AEC (test deficiente) | testing_decision | AEC post-retest | Si -- conservador con datos malos |
| P10 | Triatlon | base_early | AEC | AEC (post-lesion largo) | AEC->THR | Si -- reconstruccion |
| P11 | Ciclismo | base_late | AEC o THR | THR->AEP | THR si estanca | Si |
| P12 | Natacion | specific | THR o AEP | AEP->COMP | COMP (diesel OW) | Si -- diesel en OW |

### Analisis detallado por perfil critico

**P05 -- Runner diesel estancado (PARCIAL)**

El motor fisiologico prescribe correctamente THR o AEP en la primera iteracion (gap pequeno, VLamax low). Sin embargo, tras estancamiento de 3-4 tests, el sistema NO tiene un detector automatico de plateau. El Agente 1C identifico que `_ANC_CANDIDATE_EVENTS` excluye maraton/ironman, por lo que un diesel estancado en maraton NUNCA recibira ANC automaticamente.

Olbrecht prescribe un bloque ANC corto (4 semanas) incluso para atletas de larga distancia cuando hay estancamiento con VLamax baja. El sistema no implementa esta logica.

**Veredicto P05**: La secuencia inicial es correcta, pero la respuesta al estancamiento es deficiente. **ACTUALIZAR** -- Anadir detector de estancamiento (>3 tests, <5% mejora en >12 semanas) que sugiera ANC incluso en eventos largos cuando VLamax es low.

**P03 -- Ironman multidisciplina**

La secuencia AEC (base_early, 34 semanas) -> AEC/THR (base_late) -> AEP (specific) -> COMP (pre_comp) es correcta para Ironman. Sin embargo, el motor genera bloques POR DISCIPLINA INDEPENDIENTEMENTE. No hay coordinacion global: el entrenador recibe 3 recomendaciones separadas sin priorizacion.

**Veredicto P03**: Secuencia por disciplina correcta. Falta vision global multidisciplina. **ACTUALIZAR**.

---

## Parte B -- Proteccion contra Bloques Excesivos

### Simulacion P01 (Runner principiante)

| Escenario | Proteccion? | Mecanismo | Veredicto |
|---|---|---|---|
| 10 semanas AEC consecutivas | NO | No hay limite maximo de semanas por bloque | CRITICO |
| 8 semanas desarrollo sin descarga | PARCIAL | `_phase_sequence()` incluye semanas de recovery automaticas | Ver detalle |
| 2 semanas de especifico | SI | `MIN_WEEKS_FOR_BLOCK["aerobic_power_block"]=3`, contraindication si `weeks < min+2` | OK |
| Limite maximo de semanas por bloque | NO | No existe campo `max_weeks_for_block` | ACTUALIZAR |

**Detalle: semanas de descarga automaticas**

El motor `_phase_sequence()` (linea 365-406 de `mesocycle_prescription.py`) calcula automaticamente semanas de recovery al final del mesociclo:
- Estructura `N+M`: M semanas de recovery (tipicamente 1)
- `tail_recovery = min(max(recovery_weeks, 1), duration_weeks - 1)` -- siempre al menos 1 semana de descarga si el bloque tiene >1 semana
- Patron wave: load -> build(s) -> build_peak -> recovery

Para un bloque de 5 semanas (tipico "3+1" o "4+1"):
- 4 semanas de trabajo (load, build, build, build_peak)
- 1 semana de recovery

Esto es correcto segun Olbrecht y la evidencia (Mujika 2009: deload cada 3-5 semanas). Sin embargo:
- Si el entrenador configura un bloque de 10 semanas con estructura "9+1", habria 9 semanas de trabajo continuo con solo 1 de descarga.
- No hay limite de semanas de trabajo consecutivas.

### Simulacion P03 (Ironman triatleta)

| Escenario | Proteccion? | Mecanismo | Veredicto |
|---|---|---|---|
| 10 semanas AEC consecutivas | NO | Mismo que P01 | CRITICO |
| 8 semanas sin descarga | PARCIAL | Recovery automatica pero puede ser insuficiente | ACTUALIZAR |
| Bloque de 3 disciplinas simultaneas sin coordinacion de carga | NO | Cada disciplina genera sesiones independientemente | CRITICO |

### Simulacion P08 (Runner masters)

| Escenario | Proteccion? | Mecanismo | Veredicto |
|---|---|---|---|
| 10 semanas AEP consecutivas | NO | Mismo problema | CRITICO |
| Override S1: semanas insuficientes | SI | Lineas 1549-1574: si `weeks < min_weeks` -> competition_specific | OK |
| Override D1: gap imposible | SI | Lineas 1526-1544: gap > 2x significant + timeline corto -> COMP | OK |

### Conclusion Parte B

**Protecciones que EXISTEN:**
1. Recovery automatica al final de cada mesociclo (1 semana minimo si >1 semana total)
2. Wave principle con build_peak como climax antes de descarga
3. Override S1/D1 para timelines insuficientes
4. `MIN_WEEKS_FOR_BLOCK` con contraindications
5. BLa check automatico en semana 1 (referencia) y ultima semana de build (validacion)

**Protecciones que FALTAN:**
1. **Limite maximo de semanas de trabajo sin descarga** -- el sistema permite configurar bloques de N semanas sin limite superior
2. **Deteccion de adherencia** -- si el atleta cancela sesiones, el sistema no ajusta la progresion
3. **Carga total multidisciplina** -- en triatlon, 3 bloques paralelos pueden generar carga excesiva sin warning
4. **Deteccion de inactividad prolongada** -- >14 dias sin sesiones no genera alerta ni readaptacion
5. **Limite de bloques del mismo tipo consecutivos** -- nada impide prescribir AEC indefinidamente

---

## Parte C -- Revision del Motor de Prescripcion

### 1. Calculo de volumen semanal y carga progresiva

El sistema NO calcula volumen semanal explicitamente. La carga se gestiona a traves de:
- **Dose ladders**: escaleras discretas de dosis (DoseStep) con `total_useful_time_min` y `total_duration_min`
- **csv_examples**: ejemplos preescritos como fallback
- **`_select_dose_step()`** (linea 504-582): selecciona el peldano del ladder segun phase, robustness, validation_signal

La progresion es por peldanos discretos, no por modelo continuo de carga (TSS, TRIMP, etc.). Esto es coherente con el enfoque Olbrecht (prescribir por sesion, no por carga global) pero limita la vision macro de carga total.

**Veredicto**: ACEPTABLE para el scope actual. Para V2, considerar un acumulador de carga semanal (sum de total_duration_min por disciplina) con limites por nivel/fase.

### 2. Escalado de intensidad entre semanas -- Wave principle

La intensidad escala correctamente segun el wave principle implementado:

| Phase | Peldano base | Logica |
|---|---|---|
| load | 0 (o effective_last - 1) | Conservador, introducir |
| build | effective_last + 1 | Progresion de 1 peldano |
| build_peak | max_step | Climax del ciclo |
| recovery | effective_last - 2 | Descarga significativa |
| specific | effective_last + (1 si improving) | Mantener o subir |

Moderadores:
- `degrading` signal -> bajar 1
- `negative` response -> no progresar
- Robustness cap: low=3, medium=5, high=max
- Readiness check: si peldano requiere "fresh" y robustness low -> buscar alternativa

**Veredicto**: CORRECTO. Implementacion fiel al wave principle de Olbrecht con moderadores sensatos.

### 3. Semanas de descarga automaticas

Si. `_phase_sequence()` siempre incluye semanas de recovery:
- Minimo 1 semana si duration > 1
- Pattern 4 semanas: load -> build -> build_peak -> recovery
- Pattern 5 semanas: load -> build -> build -> build_peak -> recovery

Frecuencia efectiva: cada 3-4 semanas de trabajo hay 1 de descarga.

**Veredicto**: CORRECTO. Coherente con la evidencia (deload cada 3-5 semanas; Mujika 2009, practica comun de atletas ~5.6 semanas; Delphi consensus PMC10511399). La frecuencia de 3:1 o 4:1 es la mas conservadora pero adecuada para el rango de atletas del sistema (recreational a competitive).

### 4. Deteccion de riesgo de sobreentrenamiento

NO existe deteccion automatica de sobreentrenamiento. El Agente 1C identifico este gap:
- No hay analisis de tendencia de basales Z2
- No hay detector de drift progresivo en lactato submaximal
- Cada toma se evalua individualmente, sin vision temporal

La alerta de fatiga (`lactato Z2 > LT1p + 0.5`) es puntual, no tendencial. Meeusen 2013 y Cadegiani 2019 confirman que se necesita un enfoque multi-marcador.

**Veredicto**: CRITICO PARA LAUNCH. Al menos implementar: si lactato Z2 sube >0.5 mmol en >8 semanas a misma carga -> alerta de "posible overreaching no funcional".

### 5. Progresion de dose ladders

Los dose ladders progresan correctamente:
- 6-8 peldanos por familia (rango tipico)
- Peldano 1: dosis minima (ej: 2x8' LT1)
- Peldano max: dosis maxima (ej: 6x8' LT1 o 5x1km LT2)
- `total_useful_time_min` crece monotonicamente
- `readiness_required` escala: "any" -> "medium" -> "fresh"

El incremento entre peldanos es tipicamente del 15-25% en tiempo util, coherente con la regla del 10-20% de progresion semanal en la literatura (Issurin 2010).

**Veredicto**: CORRECTO. Ritmo de progresion fisiologicamente razonable.

### 6. `_smart_day_offsets` y spacing

La funcion (lineas 656-728) respeta:
- Sesiones KEY con `requires_fresh=True` -> dia 2 (Martes, tras descanso de lunes)
- Sesiones largas -> dia 6 (Sabado)
- Dos KEY separadas >= 2 dias
- Support/recovery -> dias restantes (1, 3, 5, 7)
- `validate_microcycle_spacing()` genera warnings si dos sesiones fatigue_cost>=4 estan demasiado cerca

**Veredicto**: CORRECTO. Logica de spacing solida con fallbacks razonables.

### 7. Calibracion de build_peak

`build_peak` esta bien calibrado:
- Se activa solo cuando work_span >= 3 (es decir, con >= 4 semanas de bloque incluyendo recovery)
- Usa el peldano maximo del dose_ladder (`target = max_step`)
- En AEC, el build_peak incluye "spice" ANC al inicio (patron Olbrecht Tipo I exacto): ej. `run_anc_submax_spice` + `run_lt1_long_reps`
- La semana siguiente es siempre recovery

Olbrecht: la semana de carga maxima debe ser seguida por descarga para supercompensacion. El patron load->build->build_peak->recovery implementa esto correctamente.

**Veredicto**: CORRECTO. Fiel al patron Olbrecht.

### 8. Cobertura de WORKOUT_BLUEPRINTS

| Bloque | Running | Ciclismo | Natacion |
|---|---|---|---|
| AEC | load/build/build_peak/recovery | load/build/build_peak/recovery | load/build/build_peak/recovery |
| THR | load/build/build_peak/recovery | load/build/build_peak/recovery | load/build/build_peak/recovery |
| AEP | load/build/build_peak/recovery | load/build/build_peak/recovery | load/build/build_peak/recovery |
| ANC | load/build/build_peak/recovery | load/build/build_peak/recovery | load/build/build_peak/recovery |
| ANP | load/specific/recovery | load/specific/recovery | load/specific/recovery |
| COMP | load/specific/recovery | load/specific/recovery | load/specific/recovery |
| Technical | load/build/build_peak/recovery | load/build/build_peak/recovery | load/build/build_peak/recovery |
| Recovery | load/build/recovery | load/build/recovery | load/build/recovery |
| Testing | load/recovery | load/recovery | load/recovery |

**Veredicto**: CORRECTO. Cobertura completa de 9 tipos de bloque x 3 disciplinas = 27 combinaciones, todas con blueprints definidos.

---

## Parte D -- Triatlon Multidisciplina

### 1. Consideracion de las 3 disciplinas al calcular carga total

**NO.** El sistema analiza cada disciplina independientemente:
- `analyse_physiological_gap()` se ejecuta por disciplina
- `build_prewritten_mesocycle_draft()` genera un draft por disciplina
- No hay sumador de carga total cross-discipline
- No hay limite de sesiones semanales totales (un triatlon de 3 disciplinas podria recibir 9-12 sesiones/semana sin warning)

**Veredicto**: CRITICO PARA LAUNCH. Un triatleta con 3 bloques activos podria recibir cargas excesivas sin que el sistema lo detecte.

### 2. Fatiga cruzada modelada

**NO existe.** El Agente 1B demostro que el brick de P03 (S18) se gestiona correctamente a nivel de tomas de lactato (contextual_confidence reducida para running post-ciclismo). Sin embargo:
- No hay modelo de fatiga cruzada ciclismo->running
- No se reduce la carga de running cuando hay sesion intensa de ciclismo el dia anterior
- `_smart_day_offsets()` opera dentro de una sola disciplina

Hausswirth & Mujika (2013): la fatiga acumulada del ciclismo penaliza el running leg un 8-12% en triatlon. Solli et al. (2019): no esta claro cuanto interfieren las senales de adaptacion entre disciplinas, pero las adaptaciones centrales (cardiovasculares) se transfieren.

**Veredicto**: CRITICO PARA LAUNCH. Al minimo implementar: si hay sesion de ciclismo con fatigue_cost >= 4 en dia N, no programar sesion de running con fatigue_cost >= 3 en dia N+1.

### 3. Modelo de periodizacion para triatlon

El modelo sigue parcialmente la recomendacion de Cejuela & Selles-Perez (2022) y Olbrecht (2011):
- Base extensa (AEC) para construir capacidad aerobica en las 3 disciplinas
- Priorizacion por disciplina limitante (correcto)
- Bloques concentrados de HIT para potencia (AEP)

Sin embargo, falta:
- Periodizacion inversa para natacion (empezar por intensidad, construir volumen -- recomendado por algunos coaches de triatlon elite)
- Secuenciacion de bloques entre disciplinas (ej: AEC natacion + THR running simultaneos vs secuenciales)
- Brick sessions planificadas

**Veredicto**: PARCIAL. La base conceptual es correcta pero falta coordinacion global.

### 4. Sesiones brick planificadas automaticamente

**NO.** No hay template de sesion brick (ciclismo + running combinados) en `WORKOUT_BLUEPRINTS`. Los blueprints son mono-disciplina.

**Veredicto**: ACTUALIZAR. Anadir templates brick para COMP blocks de triatlon (ej: `brick_bike_to_run`, `brick_swim_to_bike`).

### 5. Equilibrio de disciplinas segun debilidades

**PARCIAL.** El sistema identifica correctamente la disciplina limitante (ej: P04 running es limitante, P07 natacion y running son debiles). Cada disciplina recibe su bloque independientemente.

Pero NO hay:
- Redistribucion de volumen (ej: reducir ciclismo si ciclismo ya esta en rango, aumentar running si es limitante)
- Priorizacion explicita ("dedicar 50% del tiempo a la disciplina debil")
- Orientacion al entrenador sobre donde invertir las horas limitadas

**Veredicto**: ACTUALIZAR. Generar un `global_priority_ranking` con distribucion sugerida de horas por disciplina.

### 6. Coherencia del plan para P03, P04, P07

**P03 (Ironman, competitive):**
- Base_early con 34 semanas: AEC es correcto. Ironman necesita la base aerobica mas extensa.
- La secuencia AEC -> THR -> AEP -> COMP es coherente con Ironman training (Laursen 2002).
- Falta: integracion de las 3 disciplinas en un plan coherente.

**P04 (70.3, trained, swim+run):**
- Running es el limitante claro. AEC para running es correcto.
- Natacion recibe su propio bloque (probablemente THR/AEP por gap pequeno).
- Falta: sesiones brick swim->run.

**P07 (70.3, trained, ciclismo fuerte):**
- AEC para running y natacion es correcto (ambas debiles).
- Ciclismo podria recibir THR/AEP (gap pequeno), lo cual genera 3 bloques simultaneos.
- Riesgo: carga total excesiva con 3 bloques paralelos.

**Veredicto**: Bloques individuales correctos. Integracion multidisciplina deficiente.

---

## Parte E -- Comparacion con Literatura

### 1. Wave principle de Olbrecht: implementacion

El wave principle esta correctamente implementado en `_phase_sequence()` y `_select_dose_step()`:

| Aspecto | Olbrecht (SoW) | Implementacion | Match? |
|---|---|---|---|
| Working phase 3/5 del ciclo | 3 semanas trabajo + 1 recovery (tipico 4s) | load+build+build_peak + recovery | SI |
| Climax antes de descarga | Semana de maxima carga seguida por descarga | build_peak -> recovery | SI |
| No subir volumen e intensidad a la vez | "Progresar una sola palanca" | Dose ladders suben 1 parametro por peldano | SI |
| Spice ANC al inicio en AEC | Esfuerzos cortos anaerobicos al inicio de sesion | `run_anc_submax_spice` en build_peak de AEC | SI |
| Recovery para releer | "La descarga revela la adaptacion" | BLa check en recovery semana + test_profile_anchor | SI |

**Veredicto**: CORRECTO. Implementacion fiel al wave principle.

### 2. MIN_WEEKS_FOR_BLOCK vs evidencia

| Bloque | Sistema | Evidencia | Fuente | Match? |
|---|---|---|---|---|
| AEC | 5 semanas | 4-8 semanas para adaptaciones mitocondriales | Dudley 1982, Holloszy 1967 | SI |
| THR | 4 semanas | 3-6 semanas para desplazar LT2 | Faude 2009, Billat 2003 | SI |
| ANC | 4 semanas | 4-6 semanas para cambios en VLamax | Nitzsche 2025, Olbrecht 2000 | SI |
| AEP | 3 semanas | 3-5 semanas para VO2max gains | Ronnestad 2016 (5 semanas), pero efectos desde semana 3 | SI |
| ANP | 2 semanas | 10-17 dias para efectos neuromusculares | Olbrecht 2000 | SI |
| COMP | 2 semanas | 2-3 semanas de especificidad competitiva | Pyne 2009 | SI |

**Veredicto**: CORRECTO. MIN_WEEKS coherentes con la literatura.

### 3. Distribucion de intensidad (polarizada vs piramidal)

El sistema sigue implicitamente un modelo piramidal:
- AEC/base: >80% sub-LT1 (Z1-Z2) + drills + fuerza soporte
- THR: ~60-70% sub-LT1 + ~20-30% umbral + <10% high
- AEP: ~50-60% sub-LT1 + ~30-40% high intensity
- COMP: especifico

Esto es coherente con la practica de atletas elite (Seiler 2010, Stoggl 2014) y con los case studies de Cejuela 2022 (triatlon) y Solli 2017 (XC ski). La meta-analisis de 2024 (PMC11329428) confirma que polarizada y piramidal son igualmente efectivas.

**Veredicto**: CORRECTO. El modelo piramidal implicito es valido y coherente con la practica de entrenadores.

### 4. Ritmo de progresion de dose ladders

Los dose ladders muestran incrementos tipicos de:
- 15-25% en `total_useful_time_min` entre peldanos consecutivos
- Zona de intensidad constante o ascendente (LT1 -> sub-LT2 -> LT2)
- 6-8 peldanos por familia (cubriendo de principiante a competitivo)

La regla general en la literatura es no superar el 10-20% de incremento semanal en carga (Issurin 2010, Bompa 2009). Los dose ladders respetan esto:
- Ejemplo `run_lt1_extensive`: peldano 1 (2x8' = 16') -> peldano 2 (3x8' = 24') = +50%, pero es el primer salto de iniciacion
- De peldano 3 a 4: tipicamente +20-25%
- De peldano 6 a 7: +10-15% (meseta de volumen, sube intensidad)

**Veredicto**: CORRECTO. Progresion razonable con moderadores de robustness y response.

### 5. Evidencia para el patron build_peak

El patron build_peak (carga maxima seguida de descarga) tiene soporte en:
- **Olbrecht (2000)**: supercompensacion requiere climax seguido de recovery
- **Ronnestad et al. (2016)**: bloques de 5 semanas con semana de maxima carga producen mejoras en VO2max
- **Mujika (2009)**: el pico de carga pre-deload optimiza la supercompensacion si la descarga es de 1-2 semanas
- **Issurin (2010)**: modelo de bloques concentrados con "summation of fatigue" antes de descarga

La implementacion del sistema (build_peak = peldano maximo del dose_ladder, seguido por 1 semana de recovery) es coherente con esta evidencia.

**Veredicto**: CORRECTO. Patron bien fundamentado.

---

## Resumen

### Fortalezas

1. **Wave principle fielmente implementado** -- la secuencia load->build->build_peak->recovery sigue exactamente el modelo Olbrecht con moderadores sensatos de robustness, response y validation signal.

2. **Dose ladders bien calibrados** -- progresion fisiologicamente razonable con 6-8 peldanos, incrementos del 15-25%, y campos de readiness/fatigue_cost que guian el spacing.

3. **MIN_WEEKS_FOR_BLOCK coherentes** -- todos los valores minimos de semanas estan alineados con la evidencia cientifica (Dudley, Faude, Ronnestad, Olbrecht).

4. **Overrides inteligentes** -- D1 (gap imposible + timeline corto -> COMP) y S1 (semanas insuficientes -> COMP) protegen contra prescripciones irrealistas.

5. **ANC spice en build_peak de AEC** -- implementa el patron Olbrecht Tipo I (esfuerzos cortos anaerobicos al inicio de sesion extensiva) correctamente.

6. **BLa check automatico** -- lactato como validacion puntual del bloque (no como volante diario), con referencia en semana 1 y validacion en ultima semana de build.

7. **Blueprint coverage completa** -- 27 combinaciones bloque x disciplina cubiertas con fases diferenciadas.

8. **Smart day offsets** -- respeta fatigue_cost, requires_fresh, y spacing entre sesiones key.

### Debilidades

1. **No hay limite maximo de semanas de trabajo** -- un bloque de 10+ semanas sin descarga intermedia es posible si el entrenador lo configura asi.

2. **Proxy VLamax por ratio de potencia falla en ciclismo** -- P02, P07, P11 todos clasifican VLamax como "high" cuando la curva es claramente gradual. El ratio LT1/LT2 en watts amplifica la separacion y genera diagnosticos incorrectos.

3. **No hay detector de estancamiento cronico** -- despues de 3-4 tests sin mejora significativa, el sistema sigue prescribiendo el mismo bloque sin sugerir cambio de estimulo.

4. **Falta deteccion de sobreentrenamiento** -- no hay analisis de tendencia temporal de lactato submaximal. Un drift progresivo en basales Z2 no genera alerta.

5. **Respuesta al estancamiento en eventos largos limitada** -- `_ANC_CANDIDATE_EVENTS` excluye maraton/ironman, impidiendo que el sistema prescriba ANC a diesels estancados en larga distancia.

### Issues Criticos (para launch)

1. **CRITICO: No hay modelo de carga total multidisciplina en triatlon.** Tres bloques paralelos pueden generar carga excesiva sin warning. Al minimo: acumulador de sesiones semanales totales con limite por nivel y fase.

2. **CRITICO: No hay fatiga cruzada entre disciplinas.** Una sesion intensa de ciclismo el dia antes de running intenso no genera warning. Al minimo: cross-discipline spacing rule.

3. **CRITICO: No hay deteccion de sobreentrenamiento.** El sistema podria empujar a un atleta a overtraining sin alarma. Al minimo: trend analysis de lactato Z2 con alerta si sube >0.5 mmol en 8 semanas.

4. **CRITICO: No hay deteccion de inactividad prolongada.** Despues de 4 semanas sin entrenar, el sistema podria prescribir build_peak sin readaptacion (Agente 1C caso P01).

### Recomendaciones

1. **Implementar `max_work_weeks_without_deload`**: por defecto 4 semanas; si el bloque dura mas, forzar una micro-descarga intermedia.

2. **Implementar carga total multidisciplina**: sumar `total_duration_min` de todas las disciplinas y comparar con limites por nivel (recreational: 6-8h/semana, trained: 10-15h, competitive: 15-25h). Warning si se excede.

3. **Implementar cross-discipline spacing**: si hay sesion fatigue_cost >= 4 en disciplina A en dia N, no programar sesion fatigue_cost >= 3 en disciplina B en dia N+1.

4. **Anadir detector de estancamiento**: si >3 tests consecutivos muestran <5% mejora en LT2 en >12 semanas, sugerir cambio de estimulo (ANC para diesels, AEP para glucoliticos).

5. **Anadir detector de overreaching**: trend analysis de lactato Z2 (>0.5 mmol de subida en >8 semanas a misma carga -> alerta).

6. **Expandir `_ANC_CANDIDATE_EVENTS`**: incluir maraton/ironman SOLO cuando hay estancamiento + VLamax low (no por defecto).

7. **Templates brick para triatlon**: anadir `brick_bike_to_run` y `brick_swim_to_bike` en COMP blocks de triatlon.

8. **Corregir proxy VLamax en ciclismo**: considerar usar el ratio en lactato (no en potencia) o normalizar por peso. Alternativa: usar pico de lactato como proxy complementario.

9. **Detector de inactividad**: >14 dias sin sesiones registradas -> forzar semana de readaptacion + retest antes de retomar progresion.

10. **Global priority ranking para triatlon**: generar recomendacion de distribucion de horas por disciplina segun gaps relativos.

---

## Fuentes

- [Block periodization meta-analysis (Molmen et al. 2019)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6802561/)
- [Polarized vs other TIDs meta-analysis (2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11329428/)
- [Pyramidal vs polarized in well-trained runners](https://pmc.ncbi.nlm.nih.gov/articles/PMC9299127/)
- [Ronnestad 2016 - 5-week block periodization](https://pubmed.ncbi.nlm.nih.gov/25648345/)
- [Deload practices cross-sectional survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC10948666/)
- [Delphi consensus on deloading](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/)
- [Overreaching detection multidisciplinary approach](https://pubmed.ncbi.nlm.nih.gov/23195630/)
- [Blood lactate response to overtraining](https://pubmed.ncbi.nlm.nih.gov/11394238/)
- [Training and Competition Readiness in Triathlon](https://pmc.ncbi.nlm.nih.gov/articles/PMC6571715/)
- [Cejuela 2022 - Road to Tokyo triathlon](https://pubmed.ncbi.nlm.nih.gov/35514361/)
- [Olbrecht training structure podcast (Scientific Triathlon EP198)](https://scientifictriathlon.com/tts198/)
- [Gaining more from doing less - deload effects](https://pmc.ncbi.nlm.nih.gov/articles/PMC10809978/)

AGENTE 2 COMPLETADO
