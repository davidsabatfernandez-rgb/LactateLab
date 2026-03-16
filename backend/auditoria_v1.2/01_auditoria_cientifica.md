# Auditoria Cientifica v1.2 — Lactate Lab

Fecha: 2026-03-15
Metodologia: Revision del codigo fuente sin conocimiento previo del sistema,
contrastando cada decision contra evidencia publicada 2020-2026.

---

## 1. Deteccion de LT1: baseline + 0.5 mmol

**Que hace el sistema:** Detecta LT1 como primer punto donde lactato >= baseline + 0.5 mmol,
con verificacion de que el siguiente punto no cae > 0.25 mmol (Faude 2009).

**Evidencia actual:**
- Faude et al. 2009 sigue siendo la referencia principal para el criterio +0.5.
- Estudio 2025 en futbolistas (MDPI Applied Sciences 15/3/1399) demuestra **pobre concordancia**
  entre metodos de LT1 (visual, log-log, Dmax, fixed) — ICC bajos, no intercambiables.
- No hay nuevo consenso que reemplace el +0.5 mmol.

**Veredicto:** ACEPTABLE. El enfoque multi-metodo del sistema (baseline_rise + sustained_increase)
mitiga el problema de concordancia.

**Recomendacion:** Considerar anadir log-log como tercer estimador de LT1.

---

## 2. ModDmax para LT2 (Bishop 1998)

**Que hace el sistema:** Linea desde primer punto >= baseline + 0.5 mmol hasta ultimo punto.
LT2 = maxima desviacion positiva sobre esta linea.

**Evidencia actual:**
- Estudio 2018 (PMID 30408426): todas las modificaciones de Dmax muestran buen acuerdo
  con MLSS (diferencias medias -7 a +2 W en ciclismo).
- Test de lactato minimo (2018, PMID 29775989) muestra mayor precision que OBLA y mDmax
  para estimar MLSS, pero requiere protocolo especial (esfuerzo supramaximo previo).
- Fiabilidad confirmada en esquiadores de fondo (2010, PMID 20508457).

**Veredicto:** CORRECTO. ModDmax sigue siendo valido para tests incrementales estandar.

---

## 3. Modelo 5 zonas (Seiler 2006, Esteve-Lanao 2007)

**Que hace el sistema:** Z1<85%LT1, Z2=85%LT1-LT1, Z3=LT1-LT2, Z4=LT2-LT2*1.05, Z5>LT2*1.05.
Anclado a umbrales individuales.

**Evidencia actual:**
- Encuesta internacional 2025 (Nature Scientific Reports): 47% de profesionales usan 5 zonas.
  Noruegos 2.7x mas que el resto.
- Meta-analisis 2024 (Sports Medicine): POL superior a otras TID para VO2peak,
  especialmente en altamente entrenados e intervenciones cortas.
- El modelo de 3 zonas (Seiler) es el backbone fisiologico; 5+ zonas dan granularidad practica.

**Veredicto:** CORRECTO. Bien alineado con la practica actual.

---

## 4. VLamax proxy desde ratio LT1/LT2

**Que hace el sistema:** ratio > 0.87 = VLamax low (diesel), 0.79-0.87 = moderate, < 0.79 = high.
Compuesto con steepness (sigmoid) y VO2max headroom. Pesos: 0.45/0.30/0.25.

**Evidencia actual:**
- VLamax es un metrico legitimo y crecientemente estudiado (ICC 0.66-0.96 en ciclismo, 0.85 en remo).
- Estudio 2025 (Tandfonline): VLamax correlaciona fuertemente con rendimiento glucolitico.
- Sports Medicine 2025: "Is VLamax for glycolysis what VO2max is for oxidative phosphorylation?" — afirmativo.
- **PERO: NO existe validacion publicada de derivar VLamax desde el ratio LT1/LT2.**
  Los protocolos establecidos requieren test de sprint 15s o multiples tests submaximales.
  Los modelos matematicos (Mader/Hauser) usan VO2max + VLamax para predecir MLSS, no al reves.

**Veredicto:** HEURISTICO NO VALIDADO. La logica es razonable pero no tiene soporte empirico directo.

**Recomendacion CRITICA:**
- Etiquetar como "VLamax proxy (heuristico)" en UI y codigo.
- Considerar modelo Hauser (VO2max + curva lactato -> VLamax computado) como alternativa mas defensible.
- Si hay datos de sprint disponibles, usar test VLamax 15s (CV ~4.7%, ICC 0.94).

---

## 5. Fraccion de utilizacion Daniels & Gilbert (1979)

**Que hace el sistema:** F(T) = 0.8 + 0.189*exp(-0.0128*T) + 0.299*exp(-0.193*T).
Modulada por VLamax (sensibilidad por distancia: 5K=0.03, marathon=0.22).

**Evidencia actual:**
- VDOT sigue siendo ampliamente usado y no ha sido reemplazado para el rango 1500m-50km.
- Limitaciones conocidas: menos valido fuera de 1500m-50km, no cuenta durability.
- La modulacion por VLamax es una adicion del sistema (no de Daniels) — razonable pero no publicada.

**Veredicto:** CORRECTO para distancias estandar. La modulacion VLamax es una extension propia.

---

## 6. EWMA CTL/ATL (7d/42d) — Modelo Fitness-Fatigue de Banister

**Que hace el sistema:** ATL (tau=7d, alpha=0.25), CTL (tau=42d, alpha=0.0465).
TSB = CTL - ATL. ACWR = ATL/CTL.

**Evidencia actual — ESTO ES LO MAS CUESTIONADO:**
- **Imbach et al. 2025 (Nature Scientific Reports):** El FFM esta **mal condicionado**.
  Parametros de fitness y fatiga son antagonistas/no identificables en analisis bayesiano.
  Anadir parametros de fatiga NO mejora significativamente la capacidad predictiva (p > 0.40).
  El modelo exhibe patrones de **sobreajuste**.
- **ACWR criticado severamente:** Revision sistematica 2025 confirma pobre capacidad predictiva
  para lesiones no-traumaticas. Los umbrales "sweet spot" originales se basaban en binning
  artificial de datos continuos.
- EWMA sigue siendo preferido sobre medias moviles para sensibilidad, pero el modelo FFM
  subyacente tiene problemas estadisticos fundamentales.

**Veredicto:** CUESTIONADO. Los time constants 7d/42d se usan en la practica (TrainingPeaks),
pero la base cientifica es mas debil de lo que se asumia.

**Recomendacion:**
- Usar CTL/ATL como herramientas **descriptivas** de carga, NO como predictores de rendimiento.
- NO usar ACWR para prediccion de lesiones.
- Considerar sRPE (session RPE) como complemento — estudios recientes muestran superioridad
  sobre HR-TRIMP para monitoring de carga funcional.

---

## 7. Decay de durabilidad: k * t^1.5 (Zanini 2025)

**Que hace el sistema:** total_decay = k * duration^1.5.
k = {high: 0.013, medium: 0.025, low: 0.035}. Calibrado a 7.1% @ 2h medium.

**Evidencia actual:**
- Maunder et al. 2021: define durabilidad como "cuarto parametro" del rendimiento.
- Zanini et al. 2024: decay similar entre atletas puede tener bases fisiologicas diferentes.
- Hunter 2025: CP decae ~10% tras ejercicio fatigante, pero con **enorme variacion individual** (1-31%).
- Puchowicz 2023: modelo power-law (P = a * t^(-E)) propuesto como superior a CP.
- **No he encontrado el modelo especifico k*t^1.5 en literatura publicada.**

**Veredicto:** INCIERTO. Si t^1.5 es implementacion propia, debe documentarse como tal.

**Recomendacion:**
- Verificar fuente del exponente 1.5.
- Considerar power-law (t^(-E) con E ajustado individualmente) como alternativa.
- Usar benchmark ~10% CP decay (Hunter 2025) como target de validacion.

---

## 8. Periodizacion por bloques Olbrecht (AEC/AEP/ANC/ANP)

**Que hace el sistema:** 6 bloques con gates de seleccion basados en CapacityProfile,
fase de temporada, VLamax, gaps LT1/LT2.

**Evidencia actual:**
- Meta-analisis 2019 (Molmen, n=20 estudios): BP muestra efectos favorables pequenos vs
  periodizacion tradicional (SMD 0.40 VO2max, 0.28 Wmax). Calidad metodologica baja (PEDro 3.7/10).
- Estudio 2022 (Frontiers Physiology): sin diferencia entre BP y "best practice" tradicional
  en ciclistas entrenados.
- El framework Olbrecht es respetado en coaching de natacion pero tiene **validacion formal
  limitada**. Publicado principalmente en su libro, no en journals peer-reviewed.

**Veredicto:** RAZONABLE PERO NO FUERTEMENTE EVIDENCE-BASED.
La logica fisiologica es solida; la taxonomia AEC/AEP/ANC/ANP es practitioner-driven.

**Recomendacion:** Permitir al coach override de seleccion de bloque.
Documentar como "modelo experto, fisiologicamente fundamentado" vs "evidence-based RCT".

---

## 9. Swimming TSS cubico (IF^3)

**Que hace el sistema:** sTSS = IF^3 * hours * 100. IF = CSS/avg_pace.
Justificacion: resistencia del agua es proporcional a v^3.

**Evidencia actual:**
- La relacion cubica potencia-velocidad en agua esta bien establecida por fluidodinamica.
- TrainingPeaks usa este modelo.
- **No hay estudio peer-reviewed 2020-2025 que valide empiricamente IF^3 para stress fisiologico.**
- El salto de "coste energetico cubico" a "stress de entrenamiento cubico" es asumido, no demostrado.

**Veredicto:** FISICAMENTE MOTIVADO, EMPIRICAMENTE NO VALIDADO.

**Recomendacion:** Mantener como mejor opcion disponible. Si potenciometros de natacion
se generalizan, migrar a TSS basado en potencia directa.

---

## 10. LT2 practico a 3.1 mmol como anchor universal

**Que hace el sistema:** practical_lt2_target = 3.1 mmol para interpolacion cuando
no hay suficientes datos para determinacion individual.

**Evidencia actual:**
- MLSS varia 2.0-8.0 mmol/L entre individuos.
- MLSS varia por deporte: ~4.5 ciclismo, ~5.4 kayak, ~2.7 remo.
- Estudio 2025 en runners recreacionales: OBLA (4mmol) tiene desviacion media 3.4 +/- 5.5%
  de umbrales determinados individualmente.
- Umbrales individuales van de 1.4 a 7.5 mmol/L.

**Veredicto:** SUBOPTIMO. 3.1 mmol es mas conservador que 4.0 (OBLA), lo cual es mejor,
pero la variacion inter-individual es demasiado grande para cualquier valor fijo.

**Recomendacion:** Usar 3.1 solo como fallback cuando el analisis individual falla.
Documentar claramente como "anchor conservador de respaldo".
El sistema ya prioriza umbrales individuales — esto es correcto.

---

## 11. Swain %HRR ~ %VO2R para estimar VO2max

**Que hace el sistema:** %VO2R = (HR_LT2 - HR_rest)/(HR_max - HR_rest).
VO2max running = (VO2@LT2 - 3.5) / %VO2R + 3.5.

**Evidencia actual:**
- La equivalencia %HRR = %VO2R (no %VO2max) sigue aceptada.
- Mas precisa por encima del 40% VO2max.
- Variabilidad inter-individual significativa en relacion HR-VO2.
- Menos precisa en atletas altamente entrenados con adaptaciones cardiacas.

**Veredicto:** ACEPTABLE con limitaciones conocidas.

**Recomendacion:** Anadir intervalos de confianza a VO2max derivados de HR.

---

## 12. Constantes TRIMP sexo-especificas (1.92 male, 1.67 female)

**Que hace el sistema:** TRIMP = duration * HRR * 0.64 * exp(k * HRR).
k = 1.92 (hombre), 1.67 (mujer). Banister original.

**Evidencia actual:**
- Constantes derivadas de muestra **muy pequena** — limitacion mayor.
- Alternativas superiores disponibles:
  - **Manzi's individualized TRIMP**: usa relacion HR-lactato individual de cada atleta.
  - **Lucia's TRIMP**: ancla pesos a umbrales ventilatorios individuales.
  - **sRPE**: estudio 2020 muestra superioridad sobre HR-TRIMP para carga funcional.

**Veredicto:** ANTICUADO. Las constantes de Banister son de muestra inadecuada y
simplifican excesivamente la variacion individual.

**Recomendacion CRITICA:**
- Dado que el sistema YA tiene datos de lactato por atleta, implementar TRIMP de Lucia
  (anclado a LT1/LT2 individuales) seria coherente con el resto del motor.
- A minimo, documentar la limitacion de las constantes de pequena muestra.

---

## Resumen de prioridades

| # | Decision | Estado | Prioridad |
|---|----------|--------|-----------|
| 1 | LT1 +0.5 mmol | Aceptable | Baja |
| 2 | ModDmax | Correcto | Ninguna |
| 3 | 5 zonas | Correcto | Ninguna |
| 4 | VLamax proxy ratio | **No validado** | **Alta** |
| 5 | Daniels F(T) | Correcto | Ninguna |
| 6 | EWMA CTL/ATL | **Cuestionado** | **Media** |
| 7 | Durability t^1.5 | Incierto | Media |
| 8 | Olbrecht bloques | Razonable | Baja |
| 9 | Swim TSS IF^3 | No validado | Baja |
| 10 | LT2 @ 3.1 mmol | Suboptimo | Media |
| 11 | Swain %HRR~%VO2R | Aceptable | Baja |
| 12 | TRIMP 1.92/1.67 | **Anticuado** | **Alta** |

### Los 4 items que requieren atencion inmediata:
1. **VLamax proxy** (#4) — Etiquetar como heuristico; evaluar modelo Hauser
2. **TRIMP constantes** (#12) — Migrar a Lucia's TRIMP (coherente con el sistema)
3. **EWMA FFM** (#6) — Usar descriptivamente, no predictivamente
4. **LT2 3.1 mmol** (#10) — Asegurar que es fallback, no primario

---

## Referencias (2020-2026)

- MDPI Applied Sciences 15/3/1399 (2025) — LT methods comparison in soccer
- PMC12354492 (2025) — Fixed intensity anchors accuracy in recreational runners
- PMID 30408426 (2018) — Modifications of Dmax vs MLSS
- Nature Scientific Reports (2025) — Norwegian intensity zones survey
- Sports Medicine (2024) — Polarized vs other TID meta-analysis
- Tandfonline (2025) — VLamax correlates with glycolytic performance
- Springer Sports Medicine (2025) — Is VLamax for glycolysis what VO2max is?
- Nature Scientific Reports Imbach (2025) — FFM ill-conditioned
- PMC12487117 (2025) — ACWR systematic review
- Hunter 2025 (J Physiol) — Durability CP decay
- Puchowicz 2023 (Eur J Appl Physiol) — Power laws vs critical power
- Molmen 2019 (PMC6802561) — Block periodization meta-analysis
- Frontiers Physiology 2022 — Block vs traditional in cyclists
- PMC7435063 (2020) — sRPE superior to TRIMP
