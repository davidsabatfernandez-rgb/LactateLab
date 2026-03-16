# Auditoria 01 -- Deteccion LT1 / LT2

## Resumen ejecutivo

El sistema de deteccion de umbrales de lactato implementa tres metodos independientes (`_method_baseline_rise`, `_method_sustained_increase`, `_method_moddmax`) que se agregan mediante `_aggregate_threshold` y opcionalmente se promueven a "umbrales REALES" via `_detect_real_thresholds`. La arquitectura multi-metodo con agregacion es cientificamente solida y sigue las mejores practicas de la fisiologia del ejercicio moderna (Faude et al. 2009, Bishop et al. 1998).

Los 17 tests del fichero `test_lactate_motor_quality.py` pasan al 100%. El sistema maneja correctamente curvas limpias, ruidosas, cortas, empinadas (VLamax alta), planas (VLamax baja), ciclismo con potencia, y tests obsoletos. Las calibraciones cientificas estan bien documentadas en el codigo con referencias explicitas.

Se identifican algunos puntos de mejora: (1) el suavizado con ventana movil de 3 puntos puede distorsionar el primer y ultimo valor, (2) el metodo `sustained_increase` tiene un requisito de 3 puntos consecutivos ascendentes que puede fallar en curvas con mesetas fisiologicas, (3) no existe un test especifico para curvas con baseline arruinado, y (4) la cobertura de tests para natacion es nula. En general, el sistema es robusto para uso clinico-deportivo con las salvaguardas implementadas.

---

## Metodos implementados

### _method_baseline_rise

**Descripcion del algoritmo:**
1. Suaviza los valores de lactato con `_smooth()` (media movil de ventana 3).
2. Calcula el baseline como el minimo de los primeros 4 valores suavizados.
3. **LT1**: primer punto donde lactato >= baseline + 0.5 mmol Y el siguiente punto no cae mas de 0.25 mmol (confirmacion de ascenso sostenido).
4. **LT2**: primer punto donde lactato >= 4.0 mmol, O (lactato >= max(3.2, baseline+1.4) Y subida >= 0.45 mmol respecto al anterior). Incluye verificacion anti-pico transitorio: el siguiente punto no debe caer mas de 0.5 mmol.
5. Confianza: formula basada en numero de candidatos (0.56 + n*0.05, cap 0.88) modulada por protocol_score.

**Referencia cientifica y validacion:**
- El criterio +0.5 mmol sobre baseline esta alineado con Faude, Kindermann & Meyer (2009), quienes establecen que el incremento inicial significativo sobre el nivel basal es el marcador mas fiable de LT1 en protocolos incrementales. Tambien consistente con Stegmann & Kindermann (1981).
- El filtro anti-pico transitorio (caida >0.5 mmol = artefacto) se justifica con Billat et al. (2003): variaciones >0.5 mmol entre escalones consecutivos son sospechosas de error de medicion.
- El criterio de 4.0 mmol para LT2 es el clasico OBLA (Onset of Blood Lactate Accumulation) de Heck et al. (1985), ampliamente validado como proxy operativo de LT2/MLSS.
- El criterio alternativo de LT2 (>=3.2 mmol con aceleracion >=0.45) ofrece sensibilidad en atletas entrenados donde el OBLA de 4 mmol puede no alcanzarse.

**Observaciones:**
- La confirmacion `next_value >= value - 0.25` para LT1 es conservadora y apropiada.
- El uso de `_smooth()` antes de buscar el baseline es correcto pero la ventana movil de 3 puede aplanar un primer punto alto genuino. Con solo 3-4 puntos, el primer valor suavizado depende fuertemente de los puntos 1-2, lo que puede desplazar el baseline artificialmente.
- Si el LT1 no se encuentra (ningun punto cumple el criterio), `lt1_index` queda en `baseline_index`, lo que devuelve el punto de baseline como LT1. Esto es defensivo pero puede subestimar LT1 en curvas planas.

**Veredicto:** ✅ Correcto. Implementacion fiel a la literatura con salvaguardas razonables.

---

### _method_sustained_increase

**Descripcion del algoritmo:**
1. Suaviza los valores de lactato.
2. **LT1**: primer punto donde (lactato >= baseline + 0.3 mmol) Y (lactato > anterior) Y (siguiente >= actual). Exige tres puntos consecutivos ascendentes.
3. **LT2**: primer punto donde (lactato >= max(3.2, baseline+1.4)) Y (pendiente local >= max(0.45, pendiente_previa + 0.2)). Busca la "rotura de pendiente" (cambio en la derivada segunda).

**Referencia cientifica y validacion:**
- El concepto de "ascenso mantenido" para LT1 se inspira en Beaver, Wasserman & Whipp (1985) (log-log breakpoint) y Jones & Carter (2000) (analisis de inflexion de la curva de lactato). La idea de exigir ascenso confirmado en el punto siguiente es una aproximacion practica a la deteccion de inflexion.
- Para LT2, la rotura de pendiente (aceleracion >= 0.45 Y >= pendiente_previa + 0.2) es una aproximacion heuristica a la deteccion de la segunda derivada de la curva lactato-intensidad. Esto es metodologicamente valido segun Cheng et al. (1992) y consistente con el concepto de "lactate turning point" (LTP).
- El umbral de +0.3 mmol para LT1 es mas sensible que el +0.5 de baseline_rise, lo cual proporciona diversidad de estimacion entre metodos -- deseable para la agregacion.

**Observaciones:**
- La exigencia de `lactates[idx + 1] >= lactates[idx]` para LT1 (el punto siguiente debe ser >= al actual) puede fallar en curvas con una meseta fisiologica justo despues de LT1 seguida de descenso leve. Esto haria que el metodo "pase de largo" el LT1 real.
- Si ningun punto cumple los criterios de LT1, `lt1_index` queda en 0, devolviendo el primer punto. Esto es mas problematico que en baseline_rise, ya que el primer punto siempre esta por debajo de LT1.
- La confianza base es ligeramente inferior a baseline_rise (0.52 + n*0.05, cap 0.84), reflejando correctamente que este metodo es menos robusto.

**Veredicto:** ✅ Correcto. Metodo complementario valido con limitaciones conocidas en curvas con mesetas, compensadas por la agregacion.

---

### _method_moddmax

**Descripcion del algoritmo:**
1. Requiere >= 4 candidatos.
2. Suaviza los lactatos.
3. Encuentra el baseline minimo (primeros 4 puntos) y busca el primer punto donde lactato >= baseline + 0.5 mmol (`start_index`).
4. Traza una recta desde `start_index` hasta el ultimo punto de la curva.
5. Calcula la desviacion de cada punto respecto a esta recta.
6. **LT2**: el punto con la maxima desviacion positiva.
7. Si la desviacion maxima es <= 0, no devuelve resultado (curva completamente concava).
8. **No estima LT1** -- decision explicita y documentada.

**Referencia cientifica y validacion:**
- El metodo Modified Dmax fue propuesto por Bishop, Jenkins & Mackinnon (1998). La modificacion clave respecto al Dmax clasico (Cheng et al. 1992) es que la recta no parte del primer punto de la curva sino del primer punto de "aumento significativo". Esto corrige el fallo catastrofico del Dmax clasico en atletas entrenados con curvas convexas suaves.
- La implementacion usa baseline + 0.5 mmol como criterio de inicio, lo cual es consistente con la propuesta original de Bishop (1998) que define el inicio como el primer incremento sostenido sobre baseline.
- La decision de no estimar LT1 con Dmax es correcta: el proxy "punto anterior al Dmax" (usado en algunas implementaciones) carece de base fisiologica solida (Jamnick et al. 2018).

**Observaciones:**
- La verificacion `deviations[local_lt2] <= 0` es una salvaguarda excelente que evita resultados absurdos en curvas completamente convexas (comunes en atletas altamente entrenados con VLamax baja).
- El requisito de `len(subset_loads) < 3` tras recortar al `start_index` proporciona proteccion adicional contra curvas demasiado cortas.
- Una posible mejora seria usar un ajuste polinomial (grado 3) en lugar de la interpolacion lineal para la linea de referencia, como proponen Tokmakidis & Leger (1998). Sin embargo, la linea recta es mas robusta con pocos puntos.

**Veredicto:** ✅ Correcto. Implementacion fiel a Bishop et al. (1998) con salvaguardas apropiadas.

---

### _aggregate_threshold

**Descripcion del algoritmo:**
1. Filtra estimaciones por nombre de umbral (LT1/LT2).
2. Para LT1: excluye estimaciones de `dmax_proxy` con lactato >= 3.2 mmol (legacy filter).
3. Selecciona el metodo con mayor confianza como primario.
4. Calcula agreement_score: 60% confianza media + 40% acuerdo en lactato (1 - rango/1.5).
5. Confianza final: 70% mejor confianza + 30% agreement_score.
6. **Lactato**: media de todos los metodos.
7. **Ritmo/Potencia/FC**: mediana de todos los metodos.

**Referencia cientifica y validacion:**
- La separacion lactato=media vs intensidad=mediana es una decision inteligente. La media de lactato entre metodos es estable (los metodos operan sobre la misma curva, las estimaciones de lactato suelen estar cercanas). La mediana de intensidad evita que un metodo outlier arrastre el resultado a un ritmo/potencia que no corresponde a ninguna muestra real medida. Esto es consistente con la recomendacion de Czuba et al. (2009) de usar metodos de tendencia central robustos para la estimacion de umbrales.
- El agreement_score ponderado (confianza + convergencia en lactato) es un enfoque razonable para cuantificar la fiabilidad del consenso multi-metodo. La penalizacion por divergencia (rango/1.5) es proporcional y acotada.

**Observaciones:**
- Cuando solo hay 1 metodo valido, `lactate_agreement` se fija en 0.55 (valor neutro). Esto es pragmatico pero podria subestimar la incertidumbre -- un unico metodo deberia tener un agreement inherentemente bajo.
- El filtro legacy de `dmax_proxy` en linea 470 sugiere que este metodo fue retirado pero el filtro permanece. No causa dano pero es codigo muerto.
- No hay ponderacion por confianza individual al calcular la media/mediana. Un metodo con confianza 0.30 contribuye igual que uno con confianza 0.85. Considerar media ponderada por confianza para el lactato.

**Veredicto:** ✅ Correcto. Agregacion robusta con separacion media/mediana bien justificada. Mejora menor posible con media ponderada.

---

### _detect_real_thresholds

**Descripcion del algoritmo:**
1. Construye candidatos con filtro estricto de `sample_delay_seconds <= 60s`.
2. Aplica 5 quality gates secuenciales:
   - >= 5 etapas con lactato (`_REAL_MIN_STAGES = 5`)
   - Monotonicity >= 0.60 (`_REAL_MIN_MONOTONICITY`)
   - Protocol score >= 0.68 (`_REAL_MIN_PROTOCOL_SCORE`)
   - Signal score >= 0.70 (`_REAL_MIN_SIGNAL_SCORE`)
   - Baseline no arruinado (<= 3.0 mmol)
3. Ejecuta los 3 metodos de deteccion sobre los candidatos filtrados.
4. Agrega resultados y valida LT1 < LT2.
5. Para cada umbral, verifica:
   - Estado "confirmed" (dos metodos de familias distintas compatibles).
   - Quality gate passed.
   - Confianza >= 0.75.
   - Agreement >= 0.62.
   - Existe pace o power.
6. Calcula umbrales practicos REALES: LT1_practico = LT1_real - 0.3 mmol, LT2_practico = LT2_real - 0.5 mmol.
7. Interpolacion de intensidad en el target de lactato practico.

**Referencia cientifica y validacion:**
- El enfoque de quality gates es consistente con el principio de conservadurismo cientifico de Faude et al. (2009): mejor no reportar que reportar un umbral incorrecto.
- El requisito de confirmacion cruzada (dos metodos de familias distintas que converjan) es metodologicamente solido -- sigue el principio de triangulacion de Jones et al. (2019).
- La monotonicity >= 0.60 como gate minimo es razonable: permite hasta un 40% de pares descendentes, acomodando ruido normal de medicion.
- Los offsets practicos (-0.3 mmol para LT1, -0.5 mmol para LT2) son conservadores y apropiados para prescripcion de entrenamiento. El LT2 practico a -0.5 mmol del LT2 real situa el entrenamiento en la zona "sostenible" por debajo del MLSS, consistente con las recomendaciones de Billat (2001) y Beneke (2003).

**Observaciones:**
- El filtro de `sample_delay_seconds <= 60s` es una decision excelente para umbrales individuales: muestras tomadas mas de 60s despues del escalon pierden validez cinetica (el lactato puede haber continuado subiendo o estabilizandose).
- La validacion de LT1 < LT2 en lactato (lineas 1030-1040) es una salvaguarda necesaria. Sin embargo, no hay validacion equivalente en intensidad (pace/power) en este punto especifico de `_detect_real_thresholds`, aunque si existe en `_thresholds_from_session`.
- El sistema de estados (`none`, `candidate_weak`, `candidate_strong`, `confirmed`, `ready_to_anchor`) es sofisticado y permite transiciones graduales de confianza.

**Veredicto:** ✅ Correcto. Sistema de gates conservador y bien estratificado. Excelente decision de requerir confirmacion cruzada multi-metodo.

---

## Tests ejecutados

```
$ python -m pytest tests/test_lactate_motor_quality.py -v
============================= test session starts ==============================
platform darwin -- Python 3.9.6, pytest-8.4.1

tests/test_lactate_motor_quality.py::test_lactate_detection_quality[0] PASSED   (Curva running limpia 7 escalones)
tests/test_lactate_motor_quality.py::test_lactate_detection_quality[1] PASSED   (Curva running limpia 8 escalones elite)
tests/test_lactate_motor_quality.py::test_lactate_detection_quality[2] PASSED   (Curva corta 4 escalones)
tests/test_lactate_motor_quality.py::test_lactate_detection_quality[3] PASSED   (Curva ruidosa)
tests/test_lactate_motor_quality.py::test_lactate_detection_quality[4] PASSED   (Curva empinada VLamax alta)
tests/test_lactate_motor_quality.py::test_lactate_detection_quality[5] PASSED   (Curva plana VLamax baja)
tests/test_lactate_motor_quality.py::test_lactate_detection_quality[6] PASSED   (Curva ciclismo limpia)
tests/test_lactate_motor_quality.py::test_lactate_detection_quality[7] PASSED   (Curva ciclismo corta 5 escalones)
tests/test_lactate_motor_quality.py::test_lactate_detection_quality[8] PASSED   (Test 43 dias stale)
tests/test_lactate_motor_quality.py::test_lactate_detection_quality[9] PASSED   (Test 60 dias stale)
tests/test_lactate_motor_quality.py::test_steep_curve_detects_high_vlamax PASSED
tests/test_lactate_motor_quality.py::test_flat_curve_detects_low_vlamax PASSED
tests/test_lactate_motor_quality.py::test_stale_60d_in_precomp_triggers_test PASSED
tests/test_lactate_motor_quality.py::test_stale_43d_in_base_still_prescribes PASSED
tests/test_lactate_motor_quality.py::test_noisy_curve_survives PASSED
tests/test_lactate_motor_quality.py::test_capacity_profile_direct PASSED
tests/test_lactate_motor_quality.py::test_cycling_power_thresholds PASSED

======================= 17 passed, 17 warnings in 0.99s ========================
```

**Comentarios sobre cobertura:**
- 10 curvas parametrizadas cubren los escenarios principales: limpia, elite, corta, ruidosa, empinada, plana, ciclismo limpia, ciclismo corta, stale 43d, stale 60d.
- 7 tests adicionales verifican comportamientos especificos: VLamax alta/baja, stale tests, ruido, potencia ciclismo, capacity profile directo.
- **Gaps de cobertura**: no hay tests para natacion, curvas con baseline arruinado (>3.0 mmol), curvas con exactamente 3 puntos (minimo), curvas completamente planas (sin inflexion), ni tests unitarios aislados para cada metodo individual.

---

## Casos limite identificados

### Gestionados correctamente

1. **Curvas cortas (<5 puntos):** Cap de confianza gradual (3pts -> 0.45, 4pts -> 0.60). La curva SHORT_CURVE_4 pasa el test con data_quality="low".

2. **Baseline arruinado (>3.0 mmol):** `_thresholds_from_session` y `_detect_real_thresholds` invalidan el test completo con mensaje explicativo. Umbral de 3.0 mmol es razonable (excluye calentamientos insuficientes).

3. **Umbrales invertidos (LT1 >= LT2):** Validacion en lactato (mmol), pace (s/km) y potencia (W). El sistema invalida los dos umbrales y recomienda repetir el test.

4. **Curvas con pico transitorio:** El filtro `next_value >= value - 0.5` en baseline_rise evita que un pico aislado se interprete como LT2.

5. **Curvas convexas en atletas entrenados:** ModDmax devuelve `[]` si la desviacion maxima es negativa, evitando resultados absurdos.

6. **Muestras con retraso excesivo:** `_detect_real_thresholds` filtra muestras con `sample_delay_seconds > 60s` para umbrales REALES.

### No gestionados o parcialmente gestionados

7. **Curvas completamente planas (sin inflexion):** Si el lactato nunca sube +0.5 mmol sobre baseline, baseline_rise devuelve el punto de baseline como LT1. Si nunca alcanza 3.2 mmol ni 4.0 mmol, devuelve el ultimo punto como LT2. Esto produce un LT2 artificial en el ultimo punto del test. No hay salvaguarda explicita para este caso.

8. **Curva con meseta central:** Si hay una meseta de lactato entre LT1 y LT2 (e.g., 1.2, 1.3, 1.2, 1.3, 3.5, 5.0), `sustained_increase` puede detectar LT1 incorrectamente alto porque exige `lactates[idx + 1] >= lactates[idx]` pero la meseta rompe este patron.

9. **Curva con descenso inicial (calentamiento incompleto):** Si los primeros valores bajan (e.g., 1.8, 1.2, 0.9, 1.5, 2.5, 4.0), el baseline se calcula correctamente como min(primeros 4) = 0.9, pero el `_smooth()` puede distorsionar el primer valor. No hay test para este escenario.

10. **Exactamente 3 puntos:** El sistema acepta >=3 candidatos. Con 3 puntos, el suavizado convierte cada valor en la media de sus 2-3 vecinos, y ModDmax no se ejecuta (requiere >=4). Solo 2 metodos operan, con confianza capada a 0.45. Funcional pero no testeado.

11. **Datos de potencia mixtos (power_watts vs running_power_watts):** `_load_metric` prioriza `power_watts` sobre `running_power_watts`. Si un atleta tiene ambos, solo se usa `power_watts`. No hay test que verifique el comportamiento con `running_power_watts`.

---

## Hallazgos criticos

1. **El fallback de LT2 al ultimo punto puede generar umbrales artificiales.** Si la curva nunca alcanza 3.2 mmol (atleta extremadamente aerobico con baseline bajo), `_method_baseline_rise` devuelve `lt2_index = len(lactates) - 1`. Esto no es necesariamente incorrecto (el test no llevo al atleta a LT2), pero deberia acompanarse de una confianza penalizada o un flag explicito de "LT2 no alcanzado en test".

2. **El suavizado `_smooth()` con ventana movil de 3 modifica los extremos de la curva.** El primer valor se suaviza con solo 2 vecinos (el mismo y el siguiente), el ultimo con 2 (el anterior y el mismo). Esto puede desplazar el baseline y el ultimo punto, que son criticos para ModDmax y baseline_rise. Con 3-4 puntos el efecto es mas pronunciado.

3. **Codigo muerto del filtro `dmax_proxy`.** En `_aggregate_threshold` (linea 470), se filtra el metodo `dmax_proxy` para LT1. Sin embargo, `dmax_proxy` no es generado por ningun builder activo (los metodos son `baseline_rise`, `sustained_increase`, `moddmax`). Este filtro no causa dano pero es codigo muerto.

4. **Ausencia de tests de natacion.** Las curvas de test cubren running y ciclismo, pero no natacion. Dado que el sistema se usa para triatlon (ver MEMORY.md: "aerobic_continuity", "css_threshold", "lt1_broken_sets"), la ausencia de tests para esta disciplina es una brecha significativa.

5. **`_method_sustained_increase` devuelve lt1_index=0 cuando no encuentra LT1.** Devolver el primer punto como LT1 es mas problematico que devolver el baseline (como hace baseline_rise), porque el primer punto esta garantizado por debajo de LT1. Esto puede contaminar la agregacion bajando la mediana de intensidad para LT1.

6. **Agreement score con un solo metodo = 0.55.** Cuando solo un metodo detecta un umbral (e.g., solo ModDmax para LT2 con 4 puntos donde baseline_rise y sustained_increase coinciden en el ultimo punto), el agreement_score se fija en 0.55. Esto es relativamente alto para un dato sin confirmacion cruzada y podria dar falsa confianza.

---

## Recomendaciones

### Prioridad alta

1. **Penalizar el fallback al ultimo punto para LT2.** Cuando `lt2_index == len(lactates) - 1` y el lactato del ultimo punto es <4.0 mmol, reducir la confianza un 30% y anadir una nota al rationale: "LT2 no alcanzado en el protocolo; estimacion basada en el ultimo escalon."

2. **Anadir tests de natacion.** Crear al menos 2 curvas: una limpia de 6-7 escalones con pace de natacion (s/100m convertidos) y una corta de 4 escalones. Esto validaria el comportamiento del motor con datos tipicos de CSS tests.

3. **Corregir el fallback de `sustained_increase` para LT1.** Cuando no se encuentra un patron de ascenso mantenido, devolver `None` en lugar de index 0. Esto evitaria contaminar la agregacion con un punto que no es fisiologicamente LT1.

### Prioridad media

4. **Reducir agreement_score con un solo metodo a 0.40.** Un unico metodo sin confirmacion cruzada deberia reflejar mayor incertidumbre. Esto afectaria la confianza final y propagaria la precaucion al motor fisiologico.

5. **Anadir tests unitarios para cada metodo individual.** Actualmente los tests pasan por el pipeline completo (recalculate_athlete -> analysis_payload -> build_context -> gap). Tests unitarios que llamen directamente a `_method_baseline_rise([...])` permitirian verificar el comportamiento preciso de cada metodo con datos sinteticos sin dependencia de la DB.

6. **Anadir test de baseline arruinado.** Crear una curva con lactato inicial >3.0 mmol y verificar que el sistema la rechaza correctamente. Aunque el codigo esta implementado, no hay test que lo cubra.

7. **Eliminar filtro legacy de `dmax_proxy`.** Limpiar el codigo muerto en `_aggregate_threshold` linea 467-473.

### Prioridad baja

8. **Considerar media ponderada por confianza en la agregacion de lactato.** En lugar de `mean(lactate_values)`, usar `weighted_mean(lactate_values, weights=[m.confidence for m in valid])`. Esto daria mas peso al metodo mas fiable.

9. **Evaluar suavizado adaptativo.** Considerar usar un suavizado que no modifique el primer y ultimo punto (e.g., Savitzky-Golay) o aplicar `_smooth()` solo cuando `len(values) >= 5`. Con 3-4 puntos, el suavizado introduce mas distorsion que la que elimina.

10. **Documentar el comportamiento esperado con curvas completamente planas.** Si el lactato nunca sube significativamente (e.g., atleta ultra-entrenado en test con rango insuficiente), el sistema deberia idealmente devolver "LT1/LT2 no detectables en este rango de intensidad" en lugar de umbrales artificiales.

---

## Referencias bibliograficas

- **Beaver, W.L., Wasserman, K., & Whipp, B.J.** (1985). Improved detection of lactate threshold during exercise using a log-log transformation. *Journal of Applied Physiology*, 59(6), 1936-1940.

- **Beneke, R.** (2003). Methodological aspects of maximal lactate steady state -- implications for performance testing. *European Journal of Applied Physiology*, 89(1), 95-99.

- **Billat, V.L.** (2001). Interval training for performance: a scientific and empirical practice. *Sports Medicine*, 31(1), 13-31.

- **Billat, V.L., Sirvent, P., Py, G., Koralsztein, J.P., & Mercier, J.** (2003). The concept of maximal lactate steady state: a bridge between biochemistry, physiology and sport science. *Sports Medicine*, 33(6), 407-426.

- **Bishop, D., Jenkins, D.G., & Mackinnon, L.T.** (1998). The relationship between plasma lactate parameters, Wpeak and 1-h cycling performance in women. *Medicine and Science in Sports and Exercise*, 30(8), 1270-1275.

- **Cheng, B., Kuipers, H., Snyder, A.C., Keizer, H.A., Jeukendrup, A., & Hesselink, M.** (1992). A new approach for the determination of ventilatory and lactate thresholds. *International Journal of Sports Medicine*, 13(7), 518-522.

- **Czuba, M., Zajac, A., Cholewa, J., Poprzecki, S., Waskiewicz, Z., & Mikotajec, K.** (2009). Lactate threshold (D-max method) and maximal lactate steady state in cyclists. *Journal of Human Kinetics*, 21, 49-56.

- **Faude, O., Kindermann, W., & Meyer, T.** (2009). Lactate threshold concepts: How valid are they? *Sports Medicine*, 39(6), 469-490.

- **Heck, H., Mader, A., Hess, G., Mucke, S., Muller, R., & Hollmann, W.** (1985). Justification of the 4-mmol/l lactate threshold. *International Journal of Sports Medicine*, 6(3), 117-130.

- **Jamnick, N.A., Botella, J., Pyne, D.B., & Bishop, D.J.** (2018). Manipulating graded exercise test variables affects the validity of the lactate threshold and VO2peak. *PLoS ONE*, 13(7), e0199794.

- **Jones, A.M., & Carter, H.** (2000). The effect of endurance training on parameters of aerobic fitness. *Sports Medicine*, 29(6), 373-386.

- **Jones, A.M., Burnley, M., Black, M.I., Poole, D.C., & Vanhatalo, A.** (2019). The maximal metabolic steady state: redefining the 'gold standard'. *Physiological Reports*, 7(10), e14098.

- **Stegmann, H., & Kindermann, W.** (1981). Comparison of prolonged exercise tests at the individual anaerobic threshold and the fixed anaerobic threshold of 4 mmol/l lactate. *International Journal of Sports Medicine*, 2(3), 160-165.

- **Tokmakidis, S.P., & Leger, L.A.** (1998). Comparison of mathematically determined blood lactate and heart rate "threshold" points and relationship with performance. *European Journal of Applied Physiology*, 78(3), 238-244.
