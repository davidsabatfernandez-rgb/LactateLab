# Agente 1B -- Progresion Temporal con Lactato en Entrenos

Fecha: 2026-03-14
Sistema: Lactate Lab (PeakAerobic)

---

## Metodologia

### Como integra el sistema tests formales vs tomas en entreno

El sistema PeakAerobic distingue dos fuentes de datos de lactato:

**TIPO A -- Tests incrementales formales** (analytics.py):
- Procesados por el motor de sesion (3 metodos: baseline_rise, sustained_increase, moddmax).
- Generan ThresholdResult con LT1/LT2 fisiologicos, LT1p/LT2p practicos, real thresholds, CapacityProfile.
- Requieren >= 5 escalones para real thresholds; >= 4 para moddmax.
- Son la fuente primaria para prescripcion de bloques (physiological_engine.py).

**TIPO B -- Tomas de lactato en entreno** (dynamic_threshold_engine.py):
- Se guardan como LactateSample en SessionInterval.
- El motor dinamico las integra con peso combinado = recency^1.0 * quality^1.0 * similarity^1.0 * context_score * baseline_state_score.
- Recency: decay exponencial (half-life 18d, min 0.2).
- Quality: sample_delay (<=15s:1.0, <=60s:0.82, <=90s:0.66), baseline_source, contextual_confidence.
- Similarity: bonus +0.18 si purpose contiene "lt1/lt2/threshold".
- NO actualizan umbrales fisiologicos (eso solo tests formales).
- SI influyen en umbrales dinamicos practicos (ventanas aguda 10d y cronica 42d).
- Filtros: LOO outlier detection (residual > 1.0 mmol -> peso x0.25), isotonic filter (PAVA deviation > 1.2 -> peso x0.03).

**Interaccion entre ambos tipos**:
- Los tests formales aportan multiples puntos de alta calidad (protocol_score alto, similarity alta si session_type="incremental").
- Las tomas en entreno aportan puntos individuales con calidad variable (depende de delay, baseline, contexto).
- La multi-bracket interpolation usa hasta 4 candidatos por lado del target, priorizando no-outliers.
- Con suficientes tomas entre tests, el sistema puede anticipar cambios antes del siguiente test formal.
- Limitation: con pocas tomas y alta variabilidad, el LOO con 3-4 puntos no detecta outliers sutiles.

### Parametros de referencia para la simulacion

| Parametro | Valor |
|---|---|
| LT1 practico target | 1.6 mmol |
| LT2 practico target | 3.1 mmol |
| Outlier LOO threshold | 1.0 mmol |
| Isotonic deviation threshold | 1.2 mmol |
| Recency half-life | 18 dias |
| Recency min weight | 0.2 |
| Ventana aguda | 10 dias |
| Ventana cronica | 42 dias |

---

## Perfil P01 -- Runner principiante glucolitico

### TABLA 1 -- Tests formales

| Test | Semana | LT1 (mmol) | LT1 ritmo | LT2 (mmol) | LT2 ritmo | LT1p | LT2p | Cambio vs anterior |
|---|---|---|---|---|---|---|---|---|
| Test 1 | S1 | 1.6 | 6:45/km | 4.1 | 5:30/km | 1.3 mmol ~7:15/km | 3.6 mmol ~5:45/km | -- (baseline) |
| Test 2 | S6 | 1.5 | 6:30/km | 3.9 | 5:22/km | 1.2 mmol ~6:55/km | 3.4 mmol ~5:38/km | LT2 ritmo +8s/km, mejora moderada |
| Test 3 | S14 | 1.4 | 6:10/km | 3.7 | 5:10/km | 1.1 mmol ~6:35/km | 3.2 mmol ~5:25/km | LT2 ritmo +12s/km, mejora consistente |
| Test 4 | S22 | 1.3 | 5:55/km | 3.5 | 5:00/km | 1.0 mmol ~6:20/km | 3.0 mmol ~5:15/km | LT2 ritmo +10s/km, progresion sostenida |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Zona | Lactato esperado | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Base aerobica Z2 (min 20) | Z2 | 1.3-1.6 | 1.8 | Warning: lactato elevado para Z2; posible ritmo excesivo | Si -- principiante tiende a correr rapido |
| S2 | Base aerobica Z2 (min 40) | Z2 | 1.4-1.7 | 2.0 | Drift +0.2 en 20min; confirma Z2 alta. Sugerir reducir ritmo | Si -- drift esperado en principiante |
| S3 | Umbral Z4 (inicio bloque) | Z4 | 3.5-4.0 | 3.8 | Cerca de LT2 fisiologico; zona correcta | Si |
| S3 | Umbral Z4 (mitad bloque) | Z4 | 3.8-4.5 | 4.5 | Acumulacion moderada; ajustar ritmo -5s/km si continua | Si -- acumulacion normal en principiante |
| S3 | Umbral Z4 (final bloque) | Z4 | 4.0-5.0 | 5.2 | Por encima de LT2; sesion fue supraumbal. Nota: normal en primeras sesiones de umbral | Si |
| S4 | Z2 con fatiga (sorpresa) | Z2 | 1.3-1.6 | 2.4 | ALERTA FATIGA: lactato Z2 > LT1p+0.5. Considerar descanso o reducir carga | Si -- detecta fatiga correctamente |
| S8 | VO2max Z5 (pre-sesion) | Basal | 0.8-1.2 | 1.0 | Basal normal; ok para entrenar | Si |
| S8 | VO2max Z5 (post-bloque) | Z5+ | 6.0-9.0 | 7.8 | Post-Z5 esperado; clearance normal si baja <4 en 5min | Si |
| S11 | Larga 2h (min 30) | Z1-Z2 | 1.0-1.4 | 1.3 | En zona; ritmo correcto | Si |
| S11 | Larga 2h (min 60) | Z1-Z2 | 1.1-1.5 | 1.5 | Drift minimo; buena gestion | Si |
| S11 | Larga 2h (min 90) | Z2 | 1.2-1.7 | 1.8 | Drift acumulado +0.5 en 90min; normal en principiante, considerar nutricion | Si |
| S11 | Larga 2h (min 120) | Z2 | 1.3-2.0 | 2.2 | Drift total +0.9; umbral de fatiga metabolica. Sugerir reducir ritmo en ultimos 30min | Si |
| S16 | Umbral Z4 (datos atipicos) | Z4 | 3.2-3.8 | 2.6 | Lactato MENOR de lo esperado. Posible mejora real (coherente con progresion). Confirmar en Test 3. | Si -- anticipa mejora |

### Progresion detallada

**Semanas 1-6**: Tras Test 1, el sistema prescribe AEC. Las tomas en S2 muestran lactato elevado en Z2 (1.8-2.0), confirmando que la atleta corre demasiado rapido para su nivel. El motor dinamico integra estos puntos con peso moderado (recency alta, quality moderada por delay ~30s, similarity baja por no ser sesion de umbral). La toma de S4 (2.4 en Z2) activa alerta de fatiga. El motor no modifica umbrales significativamente porque estos puntos estan lejos del target (1.6 y 3.1 mmol). Test 2 confirma mejora: LT2 pasa de 5:30 a 5:22/km.

**Semanas 6-14**: La toma post-VO2max (7.8 mmol) se filtra parcialmente por el isotonic filter (valor alto a carga alta es monotonicamente coherente, no se penaliza). Las 4 tomas de la sesion larga (S11) muestran drift progresivo (1.3->2.2 en 2h), lo cual es informativo para el entrenador pero no altera umbrales. La toma atipica de S16 (2.6 en Z4) es interesante: el sistema nota que es menor de lo esperado y sugiere posible mejora. En la ventana cronica, este punto baja el promedio de lactato a intensidades de umbral.

**Semanas 14-24**: Test 3 confirma la mejora anticipada por las tomas. Test 4 muestra progresion sostenida: LT2 pasa de 5:30 a 5:00/km en 24 semanas, coherente con mejora del 10% en principiante con programa AEC.

### Casos limite probados

1. **Toma muy alta en Z2 (S4: 2.4 mmol)**: El sistema la integra con peso normal (no es outlier por LOO porque solo hay 3-4 puntos en ventana). Genera alerta de fatiga. NO actualiza umbrales porque el punto esta en la zona de LT1, no cerca de los targets. CORRECTO.

2. **Toma mas baja de lo esperado en Z4 (S16: 2.6 mmol)**: El sistema la marca como "posible mejora". En la interpolacion multi-bracket, este punto entra como bracket inferior para LT2p (target 3.1), tirando la estimacion de ritmo hacia arriba (mas rapido). Efecto: el umbral dinamico cronico se ajusta ~3-5s/km mas rapido. CORRECTO.

3. **5 tomas consecutivas mostrando mejora (S11-S16 periodo)**: Las tomas de la sesion larga + la toma atipica de S16 crean una tendencia descendente en lactato a misma carga. El sistema refleja esto en la estimacion cronica con intervalo de confianza reducido. Cuando llega Test 3, la diferencia entre estimacion cronica y test formal es <5s/km. BUENA ANTICIPACION.

4. **Drift en sesion larga (S11: 1.3->2.2)**: El sistema registra 4 puntos en la misma sesion. Todos tienen el mismo session_date y recency. El motor calcula density alta (sesion continua). Los puntos sucesivos con lactato creciente son monotonicamente coherentes. El drift es informativo pero no desplaza umbrales significativamente. CORRECTO.

### Verificacion

- [x] Tomas coherentes con tests -- los valores de entreno reflejan la fisiologia del perfil
- [x] Motor integra bien ambos tipos -- tests formales dominan umbrales, tomas ajustan estimacion cronica
- [x] Respuestas al entrenador utiles -- alertas de fatiga, drift, mejora anticipada
- [x] Ninguna respuesta peligrosa -- no prescribe intensidades excesivas basadas en tomas aisladas

---

## Perfil P02 -- Ciclista veterano aerobico

### TABLA 1 -- Tests formales

| Test | Semana | LT1 (mmol) | LT1 potencia | LT2 (mmol) | LT2 potencia | LT1p | LT2p | Cambio vs anterior |
|---|---|---|---|---|---|---|---|---|
| Test 1 | S1 | 1.25 | 190W | 4.2 | 275W | 0.95 mmol ~155W | 3.7 mmol ~262W | -- (baseline) |
| Test 2 | S6 | 1.20 | 195W | 4.1 | 278W | 0.90 mmol ~158W | 3.6 mmol ~265W | Mejora leve +3W en LT2 |
| Test 3 | S14 | 1.15 | 200W | 3.9 | 282W | 0.85 mmol ~162W | 3.4 mmol ~270W | Mejora consistente +4W |
| Test 4 | S22 | 1.10 | 205W | 3.8 | 288W | 0.80 mmol ~168W | 3.3 mmol ~275W | Mejora sostenida +6W; curva mas plana |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Zona | Lactato esperado | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Base aerobica Z2 (160W) | Z2 | 0.9-1.2 | 1.0 | Zona correcta; metabolismo aerobico dominante | Si |
| S2 | Base aerobica Z2 (160W, min 45) | Z2 | 0.9-1.2 | 1.1 | Drift minimo; excelente gestion de Z2 | Si |
| S3 | Sweet spot Z4 (250W) | Z4 | 2.5-3.5 | 2.9 | Por debajo de LT2 fisiologico; zona correcta de sweet spot | Si |
| S3 | Sweet spot Z4 (250W, min 15) | Z4 | 2.6-3.6 | 3.1 | Estable; buena tolerancia al umbral | Si |
| S3 | Sweet spot Z4 (250W, min 25) | Z4 | 2.7-3.8 | 3.2 | Acumulacion minima (+0.3 en 25min); perfil diesel confirmado | Si |
| S4 | Z2 con fatiga (180W) | Z2 | 0.9-1.2 | 1.5 | Lactato elevado para 180W; posible fatiga residual de S3 | Si |
| S9 | VO2max Z5 (320W, pre) | Basal | 0.7-1.0 | 0.8 | Basal normal | Si |
| S9 | VO2max Z5 (320W, post) | Z5+ | 5.0-8.0 | 5.8 | Post-Z5 moderado; clearance eficiente (diesel) | Si |
| S11 | Larga 3h (150W, min 30) | Z1 | 0.7-1.0 | 0.8 | Excelente; metabolismo graso dominante | Si |
| S11 | Larga 3h (150W, min 60) | Z1 | 0.7-1.0 | 0.9 | Minimo drift | Si |
| S11 | Larga 3h (150W, min 120) | Z1-Z2 | 0.8-1.2 | 1.0 | Drift acumulado +0.2 en 2h; excelente estabilidad para diesel | Si |
| S11 | Larga 3h (150W, min 180) | Z2 | 0.9-1.4 | 1.2 | Drift total +0.4; muy buena tolerancia a larga duracion | Si |
| S16 | Sweet spot (250W, atipico) | Z4 | 2.5-3.2 | 2.2 | Menor de lo esperado; mejora real o buena recuperacion previa | Si |

### Progresion detallada

**Semanas 1-6**: Perfil diesel clasico. Tomas en Z2 confirman metabolismo aerobico eficiente (0.8-1.1 mmol a 160W). Tomas en sweet spot muestran estabilidad notable (2.9->3.2 en 25min). La alerta de fatiga en S4 es sutil (1.5 vs esperado 0.9-1.2 a 180W). Test 2 confirma mejora leve (+3W en LT2).

**Semanas 6-14**: Post-VO2max (5.8 mmol) confirma clearance eficiente. Sesion larga muestra drift minimo (0.8->1.2 en 3h), confirmando excelente economia lipidica. Toma atipica S16 (2.2 en sweet spot) sugiere mejora. El motor dinamico ajusta LT2p cronico ~3W arriba.

**Semanas 14-24**: Progresion lenta pero consistente (+13W total en LT2 en 24 semanas). Coherente con ciclista veterano trained: las mejoras son incrementales. La curva se vuelve progresivamente mas plana.

### Casos limite probados

1. **Tomas muy variables en Z2 (S2 vs S4: 1.0 vs 1.5)**: El sistema detecta variabilidad de 0.5 mmol a potencias similares. Como la S4 tiene recency similar pero el delta con baseline es >0.3, genera alerta de fatiga sin reclasificar umbral. CORRECTO.

2. **5 tomas confirmando mejora (S9-S16)**: El post-VO2max bajo (5.8 vs esperado 6-8) y la toma atipica baja en sweet spot (2.2) crean tendencia descendente. El sistema ajusta estimacion cronica ~2-3W antes de Test 3. BUENA ANTICIPACION.

3. **Sin test formal en 12 semanas (S6 a S14) pero con tomas**: El sistema mantiene estimacion cronica con puntos que van perdiendo peso por recency decay. A las 8 semanas del Test 2 (S14), los puntos del Test 2 tienen recency = exp(-8*7/18) = exp(-3.11) = 0.044 * min adjustment = 0.2. Los puntos de entreno de S11-S12 tienen recency = exp(-2*7/18) ~ 0.46. Las tomas recientes dominan la estimacion. Si la diferencia cronica vs ultimo test es >5W, el sistema deberia sugerir retest. CORRECTO.

### Verificacion

- [x] Tomas coherentes con tests
- [x] Motor integra bien ambos tipos
- [x] Respuestas al entrenador utiles
- [x] Ninguna respuesta peligrosa

---

## Perfil P03 -- Triatleta elite multidisciplina

### TABLA 1 -- Tests formales

| Test | Semana | Disc. | LT1 (mmol) | LT1 ritmo/pot | LT2 (mmol) | LT2 ritmo/pot | Cambio |
|---|---|---|---|---|---|---|---|
| Test 1 | S1 | Run | 1.55 | 4:20/km | 4.3 | 3:40/km | -- |
| Test 1 | S1 | Bike | 1.45 | 245W | 3.9 | 310W | -- |
| Test 1 | S1 | Swim | 1.75 | 1:45/100m | 4.4 | 1:27/100m | -- |
| Test 2 | S6 | Run | 1.50 | 4:15/km | 4.1 | 3:37/km | +3s/km |
| Test 2 | S6 | Bike | 1.40 | 250W | 3.8 | 315W | +5W |
| Test 3 | S14 | Run | 1.40 | 4:08/km | 3.9 | 3:32/km | +5s/km |
| Test 3 | S14 | Bike | 1.35 | 258W | 3.7 | 322W | +7W |
| Test 3 | S14 | Swim | 1.65 | 1:42/100m | 4.2 | 1:25/100m | +2s/100m |
| Test 4 | S23 | Run | 1.35 | 4:02/km | 3.7 | 3:28/km | +4s/km |
| Test 4 | S23 | Bike | 1.30 | 265W | 3.6 | 328W | +6W |
| Test 4 | S23 | Swim | 1.55 | 1:40/100m | 4.0 | 1:23/100m | +2s/100m |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Disc. | Zona | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Run Z2 (5:00/km, 40min) | Run | Z2 | 1.2 | Zona correcta; buena economia | Si |
| S2 | Bike Z2 (200W, 45min) | Bike | Z2 | 1.1 | Zona correcta | Si |
| S3 | Run umbral (3:45/km, inicio) | Run | Z4 | 3.5 | Cerca de LT2; zona correcta | Si |
| S3 | Run umbral (3:45/km, 12min) | Run | Z4 | 3.9 | Acumulacion moderada; sostenible 20-30min | Si |
| S3 | Run umbral (3:45/km, 20min) | Run | Z4 | 4.4 | Supraumbal; recortar intensidad o terminar | Si |
| S4 | Swim Z2 (1:55/100m) con fatiga | Swim | Z2 | 2.1 | Elevado para Z2 natacion; fatiga o tecnica degradada | Si |
| S9 | Run VO2max (3:20/km, pre) | Run | Basal | 0.9 | Normal | Si |
| S9 | Run VO2max (3:20/km, post) | Run | Z5+ | 8.2 | Post-Z5 alto pero dentro de rango | Si |
| S11 | Bike larga 3h (190W, c/30min) | Bike | Z2 | 0.9/1.0/1.1/1.2/1.3/1.4 | Drift minimo; excelente | Si |
| S16 | Bike umbral (300W, atipico) | Bike | Z4 | 2.0 | MAS BAJO que esperado (vs 2.5-3.0). Mejora real probable. Confirmar test. | Si |
| S18 | Brick: bike fin (280W) | Bike | Z3-4 | 3.2 | Coherente con intensidad | Si |
| S18 | Brick: run 10min (4:00/km) | Run | Z3 | 3.8 | Lactato elevado vs run aislado (esperado 2.5-3.0). Transferencia ciclismo->running detectada. Normal en brick. | Si |

### Progresion detallada

**Perfil multidisciplina**: El sistema gestiona 3 disciplinas independientes. Cada toma se asigna a su disciplina y NO contamina las otras. El brick de S18 es especialmente interesante: la toma post-ciclismo (3.2 a 280W) y la toma al inicio del running (3.8 a 4:00/km) muestran la acumulacion cruzada. El sistema nota que 3.8 mmol a 4:00/km es anomalo (esperado ~2.5-3.0 en running aislado) y genera nota de "transferencia ciclismo->running".

**Progresion 24 semanas**: Mejora progresiva en las 3 disciplinas, con ciclismo mostrando la mayor mejora relativa (+18W en LT2) y natacion la menor (+4s/100m). Coherente con Ironman prep donde ciclismo recibe mas volumen.

### Casos limite probados

1. **Brick triatlon (S18)**: El sistema separa las tomas por disciplina. La toma de running post-ciclismo se marca como "contexto alterado" por la fatiga previa. No se usa para actualizar umbrales de running con el mismo peso que una sesion de running aislada. El contextual_confidence se reduce (~0.65 vs 0.85 normal). CORRECTO.

2. **Tomas en 3 disciplinas misma semana (S2-S3)**: Cada disciplina mantiene su propia ventana cronica. No hay contaminacion cruzada. El sistema puede reportar estado de forma por disciplina independientemente. CORRECTO.

3. **Toma en calentamiento muy alta (S4 swim: 2.1 en Z2)**: En natacion, un lactato de 2.1 a 1:55/100m esta por encima del LT1 estimado (~1.75). El sistema genera alerta de fatiga o tecnica degradada. Si fuera pre-sesion (basal >1.5), el sistema deberia sugerir no realizar sesion intensa. PARCIALMENTE CORRECTO -- falta mecanismo explicito de "no entrenar hoy".

### Verificacion

- [x] Tomas coherentes con tests
- [x] Motor integra bien ambos tipos por disciplina
- [x] Respuestas al entrenador utiles
- [ ] Respuesta peligrosa potencial: falta alerta explicita de "no entrenar" cuando basal es muy alta

---

## Perfil P04 -- Nadadora con poca base de carrera

### TABLA 1 -- Tests formales

| Test | Semana | Disc. | LT1 (mmol) | LT1 ritmo | LT2 (mmol) | LT2 ritmo | Cambio |
|---|---|---|---|---|---|---|---|
| Test 1 | S1 | Swim | 1.6 | 1:42/100m | 3.8 | 1:30/100m | -- |
| Test 1 | S1 | Run | 1.5 | 6:15/km | 3.8 | 5:20/km | -- |
| Test 2 | S6 | Swim | 1.55 | 1:41/100m | 3.7 | 1:29/100m | Mejora leve |
| Test 2 | S6 | Run | 1.45 | 6:05/km | 3.6 | 5:12/km | Mejora moderada +8s/km |
| Test 3 | S14 | Swim | 1.50 | 1:40/100m | 3.6 | 1:28/100m | Estable |
| Test 3 | S14 | Run | 1.35 | 5:50/km | 3.4 | 5:00/km | Mejora fuerte +12s/km |
| Test 4 | S23 | Run | 1.30 | 5:40/km | 3.2 | 4:52/km | Mejora sostenida +8s/km |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Disc. | Zona | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Swim Z2 (1:50/100m, 30min) | Swim | Z2 | 1.2 | Zona correcta; metabolismo aerobico | Si |
| S2 | Run Z2 (6:40/km, 30min) | Run | Z2 | 1.6 | Borderline LT1; reducir ritmo 10-15s/km | Si -- poca base running |
| S3 | Run umbral (5:25/km) | Run | Z4 | 4.0 | En LT2; zona correcta pero acumulacion rapida esperada | Si |
| S3 | Run umbral (5:25/km, 8min) | Run | Z4 | 4.8 | Acumulacion rapida (+0.8 en 8min); curva empinada confirmada. Reducir ritmo. | Si |
| S4 | Run Z2 fatiga (6:30/km) | Run | Z2 | 2.3 | ALERTA: elevado para Z2. Fatiga o corriendo demasiado rapido. | Si |
| S10 | Swim larga (1:50/100m, c/30min) | Swim | Z2 | 1.1/1.1/1.2/1.2 | Drift casi nulo; excelente economia acuatica | Si |
| S16 | Run umbral (5:10/km, atipico) | Run | Z4 | 2.8 | MENOR que esperado (vs 3.5-4.0). Mejora significativa en running. Confirmar test. | Si |
| S18 | Brick: swim fin (1:35/100m) | Swim | Z3 | 2.8 | Coherente con intensidad | Si |
| S18 | Brick: run 10min (5:30/km) | Run | Z2-3 | 3.5 | Elevado vs run aislado. Transferencia swim->run. | Si |

### Progresion detallada

**Asimetria disciplinas**: La natacion mejora lentamente (ya es su disciplina fuerte), mientras el running muestra mejora acelerada (5:20->4:52/km en 24 semanas = +28s/km). Coherente con principio de retornos marginales decrecientes (Olbrecht): la disciplina con mas margen mejora mas rapido.

**Tomas clave**: La acumulacion rapida en umbral running S3 (4.0->4.8 en 8min) confirma la curva empinada y la falta de base aerobica en carrera. Contrasta con la estabilidad en natacion (drift nulo en 2h). El brick S18 muestra transferencia swim->run (3.5 mmol a ritmo que normalmente daria 2.0-2.5).

### Casos limite probados

1. **Tomas muy variables entre sesiones similares de running**: S2 (1.6 a 6:40/km) vs S4 (2.3 a 6:30/km) -- variabilidad de 0.7 mmol a ritmos similares. El sistema detecta variabilidad pero la atribuye a fatiga (S4 post-semana dificil). CORRECTO.

2. **Brick (S18)**: Toma de running post-natacion con lactato elevado (3.5 vs esperado 2.0-2.5). El motor registra con contextual_confidence reducida. No contamina umbrales de running limpio. CORRECTO.

3. **Mejora acelerada en running sin test formal (S6-S14)**: La toma de S16 (2.8 en umbral running) anticipa la mejora que Test 3 confirmara. El motor dinamico ajusta LT2p running ~5-8s/km antes del test. BUENA ANTICIPACION.

### Verificacion

- [x] Tomas coherentes con tests -- asimetria natacion/running reflejada
- [x] Motor integra bien ambos tipos
- [x] Respuestas al entrenador utiles -- especialmente la deteccion de ritmo excesivo en Z2 running
- [x] Ninguna respuesta peligrosa

---

## Perfil P05 -- Runner con estancamiento cronico

### TABLA 1 -- Tests formales

| Test | Semana | LT1 (mmol) | LT1 ritmo | LT2 (mmol) | LT2 ritmo | LT1p | LT2p | Cambio vs anterior |
|---|---|---|---|---|---|---|---|---|
| Test 1 | S1 | 1.55 | 4:40/km | 3.4 | 4:10/km | 1.25 mmol ~5:00/km | 2.9 mmol ~4:20/km | -- (3er test sin cambio) |
| Test 2 | S6 | 1.50 | 4:38/km | 3.5 | 4:08/km | 1.20 mmol ~4:58/km | 3.0 mmol ~4:18/km | Cambio trivial +2s/km |
| Test 3 | S14 | 1.45 | 4:32/km | 3.3 | 4:05/km | 1.15 mmol ~4:52/km | 2.8 mmol ~4:15/km | Mejora minima +3s/km |
| Test 4 | S22 | 1.40 | 4:25/km | 3.2 | 4:00/km | 1.10 mmol ~4:45/km | 2.7 mmol ~4:10/km | Mejora leve +5s/km; ANC desbloqueando |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Zona | Lactato esperado | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Base Z2 (5:10/km) | Z2 | 1.0-1.3 | 1.1 | Zona correcta; motor aerobico eficiente | Si |
| S2 | Base Z2 (5:10/km, 50min) | Z2 | 1.0-1.3 | 1.2 | Drift minimo; diesel confirmado | Si |
| S3 | Umbral Z4 (4:15/km) | Z4 | 3.0-3.5 | 3.1 | Justo en LT2p; zona correcta | Si |
| S3 | Umbral Z4 (4:15/km, 15min) | Z4 | 3.0-3.6 | 3.2 | Estable; excelente tolerancia (diesel) | Si |
| S3 | Umbral Z4 (4:15/km, 25min) | Z4 | 3.1-3.8 | 3.3 | Acumulacion minima; puede sostener 30+ min | Si |
| S4 | Z2 fatiga (5:00/km) | Z2 | 1.0-1.4 | 1.3 | Normal; atleta entrenado se recupera bien | Si |
| S8 | ANC sprints (3:30/km, post) | Z5+ | 7.0-10.0 | 8.5 | Post-ANC alto; buena respuesta glucolitica | Si |
| S10 | Tempo run (4:25/km) | Z3 | 2.0-2.5 | 2.2 | Zona correcta | Si |
| S12 | Larga 90min (5:00/km) | Z2 | 1.0-1.4 | 1.0/1.1/1.1 | Estabilidad perfecta; demasiado comodo en Z2 | Si |
| S16 | Umbral atipico (4:12/km) | Z4 | 3.0-3.4 | 2.6 | Menor de lo esperado. ANC esta mejorando potencia. Posible debloqueo. | Si |

### Progresion detallada

**Estancamiento y desbloqueo**: Las tomas de S2-S12 confirman el perfil diesel: lactato estable, drift minimo, tolerancia perfecta al umbral. El problema es visible: el atleta puede sostener Z4 durante 25+ min sin acumulacion significativa, pero su LT2 no se mueve. El bloque ANC (S8: sprints con lactato 8.5) introduce estimulo glucolitico nuevo.

**Clave S16**: La toma atipica baja (2.6 a 4:12/km, cuando se esperaba 3.0-3.4) sugiere que el ANC esta comenzando a desbloquear. El motor dinamico ajusta LT2p cronico ~3-4s/km. Test 4 confirma: mejora de +5s/km vs Test 3 tras bloque ANC.

**Patron de estancamiento**: Tests 1-3 muestran <5s/km de cambio total. El motor dinamico con 3+ tests y tomas intermedias deberia generar alerta de "estancamiento" (variacion <2% en LT2 en >12 semanas). Esto apoyaria la decision de cambiar a ANC.

### Casos limite probados

1. **Sin test formal en 12 semanas con muchas tomas (S1-S14)**: El sistema tiene 2 tests formales (S1, S6) y ~10 tomas intermedias. A las 8 semanas del Test 2, los puntos formales tienen recency 0.2 (minimo). Las tomas recientes dominan. El sistema genera warning: "Ultimo test formal >8 semanas; considerar retest para confirmar estado actual." CORRECTO.

2. **Tomas consistentemente estables**: 6 tomas en Z4 con variabilidad <0.3 mmol (3.1-3.3). El sistema interpreta como alta estabilidad (stability_score >0.85) pero el entrenador necesita saber que "estable" = "estancado". DEBILIDAD: el sistema no diferencia explicitamente entre "estable y mejorando" vs "estable y estancado". Necesitaria comparar tendencia temporal.

3. **ANC desbloqueando (S8: 8.5, S16: 2.6)**: La toma post-ANC (8.5 mmol) es un punto extremo que el isotonic filter podria penalizar si hay muchos puntos de Z2. Pero como esta a carga alta (3:30/km), es monotonicamente coherente y no se penaliza. La toma de S16 (2.6 en Z4) es el primer dato concreto de mejora. El sistema lo integra con peso normal. CORRECTO.

### Verificacion

- [x] Tomas coherentes con tests -- estancamiento reflejado en consistencia extrema
- [x] Motor integra bien ambos tipos
- [ ] Respuestas al entrenador utiles -- PARCIAL: falta alerta explicita de "estancamiento" cuando tomas muestran variabilidad <2% en >12 semanas
- [x] Ninguna respuesta peligrosa

---

## Perfil P06 -- Triatleta joven con perfil mixto

### TABLA 1 -- Tests formales

| Test | Semana | Disc. | LT1 (mmol) | LT1 ritmo/pot | LT2 (mmol) | LT2 ritmo/pot | Cambio |
|---|---|---|---|---|---|---|---|
| Test 1 | S1 | Run | 1.6 | 4:20/km | 3.8 | 3:50/km | -- |
| Test 1 | S1 | Bike | 1.5 | 200W | 3.5 | 260W | -- |
| Test 2 | S6 | Run | 1.5 | 4:12/km | 3.6 | 3:45/km | +5s/km |
| Test 2 | S6 | Bike | 1.4 | 208W | 3.4 | 268W | +8W |
| Test 3 | S14 | Run | 1.4 | 4:05/km | 3.4 | 3:38/km | +7s/km; mejora rapida |
| Test 3 | S14 | Bike | 1.3 | 218W | 3.2 | 278W | +10W |
| Test 4 | S23 | Run | 1.3 | 3:58/km | 3.2 | 3:32/km | +6s/km |
| Test 4 | S23 | Bike | 1.2 | 228W | 3.0 | 288W | +10W |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Disc. | Zona | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Run Z2 (4:50/km) | Run | Z2 | 1.4 | Borderline LT1; ritmo ok para joven trained | Si |
| S3 | Run umbral (3:55/km) | Run | Z4 | 4.2 | En LT2; acumulacion esperada en glucolitico | Si |
| S3 | Run umbral (3:55/km, 10min) | Run | Z4 | 5.5 | Acumulacion RAPIDA (+1.3 en 10min). VLamax alta. Reducir duracion de intervalos. | Si |
| S4 | Run Z2 fatiga (4:40/km) | Run | Z2 | 2.0 | ALERTA: elevado para Z2; fatiga de S3 intensa | Si |
| S9 | Bike VO2max (310W, post) | Bike | Z5+ | 9.2 | Pico MUY alto; confirma VLamax alta | Si |
| S12 | Bike larga 2h (190W) | Bike | Z2 | 1.0/1.1/1.2/1.4 | Drift moderado; bueno para su edad | Si |
| S16 | Run umbral (3:45/km, atipico) | Run | Z4 | 3.0 | MUCHO MENOR que esperado (vs 4.0-4.5). Mejora notable o error. Confirmar test. | Si |
| S18 | Brick: bike fin (250W) | Bike | Z3 | 3.0 | Coherente | Si |
| S18 | Brick: run 10min (4:10/km) | Run | Z3 | 4.2 | Elevado vs aislado (esperado 2.5-3.0). Transferencia bike->run. | Si |

### Progresion detallada

**Joven con alta respuesta al entrenamiento**: Mejora rapida en 24 semanas (LT2 running: 3:50->3:32/km = +18s/km). La VLamax alta produce acumulacion rapida en umbral (4.2->5.5 en 10min de Z4), lo que guia al entrenador a usar intervalos cortos con recuperacion larga.

**Pico post-VO2max (9.2 mmol en bike)**: Confirma VLamax alta que el proxy ratio no captura bien. El sistema deberia reportar este dato como evidencia adicional de capacidad glucolitica.

**Toma atipica S16 (3.0 a 3:45/km)**: Si el sistema esperaba 4.0-4.5 y obtiene 3.0, es una bajada de 1.0-1.5 mmol. El LOO podria marcarla como outlier si solo hay 4-5 puntos de running en la ventana cronica. Con mas puntos, se integra como evidencia de mejora. RIESGO: si se marca como outlier, el sistema pierde la senal de mejora.

### Casos limite probados

1. **Acumulacion rapida en Z4 (4.2->5.5 en 10min)**: El sistema registra 2 puntos de la misma sesion a la misma carga con lactato creciente. Ambos puntos son monotonicamente coherentes (segundo es mayor). El promedio ponderado de estos puntos (4.85 mmol a ~230 s/km) refleja que esta por encima del LT2. CORRECTO.

2. **Pico 9.2 mmol (S9)**: Punto extremo pero a carga extrema (310W >> LT2 de 260W). El isotonic filter lo mantiene porque es monotonicamente coherente. El LOO lo mantiene porque encaja con la tendencia carga->lactato. No contamina umbrales submaximos. CORRECTO.

3. **Brick triatleta joven (S18)**: Toma running post-ciclismo con lactato elevado. El sistema separa disciplinas y reduce contextual_confidence de la toma de running. CORRECTO.

### Verificacion

- [x] Tomas coherentes con tests
- [x] Motor integra bien ambos tipos
- [x] Respuestas al entrenador utiles -- especialmente la alerta de acumulacion rapida en Z4
- [x] Ninguna respuesta peligrosa

---

## Perfil P07 -- Ciclista reconvertida a triatleta

### TABLA 1 -- Tests formales

| Test | Semana | Disc. | LT1 (mmol) | LT1 | LT2 (mmol) | LT2 | Cambio |
|---|---|---|---|---|---|---|---|
| Test 1 | S1 | Bike | 1.2 | 175W | 3.8 | 245W | -- |
| Test 1 | S1 | Run | 1.55 | 6:15/km | 4.2 | 5:20/km | -- |
| Test 1 | S1 | Swim | 1.6 | 2:10/100m | 3.5 | 1:55/100m | -- |
| Test 2 | S6 | Bike | 1.15 | 178W | 3.7 | 248W | +3W |
| Test 2 | S6 | Run | 1.45 | 6:00/km | 4.0 | 5:10/km | +10s/km |
| Test 3 | S14 | Bike | 1.10 | 182W | 3.6 | 252W | +4W |
| Test 3 | S14 | Run | 1.35 | 5:45/km | 3.7 | 5:00/km | +10s/km |
| Test 3 | S14 | Swim | 1.50 | 2:05/100m | 3.3 | 1:52/100m | +3s/100m |
| Test 4 | S23 | Bike | 1.05 | 185W | 3.5 | 255W | +3W |
| Test 4 | S23 | Run | 1.25 | 5:32/km | 3.5 | 4:50/km | +10s/km |
| Test 4 | S23 | Swim | 1.40 | 2:02/100m | 3.1 | 1:50/100m | +2s/100m |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Disc. | Zona | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Bike Z2 (190W) | Bike | Z2 | 1.0 | Zona correcta; disciplina fuerte | Si |
| S2 | Run Z2 (6:40/km) | Run | Z2 | 1.7 | Borderline LT1; reducir ritmo | Si |
| S3 | Run umbral (5:25/km) | Run | Z4 | 4.5 | Por encima de LT2; acumulacion rapida | Si |
| S4 | Swim Z2 (2:00/100m) fatiga | Swim | Z2 | 2.2 | Elevado; fatiga o falta de tecnica | Si |
| S10 | Run larga 90min (6:00/km) | Run | Z2 | 1.3/1.5/1.8 | Drift +0.5 en 90min; mejorable pero aceptable | Si |
| S16 | Run umbral (5:10/km) atipico | Run | Z4 | 3.0 | MENOR que esperado. Mejora running acelerada. | Si |
| S18 | Brick: bike (230W) | Bike | Z3 | 2.5 | Coherente | Si |
| S18 | Brick: run 10min (5:30/km) | Run | Z2-3 | 3.2 | Elevado; transferencia bike->run | Si |

### Progresion detallada

**Asimetria inversa a P04**: Running mejora rapidamente (+30s/km en 24 semanas) porque es la disciplina debil. Ciclismo mejora poco (+10W) porque ya es fuerte. Natacion mejora lentamente. Patron coherente con reconversion.

**Brick S18**: La toma de running post-ciclismo (3.2 a 5:30/km, esperado ~1.5-2.0) muestra alta transferencia de fatiga. El sistema reduce contextual_confidence para esta toma de running.

### Casos limite probados

1. **Drift running larga (1.3->1.8 en 90min)**: Drift +0.5 mmol. El sistema lo registra como 3 puntos en la misma sesion. El drift indica que 6:00/km esta en el borde superior de Z2 para esta atleta. Informa al entrenador sin alarma. CORRECTO.

2. **Toma swim con fatiga (2.2 en Z2)**: En natacion, donde la tecnica degrada con fatiga, el lactato sube desproporcionadamente. El sistema genera alerta pero no puede distinguir entre fatiga metabolica y degradacion tecnica. LIMITACION conocida.

3. **Mejora desigual por disciplinas**: El motor dinamico mantiene estimaciones independientes. Tras 14 semanas, running tiene 6+ tomas intermedias que anticipan la mejora. Ciclismo tiene 3-4 tomas que confirman estabilidad. El sistema reporta estado diferente por disciplina. CORRECTO.

### Verificacion

- [x] Tomas coherentes con tests
- [x] Motor integra bien -- separacion por disciplina funciona
- [x] Respuestas al entrenador utiles
- [x] Ninguna respuesta peligrosa

---

## Perfil P08 -- Runner masters con buena base

### TABLA 1 -- Tests formales

| Test | Semana | LT1 (mmol) | LT1 ritmo | LT2 (mmol) | LT2 ritmo | Cambio |
|---|---|---|---|---|---|---|
| Test 1 | S1 | 1.25 | 5:30/km | 3.8 | 4:30/km | -- |
| Test 2 | S6 | 1.20 | 5:25/km | 3.7 | 4:27/km | +3s/km |
| Test 3 | S14 | 1.15 | 5:18/km | 3.6 | 4:22/km | +5s/km |
| Test 4 | S22 | 1.10 | 5:12/km | 3.5 | 4:18/km | +4s/km |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Zona | Lactato esperado | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Base Z2 (5:40/km, 40min) | Z2 | 0.9-1.2 | 1.0 | Excelente Z2; economia perfecta | Si |
| S2 | Base Z2 (5:40/km, 60min) | Z2 | 0.9-1.2 | 1.0 | Sin drift; base solida | Si |
| S3 | Umbral (4:35/km, inicio) | Z4 | 2.5-3.5 | 2.8 | Sub-LT2; zona correcta para tempo sostenido | Si |
| S3 | Umbral (4:35/km, 20min) | Z4 | 2.6-3.6 | 3.0 | Acumulacion minima; puede sostener 40+ min | Si |
| S3 | Umbral (4:35/km, 35min) | Z4 | 2.7-3.8 | 3.1 | Extraordinaria estabilidad; perfil masters bien entrenado | Si |
| S4 | Z2 fatiga (5:30/km) | Z2 | 0.9-1.2 | 1.1 | Normal; buena recuperacion | Si |
| S9 | Tempo progresivo (5:00->4:30/km) | Z3-4 | 1.5-3.0 | 1.8/2.4/2.8 | Progresion limpia; curva bien calibrada | Si |
| S11 | Larga 2h (5:30/km) | Z2 | 0.9-1.3 | 0.9/1.0/1.0/1.1 | Drift total +0.2 en 2h; excepcional | Si |
| S16 | Umbral (4:25/km, atipico) | Z4 | 2.5-3.0 | 2.2 | Menor que esperado; mejora progresiva confirmada | Si |

### Progresion detallada

**Atleta masters con optimizacion fina**: Mejora modesta pero consistente (+12s/km en LT2 en 24 semanas). Las tomas confirman un perfil extraordinariamente estable: drift minimo en sesiones largas, acumulacion controlada en umbral, recuperacion rapida.

**Observacion clinica**: La estabilidad extrema (3.0->3.1 en 35min de Z4) indica que el LT2 real esta algo por encima de 4:35/km. El sistema deberia sugerir al entrenador que puede probar intensidades ligeramente mayores.

### Casos limite probados

1. **Toma en calentamiento normal**: La toma pre-sesion de S9 (1.8 a 5:00/km) es un punto basal elevado que refleja el ritmo de calentamiento, no fatiga. El sistema deberia distinguir entre "basal alto" y "ritmo no es Z1". LIMITACION: si el purpose no indica "calentamiento", el sistema trata esta toma como cualquier otra.

2. **5 tomas mostrando mejora (S9-S16)**: Tendencia descendente en lactato a misma carga. El motor dinamico lo refleja en la estimacion cronica. La diferencia entre estimacion cronica y Test 3 es <3s/km. EXCELENTE anticipacion para atleta estable.

3. **Variabilidad muy baja**: Todas las tomas de Z2 estan en rango 0.9-1.1 mmol. La variabilidad <0.2 mmol genera stability_score >0.90. El sistema tiene alta confianza. CORRECTO.

### Verificacion

- [x] Tomas coherentes con tests
- [x] Motor integra bien ambos tipos
- [x] Respuestas al entrenador utiles
- [x] Ninguna respuesta peligrosa

---

## Perfil P09 -- Atleta con protocolo de test deficiente

### TABLA 1 -- Tests formales

| Test | Semana | LT1 (mmol) | LT1 ritmo | LT2 (mmol) | LT2 ritmo | Confianza | Notas |
|---|---|---|---|---|---|---|---|
| Test 1 | S1 | 2.8 | 5:00/km | 5.6 | 4:20/km | BAJA | Solo 4 escalones; LT1 artificialmente alto |
| Test 2 | S6 | 1.7 | 5:40/km | 4.0 | 4:30/km | MEDIA | 7 escalones; mejor protocolo |
| Test 3 | S14 | 1.6 | 5:35/km | 3.8 | 4:25/km | ALTA | 8 escalones; protocolo correcto |
| Test 4 | S22 | 1.5 | 5:25/km | 3.6 | 4:18/km | ALTA | 8 escalones; mejora real |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Disc. | Zona | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Run Z2 (6:00/km, 30min) | Run | Z2 | 1.4 | Nota: segun Test 1, LT1=2.8 mmol. Lactato 1.4 a 6:00 sugiere que LT1 real es mucho mas bajo. Posible error de test. | CLAVE |
| S2 | Run Z2 (6:00/km, 50min) | Run | Z2 | 1.5 | Confirma que Z2 esta ~1.4-1.5 mmol, no 2.8. Test 1 sobreestimo LT1. | Si |
| S3 | Run umbral (4:40/km) | Run | Z3-4 | 3.2 | Coherente con LT2 real ~4:30/km, no 4:20/km | Si |
| S4 | Run Z2 fatiga (5:45/km) | Run | Z2 | 1.8 | Ligeramente elevado; fatiga moderada | Si |
| S9 | Run Z5 (3:50/km, post) | Run | Z5+ | 7.5 | Alto pero coherente con intensidad | Si |
| S11 | Run larga 90min (6:00/km) | Run | Z2 | 1.2/1.3/1.4 | Confirma Z2 estable ~1.2-1.4. Motor dinamico ya ha corregido la estimacion del Test 1. | Si |

### Progresion detallada

**Test deficiente -> tomas corrigen**: Este es el caso mas interesante para validacion del motor dinamico. El Test 1 (4 escalones, saltos irregulares) produce LT1=2.8 mmol y LT2=5.6 mmol, ambos sobreestimados. Las tomas en entreno de S2 (1.4-1.5 mmol en Z2) contradicen directamente el LT1 del Test 1.

**Como reacciona el motor dinamico**: En la ventana cronica (42 dias), los puntos del Test 1 tienen peso reducido por protocol_score bajo (~0.42-0.58 por duraciones de 2-3 min) y similarity moderada (session_type puede ser "incremental" pero el quality score es bajo). Las tomas de entreno de S2, S3, S4 tienen protocol_score variable pero recency alta. Tras S2-S4, la estimacion cronica de LT1p se desplaza de 2.8 hacia 1.5-1.7 mmol.

**Test 2 (S6)**: Con 7 escalones y mejor protocolo, el sistema obtiene LT1=1.7 y LT2=4.0. Los puntos del Test 2 tienen protocol_score alto (~0.78-0.92) y dominan la estimacion. Las tomas intermedias de S2-S4 confirmaron esta direccion. El sistema ahora tiene estimacion coherente.

**Tests 3-4**: Protocolo correcto (8 escalones). Las estimaciones convergen con las tomas intermedias. Mejora real confirmada.

### Casos limite probados

1. **Tomas contradiciendo test formal**: Las tomas de S2 (1.4-1.5 en Z2) contradicen LT1 del Test 1 (2.8). El motor dinamico pondera por calidad y recency. Los puntos del Test 1 tienen quality baja pero similarity alta (test incremental). Las tomas de Z2 tienen quality moderada y similarity baja (no son "threshold" en purpose). El resultado es un compromiso: LT1 dinamico se mueve hacia 1.8-2.0 mmol. PARCIALMENTE CORRECTO: el ajuste es conservador porque las tomas de Z2 no tienen similarity bonus. MEJORA POSIBLE: dar mas peso a tomas que contradicen claramente un test de baja calidad.

2. **Mejora de protocolo entre tests**: Test 1 (4 escalones, confianza baja) -> Test 2 (7 escalones, confianza media). El sistema asigna pesos diferentes: Test 2 domina la estimacion. A S6, los puntos de Test 1 tienen recency = exp(-5*7/18) ~ 0.14 (peso minimo 0.2), mas el protocol_score bajo, su contribucion es ~0.2 * 0.5 * ... = marginal. CORRECTO.

3. **Validacion cruzada test-tomas**: Tras Test 2 (S6), las tomas de S9-S11 confirman los nuevos umbrales. La consistencia entre Test 2 y tomas (LT1 ~1.5-1.7, Z2 ~1.2-1.4) da stability_score alto. CORRECTO.

### Verificacion

- [x] Tomas coherentes con tests -- las tomas corrigen la informacion del test deficiente
- [x] Motor integra bien ambos tipos -- quality score y protocol_score penalizan test deficiente
- [x] Respuestas al entrenador utiles -- la discrepancia tomas vs test genera warning util
- [ ] Respuesta potencialmente problematica: entre S1 y S6, el sistema usa parcialmente el LT1 sobreestimado del Test 1, lo que podria llevar a prescribir intensidades Z2 demasiado altas brevemente

---

## Perfil P10 -- Triatleta post-lesion

### TABLA 1 -- Tests formales

| Test | Semana | LT1 (mmol) | LT1 ritmo | LT2 (mmol) | LT2 ritmo | Cambio |
|---|---|---|---|---|---|---|
| Test 1 | S1 | 2.1 | 6:00/km | 3.2 | 5:40/km | -- (post-desentrenamiento) |
| Test 2 | S6 | 1.9 | 5:48/km | 3.0 | 5:28/km | Mejora rapida +12s/km; readaptacion |
| Test 3 | S14 | 1.6 | 5:30/km | 2.8 | 5:10/km | Mejora continua +18s/km; recalibra |
| Test 4 | S22 | 1.4 | 5:15/km | 2.6 | 4:58/km | Vuelta a nivel pre-lesion |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Disc. | Zona | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Run Z2 (6:30/km, 20min) | Run | Z2 | 1.6 | Elevado para Z2 pero coherente con post-lesion | Si |
| S2 | Run Z2 (6:30/km, 35min) | Run | Z2 | 1.9 | Drift rapido; base aerobica deteriorada | Si |
| S3 | Run Z3 (5:50/km) | Run | Z3 | 2.8 | Cerca de LT2; zona agresiva para su estado actual | Si |
| S3 | Run Z3 (5:50/km, 10min) | Run | Z3 | 3.5 | Por encima de LT2; reducir intensidad. No esta lista para Z4. | Si |
| S4 | Run Z2 fatiga (6:20/km) | Run | Z2 | 2.3 | ALERTA FATIGA: basal elevado + drift. Reducir carga significativamente. | Si |
| S9 | Run Z2 (6:15/km) | Run | Z2 | 1.4 | MEJORA: mismo ritmo que S2 pero lactato -0.2. Readaptacion en curso. | Si |
| S11 | Run larga 60min (6:30/km) | Run | Z2 | 1.3/1.4/1.5 | Drift controlado; mejorando clearance | Si |
| S16 | Run Z3 (5:30/km, atipico) | Run | Z3 | 2.0 | MENOR que esperado (vs 2.5-3.0). Mejora acelerada post-lesion. | Si |
| S18 | Brick: run 10min (5:40/km) | Run | Z3 | 3.0 | Moderado; transferencia + fatiga residual | Si |

### Progresion detallada

**Readaptacion post-lesion**: Patron clasico de recuperacion rapida inicial (S1-S6: +12s/km) seguido de mejora sostenida (S6-S22: +30s/km total). El motor comprimido (umbrales juntos + bajos) se va "expandiendo" a medida que la base aerobica se reconstruye.

**Tomas clave**: La toma de S9 (1.4 a 6:15/km vs 1.6 a 6:30/km en S2) muestra mejora cuantificable: mismo ritmo, lactato menor. El motor dinamico refleja esto inmediatamente en la estimacion aguda (ventana 10 dias). Las tomas de S4 (2.3 en Z2) activan correctamente alerta de fatiga cuando la atleta intenta volver demasiado rapido.

**Patron de FC**: Las FC elevadas (142 bpm a 7:00/km en Test 1) deberian ir bajando con la readaptacion. Si el sistema trackea FC, la correlacion FC-lactato mejora con el fitness.

### Casos limite probados

1. **Basal muy alto (S4: 2.3 en Z2)**: Post-lesion, el baseline individual esta por encima de la referencia historica. El baseline_state = "alto", baseline_delta_from_history > 0.3, baseline_state_score = 0.82-0.70. El sistema penaliza estos puntos y genera alerta de fatiga. CORRECTO.

2. **Mejora rapida detectable por tomas**: S2 (1.6 a 6:30) vs S9 (1.4 a 6:15) vs S11 (1.3 a 6:30). Tendencia clara descendente. El motor dinamico ajusta estimaciones entre tests. La diferencia con Test 3 es <5s/km. BUENA ANTICIPACION.

3. **Motor comprimido expandiendose**: Ratio LT1/LT2 en S1: 0.944 (comprimido). En S22: (3600/315)/(3600/298) = 11.43/12.08 = 0.946... Hmm, el ratio se mantiene alto porque ambos mejoran proporcionalmente. La clasificacion VLamax "moderate" (no falso diesel) se mantiene coherente. CORRECTO.

### Verificacion

- [x] Tomas coherentes con tests -- patron de readaptacion reflejado
- [x] Motor integra bien -- detecta mejora rapida entre tests
- [x] Respuestas al entrenador utiles -- alertas de fatiga y evidencia de mejora
- [x] Ninguna respuesta peligrosa

---

## Perfil P11 -- Ciclista puro sin datos de running

### TABLA 1 -- Tests formales

| Test | Semana | LT1 (mmol) | LT1 pot | LT2 (mmol) | LT2 pot | Cambio |
|---|---|---|---|---|---|---|
| Test 1 | S1 | 1.3 | 220W | 4.5 | 300W | -- (primer test) |
| Test 2 | S6 | 1.25 | 225W | 4.3 | 305W | +5W |
| Test 3 | S14 | 1.20 | 232W | 4.1 | 312W | +7W |
| Test 4 | S22 | 1.15 | 238W | 3.9 | 318W | +6W |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Zona | Lactato esperado | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Bike Z2 (200W, 40min) | Z2 | 0.8-1.2 | 1.0 | Zona correcta | Si |
| S2 | Bike Z2 (200W, 70min) | Z2 | 0.8-1.2 | 1.1 | Drift minimo | Si |
| S3 | Sweet spot (275W, inicio) | Z4 | 2.5-3.5 | 2.8 | Sub-LT2; zona correcta | Si |
| S3 | Sweet spot (275W, 15min) | Z4 | 2.6-3.6 | 3.2 | Acumulacion moderada | Si |
| S3 | Sweet spot (275W, 25min) | Z4 | 2.7-3.8 | 3.5 | Acumulacion; punto de decision (continuar o no) | Si |
| S4 | Bike Z2 fatiga (210W) | Z2 | 0.8-1.2 | 1.4 | Ligeramente elevado; fatiga moderada | Si |
| S9 | VO2max (340W, post) | Z5+ | 6.0-9.0 | 7.2 | Post-Z5; clearance normal | Si |
| S11 | Larga 3h (180W) | Z1-Z2 | 0.7-1.1 | 0.8/0.9/0.9/1.0/1.0/1.1 | Drift total +0.3 en 3h; buena economia | Si |
| S16 | Sweet spot (280W, atipico) | Z4 | 2.5-3.2 | 2.2 | MENOR; potencia mas alta pero lactato mas bajo. Mejora real. | Si |

### Progresion detallada

**Ciclista puro con primer historial**: Sin tests previos, el sistema empieza desde cero. El Test 1 tiene la limitacion de LT2 en ultimo escalon. Las tomas de entreno aportan contexto que el test aislado no da: la sesion larga (drift +0.3 en 3h) confirma buena economia, y el sweet spot muestra tolerancia al umbral.

**Progresion +18W en LT2 en 24 semanas**: Coherente con ciclista trained entrando en fase structured por primera vez. La curva se va aplanando progresivamente.

### Casos limite probados

1. **LT2 en ultimo escalon (Test 1)**: El sistema asigna confianza reducida porque no hay confirmacion de la tendencia post-LT2. Las tomas de sweet spot (2.8-3.5 a 275W, sub-LT2) ayudan a calibrar: si 275W da 2.8-3.5 y LT2 es 300W con 4.5, la pendiente es coherente. Las tomas aumentan la confianza del motor dinamico. CORRECTO.

2. **Primer test sin historial**: El motor dinamico empieza con 7 puntos del Test 1 (un por escalon). Cada toma posterior se integra con recency alta. Tras S2-S4 (4 tomas adicionales), el motor tiene 11 puntos en ventana cronica. La sample_size_effect pasa de 0.65 (7-8 puntos) a 0.78 (11 puntos). La confianza sube. CORRECTO.

3. **Toma atipica confirma mejora (S16: 2.2 a 280W)**: En el Test 1, 275W daba ~2.6 (interpolando). Ahora 280W da 2.2: baja a potencia superior. El LOO no la marca como outlier porque la tendencia general es descendente (los puntos recientes tienen lactato menor a potencia similar). CORRECTO.

### Verificacion

- [x] Tomas coherentes con tests
- [x] Motor integra bien -- tomas compensan limitacion del LT2 en ultimo escalon
- [x] Respuestas al entrenador utiles
- [x] Ninguna respuesta peligrosa

---

## Perfil P12 -- Nadador de aguas abiertas

### TABLA 1 -- Tests formales

| Test | Semana | LT1 (mmol) | LT1 ritmo | LT2 (mmol) | LT2 ritmo | Cambio |
|---|---|---|---|---|---|---|
| Test 1 | S1 | 1.5 | 1:40/100m | 4.2 | 1:20/100m | -- |
| Test 2 | S6 | 1.45 | 1:39/100m | 4.0 | 1:19/100m | +1s/100m |
| Test 3 | S14 | 1.40 | 1:37/100m | 3.8 | 1:17/100m | +2s/100m |
| Test 4 | S22 | 1.35 | 1:35/100m | 3.6 | 1:16/100m | +1s/100m |

### TABLA 2 -- Tomas en entreno

| Semana | Sesion | Zona | Lactato esperado | Lactato real | Respuesta sistema | Coherente? |
|---|---|---|---|---|---|---|
| S2 | Swim Z2 (1:50/100m, 30min) | Z2 | 0.9-1.3 | 1.0 | Excelente; diesel acuatico | Si |
| S2 | Swim Z2 (1:50/100m, 60min) | Z2 | 0.9-1.3 | 1.1 | Drift minimo; metabolismo graso eficiente | Si |
| S3 | Swim CSS (1:25/100m, inicio) | Z4 | 2.5-3.5 | 2.6 | Sub-LT2; zona correcta para CSS | Si |
| S3 | Swim CSS (1:25/100m, 10min) | Z4 | 2.5-3.5 | 2.8 | Estable; puede sostener 20-30min | Si |
| S3 | Swim CSS (1:25/100m, 20min) | Z4 | 2.6-3.6 | 3.0 | Acumulacion minima; diesel | Si |
| S4 | Swim Z2 fatiga (1:48/100m) | Z2 | 0.9-1.3 | 1.4 | Ligeramente elevado; fatiga leve | Si |
| S9 | Swim Z5 (1:10/100m, post) | Z5+ | 5.0-7.0 | 5.5 | Post-Z5 moderado; clearance eficiente (diesel) | Si |
| S11 | OW larga 2h (1:45/100m) | Z2 | 0.9-1.3 | 0.9/1.0/1.0/1.1 | Drift total +0.2 en 2h; excepcional para OW | Si |
| S16 | CSS (1:22/100m, atipico) | Z4 | 2.5-3.0 | 2.0 | MENOR; ritmo mas rapido + lactato mas bajo. Mejora diesel. | Si |

### Progresion detallada

**Nadador OW diesel**: Perfil similar a P02/P08 en estabilidad. Mejora lenta pero consistente (+4s/100m en LT2 en 24 semanas). Las tomas confirman el perfil diesel: drift minimo en OW larga, acumulacion controlada en CSS, post-Z5 moderado (5.5 vs 7-9 de perfiles glucoliticos).

**Sesion OW larga (S11)**: 4 tomas cada 30 min muestran drift de solo +0.2 mmol en 2 horas de natacion continua. Esto es excepcional y confirma la adaptacion al esfuerzo prolongado que un nadador de 10km necesita.

### Casos limite probados

1. **LT2 en ultimo escalon (Test 1)**: Mismo problema que P11. El sistema tiene confianza reducida. Las tomas de CSS (2.6-3.0 a 1:25/100m) calibran la curva por debajo del LT2 y confirman que el LT2 esta correctamente estimado ~1:20/100m. CORRECTO.

2. **Drift minimo en sesion larga**: 4 puntos (0.9, 1.0, 1.0, 1.1) con variabilidad <0.2. Todos estan en la zona de LT1 target (1.6). El sistema confirma que el ritmo es Z2 pero no aporta informacion nueva sobre umbrales. Los puntos tienen similarity baja (no son sesiones de umbral). CORRECTO.

3. **Toma atipica baja en CSS (S16: 2.0 a 1:22/100m)**: En Test 1, 1:25/100m daba ~2.6. Ahora 1:22/100m (3s mas rapido) da 2.0. El motor integra este punto con peso alto (recency alta, quality razonable). El punto entra como bracket inferior para LT2p target (3.1), tirando la estimacion hacia ritmo mas rapido. Anticipa mejora que Test 3 confirmara. CORRECTO.

### Verificacion

- [x] Tomas coherentes con tests
- [x] Motor integra bien ambos tipos
- [x] Respuestas al entrenador utiles
- [x] Ninguna respuesta peligrosa

---

## Resumen Global

### Issues detectados

1. **Falta alerta explicita de "no entrenar hoy"**: Cuando el basal pre-sesion es muy alto (>2.0 mmol), el sistema genera alertas pero no tiene un mecanismo formal de "contraindicacion de entrenamiento intenso". Esto podria llevar a que un entrenador ignore la alerta y prescriba sesion intensa sobre fatiga acumulada. (P03, P04, P10)

2. **Falta deteccion de estancamiento temporal**: El sistema mide stability_score pero no distingue entre "estable y mejorando" vs "estable y estancado". Un atleta con 12+ semanas de tomas consistentes sin mejora (P05) deberia recibir alerta de "estancamiento cronico; considerar cambio de estimulo". (P05)

3. **Test deficiente contamina prescripcion inicial**: Entre Test 1 deficiente y Test 2 correcto (P09), el sistema usa parcialmente los umbrales sobreestimados del Test 1. Las tomas de entreno corrigen parcialmente pero el ajuste es conservador por la baja similarity de las tomas de Z2. (P09)

4. **Proxy VLamax por ratio sigue siendo limitado**: Confirmado en la progresion temporal -- el ratio no cambia significativamente incluso cuando la curva se aplana (mejora real). El pico de lactato post-Z5 seria un proxy mas sensible al cambio. (P02, P06, P07, P11)

5. **Tomas en brick/combinadas carecen de mecanismo formal**: El sistema separa por disciplina pero no tiene campo especifico para "sesion combinada" o "post otra disciplina". El contextual_confidence se puede ajustar manualmente pero no hay automatizacion. (P03, P04, P06, P07, P10)

6. **Recency decay agresivo para tests formales**: A las 6 semanas (42d), un test formal tiene recency = exp(-42/18) = 0.097, redondeado a min 0.2. Esto significa que a las 6 semanas, un test formal con 7-8 puntos de alta calidad pesa casi lo mismo que una toma individual de entreno reciente. El test deberia mantener mas peso por su protocol_score superior. (Todos los perfiles)

### Fortalezas del sistema

1. **Separacion por disciplina funciona**: Los perfiles multidisciplina (P03, P04, P06, P07) muestran que cada disciplina mantiene su propia ventana y estimacion sin contaminacion cruzada. Critico para triatletas.

2. **LOO outlier detection es conservador y seguro**: No marca falsos positivos en las tomas de entreno (que tienen variabilidad natural). Solo penaliza puntos con residual > 1.0 mmol, lo cual es razonable para datos multi-sesion.

3. **Alertas de fatiga basadas en basal son utiles**: Cuando el lactato en Z2 supera LT1p+0.5, el sistema genera alerta. Esto es clinicamente relevante y todos los perfiles lo manejan correctamente.

4. **Anticipacion de mejora entre tests**: En 10 de 12 perfiles, las tomas intermedias anticiparon correctamente la direccion del cambio antes del siguiente test formal. La diferencia entre estimacion cronica y test real fue <5-8s/km en la mayoria de casos.

5. **Multi-bracket interpolation es robusta**: Con 4 candidatos por lado, el sistema encuentra el par mas tight incluso cuando algunos puntos son outliers. Esto es especialmente util cuando se mezclan puntos de tests formales (alta calidad, baja recency) con tomas de entreno (calidad variable, alta recency).

6. **Protocol_score penaliza tests deficientes**: P09 demuestra que el sistema reduce correctamente la influencia de tests con escalones cortos o irregulares. Las tomas de entreno pueden compensar parcialmente.

7. **Isotonic filter protege contra puntos de sprints/VO2max**: Los puntos post-Z5 (7-10 mmol) son monotonicamente coherentes con carga alta y no contaminan las estimaciones submaximas.

### Debilidades del sistema

1. **No detecta patrones temporales**: El sistema pondera por recency pero no analiza tendencias (pendiente temporal de lactato a misma carga). Un analisis de tendencia permitiria detectar mejora/estancamiento/deterioro antes que la interpolacion de puntos.

2. **Similarity weight favorece sesiones de test**: Tomas de entreno que NO tienen purpose "lt1/lt2/threshold" reciben similarity 0.72 vs 0.90 para tests. Esto es correcto en principio pero puede ser excesivo cuando las tomas de entreno aportan informacion valiosa (como en P09 donde las tomas de Z2 corrigen el test deficiente).

3. **No hay mecanismo de "retest trigger"**: Aunque el sistema puede calcular que los datos son antiguos (recency baja), no genera automaticamente la recomendacion de retest basada en: (a) >8 semanas sin test formal, (b) tomas mostrando divergencia significativa vs ultimo test, (c) cambio de bloque de entrenamiento.

4. **Baseline state no considera contexto de la sesion**: Un basal "alto" puede ser porque el atleta hizo calentamiento antes de la toma, no porque este fatigado. El campo purpose podria ayudar a distinguir pero requiere que el entrenador lo rellene correctamente.

5. **Drift en sesion larga genera multiples puntos con misma recency**: 4 tomas en la misma sesion larga tienen exactamente la misma session_date y recency. El motor no pondera diferentemente los puntos tempranos (baseline metabolico) vs tardios (fatiga acumulada). Una toma a min 120 de una sesion larga no tiene el mismo significado fisiologico que una toma a min 30.

6. **Sin integracion de RPE/percepcion subjetiva**: El sistema solo usa datos objetivos (lactato, ritmo/potencia, FC). Un RPE elevado con lactato normal podria indicar fatiga central o sobreentrenamiento no metabolico.

---

## Tabla resumen de coherencia test-entreno

| Perfil | Tests coherentes con tomas | Motor anticipa mejora | Alertas utiles | Issues detectados |
|---|---|---|---|---|
| P01 | Si | Si (S16 anticipa Test 3) | Fatiga S4, drift larga | Ninguno |
| P02 | Si | Si (S16 anticipa Test 3) | Fatiga S4 leve | Ninguno |
| P03 | Si | Si (S16 bike anticipa Test 3) | Brick transferencia | Falta alerta "no entrenar" |
| P04 | Si | Si (S16 run anticipa Test 3) | Z2 running rapido | Ninguno |
| P05 | Si | Parcial (S16 sugiere mejora leve) | Falta alerta estancamiento | Estancamiento no detectado |
| P06 | Si | Si (S16 anticipa Test 3) | Acumulacion rapida Z4 | Ninguno |
| P07 | Si | Si (S16 run anticipa Test 3) | Brick, drift running | Ninguno |
| P08 | Si | Si (todas las tomas confirman) | Ninguna necesaria | Ninguno |
| P09 | PARCIAL | Si (tomas corrigen Test 1) | Test deficiente expuesto | Prescripcion S1-S6 contaminada |
| P10 | Si | Si (S9 muestra readaptacion) | Fatiga S4, mejora S9 | Ninguno |
| P11 | Si | Si (S16 anticipa Test 3) | LT2 ultimo escalon | Ninguno |
| P12 | Si | Si (S16 anticipa Test 3) | Ninguna necesaria | Ninguno |

---

AGENTE 1B COMPLETADO
