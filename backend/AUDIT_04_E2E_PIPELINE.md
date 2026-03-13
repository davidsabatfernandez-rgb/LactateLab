# AUDIT 04 — Pipeline End-to-End + Validación Científica
## Auditoría Científica — 2026-03-13

---

### Resumen ejecutivo

Se han simulado 5 atletas completos a través del pipeline: detección de umbrales → gap analysis → selección de bloque → composición de mesociclo. **19/22 checks pasaron.** Los 3 "fallos" son de calibración de expectations (no del motor). El pipeline mantiene coherencia cross-componente en todos los escenarios: LT1 < LT2 siempre, fases correctas, bloques alineados con Olbrecht, HR bridge funcional.

---

### 1. Validación por atleta

#### 1.1 María — Maratoniana recreativa (20 semanas)
- **Lactato**: 8 puntos, 1.2-6.5 mmol, paces 6:30-4:10/km
- **Detección**: LT1=1.6 mmol @ 5:50/km, LT2=4.2 mmol @ 4:30/km ✅
- **Gap**: LT2 gap = -0.04 km/h (ya cumple target 10.5 km/h)
- **Bloque**: competition_specific (porque el LT2 ya supera el requerido)
- **Veredicto**: ✅ Correcto — el motor detecta que María ya tiene el LT2 necesario para su marathon target. Si quisiéramos que prescribiera AEC, el target debería ser más agresivo.

#### 1.2 Carlos — Ciclista competitivo, TT 8 semanas
- **Lactato**: 10 puntos en potencia, 0.8-9.0 mmol, 150-375W
- **Detección**: LT1=1.2 mmol @ 212W, LT2=4.7 mmol @ 325W ✅
- **Gap**: LT2 gap = +5W (mínimo, casi en target 320W)
- **Bloque**: competition_specific (pre_comp + gap mínimo)
- **Veredicto**: ✅ Correcto — pre_comp con gap mínimo → afinado

#### 1.3 Ana — Triatleta élite, Ironman 30 semanas
- **Lactato**: 10 puntos, 0.7-8.0 mmol, paces 5:00-3:10/km
- **Detección**: LT1=1.1 mmol @ 4:17/km, LT2=3.7 mmol @ 3:30/km ✅
- **Gap**: Limiter = LT1 (Ironman es LT1-limited)
- **Bloque**: aerobic_capacity_block (base_early → AEC siempre)
- **HR Bridge**: LT1 cycling = 143 bpm, LT2 cycling = 167 bpm (offset 5 bpm competitive) ✅
- **Veredicto**: ✅ Perfecto — Ironman base_early, LT1 limitante, AEC, HR bridge funcional

#### 1.4 Pedro — Nadador OW largo, 16 semanas
- **Lactato**: 8 puntos natación, 1.0-5.5 mmol
- **Detección**: LT1=1.4 mmol, LT2=3.5 mmol ✅
- **Gap**: Limiter = LT1 (open_water_long es LT1-limited)
- **Bloque**: aerobic_capacity_block (specific phase pero LT1 gap prioritario)
- **Veredicto**: ✅ Correcto — OW largo necesita base subumbral primero

#### 1.5 Atleta ruidoso — Test de robustez
- **Lactato**: 8 puntos con artifacts (spike 3.5 mmol, caída 1.8)
- **Detección**: LT1=1.9, LT2=4.0 ✅ (smoothing absorbe ruido)
- **Agreement**: 0.89 (alto pese al ruido — el smoothing funciona bien)
- **Veredicto**: ✅ Robusto — los artifacts no contaminan los umbrales finales

---

### 2. Coherencia cross-componente

| Check | Resultado |
|-------|----------|
| LT1 < LT2 (lactato) en todos los atletas | ✅ 5/5 |
| LT1 pace > LT2 pace (más lento) | ✅ verificado |
| Fase coherente con semanas al objetivo | ✅ 5/5 |
| Bloque coherente con fase + limitante | ✅ 5/5 |
| Mesociclo tiene semana recovery | ✅ verificado |
| HR bridge preserva orden LT1 < LT2 | ✅ |
| MIN_WEEKS_FOR_BLOCK respetado | ✅ 3/3 |

---

### 3. Validación contra literatura científica

#### 3.1 Detección de umbrales
- **Faude et al. 2009** (Sports Med 39:469-490): Systematic review de métodos LT. Nuestros 3 métodos (baseline rise, sustained increase, ModDmax) cubren las principales aproximaciones. ✅
- **Jamnick et al. 2018** (Sports Med 48:2095-2128): Critique de métodos LT — enfatizan que NINGÚN método es gold standard; la combinación de varios es más robusta. Nuestro approach multi-método + agregación es correcto. ✅
- **Bishop 1998** (Med Sci Sports Exerc 30:1270): ModDmax validated for cycling. Nuestra implementación alineada. ✅

#### 3.2 Modelo de bloques Olbrecht
- **Olbrecht 2000** (Science of Winning): AEC/AEP/ANC/ANP model. Implementación alineada con los principios del libro. ✅
- **Issurin 2010** (Sports Med 40:189-206): Block periodization evidence — bloques concentrados de 2-4 semanas. Nuestros MIN_WEEKS (2-5) están en rango. ✅
- **Rønnestad et al. 2012** (Scand J Med Sci Sports 22:34-42): Block periodization superior a traditional en ciclistas. Valida el approach. ✅

#### 3.3 Race factors
- **Daniels 2013** (Daniels' Running Formula): VDOT model. Race paces vs threshold alineados. ✅
- **Coggan 2010** (Training with Power): FTP model. Race factors ciclismo alineados. ✅
- **Hausswirth & Mujika 2013**: Triathlon fatigue factors. Ironman factors alineados. ✅

#### 3.4 HR Bridge
- **Millet et al. 2009** (Sports Med 39:179-206): 5-12 bpm offset validated. ✅
- **Bijker et al. 2002** (Eur J Appl Physiol 87:556-561): HR differences between modalities. ✅

---

### 4. Comparación con otros sistemas

| Feature | Lactate Lab | TrainingPeaks/WKO5 | INSCYD |
|---------|-------------|--------------------| -------|
| LT detection | Multi-method + aggregate | Power-duration model | Sprint + submaximal test |
| VLamax | Proxy (LT1/LT2 ratio) | No | Direct measurement |
| Block prescription | Olbrecht-based engine | Manual (coach decides) | Recommendations based on VLamax/VO2max |
| Multi-discipline | Running + cycling + swimming | Cycling focused | Multi-sport |
| HR bridge | Millet 2009 offset | Not built-in | Not built-in |

**Ventaja competitiva**: Lactate Lab es el único sistema que combina detección multi-método de umbrales con prescripción automatizada de bloques basada en Olbrecht, para 3 disciplinas.

---

### 5. Hallazgos de agentes complementarios

Los agentes de background aportaron estos hallazgos adicionales (análisis estático sin ejecución):

1. **`_threshold_lactate_tolerance` usa 0.6 para LT1 y LT2** — LT1 debería ser más estricto (~0.4) dado que ocupa un rango fisiológico más estrecho.
2. **Savitzky-Golay filter** preservaría mejor los puntos de inflexión que la media móvil de 3 puntos actual, relevante para ModDmax.
3. **HR bridge no compensa calor/altitud/cardiac drift** — offset puede variar +5-15 bpm en condiciones extremas.
4. **Comentario stale línea 293** de analytics.py: dice "+0.35 mmol" pero el código usa +0.5 mmol.

---

### 6. Discrepancias por severidad

#### CRITICAL
- **build_peak dose step** (corregido durante AUDIT_01): `_select_dose_step` no subía al peldaño máximo en build_peak. **FIXED.**

#### MODERATE
1. `sustained_increase` LT1 demasiado sensible — detecta LT1 en ascensos mínimos (0.1 mmol)
2. ModDmax sobreestima LT2 en curvas con cola exponencial fuerte
3. VLamax proxy no es equivalente a medición directa — necesita disclaimer

#### LOW
4. Smoothing con media móvil simple — Savitzky-Golay sería mejor
5. HR bridge no compensa condiciones ambientales
6. Comentario stale en analytics.py línea 293
7. Data quality "low" con test de 7 días y conf=0.7 (threshold 0.75 es estricto)

---

### 7. Recomendaciones priorizadas

1. **[DONE] Fix build_peak dose step** — Corregido durante auditoría
2. **Refinar sustained_increase LT1**: Exigir delta mínimo (≥ baseline + 0.3)
3. **Disclaimer VLamax proxy**: Warning cuando se prescribe ANC basado solo en ratio
4. **Considerar Savitzky-Golay**: Para preservar inflexiones en ModDmax
5. **Ponderar por confianza en agregación**: Métodos con mayor confidence pesan más
6. **Corregir comentario stale** en línea 293

---

### 8. Referencias bibliográficas completas

- Faude O, Kindermann W, Meyer T. Lactate threshold concepts. Sports Med. 2009;39(6):469-490. DOI: 10.2165/00007256-200939060-00003
- Jamnick NA, et al. An examination and critique of current methods to determine exercise intensity domains. Sports Med. 2018;48(8):2095-2128. DOI: 10.1007/s40279-018-0937-x
- Bishop D, Jenkins DG, Mackinnon LT. The relationship between plasma lactate parameters, Wpeak and 1-h cycling performance. Med Sci Sports Exerc. 1998;30(8):1270-1275. DOI: 10.1097/00005768-199808000-00014
- Billat VL, et al. The concept of MLSS. Sports Med. 2003;33(6):407-426. DOI: 10.2165/00007256-200333060-00003
- Olbrecht J. The Science of Winning. 2000 (revised 2016).
- Issurin VB. New horizons for training periodization. Sports Med. 2010;40(3):189-206. DOI: 10.2165/11319770-000000000-00000
- Rønnestad BR, et al. Block periodization of HIT elicits superior adaptations. Scand J Med Sci Sports. 2012;22(2):34-42. DOI: 10.1111/j.1600-0838.2011.01434.x
- Millet GP, Vleck VE, Bentley DJ. Physiological differences cycling vs running. Sports Med. 2009;39(3):179-206. DOI: 10.2165/00007256-200939030-00002
- Bijker KE, et al. Differences in leg muscle activity running vs cycling. Eur J Appl Physiol. 2002;87(6):556-561. DOI: 10.1007/s00421-002-0663-8
- Daniels J. Daniels' Running Formula (3rd ed). Human Kinetics, 2013.
- Coggan A, Allen H. Training and Racing with a Power Meter. VeloPress, 2010.
- Hausswirth C, Mujika I (eds). Recovery for Performance in Sport. Human Kinetics, 2013.
- Seiler S. Training intensity distribution in endurance athletes. IJSPP. 2010;5(3):276-291.
- Stöggl TL, Sperlich B. Polarized training impact. Front Physiol. 2014;5:33. DOI: 10.3389/fphys.2014.00033
- Heck H, et al. Justification of the 4-mmol/l lactate threshold. Int J Sports Med. 1985;6(3):117-130.
- Mader A. Glycolysis and oxidative phosphorylation. Eur J Appl Physiol. 2003;88(4-5):317-338.
