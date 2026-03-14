# Agente 1C -- Casos Limite y Situaciones Anomalas

Fecha: 2026-03-14
Sistema: Lactate Lab (PeakAerobic)

---

## A. Casos Limite Universales

### 1. Sin retest en 3 meses

**Input**: Atleta con ultimo test formal hace 90 dias. Sin tomas de entreno intermedias. El sistema tiene solo los puntos del test original en la ventana cronica (42d) -- pero a 90 dias, estan fuera de ventana.

**Output esperado del sistema**:
- Motor dinamico: recency = exp(-90/18) = exp(-5.0) = 0.0067 -> clamped a min 0.2. Pero los puntos estan FUERA de la ventana cronica de 42d, por lo que no se incluyen en `_collect_points()` (linea 253: `if window_days is not None and (as_of - session_date).days > window_days: continue`).
- Resultado: 0 puntos en ventana cronica -> estimacion dinamica **no disponible**.
- Motor de sesion (analytics.py): los umbrales del snapshot original siguen en la base de datos. El physiological_engine.py los extrae con `test_age_days = 90`.
- `data_stale = ctx.test_age_days > 42` -> True -> `data_quality = "low"`.
- Si la fase es specific/pre_comp y test_age > 56d -> `testing_decision_block`.
- Si la fase es base_early/base_late -> se prescribe con datos low quality + warning.

**Verdict**: DUDOSO
- En fase base, el sistema prescribe con datos obsoletos sin un mecanismo explicito de "necesitas un retest". Solo marca `data_quality = "low"`.
- NO hay alerta especifica de "sin test formal en >8 semanas" salvo en specific/pre_comp.
- El entrenador podria seguir prescribiendo bloques con datos de hace 3 meses sin que el sistema le obligue a retestear.

**Mensaje al entrenador**: "Los umbrales actuales provienen de un test realizado hace 90 dias. Sin datos recientes, la prescripcion puede no reflejar el estado actual del atleta. Se recomienda repetir el test antes de iniciar un nuevo bloque."

**Recomendacion**: Anadir un warning explicito cuando `test_age_days > 56` independientemente de la fase. Considerar un `testing_decision_block` forzado cuando `test_age_days > 84` (12 semanas) en cualquier fase.

---

### 2. Cancelacion total de semana

**Input**: Atleta cancela todas las sesiones programadas de una semana. No hay tomas de lactato, no hay datos de entreno.

**Output esperado del sistema**:
- Motor dinamico: sin nuevos puntos, la estimacion se mantiene con los datos existentes cuyo peso de recency disminuye progresivamente.
- Planificacion (mesocycle_prescription.py): el sistema no tiene mecanismo de feedback de sesiones completadas vs canceladas. El draft del bloque se genera al inicio y no se actualiza por adherencia.
- Physiological_engine.py: no cambia nada; usa los mismos umbrales del ultimo test.

**Verdict**: DUDOSO
- El sistema NO detecta la cancelacion ni ajusta la prescripcion.
- No hay mecanismo de "semana perdida" que recalcule la carga o extienda el bloque.
- Si el atleta cancela 2+ semanas seguidas, la fatiga acumulada sera cero pero el sistema no lo sabe y podria prescribir una semana `build_peak` al retorno, generando una carga excesiva.

**Mensaje al entrenador**: "Se detecta una semana sin sesiones registradas. Considere ajustar la progresion del bloque: reducir la carga de la siguiente semana o insertar una semana de recarga antes de retomar la progresion planificada."

**Recomendacion**: Implementar deteccion de adherencia (sesiones completadas / planificadas) y ajuste automatico de la progresion del mesociclo cuando adherencia < 60%.

---

### 3. Cambio de objetivo a mitad del plan

**Input**: Atleta P01 cambia de "primera media maraton en 4 meses" a "10k en 2 meses".

**Output esperado del sistema**:
- El `distance_category` cambia de "hm" a "10k".
- `EVENT_LIMITER["10k"] = "lt2"` (antes era "both").
- `LT2_RACE_FACTOR["10k"]["recreational"] = 0.88` vs `LT2_RACE_FACTOR["hm"]["recreational"] = 0.85` -> required_lt2 sube.
- `_season_phase()` recalcula: con 8 semanas restantes (asumiendo S16) y recreational: boundaries (32, 23, 14, 3) -> 8 semanas = `pre_comp`.
- Nuevo bloque: con fase `pre_comp` + evento corto -> posible `anaerobic_power_block` si cumple gates ANP (5k, 10k estan en `_ANP_EVENTS`).

**Verdict**: DUDOSO
- El sistema recalcula correctamente si el entrenador actualiza el objetivo manualmente.
- Pero NO hay mecanismo automatico para detectar que el objetivo cambio o para alertar de que el plan en curso ya no es coherente con el nuevo objetivo.
- El salto de `base_early` (HM) a `pre_comp` (10k) es brusco: el atleta principiante podria recibir prescripcion de ANP sin haber construido base suficiente.
- Gate ANP: `pre_comp + _ANP_EVENTS` -> True. Pero `weeks_to_goal = 8` y `MIN_WEEKS_FOR_BLOCK["anaerobic_power_block"] = 2`, asi que `weeks < MIN_WEEKS+2 = 4` es False (8 > 4). No hay contraindication por semanas.

**Mensaje al entrenador**: "El cambio de objetivo de media maraton a 10k altera significativamente la fase de temporada y el bloque recomendado. Antes de aplicar el nuevo plan, verificar que el atleta tiene suficiente base aerobica para los nuevos estimulos."

**Recomendacion**: Anadir un warning cuando el objetivo cambia y la fase de temporada salta 2+ fases (ej: base_early -> pre_comp). El sistema deberia sugerir un bloque transicional.

---

### 4. Override manual del coach

**Input**: El entrenador modifica manualmente el LT2 de un atleta (ej: lo fija a 4:15/km en vez de los 4:30/km detectados).

**Output esperado del sistema**:
- El sistema NO tiene un campo de "override manual" en el modelo de datos. Los umbrales provienen exclusivamente de:
  1. `PhysiologicalSnapshot.payload` (analytics.py per-session)
  2. Motor dinamico (dynamic_threshold_engine.py multi-session)
  3. Interpolacion cruda (physiological_engine.py fallback)
- Si el entrenador edita la sesion manualmente (cambiando valores de lactato o ritmo), el sistema recalcularia los umbrales basandose en los nuevos datos.
- Si el entrenador quiere un override puro sin cambiar datos, no hay mecanismo para ello.

**Verdict**: Correcto (por diseno)
- El sistema protege la integridad de los datos: los umbrales son siempre derivados de mediciones reales.
- Sin embargo, hay situaciones donde el entrenador tiene informacion contextual que el sistema no captura (ej: "se que este atleta rinde mejor de lo que el test muestra porque estaba enfermo ese dia").
- El motor dinamico parcialmente resuelve esto: si el entrenador asigna tomas de entreno con datos mejores, el sistema integrara esos datos en la estimacion cronica.

**Mensaje al entrenador**: "Para ajustar umbrales, registre tomas de lactato en sesiones de entreno que reflejen el rendimiento real del atleta. Estas tomas actualizaran las estimaciones del sistema progresivamente."

**Recomendacion**: Considerar un campo `coach_override` en el modelo que permita al entrenador fijar un umbral manualmente, con un timestamp y razon. El motor lo usaria con confianza predefinida (ej: 0.70) y decaeria en el tiempo igual que cualquier otro dato.

---

## B. Casos Limite por Perfil

### P01 -- Sin mejora LT1 en 3 meses

**Input**: P01 runner principiante. 4 tests formales en 24 semanas. LT1 se mantiene en 1.5-1.6 mmol sin mejora significativa. LT2 mejora de 5:30 a 5:00/km.

**Output esperado**:
- El motor no tiene detector de "estancamiento por umbral individual". Compara tests pero no genera alerta de "LT1 estancado, LT2 mejora".
- El CapacityProfile cambiaria: ratio LT1/LT2 bajaria (LT2 sube, LT1 no) -> el ratio se desplaza hacia VLamax "high". Esto podria cambiar la prescripcion de bloque.
- El motor fisiologico no diferencia entre "LT1 no mejora" y "ambos no mejoran". Si el gap LT2 se cierra, podria cambiar de AEC a THR/AEP sin haber resuelto el deficit de LT1.

**Verdict**: DUDOSO
- El sistema no detecta explicitamente el estancamiento de LT1 como senal de que necesita estimulos especificos subumbrales.
- En eventos de larga distancia (maraton, ironman), el LT1 estancado es un limitante critico que el sistema podria ignorar si solo mira el gap LT2.

**Recomendacion**: Detectar divergencia LT1/LT2 entre tests consecutivos y generar alerta: "LT2 mejora pero LT1 estancado -- considerar mas volumen subumbral extensivo."

---

### P01 -- Abandono 4 semanas seguidas

**Input**: P01 deja de entrenar durante 4 semanas (S10-S14). Retorna en S14.

**Output esperado**:
- Sin datos nuevos en esas 4 semanas, el motor dinamico pierde recency de los datos previos.
- Al retomar, si el ultimo test fue en S6, test_age = 56 dias. data_stale = True.
- Si esta en fase specific: `testing_decision_block` forzado.
- Si esta en fase base: prescripcion con `data_quality = "low"` pero sin bloqueo.
- El sistema NO sabe que la atleta estuvo 4 semanas inactiva. No hay desentrenamiento modelado.

**Verdict**: PELIGROSO
- El sistema prescribiria el mismo bloque (posiblemente `build` o `build_peak`) que tenia programado antes del pararon.
- Despues de 4 semanas sin entrenar, Mujika & Padilla (2001) documentan perdida de 4-6% en VO2max y deterioro significativo de la capacidad aerobica.
- El riesgo es que la atleta reciba cargas excesivas al retorno.

**Recomendacion**: Implementar deteccion de inactividad prolongada (>14 dias sin sesiones registradas) y forzar una semana de readaptacion + retest antes de retomar la progresion normal.

---

### P03 -- Mejora ciclismo pero empeora running

**Input**: P03 triatleta. Test 3 (S14): ciclismo LT2 sube a 322W (+12W), pero running LT2 baja de 3:37 a 3:42/km (-5s/km regresion).

**Output esperado**:
- Cada disciplina se analiza independientemente en physiological_engine.py.
- Ciclismo: gap se cierra -> posible cambio de bloque (AEC -> THR/AEP).
- Running: gap se abre -> deberia mantener o intensificar AEC running.
- El sistema NO tiene un mecanismo de priorizacion entre disciplinas en triatlon.
- El `analyse_physiological_gap()` se ejecuta por disciplina, no genera una recomendacion global.

**Verdict**: DUDOSO
- El entrenador recibe bloques separados por disciplina, sin orientacion global de "priorizar running que esta en regresion".
- Si el entrenador aplica el bloque de ciclismo (THR) y running (AEC) simultaneamente, puede haber conflicto de carga.

**Recomendacion**: Para triatletas, generar un `global_block_recommendation` que considere las 3 disciplinas y sus tendencias relativas. Marcar la disciplina en regresion como prioritaria.

---

### P03 -- LT2 natacion y running divergen mucho

**Input**: LT2 natacion a 1:23/100m (competitive) vs LT2 running a 3:42/km (borderline trained/competitive). Gap de 2 categorias.

**Output esperado**:
- Natacion: aerobic_level "high", running: aerobic_level "high" pero mas bajo.
- Cada disciplina recibe su propio bloque independientemente.
- No hay "confusion" en planificacion porque son independientes.

**Verdict**: Correcto
- La separacion por disciplina protege contra contaminacion cruzada.
- Pero falta la vision global para triatletas.

---

### P05 -- 4 tests sin mejora

**Input**: 4 tests en 24 semanas, LT2 se mueve de 4:10 a 4:00/km (solo +10s, <5% mejora). Perfil diesel (VLamax low).

**Output esperado**:
- El motor dinamico tiene 4 tests + multiples tomas, todos mostrando variabilidad <3%.
- `stability_score` seria muy alto (>0.90).
- El sistema NO genera alerta de "estancamiento cronico".
- El `analyse_physiological_gap()` ve que el gap LT2 sigue siendo pequeno -> podria seguir prescribiendo el mismo bloque.
- El cambio a ANC solo ocurre si: base_late + short event + VLamax low (linea `_ANC_CANDIDATE_EVENTS`). Maraton NO esta en `_ANC_CANDIDATE_EVENTS`. Asi que para maraton, el sistema NUNCA prescribiria ANC.

**Verdict**: PELIGROSO
- El atleta diesel con objetivo maraton y estancamiento cronico seguira recibiendo AEC o AEP indefinidamente.
- Olbrecht: incluso para atletas de larga distancia, un bloque ANC corto puede "despertar" la glucolisis y romper el plateau.
- El sistema tiene un gap en `_ANC_CANDIDATE_EVENTS` que excluye maraton y eventos largos del bloque ANC.

**Mensaje al entrenador**: "4 tests consecutivos sin mejora significativa (<5%). Considerar un bloque ANC de 4 semanas para romper la meseta (Olbrecht: estimulo glucolitico en atleta diesel estancado)."

**Recomendacion**: Anadir detector de estancamiento (variacion <5% en >3 tests / >12 semanas) que sugiera cambio de estimulo. Considerar ampliar `_ANC_CANDIDATE_EVENTS` para incluir maraton/ironman cuando se detecte estancamiento + VLamax low.

---

### P05 -- Deteccion de sobreentrenamiento

**Input**: Tomas de lactato en Z2 progresivamente mas altas: S2=1.1, S8=1.3, S14=1.5, S20=1.8 a ritmos similares (5:10/km).

**Output esperado**:
- Cada toma individual no activa la alerta de fatiga (umbral: LT1p+0.5 = 1.25+0.5 = 1.75). Solo S20 (1.8) estaria marginalmente por encima.
- El motor NO analiza tendencia temporal de las tomas de Z2. Ve cada toma individualmente.
- No hay detector de "drift progresivo en basal" que indique sobreentrenamiento no funcional.

**Verdict**: PELIGROSO
- El deterioro gradual del basal es un marcador clasico de overreaching/overtraining (Meeusen et al. 2013).
- El sistema no lo detecta porque no hace analisis de tendencia temporal de basales.
- El atleta podria llegar a sobreentrenamiento sin alarma.

**Recomendacion**: Implementar analisis de tendencia de basales Z2: si el lactato en Z2 sube >0.5 mmol en >8 semanas a misma carga, generar alerta de "posible sobreentrenamiento no funcional".

---

### P07 -- Gran asimetria entre disciplinas

**Input**: P07 ciclista->triatleta. LT2 ciclismo: 245W (moderate). LT2 running: 5:20/km (borderline low). LT2 natacion: 1:55/100m (low).

**Output esperado**:
- El sistema genera un bloque por disciplina independientemente.
- Ciclismo podria recibir THR/AEP (gap pequeno).
- Running recibe AEC (gap grande).
- Natacion recibe AEC (gap grande).
- No hay priorizacion: el entrenador debe decidir cuanto volumen asignar a cada disciplina.

**Verdict**: DUDOSO
- El ciclismo fuerte NO contamina las decisiones de natacion/running (separacion por disciplina funciona).
- Pero falta orientacion de "donde invertir las horas de entrenamiento limitadas".
- Un triatleta con 10-15h/semana necesita saber si priorizar running o natacion.

---

### P07 -- Ciclismo alto contamina decisiones

**Input**: Misma P07. Si el sistema usara una media de las 3 disciplinas para decidir el bloque global.

**Output esperado**: NO ocurre -- el sistema usa disciplinas independientes.

**Verdict**: Correcto -- la arquitectura protege contra este error.

---

### P09 -- Curva completamente plana

**Input**: Test con lactatos [1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2] @ ritmos decrecientes.

**Output esperado**:
- Smoothed: ~[1.55, 1.60, 1.70, 1.80, 1.90, 2.00, 2.10, 2.15]
- LT1 baseline_rise: baseline=1.5, +0.5=2.0. Smoothed[5]=2.00 >= 2.0. **LT1 en escalon 6**.
- LT2 baseline_rise: ningun punto >= 3.2 ni >= 4.0. Fallback al ultimo escalon (escalon 8). Smoothed[7]=2.15. Pendiente 2.15-2.10=0.05 < 0.45. El `sustained_increase` tampoco encuentra rotura de pendiente. **LT2 defaulta al ultimo escalon**.
- ModDmax: baseline+0.5=2.0. Start en escalon 6 (smoothed 2.00). Solo 3 puntos de ahi al final -> moddmax requiere >=3 subset_loads, asi que marginalmente funciona pero la desviacion sera minima.
- Rango de lactato: 2.2-1.5 = 0.7 mmol < 1.5 mmol. El detector de rango insuficiente (linea 1147: `if _lac_range < 1.5`) se activa. `data_quality = "low"`.
- Detector de curva plana: LT1 y LT2 muy juntos en ritmo -> `_lt_spread < _flat_threshold` -> data_quality = "low" + contraindication.

**Verdict**: Correcto
- El sistema detecta correctamente que la curva es plana y que el test es insuficiente.
- Los gates de real thresholds bloquean: signal_score sera bajo por range_score bajo.
- Sin embargo, el LT2 defaulta al ultimo escalon, lo que da un valor aparentemente valido (2.2 mmol a ritmo X) que es fisiologicamente sin sentido como "umbral".

**Recomendacion**: Cuando el LT2 no se detecta por ningun criterio valido (ni 4.0, ni 3.2+pendiente, ni rotura de pendiente), en vez de defaultar al ultimo escalon, el sistema deberia devolver LT2=null con un mensaje explicito.

---

### P09 -- Solo 2 etapas validas

**Input**: Test con solo 2 escalones: [1.0, 5.0] a [6:00/km, 5:00/km].

**Output esperado**:
- `_build_candidates()` devuelve 2 candidatos.
- `_thresholds_from_session()`: len(candidates) < 3 -> return [] (linea 521-522).
- Ningun umbral detectado. Snapshot sin datos de threshold.
- Real thresholds: usable_stage_count=2 < 5 -> gate no pasa.
- Motor dinamico: 2 puntos -> `_sample_size_effect(2) = 0.22`, confianza muy baja.
- physiological_engine.py: sin thresholds ni curve points -> data_quality = "none" -> `testing_decision_block`.

**Verdict**: Correcto
- El sistema maneja correctamente este caso extremo: no intenta estimar umbrales con datos insuficientes.

---

### P09 -- Primer valor ya en 4.5 mmol

**Input**: Curva [4.5, 5.2, 6.0, 7.5, 9.0, 11.0] @ ritmos decrecientes. El atleta empezo el test demasiado rapido.

**Output esperado**:
- Smoothed: ~[4.85, 5.23, 6.23, 7.50, 9.17, 10.00]
- Baseline = min(smoothed[0:4]) = 4.85 (ya muy alto).
- LT1: baseline + 0.5 = 5.35. Smoothed[1]=5.23 < 5.35. Smoothed[2]=6.23 >= 5.35. **LT1 en escalon 3** a 6.0 mmol. Esto es absurdo: LT1 a 6 mmol.
- LT2: smoothed[0]=4.85 >= 4.0 inmediatamente. Verificacion: next 5.23 >= 4.85-0.5 = 4.35. **LT2 en escalon 1** a 4.5 mmol.
- Resultado: LT2 < LT1 (4.5 < 6.0). El sistema no valida que LT1 < LT2.
- ModDmax: baseline_min + 0.5 = 5.35. Ningun punto < 5.35 en baseline window -> start_index = 0. Toda la curva se usa. La desviacion maxima podria caer en cualquier escalon.

**Verdict**: PELIGROSO
- El sistema NO valida que LT1 < LT2.
- Con primer valor > 4 mmol, el baseline es corrupto y todas las detecciones fallan.
- El LT1 detectado a 6.0 mmol y LT2 a 4.5 mmol son fisiologicamente imposibles.
- No hay detector de "baseline arruinado" (todos los valores > 3 mmol).

**Mensaje al entrenador**: "ERROR DE PROTOCOLO: El primer escalon del test muestra lactato de 4.5 mmol/L. El test empezo a una intensidad demasiado alta para detectar el basal y LT1. Repetir el test empezando a una intensidad subumbral (lactato esperado <1.5 mmol)."

**Recomendacion**: Anadir validacion: si `baseline > 3.0 mmol`, el sistema deberia marcar el test como invalido y no intentar detectar umbrales. Anadir validacion: si LT1_lactate > LT2_lactate, no publicar ningun umbral.

---

### P10 -- Recaida a semana 8

**Input**: P10 triatleta post-lesion. Mejora de S1 a S6, pero Test 3 (S14) muestra regresion: LT2 pasa de 5:28/km a 5:35/km (-7s/km).

**Output esperado**:
- El sistema simplemente actualiza los umbrales con los nuevos datos del Test 3.
- El motor dinamico integra los nuevos puntos (LT2 peor) con recency alta, tirando la estimacion hacia abajo.
- `analyse_physiological_gap()` recalcula: gap se abre -> posible vuelta a AEC.
- NO hay alerta de "regresion detectada" ni analisis de causas.

**Verdict**: DUDOSO
- El sistema reacciona correctamente (ajusta umbrales), pero no comunica la regresion al entrenador.
- La regresion post-lesion puede indicar recaida, sobreentrenamiento, o simplemente una semana mala.
- El entrenador deberia ser informado explicitamente de la regresion con contexto.

**Recomendacion**: Detector de regresion: si LT2 empeora >3% entre tests consecutivos, generar alerta con posibles causas (fatiga, recaida, protocolo).

---

### P10 -- Ajuste automatico del plan

**Input**: Misma regresion detectada. El bloque en curso era THR (S8-S14).

**Output esperado**:
- El bloque THR ya esta en ejecucion.
- El sistema NO tiene mecanismo de "re-evaluacion mid-block".
- El entrenador tiene que manualmente recalcular y decidir cambiar de bloque.

**Verdict**: DUDOSO
- El sistema no ajusta el plan en curso cuando llegan nuevos datos de test.
- La re-evaluacion solo ocurre cuando el entrenador ejecuta manualmente el motor fisiologico.

**Recomendacion**: Implementar re-evaluacion automatica cuando llega un nuevo test formal. Si el bloque recomendado cambia, generar notificacion al entrenador.

---

## C. Casos Limite del Motor de Lactato

### 1. Curva no monotonica

**Input**: Lactatos [1.0, 1.2, 1.8, 1.4, 2.0, 3.5, 5.2, 7.0] @ ritmos [7:00, 6:30, 6:00, 5:40, 5:20, 5:00, 4:40, 4:20] (s/km: 420, 390, 360, 340, 320, 300, 280, 260)

**Smoothed**: [1.10, 1.33, 1.47, 1.73, 2.30, 3.57, 5.23, 6.10]
- idx0: mean(1.0, 1.2) = 1.10
- idx1: mean(1.0, 1.2, 1.8) = 1.33
- idx2: mean(1.2, 1.8, 1.4) = 1.47
- idx3: mean(1.8, 1.4, 2.0) = 1.73
- idx4: mean(1.4, 2.0, 3.5) = 2.30
- idx5: mean(2.0, 3.5, 5.2) = 3.57
- idx6: mean(3.5, 5.2, 7.0) = 5.23
- idx7: mean(5.2, 7.0) = 6.10

**baseline_rise**: baseline = min(smoothed[0:4]) = 1.10. +0.5 = 1.60. Smoothed[3]=1.73 >= 1.60 y smoothed[4]=2.30 >= 1.73-0.25. **LT1 en escalon 4** (5:40/km, lactato 1.4 mmol). Nota: el smoothing absorbe la caida del escalon 4, pero el lactato contextual usado es 1.4 (la caida), lo cual es incorrecto para LT1.

**sustained_increase**: baseline=1.10, +0.3=1.40. Smoothed[2]=1.47 >= 1.40, smoothed[2]>smoothed[1] (1.47>1.33), smoothed[3]=1.73>=smoothed[2]. **LT1 en escalon 3** (6:00/km, lactato 1.8 mmol).

**LT2 baseline_rise**: smoothed[5]=3.57 >= max(3.2, 1.10+1.4=2.50) y pendiente 3.57-2.30=1.27 >= 0.45. Next: 5.23 >= 3.57-0.5. **LT2 en escalon 6** (5:00/km, lactato 3.5).

**LT2 sustained_increase**: local_slope[5]=3.57-2.30=1.27, prior=2.30-1.73=0.57. 1.27 >= max(0.45, 0.57+0.2=0.77). **LT2 en escalon 6**.

**moddmax**: start donde >= baseline+0.5=1.60: escalon 3 (smoothed 1.47? No, 1.47<1.60). Escalon 4: smoothed 1.73 >= 1.60. Linea de escalon 4 a 8. LT2 donde maxima desviacion.

**Aggregated LT1**: lactato = mean(1.4, 1.8) = **1.6 mmol**; ritmo = median(340, 360) = **350 s/km (~5:50/km)**.
**Aggregated LT2**: lactato ~ **3.5 mmol** a **~5:00/km**.

**Monotonicity**: Pares: 1.0<1.2 (ok), 1.2<1.8 (ok), 1.8>1.4 (caida 0.4>0.15: FALLO), 1.4<2.0 (ok), 2.0<3.5 (ok), 3.5<5.2 (ok), 5.2<7.0 (ok). Score = 6/7 = **0.857**. Nota: `_curve_monotonicity` usa tolerancia de -0.15, pero 1.4 < 1.8-0.15=1.65, asi que el par falla. Score = 6/7 = 0.86.

Gate real thresholds: monotonicity 0.86 >= 0.60 -> PASA.

**Verdict**: DUDOSO
- El smoothing (media de 3 vecinos) absorbe parcialmente la caida del escalon 4, pero el lactato contextual reportado (1.4) es el punto anomalo.
- LT1 baseline_rise detecta en escalon 4 con lactato 1.4 (que es un dip), lo cual es un artefacto.
- El smoothing salva la deteccion de LT2 pero no la de LT1 completamente.
- Los real thresholds pasan el gate de monotonicity (0.86), lo cual es dudoso para una curva con una caida clara.

**Recomendacion**: El outlier threshold de 0.5 mmol (Billat) deberia aplicarse tambien en analytics.py per-session: si un punto cae >0.5 mmol respecto al anterior y al siguiente, marcarlo como sospechoso y no usarlo como anchor de LT1.

---

### 2. LT1 y LT2 separados menos de 0.3 mmol

**Input**: Curva [0.9, 1.0, 1.1, 1.5, 1.7, 2.0, 2.8, 4.5] @ ritmos decrecientes.

**Smoothed**: [0.95, 1.00, 1.20, 1.43, 1.73, 2.17, 3.10, 3.65]

**baseline_rise LT1**: baseline=0.9, +0.5=1.40. Smoothed[3]=1.43 >= 1.40. Next: 1.73 >= 1.43-0.25. **LT1 en escalon 4** (lactato 1.5).

**baseline_rise LT2**: smoothed[6]=3.10 >= 3.2? No (3.10<3.2). Smoothed[7]=3.65 >= 3.2 y pendiente 3.65-3.10=0.55 >= 0.45. Next: no hay -> default value. **LT2 en escalon 8** (lactato 4.5).

**sustained_increase LT1**: baseline+0.3=1.20. Smoothed[2]=1.20 >= 1.20, ascending (1.20>1.00), next ascending (1.43>=1.20). **LT1 en escalon 3** (lactato 1.1).

**sustained_increase LT2**: smoothed[7]=3.65 >= max(3.2, 0.9+1.4=2.3). local_slope=3.65-3.10=0.55, prior=3.10-2.17=0.93. 0.55 >= max(0.45, 0.93+0.2=1.13)? NO. Fallback: ultimo escalon. **LT2 en escalon 8**.

**Aggregated LT1**: mean(1.5, 1.1) = **1.3 mmol** a escalon 3-4.
**Aggregated LT2**: **4.5 mmol** a escalon 8.

**Distancia LT1-LT2 en lactato**: 4.5 - 1.3 = **3.2 mmol** -- NO es un caso de separacion <0.3 mmol en lactato. Los umbrales estan bien separados.

Si el usuario queria probar LT1 y LT2 separados <0.3 mmol en RITMO: esto ocurre cuando la curva es muy empinada (todos los umbrales en 2-3 escalones). En ese caso:
- LT1 y LT2 se detectarian en escalones adyacentes o incluso el mismo.
- El detector de curva plana NO se activa aqui (al reves, la curva es empinada).
- `_lt_spread < _flat_threshold` no aplica.

**Verdict**: Correcto para este caso. LT1 y LT2 se detectan con buena separacion.

Para el caso extremo donde LT1=LT2 en el mismo escalon: el sistema reportaria ambos en el mismo punto, lo cual no genera error pero es fisiologicamente sospechoso. No hay validacion de `LT1 < LT2` en ritmo.

---

### 3. Pico de lactato muy bajo < 4.0 mmol

**Input**: Curva [0.8, 0.9, 1.0, 1.2, 1.5, 2.0, 2.8, 3.5] @ ritmos decrecientes.

**Smoothed**: [0.85, 0.90, 1.03, 1.23, 1.57, 2.10, 2.77, 3.15]

**baseline_rise LT2**: Ningun smoothed >= 4.0. Criterio 3.2: smoothed[7]=3.15. 3.15 < 3.2. NO detecta por criterio 3.2. Pendiente? smoothed[7]-smoothed[6]=3.15-2.77=0.38 < 0.45. NO pasa.

**sustained_increase LT2**: smoothed[7]=3.15 >= max(3.2, 0.8+1.4=2.2)? 3.15 < 3.2. NO.

Fallback: `lt2_index = len(lactates) - 1` en baseline_rise (linea 275). El LT2 defaulta al **ultimo escalon** con lactato 3.5 mmol.

**moddmax**: baseline+0.5=1.3. Start en escalon 4 (smoothed 1.23? No, 1.23<1.30). Escalon 5: 1.57 >= 1.30. Subset de escalon 5 a 8. 4 puntos. Linea recta de 1.57 a 3.15. Desviaciones: en el medio (escalon 6-7) la curva convexa queda por debajo de la linea -> desviaciones negativas. ModDmax devuelve [] (deviations[local_lt2] <= 0, linea 418).

**Resultado**: LT2 detectado solo por fallback al ultimo escalon (baseline_rise). Confianza baja. ModDmax no devuelve nada.

**Verdict**: DUDOSO
- El sistema detecta un "LT2" por fallback cuando realmente el atleta no alcanzo el LT2 durante el test.
- El lactato de 3.5 mmol no es un verdadero LT2 sino el punto de maxima intensidad del test.
- El detector de rango insuficiente (lac_range = 3.5-0.8 = 2.7 > 1.5) NO se activa.
- Pero el detector de curva plana podria activarse si LT1 y LT2 estan juntos en ritmo.

**Mensaje al entrenador**: "El test no alcanzo el umbral de lactato clasico (4 mmol). El LT2 estimado a 3.5 mmol es provisional. Considerar ampliar el rango del test (anadir 1-2 escalones mas intensos)."

**Recomendacion**: Cuando LT2 detectado tiene lactato < 3.5 mmol y cae en el ultimo escalon, generar warning especifico de "test posiblemente truncado: no se alcanzo el umbral".

---

### 4. Primer valor > 3.5 mmol

**Input**: Curva [3.8, 4.2, 5.0, 6.5, 8.0, 10.2] @ ritmos [5:00, 4:40, 4:20, 4:00, 3:40, 3:20] (s/km: 300, 280, 260, 240, 220, 200)

**Smoothed**: [4.00, 4.33, 5.23, 6.50, 8.23, 9.10]

**baseline_rise**: baseline = min(smoothed[0:4]) = 4.00. +0.5 = 4.50. Smoothed[1]=4.33 < 4.50. Smoothed[2]=5.23 >= 4.50. **LT1 en escalon 3** (lactato 5.0 mmol). ABSURDO.

**LT2**: smoothed[0]=4.00 >= 4.0 inmediatamente. Next: 4.33 >= 4.00-0.5=3.50. **LT2 en escalon 1** (lactato 3.8 mmol). LT2 ANTES de LT1.

**sustained_increase LT1**: baseline+0.3=4.30. Smoothed[1]=4.33 >= 4.30, ascending (4.33>4.00), next ascending (5.23>4.33). **LT1 en escalon 2** (lactato 4.2 mmol).

**LT2 sustained**: smoothed[0]=4.00 >= max(3.2, 4.00+1.4=5.40)? 4.00 < 5.40. NO. Smoothed[1]=4.33 >= 5.40? NO. Smoothed[2]=5.23 >= 5.40? NO. Smoothed[3]=6.50 >= 5.40, local_slope=6.50-5.23=1.27, prior=5.23-4.33=0.90. 1.27 >= max(0.45, 0.90+0.2=1.10). **LT2 en escalon 4** (lactato 6.5 mmol).

**Resultado final depende del metodo**: baseline_rise da LT1=5.0 y LT2=3.8 (invertido). sustained_increase da LT1=4.2 y LT2=6.5. Agregacion: media lactato, mediana ritmo.

LT1 agregado: mean(5.0, 4.2) = 4.6 mmol. LT2 agregado: depende de moddmax; si moddmax devuelve algo: mean(3.8, 6.5, X). Si moddmax da escalon 2-3: media de 3.8, 6.5, ~5.0 = 5.1 mmol.

**Verdict**: PELIGROSO
- LT1 a 4.6 mmol es fisiologicamente imposible como umbral aerobico.
- baseline_rise produce LT2 < LT1 (3.8 vs 5.0 mmol).
- No hay validacion de LT1 < LT2 en lactato.
- No hay validacion de baseline > 3.0 mmol (que invalidaria el test).
- Los real thresholds pasarian monotonicity (curva es perfectamente monotona) y signal_score (rango alto), lo que podria publicar umbrales absurdos como "REAL".

**Mensaje al entrenador**: "TEST INVALIDO: El primer escalon muestra lactato de 3.8 mmol/L. El atleta empezo el test a una intensidad demasiado alta. Los umbrales detectados no son fiables. Repetir el test empezando a una intensidad donde el lactato sea <1.5 mmol/L."

**Recomendacion CRITICA**: Anadir dos validaciones:
1. Si `baseline > 3.0 mmol`, marcar test como invalido, no publicar umbrales.
2. Si `LT1_lactate >= LT2_lactate`, no publicar umbrales; generar error.

---

### 5. Escalones de 2 minutos (protocolo corto)

**Input**: Test con 8 escalones de 2 minutos cada uno. Lactatos [0.9, 1.0, 1.3, 1.7, 2.5, 3.8, 5.5, 8.0].

**Protocol score**: `_interval_duration_score(120)` = 0.42 (linea 104). Con rest_ratio ~0.15: rest_score = 1.0. Protocol = 0.42*0.65 + 1.0*0.35 = 0.273 + 0.35 = 0.623. Pero `max(0.25, min(1.0, 0.623))` = **0.62**.

**Confianza**: baseline_rise: `confidence = min(0.88, 0.56 + 8*0.05)` = min(0.88, 0.96) = 0.88. Luego: `0.88 * (0.72 + 0.62*0.28)` = 0.88 * (0.72 + 0.174) = 0.88 * 0.894 = **0.787**.

**Real thresholds gates**:
- protocol_score = median(all protocol_scores) = 0.62 < `_REAL_MIN_PROTOCOL_SCORE = 0.68`. **Gate NO pasa**.
- Real thresholds = null. Correcto.

**Verdict**: Correcto
- El protocol_score de 0.62 correctamente bloquea los real thresholds (gate 0.68).
- La confianza individual de 0.787 es reducida pero no eliminada.
- Los umbrales basicos se publican con confianza media/baja.
- El entrenador recibe la explicacion "fiabilidad baja por duracion del escalon poco favorable".

---

### 6. Atleta que empeora bruscamente entre tests

**Input**: Test 1: LT2 @ 4:20/km (ritmo = 260 s/km, speed = 13.85 km/h). Test 2 (6 semanas despues): LT2 @ 4:50/km (ritmo = 290 s/km, speed = 12.41 km/h). Diferencia: 30 s/km = -10.4%.

**Output esperado**:
- Motor de sesion: actualiza umbrales del Test 2 normalmente. LT2 baja de 13.85 a 12.41 km/h.
- Motor dinamico: en ventana cronica, ambos tests estan presentes. Los puntos del Test 1 tienen recency = exp(-42/18) = 0.097 -> clamped a 0.2. Los puntos del Test 2 dominan.
- Motor fisiologico: recalcula gap. Required_lt2 no cambia. Gap se abre significativamente.
- Bloque: posiblemente cambia de THR/AEP a AEC.
- NO hay alerta de "regresion del 10%".

**Verdict**: DUDOSO
- El sistema reacciona correctamente (ajusta umbrales y bloque).
- Pero no genera alerta de regresion significativa.
- Una caida del 10% puede indicar lesion, enfermedad, sobreentrenamiento, o error de protocolo.
- El entrenador deberia ser informado explicitamente.

**Recomendacion**: Cuando LT2 empeora >5% entre tests consecutivos, generar alerta de regresion con nivel de severidad proporcional al porcentaje de deterioro.

---

### 7. Curva convexa (atleta muy entrenado)

**Input**: [0.8, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0, 3.8] @ ritmos decrecientes (7:00->4:30).

**Smoothed**: [0.80, 0.83, 0.90, 1.03, 1.23, 1.57, 2.43, 2.90]

**baseline_rise LT1**: baseline=0.8, +0.5=1.30. Smoothed[4]=1.23 < 1.30. Smoothed[5]=1.57 >= 1.30 y smoothed[6]=2.43 >= 1.57-0.25. **LT1 en escalon 6** (lactato 1.5). TARDIO pero correcto: la curva convexa retrasa el baseline_rise.

**sustained_increase LT1**: baseline+0.3=1.10. Smoothed[3]=1.03 < 1.10. Smoothed[4]=1.23 >= 1.10, ascending, next ascending (1.57>=1.23). **LT1 en escalon 5** (lactato 1.2). Mas temprano.

**LT2**: smoothed[7]=2.90 < 3.2. Ningun smoothed >= 3.2. Pero lactato real del ultimo escalon es 3.8. Smoothed usa promedio: mean(2.0, 3.8) = 2.90. El smoothing DESTRUYE la senal de LT2 cuando el salto ocurre en los dos ultimos puntos.

Fallback: baseline_rise pone LT2 en ultimo escalon (idx 7). Pero smoothed[7]=2.90 < max(3.2, 0.8+1.4=2.2)? 2.90 >= 2.2 y pendiente 2.90-2.43=0.47 >= 0.45. Next: default (es ultimo). **LT2 en escalon 8** (lactato 3.8).

**moddmax**: baseline+0.5=1.30. Start en escalon 5 (smoothed 1.23? No, 1.23<1.30). Escalon 6: 1.57 >= 1.30. Subset escalones 6-8: [1.57, 2.43, 2.90]. Linea de 1.57 a 2.90. Desviacion en escalon 7: 2.43 vs linea 1.57 + 0.5*(2.90-1.57) = 1.57+0.665 = 2.235. Desviacion = 2.43-2.235 = 0.195 > 0. **LT2 en escalon 7** (lactato 2.0). Correcto por ModDmax.

**Verdict**: Correcto (parcial)
- ModDmax maneja bien la curva convexa: detecta LT2 en la zona de maxima curvatura (escalon 7, lactato 2.0), que es fisiologicamente correcto para un atleta entrenado.
- baseline_rise falla parcialmente: detecta LT2 en el ultimo escalon (3.8) por fallback.
- sustained_increase: smoothed[7]=2.90 >= 2.2 pero pendiente comparativa falla.
- La agregacion (media de baseline_rise 3.8 y moddmax 2.0) da ~2.9 mmol, que es razonable.
- El LT1 se detecta un poco tarde (escalon 5-6 en vez de 4-5) por la curva convexa.

---

### 8. Solo 3 puntos

**Input**: [1.0, 2.5, 6.0] @ [6:00, 5:00, 4:00] (s/km: 360, 300, 240)

**Smoothed**: [1.75, 3.17, 4.25] (3 puntos: idx0=mean(1.0,2.5)=1.75, idx1=mean(1.0,2.5,6.0)=3.17, idx2=mean(2.5,6.0)=4.25)

**`_thresholds_from_session`**: len(candidates) >= 3 -> procede.

**baseline_rise**: baseline = min(1.75, 3.17) = 1.75. +0.5 = 2.25. Smoothed[1]=3.17 >= 2.25 y smoothed[2]=4.25 >= 3.17-0.25. **LT1 en escalon 2** (lactato 2.5). ALTO.

LT2: smoothed[1]=3.17 >= max(3.2, 1.75+1.4=3.15)? 3.17 >= 3.15 pero 3.17 < 3.2. NO por 3.2 threshold. Smoothed[2]=4.25 >= 4.0. Next: no hay siguiente -> default. **LT2 en escalon 3** (lactato 6.0).

**sustained_increase**: Solo 3 puntos, necesita idx >= 2. local_slope[2]=4.25-3.17=1.08, prior=3.17-1.75=1.42. 1.08 >= max(0.45, 1.42+0.2=1.62)? NO. Fallback ultimo. **LT2 en escalon 3**.

**moddmax**: len(candidates) < 4 -> return []. No contribuye.

**Confianza**: `min(0.88, 0.56 + 3*0.05)` = min(0.88, 0.71) = 0.71. Baja.

**Real thresholds**: usable_stage_count = 3 < 5. Gate NO pasa. Correcto.

**Verdict**: DUDOSO
- Con 3 puntos, LT1 a 2.5 mmol y LT2 a 6.0 mmol son estimaciones brutas.
- La confianza (0.71) es medianapero podria ser demasiado alta para 3 puntos.
- Real thresholds correctamente bloqueados.
- El detector de rango insuficiente no se activa (rango 6.0-1.0=5.0 > 1.5).

**Recomendacion**: Con <5 puntos, la confianza deberia estar capped a 0.55 maximo para evitar que el sistema de apariencia de precision con datos insuficientes.

---

### 9. Valores duplicados

**Input**: [1.0, 1.0, 1.0, 1.0, 4.0, 4.0, 8.0] @ cargas crecientes.

**Smoothed**: [1.00, 1.00, 1.00, 2.00, 3.00, 5.33, 6.00]

**Monotonicity**: Pares con tolerancia -0.15: 1.0>=1.0-0.15 (ok), 1.0>=1.0-0.15 (ok), 1.0>=1.0-0.15 (ok), 4.0>=1.0-0.15 (ok), 4.0>=4.0-0.15 (ok), 8.0>=4.0-0.15 (ok). **Monotonicity = 6/6 = 1.00**. Perfecta. Correcto.

**baseline_rise LT1**: baseline = min(1.0, 1.0, 1.0, 2.0) = 1.0. +0.5=1.50. Smoothed busca >=1.50. Smoothed[3]=2.00 >= 1.50 y smoothed[4]=3.00 >= 2.00-0.25. **LT1 en escalon 4** (lactato 1.0). Pero lactato real del escalon 4 es 1.0 (el cuarto 1.0). LT1 a 1.0 mmol = baseline. NO tiene sentido.

El problema: smoothed[3]=mean(1.0, 1.0, 4.0)=2.00. El smoothing incorpora el salto de 4.0 en el vecino, haciendo que el escalon 4 parezca alto. Pero el lactato contextual reportado es 1.0 (el real del escalon 4). LT1 se reporta con lactato 1.0 mmol y ritmo del escalon 4.

**sustained_increase LT1**: baseline+0.3=1.30. Smoothed busca >=1.30, ascending, next ascending. Smoothed[0..2]=1.0, 1.0, 1.0. No ascending. Smoothed[3]=2.00 >= 1.30, 2.00>1.00 (ascending), smoothed[4]=3.00>=2.00 (ascending). **LT1 en escalon 4** (lactato 1.0).

**LT2**: smoothed[4]=3.00 >= max(3.2, 1.0+1.4=2.4)? 3.00 < 3.2. NO. Smoothed[5]=5.33 >= 4.0. **LT2 en escalon 6** (lactato 4.0).

**Verdict**: DUDOSO
- LT1 detectado en escalon 4 con lactato 1.0 mmol es artefacto del smoothing.
- Fisiologicamente, LT1 deberia estar entre escalon 4 (1.0) y escalon 5 (4.0) -- el salto es tan abrupto que no hay LT1 gradual.
- Este tipo de curva "escalon" (flat + salto brusco) es comun en protocolos con saltos grandes entre escalones.

**Recomendacion**: Cuando el salto entre escalones es >2.0 mmol sin puntos intermedios, generar warning de "resolucion insuficiente en la zona de transicion LT1/LT2".

---

### 10. Lactato desciende al final

**Input**: [0.8, 1.2, 2.0, 3.5, 5.0, 4.2] @ cargas crecientes (el atleta se fatigo y la produccion cayo).

**Smoothed**: [1.00, 1.33, 2.23, 3.50, 4.23, 4.60]
- idx0: mean(0.8, 1.2) = 1.00
- idx1: mean(0.8, 1.2, 2.0) = 1.33
- idx2: mean(1.2, 2.0, 3.5) = 2.23
- idx3: mean(2.0, 3.5, 5.0) = 3.50
- idx4: mean(3.5, 5.0, 4.2) = 4.23
- idx5: mean(5.0, 4.2) = 4.60

**Nota**: El smoothing OCULTA la caida: smoothed sube monotonamente (4.23, 4.60) a pesar de que el real baja (5.0->4.2).

**baseline_rise LT2**: smoothed[3]=3.50 >= max(3.2, 0.8+1.4=2.2). Pendiente 3.50-2.23=1.27 >= 0.45. Next: 4.23 >= 3.50-0.5=3.00. **LT2 en escalon 4** (lactato 3.5).

Pero espera: smoothed[4]=4.23 >= 4.0. Next: 4.60 >= 4.23-0.5. Baseline_rise primero encuentra escalon 4 con criterio 3.2+pendiente. **LT2 en escalon 4** (lactato 3.5).

**moddmax**: baseline+0.5=1.30. Start donde smoothed >= 1.30: escalon 2 (smoothed 1.33). Subset: [1.33, 2.23, 3.50, 4.23, 4.60]. Linea de 1.33 a 4.60. Maxima desviacion: escalon 4 (3.50) vs linea 1.33 + (3/4)*(4.60-1.33) = 1.33 + 2.45 = 3.78. Desviacion = 3.50-3.78 = -0.28. Escalon 5 (4.23) vs 1.33 + (3/4)*(4.60-1.33) -- wait, recalculando con indices correctos. Idx 3 de subset: carga 4 (relativo). 4.23 vs 1.33 + (3/4)*(4.60-1.33). No, el calculo depende de las cargas reales, no los indices. La maxima desviacion positiva caera antes del salto.

**Monotonicity**: Par 5.0->4.2: 4.2 >= 5.0-0.15=4.85? 4.2 < 4.85. FALLO. Score = 4/5 = **0.80**.

**Verdict**: Correcto (parcial)
- El smoothing oculta la caida, lo cual protege la deteccion pero pierde informacion.
- LT2 se detecta correctamente en escalon 4 (3.5 mmol, antes de la caida).
- La caida del ultimo punto no contamina la deteccion de LT2.
- Monotonicity = 0.80 >= 0.60: el gate pasa, lo cual es correcto (la curva es mayormente monotona).
- Sin embargo, el punto 4.2 al final NO se marca como outlier intra-sesion en analytics.py (no hay LOO per-session, eso solo esta en dynamic_threshold_engine.py).

---

## D. Resumen de Riesgos

| Caso | Severidad | Clasificacion | Accion requerida |
|---|---|---|---|
| A1. Sin retest 3 meses | Alto | DUDOSO | Warning + testing_decision_block forzado >84d |
| A2. Cancelacion semana completa | Medio | DUDOSO | Detector de adherencia + readaptacion |
| A3. Cambio de objetivo mid-plan | Alto | DUDOSO | Warning de salto de fase + bloque transicional |
| A4. Override manual coach | Bajo | Correcto | Considerar campo coach_override |
| B. P01 sin mejora LT1 | Medio | DUDOSO | Detector divergencia LT1/LT2 |
| B. P01 abandono 4 semanas | Alto | PELIGROSO | Detector inactividad + readaptacion forzada |
| B. P03 regresion running | Medio | DUDOSO | Priorizacion global en triatlon |
| B. P05 estancamiento cronico | Alto | PELIGROSO | Detector estancamiento + ampliacion ANC |
| B. P05 sobreentrenamiento | Critico | PELIGROSO | Detector tendencia basales Z2 |
| B. P07 asimetria disciplinas | Medio | DUDOSO | Recomendacion global triatlon |
| B. P09 curva plana | Bajo | Correcto | Ya detectado por sistema |
| B. P09 solo 2 etapas | Bajo | Correcto | Ya manejado (len<3 -> []) |
| B. P09 baseline arruinado | Critico | PELIGROSO | Validacion baseline >3.0 mmol |
| B. P10 recaida S8 | Medio | DUDOSO | Detector regresion entre tests |
| B. P10 ajuste auto plan | Medio | DUDOSO | Re-evaluacion mid-block automatica |
| C1. Curva no monotonica | Medio | DUDOSO | Outlier intra-sesion en analytics.py |
| C2. LT1-LT2 <0.3 mmol | Bajo | Correcto | No aplica con separacion en lactato |
| C3. Pico <4.0 mmol | Medio | DUDOSO | Warning "test truncado" |
| C4. Primer valor >3.5 | Critico | PELIGROSO | Validacion baseline + LT1<LT2 |
| C5. Escalones 2 min | Bajo | Correcto | Protocol_score bloquea real thresholds |
| C6. Regresion brusca | Medio | DUDOSO | Alerta regresion >5% |
| C7. Curva convexa | Bajo | Correcto | ModDmax maneja bien |
| C8. Solo 3 puntos | Medio | DUDOSO | Cap confianza a 0.55 con <5 puntos |
| C9. Valores duplicados | Medio | DUDOSO | Warning resolucion insuficiente |
| C10. Lactato desciende | Bajo | Correcto | Smoothing protege deteccion |

---

## E. Recomendaciones Prioritarias

### 1. [CRITICO] Validacion de baseline arruinado (C4, P09 baseline alto)
**Que**: Si el primer valor de lactato del test es >3.0 mmol, marcar el test como invalido. No publicar umbrales.
**Por que**: Sin baseline valido, TODOS los metodos de deteccion fallan y pueden producir LT1 > LT2 o LT1 a 5+ mmol. Actualmente el sistema publica estos valores sin ningun bloqueo.
**Impacto**: Previene prescripciones basadas en umbrales fisiologicamente imposibles.

### 2. [CRITICO] Validacion LT1 < LT2 (C4)
**Que**: Despues de agregar LT1 y LT2, verificar que LT1_lactate < LT2_lactate Y LT1_ritmo_mas_lento_que_LT2_ritmo. Si no se cumple, no publicar ningun umbral.
**Por que**: LT1 >= LT2 es fisiologicamente imposible y actualmente el sistema no lo valida.
**Impacto**: Ultima linea de defensa contra datos de test corruptos.

### 3. [CRITICO] Detector de tendencia de basales para sobreentrenamiento (P05)
**Que**: Analizar la tendencia temporal de lactato en Z2 a misma carga. Si sube >0.5 mmol en >8 semanas, generar alerta de "posible sobreentrenamiento no funcional".
**Por que**: El deterioro gradual del basal es un marcador clasico de overreaching que el sistema actualmente no detecta. El atleta podria llegar a sobreentrenamiento sin alarma.
**Impacto**: Prevencion de lesiones y deterioro fisico.

### 4. [ALTO] Detector de inactividad prolongada (P01 abandono)
**Que**: Si no hay sesiones registradas en >14 dias, forzar semana de readaptacion al retorno y sugerir retest.
**Por que**: El sistema no sabe que el atleta estuvo inactivo y podria prescribir cargas excesivas al retorno.
**Impacto**: Prevencion de lesiones por carga excesiva post-pararon.

### 5. [ALTO] Detector de estancamiento cronico (P05)
**Que**: Si LT2 varia <5% en >3 tests / >12 semanas, generar alerta de estancamiento con sugerencia de cambio de estimulo.
**Por que**: El sistema no diferencia "estable y mejorando" de "estable y estancado". Un atleta diesel puede recibir el mismo bloque indefinidamente sin mejora.
**Impacto**: Permite al entrenador tomar decisiones informadas sobre cambio de bloque.

### 6. [ALTO] Testing_decision_block forzado >84 dias (A1)
**Que**: Cuando test_age_days > 84 (12 semanas), forzar testing_decision_block independientemente de la fase.
**Por que**: Actualmente solo se fuerza en specific/pre_comp con >56d. En base, un test de 3 meses se usa sin bloqueo.
**Impacto**: Garantiza que las prescripciones siempre se basan en datos razonablemente recientes.

### 7. [ALTO] Ampliacion ANC para atletas estancados (P05)
**Que**: Ampliar `_ANC_CANDIDATE_EVENTS` para incluir maraton/ironman SOLO cuando se detecte estancamiento + VLamax low.
**Por que**: Olbrecht recomienda ANC incluso para atletas de larga distancia cuando estan estancados. El sistema actualmente excluye maraton/ironman de ANC.
**Impacto**: Permite romper plateaus en atletas diesel de larga distancia.

### 8. [MEDIO] Warning "test truncado" cuando LT2 < 3.5 mmol en ultimo escalon (C3)
**Que**: Si LT2 detectado tiene lactato < 3.5 mmol y cae en el ultimo escalon, generar warning "test posiblemente truncado".
**Por que**: El atleta probablemente no alcanzo su LT2 real. El sistema defaulta al ultimo escalon y reporta un valor que no es un verdadero umbral.
**Impacto**: Mejora la comunicacion con el entrenador sobre la calidad del test.

### 9. [MEDIO] Detector de regresion entre tests (C6, P10)
**Que**: Si LT2 empeora >5% entre tests consecutivos, generar alerta con severidad proporcional.
**Por que**: Una regresion significativa puede indicar lesion, enfermedad, sobreentrenamiento, o error de protocolo. Actualmente el sistema actualiza silenciosamente.
**Impacto**: Alerta temprana al entrenador para investigar causas.

### 10. [MEDIO] Outlier intra-sesion en analytics.py (C1)
**Que**: Aplicar validacion Billat (caida >0.5 mmol vs punto anterior Y siguiente) en la deteccion per-sesion, no solo en el motor dinamico.
**Por que**: Una caida puntual puede arrastrar la deteccion de LT1 a un punto anomalo. El smoothing ayuda pero no resuelve todos los casos.
**Impacto**: Mejora la robustez de la deteccion per-sesion.

### 11. [MEDIO] Priorizacion global en triatlon (P03, P07)
**Que**: Para triatletas, generar una recomendacion global que considere las 3 disciplinas, priorice la disciplina en regresion/limitante, y sugiera distribucion de volumen.
**Por que**: Actualmente cada disciplina recibe un bloque independiente sin orientacion global. El entrenador no recibe ayuda para decidir donde invertir las horas limitadas.
**Impacto**: Mejora la utilidad del sistema para triatletas.

### 12. [BAJO] Cap de confianza con <5 puntos (C8)
**Que**: Cuando hay <5 puntos en un test, la confianza maxima deberia ser 0.55.
**Por que**: Con 3 puntos, la confianza de 0.71 da apariencia de precision que no existe.
**Impacto**: Mejora la calibracion de la confianza reportada.

---

AGENTE 1C COMPLETADO
