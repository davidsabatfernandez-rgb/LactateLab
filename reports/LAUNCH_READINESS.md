# LAUNCH READINESS -- PeakAerobic / Lactate Lab

Fecha: 2026-03-14
Agente: 4 -- Coherencia Global y Launch Readiness
Basado en: Agentes 1A, 1B, 1C, 2, 3

---

## 1. SEMAFORO GLOBAL

### AMARILLO

El sistema tiene una base cientifica solida (Olbrecht, Faude, Bishop, Mader) y una implementacion coherente del motor de lactato, la periodizacion por bloques y la libreria de sesiones. Los 12 perfiles funcionan correctamente en el flujo principal (test -> umbrales -> bloque -> sesiones). Sin embargo, existen 4 gaps criticos en seguridad (validacion de baseline, fatiga cruzada en triatlon, deteccion de sobreentrenamiento, deteccion de inactividad) que deben resolverse antes de un launch a produccion con triatletas. Para atletas mono-disciplina (running, ciclismo, natacion pura), el sistema esta muy cerca de VERDE.

---

## 2. BLOQUEANTES DE LAUNCH (ordenados por gravedad)

| # | Issue | Modulo | Severidad | Descripcion | Accion requerida |
|---|---|---|---|---|---|
| B1 | Baseline arruinado no detectado | analytics.py | CRITICO | Si el primer valor de lactato del test es >3.0 mmol, el sistema produce umbrales absurdos (LT1 a 5+ mmol, LT2 < LT1). No hay validacion. | Validar baseline: si min(lactatos[0:4]) > 3.0 mmol, marcar test como invalido y no publicar umbrales. |
| B2 | LT1 >= LT2 no validado | analytics.py | CRITICO | Despues de agregar LT1 y LT2, el sistema no verifica que LT1_lactate < LT2_lactate ni que LT1_pace sea mas lento que LT2_pace. Publica umbrales invertidos. | Anadir validacion post-agregacion: si LT1 >= LT2 en lactato o ritmo, no publicar. |
| B3 | Sin deteccion de sobreentrenamiento | dynamic_threshold_engine.py | CRITICO | No hay analisis de tendencia temporal de lactato Z2. Un drift progresivo de basales (+0.5 mmol en 8+ semanas) no genera alarma. El atleta puede llegar a overtraining sin aviso. | Implementar trend analysis de basales Z2: si lactato Z2 sube >0.5 mmol en >8 semanas a misma carga, generar alerta. |
| B4 | Sin fatiga cruzada en triatlon | mesocycle_prescription.py | CRITICO | Tres bloques paralelos (running+ciclismo+natacion) pueden generar carga excesiva sin warning. No hay cross-discipline spacing ni modelo de fatiga cruzada ciclismo->running (Hausswirth 2013: -8-12%). | Implementar: (1) acumulador de sesiones totales por semana con limite por nivel, (2) si sesion fatigue_cost>=4 en disc. A en dia N, no programar fatigue_cost>=3 en disc. B en dia N+1. |

---

## 3. MEJORAS ANTES DEL LAUNCH

| # | Issue | Modulo | Impacto | Descripcion | Esfuerzo estimado |
|---|---|---|---|---|---|
| I1 | Deteccion de inactividad prolongada | mesocycle_prescription.py | ALTO | >14 dias sin sesiones registradas no genera alerta. El sistema prescribe build_peak al retorno sin readaptacion. Riesgo de lesion. | 2-3 dias |
| I2 | Detector de estancamiento cronico | physiological_engine.py | ALTO | >3 tests con <5% mejora en >12 semanas no genera alerta. Diesel estancado recibe el mismo bloque indefinidamente. | 2-3 dias |
| I3 | ANC excluido para eventos largos | physiological_engine.py | ALTO | `_ANC_CANDIDATE_EVENTS` excluye maraton/ironman. Un diesel estancado en maraton nunca recibira ANC (Olbrecht lo recomienda). | 1 dia (condicionar a estancamiento + VLamax low) |
| I4 | Testing_decision_block solo en specific/pre_comp | physiological_engine.py | ALTO | Con test >56d, solo se fuerza testing_decision en specific/pre_comp. En base, se prescribe con datos de 3 meses sin bloqueo. | 1 dia (forzar testing_decision cuando test_age > 84d en cualquier fase) |
| I5 | Templates brick insuficientes | workout_library.py | ALTO | Solo 1 template brick (tri_brick_aep). Faltan brick swim->bike y brick bike->run para fases base y race. | 2-3 dias (anadir 3-4 templates) |
| I6 | Proxy VLamax por ratio de potencia | physiological_engine.py | MEDIO | En ciclismo, el ratio LT1/LT2 en watts clasifica VLamax "high" en perfiles diesel (P02, P07, P11). Genera diagnostico incorrecto. | 3-5 dias (factor de correccion ciclismo o proxy complementario por pico de lactato) |
| I7 | 7 templates key sin dose_ladder | workout_library.py | MEDIO | run_specific_pace_reps, bike_long_endurance, bike_lt2_long_reps y otros no tienen dose_ladder, dificultando la progresion automatica. | 2-3 dias |
| I8 | Evidence_ids huerfanos | workout_library.py | BAJO | 6 evidence_ids referenciados pero no definidos en EVIDENCE_SOURCES. Sin impacto funcional pero inconsistente. | 0.5 dias |

---

## 4. MEJORAS POST-LAUNCH

| # | Issue | Modulo | Descripcion | Prioridad |
|---|---|---|---|---|
| P1 | Detector de regresion entre tests | analytics.py / physiological_engine.py | Si LT2 empeora >5% entre tests consecutivos, generar alerta con severidad proporcional. Actualmente el sistema actualiza silenciosamente. | ALTA |
| P2 | Priorizacion global en triatlon | physiological_engine.py | Generar `global_priority_ranking` con distribucion sugerida de horas por disciplina segun gaps relativos. Actualmente cada disciplina recibe bloque independiente sin orientacion global. | ALTA |
| P3 | Detector de divergencia LT1/LT2 | analytics.py | Si LT2 mejora pero LT1 se estanca entre tests, alertar al entrenador ("considerar mas volumen subumbral extensivo"). | MEDIA |
| P4 | Re-evaluacion mid-block automatica | physiological_engine.py | Cuando llega un nuevo test formal durante un bloque en curso, re-evaluar y notificar al entrenador si el bloque recomendado cambia. | MEDIA |
| P5 | Alerta "no entrenar hoy" | dynamic_threshold_engine.py | Cuando basal pre-sesion >2.0 mmol, generar contraindicacion formal de entrenamiento intenso (no solo warning). | MEDIA |
| P6 | Cap de confianza con <5 puntos | analytics.py | Con <5 puntos en un test, la confianza maxima deberia ser 0.55 (actualmente 0.71 con 3 puntos). | MEDIA |
| P7 | Multiplicador de spacing por edad | mesocycle_prescription.py | Un masters >45 anos recibe el mismo spacing que un joven de 24. Multiplicar min_spacing_days_after x 1.3 para >45 anos. | BAJA |
| P8 | Outlier intra-sesion en analytics.py | analytics.py | Aplicar validacion Billat (caida >0.5 mmol vs punto anterior Y siguiente) en deteccion per-sesion, no solo en motor dinamico. | BAJA |
| P9 | Walk-run para principiantes absolutos | workout_library.py | El primer peldano de la mayoria de familias asume un minimo de condicion fisica. Un formato "5' run Z1 + 1' walk x 6" seria necesario para principiantes absolutos. | BAJA |
| P10 | Warning "test truncado" | analytics.py | Si LT2 detectado tiene lactato <3.5 mmol y cae en el ultimo escalon, generar warning "test posiblemente truncado". | BAJA |
| P11 | Protocolo readaptacion post-lesion | mesocycle_prescription.py | Limitar peldano maximo durante primeras 4 semanas post-lesion (cap en peldano 2 independientemente de robustness). | BAJA |
| P12 | Recency decay de tests formales | dynamic_threshold_engine.py | A 6 semanas, un test formal (7-8 puntos alta calidad) pesa casi igual que una toma individual reciente. El protocol_score superior deberia mantener mas peso. | BAJA |
| P13 | Integracion RPE/percepcion subjetiva | dynamic_threshold_engine.py | El sistema solo usa datos objetivos. Un RPE elevado con lactato normal podria indicar fatiga central no metabolica. | BAJA |

---

## 5. NIVEL DE CONFIANZA POR MODULO

| Modulo | Confianza | Notas |
|---|---|---|
| Motor de lactato (analytics.py) | 82% | Deteccion multi-metodo robusta. ModDmax maneja curvas convexas. Smoothing efectivo. Falla en edge cases de baseline arruinado y LT1>=LT2 no validado. |
| Motor dinamico (dynamic_threshold_engine.py) | 85% | LOO outlier detection, multi-bracket interpolation y recency decay funcionan bien. Anticipa mejoras entre tests en 10/12 perfiles. Falta trend analysis temporal y mecanismo de retest trigger. |
| Motor fisiologico (physiological_engine.py) | 80% | CapacityProfile y seleccion de bloques coherentes con Olbrecht. Overrides S1/D1 solidos. Falla en proxy VLamax ciclismo y en ANC excluido para eventos largos. Sin detector de estancamiento. |
| Motor de prediccion (prediction_engine.py) | 75% | Modelo di Prampero + VLamax (Mader 2003). Depende de la calidad de VO2max estimado (Swain+ACSM sobrestima 14-28% en atletas). |
| Motor de mesociclos (mesocycle_prescription.py) | 83% | Wave principle fielmente implementado. Dose ladders bien calibrados. Cobertura completa de bloques x disciplinas. Falta limite max de semanas de trabajo, fatiga cruzada, y deteccion de adherencia. |
| Libreria de sesiones (workout_library.py) | 88% | 81 templates con cobertura excepcional. Coherencia con Olbrecht y CSV de Nacho. Solo 3 issues menores (rename, revisar, dose_ladder faltante). Gap critico: solo 1 template brick para triatlon. |
| Sistema end-to-end | 78% | Los 12 perfiles fluyen correctamente en el camino principal. Los gaps de seguridad (baseline, fatiga cruzada, sobreentrenamiento, inactividad) reducen la confianza para produccion sin supervision. |

---

## 6. PERFILES LISTOS PARA PRODUCCION

Los siguientes perfiles funcionan correctamente end-to-end y pueden usarse en produccion con supervision normal del entrenador:

- **P01** -- Runner principiante glucolitico: Test, umbrales, bloque AEC, sesiones, progresion temporal. Todo coherente.
- **P02** -- Ciclista veterano aerobico: Funcional con la salvedad de VLamax proxy incorrecto (clasificacion "high" en vez de "low"). El bloque prescrito (AEP/THR) sigue siendo adecuado por el gap pequeno.
- **P04** -- Nadadora con running debil: Asimetria detectada correctamente. Running priorizado. Progresion coherente.
- **P05** -- Runner estancado: Funcional en el camino principal. La falta de detector de estancamiento es una limitacion pero no un peligro.
- **P06** -- Triatleta joven glucolitico: Base aerobica priorizada correctamente. VLamax subestimada pero bloque AEC sigue siendo correcto.
- **P08** -- Masters runner: Objetivo superado detectado. Bloque AEP/COMP coherente. Progresion estable.
- **P10** -- Triatleta post-lesion: Motor comprimido corregido (no falso diesel). AEC prescrito correctamente. Progresion de readaptacion coherente.
- **P11** -- Ciclista puro: Primer test gestionado correctamente. Progresion coherente con tomas de entreno.
- **P12** -- Nadador OW: Perfil diesel detectado. Bloque AEP/COMP coherente para 10km OW.

**Total: 9 de 12 perfiles listos.**

---

## 7. PERFILES QUE NECESITAN MAS VALIDACION

| Perfil | Razon | Riesgo | Accion |
|---|---|---|---|
| P03 -- Triatleta Ironman | 3 disciplinas simultaneas sin control de carga total ni fatiga cruzada. El entrenador podria recibir 9-12 sesiones/semana sin warning. | ALTO | Resolver B4 (fatiga cruzada) e I5 (templates brick) antes de usar con triatletas. |
| P07 -- Ciclista->triatleta | Mismos problemas de P03 + asimetria extrema entre disciplinas sin priorizacion global. VLamax ciclismo clasificada incorrectamente. | ALTO | Resolver B4 + I6 (VLamax ciclismo) + P2 (priorizacion global). |
| P09 -- Test deficiente | Entre Test 1 deficiente y Test 2 correcto (6 semanas), el sistema usa parcialmente umbrales sobreestimados del Test 1. Las tomas de entreno corrigen pero el ajuste es conservador. | MEDIO | Resolver B1 (baseline arruinado) y P6 (cap confianza con <5 puntos). |

---

## 8. COHERENCIA END-TO-END

### Parte A -- Tabla de coherencia por perfil y capa

| Perfil | Test->Umbrales | Umbrales->Meso | Meso->Semanas | Semanas->Sesiones | Update | Estanc. | Seguridad |
|---|---|---|---|---|---|---|---|
| P01 | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | DESCONEXION (1) | FLUYE BIEN |
| P02 | FLUYE BIEN | DESCONEXION (2) | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN |
| P03 | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | DESCONEXION (3) | FLUYE BIEN | FLUYE BIEN | CRITICO (4) |
| P04 | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN |
| P05 | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | CRITICO (5) | DESCONEXION (6) |
| P06 | FLUYE BIEN | DESCONEXION (2) | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN |
| P07 | FLUYE BIEN | DESCONEXION (2) | FLUYE BIEN | DESCONEXION (3) | FLUYE BIEN | FLUYE BIEN | CRITICO (4) |
| P08 | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN |
| P09 | DESCONEXION (7) | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | DESCONEXION (8) |
| P10 | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | DESCONEXION (9) |
| P11 | FLUYE BIEN | DESCONEXION (2) | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN |
| P12 | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN | FLUYE BIEN |

**Notas:**
1. No hay detector de estancamiento de LT1 individual (LT2 mejora pero LT1 no).
2. Proxy VLamax por ratio de potencia clasifica incorrectamente en ciclismo (high en vez de low/moderate). El bloque prescrito sigue siendo razonable por otros factores.
3. En triatlon, las sesiones de 3 disciplinas se generan independientemente sin control de carga total. Falta brick planning.
4. Sin fatiga cruzada ni acumulador de carga multidisciplina: riesgo de sobredosis en triatletas.
5. Sin detector de estancamiento: diesel estancado recibe el mismo bloque indefinidamente. ANC excluido para maraton.
6. Sin detector de tendencia de basales Z2 para sobreentrenamiento.
7. Test con 4 escalones y saltos irregulares produce LT1 artificialmente alto (2.8 mmol). El sistema reduce confianza pero no invalida.
8. Entre Test 1 deficiente y Test 2, prescripcion basada parcialmente en umbrales sobreestimados.
9. Sin deteccion de inactividad prolongada: al retorno de 4 semanas de para, el sistema no fuerza readaptacion.

### Parte B -- Multidisciplina triatlon (P03, P04, P06, P07, P09, P10)

| Criterio | Estado | Notas |
|---|---|---|
| Zonas bien separadas por disciplina | OK | Cada disciplina mantiene su propia ventana de estimacion sin contaminacion cruzada. Verificado en todos los perfiles multidisciplina. |
| Carga total considera 3 disciplinas | NO | No hay sumador de carga cross-discipline. 3 bloques paralelos pueden generar 9-12 sesiones/semana sin warning. |
| Test de ciclismo no contamina umbrales de running | OK | La separacion por disciplina en analytics.py y dynamic_threshold_engine.py es completa. |
| Existe modelo de fatiga cruzada | NO -- CRITICO | No hay modelo de fatiga cruzada ciclismo->running. Hausswirth 2013: -8-12% en running leg post-ciclismo. El sistema no lo refleja. |
| Plan prioriza disciplina mas debil | PARCIAL | El sistema identifica la disciplina limitante pero no genera redistribucion de volumen ni orientacion global. |
| Sesiones brick incluidas | MINIMO | Solo 1 template brick (tri_brick_aep). Faltan swim->bike y bike->run para fases base y race. |

### Parte C -- Seguridad

| Criterio | Estado | Severidad | Notas |
|---|---|---|---|
| Prescribe algo peligroso post-lesion | NO | -- | P10 recibe AEC conservador. El motor comprimido se corrige bien. |
| Prescribe intensidad excesiva sin descarga | PARCIAL | IMPORTANTE | Semanas de recovery automaticas (3:1 o 4:1), pero no hay limite maximo de semanas de trabajo sin descarga. Un bloque de 10 semanas tendria 9 semanas de trabajo + 1 de recovery. |
| Publica umbrales invertidos LT1>LT2 | SI | BLOQUEANTE | Cuando baseline > 3.0 mmol o curva aberrante, LT1 puede ser mayor que LT2 sin validacion (B1, B2). |
| Prescribe build_peak tras inactividad | SI | IMPORTANTE | Sin detector de inactividad, el sistema prescribe segun el plan sin ajustar por pausa (I1). |
| Mensajes de aviso claros | PARCIAL | IMPORTANTE | Alertas de fatiga son utiles. Pero no hay: alerta de estancamiento, alerta de regresion, alerta de "no entrenar hoy", alerta de inactividad. |
| Guardrails suficientes | PARCIAL | IMPORTANTE | Existen: MIN_WEEKS, overrides S1/D1, protocol_score gates, real thresholds gates. Faltan: baseline validation, LT1<LT2 check, max_work_weeks, cross-discipline spacing, inactivity detection. |

---

## 9. RECOMENDACION FINAL PARA EL COACH

### Que puede esperar

El sistema detecta correctamente los umbrales de lactato (LT1 y LT2) en tests incrementales estandar con >=5 escalones de >=3 minutos. La prescripcion de bloques sigue el modelo Olbrecht (AEC, THR, AEP, ANC, ANP, COMP) con wave principle (load->build->build_peak->recovery) y dose ladders progresivos. Las tomas de lactato en entreno complementan los tests formales y anticipan mejoras/deterioros antes del siguiente test.

### Que limitaciones tiene

1. **Triatlon**: El sistema analiza cada disciplina independientemente. El coach debe gestionar la carga total y la distribucion de volumen entre disciplinas manualmente. No hay modelo de fatiga cruzada ni planificacion de brick sessions automatica.

2. **Estancamiento**: Si el atleta no mejora en 3-4 tests, el sistema no genera alerta automatica ni sugiere cambio de estimulo. El coach debe interpretar la falta de progresion.

3. **Datos deficientes**: Con tests de <5 escalones o duraciones <3 minutos, los umbrales pueden ser imprecisos. El sistema reduce la confianza pero no siempre invalida. El coach debe asegurar protocolos de test adecuados.

4. **VLamax en ciclismo**: El proxy de VLamax por ratio LT1/LT2 en potencia tiende a sobreestimar la glucolisis en ciclistas. El coach debe interpretar este dato con cautela y considerar la forma de la curva.

### Que debe vigilar manualmente

- **Carga total semanal en triatletas**: Sumar las horas de las 3 disciplinas y verificar que no excedan los limites del atleta.
- **Basales de lactato en Z2**: Si observa una tendencia ascendente en las tomas de Z2 a lo largo de semanas, considerar overreaching.
- **Retorno tras inactividad**: Despues de >2 semanas sin entrenar, insertar manualmente una semana de readaptacion antes de retomar la progresion.
- **Tests mal ejecutados**: Si el primer escalon del test muestra lactato >2.0 mmol, considerar repetir el test empezando a menor intensidad.

---

## 10. RECOMENDACION FINAL PARA EL DEVELOPER

### Implementar primero (pre-launch)

1. **Validacion de baseline y LT1<LT2** (B1, B2) -- 1-2 dias de trabajo. Es la correccion mas critica y simple: dos validaciones en analytics.py que previenen la publicacion de umbrales absurdos.

2. **Cross-discipline spacing** (B4 parcial) -- 2-3 dias. Implementar regla basica en `_smart_day_offsets()`: si hay sesion fatigue_cost>=4 en una disciplina en dia N, no programar fatigue_cost>=3 en otra disciplina en dia N+1. Anadir acumulador semanal con warning si total_hours > limite por nivel.

3. **Trend analysis de basales Z2** (B3) -- 2-3 dias. En dynamic_threshold_engine.py, anadir funcion `_detect_overreaching_trend()` que analice lactato en Z2 (<LT1 pace) en ventana cronica. Si pendiente > +0.5 mmol en 56+ dias a misma carga, generar warning.

4. **Deteccion de inactividad** (I1) -- 1 dia. En el endpoint de prescripcion, verificar `days_since_last_session > 14` y forzar semana de readaptacion.

### Implementar segundo (primera semana post-launch)

5. **Detector de estancamiento** (I2) + **Expansion ANC** (I3) -- 2 dias.
6. **Testing_decision_block forzado >84d** (I4) -- 0.5 dias.
7. **Templates brick** (I5) -- 2-3 dias (swim->bike base, swim->bike race, bike->run base).
8. **Dose_ladders faltantes** (I7) -- 1-2 dias.

### Refactorizar (sprint siguiente)

9. **Proxy VLamax en ciclismo** (I6) -- Considerar:
   - Factor de correccion por disciplina en el calculo del ratio (x1.15 para ciclismo).
   - Proxy complementario por pico de lactato (>8 mmol = high, 5-8 = moderate, <5 = low).
   - Normalizacion del ratio en velocidad equivalente (W/kg -> km/h via peso).

10. **Priorizacion global triatlon** (P2) -- Generar recomendacion top-level que considere las 3 disciplinas, sus gaps relativos, y sugiera distribucion porcentual de horas.

### Tests a anadir

- Test de regresion para baseline > 3.0 mmol: verificar que el sistema rechaza el test.
- Test de regresion para LT1 >= LT2: verificar que el sistema no publica umbrales.
- Test de cross-discipline spacing: verificar que sesiones intensas de diferentes disciplinas no se programan en dias consecutivos.
- Test de inactividad: verificar que >14 dias sin sesiones genera readaptacion.
- Test de estancamiento: verificar que >3 tests con <5% mejora genera alerta.
- Tests de los 12 perfiles end-to-end como tests de integracion automatizados.

### Roadmap de mejoras

| Sprint | Foco | Items |
|---|---|---|
| Pre-launch | Seguridad critica | B1, B2, B3, B4 |
| Semana 1 post-launch | Deteccion inteligente | I1, I2, I3, I4, I5 |
| Semana 2-3 post-launch | Calidad de prescripcion | I6, I7, I8, P1, P2 |
| Mes 2 post-launch | Refinamiento | P3-P6, P8, P10 |
| Mes 3+ post-launch | Nice-to-have | P7, P9, P11, P12, P13 |

---

## APENDICE -- Consolidacion de issues por modulo

### analytics.py (Motor de lactato)

| # | Issue | Severidad | Fuente |
|---|---|---|---|
| B1 | Baseline arruinado (>3.0 mmol) no invalida test | BLOQUEANTE | Agente 1C |
| B2 | LT1 >= LT2 en lactato no validado | BLOQUEANTE | Agente 1C |
| P6 | Confianza 0.71 con solo 3 puntos (deberia ser max 0.55) | MEDIA | Agente 1C |
| P8 | Sin outlier intra-sesion (solo en motor dinamico) | BAJA | Agente 1C |
| P10 | Sin warning "test truncado" cuando LT2 <3.5 mmol en ultimo escalon | BAJA | Agente 1C |
| -- | Smoothing de 3 vecinos oculta caidas pero funciona correctamente en general | INFO | Agente 1C |

### dynamic_threshold_engine.py (Motor dinamico)

| # | Issue | Severidad | Fuente |
|---|---|---|---|
| B3 | Sin trend analysis de basales Z2 (sobreentrenamiento) | BLOQUEANTE | Agentes 1C, 2 |
| P5 | Sin alerta formal "no entrenar hoy" cuando basal >2.0 mmol | MEDIA | Agente 1B |
| P12 | Recency decay agresivo para tests formales (0.2 a 6 semanas) | BAJA | Agente 1B |
| -- | LOO outlier detection conservador y seguro | OK | Agente 1B |
| -- | Multi-bracket interpolation robusta | OK | Agente 1B |

### physiological_engine.py (Motor fisiologico)

| # | Issue | Severidad | Fuente |
|---|---|---|---|
| I2 | Sin detector de estancamiento cronico | ALTA | Agentes 1C, 2 |
| I3 | ANC excluido para maraton/ironman | ALTA | Agentes 1C, 2 |
| I4 | Testing_decision solo en specific/pre_comp con >56d | ALTA | Agente 1C |
| I6 | Proxy VLamax por ratio de potencia falla en ciclismo | MEDIA | Agentes 1A, 2 |
| P1 | Sin detector de regresion entre tests | MEDIA | Agente 1C |
| P2 | Sin priorizacion global multidisciplina | MEDIA | Agentes 1C, 2, 3 |
| P3 | Sin detector de divergencia LT1/LT2 | MEDIA | Agente 1C |
| P4 | Sin re-evaluacion mid-block cuando llega nuevo test | MEDIA | Agente 1C |

### mesocycle_prescription.py (Motor de mesociclos)

| # | Issue | Severidad | Fuente |
|---|---|---|---|
| B4 | Sin fatiga cruzada ni carga total multidisciplina | BLOQUEANTE | Agentes 2, 3 |
| I1 | Sin deteccion de inactividad prolongada | ALTA | Agentes 1C, 2 |
| -- | Sin limite maximo de semanas de trabajo sin descarga | MEDIA | Agente 2 |
| -- | Sin deteccion de adherencia (sesiones completadas vs planificadas) | MEDIA | Agentes 1C, 2 |
| P7 | Sin multiplicador de spacing por edad para masters | BAJA | Agente 3 |
| P11 | Sin protocolo de readaptacion post-lesion con cap de peldano | BAJA | Agente 3 |

### workout_library.py (Libreria de sesiones)

| # | Issue | Severidad | Fuente |
|---|---|---|---|
| I5 | Solo 1 template brick para triatlon | ALTA | Agentes 2, 3 |
| I7 | 7 templates key sin dose_ladder | MEDIA | Agente 3 |
| I8 | 6 evidence_ids huerfanos | BAJA | Agente 3 |
| -- | run_subthreshold_3min: titulo ambiguo | BAJA | Agente 3 |
| -- | bike_fatmax_intervals: REC como bloque compatible incorrecto | BAJA | Agente 3 |
| -- | bike_lt2_long_reps solapado con bike_lt2_halfpace | BAJA | Agente 3 |

### prediction_engine.py (Motor de prediccion)

| # | Issue | Severidad | Fuente |
|---|---|---|---|
| -- | VO2max via Swain+ACSM sobrestima 14-28% en atletas | MEDIA | Agente 1A |
| -- | Considerar ecuacion FRIEND (Kaminsky 2017) como alternativa | BAJA | Agente 1A |

---

VALIDACION COMPLETA -- LAUNCH READINESS GENERADO
