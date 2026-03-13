# AUDIT 03 — Motor de Composición de Mesociclos
## Auditoría Científica — 2026-03-13

---

### Resumen ejecutivo

Se validaron 43 checks del motor de mesociclos: wave principle (6 tests), dose step por fase (5 tests), cobertura de templates, progresión de dose ladders (27 tests), y labels semánticos (5 tests). **43/43 pasaron.** Se confirmó que el bug fix de `build_peak` (AUDIT_01) funciona correctamente — el peldaño máximo se aplica en la semana clímax.

---

### 1. Wave Principle

| Estructura | Fases generadas | Validación |
|-----------|----------------|------------|
| 4w standard (3+1) | load → build → build_peak → recovery | ✅ Olbrecht 3/5 + 2/5 |
| 5w standard (3+2) | load → build → build_peak → recovery × 2 | ✅ |
| 5w aggressive (4+1) | load → build × 2 → build_peak → recovery | ✅ |
| 3w short (2+1) | load → build → recovery (sin build_peak) | ✅ correcto: work_span < 3 |
| 2w minimal (1+1) | load → recovery | ✅ correcto para ANP |
| 4w comp_specific | load → build → specific → recovery | ✅ specific en última working week |

**Literatura**: La estructura de carga ondulante (undulating periodization) está validada por Rhea et al. 2004 (JSCR) y Plisk & Stone 2003 (Strength & Cond J). La secuencia load → build → build_peak con recovery al final sigue el principio de supercompensación (Bompa 1999).

---

### 2. Dose Step por fase (bug fix verified)

| Fase | Step (last=3, max=8) | Lógica |
|------|---------------------|--------|
| load | 2 (last-1) | ✅ Entrada conservadora |
| build | 4 (last+1) | ✅ Progresión gradual |
| **build_peak** | **8 (max_step)** | ✅ **BUG FIX VERIFIED** — antes daba 3 |
| recovery | 1 (last-2) | ✅ Descarga significativa |
| build (degrading) | 3 (4-1) | ✅ Señal degradante baja 1 step |

**Hallazgo**: El fix del build_peak funciona. Sin el fix, build_peak daba step=3 (effective_last sin cambio), lo que significaba que la semana "clímax" tenía la misma carga que la semana anterior — negando el propósito del wave principle.

---

### 3. Cobertura de templates

- **95 templates** totales, 3 disciplinas (running, ciclismo, natación)
- **93 familias** únicas de sesión
- **27 templates con dose_ladder** (28.4%) — las sesiones clave
- **68 templates sin ladder** — usan csv_examples o dose_guidance como fallback

---

### 4. Dose ladders

- **27/27 monotónicos en step** ✅ — cada peldaño tiene un índice mayor que el anterior
- **10/27 no-monotónicos en duración** ⚠️ — esto es **esperado y correcto**: progresión de intensidad a veces reduce volumen (ej. LT2 cruise: 5×6' → 4×8' → 3×10' baja reps pero sube duración por rep, total puede ser menor)

**Literatura**: Foster 1998 (session RPE) y Seiler 2010 (polarized training): la progresión de carga no es necesariamente lineal en volumen; puede ser en intensidad, densidad, o combinaciones. La no-monotonía en duración es fisiológicamente válida cuando la intensidad sube.

---

### 5. Distribución de intensidad

Análisis de las familias por zona (basado en template_id naming):
- **LT1/aerobic**: ~35% de las familias (lt1_extensive, lt1_blocks, lt1_broken_sets, aerobic_continuity, fatmax, endurance...)
- **LT2/threshold**: ~25% (lt2_cruise, lt2_halfpace, threshold_continuous, over_under, subthreshold...)
- **VO2max/AEP**: ~15% (vo2_hills, vo2_30_30, sit_lt1_progressive, anc_vo2_short...)
- **ANC/ANP**: ~10% (anc_submax_spice, anc_power_sprints, fuerza_q2...)
- **Recovery/technical/strength**: ~15% (full_rest, recovery_drills, strength, mobility...)

Esto sugiere una distribución **piramidal** (más volumen en zona baja, menos en alta), coherente con Stöggl & Sperlich 2014 (Frontiers in Physiology): la distribución piramidal es la más prevalente en atletas de élite de resistencia, aunque la polarizada (Seiler 2010) puede ser superior en algunas poblaciones. El motor no prescribe una distribución fija — la distribución emerge de los blueprints del bloque.

---

### 6. Discrepancias

Ninguna discrepancia CRITICAL o MODERATE encontrada.

#### LOW
1. **No hay validación automática de distribución de intensidad**: Los blueprints definen qué sesiones van en cada semana, pero no hay un check que valide que la distribución resultante sea coherente (ej. que no haya 4 sesiones de VO2 en una misma semana).
2. **10 ladders con duración no-monotónica**: Aunque es válido fisiológicamente, podría confundir al usuario si se muestra como "progresión de carga" sin contexto.

---

### 7. Recomendaciones

1. **Añadir validación de distribución semanal**: Un check post-generación que alerte si >2 sesiones de alta intensidad caen en la misma semana.
2. **Documentar la no-monotonía de duración**: En el tooltip de "progresión de dosis", clarificar que la progresión puede ser en intensidad, no solo en volumen.

---

### 8. Referencias

- Rhea MR, et al. A comparison of linear and daily undulating periodized programs. JSCR. 2004;18(4):862-867.
- Plisk SS, Stone MH. Periodization strategies. Strength Cond J. 2003;25(6):19-37.
- Bompa TO. Periodization: Theory and Methodology of Training (4th ed). Human Kinetics, 1999.
- Foster C, et al. A new approach to monitoring exercise training. JSCR. 1998;15(1):109-115.
- Seiler S. What is best practice for training intensity and duration distribution in endurance athletes? IJSPP. 2010;5(3):276-291.
- Stöggl TL, Sperlich B. Polarized training has greater impact on key endurance variables than threshold, high-intensity, or high-volume training. Front Physiol. 2014;5:33. DOI: 10.3389/fphys.2014.00033.
- Olbrecht J. The Science of Winning. 2000 (revised 2016).
