# Auditoria 07 -- Integracion Triatlon

## Resumen ejecutivo

El sistema tiene una integracion triatlon funcional y bien fundamentada cientificamente, con un motor dedicado (`triathlon_motor.py`), templates brick/transicion, y cobertura completa de natacion en la biblioteca de sesiones. Los factores de carrera triatlonicos (LT2_RACE_FACTOR, LT1_RACE_FACTOR) estan bien calibrados con penalizacion de fatiga acumulada por disciplina (Hausswirth 2013). Sin embargo, existen gaps significativos:

1. **No hay prediccion de tiempo total de triatlon** -- el prediction_engine solo cubre running y ciclismo.
2. **No hay modelado explicito de transiciones T1/T2** como unidades de tiempo.
3. **Natacion queda fuera del motor de debilidades** -- la comparacion es solo running vs ciclismo.
4. **No hay predicciones de natacion** (tiempos CSS, 400m, 1500m estimados).
5. **El modelo de datos es mono-disciplina por sesion** -- no captura sesiones brick como unidad atomica.

**Veredicto global**: Fundamentos solidos (8/10 en planificacion), pero la capa predictiva y de analisis esta incompleta para triatlon (4/10). El sistema actua mas como "3 deportes paralelos con reglas de spacing" que como un motor de triatlon integrado.

---

## Gestion multi-disciplina

### Modelo de datos

- **Athlete** (`backend/app/models/athlete.py`): campo `primary_discipline` (string unico). El atleta tiene un solo deporte primario. Para triatlon, se usa `goal_category` (ej. `"ironman"`, `"sprint_tri"`) combinado con `distance_category` en `AthleteTarget`.
- **AthleteTarget**: soporta targets multi-disciplina por carrera con campos separados: `target_pace_label` (running), `target_power_watts` (cycling generico), `target_running_pace_label`, `target_swim_pace_label`, `target_cycling_power_watts`. Esto permite definir objetivos por leg de triatlon.
- **AthleteFocusBlock**: tiene `priority_discipline` -- permite rotar la disciplina prioritaria entre bloques.
- **Sesiones**: cada sesion tiene una sola disciplina. No existe un tipo "brick" atomico que combine bike+run en un mismo registro.

**Hallazgo**: El modelo de targets es adecuado para triatlon (permite split por disciplina). El modelo de sesiones NO lo es (no puede representar un brick como entidad unica con datos de ambas disciplinas).

### Separacion de disciplinas en analisis

- `analytics.py` genera `discipline_views` automaticamente a partir de las disciplinas presentes en las sesiones del atleta (linea 2621-2628). Cada disciplina obtiene su propia vista con thresholds, estimates, evolution, etc.
- Los snapshots fisiologicos son por disciplina.
- El motor dinamico de umbrales opera por disciplina independiente.

**Veredicto**: CORRECTO. El sistema separa bien las disciplinas en analisis. Cada deporte tiene su propia "pista" de datos fisiologicos. No hay contaminacion cruzada.

---

## Predicciones triatlon

### No existe prediccion de tiempo total

`prediction_engine.py` (linea 1303-1342) solo tiene dos ramas:
- `normalized_discipline == "running"` -> `_running_estimates()`
- `normalized_discipline == "ciclismo"` -> `_cycling_estimates()`
- Cualquier otra disciplina -> `return []`

No hay logica para:
- Sumar tiempos estimados de swim + T1 + bike + T2 + run
- Aplicar factores de degradacion cruzada
- Estimar tiempos de transicion

### Transiciones T1/T2

- **No hay modelado numerico de T1/T2**. No se estima tiempo de transicion.
- Los templates `run_brick_transition` y `bike_transition_specific` ensenan a entrenar la transicion, pero no hay prediccion de cuanto tiempo tomara.
- Los `LT2_RACE_FACTOR` triatlonicos (ej. `ironman_run: 0.74 trained`) implicitamente absorben la degradacion post-bike, pero esto es para calcular LT2 requerido, no para predecir tiempo total.

### Fatiga acumulada inter-disciplina

El sistema modela la fatiga acumulada de forma **indirecta** a traves de:

1. **LT2_RACE_FACTOR por leg**: `ironman_run` (0.74) vs `ironman_bike` (0.73) vs `ironman` generico (0.74). Estos factores son significativamente mas bajos que los equivalentes puros (`marathon`: 0.87), reflejando el coste de la fatiga previa. Referencia: Hausswirth & Mujika 2013.
2. **ECO_WEIGHT** en `triathlon_motor.py`: running=1.0, ciclismo=0.50, natacion=0.75 (Cejuela 2022). Pondera el coste mecanico por disciplina.
3. **Spacing rules** en `_cross_discipline_day_assignment()`: prohibe KEY de diferentes disciplinas en dias consecutivos, fuerza order bike->run en bricks.

**Falta**: No hay modelo di Prampero multi-segmento que encadene los 3 legs con degradacion progresiva del VO2max disponible.

---

## Natacion

### CSS vs umbrales de lactato

- **Athlete model** tiene `css_swimming_pace` (sec/100m) como campo dedicado.
- Los `LT2_RACE_FACTOR` incluyen natacion: `pool_400`, `pool_800_1500`, `open_water_short`, `open_water_long` con la anotacion "CSS ~ LT2 en piscina (Olbrecht)".
- Los benchmarks aerobicos de natacion existen en `LT2_AEROBIC_BENCHMARKS["natacion"]` con rangos por nivel.
- **El prediction_engine NO genera estimaciones para natacion** (linea 1342: `return []` para discipline != running/ciclismo).

**Hallazgo critico**: El sistema reconoce la natacion a nivel fisiologico (umbrales, factores de carrera) pero no produce predicciones de rendimiento para ella. Un triatleta no puede ver tiempos estimados de 400m, 1500m, o 3800m.

### Templates de natacion

La biblioteca de sesiones es rica en natacion (18+ templates):

| Template | Bloque | Descripcion |
|---|---|---|
| `swim_technical_alignment` | Technical rebuild | Tecnica/alineamiento |
| `swim_aerobic_continuity` | AEC | Continuidad aerobica |
| `swim_css_threshold` | Threshold | CSS/umbral |
| `swim_race_pace_specific` | Competition | Ritmo de carrera |
| `swim_lt1_broken_sets` | AEC | Series rotas LT1 |
| `swim_pull_snorkel_alignment` | Technical | Pull con snorkel |
| `swim_vo2_anaerobic` | AEP | VO2/anaerobico |
| `swim_speed_turns` | AEP/ANP | Velocidad y virajes |
| `swim_open_water_specific` | Competition | Aguas abiertas |
| `swim_recovery_drills` | Recovery | Recuperacion |
| `swim_aec_base` | AEC | Base aerobica |
| `swim_aec_spiced` | ANC | AEC con estim. anaerobico |
| `swim_anc_capacity_sets` | ANC | Capacidad anaerobica |
| `swim_anp_tolerance` | ANP | Tolerancia anaerobica |
| `swim_varied_aerobic` | AEC | Aerobico variado |
| `swim_lt0_50s` | AEC | Series 50m sub-LT1 |
| `swim_team_quality` | AEP | Calidad en equipo |
| `swim_strength_velocity` | ANP | Fuerza-velocidad |

Todos con `evidence_ids` referenciando literatura real (Gonzalez-Rave 2022, Pla 2019).

### WORKOUT_BLUEPRINTS para natacion

Cobertura completa con 8 blueprints:
- `("natacion", "technical_rebuild_block")`
- `("natacion", "aerobic_capacity_block")`
- `("natacion", "threshold_development_block")`
- `("natacion", "aerobic_power_block")`
- `("natacion", "competition_specific_block")`
- `("natacion", "testing_decision_block")`
- `("natacion", "anaerobic_capacity_block")`
- `("natacion", "anaerobic_power_block")`

Cada uno con fases load/build/build_peak/recovery y alternativas de sesion.

### Power source handling

No se maneja `power_source` para natacion. No hay integracion con sensores de fuerza acuatica (ej. FORM goggles, TritonWear). La natacion se trata puramente via pace (sec/100m).

---

## Ciclismo en contexto triatlon

### FTP vs sesiones combinadas

- El atleta almacena `ftp_cycling_watts` y `cycling_interpolated_from_running` (si no hay datos de bici, se interpolan desde running).
- Los factores de carrera de ciclismo en triatlon son significativamente mas bajos que los puros: `ironman_bike` trained=0.73 vs `road_tt_long` trained=0.89. Esto refleja correctamente la necesidad de conservar energia para el run leg.

### Templates brick

3 templates de brick/transicion identificados:

1. **`run_brick_transition`** (running, support): "Carrera de transicion" -- 20-60' tras bici. Para comp_specific y threshold blocks. Evidencia: Cejuela 2022.
2. **`bike_transition_specific`** (ciclismo, key): "Especificidad de transicion" -- bici que prepara la carrera posterior. Para comp_specific blocks. Evidencia: Cejuela 2022.
3. **`tri_brick_aep`** (triatlon, key): "Brick AEP triatlon" -- 45-75' bici a potencia de prueba + T2 + 15-25' carrera. Para AEP y comp_specific. Evidencia: Cejuela 2022, Vikmoen 2021.

**Hallazgo**: El `tri_brick_aep` esta bajo discipline="triatlon" (no "running" ni "ciclismo"), lo que puede causar problemas si los blueprints no lo referencian explicitamente.

---

## Bloques de entrenamiento triatlon

### Como se selecciona bloque con 3 disciplinas

El flujo en `triathlon_analysis()` (planning_engine.py, linea 2473-2648):

1. **Identificar disciplina debil** (`identify_weakest_discipline`): compara SOLO running vs ciclismo usando 3 senales:
   - A: Gap vs objetivo (factores di Prampero/race)
   - B: Tendencia de curva LT2 (delta % 180d)
   - C: Cross-benchmark (percentil cruzado Friel/Coggan)
2. **Prescribir bloque para la debil** (disciplina primaria) via `recommend_next_mesocycle()`.
3. **Consultar el motor para la secundaria** (la otra entre run/bike) via un segundo `recommend_next_mesocycle()`.
4. **Natacion**: se determina automaticamente con `resolve_swim_block(season_phase)`:
   - base_early/base_late -> `aerobic_capacity_block`
   - specific -> `threshold_development_block`
   - pre_comp -> `competition_specific_block`
   - taper -> `recovery_consolidation_block`
5. **Construir mesociclo integrado** via `build_triathlon_mesocycle_draft()` en `triathlon_motor.py`.

### Priorizacion de disciplina limitante

- TSS split basado en confianza de la debilidad:
  - Alta confianza: 55% primaria, 30% secundaria, 15% swim
  - Moderada: 50/30/20
  - Baja: 40/35/25
- El bloque de natacion NO depende del estado fisiologico real de la natacion -- solo de la fase de temporada global. Esto es intencional: "el limitante en natacion suele ser tecnico (hidrodinamica, patada, agarre), no metabolico."

### Cross-discipline spacing (triathlon_motor.py)

Reglas implementadas (lineas 173-258, 300-343):
1. No 2 KEY de diferentes disciplinas en dias consecutivos (Olbrecht)
2. Same-day brick: bike antes que run (Millet 2002)
3. Solo 1 LONG por fin de semana
4. Swim puede doublar con land sessions (AM swim + PM land)
5. Secondary capped a 2 sesiones/semana (1 KEY + 1 support)
6. Swim capped a 3 sesiones/semana

---

## Hallazgos criticos

### H1 -- Sin prediccion de tiempo total de triatlon (GRAVE)
El prediction_engine retorna `[]` para cualquier disciplina que no sea running o ciclismo. No existe funcion que sume los 3 legs + transiciones para estimar un finish time. Para un atleta de ironman, no puede ver "tu tiempo estimado es 10:45:00" con breakdown por leg.

### H2 -- Natacion excluida de la deteccion de debilidades (MODERADO)
`identify_weakest_discipline()` solo compara running vs ciclismo. Si un triatleta pierde 15 minutos en la natacion respecto a sus rivales pero solo 2 minutos en bici, el sistema no lo detectara. La justificacion ("limitante tecnico") es parcialmente valida pero no cubre todos los casos -- un nadador con CSS muy bajo puede beneficiarse de bloques fisiologicos de natacion.

### H3 -- Sin modelo de degradacion progresiva inter-leg (MODERADO)
Los `LT2_RACE_FACTOR` por leg son estaticos. No modelan que la degradacion del run leg depende de cuanto se "gasto" en el bike leg. Un atleta que va al 90% FTP en bici tendra peor run que uno que va al 75% FTP. Este trade-off no esta modelado.

### H4 -- Sesiones brick no son unidades atomicas en la DB (MENOR)
Un brick (60' bici + 20' carrera) se puede prescribir como template (`tri_brick_aep`) pero cuando se ejecuta, se registra como 2 sesiones separadas. No hay manera de vincularlas en la DB para analisis posterior (ej. "como fue tu degradacion pace post-T2").

### H5 -- Swim block selection ignora estado fisiologico real (MENOR)
`resolve_swim_block()` usa solo la fase de temporada, no el estado real del nadador (CSS actual vs objetivo, test age, etc.). Si un nadador tiene el CSS estancado durante meses, el sistema no lo detecta.

### H6 -- Template `tri_brick_aep` con discipline="triatlon" (MENOR)
Este template usa `discipline="triatlon"` en vez de `"running"` o `"ciclismo"`. Si los WORKOUT_BLUEPRINTS no lo referencian explicitamente bajo esa disciplina, puede quedar huerfano en la prescripcion automatica.

---

## Recomendaciones

### Prioridad alta

1. **Implementar prediccion de tiempo total de triatlon**:
   - Reusar `_running_estimates()` y `_cycling_estimates()` para run y bike legs.
   - Anadir `_swimming_estimates()` basada en CSS y factores de distancia.
   - Sumar con T1 (~1-2 min) y T2 (~45s-2 min) como constantes ajustables.
   - Aplicar factores de degradacion cruzada ya existentes en `LT2_RACE_FACTOR`.

2. **Incluir natacion en `identify_weakest_discipline()`**:
   - Al menos como flag "swim_needs_attention" cuando el CSS esta lejos del objetivo.
   - No necesita participar en el voting system si el equipo mantiene la filosofia de "limitante tecnico", pero deberia emitir un warning.

### Prioridad media

3. **Modelo de pacing strategy inter-leg**:
   - Dado un objetivo de finish time, calcular el split optimo bike/run usando la curva de degradacion (Hausswirth 2013: ~8-12% degradacion run por cada 5% extra de intensidad en bike).

4. **Vincular sesiones brick en la DB**:
   - Anadir campo `linked_session_id` o `brick_group_id` en el modelo Session para agrupar las partes de un brick.

### Prioridad baja

5. **Swim block con input fisiologico**: Pasar el CSS actual y test age a `resolve_swim_block()` para que pueda recomendar threshold en vez de AEC cuando el nadador esta estancado.

6. **Predicciones de natacion standalone**: Implementar `_swimming_estimates()` usando CSS como anchor (Olbrecht: CSS ~ LT2) y factores de distancia para 400m, 800m, 1500m, 3800m.

---

## Referencias bibliograficas

1. **Hausswirth C, Mujika I (2013)**. *Recovery for Performance in Sport*. Human Kinetics. Usado para factores de fatiga acumulada inter-disciplina en triatlon.
2. **Millet GP et al. (2002)**. *Modelling the transfers of training effects on performance in elite triathletes*. Int J Sports Med. Usado para regla de spacing bike->run en brick.
3. **Cejuela R et al. (2022)**. *Training models in triathlon*. Usado como evidencia para templates de transicion y brick. Peso ECO por disciplina.
4. **Vikmoen O et al. (2021)**. *Strength training in triathlon*. Evidencia para templates de fuerza y brick AEP.
5. **Olbrecht J (2000)**. *The Science of Winning*. Modelo de dos poleas VO2max/VLamax. CSS ~ LT2 en natacion.
6. **Maglischo EW (2003)**. *Swimming Fastest*. Referencia para CSS y umbrales de natacion.
7. **Laursen PB (2002)**. *The scientific basis for high-intensity interval training*. Factores de intensidad en ironman.
8. **Faude O et al. (2009)**. *Lactate threshold concepts*. Sports Med. Calibracion de LT2.
9. **Gonzalez-Rave JM et al. (2022)**. *Training periodization for 400IM swimmer*. Evidencia para templates de natacion.
10. **Pla R et al. (2019)**. *Periodization of swimming training*. Evidencia para templates de natacion.
11. **Billat VL et al. (2003)**. *%VO2max at marathon pace*. Factores de carrera en larga distancia.
12. **Daniels J, Gilbert J (1979)**. *VDOT tables*. Fraccion sostenible de VO2max por duracion.

---

## Tests ejecutados

146 tests relacionados con triatlon pasaron correctamente:
- 12 tests de `test_physiological_engine.py` cubriendo sprint_tri, olympic_tri, 70.3, ironman (run y bike legs)
- Tests de multi-block progression con natacion (sprint_tri, ironman, olympic_tri)
- Tests de stress lifecycle con sprint_tri, olympic_tri, 70.3, ironman
- Tests de planning pipeline e2e con natacion (olympic_tri, sprint_tri, ironman)

Todos los tests pasaron (0 fallos). La cobertura de test para los factores de carrera triatlonicos y seleccion de bloque es adecuada. No hay tests para:
- Prediccion de tiempo total de triatlon (no existe la funcionalidad)
- Degradacion inter-leg (no existe la funcionalidad)
- `triathlon_motor.py` directamente (no hay test unitario dedicado)
