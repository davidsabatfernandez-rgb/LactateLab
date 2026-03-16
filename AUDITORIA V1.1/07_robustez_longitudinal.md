# Auditoría 07 — Robustez Longitudinal del Motor

**Fecha:** 2026-03-15
**Alcance:** Comportamiento del sistema con datos acumulados a lo largo de meses/años.
**Archivos auditados:**
- `backend/app/services/analytics.py` — detección de umbrales por sesión, agregación multi-método
- `backend/app/services/dynamic_threshold_engine.py` — modelo dinámico multi-sesión (agudo/crónico)
- `backend/app/services/physiological_engine.py` — perfil fisiológico, selección de bloque
- `backend/app/services/planning_engine.py` — planificación, detección de estancamiento/inactividad
- `backend/app/services/training_load_calculator.py` — EWMA de carga (ATL/CTL/TSB)

---

## Referencia científica: variabilidad del umbral de lactato

Antes de evaluar el motor, es necesario establecer la variabilidad esperada del dato de entrada.

| Parámetro | Valor | Fuente |
|---|---|---|
| CV test-retest del umbral de lactato | 3.4--3.7% | [Plos One (2016)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0163389) |
| CV método Dmax | ~10.3% | [Plos One (2016)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5033582/) |
| CV métodos ventilatorios | 1.6--3.5% | [Frontiers Physiol. (2018)](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.01320/full) |
| Fiabilidad test-retest (r) para vel. a LT, 2.0 mM, 4.0 mM | 0.89, 0.91, 0.95 | [Weltman 1990 (PubMed)](https://pubmed.ncbi.nlm.nih.gov/2318561/) |
| CV analizadores portátiles de lactato | 3--7% | [PMC (2015)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4306774/) |
| Frecuencia óptima de re-test | 4--6 semanas (competición), 8--12 semanas (general) | [TrainingPeaks](https://www.trainingpeaks.com/coach-blog/lactate-threshold-testing-better-performance/), [CTS](https://trainright.com/the-performance-benefits-of-lactate-threshold-testing-and-training/) |
| Estabilidad longitudinal LT (%VO2max) en master | r = 0.29 (pobre) | [PubMed (2003)](https://pubmed.ncbi.nlm.nih.gov/12750591/) |
| Repetibilidad conceptos LT para predicción rendimiento | ICC > 0.91 excepto V-Slope | [PMC (2018)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6167480/) |

**Implicación clave:** Una variación de ~3.5% entre tests idénticos es ruido biológico/instrumental, no adaptación. El motor debe absorber esta variación sin reportar falsa evolución ni falsas alarmas.

---

## Escenario 1: Estagnación (10 tests idénticos en 6 meses)

### Motor de umbrales por sesión (`analytics.py`)

**Comportamiento esperado: CORRECTO.** Cada sesión se analiza de forma independiente. Con valores idénticos, `_method_baseline_rise`, `_method_sustained_increase` y `_method_moddmax` producirán los mismos índices LT1/LT2 en cada sesión. La agregación (`_aggregate_threshold`) producirá idénticos resultados cada vez. No hay falsa evolución.

**Real thresholds (`_detect_real_thresholds`):** Con datos idénticos, monotonicity, signal_score, y agreement_score serán constantes. Una vez que se confirma el LT REAL en un test, se confirmará idénticamente en los siguientes. Correcto.

### Motor dinámico multi-sesión (`dynamic_threshold_engine.py`)

**Comportamiento: CORRECTO con matiz.** El modelo usa dos ventanas:
- **Agudo:** 10 días (`acute_window_days`)
- **Crónico:** 42 días (`chronic_window_days`)

Con tests cada ~18 días, el modelo agudo solo verá 1 test. El crónico verá 2-3 tests. La recency_weight decae exponencialmente con half-life de 18 días (`recency_decay_days = 18`). Con datos idénticos, la estimación será estable porque la regresión ponderada producirá el mismo resultado independientemente de los pesos relativos cuando todos los puntos tienen el mismo valor de lactato al mismo ritmo.

**Matiz:** La `_stability_score` (LOO) será alta y constante. La `_point_influence_score` disminuirá progresivamente (0.92 con 1 punto -> 0.35 con 8 puntos -> 0.22 con 12 puntos), lo cual es correcto: cada punto nuevo tiene menos impacto marginal.

**Comparación agudo-crónico:** `_comparison_metric` mostrará `direction = "stable"` en todos los metrics. Correcto.

### Motor fisiológico (`physiological_engine.py`)

**Comportamiento: PROBLEMÁTICO.** El selector de bloque depende de:
1. La fase de temporada (`_season_phase`): evoluciona con `weeks_to_goal`, no con los datos.
2. El gap fisiológico: constante si el target no cambia.
3. El perfil de capacidades: constante.

**Resultado:** El motor recomendará el **mismo bloque** repetidamente mientras `weeks_to_goal` no cambie de fase. Esto es correcto fisiológicamente cuando el atleta no mejora: el limitante sigue siendo el mismo. Sin embargo, **no hay mecanismo para escalar la insistencia ni sugerir un cambio de estímulo tras N bloques idénticos sin resultado**, salvo la detección de estancamiento.

### Detección de estancamiento (`_detect_stagnation`)

**Comportamiento: CORRECTO.** Con 10 tests en 180 días y <5% de mejora, la función detectará `stagnation_detected = True` tras el 3er test (`_STAGNATION_MIN_TESTS = 3`). Esto activará la ruta ANC en `_apply_capacity_profile` si el perfil es diesel y la fase es `base_late + prueba corta`.

**Hallazgo positivo:** El sistema tiene un mecanismo de "rotura de plateau" via estancamiento, lo cual evita la prescripción circular infinita.

### CTL (`training_load_calculator.py`)

**Comportamiento: CORRECTO.** Si el atleta entrena idénticamente, el EWMA (tau=42, alpha=2/43) convergerá a un valor estable en ~84 días (2 tau). Tras 6 meses de carga constante, CTL será perfectamente plano. ATL (tau=7) converge en ~14 días. TSB permanecerá en 0 (ATL = CTL). ACWR permanecerá en 1.0. Correcto.

**VEREDICTO ESCENARIO 1:** PASA. No hay falsa evolución. El estancamiento se detecta correctamente. CTL se estabiliza. El único punto débil es que no hay feedback cualitativo al entrenador del tipo "llevas 4 bloques AEC sin cambio -- plantea algo diferente" fuera de la ruta ANC.

---

## Escenario 2: Mejora gradual (~5 s/km cada 6 semanas, 12 meses)

### Motor por sesión (`analytics.py`)

5 s/km en 6 semanas equivale a ~0.15 km/h por test (a 4:30/km LT2 = 13.3 km/h, 0.15 km/h = ~1.1%). Dado que el CV test-retest es ~3.5%, una mejora de 1.1% por test **no se distinguirá del ruido en una sola sesión**. Solo tras 3-4 tests (18-24 semanas) la mejora acumulada (~0.5 km/h, ~3.7%) superará el ruido.

La detección per-session no tiene "memoria" -- cada sesión se analiza independientemente. El LT2 detectado será ligeramente mejor cada vez, pero con alta varianza entre sesiones.

### Motor dinámico (`dynamic_threshold_engine.py`)

**Detección de progresión: CON LAG SIGNIFICATIVO.**

- Ventana crónica (42d): verá ~1 test viejo + 0-1 test nuevo. El recency_weight del test viejo será `exp(-42/18) = 0.098`. Con solo 2 puntos, la interpolación es inestable.
- Ventana aguda (10d): si el test cae dentro de estos 10 días, lo captura a peso completo. Si no, el modelo agudo tiene 0 puntos -> sin estimación.

**Lag estimado:** La mejora real de 5 s/km cada 6 semanas solo será capturada por el modelo crónico con ~1 test de retraso (6 semanas). El modelo agudo la capturará inmediatamente tras un test, pero pierde señal entre tests.

**Mecanismo clave:** La línea 546-553 de `physiological_engine.py` hace un blend del 40% (`_DYN_BLEND = 0.40`) cuando el modelo dinámico muestra un umbral **mejor** que el per-session. Esto ayuda a capturar progresión sub-paso. Pero solo funciona en una dirección (mejora), no en regresión.

### Actualización automática de zonas de entrenamiento

**HALLAZGO CRITICO: NO HAY ACTUALIZACIÓN AUTOMÁTICA DE ZONAS.** Las zonas de entrenamiento dependen de los practical_lt1 y practical_lt2 del dynamic_threshold_engine, que se recalculan en cada análisis. Sin embargo:

1. Los umbrales prácticos solo se actualizan cuando se ejecuta `athlete_analysis_payload` (típicamente al cargar la página del atleta).
2. **No hay mecanismo push** que notifique al entrenador "las zonas han cambiado significativamente".
3. Las sesiones planificadas (`PlannedSession`) contienen `dose_prescription` y `dose_guidance` con valores absolutos (ritmos, potencias). Si los umbrales cambian, **las sesiones ya planificadas NO se actualizan automáticamente**.

**Riesgo:** Un atleta que mejora 5 s/km cada 6 semanas entrenará con prescripciones progresivamente subóptimas entre re-planificaciones.

### Progresión del bloque (AEC -> THR -> AEP)

**Comportamiento: DEPENDE DEL GAP.** La progresión lógica funciona:

1. Con LT2 lejos del target -> `aerobic_capacity_block` (base) o `threshold_development_block`
2. Conforme LT2 cierra el gap -> `lt2_gap <= moderate_gap` dispara `aerobic_power_block` en base_late
3. Con gap cerrado en specific/pre_comp -> `competition_specific_block`

Pero esta progresión depende de que el target (ritmo objetivo de carrera) sea realista. Si el target es demasiado ambicioso, el atleta quedará indefinidamente en AEC/THR a pesar de mejorar.

**VEREDICTO ESCENARIO 2:** PASA CON RESERVAS.
- (+) La progresión de bloques funciona lógicamente.
- (+) El blend dinámico del 40% captura progresión sub-paso.
- (-) **Las sesiones planificadas no se actualizan cuando cambian los umbrales** -- riesgo de prescripción obsoleta.
- (-) No hay alerta proactiva de "tus zonas han cambiado".
- (-) Lag de 6+ semanas en la detección de progresión por el modelo dinámico.

---

## Escenario 3: Dato tóxico (1 test enfermo tras 15 limpios)

### Motor por sesión (`analytics.py`)

El test enfermo (lactatos 2x normales) producirá:

1. **Baseline arruinado:** Si los primeros 4 valores ya superan 3.0 mmol, el test se invalida completamente (`_BASELINE_ARRUINADO_THRESHOLD = 3.0`). Resultado: no se publican umbrales. **Protección correcta.**

2. **Si el baseline es normal pero los valores altos son 2x:** Los métodos detectarán un LT2 falso mucho antes en la curva (a menor intensidad). La confianza será más baja porque la curva es anómala, pero se publicarán umbrales.

3. **Validación LT1 < LT2:** Si los valores 2x producen LT1 >= LT2 en lactato, se invalidan ambos. **Protección parcial.**

### Motor dinámico (`dynamic_threshold_engine.py`)

**Protección multi-capa:**

1. **Filtro de extremos absolutos** (líneas 1132-1141): Si `raw_lactate > max(7.0, p90 * 1.3)`, el punto recibe `point_weight * 0.04`. Con p90 de los 15 tests limpios ~5 mmol, el umbral sería max(7.0, 6.5) = 7.0. Valores >7 mmol serían aplastados. **Protección parcial** -- valores de 6-7 mmol pasan.

2. **Consistencia intra-sesión** (líneas 1143-1149): LOO dentro del test enfermo. Si >40% de puntos son anómalos (safeguard), no se aplica el filtro. Con un test completo de valores 2x, todos los puntos serán "anómalos" juntos -> el safeguard los preserva con peso original. **FALLO: el test enfermo se trata como una sesión coherente internamente.**

3. **Filtro isotónico** (PAVA): Detecta violaciones de monotonía carga->lactato. Un test enfermo con curva monotónica (solo desplazada verticalmente) no será filtrado. **No protege contra este escenario.**

4. **Detección de outliers LOO** (`_detect_outliers_in_lactate_space`): Solo se aplica cuando `robust=True` (solo practical_lt1 y practical_lt2, no reference_2mmol/4mmol). El LOO compara cada punto contra la regresión del resto. Con 15 tests limpios + 1 enfermo, el test enfermo producirá residuales altos. Los puntos con `residual > 1.0 mmol` (`outlier_residual_threshold`) reciben `point_weight * 0.25`.

**Impacto cuantitativo del test enfermo:**
- En el modelo crónico (42d): si el test enfermo cae dentro de la ventana, sus puntos tendrán `recency_weight * 0.25` (por outlier). Con ~3-4 tests en la ventana, el test enfermo contribuirá ~6-8% del peso total (vs ~25-33% sin filtro). **Reducción sustancial pero no eliminación.**
- En el modelo agudo (10d): si el test enfermo es el más reciente, dominará el modelo agudo. **Sin protección efectiva.**

### Cuántos tests limpios para "lavar" el dato tóxico

- **Modelo agudo (10d):** 1 test limpio dentro de 10 días -> el test enfermo queda fuera de la ventana. **1 test basta.**
- **Modelo crónico (42d):** El test enfermo sale naturalmente tras 42 días. Con `recency_decay_days = 18`, su peso relativo cae a 0.098 tras 42 días. En la práctica, **2-3 tests limpios** (1 cada 2-3 semanas) reducen el impacto a <3% del modelo.
- **Motor fisiológico:** Usa el snapshot del último test. Si el test enfermo fue el último, el perfil fisiológico se basa en él hasta que se realice un nuevo test. **1 test limpio basta** para reemplazarlo.

### Cambio de recomendación de bloque

**Riesgo real.** Si el test enfermo produce:
- LT2 más lento -> gap se agranda -> el motor puede cambiar de `competition_specific_block` a `threshold_development_block` o `aerobic_capacity_block`.
- Perfil VLamax alterado -> ratio LT1/LT2 cambia -> puede cambiar clasificación diesel/glucolítico.

**VEREDICTO ESCENARIO 3:** PARCIALMENTE PROTEGIDO.
- (+) Baseline >3.0 mmol invalida el test completamente.
- (+) LOO en los prácticos reduce el peso del outlier x4.
- (+) El modelo agudo se limpia en 10 días automáticamente.
- (-) **El safeguard intra-sesión (40%) preserva un test enfermo coherente** -- un test donde todos los valores son consistentemente 2x NO es filtrado por intra-session LOO.
- (-) **Reference_2mmol y reference_4mmol no usan `robust=True`** -- solo los prácticos tienen protección LOO.
- (-) El motor fisiológico puede cambiar de bloque basándose en 1 solo test malo.
- **RECOMENDACIÓN:** Añadir un mecanismo de "test flagging" que compare el test actual contra la mediana de los N anteriores. Si la desviación es >2 SD, marcar como sospechoso y requerir confirmación del entrenador antes de actualizar el perfil.

---

## Escenario 4: Regresión (2 meses inactivo, retorno con umbrales menores)

### Motor dinámico

**Comportamiento: CORRECTO.** Tras 2 meses sin tests:
- Modelo agudo (10d): vacío -> sin estimación.
- Modelo crónico (42d): vacío -> sin estimación.
- Los tests anteriores han caído fuera de ambas ventanas.

Al retomar y hacer un test, el motor parte "de cero" en ambos modelos. Los nuevos umbrales (menores) se establecen sin contaminación de los datos anteriores. **Correcto.**

### Detección de inactividad (`_detect_inactivity`)

**Comportamiento: CORRECTO.** Con `_INACTIVITY_THRESHOLD_DAYS = 14`, tras 2 meses se detecta inactividad. El warning prescribe:
- Semana de readaptación progresiva.
- Prohibición de build_peak y sesiones de fatigue_cost >= 4 en las primeras 2 semanas.

### CTL y TSB

**Comportamiento: CORRECTO con advertencia.** EWMA con tau=42 y alpha=2/43:
- CTL decae ~4.65% diario. Tras 60 días: CTL = CTL_inicial * (1 - 0.0465)^60 = CTL_inicial * 0.054. Es decir, CTL cae al 5.4% del valor inicial. **Correcto.**
- ATL decae más rápido (tau=7): tras 60 días es esencialmente 0. **Correcto.**
- TSB = CTL - ATL sera positivo (el atleta está "descansado" según el modelo). **Correcto.**

### Prescripción conservadora al retomar

**Comportamiento: PARCIALMENTE CORRECTO.**
- La inactividad se detecta y genera warnings.
- El motor fisiológico usa el test más reciente (pre-inactividad, ya obsoleto). `test_age_days` será >56 días. En fase specific/pre_comp, esto dispara `testing_decision_block`. En base phases, se acepta con `data_quality = "low"`.
- **Si el atleta hace un nuevo test**, los umbrales reflejarán la regresión. El gap se agrandará y el motor prescribirá bloques más conservadores (AEC).

**Riesgo:** Si el atleta no hace un test inmediato y el entrenador arranca un bloque basándose en datos pre-inactividad, las prescripciones estarán calibradas a un nivel que el atleta ya no tiene. La advertencia de `data_quality = "low"` mitiga pero no bloquea.

**VEREDICTO ESCENARIO 4:** PASA.
- (+) CTL decae correctamente.
- (+) Inactividad detectada con prescripciones conservadoras.
- (+) El motor dinámico no arrastra datos obsoletos.
- (+) Test >56d en specific/pre_comp -> testing_decision_block.
- (-) En base phases, datos obsoletos se usan con advertencia pero sin bloqueo.

---

## Escenario 5: Heterogeneidad de protocolo (3 min vs 5 min/paso)

### Motor por sesión (`analytics.py`)

**Comportamiento: PARCIALMENTE GESTIONADO.**

El `_interval_protocol_score` pondera la calidad del protocolo:
- 3 min/paso (180s): `_interval_duration_score(180) = 0.58` (sub-óptimo)
- 5 min/paso (300s): `_interval_duration_score(300) = 0.92` (óptimo)

Esto afecta la confianza de cada estimación:
```
confidence = min(0.88, 0.56 + n_candidates * 0.05)
confidence *= (0.72 + protocol_score * 0.28)
```

Un test de 3 min/paso con 6 escalones: confidence = min(0.88, 0.86) * (0.72 + 0.58*0.28) = 0.86 * 0.882 = 0.76.
Un test de 5 min/paso con 6 escalones: confidence = 0.86 * (0.72 + 0.92*0.28) = 0.86 * 0.978 = 0.84.

La diferencia de confianza (0.76 vs 0.84) es modesta. **Los resultados se mezclan sin normalización formal del protocolo.**

### Motor dinámico

**Comportamiento: CON SESGO POTENCIAL.** El `_session_context_score` incluye `protocol_score`, que pondera los puntos del test de 3 min con menor peso que los de 5 min. Esto es correcto en principio (los valores de lactato de pasos de 3 min son fisiológicamente menos fiables por no alcanzar estado estable).

Sin embargo, **no hay normalización explícita** que ajuste los valores de lactato por la duración del paso. Un paso de 3 minutos produce valores de lactato ~0.2-0.5 mmol menores que un paso de 5 minutos a la misma intensidad (el lactato no ha alcanzado estado estable). Esta diferencia sistemática **no se corrige**.

**HALLAZGO:** La mezcla de protocolos de 3 min y 5 min introduce un sesgo sistemático de ~0.3 mmol en lactato que el motor no corrige. Esto puede producir:
- LT2 aparentemente mayor (más rápido) con tests de 3 min (subestimación del lactato).
- Oscilación en las estimaciones al alternar protocolos.

### Comparabilidad de resultados

**HALLAZGO CRITICO: NO HAY NORMALIZACIÓN DE PROTOCOLO.** El sistema no registra la duración del paso del protocolo como metadato de la sesión (solo la duración de cada intervalo individual). No hay corrección por lactato acumulado incompleto. Los tests de diferentes protocolos se mezclan como si fueran comparables.

**VEREDICTO ESCENARIO 5:** FALLO PARCIAL.
- (+) El protocol_score penaliza correctamente tests sub-óptimos.
- (-) **No hay normalización de los valores de lactato** por duración de paso.
- (-) La mezcla de protocolos introduce sesgo sistemático de ~0.3 mmol.
- **RECOMENDACIÓN:** Registrar `step_duration_seconds` como metadato del test. Aplicar factor de corrección basado en la relación empírica lactato_5min/lactato_3min (~1.08-1.15, Heck 1985) o, como mínimo, agrupar los tests por familia de protocolo y no mezclarlos en la interpolación.

---

## Escenario 6: Desequilibrio de densidad temporal (18 tests m1-6, 2 tests m7-12)

### Motor dinámico

**Comportamiento: CORRECTO por diseño.** La ventana crónica de 42 días es relativamente corta. En el mes 12, el modelo crónico solo ve tests de los últimos 42 días. Los 18 tests de los meses 1-6 están completamente fuera de la ventana y NO contribuyen.

Incluso dentro de la ventana de 42 días, el `recency_weight` con `recency_decay_days = 18` hace que un test de hace 42 días tenga peso `exp(-42/18) = 0.098` (10% del peso de un test de hoy). **Los tests viejos no dominan.**

### Motor por sesión

**Comportamiento: SIN PROBLEMA.** Cada sesión se analiza de forma independiente. No hay acumulación temporal.

### Motor fisiológico

**Comportamiento: POTENCIALMENTE PROBLEMÁTICO.** El motor usa el `latest_snapshot` -- es decir, el test más reciente, independientemente de cuántos tests haya. Con 2 tests en 6 meses, el último test determina todo el perfil. Si ese test fue ruidoso o atípico, no hay respaldo estadístico de otros tests recientes.

**Mitigación existente:** `data_quality = "low"` cuando `test_age_days > 42`. Con tests cada 3 meses (12 semanas), el test tiene 12 semanas de antigüedad durante la mayoría del periodo -> `data_quality = "low"` la mayor parte del tiempo. Pero el motor sigue prescribiendo bloques basándose en datos de baja calidad (no bloquea, solo advierte).

### Individual thresholds (`_aggregate_individual_threshold`)

**Comportamiento: BIEN PROTEGIDO.** El sistema de umbrales individuales requiere `_INDIVIDUAL_MIN_SUPPORT_SESSIONS = 6` sesiones con resultados compatibles y `_INDIVIDUAL_MIN_PROGRESSION_ALIGNMENT = 0.75`. Con solo 2 tests en 6 meses, no se alcanza el mínimo de soporte -> los umbrales individuales no se publican. **Correcto.**

### Stagnation detection

**Comportamiento: SENSIBLE A LA DENSIDAD.** Con `_STAGNATION_LOOKBACK_DAYS = 180` y `_STAGNATION_MIN_TESTS = 3`, necesita 3 tests en 180 días. Con 2 tests en meses 7-12, no se alcanza el mínimo -> **estancamiento no detectable**. Si el atleta realmente está estancado, el sistema no lo sabe.

**VEREDICTO ESCENARIO 6:** PASA CON MATICES.
- (+) La ventana de 42 días evita que datos antiguos dominen.
- (+) El recency_weight refuerza la ponderación temporal.
- (-) Con densidad muy baja (<3 tests en 180d), la detección de estancamiento falla silenciosamente.
- (-) El motor fisiológico depende del último snapshot sin respaldo estadístico cuando la densidad es baja.

---

## Escenario 7: Gaps multi-disciplina en triatleta

### Independencia por disciplina

**Comportamiento: CORRECTO.** Cada disciplina tiene su propio `discipline_view` en el análisis. El dynamic_threshold_engine se ejecuta por disciplina. Los umbrales de running no contaminan los de ciclismo.

### Staleness por disciplina

**Comportamiento: PARCIALMENTE GESTIONADO.**
- `test_age_days` se calcula por disciplina desde `latest_snapshot_date`.
- Running (cada 4 semanas): `test_age_days` <= 28 -> `data_quality = "good"`. OK.
- Ciclismo (cada 8 semanas): `test_age_days` hasta 56 -> `data_quality = "low"` la mitad del tiempo (>42d).
- Natación (cada 12 semanas): `test_age_days` hasta 84 -> `data_quality = "low"` la mayor parte. En specific/pre_comp con >56d -> `testing_decision_block` (bloqueante).

### Prescripciones peligrosas con datos obsoletos

**HALLAZGO:** El motor no bloquea la prescripción de sesiones de ciclismo con datos de 8 semanas en fases de base. Si el ciclista ha mejorado o empeorado significativamente en esas 8 semanas, las prescripciones serán incorrectas.

El riesgo es mitigado porque:
1. Las sesiones planificadas contienen `confidence` que refleja la calidad del dato.
2. El `data_quality = "low"` se propaga como warning.
3. En specific/pre_comp, >56d bloquea con `testing_decision_block`.

Pero **no hay gradación de urgencia de re-test por disciplina**. Un triatleta ve el mismo tipo de warning genérico para ciclismo a 50 días y natación a 80 días.

**VEREDICTO ESCENARIO 7:** PASA CON RESERVAS.
- (+) Independencia total por disciplina.
- (+) Staleness >56d en specific/pre_comp -> bloqueo.
- (-) No hay alerta proporcional a la antigüedad por disciplina.
- (-) Fases de base toleran datos de 8+ semanas sin bloqueo.
- **RECOMENDACIÓN:** Implementar un "dashboard de frescura" que muestre por disciplina: días desde último test, confianza actual, y prioridad de re-test.

---

## Escenario 8: Drift sistémico a largo plazo (2+ años)

### Mecanismos de corrección existentes

1. **Ventana temporal corta (42d):** El modelo dinámico solo usa datos de las últimas 6 semanas. Cualquier drift acumulado fuera de esta ventana se descarta automáticamente. **Correcto.**

2. **Detección de estancamiento (180d):** Si el drift es lento (el motor no mejora pero tampoco empeora), `_detect_stagnation` lo detectará tras 3 tests con <5% de mejora. **Parcial** -- solo detecta falta de mejora, no drift hacia abajo.

3. **Recalibración por test nuevo:** Cada test de lactato "resetea" los umbrales per-session. El motor fisiológico usa siempre el test más reciente. **Correcto** si se hacen tests regulares.

### Riesgos de drift no detectado

**HALLAZGO CRITICO: NO HAY DETECCIÓN DE DRIFT DESCENDENTE.** El motor detecta estancamiento (<5% mejora) pero **no detecta regresión gradual**. Un atleta que pierde 2 s/km cada 3 meses (por envejecimiento, lesión crónica, o desentrenamiento progresivo) no dispara ninguna alarma específica.

Los tests individuales reflejarán la regresión, y el gap analysis se ajustará. Pero no hay ningún mecanismo que diga "tu LT2 ha empeorado un 8% en los últimos 12 meses -- hay que investigar". El sistema simplemente recalcula el gap y prescribe como si fuera la primera vez.

**Drift en el analizador de lactato:** Si el lactímetro pierde calibración progresivamente (+0.1 mmol/año), los umbrales se desplazarán sin que nadie lo note. No hay cross-validation contra otro sensor ni detección de drift instrumental.

**Drift en el baseline:** El `_baseline_state` compara contra los 6 basales más recientes. Si estos driftan juntos (por ejemplo, el atleta siempre llega al test con más fatiga acumulada), el baseline drift no se detecta. La mediana de 6 valores driftados es ella misma driftada.

### Salvaguardas existentes contra drift

| Mecanismo | Protege contra | No protege contra |
|---|---|---|
| Ventana 42d | Datos obsoletos | Drift dentro de la ventana |
| Estancamiento 180d | Falta de mejora | Regresión gradual |
| Baseline state | Basal anómalo agudo | Drift gradual del basal |
| Protocol score | Protocolo inadecuado | Drift del instrumento |
| Real thresholds (gates conservadores) | Umbrales imprecisos | Drift calibrado internamente |

**VEREDICTO ESCENARIO 8:** FALLO PARCIAL.
- (+) La ventana de 42d limita la memoria del modelo.
- (+) Los tests nuevos recalibran el sistema.
- (-) **No hay detección de regresión gradual** (solo estancamiento).
- (-) **No hay cross-validation instrumental** para detectar drift del lactímetro.
- (-) **No hay alerta de tendencia negativa** longitudinal.
- **RECOMENDACIÓN:** Implementar un `_detect_regression` análogo a `_detect_stagnation` que compare el LT2 actual contra la mediana de los 6-12 meses anteriores. Si hay regresión >5%, generar warning. Implementar alertas de tendencia: "tu LT2 ha mejorado/empeorado X% en los últimos Y meses".

---

## Resumen de hallazgos

### Fortalezas del sistema

| # | Fortaleza | Dónde |
|---|---|---|
| F1 | Ventana temporal corta (42d) que no arrastra datos obsoletos | `dynamic_threshold_engine.py` |
| F2 | Recency decay exponencial (18d half-life) | `_recency_weight()` |
| F3 | Independencia per-session (no hay contaminación temporal) | `analytics.py` |
| F4 | Detección de estancamiento con umbral conservador | `_detect_stagnation()` |
| F5 | Detección de inactividad con prescripciones conservadoras | `_detect_inactivity()` |
| F6 | Baseline arruinado invalida test completamente | `_BASELINE_ARRUINADO_THRESHOLD = 3.0` |
| F7 | LOO multi-capa (intra-session + cross-session) para outliers | `_detect_outliers_in_lactate_space` + `_intrasession_consistency_filter` |
| F8 | Blend dinámico 40% para capturar progresión sub-paso | `_DYN_BLEND = 0.40` |
| F9 | CTL/ATL con EWMA estándar TrainingPeaks (convergencia correcta) | `training_load_calculator.py` |
| F10 | Test >56d en specific/pre_comp fuerza testing_decision_block | `analyse_physiological_gap()` |

### Debilidades y recomendaciones

| # | Severidad | Debilidad | Recomendación | Archivos |
|---|---|---|---|---|
| D1 | **ALTA** | Sesiones planificadas no se actualizan cuando cambian umbrales | Implementar re-cálculo de dose_prescription cuando los umbrales cambian >3% | `planning_engine.py` |
| D2 | **ALTA** | No hay detección de regresión gradual (solo estancamiento) | Implementar `_detect_regression()` con lookback 12m y umbral -5% | `planning_engine.py` |
| D3 | **MEDIA** | Test enfermo coherente (todos los valores 2x) pasa el safeguard intra-session | Comparar cada test contra la mediana de los N anteriores. Flag si desviación >2 SD | `dynamic_threshold_engine.py` |
| D4 | **MEDIA** | Sin normalización de protocolo (3 min vs 5 min step) | Registrar step_duration como metadato. Aplicar factor de corrección (Heck 1985) | `analytics.py`, `dynamic_threshold_engine.py` |
| D5 | **MEDIA** | reference_2mmol y reference_4mmol no usan `robust=True` (sin protección LOO) | Aplicar `robust=True` también a las referencias fisiológicas | `dynamic_threshold_engine.py` |
| D6 | **BAJA** | No hay alerta proactiva cuando las zonas cambian significativamente | Comparar umbrales pre/post análisis, generar notificación si delta >3% | `analytics.py` |
| D7 | **BAJA** | No hay cross-validation instrumental del lactímetro | Opcional: comparar basales del lactímetro contra un valor de referencia si se registra | `analytics.py` |
| D8 | **BAJA** | No hay "dashboard de frescura" por disciplina | UI: mostrar días desde último test + prioridad de re-test por disciplina | `planning_engine.py` |
| D9 | **BAJA** | Stagnation no detectable con <3 tests en 180d | Reducir `_STAGNATION_MIN_TESTS` a 2 o ampliar lookback | `planning_engine.py` |

---

## Compatibilidad con la literatura

| Aspecto | Sistema actual | Evidencia científica | Alineación |
|---|---|---|---|
| Frecuencia de re-test | data_quality="low" >42d; bloqueo >56d en specific | 4-6 semanas óptimo ([CTS](https://trainright.com/the-performance-benefits-of-lactate-threshold-testing-and-training/)) | ALINEADO |
| CV test-retest | No modelado explícitamente | 3.4-3.7% ([Plos One 2016](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0163389)) | PARCIAL -- la varianza biológica no se usa para distinguir cambio real de ruido |
| Fiabilidad Dmax | Se usa ModDmax con protecciones | CV=10.3% para Dmax, ModDmax más robusto ([Bishop 1998](https://pubmed.ncbi.nlm.nih.gov/27657502/)) | ALINEADO |
| Estabilidad longitudinal LT | Detección de estancamiento en 180d | r=0.29 para LT%VO2max a largo plazo ([PubMed 2003](https://pubmed.ncbi.nlm.nih.gov/12750591/)) | PARCIAL -- no modela la inestabilidad inherente |
| Weltman test-retest | r=0.89-0.95 para velocidad a LT/2mM/4mM | [Weltman 1990](https://pubmed.ncbi.nlm.nih.gov/2318561/) | COMPATIBLE -- la ventana de 42d y recency decay son conservadores |
| Factores biológicos de variabilidad | baseline_state_score penaliza basales anómalos | Múltiples factores biológicos alteran lactato ([PMC 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12619971/)) | PARCIAL |

---

## Conclusión global

El sistema demuestra una arquitectura longitudinal sólida para un producto en fase temprana. La combinación de ventanas temporales cortas (42d), recency decay exponencial, y análisis per-session independiente proporciona una base robusta contra la mayoría de escenarios de corrupción de datos.

Los **dos hallazgos más importantes** son:
1. **Las prescripciones no se actualizan automáticamente** cuando los umbrales cambian -- riesgo de entrenamiento subóptimo progresivo.
2. **No hay detección de regresión gradual** -- el sistema detecta estancamiento pero no empeoramiento.

Ambos son corregibles con implementaciones relativamente simples y de bajo riesgo.

---

Sources:
- [Validity and Reliability of Ventilatory and Blood Lactate Thresholds in Well-Trained Cyclists](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0163389)
- [The Relationship Between Lactate and Ventilatory Thresholds in Runners](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.01320/full)
- [Reliability and Accuracy of Six Hand-Held Blood Lactate Analysers](https://pmc.ncbi.nlm.nih.gov/articles/PMC4306774/)
- [Weltman 1990 - Reliability of incremental treadmill protocol](https://pubmed.ncbi.nlm.nih.gov/2318561/)
- [Longitudinal analysis of lactate threshold in master athletes](https://pubmed.ncbi.nlm.nih.gov/12750591/)
- [Repeatability and predictive value of lactate threshold concepts](https://pmc.ncbi.nlm.nih.gov/articles/PMC6235347/)
- [Factors Influencing Blood Lactate Concentration During Exercise](https://pmc.ncbi.nlm.nih.gov/articles/PMC12619971/)
- [TrainingPeaks - Lactate Threshold Testing Guide](https://www.trainingpeaks.com/coach-blog/lactate-threshold-testing-better-performance/)
- [CTS - Performance Benefits of Lactate Threshold Testing](https://trainright.com/the-performance-benefits-of-lactate-threshold-testing-and-training/)
- [Pfitzinger 1998 - Reliability of lactate measurements](https://pubmed.ncbi.nlm.nih.gov/9721059/)
