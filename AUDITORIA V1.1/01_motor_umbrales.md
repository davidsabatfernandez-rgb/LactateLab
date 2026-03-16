# Auditoria: Motor de Deteccion de Umbrales

**Archivo auditado:** `backend/app/services/analytics.py`
**Fecha:** 2026-03-15
**Auditor:** Claude Opus 4.6 (auditoria cientifica automatizada)

---

## Resumen ejecutivo

El motor de deteccion de umbrales implementa tres metodos independientes (baseline_rise, sustained_increase, moddmax) con agregacion posterior para estimar LT1 y LT2 a partir de tests incrementales de lactato. La arquitectura general es solida: usar multiples metodos y requerir convergencia es consistente con las recomendaciones de Faude et al. (2009), y los gates conservadores para publicar umbrales "REAL" son una decision prudente.

Sin embargo, la auditoria identifica **tres discrepancias concretas** con la literatura citada: (1) el criterio ModDmax usa baseline+0.5 mmol cuando Bishop 1998 especifica el punto anterior a un aumento de **0.4 mmol/L**, no 0.5; (2) la atribucion del umbral de outlier de 0.5 mmol a "Billat 2003" no tiene soporte verificable en ese paper, que trata sobre MLSS y no sobre deteccion de artefactos en tests incrementales; (3) el criterio LT1 de baseline+0.5 mmol es una aproximacion razonable pero Faude 2009 cataloga multiples criterios (baseline+1.0 mmol es el mas citado para LT1 clasico), y la atribucion directa a Faude como fuente del valor 0.5 es imprecisa. Ademas, el sistema aplica smoothing de 3 puntos **antes** de la deteccion, lo cual puede desplazar los umbrales en curvas con pocos escalones.

El sistema tiene buenas protecciones contra fallos (baseline arruinado, umbrales invertidos, fallback con confianza reducida, cap de confianza con pocos puntos), pero presenta modos de fallo conocidos en curvas planas de atletas muy entrenados y en tests con menos de 5 escalones.

---

## Metodo por metodo

### `_method_baseline_rise`

**Implementacion:**
- Suaviza lactatos con moving average de 3 puntos (padding reflectivo).
- Baseline = minimo de los primeros 4 valores suavizados.
- LT1 = primer punto donde `lactato >= baseline + 0.5` Y el siguiente punto no cae mas de 0.25 mmol.
- LT2 = primer punto donde `lactato >= 4.0` O (`lactato >= max(3.2, baseline+1.4)` Y subida >= 0.45 respecto al anterior), verificando que el siguiente punto no cae >0.5 mmol.

**Referencia citada:** Faude, Kindermann & Meyer 2009; Stegmann & Kindermann 1981.

**Evidencia encontrada:**
- Faude et al. (2009) es una revision de 25 conceptos de umbral de lactato. En su Categoria 2, catalogaron metodos que detectan "the first rise in blood lactate above baseline levels". El criterio mas citado en la literatura para LT1 clasico es **baseline + 1.0 mmol/L** (Hagberg & Coyle 1983, Yoshida 1984), no 0.5.
- Sin embargo, fuentes practicas recientes (INSCYD, Running Writings 2025) confirman que **"baseline + 0.5 mM" es un estandar pragmatico** que "works pretty well both in the lab and in the real world" y que un aumento de 0.45 mmol sobre el minimo es el limite para distinguir senal real del error de medicion de analizadores portatiles.
- Stegmann & Kindermann 1981 propusieron el "individual anaerobic threshold" (IAT), un concepto diferente basado en la cinetica de recuperacion, no en baseline+X mmol.

**Veredicto: APROXIMACION RAZONABLE**
El valor de 0.5 mmol es un compromiso pragmatico entre sensibilidad y especificidad, respaldado por la practica moderna y por el margen de error de los analizadores. Pero la atribucion directa a "Faude 2009" es imprecisa: Faude reviso multiples criterios sin prescribir uno especifico. La atribucion a "Stegmann & Kindermann 1981" es incorrecta: ese paper trata sobre IAT, no sobre baseline+X.

**Para LT2:**
- El umbral de 4.0 mmol esta respaldado por Heck et al. (1985), quienes demostraron correlacion con MLSS (R2=0.98) **bajo su protocolo especifico** (escalones de 5 min, incrementos de 0.4 m/s, 30s pausa).
- La verificacion del siguiente punto (caida < 0.5 mmol) para descartar picos transitorios es una heuristica razonable pero **no tiene referencia verificable en Billat 2003**.
- El umbral alternativo de 3.2 mmol con subida >= 0.45 es una heuristica propia sin referencia publicada.

**Veredicto LT2: APROXIMACION RAZONABLE con atribucion parcialmente incorrecta**

---

### `_method_sustained_increase`

**Implementacion:**
- Suaviza lactatos con moving average de 3 puntos.
- LT1 = primer punto donde: `lactato >= baseline + 0.3`, es mayor que el anterior, y el siguiente es >= al actual. Si no se detecta, LT1 = None (no contamina la agregacion).
- LT2 = primer punto donde: `lactato >= max(3.2, baseline+1.4)`, pendiente local >= max(0.45, pendiente_previa + 0.2). Fallback al ultimo punto si no se detecta.

**Referencia citada:** Ninguna explicita en el codigo.

**Evidencia encontrada:**
- El concepto de "primer ascenso sostenido" para LT1 es consistente con el marco de Faude 2009 Categoria 2. El requisito de que el siguiente punto tambien suba es una verificacion de sostenibilidad razonable.
- El criterio de 0.3 mmol sobre baseline para LT1 es mas sensible que el 0.5 del metodo anterior, lo cual puede generar discrepancia entre metodos.
- La deteccion de LT2 por "rotura de pendiente" es conceptualmente similar al metodo de Beaver et al. (1985) y al log-log, pero la implementacion es una simplificacion heuristica.
- El requisito `local_slope >= prior_slope + 0.2` es una regla propia sin referencia publicada.

**Veredicto: APROXIMACION RAZONABLE**
Las heuristicas son fisiologicamente coherentes, pero no replican ningun metodo publicado especifico. La discrepancia en el criterio de LT1 (0.3 vs 0.5 del otro metodo) puede introducir ruido en la agregacion.

---

### `_method_moddmax`

**Implementacion:**
- Requiere minimo 4 candidatos.
- Suaviza lactatos con moving average de 3 puntos.
- Punto de inicio de la linea: primer punto donde `lactato >= baseline_min + 0.5 mmol`.
- Punto final: ultimo punto de la curva.
- Se traza una linea recta entre inicio y final.
- LT2 = punto de maxima desviacion positiva sobre esa linea (no usa polinomio).
- Si la desviacion maxima es <= 0, no retorna nada.
- Solo estima LT2 (no LT1).

**Referencia citada:** Bishop et al. 1998.

**Evidencia encontrada:**
- Bishop et al. (1998) definen el ModDmax como: "the point on the **third order polynomial curve** that yielded the maximal perpendicular distance to the straight line formed by **the point preceding an increase of lactate concentration greater than 0.4 mmol/L** and the final lactate point."
- **Discrepancia 1 (criterio de inicio):** Bishop usa **0.4 mmol/L de incremento entre pasos consecutivos** (busca la subida inter-paso), pero la implementacion usa **baseline_min + 0.5 mmol** (busca nivel absoluto sobre el minimo). Son criterios diferentes. El de Bishop es relativo (diferencia entre dos puntos consecutivos), el implementado es absoluto (distancia al minimo). En la practica pueden coincidir, pero no necesariamente.
- **Discrepancia 2 (polinomio):** Bishop usa un **polinomio de tercer orden** para suavizar la curva y luego calcula la distancia perpendicular desde el polinomio a la linea. La implementacion usa los **datos suavizados con moving average de 3 puntos**, sin ajustar polinomio. Esto simplifica el calculo pero puede dar resultados diferentes, especialmente en curvas irregulares.
- **Discrepancia 3 (distancia):** Bishop calcula la **distancia perpendicular** desde el polinomio a la linea. La implementacion calcula la **diferencia vertical** (lactato_suavizado - valor_linea). En lineas con pendiente no trivial, la distancia perpendicular y la diferencia vertical dan resultados distintos.

**Veredicto: CONTRADICE PARCIALMENTE LA EVIDENCIA**
La implementacion se inspira en el concepto de ModDmax pero difiere en tres aspectos tecnicos del paper original: criterio de inicio (0.5 abs vs 0.4 inter-paso), ajuste de curva (moving average vs polinomio 3er orden), y calculo de distancia (vertical vs perpendicular). En la mayoria de los casos dara resultados similares, pero en curvas con escalones irregulares o con meseta inicial prolongada, las diferencias pueden ser significativas.

---

### `_aggregate_threshold`

**Implementacion:**
- Lactato final = **media** de los lactatos de todos los metodos validos.
- Ritmo/Potencia/FC final = **mediana** de los valores de todos los metodos.
- Agreement score = 0.6 * media_confianzas + 0.4 * acuerdo_en_lactato.
- Confianza final = 0.7 * mejor_confianza + 0.3 * agreement_score.
- Si solo hay 1 metodo: agreement = 0.25 (penalizacion explicita).

**Referencia citada:** Billat 2003 para uso de mediana; Faude 2009 para requerir convergencia de >= 2 metodos.

**Evidencia encontrada:**
- Faude et al. (2009) efectivamente senalan que la validez de un umbral requiere convergencia de metodos, aunque no prescriben un metodo de agregacion especifico.
- Billat 2003 ("The Concept of MLSS") es un review sobre MLSS, no trata sobre agregacion de metodos de umbral ni sobre el uso de media vs mediana para combinar estimaciones.
- El uso de media para lactato y mediana para ritmo/potencia/FC es una decision pragmatica. La mediana para ritmo es correcta: evita que un metodo outlier arrastre el resultado a un ritmo inexistente. La media para lactato es razonable si los metodos estan calibrados similarmente.
- El acuerdo entre metodos de umbral de lactato es generalmente bajo (Jamnick 2018: ICC variable, Lin's CCC revela falta de acuerdo entre metodos visuales, Dmax, y ModDmax).

**Veredicto: APROXIMACION RAZONABLE, atribucion a Billat 2003 sin soporte**
La estrategia de agregacion es pragmatica y defensiva. La atribucion a Billat 2003 para justificar el uso de mediana es incorrecta.

---

### `_detect_real_thresholds`

**Implementacion:**
Gates conservadores para publicar umbrales "REAL":
- Minimo 5 etapas con lactato (`_REAL_MIN_STAGES = 5`)
- Confianza individual >= 0.75 (`_REAL_MIN_CONFIDENCE`)
- Agreement score >= 0.62 (`_REAL_MIN_AGREEMENT`)
- Monotonicity >= 0.60 (`_REAL_MIN_MONOTONICITY`)
- Protocol score >= 0.68 (`_REAL_MIN_PROTOCOL_SCORE`)
- Signal score >= 0.70 (`_REAL_MIN_SIGNAL_SCORE`)
- Requiere que dos metodos de familias diferentes converjan con acuerdo en lactato (<= 0.6 mmol) Y en carga (<= 4% potencia o <= 15 s/km ritmo).
- LT1 practico REAL = LT1_real - 0.3 mmol (interpolado).
- LT2 practico REAL = LT2_real - 0.5 mmol (interpolado).

**Referencia citada:** "Principio de conservadurismo cientifico (Faude et al. 2009)."

**Evidencia encontrada:**
- Faude 2009 efectivamente recomienda cautela en la interpretacion de umbrales, pero no prescribe valores numericos para gates de calidad como 0.75, 0.62, o 0.60.
- El requisito de convergencia entre dos metodos de familias diferentes es una practica solida, alineada con el espiritu de la literatura.
- Los valores de 0.3 mmol (offset LT1 practico) y 0.5 mmol (offset LT2 practico) son decisiones propias del sistema sin referencia publicada directa. Son heuristicas de "margen de seguridad".
- El concepto de "LT practico" (entrenar por debajo del umbral real) esta alineado con la practica del modelo noruego (Ingebrigtsen: entrenar a ~3 mmol vs 4 mmol de OBLA).

**Veredicto: APROXIMACION RAZONABLE**
Los gates son conservadores y bien estructurados. Los valores numericos son decisiones de ingenieria razonables, no replicaciones de valores publicados. La atribucion generica a Faude 2009 es aceptable como marco conceptual pero no como fuente de los valores especificos.

---

## Constantes y thresholds

### `baseline + 0.5 mmol` (LT1 en baseline_rise)

| Aspecto | Detalle |
|---|---|
| Valor implementado | +0.5 mmol sobre el minimo de los primeros 4 valores suavizados |
| Atribucion | Faude, Kindermann & Meyer 2009; Stegmann & Kindermann 1981 |
| Evidencia real | INSCYD y Running Writings (2025) usan "baseline + 0.5 mM" como estandar pragmatico. INSCYD establece 0.45 mmol como limite para distinguir senal real del error de analizadores. Faude 2009 cataloga el criterio de "+1.0 mmol" como el clasico (Hagberg & Coyle 1983). |
| Veredicto | **APROXIMACION RAZONABLE** — valor pragmatico bien fundamentado en la practica, pero la atribucion a Faude 2009 y Stegmann 1981 es imprecisa |

### `4.0 mmol` (OBLA en baseline_rise LT2)

| Aspecto | Detalle |
|---|---|
| Valor implementado | LT2 candidato si lactato >= 4.0 mmol |
| Atribucion | Implicita (Heck et al. 1985) |
| Evidencia real | Heck et al. 1985 demostraron correlacion con MLSS (R2=0.98) bajo protocolo especifico: escalones de 5 min, incremento 0.4 m/s, pausas de 30s, treadmill 1%. **Critico:** el valor de 4 mmol solo es valido bajo ese protocolo exacto. Con escalones mas cortos o diferentes incrementos, el umbral puede ser 2-8 mmol segun el individuo (Billat 2003, Stegmann 1981). |
| Veredicto | **CORRECTO como referencia operativa** pero **POTENCIALMENTE PELIGROSO** si se aplica a datos de protocolos no-Heck. El sistema mitiga parcialmente esto con el metodo alternativo de "aceleracion de pendiente". |

### `0.5 mmol` caida maxima para validar punto (outlier threshold)

| Aspecto | Detalle |
|---|---|
| Valor implementado | Si el punto siguiente cae > 0.5 mmol, se descarta como pico transitorio |
| Atribucion | Billat et al. 2003 |
| Evidencia real | Billat 2003 ("The Concept of MLSS", Sports Med 33:407-426) trata sobre MLSS, definido como la carga maxima donde el lactato no sube > 1 mmol/L entre min 10 y min 30. **No contiene criterios de deteccion de picos transitorios ni el valor de 0.5 mmol como umbral de outlier en tests incrementales.** |
| Veredicto | **SIN EVIDENCIA** — la heuristica de 0.5 mmol es razonable (coincide con el error tipico de analizadores portatiles) pero la atribucion a Billat 2003 es incorrecta. No se ha encontrado ninguna referencia publicada para este criterio especifico. |

### `3.2 mmol` (umbral alternativo LT2 en baseline_rise)

| Aspecto | Detalle |
|---|---|
| Valor implementado | LT2 candidato si lactato >= max(3.2, baseline+1.4) y subida >= 0.45 |
| Atribucion | Ninguna |
| Evidencia real | Algunos autores proponen 3.5 mmol como alternativa al 4.0 para poblaciones entrenadas. El valor de 3.2 no tiene referencia publicada directa. |
| Veredicto | **SIN EVIDENCIA DIRECTA** — es una heuristica propia razonable como complemento al criterio de 4.0 mmol |

### `3.1 mmol` (practical_lt2_target en dynamic threshold engine)

| Aspecto | Detalle |
|---|---|
| Valor implementado | Ancla conservadora universal para LT2 practico |
| Atribucion | Decision propia documentada en MEMORY.md |
| Evidencia real | El modelo noruego (Ingebrigtsen) entrena en torno a 2-3 mmol. La variabilidad individual de MLSS va de 2-8 mmol (Billat 2003). Un ancla fija de 3.1 es conservadora para la mayoria de poblaciones pero puede ser alta para atletas de elite con MLSS bajo o baja para atletas con MLSS alto. |
| Veredicto | **APROXIMACION RAZONABLE** — como ancla universal es aceptable, con la salvedad de que el entrenador debe ajustar |

### `baseline_min + 0.5 mmol` (inicio de linea ModDmax)

| Aspecto | Detalle |
|---|---|
| Valor implementado | La linea del ModDmax comienza en el primer punto >= baseline_min + 0.5 |
| Atribucion | Bishop et al. 1998 |
| Evidencia real | Bishop 1998 define el inicio como "the point **preceding** an increase of lactate concentration greater than **0.4 mmol/L**" — es decir, busca un incremento **inter-paso** de 0.4, no un nivel absoluto de baseline+0.5. |
| Veredicto | **CONTRADICE LA EVIDENCIA** — el criterio es conceptualmente diferente (absoluto vs relativo). En la practica a menudo coinciden, pero en curvas con meseta inicial prolongada seguida de subida brusca, el resultado puede diferir significativamente. |

### `_BASELINE_ARRUINADO_THRESHOLD = 3.0 mmol`

| Aspecto | Detalle |
|---|---|
| Valor implementado | Si el lactato minimo basal > 3.0, el test se invalida |
| Atribucion | Ninguna |
| Evidencia real | Un basal > 3.0 mmol indica que el atleta no partio de reposo metabolico. No hay un valor canonico publicado, pero 3.0 es conservador y razonable. Algunos labs usan 2.5, otros 2.0. |
| Veredicto | **APROXIMACION RAZONABLE** — podria ser incluso demasiado permisivo. Un basal de 2.5-3.0 ya es sospechoso. |

---

## Edge cases y puntos de fallo

### 1. Curvas planas en atletas muy entrenados
**Riesgo: ALTO**
Un atleta con LT2 a 3.5 mmol y baseline de 0.8 mmol tendra una curva que apenas supera 3.2 o 4.0. Los metodos baseline_rise y sustained_increase pueden no detectar LT2, cayendo al fallback (ultimo punto). ModDmax puede funcionar si la desviacion es positiva, pero con moving average en vez de polinomio, la sensibilidad es menor.

### 2. Tests con 3-4 escalones
**Riesgo: ALTO**
Con 3 puntos, el moving average de 3 puntos aplica pero el polinomio implicito tiene poca resolucion. El sistema mitiga con cap de confianza (3 puntos -> max 0.45, 4 puntos -> max 0.60), pero el umbral estimado puede estar muy desplazado. ModDmax requiere minimo 4 candidatos y 3 en el subset, lo cual a menudo falla.

### 3. Smoothing desplaza umbrales
**Riesgo: MEDIO**
El moving average de 3 puntos con padding reflectivo puede desplazar un umbral abrupto. Ejemplo: si el lactato salta de 1.5 a 3.5 entre escalon 4 y 5, el suavizado reducira el pico a ~2.8 y aumentara el escalon 4 a ~2.2, desplazando la deteccion. En curvas con pocos puntos este efecto es mas pronunciado.

### 4. LT1 inconsistente entre metodos
**Riesgo: MEDIO**
baseline_rise usa +0.5 mmol, sustained_increase usa +0.3 mmol. Con un baseline de 1.0, baseline_rise detecta LT1 a 1.5 mmol, sustained_increase a 1.3 mmol. La agregacion por media/mediana promediara, pero la discrepancia sistematica reduce la utilidad del agreement score.

### 5. Protocolo no-estandar
**Riesgo: MEDIO-ALTO**
El sistema acepta cualquier duracion de escalon y cualquier pausa. El criterio de 4 mmol (Heck 1985) solo esta validado para escalones de 5 minutos. Con escalones de 3 minutos, el lactato se acumula mas lento y el umbral real puede estar en 3-3.5 mmol. El sistema mitiga parcialmente con `_interval_protocol_score()`, pero este no ajusta los umbrales fijos.

### 6. Lactato contextual = lactato medido
**Riesgo: BAJO (decisional)**
El sistema tiene contextualizacion desactivada (`rules: {"contextualization": "disabled"}`). Esto significa que no se aplica ningun ajuste por delay de muestra. Es conservador: mejor no ajustar que ajustar mal. Pero implica que muestras con delay > 60s pueden subestimar el lactato real.

### 7. Fallback al ultimo punto para LT2
**Riesgo: MEDIO**
Si ningun metodo detecta LT2, baseline_rise y sustained_increase caen al ultimo punto con confianza * 0.4. Esto puede ser un valor muy alto (sprint final) que no representa LT2 real. El sistema lo marca correctamente como fallback y reduce confianza, lo cual mitiga el riesgo.

---

## Evidencia adicional encontrada

### Jamnick et al. 2018 (PLoS ONE)
- Evaluaron 56 umbrales de lactato (14 metodos x 4 protocolos) contra MLSS en 17 ciclistas.
- **Hallazgo clave:** El Log-Poly-ModDmax del GXT de 4 minutos fue el mejor estimador de MLSS (MD = 1.1 W, ICC = 0.96). Muchos metodos tradicionales no fueron validos.
- **Implicacion para el sistema:** La implementacion actual usa un ModDmax simplificado (sin polinomio, sin distancia perpendicular). El metodo completo de Jamnick seria significativamente mas preciso.

### Heck et al. 1985
- 4.0 mmol correlaciona con MLSS solo bajo protocolo especifico.
- Variabilidad inter-individual de MLSS: 2-8 mmol/L (Billat 2003).
- **Implicacion:** Usar 4.0 como umbral fijo es peligroso sin validacion del protocolo.

### Faude et al. 2009
- Revision de 25 conceptos de umbral. Correlacion mediana r = 0.84-0.92 con rendimiento en distancias > 5km.
- Recomiendan que la validez requiere convergencia de metodos.
- **No prescriben valores especificos** para gates de calidad.

### INSCYD (practica comercial 2025)
- Usan baseline + 0.45 mmol como umbral minimo de deteccion de LT1 considerando error de medicion de analizadores.
- Estandarizan automaticamente a pasos de 6 minutos.
- **Implicacion:** Confirma que 0.5 es razonable, y sugiere que normalizar por duracion de paso seria una mejora.

---

## Recomendaciones priorizadas por riesgo

### CRITICO (corregir)

**R1. Corregir implementacion de ModDmax (Bishop 1998)**
- Cambiar criterio de inicio de `baseline_min + 0.5` a buscar el punto que precede a un incremento inter-paso >= 0.4 mmol/L, como describe Bishop.
- Considerar ajustar polinomio de 3er orden en vez de usar moving average.
- Considerar distancia perpendicular en vez de diferencia vertical.
- *Impacto:* mejora precision de LT2 en curvas irregulares.

**R2. Corregir atribuciones incorrectas**
- Eliminar atribucion a "Billat 2003" para el umbral de outlier de 0.5 mmol. Documentar como "heuristica propia basada en el error tipico de analizadores portatiles (~0.3-0.5 mmol, INSCYD 2025)".
- Corregir atribucion de LT1 baseline+0.5 de "Faude 2009" a "practica clinica estandar (INSCYD; Running Writings 2025), compatible con Faude 2009 Categoria 2".
- Eliminar atribucion a "Stegmann & Kindermann 1981" que trata sobre IAT, no baseline+X.

### ALTO (mejorar)

**R3. Armonizar criterio LT1 entre metodos**
- baseline_rise usa +0.5, sustained_increase usa +0.3. La discrepancia sistematica genera ruido en la agregacion. Considerar unificar a +0.5 (el valor mejor respaldado) o documentar explicitamente por que difieren.

**R4. Ajustar umbral fijo de 4.0 mmol segun duracion de paso**
- Heck 1985 valido solo para pasos de 5 min. Con pasos de 3 min, considerar 3.5 mmol. Con pasos de 8 min, 4.5 mmol. El `_interval_protocol_score` ya pondera la confianza, pero no ajusta el umbral en si.

**R5. Evaluar impacto del smoothing en curvas cortas**
- El moving average de 3 puntos puede desplazar umbrales significativamente con 4-5 puntos. Considerar no aplicar smoothing cuando `len(candidates) <= 5`, o usar un kernel mas suave.

### MEDIO (considerar)

**R6. Implementar ModDmax completo (Jamnick 2018)**
- Usar polinomio de 3er orden + distancia perpendicular + el criterio Log-Poly si hay suficientes puntos. El beneficio seria mayor precision en LT2.

**R7. Anadir test de protocolo para umbral fijo**
- Antes de aplicar el criterio de 4.0 mmol, verificar que la duracion media de paso sea >= 4 minutos. Si no, emitir warning de que el 4.0 puede no aplicar.

**R8. Documentar que el baseline arruinado de 3.0 podria ser 2.5**
- Un basal de 2.5-3.0 ya es sospechoso. Considerar warning (no invalidacion) a partir de 2.0, e invalidacion a partir de 2.5.

### BAJO (mejora incremental)

**R9. Considerar ventana de baseline adaptativa**
- Actualmente se usan los primeros 4 puntos. En tests con escalones iniciales muy suaves (velocidad baja), el minimo podria estar en el punto 5 o 6. Una ventana adaptativa que busque el minimo global en la primera mitad seria mas robusta.

**R10. Explorar ponderacion por confianza en la media de lactato**
- Actualmente la media de lactato es simple (no ponderada). Ponderar por la confianza de cada metodo daria mas peso al metodo mas fiable.

---

## Tabla resumen de veredictos

| Elemento | Veredicto | Riesgo |
|---|---|---|
| LT1 baseline+0.5 (Faude 2009) | APROXIMACION RAZONABLE, atribucion imprecisa | Bajo |
| LT2 >= 4.0 mmol (Heck 1985) | CORRECTO bajo protocolo especifico | Medio-Alto |
| LT2 verificacion siguiente punto (Billat 2003) | SIN EVIDENCIA para la atribucion | Bajo |
| ModDmax criterio inicio (Bishop 1998) | CONTRADICE PARCIALMENTE | Alto |
| ModDmax sin polinomio | CONTRADICE PARCIALMENTE | Medio |
| ModDmax diferencia vertical vs perpendicular | CONTRADICE PARCIALMENTE | Bajo |
| Agregacion media(lactato) + mediana(ritmo) | APROXIMACION RAZONABLE | Bajo |
| Gates conservadores REAL | APROXIMACION RAZONABLE | Bajo |
| Baseline arruinado 3.0 mmol | APROXIMACION RAZONABLE | Bajo |
| LT2 practico 3.1 mmol | APROXIMACION RAZONABLE | Bajo |
| Smoothing 3 puntos pre-deteccion | NO EVALUADO en literatura | Medio |

---

## Fuentes consultadas

- [Faude, Kindermann & Meyer 2009 - Lactate Threshold Concepts](https://pubmed.ncbi.nlm.nih.gov/19453206/)
- [Bishop et al. 1998 - Lactate parameters in female cyclists](https://pubmed.ncbi.nlm.nih.gov/9710868/)
- [Jamnick et al. 2018 - GXT variables affect LT validity](https://pmc.ncbi.nlm.nih.gov/articles/PMC6066218/)
- [Billat et al. 2003 - The Concept of MLSS](https://pubmed.ncbi.nlm.nih.gov/12744715/)
- [Heck et al. 1985 - Justification of the 4 mmol/L threshold](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2022.899670/full)
- [Standardization of the Dmax Method (2015)](https://pubmed.ncbi.nlm.nih.gov/25710184/)
- [ModDmax reliability in cross-country skiers](https://pubmed.ncbi.nlm.nih.gov/20508457/)
- [INSCYD - LT1 Misconceptions](https://inscyd.com/article/lt1-misconceptions/)
- [INSCYD - LT1 Whitepaper](https://inscyd.com/whitepaper/lactate-threshold-1/)
- [Running Writings 2025 - Guide to LT1](https://runningwritings.com/2025/02/runners-guide-to-lt1.html)
- [Repeatability and predictive value of LT concepts (PLoS ONE 2018)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0206846)
- [Does the anaerobic threshold really occur at 4 mmol/L? (INSCYD)](https://inscyd.com/article/anaerobic-threshold-4mmol-lactate/)
- [Cheng et al. 1992 - Original Dmax method](https://pubmed.ncbi.nlm.nih.gov/1459746/)
- [Stegmann & Kindermann 1981 - Individual Anaerobic Threshold](https://pubmed.ncbi.nlm.nih.gov/8509241/)
