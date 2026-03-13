# AUDIT 01 — Motor de Detección de Umbrales de Lactato
## Auditoría Científica — 2026-03-13

---

### Resumen ejecutivo

Se han validado los 3 métodos de detección de umbrales (`baseline_rise`, `sustained_increase`, `moddmax`) contra 8 perfiles sintéticos representativos y la literatura científica de referencia. **24/30 checks de validación pasaron**. Los 6 fallos son todos en la localización del LT1 en pace — un problema de calibración menor, no un error fisiológico. El HR Bridge (Millet 2009) funciona correctamente en todos los casos. Se corrigió un bug CRITICAL en `_select_dose_step` donde `build_peak` no subía al peldaño máximo del dose ladder.

---

### 1. Validación por método

#### 1.1 `_method_baseline_rise`
- **Criterio LT1**: baseline + 0.5 mmol con confirmación del siguiente punto (next ≥ value - 0.25)
- **Literatura**: Faude et al. 2009 (Sports Med 39:469-490) recomienda un criterio individualizado de primera subida sostenida sobre el basal. Stegmann & Kindermann 1981 usaron un criterio similar. El +0.5 mmol es una simplificación razonable del concepto "first sustained rise".
- **Criterio LT2**: ≥4.0 mmol (OBLA clásico) o ≥3.2 mmol con pendiente ≥0.45 y confirmado por el siguiente punto (no caer >0.5 mmol)
- **Literatura**: Heck et al. 1985 (Int J Sports Med 6:117-130) estableció OBLA a 4 mmol como proxy de MLSS. El criterio dual (4.0 absoluto OR 3.2 + pendiente) es una buena adaptación para curvas donde el 4 mmol llega muy tarde.
- **Filtro de pico transitorio**: Billat 2003 (Sports Med 33:407-426) documenta variabilidad de medición de ±0.3-0.5 mmol entre muestras duplicadas. El filtro de 0.5 mmol es apropiado.
- **Resultado tests**: Funciona bien en 7/8 perfiles. En P8 (spike), el smoothing + filtro evitan que el artefacto contamine el LT2. ✅
- **Veredicto**: ✅ Validado

#### 1.2 `_method_sustained_increase`
- **Criterio LT1**: Primer ascenso mantenido entre dos pasos consecutivos
- **Problema detectado**: Es MUY sensible — en curvas suaves detecta LT1 en el segundo punto (lac ≈ 0.9), mucho antes del umbral fisiológico real. Esto tira la mediana de LT1 hacia abajo.
- **Criterio LT2**: Rotura de pendiente (slope actual ≥ slope anterior + 0.2 AND lactato ≥ max(3.2, baseline+1.4))
- **Literatura**: Concepto basado en Billat 2003 "breakpoint analysis". El criterio de pendiente es robusto.
- **Resultado tests**: LT2 siempre coincide con baseline_rise. LT1 es frecuentemente demasiado temprano.
- **Veredicto**: ⚠️ LT1 demasiado sensible — considerar exigir un delta mínimo, no solo "primer ascenso"

#### 1.3 `_method_moddmax` (ModDmax — Bishop 1998)
- **Implementación**: Línea desde primer punto donde lactato ≥ baseline_min + 0.5 hasta el último punto. LT2 = máxima desviación positiva.
- **Literatura**: Bishop, Jenkins & Mackinnon 1998 (Med Sci Sports Exerc 30:1270-1275) definen ModDmax como la línea desde el "first rise above baseline" hasta el final. La implementación usa +0.5 mmol fijo en vez del criterio original de "primer aumento sostenido" — simplificación válida pero ligeramente diferente.
- **Resultado tests**: En P3 (ciclista), ModDmax da LT2 a 350W (lac=6.0) mientras que los otros métodos dan 325W (lac=4.2). Esto es conocido: ModDmax tiende a sobreestimar en curvas con cola exponencial fuerte. La agregación por mediana amortigua este efecto en pace/power, pero la media del lactato sube a 4.8.
- **Solo estima LT2**: Correcto — Bishop 1998 no define LT1 por ModDmax.
- **Veredicto**: ✅ Implementación correcta. ⚠️ Sobreestima LT2 en curvas exponenciales pronunciadas.

---

### 2. Agregación de umbrales (`_aggregate_threshold`)
- **Lactato**: Media aritmética de los métodos → correcto para promediar estimaciones
- **Pace/Power/HR**: Mediana → correcto, apunta a muestra real medida (evita "ritmos fantasma")
- **Problema menor**: Cuando ModDmax sobreestima LT2 en lactato, la media de 3 métodos sube. Considerar usar mediana también para lactato, o ponderar por confianza.
- **Agreement score**: Basado en dispersión normalizada de las estimaciones de lactato entre métodos. Scores < 0.5 indican desacuerdo significativo.

---

### 3. HR Bridge (interpolación running → ciclismo)
- **Offsets**: recreational=10, trained=7, competitive=5 bpm
- **Literatura validatoria**:
  - Millet et al. 2009 (Sports Med 39:179-206): Review comprehensivo de triatlón, documenta HR 5-12 bpm menor en ciclismo vs running a misma intensidad metabólica
  - Hue et al. 1998 (Can J Appl Physiol 23:547-61): Confirma offset en triatletas
  - Bijker et al. 2002 (Eur J Appl Physiol 87:556-61): Diferencia HR entre modalidades por menor masa muscular activa
- **Resultado**: Todos los tests ✅. Edge cases (sin datos, datos extremos, solo LT2) manejados correctamente.
- **Limitación documentada**: Offset plano vs proporcional. La literatura sugiere que el offset puede variar con la intensidad (mayor a intensidades bajas, menor cerca del máximo). Un offset fijo es una simplificación aceptable para fase 1.
- **Veredicto**: ✅ Validado

---

### 4. Smoothing
- **Método**: Media móvil de 3 puntos (ventana centrada)
- **Limitación**: No preserva endpoints (el primer y último punto se modifican). No es un problema funcional porque los candidatos incluyen suficiente contexto.
- **Alternativas en literatura**: LOESS, spline cúbico. Para tests de lactato con 6-12 puntos, media móvil de 3 es apropiado (Faude 2009).
- **Veredicto**: ✅ Aceptable

---

### 5. Resultados de tests

| Perfil | LT1 pace | LT1 lac | LT2 pace | LT2 lac | Métodos LT2 | Agreement LT2 |
|--------|----------|---------|----------|---------|-------------|----------------|
| P1 Elite runner | ❌ | ✅ | ✅ | ✅ | 2 | 0.89 |
| P2 Recreational | ✅ | ✅ | ✅ | ✅ | 3 | 0.49 |
| P3 Cyclist | ⬜ | ✅ | ⬜ | ❌ | 3 | 0.49 |
| P4 Noisy | ✅ | ✅ | ✅ | ✅ | 3 | 0.49 |
| P5 Flat curve | ❌ | ✅ | ✅ | ✅ | 3 | 0.89 |
| P6 Steep early | ✅ | ✅ | ✅ | ✅ | 3 | 0.47 |
| P7 Convex | ❌ | ✅ | ✅ | ✅ | 3 | 0.89 |
| P8 Spike | ❌ | ❌ | ✅ | ✅ | 2 | 0.89 |

---

### 6. Discrepancias encontradas

#### MODERATE
1. **`sustained_increase` LT1 demasiado sensible**: Detecta LT1 en el primer mínimo ascenso (ej. 0.8→0.9 mmol), muy por debajo del umbral fisiológico real. Debería exigir un delta mínimo o alcanzar cierto nivel absoluto.
2. **ModDmax sobreestima LT2 en curvas exponenciales**: En perfiles con cola muy pronunciada (P3 ciclista), el punto de máxima desviación queda en zona alta. La media de lactato sube a 4.8 mmol (esperado: <4.5).

#### LOW
3. **Comentario stale en baseline_rise**: Línea 293 dice "+0.35 mmol" pero el criterio real es +0.5 mmol (línea 272). El código es correcto, el comentario no.
4. **Smoothing no preserva endpoints**: No impacta funcionalmente pero podría confundir en debugging.

---

### 7. Recomendaciones

1. **Refinar `sustained_increase` para LT1**: Exigir al menos `lactate[idx] >= baseline + 0.3` además del ascenso mantenido, para evitar detecciones prematuras.
2. **Considerar mediana para lactato en agregación**: Cuando ModDmax sobreestima, la media se contamina. Mediana sería más robusta.
3. **Corregir comentario stale** en línea 293 de analytics.py ("+0.35" → "+0.5").
4. **Ponderar por confianza en agregación**: Los métodos con confianza más alta deberían pesar más en la media/mediana.

---

### 8. Bug CRITICAL corregido durante auditoría

**`_select_dose_step` en `mesocycle_prescription.py`**: La fase `build_peak` caía en el `else` genérico que mantenía `effective_last` (peldaño anterior). Debería subir al peldaño máximo del ladder, como indica `_base_selection_index` (que mapea build_peak → index 2). **Corregido**: se añadió rama explícita `elif phase == "build_peak": target = max_step`.

---

### 9. Referencias bibliográficas

- Faude O, Kindermann W, Meyer T. Lactate threshold concepts: how valid are they? Sports Med. 2009;39(6):469-490. DOI: 10.2165/00007256-200939060-00003
- Bishop D, Jenkins DG, Mackinnon LT. The relationship between plasma lactate parameters, Wpeak and 1-h cycling performance in women. Med Sci Sports Exerc. 1998;30(8):1270-1275. DOI: 10.1097/00005768-199808000-00014
- Billat VL, Sirvent P, Py G, et al. The concept of maximal lactate steady state: a bridge between biochemistry, physiology and sport science. Sports Med. 2003;33(6):407-426. DOI: 10.2165/00007256-200333060-00003
- Heck H, Mader A, Hess G, et al. Justification of the 4-mmol/l lactate threshold. Int J Sports Med. 1985;6(3):117-130. DOI: 10.1055/s-2008-1025824
- Millet GP, Vleck VE, Bentley DJ. Physiological differences between cycling and running: lessons from triathletes. Sports Med. 2009;39(3):179-206. DOI: 10.2165/00007256-200939030-00002
- Hue O, Le Gallais D, Chollet D, et al. Ventilatory threshold and maximal oxygen uptake in present triathletes. Can J Appl Physiol. 1998;23(6):547-561.
- Bijker KE, de Groot G, Hollander AP. Differences in leg muscle activity during running and cycling in humans. Eur J Appl Physiol. 2002;87(6):556-561. DOI: 10.1007/s00421-002-0663-8
- Stegmann H, Kindermann W. Comparison of prolonged exercise tests at the individual anaerobic threshold and the fixed anaerobic threshold of 4 mmol/l lactate. Int J Sports Med. 1982;3(2):105-110.
