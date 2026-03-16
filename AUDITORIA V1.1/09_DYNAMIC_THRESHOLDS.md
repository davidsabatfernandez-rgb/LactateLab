# 09 — Auditoría del Motor de Umbrales Dinámicos

**Archivo auditado:** `backend/app/services/dynamic_threshold_engine.py` (~1450 líneas)
**Fecha de auditoría:** 2026-03-15
**Versión del motor:** sin versionado explícito

---

## Resumen ejecutivo

El motor de umbrales dinámicos construye estimaciones operativas de LT1 y LT2 prácticos a partir de muestras de lactato acumuladas en una ventana temporal (aguda: 10 días, crónica: 42 días). Es un sistema sofisticado con múltiples capas de filtrado (isotónico, intra-sesión, LOO cross-sesión), ponderación multi-dimensional (recencia, calidad, similitud, protocolo, basal) e interpolación multi-bracket.

Se identifican **3 bugs matemáticos**, **4 problemas de diseño significativos** y **6 riesgos operativos** que pueden producir estimaciones incorrectas en escenarios reales.

### Hallazgos críticos

| ID | Severidad | Componente | Hallazgo |
|----|-----------|-----------|----------|
| B1 | CRITICO | `_weighted_regression` | Regresión invertida: calcula slope como cov(x,y)/var(y) en vez de cov(x,y)/var(x) |
| B2 | ALTO | `_stability_score` | LOO usa la regresión invertida y además evalúa en el punto equivocado |
| B3 | MEDIO | `_detect_outliers` / `id()` | `id(p)` no es estable tras `{**p, ...}` — los dicts copiados pierden la referencia |
| D1 | ALTO | Ventana aguda 10d | Insuficiente para la mayoría de atletas: un test cada 7-14 días deja la ventana aguda vacía frecuentemente |
| D2 | MEDIO | Targets fijos | 1.6 mmol LT1 y 3.1 mmT2 no cubren el rango real de atletas (LT2 corregido parcialmente con nivel) |
| D3 | MEDIO | Blending anchor | Peso 0.35*(1-conf)+0.10 carece de justificación empírica y puede anclar a un LT2 fisiológico erróneo |
| D4 | BAJO | `_interval_duration_score` | Penaliza intervalos >8 min cuando la evidencia muestra que 8-20 min son los más fiables para lactato estable |

---

## 1. Análisis de `_weighted_regression` (B1 -- CRITICO)

### Problema

```python
# Línea 454
variance = sum(point["point_weight"] * (point[lactate_key] - mean_y) ** 2 for point in valid)
# Línea 457
slope = covariance / variance
intercept = mean_x - slope * mean_y
```

Esto calcula `slope = Cov(X,Y) / Var(Y)` y luego `intercept = mean_x - slope * mean_y`.

Esta es la **regresión inversa** (X sobre Y), no la estándar (Y sobre X). El modelo intenta predecir carga (velocidad/potencia) en función de lactato, lo cual es el planteamiento correcto para interpolar "a qué velocidad se alcanza X mmol". Sin embargo, la covarianza en línea 450-453 calcula `(lactate - mean_y) * (x - mean_x)`, que es Cov(Y,X) = Cov(X,Y), y la varianza es Var(Y) = Var(lactato).

**La regresión inversa es conceptualmente correcta aquí** (queremos predecir carga dado un lactato target), pero hay que asegurar que es intencional. El nombre de la función (`_weighted_regression`) no lo documenta y `_stability_score` la reutiliza de forma inconsistente.

### Impacto real

Para la interpolación multi-bracket (método principal), la regresión solo se usa como fallback cuando no hay bracket. El impacto principal es en `_stability_score` y en los casos de extrapolación.

### Recomendación

Documentar explícitamente que es una regresión inversa (X|Y). Verificar que `_stability_score` la usa correctamente.

---

## 2. Análisis de `_stability_score` (B2 -- ALTO)

### Problema

```python
# Línea 477
leave_one_out.append(intercept + slope * valid[min(index, len(valid) - 2)][lactate_key])
```

Dos problemas:
1. Usa `valid[min(index, len(valid) - 2)]` en vez de `valid[index]` — evalúa en el lactato de un punto diferente al excluido cuando `index == len(valid) - 1`.
2. El LOO debería evaluar el modelo sin el punto `index` en el lactato target, no en el lactato de un punto arbitrario. El propósito del LOO es estimar la estabilidad del estimate final, por lo que debería predecir siempre en el mismo `target_lactate`.

### Impacto

La puntuación de estabilidad es ruidosa y no refleja realmente la sensibilidad del modelo a la exclusión de puntos individuales. Con 4-5 puntos, la diferencia entre evaluar en `valid[3]` vs `valid[2]` puede ser significativa.

### Recomendación

```python
# Corrección: evaluar siempre en target_lactate (pasarlo como parámetro)
leave_one_out.append(intercept + slope * target_lactate)
```

---

## 3. Análisis del LOO Outlier Detection

### Corrección matemática

La detección LOO en `_detect_outliers_in_lactate_space` (líneas 529-592) es **matemáticamente correcta**. La regresión aquí es carga ~ lactato (predice carga), y el residual mide si la carga de un punto es consistente con la curva de los demás. Esto funciona bien para detectar puntos donde el lactato o la carga son anómalos.

### Limitación con pocos puntos

Con exactamente 4 puntos (el mínimo), el LOO ajusta una regresión sobre 3 puntos. Con 3 puntos colineales, la regresión es perfecta y el outlier se detecta fácilmente. Pero con 3 puntos no colineales (lo habitual con datos reales), un outlier moderado (+0.5 mmol) puede quedar enmascarado porque la regresión sobre 3 puntos tiene poca potencia estadística.

**Umbral de 1.0 mmol** (configurado): es razonable para evitar falsos positivos, pero significa que outliers moderados (0.5-1.0 mmol) — frecuentes con lactímetros portátiles (error ±0.2-0.3 mmol) — no se detectan.

### Bug de identidad `id()` (B3)

```python
# Línea 556
residual_map: dict[int, tuple[bool, float]] = {}
# ...
residual_map[id(candidate)] = (residual > outlier_threshold, round(residual, 2))

# Línea 582
is_outlier, residual_val = residual_map.get(id(p), (False, 0.0))
```

El mapa usa `id(p)` como clave. Pero `_detect_outliers_in_lactate_space` recibe una lista `valid` que se filtra de `points`. Si `valid` contiene los mismos objetos dict que `points`, funciona. Pero la función se llama desde `_estimate_reference` (línea 615) donde `valid` se construye como:

```python
valid = [point for point in points if point.get(x_key) is not None]
```

Esto **no copia** los dicts, así que `id()` es estable. Sin embargo, hay un riesgo sutil: en `_build_model`, los puntos pasan por `_intrasession_consistency_filter` que hace `{**p, ...}` (línea 1018-1022), creando **nuevos dicts**. Los `id()` de estos nuevos dicts se usan en el `residual_map`, y luego en el bucle `for p in points` de la línea 578 se buscan los mismos `id()`.

Dentro de `_detect_outliers_in_lactate_space`, `valid` se construye filtrando `points`, y luego se itera `points` en la línea 578. Como `valid` contiene referencias a los mismos objetos de `points`, los `id()` coinciden **dentro de la misma llamada**. El bug potencial no se manifiesta aquí, pero el patrón es frágil — cualquier copia intermedia rompe la correspondencia.

El mismo patrón `id()` se usa en `_isotonic_filter` (línea 417) y `_intrasession_consistency_filter` (línea 1016), con el mismo riesgo.

### Recomendación

Usar un índice explícito (posición en la lista) en vez de `id()` para mapear resultados. O añadir un campo `_point_id` único a cada punto en `_collect_points`.

---

## 4. Interpolación Multi-Bracket

### Análisis

La interpolación multi-bracket (líneas 625-676) es el componente más sólido del motor. El diseño es correcto:

1. Toma los 4 puntos más cercanos al target por cada lado (lower/upper).
2. Evalúa todos los pares posibles, descartando los no monotónicos.
3. Pondera por media geométrica de pesos y proximidad al target.
4. Penaliza pares con upper bracket lejano.

### Edge case: todos los puntos por encima de 4 mmol

Si todos los lactatos > 4 mmol, `lower` está vacío para el target de LT1 práctico (1.6 mmol). El multi-bracket falla y cae al fallback de regresión. La regresión extrapola hacia abajo, lo cual es peligroso: con datos solo en 4-8 mmol, predecir la velocidad a 1.6 mmol es una extrapolación masiva.

**Impacto**: el motor produce un LT1 práctico con un warning genérico ("Objetivo fuera del rango directo de lactato") pero el estimate puede estar completamente desviado.

### Edge case: todos los puntos por debajo de 2 mmol

Si todos los lactatos < 2 mmol, `upper` está vacío para LT2 práctico (3.1 mmol). Misma situación: extrapolación peligrosa. Además, `_low_lactate_cluster_reference` domina y el LT1 práctico usa el punto central del cluster, lo cual es conservador pero puede ser innecesariamente lento.

### Edge case: un solo punto por lado del bracket

Con exactamente 1 punto por debajo y 1 por encima del target, el multi-bracket produce una interpolación lineal simple. Esto es correcto pero se reporta como `weighted_linear_interpolation` — la confianza debería ser explícitamente baja.

### Recomendación

- Prohibir la extrapolación cuando el target está >1.5 mmol fuera del rango observado. Devolver `None` con un warning explícito.
- La relación velocidad-lactato es exponencial (no lineal); considerar log-transformar el lactato antes de interpolar.

---

## 5. Blending con Anchor Fisiológico

### Fórmula

```
anchor_weight = 0.35 * (1 - confidence) + 0.10
```

| Confidence | anchor_weight | % fisiológico |
|-----------|---------------|---------------|
| 0.18 | 0.387 | 39% |
| 0.50 | 0.275 | 28% |
| 0.70 | 0.205 | 21% |
| 0.90 | 0.135 | 14% |

### Problemas

1. **Sin validación del anchor fisiológico**: el LT2 fisiológico de la sesión (por forma de curva) puede ser incorrecto — especialmente con curvas ruidosas, pocos escalones o protocolos no incrementales. El blend confía ciegamente en este valor.

2. **Asimetría**: solo se aplica al LT2, no al LT1. No hay justificación fisiológica para tratar LT1 y LT2 de forma diferente en este aspecto.

3. **El anchor no se ajusta por antigüedad**: si el LT2 fisiológico proviene de una sesión de hace 30 días, sigue pesando igual que uno de hoy.

4. **Los coeficientes 0.35 y 0.10 no tienen referencia científica**. Son razonables heurísticamente (el fisiológico aporta más cuando la confianza dinámica es baja), pero la función lineal es arbitraria — una función sigmoide o step function podría ser más apropiada.

### Recomendación

- Validar que el LT2 fisiológico tiene confianza > 0.6 antes de aplicar el blend.
- Ponderar el anchor por la antigüedad de la sesión que lo generó.
- Considerar aplicar el blend también al LT1.

---

## 6. Detección de Baseline

### Análisis de `_estimate_baseline`

```python
recent = [value for baseline_date, value in measured_baselines if 0 <= (session_date - baseline_date).days <= 21]
if recent:
    baseline = round(mean(recent[-3:]), 2)
```

Usa la media de las últimas 3 basales en 21 días. Esto es razonable pero:

1. **No pondera por recencia**: una basal de hace 20 días pesa igual que una de ayer.
2. **21 días es largo**: el basal de lactato puede variar significativamente por fatiga, nutrición, hidratación. Un atleta fatigado puede tener basal +0.3-0.5 mmol sobre su referencia.

### Edge case: sin basal medido nunca

El fallback es `1.2 mmol`. Esto es razonable para la población general (Billat 2003 reporta basales de 0.8-1.5 mmol en reposo), pero:

- Atletas de resistencia bien entrenados: basales de 0.6-0.9 mmol
- Atletas con dieta alta en carbohidratos pre-test: basales de 1.2-1.8 mmol

El fallback de 1.2 sobrestima en atletas entrenados y subestima en algunos recreativos. Como el delta LT1 se calcula desde el baseline (`baseline + 0.45`), un error de 0.3 mmol en el baseline desplaza el target LT1 0.3 mmol.

### Recomendación

- Ponderar basales recientes exponencialmente por recencia.
- Considerar un fallback parametrizado por nivel de atleta: 0.9 (competitive), 1.1 (trained), 1.3 (recreational).

---

## 7. Ventanas Temporales

### Ventana aguda: 10 días

Para un atleta que testea cada 7-14 días, la ventana aguda contiene 0-1 sesiones. Con 0 sesiones, el modelo agudo devuelve datos vacíos. Con 1 sesión (3-8 intervalos), tiene pocos puntos para la interpolación multi-bracket.

El modelo agudo es más útil para atletas que testean 2-3 veces por semana (frecuencia que no es práctica para la mayoría).

### Ventana crónica: 42 días

42 días (6 semanas) es razonable para acumular suficientes datos. Sin embargo:

1. **No distingue entre fases de entrenamiento**: un atleta en base aeróbica tiene un perfil de lactato diferente al de fase específica. Mezclar datos de ambas fases diluye la señal.
2. **El decay de recencia** (18 días, exponencial) mitiga parcialmente este problema, pero un dato de hace 35 días aún pesa `exp(-35/18) = 0.14` — no despreciable.

### Recomendación

- Aumentar la ventana aguda a 14 días.
- Considerar un modelo "sliding" que no use ventanas discretas sino solo el decay de recencia.
- Documentar la frecuencia mínima de testing recomendada (1 test cada 7-10 días) para que el motor produzca estimaciones fiables.

---

## 8. Scores de Confianza/Fiabilidad/Validez

### Reliability score

```python
reliability = max(0.18, min(0.95,
    sample_effect * 0.30 + stability * 0.20 + monotonicity * 0.10 +
    signal * 0.12 + (1 - influence) * 0.08 + protocol * 0.12 +
    baseline_state * 0.08
))
```

Los pesos suman `0.30 + 0.20 + 0.10 + 0.12 + 0.08 + 0.12 + 0.08 = 1.00`. Correcto.

Pero `sample_effect` domina con 0.30 y satura en 0.94 con >20 puntos. Un atleta con 25 puntos de datos ruidosos obtiene `0.94 * 0.30 = 0.28` solo por cantidad, empujando la reliability a valores altos independientemente de la calidad real.

### Validity score

```python
validity = max(0.2, min(0.95,
    monotonicity * 0.24 + signal * 0.18 + plausibility * 0.18 +
    (1 - influence) * 0.06 + (0.9 if baseline_source == "measured" else 0.65) * 0.16 +
    protocol * 0.10 + baseline_state * 0.08
))
```

Pesos: `0.24 + 0.18 + 0.18 + 0.06 + 0.16 + 0.10 + 0.08 = 1.00`. Correcto.

El término de `plausibility` es binario (0.8 o 0.32-0.38), no gradual. Un LT2 estimado a 204 bpm tiene plausibility 0.78 (dentro de rango), pero fisiológicamente es sospechoso para la mayoría de adultos.

### Confidence score

```python
confidence = max(0.18, min(0.95, reliability * 0.55 + validity * 0.45))
```

Es una media ponderada simple. Razonable.

### Problema: floor demasiado alto

El floor de 0.18 para confidence y reliability significa que incluso con 1 punto de datos ruidoso, la confianza reportada es 0.18. Esto puede dar una falsa impresión de que hay "algo" de confianza cuando en realidad no hay datos suficientes para estimar nada.

### Recomendación

- Hacer `plausibility` gradual (función sigmoide centrada en valores medios de población).
- Reducir el peso de `sample_effect` o saturarlo en un techo más bajo (0.70-0.80).
- Considerar un floor de 0.0 para casos con <2 puntos.

---

## 9. `_interval_duration_score` y `_interval_protocol_score`

### `_interval_duration_score`

```python
<120s: 0.42, <180s: 0.58, <=240s: 0.78, <=480s: 0.92, <=720s: 0.85, <=900s: 0.76, <=1200s: 0.64, >1200s: 0.5
```

**Problema**: la función penaliza intervalos largos (>8 min). Pero la evidencia científica (Beneke & von Duvillard, 1996; Heck et al., 1985) muestra que el lactato alcanza estado estable después de 3-4 minutos de ejercicio constante, y los tests incrementales clásicos usan escalones de 3-5 minutos precisamente porque el lactato se estabiliza.

Intervalos de 8-20 minutos producen lactatos **más fiables** (más cerca del estado estable) que intervalos de 3-4 minutos. La penalización a partir de 8 min es fisiológicamente incorrecta.

La justificación posible es que intervalos muy largos permiten adaptación (drift cardiovascular, depleción de glucógeno), pero esto solo es relevante >20-30 minutos.

### `_interval_protocol_score`

El ratio work/rest es un proxy razonable de la calidad del protocolo:
- Rest ratio <=0.15: 1.0 (test continuo)
- Rest ratio <=0.30: 0.9 (descanso breve)

Esto es correcto: tests con poco o ningún descanso entre escalones producen lactatos más representativos del estado real.

### Recomendación

Ajustar `_interval_duration_score`:
```
<120s: 0.42, <180s: 0.60, <=300s: 0.82, <=600s: 0.95, <=1200s: 0.90, <=1800s: 0.80, >1800s: 0.65
```

---

## 10. `_isotonic_filter` (PAVA)

### Análisis

La implementación del Pool Adjacent Violators Algorithm es correcta. Se usa para detectar puntos que violan fuertemente la monotonía carga-lactato.

### Threshold de 1.2 mmol

El umbral de desviación isotónica de 1.2 mmol es alto. Un punto que desvía 1.0 mmol de la curva isotónica no se marca. Dado que la variabilidad del lactímetro portátil es ±0.2-0.3 mmol (Tanner et al., 2010), una desviación de >0.8 mmol ya es sospechosa.

### Interacción con LOO outlier detection

Los puntos pasan por el filtro isotónico (peso × 0.03) **antes** que por el LOO outlier detection (peso × 0.25). Si un punto es isotónicamente anómalo, su peso ya es ~0.03, y si también es LOO outlier, queda en ~0.03 × 0.25 = 0.0075. Esto es correcto (doble penalización para datos claramente malos).

Pero hay un problema de orden: en `_build_model`, el filtro isotónico se aplica **implícitamente** dentro de `_estimate_reference` vía `_detect_outliers_in_lactate_space`, pero la llamada explícita a `_isotonic_filter` no está presente en `_build_model`. El filtro isotónico solo se invoca si se llama directamente — **actualmente no se llama en el pipeline principal**.

Revisando el código: `_isotonic_filter` está definida (líneas 353-434) pero **nunca se invoca** desde `_build_model` ni desde ningún otro punto del pipeline. Es código muerto.

### Recomendación

- Integrar `_isotonic_filter` en `_build_model` antes de `_intrasession_consistency_filter`, o eliminarlo si no se necesita.
- Reducir el threshold isotónico a 0.8-1.0 mmol.

---

## 11. Comparación Agudo vs Crónico

### Análisis de `_comparison_metric`

```python
if abs(delta) >= (6 if metric_key == "estimated_hr_at_target" else 0.25 if metric_key == "estimated_speed_kph" else 8):
    direction = "acute_above_chronic" if delta > 0 else "acute_below_chronic"
```

Los umbrales de cambio significativo son:
- HR: 6 bpm
- Speed: 0.25 km/h
- Power: 8 W

Para potencia, 8W es razonable (~2-3% de un FTP de 250-350W). Para velocidad, 0.25 km/h equivale a ~5 s/km en ritmo de 4:00-5:00/km, lo cual es significativo y apropiado.

### Problema: sin resolución de conflictos

Cuando agudo y crónico difieren significativamente, el motor reporta el cambio pero **no prescribe qué modelo usar**. El consumidor de la API recibe ambos modelos y la comparación, pero no hay lógica para seleccionar el más apropiado.

Para un entrenador, la pregunta práctica es: "¿entreno con el umbral agudo o el crónico?" El motor no la responde.

### Warning de cambio excesivo

```python
if any(value and value["direction"] != "stable" and abs(value["delta"]) > (15 if "power" in key else 20 if "pace" in key else 8) ...):
    warnings.append("Cambio agudo excesivo respecto a la referencia crónica.")
```

Para HR usa 8 bpm como umbral de "excesivo", que es el **mismo** umbral que para "estable vs no estable". Esto significa que cualquier cambio no estable en HR se considera excesivo. Debería ser más alto (12-15 bpm).

### Recomendación

- Añadir un campo `recommended_model` basado en: si la ventana aguda tiene suficientes datos (>4 puntos) y confianza >0.5, usar agudo; sino, crónico.
- Separar el umbral de "cambio excesivo" en HR a 12-15 bpm.

---

## 12. Edge Cases Adicionales

### 12.1 Natación

El motor usa `speed_kph` para running y `power_watts` para ciclismo. Para natación, `_iso_metric` sería `power_watts` (línea 1127: `"speed_kph" if discipline == "running" else "power_watts"`). Pero los nadadores raramente tienen potenciómetro. El motor debería usar `speed_kph` (convertida de pace) también para natación.

### 12.2 Sesiones sin intervalos

Si una sesión no tiene intervalos con muestras de lactato, se ignora silenciosamente. Esto es correcto.

### 12.3 Cambio de power_source en ciclismo

Si un ciclista alterna entre rodillo y exterior, el filtro de `power_source` separa correctamente los datos. Pero si cambia de rodillo (por ejemplo, de Tacx a Wahoo), el `power_source` puede diferir y los datos no se acumulan.

### 12.4 `_collect_points` devuelve tupla de 7 elementos

La función firma dice que devuelve `tuple[list[dict], Optional[float], str, list[str]]` (4 elementos) pero realmente devuelve 7 (líneas 342-350). Esto funciona en Python pero es un error de tipado.

---

## 13. Test Coverage

Solo existe **1 test** (`test_dynamic_threshold_endpoints`) que verifica el endpoint de la API, no la lógica interna del motor. No hay tests unitarios para:

- `_weighted_regression` con datos conocidos
- `_detect_outliers_in_lactate_space` con outliers sintéticos
- Multi-bracket interpolation con brackets conocidos
- Edge cases (todos puntos > 4 mmol, todos < 2 mmol)
- `_isotonic_filter` (que además no se usa)
- `_intrasession_consistency_filter` con sesiones reales

---

## 14. Tabla de Recomendaciones por Prioridad

| Prioridad | Acción | Esfuerzo |
|-----------|--------|----------|
| P0 | Verificar que la regresión inversa en `_weighted_regression` es intencional; documentarla | Bajo |
| P0 | Fix `_stability_score`: evaluar en target_lactate, no en punto arbitrario | Bajo |
| P1 | Integrar `_isotonic_filter` en el pipeline o eliminarlo (código muerto) | Bajo |
| P1 | Reemplazar `id()` por índice explícito en `_detect_outliers`, `_isotonic_filter`, `_intrasession_consistency_filter` | Medio |
| P1 | Añadir tests unitarios para la lógica de interpolación y detección de outliers | Medio |
| P2 | Ajustar `_interval_duration_score` para no penalizar intervalos de 8-20 min | Bajo |
| P2 | Validar confianza del anchor fisiológico antes de aplicar blend | Bajo |
| P2 | Aumentar ventana aguda a 14 días | Bajo |
| P2 | Separar umbral de "cambio excesivo" en HR (actualmente 8 bpm, debería ser 12-15) | Bajo |
| P2 | Corregir type hint de `_collect_points` (devuelve 7-tuple, declara 4-tuple) | Bajo |
| P3 | Hacer `plausibility` gradual en vez de binaria | Medio |
| P3 | Baseline fallback parametrizado por nivel de atleta | Bajo |
| P3 | Soportar natación con `speed_kph` además de `power_watts` | Medio |
| P3 | Añadir campo `recommended_model` (agudo vs crónico) | Medio |

---

## Referencias

- Beneke, R., & von Duvillard, S.P. (1996). Determination of maximal lactate steady state response in selected sports events. *Medicine & Science in Sports & Exercise*, 28(2), 241-246.
- Billat, V.L. et al. (2003). The concept of maximal lactate steady state: a bridge between biochemistry, physiology and sport science. *Sports Medicine*, 33(6), 407-426.
- Bishop, D. et al. (1998). Reliability of a 1-h endurance performance test in trained female cyclists. *Medicine & Science in Sports & Exercise*, 30(9), 1373-1379.
- Faude, O. et al. (2009). Lactate threshold concepts: how valid are they? *Sports Medicine*, 39(6), 469-490.
- Heck, H. et al. (1985). Justification of the 4-mmol/l lactate threshold. *International Journal of Sports Medicine*, 6(3), 117-130.
- Tanner, R.K. et al. (2010). Evaluation of three portable blood lactate analysers: Lactate Pro, Lactate Scout and Lactate Plus. *European Journal of Applied Physiology*, 109(3), 551-559.
