# Auditoria 04 — Zonas de Entrenamiento

**Fecha**: 2026-03-15
**Archivos auditados**:
- `backend/app/models/training_zone.py`
- `backend/app/schemas/training_zone.py`
- `backend/app/api/routes/athletes.py` (endpoints de zonas, L306-607)
- `backend/app/services/workout_library.py` (DoseStep.intensity_zone)
- `backend/app/services/mesocycle_prescription.py` (uso de zonas en prescripcion)
- `backend/app/services/triathlon_motor.py` (_IF_BY_ZONE, estimate_session_tss)
- `backend/app/services/training_load_calculator.py` (TSS real vs estimado)
- `frontend/src/components/TrainingZonesEditor.tsx` (auto-calculo de zonas)
- `frontend/src/planning/components/CalendarView.tsx` (TSS estimado en calendario)

---

## 1. Modelo de Zonas

### 1.1 Tipo de modelo

El sistema usa un **modelo hibrido de 7 zonas** que varia por disciplina:

| Disciplina | Modelo | Ancla principal |
|---|---|---|
| Running | 7 zonas (E1, E2, LT1, Tempo, LT2, VO2max, ANC) | Seiler 3-zone + subdivision |
| Ciclismo | 7 zonas Coggan (Z1-Z7) | FTP = LT2 practico |
| Natacion | 7 zonas (Z1-Z7) | CSS = LT2 practico pace |

**Evaluacion**: El esquema es razonable. Running combina Seiler (3 zonas fisiologicas) con subdivision practica, ciclismo sigue Coggan (standard de la industria), natacion adapta a CSS. La decision de usar 7 zonas es coherente con Coggan y con la practica de entrenamiento moderna.

**Referencia**: Seiler 2010 define 3 zonas (sub-VT1 / VT1-VT2 / supra-VT2). Coggan propone 7 zonas basadas en %FTP. Faude 2009 valida la estructura de dos umbrales (LT1/LT2) como base fisiologica para zonas.

### 1.2 Limites de zona: de donde vienen

Los limites se calculan en `suggestZonesFromProfile()` (frontend, TrainingZonesEditor.tsx L91-260) usando:

- **LT1/LT2 fisiologicos** (2.0/4.0 mmol) -> para E1/E2 y VO2max/ANC (extremos de la escala)
- **LT1/LT2 practicos** (~1.6/~3.1 mmol) -> para las zonas centrales (LT1, Tempo, LT2)

Para running, la interpolacion entre practicos usa fracciones lineales:
- LT1 zone: pLT1 -> 35% del gap hacia pLT2
- Tempo: 35-70% del gap
- LT2 zone: 70% gap -> pLT2 + 3% margen

Para ciclismo, usa % de FTP (Coggan standard):
- Z1: <55% FTP, Z2: 55-75% FTP, Z3: 75-90%, Z4: 90-105%, Z5: 105-120%, Z6: 120-150%, Z7: >150%

### 1.3 Zonas por disciplina: SI, son independientes

Las zonas se almacenan como `TrainingZoneSet` por atleta + disciplina. Esto es correcto. Un set de running no afecta a ciclismo ni natacion.

---

## 2. Zonas de natacion

### 2.1 Estado actual

Las zonas de natacion usan CSS como ancla (equivalente a FTP en ciclismo). El modelo de 7 zonas es:
- Z1-Z3: % de CSS (1.25x, 1.12x, 1.05x)
- Z4-Z5: sub-CSS a CSS
- Z6-Z7: supra-CSS

### 2.2 Evaluacion cientifica

**Pyne 2001 / Mujika 1995**: La natacion historicamente usa 4-5 zonas basadas en lactato (A1 < 2 mmol, A2 2-4, A3 4-6, Lactate Production > 6, Sprint). El sistema de 7 zonas del proyecto es mas granular que el modelo clasico de natacion.

**Problema encontrado**: La natacion tiene una particularidad: la contribucion de la tecnica al rendimiento es mucho mayor que en running/ciclismo. Las zonas basadas unicamente en pace/HR pueden no capturar la calidad del nado. El sistema actual **no incluye** metricas de natacion como SWOLF, stroke rate, o distance per stroke, que son relevantes para zonificar sesiones tecnicas.

**Hallazgo H1**: Las zonas de natacion son mas granulares (7) que el modelo historico validado (4-5 zonas, Mujika 1995). Esto no es un error per se, pero la granularidad extra (Z3 "aerobico medio" vs Z4 "sub-umbral") puede no tener soporte fisiologico solido en natacion donde el drag no-lineal y la eficiencia tecnica dominan.

---

## 3. Auto-calculo y Actualizacion de Zonas

### 3.1 Las zonas NO se auto-actualizan

**Hallazgo critico H2**: Cuando se recalculan los umbrales (endpoint `/recalculate`), las zonas de entrenamiento **NO** se actualizan automaticamente. La funcion `recalculate_athlete()` en analytics.py no toca `TrainingZoneSet`. Las zonas solo cambian cuando el entrenador hace click en "Pre-rellenar desde umbrales" en el editor de zonas y guarda manualmente.

Esto es un **gap funcional significativo**. Segun la literatura:
- Friel recomienda recalcular zonas cada 4-6 semanas (tras cada test)
- Beneke 2011: las zonas deben reflejar el estado actual del atleta
- Con tests de lactato frecuentes, las zonas pueden quedar desactualizadas respecto a los umbrales

**Riesgo**: Un atleta cuyo LT2 mejora de 4:30/km a 4:15/km tras un bloque de umbral seguiria entrenando con zonas antiguas hasta que el entrenador las actualice manualmente.

### 3.2 Que umbral conduce los limites de zona

La prioridad en `threshold_profile_for_zones()` (athletes.py L351-484) es:

1. **Individual** (multi-sesion, motor dinamico) -> si tiene data_quality.sufficient
2. **Fisiologico** (2.0/4.0 mmol, motor dinamico chronic)
3. **Analisis** (sesion unica)

Las zonas centrales (LT1, Tempo, LT2) usan **umbrales practicos** (~1.6/~3.1 mmol). Los extremos usan fisiologicos. Esto es correcto: los practicos son la intensidad de entrenamiento real, los fisiologicos son la referencia de la curva.

### 3.3 Divergencia practico vs real

Si practical_LT1 y el LT1 "real" (detectado por forma de curva) divergen, el sistema usa **practical** para zonas de entrenamiento. Esto es coherente: el practical es el target de intensidad de entrenamiento diario, el "real" es un dato fisiologico de referencia.

---

## 4. Cascada: Zonas -> IF -> TSS -> ATL/CTL -> Prescripcion

### 4.1 Tres sistemas de IF paralelos (INCONSISTENCIA)

**Hallazgo critico H3**: Existen **tres sistemas independientes** para estimar IF/TSS, y no estan conectados entre si ni con las zonas del atleta:

| Sistema | Ubicacion | IF values | Usa zonas del atleta? |
|---|---|---|---|
| **A. triathlon_motor.py** | `_IF_BY_ZONE` (L34-44) | sub-LT1=0.65, LT1=0.78, sub-LT2=0.88, LT2=0.95, VO2=1.05, sprint=1.15 | NO |
| **B. CalendarView.tsx** | `estimateSessionTSS()` (L303-312) | clave=0.88, soporte=0.75, recovery=0.65 | NO |
| **C. training_load_calculator.py** | `compute_activity_tss()` (L225-304) | IF real = NP/FTP o pace/threshold | SI (usa LT2 del snapshot) |

**Problemas de consistencia**:

1. **A vs B**: El backend (triathlon_motor) usa zonas fisiologicas ("LT1", "LT2"), el frontend usa roles de sesion ("clave", "soporte"). Un workout "clave" de tipo LT1 tendria IF=0.78 en backend pero IF=0.88 en frontend. **Discrepancia de ~13%** en IF, que se traduce en **~28% de error en TSS** (IF^2).

2. **A vs C**: El sistema A estima TSS para sesiones planificadas sin usar las zonas reales del atleta. El sistema C calcula TSS real usando umbrales. Si las zonas del atleta cambian, A no se entera.

3. **El frontend estima su propio TSS** sin consultar al backend. El calendario muestra TSS estimados que pueden diferir significativamente del TSS que el backend calcularia.

### 4.2 Mapping de intensity_zone en DoseStep

Los `DoseStep` en workout_library.py usan strings como `"LT1"`, `"LT2"`, `"VO2"`, `"sub-LT1"`. Estos mapean a `_IF_BY_ZONE` en triathlon_motor.py. Pero:

**Hallazgo H4**: No hay `"sub-LT2"` en ningun DoseStep existente, aunque `_IF_BY_ZONE` define `"sub-LT2": 0.88`. Este valor solo existe en la tabla pero nunca se usa en la practica. El valor por defecto de fallback en `_IF_BY_ZONE.get(intensity_zone, 0.75)` se activaria para cualquier zona no mapeada.

### 4.3 TSS de natacion: IF^3

El triathlon_motor.py y training_load_calculator.py usan IF^3 para natacion (en lugar de IF^2 para running/ciclismo). Esto es consistente con la practica de TrainingPeaks (sTSS) y tiene soporte en la resistencia no-lineal del agua. **Correcto**.

### 4.4 Si las zonas cambian, las sesiones planificadas NO se invalidan

**Hallazgo H5**: No existe un mecanismo de invalidacion de sesiones planificadas cuando las zonas cambian. Una sesion planificada con "LT2 @ 4:30/km" seguiria mostrando ese ritmo aunque el nuevo LT2 sea 4:15/km. Los templates de workout referencian zonas **por nombre** ("LT1", "LT2", "VO2") en el campo `intensity_zone` de DoseStep, no por valor numerico.

Esto tiene dos caras:
- **Ventaja**: Los nombres son estables. "LT2" sigue significando "intensidad de umbral" aunque el ritmo cambie.
- **Problema**: La dosis prescrita (ej: "4x2km @ 4:30/km") es un valor absoluto que no se recalcula.

---

## 5. Evaluacion del Modelo de Zonas vs Literatura

### 5.1 Seiler 3-zone vs Coggan 7-zone

| Aspecto | Seiler (2010) | Coggan (2003) | Sistema actual |
|---|---|---|---|
| Zonas | 3 | 7 | 7 |
| Anclas | VT1/VT2 (lactato) | FTP (potencia) | LT1 pract./LT2 pract. |
| Discipline | Universal | Ciclismo | Por disciplina |
| Running zones | Sub-LT1 / LT1-LT2 / supra-LT2 | N/A | 7 zonas con subdivision |

**Evaluacion**: El sistema es un hibrido valido. Usa las 2 anclas de Seiler (LT1/LT2) pero subdivide en 7 zonas para dar granularidad practica al entrenador. Coggan para ciclismo es el standard de facto.

### 5.2 Faude 2009: Validez de los limites

Faude reviso 25 conceptos de umbral de lactato y concluyo que los dos breakpoints (primera subida sobre baseline y MLSS) son validos para delimitar zonas. El sistema actual usa:
- LT1 = ~1.6 mmol (practical) o 2.0 mmol (fisiologico) -> Consistente con "primera subida sobre baseline"
- LT2 = ~3.1 mmol (practical) o 4.0 mmol (fisiologico) -> Algo por debajo de MLSS clasico (4.0), pero la decision de usar 3.1 como practical target esta documentada y justificada en MEMORY.md

### 5.3 Beneke 2011: Tres dominios de intensidad

Beneke define 3 dominios: (1) < threshold, (2) threshold-MLSS, (3) > MLSS. El sistema actual captura esto: E1+E2 = dominio 1, LT1+Tempo+LT2 = dominio 2, VO2+ANC = dominio 3. **Consistente**.

### 5.4 Stoggl 2015: Zona sub-LT2 como zona independiente

Stoggl & Sperlich (2014) compararon polarizado vs threshold y encontraron que la distribucion polarizada (enfasis en zona 1) supera a la distribucion centrada en zona 2 (threshold). Esto sugiere que "sub-LT2" como zona de entrenamiento independiente tiene sentido para cuantificar, pero **no como objetivo de entrenamiento principal**.

En el sistema actual, `_IF_BY_ZONE["sub-LT2"] = 0.88` existe como zona pero no aparece en ningun DoseStep. Es una zona fantasma. **Hallazgo H4 confirmado**.

### 5.5 Frecuencia de recalculo de zonas

La literatura recomienda:
- Friel: cada test (4-6 semanas)
- Beneke: cuando el umbral cambia significativamente
- Practica general: cada 6-8 semanas o tras cada bloque

El sistema actual no tiene recalculo automatico (H2). Deberia al menos **notificar** al entrenador cuando los umbrales han cambiado significativamente desde la ultima creacion de zonas.

---

## 6. Hallazgos y Recomendaciones

### Hallazgos criticos

| ID | Hallazgo | Severidad | Impacto |
|---|---|---|---|
| **H1** | Zonas natacion (7) mas granulares que modelo validado (4-5, Mujika 1995) | Baja | Granularidad extra sin soporte fisiologico claro; no causa dano pero puede confundir |
| **H2** | Zonas NO se auto-actualizan cuando cambian umbrales | **Alta** | Atletas entrenan con zonas obsoletas hasta que el entrenador las actualice manualmente |
| **H3** | Tres sistemas IF/TSS paralelos e inconsistentes (triathlon_motor, CalendarView, training_load_calculator) | **Alta** | Discrepancia de hasta 28% en TSS estimado entre frontend y backend; corrompe ATL/CTL/ACWR |
| **H4** | Zona "sub-LT2" definida en _IF_BY_ZONE pero nunca usada en DoseStep | Baja | Codigo muerto; sin impacto funcional |
| **H5** | Sesiones planificadas no se invalidan cuando zonas/umbrales cambian | Media | Dosis absolutas (ej: "4:30/km") quedan desactualizadas silenciosamente |

### Recomendaciones

**R1 (H2) — Auto-notificacion de zonas obsoletas**:
Cuando `recalculate_athlete()` detecta que los umbrales han cambiado >5% respecto al `threshold_context` del `TrainingZoneSet` activo, generar un warning visible en la UI: "Los umbrales han cambiado desde que se crearon las zonas actuales. Revisa las zonas."

**R2 (H3) — Unificar IF estimation**:
Crear una funcion unica `estimate_if_for_session(intensity_zone: str, session_role: str) -> float` que:
- Use `intensity_zone` del DoseStep cuando esta disponible (preferencia)
- Fallback a `session_role` ("clave"/"soporte"/"recovery") solo cuando no hay intensity_zone
- Que frontend y backend llamen a la misma tabla de IF

Tabla propuesta unificada:

| intensity_zone | IF | Fuente |
|---|---|---|
| sub-LT1 / recovery | 0.65 | Seiler zone 1 |
| LT1 | 0.78 | ~85% FTP (Coggan Z2-Z3 boundary) |
| sub-LT2 / tempo | 0.85 | Coggan Z3 |
| LT2 | 0.95 | Coggan Z4 (~91-105% FTP) |
| VO2 / VO2max | 1.05 | Coggan Z5 |
| ANC / sprint | 1.15 | Coggan Z6-Z7 |

**R3 (H5) — Etiquetas de intensidad relativas**:
Los templates de workout deberian prescribir intensidad como **referencia a zona** (ej: "4x2km @ zona LT2") en lugar de valores absolutos. El frontend resolveria el ritmo/potencia concreta desde las zonas activas del atleta.

**R4 (H1) — Simplificar zonas de natacion**:
Considerar un modelo de 5 zonas para natacion (A1, A2, Threshold, VO2, Sprint) alineado con Mujika/Pyne, o al menos documentar por que 7 es preferible en el contexto del sistema.

---

## 7. Fuentes

- [Seiler 2010 — What is best practice for training intensity and duration distribution in endurance athletes?](https://pubmed.ncbi.nlm.nih.gov/20861519/)
- [Coggan — Cycling Power Zones (TrainingPeaks)](https://www.trainingpeaks.com/blog/power-training-levels/)
- [Faude 2009 — Lactate Threshold Concepts: How Valid are They?](https://pubmed.ncbi.nlm.nih.gov/19453206/)
- [Beneke 2011 — Blood lactate diagnostics in exercise testing and training](https://pubmed.ncbi.nlm.nih.gov/21487146/)
- [Stoggl & Sperlich 2014 — Polarized training has greater impact on key endurance variables](https://pmc.ncbi.nlm.nih.gov/articles/PMC3912323/)
- [Stoggl & Sperlich 2015 — The training intensity distribution among well-trained and elite endurance athletes](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2015.00295/full)
- [Pyne/Mujika — Swimming training zones (biophysical approach)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10982397/)
- [Friel — Quick Guide to Setting Zones](https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/)
