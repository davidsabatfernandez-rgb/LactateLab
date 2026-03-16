# 02 -- Auditoria Cientifica del Motor de Umbrales Dinamicos

**Archivo auditado:** `backend/app/services/dynamic_threshold_engine.py` (~1450 lineas)
**Fecha de auditoria:** 2026-03-15
**Objetivo:** Validacion cientifica de cada componente, evidencia publicada, y robustez longitudinal

---

## Resumen ejecutivo

El motor de umbrales dinamicos interpola la velocidad/potencia a concentraciones fijas de lactato (LT1 practico, LT2 practico, 2 mmol, 4 mmol) a partir de muestras acumuladas en una ventana temporal, con decay exponencial por recencia. Es un sistema de **seguimiento longitudinal** que actualiza los umbrales operativos conforme llegan nuevos tests.

**Veredicto global:** El concepto central -- interpolar carga a una concentracion fija de lactato a lo largo del tiempo -- tiene base cientifica solida. Es el metodo clasico OBLA (Mader 1976, Heck et al. 1985, Sjodin et al. 1981) aplicado longitudinalmente. La innovacion del motor esta en (a) acumular datos cross-sesion con ponderacion temporal, (b) usar LOO para limpiar outliers, y (c) mezclar el resultado con un anchor fisiologico. Ninguno de estos tres elementos tiene precedente directo publicado en la literatura de lactato. La ausencia de precedente no los invalida, pero obliga a extremar la cautela en los parametros elegidos.

Se identifican **3 riesgos cientificos altos**, **4 medios** y **3 bajos** que afectan la validez de las estimaciones en escenarios longitudinales reales.

### Hallazgos principales

| ID | Severidad | Componente | Hallazgo |
|----|-----------|-----------|----------|
| S1 | ALTO | Ventana 42d + decay 18d | 42 dias es corto para atletas que testean quincenal/mensualmente. El decay de 18d elimina virtualmente datos de >36 dias. Incoherente con CTL de Banister (42d). |
| S2 | ALTO | Targets fijos LT1=1.6 / LT2=3.1 mmol | No tienen referencia cientifica directa. El LT2 a 3.1 mmol contradice el hallazgo de Heck (1985) de que 4 mmol solo es valido con el protocolo original. El LT1 a 1.6 mmol es arbitrario. |
| S3 | ALTO | Acumulacion cross-sesion | Mezclar datos de sesiones con protocolos diferentes (3 vs 5 min/escalon, test vs entrenamiento) viola la condicion de Heck (1985): el umbral a una concentracion fija depende del protocolo. |
| S4 | MEDIO | LOO outlier threshold 1.0 mmol | Demasiado alto dados los CV de los lactimetros portatiles (2-5%, ~0.2-0.4 mmol absoluto). Outliers moderados de 0.5-0.9 mmol pasan desapercibidos. |
| S5 | MEDIO | Blending anchor (0.35*(1-conf)+0.10) | Formula sin referencia. Plausible heuristicamente pero puede anclar a un LT2 fisiologico erroneo sin validacion previa de su confianza. |
| S6 | MEDIO | Multi-bracket 4 puntos | El numero 4 es arbitrario. Funciona mejor que 2 (mas pares posibles) pero no hay justificacion estadistica publicada para esta eleccion. |
| S7 | MEDIO | robust=True solo para LT1/LT2 practicos | Las referencias 2mmol/4mmol no pasan por LOO. Si un outlier domina el bracket de 4mmol, la referencia se contamina sin filtro. |
| S8 | BAJO | PAVA isotonic filter | Codigo muerto (definido pero nunca invocado en el pipeline). |
| S9 | BAJO | Decay exponencial vs lineal | exp(-d/18) es matematicamente correcto pero no hay evidencia de que el decaimiento de la relevancia fisiologica siga una exponencial. |
| S10 | BAJO | Fallback baseline 1.2 mmol | Razonable para la poblacion general pero incorrecto para atletas entrenados (0.6-0.9 mmol) o recreativos con dieta alta en CHO (1.4-1.8 mmol). |

---

## 1. Concepto central: interpolacion de carga a lactato fijo

### Base cientifica

El concepto de determinar la intensidad (velocidad, potencia) correspondiente a una concentracion fija de lactato sanguineo es uno de los mas antiguos y validados en fisiologia del ejercicio:

- **Mader et al. (1976)** introdujeron el termino "umbral de lactato" y propusieron 4 mmol/L como criterio para el umbral aerobico-anaerobico.
- **Sjodin & Jacobs (1981)** acunaron "OBLA" (Onset of Blood Lactate Accumulation) usando 4 mmol/L.
- **Heck et al. (1985)** demostraron que 4 mmol/L correlaciona con MLSS (R2=0.98) **pero solo con el protocolo original de Mader** (incrementos de 50W cada 5 min en cicloergometro).
- **Faude et al. (2009)** revisaron 25 conceptos de umbral y 32 estudios de validacion, confirmando que los umbrales fijos tienen alta correlacion con rendimiento en pruebas de resistencia.

**Veredicto:** La interpolacion de carga a lactato fijo es cientificamente valida. La innovacion del motor (hacerlo longitudinalmente con datos acumulados) es una extension logica sin precedente publicado directo.

### Limitacion critica

Heck et al. (1985) demostraron que **si se cambia el protocolo, el valor de 4 mmol deja de ser valido**. Las concentraciones individuales de MLSS varian de 2.0 a 8.0 mmol/L dependiendo del estado de entrenamiento (INSCYD, citando a Heck). El motor mezcla datos de protocolos heterogeneos (entrenamiento, tests incrementales, intervalos), lo que debilita la premisa fundamental.

### Evidencia: test-retest reliability

- **Weltman et al. (1990)**: velocidad a 2.0, 2.5 y 4.0 mmol tiene test-retest r=0.91-0.95, con SEM < 10 m/min (~0.6 km/h).
- **Pfitzinger & Freedson (1998)**: 12 atletas entrenados, 3 dias de test con escalones de 5 min. ICC alto para velocidad a concentraciones fijas.
- **Sperlich et al. (2018)**: OBLA a 4 mmol tiene mejor repeatability (CV ~3-5%) que conceptos basados en inflexion de curva.

**Implicacion para el motor:** La variabilidad test-retest de ~0.6 km/h en velocidad a lactato fijo establece el **minimo error esperable**. Cualquier estimacion del motor con intervalo de confianza menor que esto es sobreconfiada.

---

## 2. LOO (Leave-One-Out) outlier detection

### Implementacion

Dos capas LOO independientes:

1. **Intra-sesion** (`_intrasession_consistency_filter`): dentro de cada sesion, si un punto no encaja con su propia curva, peso x0.15. Safeguard: si >40% de los puntos se marcarian, no se aplica.
2. **Cross-sesion** (`_detect_outliers_in_lactate_space`): entre todas las sesiones de la ventana, regresion lactato~carga sin cada punto. Umbral: 1.0 mmol (config). Penalizacion: peso x0.25.

### Precedente cientifico

LOO cross-validation es un metodo estadistico estandar (Stone 1974, Allen 1974), ampliamente usado en machine learning y analisis de datos biomedicos. Sin embargo, **no se ha publicado su aplicacion especifica a la deteccion de outliers en curvas de lactato**. La busqueda en PubMed, Google Scholar y bases especializadas no arroja ningun estudio que use LOO para limpiar datos de lactato multi-sesion.

Esto no invalida el enfoque -- es una aplicacion sensata de un metodo estadistico solido a un problema nuevo. Pero implica que los parametros (umbral 1.0 mmol, penalizacion x0.25) no tienen calibracion empirica publicada.

### Analisis del umbral de 1.0 mmol

La precision analitica de los lactimetros portatiles mas comunes:

| Analizador | CV | Error absoluto tipico |
|---|---|---|
| Lactate Pro 2 | 2.8-5.0% | 0.10-0.30 mmol |
| Lactate Plus | 3.1-4.5% | 0.15-0.35 mmol |
| Lactate Scout+ | 3.5-6.2% | 0.15-0.40 mmol |

Fuente: Tanner et al. (2010), Hart et al. (2013), precision study PMC11568978.

Con un error analitico de 0.2-0.4 mmol y variabilidad biologica dia-a-dia adicional (hidratacion, nutricion, fatiga, temperatura), una desviacion de 0.5-0.8 mmol respecto a la curva esperada es frecuente sin ser un outlier genuino. El umbral de 1.0 mmol es **conservador y apropiado** para evitar falsos positivos en el contexto cross-sesion, donde la variabilidad esperada es mayor que intra-sesion.

**Nota sobre la discrepancia MEMORY vs codigo:** MEMORY.md menciona `outlier_residual_threshold = 0.8 mmol` y tambien `1.0 mmol`. El codigo actual usa **1.0 mmol** como default en `DynamicThresholdConfig`. La documentacion historica en MEMORY refleja una calibracion anterior que fue relajada. El valor actual de 1.0 mmol es el correcto para el contexto multi-sesion.

### Safeguard intra-sesion (40%)

El safeguard que desactiva el filtro intra-sesion cuando >40% de los puntos se marcarian es una decision pragmatica correcta. Con sesiones ruidosas (protocolo no estandarizado, atleta no cooperativo, condiciones extremas), intentar separar "buenos" de "malos" con una regresion sobre 3-4 puntos es estadisticamente inutil. El 40% como umbral es razonable: con 10 puntos, permite marcar hasta 4 antes de rendirse.

---

## 3. Multi-bracket interpolation

### Implementacion

Se seleccionan los 4 puntos mas cercanos al target por cada lado (en lactato), se forman todos los pares posibles, se descartan los no monotonicos (carga no sube con lactato), y se pondera cada par por:

- Media geometrica de los pesos de ambos puntos
- Proximidad del midpoint al target
- Penalizacion cuadratica si el upper bracket esta >2 mmol sobre el target

### Analisis cientifico

La interpolacion lineal entre dos puntos que enmarcan el target es el metodo clasico para determinar velocidad/potencia a concentracion fija (Weltman 1990, Sperlich 2018). El motor extiende esto evaluando **multiples pares** y ponderandolos, lo que es una mejora sobre la practica estandar.

**Por que 4 puntos por lado?** No hay referencia publicada para este numero. Analizando las opciones:

- 2 por lado: 4 pares maximo. Riesgo de perder el mejor bracket si los 2 mas cercanos son outliers.
- 4 por lado: 16 pares maximo (menos los no monotonicos). Suficiente diversidad sin incluir puntos lejanos.
- 6 por lado: 36 pares maximo. Incluye puntos potencialmente muy lejos del target, donde la interpolacion lineal es menos fiable.

El numero 4 es una eleccion heuristica razonable. Con los datos tipicos de un atleta (5-15 puntos en la ventana), 4 por lado captura la mayoria de los datos relevantes.

### Penalizacion por span amplio

```python
if upper_distance > 2.0:
    w *= (2.0 / upper_distance) ** 2
```

Esta penalizacion es cientificamente justificable: la relacion velocidad-lactato es **exponencial** (no lineal), por lo que la interpolacion lineal sobre un span amplio (p.ej. de 2 a 6 mmol) introduce error sistematico. La penalizacion cuadratica reduce el peso de estos pares, lo que es correcto en direccion aunque los parametros (2.0 mmol como inicio, cuadratica vs otras funciones) son arbitrarios.

### Recomendacion

Considerar log-transformar el lactato antes de interpolar. La relacion velocidad-lactato se aproxima mejor por una funcion exponencial, y la interpolacion en el espacio log(lactato) vs velocidad seria mas precisa que la lineal directa.

---

## 4. Blending con anchor fisiologico

### Formula

```
anchor_weight = 0.35 * (1 - confidence) + 0.10
```

### Analisis

Esta formula es completamente ad hoc. No tiene precedente en la literatura de lactato ni en estadistica bayesiana. Sin embargo, su estructura es plausible:

- Con confianza baja (0.18): anchor_weight = 0.39 -> 39% fisiologico, 61% dinamico
- Con confianza alta (0.90): anchor_weight = 0.135 -> 14% fisiologico, 86% dinamico

El principio es correcto: cuando los datos dinamicos son escasos o ruidosos, anclar parcialmente al LT2 fisiologico (determinado por la forma de la curva en la sesion mas reciente) es una estrategia de regularizacion sensata. Es conceptualmente similar al shrinkage bayesiano hacia un prior.

### Problemas identificados

1. **El anchor fisiologico puede ser erroneo.** Si la sesion mas reciente tiene una curva ruidosa o un protocolo no estandarizado, el LT2 fisiologico detectado puede estar completamente desviado. El blend no valida la confianza del anchor antes de aplicarlo.

2. **No se aplica al LT1.** No hay justificacion fisiologica para tratar LT1 y LT2 asimetricamente en este aspecto.

3. **El anchor no se ajusta por antiguedad.** Si el LT2 fisiologico proviene de una sesion de hace 30 dias, su relevancia deberia decaer igual que los demas datos.

4. **Los coeficientes 0.35 y 0.10** determinan el rango del anchor (10-45%). Estos valores son arbitrarios. Una calibracion empirica (backtesting sobre atletas reales) seria necesaria para validarlos.

### Recomendacion

- Gating: solo aplicar el blend si la confianza del LT2 fisiologico es > 0.65.
- Decay: multiplicar anchor_weight por exp(-days_since_physio / 21).
- Considerar aplicar el blend tambien al LT1.

---

## 5. Targets practicos: LT1 = 1.6 mmol, LT2 = 3.1 mmol

### Evidencia cientifica

**LT1 a 1.6 mmol:** No existe ninguna referencia publicada que establezca 1.6 mmol como umbral universal de LT1. La literatura ofrece un panorama heterogeneo:

- Faude et al. (2009): LT1 definido como "primer ascenso sobre baseline", no como concentracion fija.
- INSCYD: LT1 como "lactate concentration at which production starts to exceed clearance" -- dependiente del individuo.
- Stegmann & Kindermann (1981): baseline + 1 mmol como criterio de LT1.
- Beaver, Wasserman & Whipp (1985): inflexion log-log, no concentracion fija.

Un target fijo de 1.6 mmol puede funcionar como **aproximacion operativa** para un atleta con baseline de 1.0-1.2 mmol (LT1 tipico en 1.5-2.0 mmol), pero:
- Atletas con baseline 0.6 mmol: LT1 real ~1.0-1.3 mmol, target 1.6 sobreestima
- Atletas con baseline 1.5 mmol: LT1 real ~2.0-2.5 mmol, target 1.6 subestima

El motor mitiga parcialmente esto con el modo "relative" (`baseline + 0.45`), pero el default configurado es 1.6 mmol absoluto.

**LT2 a 3.1 mmol:** Tampoco tiene referencia directa. El clasico OBLA es 4.0 mmol (Heck 1985), y la decision de usar 3.1 mmol como "LT2 practico" es consciente (MEMORY: "anchor conservador universal"). Pero:

- Heck & Mader (1985): MLSS correlaciona con 4 mmol solo en su protocolo original.
- Concentraciones individuales de MLSS varian de 2.0 a 8.0 mmol/L (INSCYD).
- El motor individualiza parcialmente con `_level_targets`: recreational=3.5, trained=3.1, competitive=2.8.
- Cuando hay LT2 fisiologico detectado, usa `LT2_real - 0.5` como target, que es la mejor opcion.

**Veredicto:** Los targets fijos son compromisos operativos razonables dado que el sistema ya los individualiza cuando tiene datos fisiologicos. El riesgo principal es en atletas nuevos sin tests previos, donde 1.6/3.1 pueden estar significativamente desviados.

---

## 6. Ventana temporal: 42 dias cronico, 10 dias agudo

### Contexto cientifico

La ventana de 42 dias coincide exactamente con el tiempo constante de fitness (tau1) del modelo de Banister (1975) de impulso-respuesta:

- **Banister et al. (1975)**: fitness = EWMA con tau=42 dias, fatigue = EWMA con tau=7 dias.
- **TrainingPeaks CTL**: usa 42 dias como periodo de promediado exponencial para la carga cronica.
- **Busso et al. (1997)**: tau1 estimado en 40-50 dias para adaptaciones de rendimiento.

La eleccion de 42 dias para la ventana cronica es coherente con estos modelos. Sin embargo, hay una diferencia conceptual: el modelo de Banister mide **fitness** (rendimiento acumulado), mientras que el motor de umbrales mide **estado metabolico puntual**. El umbral de lactato cambia mas lentamente que el rendimiento agudo, lo que sugiere que una ventana mas larga (60-90 dias) podria ser mas apropiada para acumular datos suficientes.

### Decay exponencial con tau=18 dias

El decay de recencia sigue `exp(-d/18)`, lo que significa:

| Dias | Peso |
|------|------|
| 0 | 1.000 |
| 7 | 0.678 |
| 14 | 0.459 |
| 18 | 0.368 |
| 28 | 0.212 |
| 35 | 0.144 |
| 42 | 0.200 (floor) |

El floor de 0.20 para peso minimo (linea 158) impide que datos al borde de la ventana tengan peso despreciable, lo que es correcto.

### Problema: ventana aguda de 10 dias

Con la frecuencia de testing tipica de un atleta (1 test cada 7-14 dias), la ventana aguda de 10 dias contiene 0-1 sesiones. El modelo agudo es frecuentemente vacio o basado en un solo test. Esto limita severamente la utilidad de la comparacion agudo-cronico.

### Analisis longitudinal

Para un atleta que testea cada 2 semanas durante 6 meses:
- 13 tests totales
- En la ventana de 42 dias: 3 tests
- En la ventana de 10 dias: 0-1 tests

Con 3 tests en la ventana cronica (cada uno con 5-8 intervalos = 15-24 puntos), el motor tiene datos suficientes para el multi-bracket. Pero con 1 test en la ventana aguda, la comparacion agudo-cronico es fragil.

### Recomendacion

- Aumentar la ventana aguda a 14 dias (captura 1-2 tests con frecuencia quincenal).
- Considerar una ventana cronica de 60 dias para atletas que testean mensualmente.
- Documentar frecuencia minima recomendada: 1 test cada 10-14 dias.

---

## 7. robust=True solo para LT1/LT2 practicos

### Implementacion

```python
# Lineas 1175-1178: 2mmol y 4mmol sin robust
speed_at_2 = _estimate_reference(points, 2.0, ..., robust=False)
speed_at_4 = _estimate_reference(points, 4.0, ..., robust=False)

# Lineas 1210-1222: LT1 y LT2 practicos con robust
practical_speed_lt1 = _estimate_reference(points, ..., robust=True)
practical_speed_lt2 = _estimate_reference(points, ..., robust=True)
```

### Analisis

La justificacion implicita es que las referencias 2mmol/4mmol son "informativas" (no prescriptivas) y no necesitan limpieza de outliers. Pero esto crea una inconsistencia: un outlier que contamina la referencia de 4mmol tambien contaminara la percepcion del entrenador de "a que velocidad esta mi atleta a 4 mmol".

Si el coach usa las referencias 2mmol/4mmol para comparar con tests de laboratorio, un outlier puede crear una discrepancia aparente que no es real. Esto erosiona la confianza en el sistema.

### Recomendacion

Aplicar `robust=True` a todas las referencias, no solo a las practicas. El coste computacional es insignificante y la consistencia mejora.

---

## 8. Escenarios de robustez longitudinal

### Escenario 1: 10 tests identicos en 6 meses

**Prediccion:** Los tests identicos producen los mismos datos. Dentro de la ventana de 42 dias, los 3 tests mas recientes dominan. Los 7 anteriores estan fuera de la ventana y no contribuyen. El motor converge a un valor estable determinado por los 3 tests mas recientes (con decay exponencial). **No oscila**, siempre que la variabilidad dia-a-dia del lactato sea consistente.

**Riesgo:** Si uno de los 3 tests en ventana tiene un baseline anormalmente alto (fatiga, deshidratacion), el motor integra ese dato con peso ~0.5-0.7 y desplaza temporalmente la estimacion. La magnitud del desplazamiento depende de la direccion del error y del peso del test afectado.

### Escenario 2: mejora gradual (LT2 sube 0.15 mmol cada 6 semanas)

**Prediccion:** La mejora de 0.15 mmol/6 semanas es equivalente a ~0.025 mmol/semana o ~0.005 mmol/dia. Dentro de la ventana de 42 dias, el test mas reciente pesa ~1.0, el de hace 2 semanas pesa ~0.46, y el de hace 4 semanas pesa ~0.21. El decay exponencial da prioridad al dato mas reciente, lo que permite detectar la tendencia.

**Lag estimado:** Con tests cada 2 semanas, el motor detecta la mejora con un retraso de ~1-2 tests (2-4 semanas). La estimacion esta siempre ligeramente por detras del estado real porque los datos antiguos "anclan" la estimacion. Esto es un comportamiento de suavizado deseable para evitar falsos positivos.

**Magnitud del lag:** Con el dato mas reciente mostrando velocidad a 3.1 mmol = 14.0 km/h y el de hace 4 semanas mostrando 13.7 km/h, la estimacion ponderada sera aprox:
```
(14.0 * 1.0 + 13.85 * 0.46 + 13.7 * 0.21) / (1.0 + 0.46 + 0.21) = 13.92 km/h
```
vs. el valor real de 14.0 km/h. **Lag de ~0.08 km/h**, equivalente a ~2 s/km. Aceptable.

### Escenario 3: 1 test toxico entre 15 limpios

**Prediccion:** Un test "toxico" (p.ej., lactato 2 mmol mas alto de lo esperado a la misma velocidad, por infeccion sublinica, deshidratacion severa, etc.) dentro de la ventana de 42 dias producira:

1. **LOO cross-sesion:** Si el residual del test toxico es >1.0 mmol, se penaliza x0.25. Si esta entre 0.5-1.0 mmol, pasa desapercibido.
2. **LOO intra-sesion:** Si la curva interna del test toxico es coherente (todo desplazado hacia arriba), el filtro intra-sesion no marca ningun punto.
3. **Impacto en la estimacion:** Con 15 tests limpios y 1 toxico, el toxico aporta ~6-7% de los puntos. Si esta penalizado x0.25, su contribucion efectiva es ~1.7%. **El perfil se desplaza minimamente.**

**Riesgo:** El escenario peligroso es un test toxico **reciente** (peso ~1.0) entre tests limpios mas antiguos (pesos 0.2-0.5). En este caso, el test toxico domina y puede desplazar la estimacion significativamente hasta que otro test limpio entre en la ventana.

### Escenario 4: atleta deja de entrenar 2 meses

**Prediccion:** Tras 2 meses sin tests:
- La ventana de 42 dias esta **vacia**.
- El modelo devuelve datos vacios con warnings.
- No hay "regresion" detectada porque no hay datos nuevos.

Cuando el atleta retoma y hace un test, la ventana solo contiene ese test. La estimacion se basa en 1 sesion (5-8 puntos), con baja confianza y high influence score.

**Problema:** El motor no puede reflejar la regresion por desentrenamiento porque no tiene datos del periodo de inactividad. Solo refleja el estado actual cuando el atleta vuelve a testear. **Esto es correcto conceptualmente** -- el motor reporta lo que observa, no especula sobre periodos sin datos.

### Escenario 5: cambio de protocolo (3 min/escalon a 5 min/escalon)

**Prediccion:** Escalones de 5 minutos producen lactatos sistematicamente mas bajos que los de 3 minutos a la misma intensidad (mas tiempo para alcanzar estado estable, menor acumulacion). Si un atleta cambia de protocolo:

1. El `_interval_duration_score` asigna pesos diferentes: 3 min = 0.78 (actual), 5 min = 0.92. Los datos de 5 min pesan mas.
2. El motor mezcla ambos protocolos en la misma ventana, produciendo una estimacion sesgada.

**Impacto:** El sesgo tipico es de ~5-10 s/km. El atleta parece "mejorar" simplemente por cambiar a un protocolo mas largo.

**Recomendacion:** Considerar separar datos por tipo de protocolo (duracion de escalon) o documentar que el motor no es robusto a cambios de protocolo.

### Escenario 6: 20 tests acumulados pero solo 2 en ultimos 42 dias

**Prediccion:** Solo los 2 tests recientes contribuyen al modelo cronico. Los 18 anteriores estan fuera de la ventana. Con 2 tests (10-16 puntos), el motor tiene datos marginalmente suficientes para el multi-bracket.

**Problema:** El motor no aprovecha el historial largo para contextualizar. Un "LT2 tracking history" (via snapshots) permitiria al coach ver la trayectoria completa, pero la estimacion puntual solo usa los datos de la ventana.

**Recomendacion:** Considerar un modelo "historico" adicional (ventana 180 dias) que sirva de contexto, no de prescripcion.

---

## 9. Variabilidad biologica y limites de deteccion

### Evidencia de variabilidad dia-a-dia

- **Pfitzinger & Freedson (1998):** Velocidad a LT tiene SEM de ~0.3-0.6 km/h entre 3 sesiones separadas por dias, en atletas entrenados en condiciones controladas.
- **Weltman et al. (1990):** SEM < 10 m/min (~0.6 km/h) para velocidad a 2.0 y 4.0 mmol.
- **Sperlich et al. (2018):** CV de velocidad a OBLA de 3-5%, equivalente a ~0.4-0.7 km/h para un atleta a 14 km/h.

La variabilidad **analitica** del lactimetro (CV 2-5%) se suma a la variabilidad **biologica** (baseline fluctua por fatiga, nutricion, hora del dia, temperatura). En conjunto, la variabilidad total esperable es de **0.3-0.8 mmol** en lactato absoluto y **0.3-0.7 km/h** en velocidad a concentracion fija.

### Implicacion para el motor

Cualquier estimacion del motor con un intervalo de confianza menor que +/-0.5 km/h (o +/-10 W) esta potencialmente sobreconfiada. La formula de intervalo de confianza actual:

```python
margin = max(0.01, span * (0.12 + influence * 0.28) / max(1.0, points ** 0.5))
```

produce margenes que escalan con `1/sqrt(n)` pero no incorporan la variabilidad biologica minima. Con 20 puntos, el margen puede ser < 0.1 km/h, que es biologicamente imposible.

### Recomendacion

Anadir un floor al intervalo de confianza: minimo +/-0.4 km/h para velocidad, +/-8 W para potencia, +/-3 bpm para FC. Estos floors reflejan la variabilidad biologica minima irreducible.

---

## 10. Sistemas comparables en la literatura y la industria

### Publicaciones academicas

No se encontro ninguna publicacion que describa un sistema exactamente como este motor: acumulacion longitudinal de datos de lactato multi-sesion con interpolacion ponderada a concentracion fija. Los sistemas publicados mas cercanos son:

1. **INSCYD:** Calcula VLamax y VO2max a partir de tests de lactato, pero no acumula datos longitudinalmente -- cada test es independiente.
2. **Lactate.com (Newell et al.):** Interpolacion de velocidad a concentraciones fijas, pero por sesion, no longitudinal.
3. **Smartwatch estimates (Garmin, COROS):** Estiman LT a partir de HR dia a dia usando ML, sin medir lactato directamente. Publicaciones recientes (PMC12309276) muestran SEM de ~7 bpm para LTHR estimada.
4. **Transfer learning approach (ScienceDirect, 2025):** Estimacion automatica de LTHR y LT pace en runners usando datos diarios, monitoreando cambios longitudinales en 28 dias. Es el sistema publicado mas similar conceptualmente, pero usa HR como proxy (no lactato medido).

### Conclusion

El motor de umbrales dinamicos es, hasta donde la evidencia disponible permite determinar, **el primer sistema que acumula datos de lactato medido a traves de multiples sesiones con ponderacion temporal para producir estimaciones longitudinales continuas de umbrales operativos**. Esta originalidad es una fortaleza (innovacion) y una debilidad (sin validacion externa publicada).

---

## 11. Tabla de recomendaciones por prioridad

| Prioridad | ID | Accion | Esfuerzo | Impacto |
|-----------|-----|--------|----------|---------|
| P0 | S3 | Documentar limitaciones del motor con protocolos mixtos. Considerar campo `protocol_type` para separar datos | Medio | Alto |
| P0 | S2 | Priorizar siempre el target individualizado (LT_real - offset) cuando exista; documentar que 1.6/3.1 son fallbacks | Bajo | Alto |
| P1 | S1 | Aumentar ventana aguda a 14d. Considerar ventana cronica adaptativa (42-90d segun frecuencia de testing) | Bajo | Alto |
| P1 | S4 | Evaluar reducir outlier_threshold a 0.8 mmol para intra-sesion. Mantener 1.0 para cross-sesion | Bajo | Medio |
| P1 | S7 | Aplicar robust=True a todas las referencias (2mmol, 4mmol, LT1, LT2) | Bajo | Medio |
| P2 | S5 | Gating del anchor fisiologico: solo aplicar si confidence del LT2 fisiologico > 0.65 | Bajo | Medio |
| P2 | -- | Anadir floor al intervalo de confianza: min +/-0.4 km/h, +/-8 W, +/-3 bpm | Bajo | Medio |
| P2 | S6 | Considerar log-transformacion del lactato antes de interpolar | Medio | Medio |
| P3 | S8 | Integrar _isotonic_filter en pipeline o eliminar codigo muerto | Bajo | Bajo |
| P3 | S9 | Documentar la eleccion de decay exponencial y considerar alternativas (lineal, sigmoide) | Bajo | Bajo |
| P3 | S10 | Fallback baseline parametrizado por nivel de atleta (0.9/1.1/1.3) | Bajo | Bajo |
| P3 | -- | Modelo historico (180d) para contexto, no para prescripcion | Medio | Bajo |

---

## Referencias

- Allen, D.M. (1974). The relationship between variable selection and data augmentation and a method for prediction. *Technometrics*, 16, 125-127.
- Banister, E.W. et al. (1975). A systems model of training for athletic performance. *Australian Journal of Sports Medicine*, 7, 57-61.
- Beaver, W.L., Wasserman, K., & Whipp, B.J. (1985). Improved detection of lactate threshold during exercise using a log-log transformation. *Journal of Applied Physiology*, 59(6), 1936-1940.
- Busso, T. et al. (1997). Effects of training frequency on the dynamics of performance response to a single training bout. *Journal of Applied Physiology*, 83(6), 2062-2069.
- Faude, O., Kindermann, W., & Meyer, T. (2009). Lactate threshold concepts: how valid are they? *Sports Medicine*, 39(6), 469-490.
- Hart, S. et al. (2013). A method-comparison study regarding the validity and reliability of the Lactate Plus analyzer. *BMJ Open*, 3(2), e001899.
- Heck, H. et al. (1985). Justification of the 4-mmol/l lactate threshold. *International Journal of Sports Medicine*, 6(3), 117-130.
- Mader, A. et al. (1976). Zur Beurteilung der sportartspezifischen Ausdauerleistungsfähigkeit im Labor. *Sportarzt und Sportmedizin*, 27, 80-88, 109-112.
- Pfitzinger, P. & Freedson, P.S. (1998). The reliability of lactate measurements during exercise. *International Journal of Sports Medicine*, 19(5), 349-357.
- Sjodin, B. & Jacobs, I. (1981). Onset of blood lactate accumulation and marathon running performance. *International Journal of Sports Medicine*, 2(1), 23-26.
- Sperlich, B. et al. (2018). Repeatability and predictive value of lactate threshold concepts in endurance sports. *PLoS ONE*, 13(11), e0206846.
- Stone, M. (1974). Cross-validatory choice and assessment of statistical predictions. *Journal of the Royal Statistical Society: Series B*, 36(2), 111-147.
- Tanner, R.K. et al. (2010). Evaluation of three portable blood lactate analysers. *European Journal of Applied Physiology*, 109(3), 551-559.
- Weltman, A. et al. (1990). Reliability and validity of a continuous incremental treadmill protocol for the determination of lactate threshold, fixed blood lactate concentrations, and VO2max. *International Journal of Sports Medicine*, 11(1), 26-32.

---

## Fuentes web consultadas

- [Reliability of lactate measurements - Pfitzinger & Freedson (PubMed)](https://pubmed.ncbi.nlm.nih.gov/9721059/)
- [Weltman et al. 1990 - Continuous incremental treadmill protocol (PubMed)](https://pubmed.ncbi.nlm.nih.gov/2318561/)
- [Sperlich et al. 2018 - Repeatability of lactate threshold concepts (PLOS ONE)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0206846)
- [Faude et al. 2009 - Lactate threshold concepts (PubMed)](https://pubmed.ncbi.nlm.nih.gov/19453206/)
- [INSCYD - Does the anaerobic threshold really occur at 4 mmol/l?](https://inscyd.com/article/anaerobic-threshold-4mmol-lactate/)
- [INSCYD - Lactate Threshold 1 whitepaper](https://inscyd.com/whitepaper/lactate-threshold-1/)
- [Precision of handheld lactate analyzers (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11568978/)
- [Reliability of six hand-held blood lactate analysers (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4306774/)
- [Banister fitness-fatigue model (Fellrnr)](https://fellrnr.com/wiki/Modeling_Human_Performance)
- [TrainingPeaks Performance Manager science](https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/)
- [Factors influencing blood lactate during exercise (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12619971/)
- [Longitudinal lactate threshold in master athletes (PubMed)](https://pubmed.ncbi.nlm.nih.gov/12750591/)
- [Smartwatch LT estimates validation (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12309276/)
- [Running Writings - A runner's guide to LT1](https://runningwritings.com/2025/02/runners-guide-to-lt1.html)
- [The origin of MLSS (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10840223/)
