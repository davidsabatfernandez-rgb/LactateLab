# Auditoría 06 — Plantillas de Sesión y Biblioteca de Workouts

## Resumen ejecutivo

La biblioteca de workouts contiene **55+ templates** organizados en 3 disciplinas principales (running, ciclismo, natación) más templates transversales (fuerza, movilidad, test, recuperación). La arquitectura es sólida: cada template incluye `WorkoutTemplate` con metadatos fisiológicos completos, `DoseStep` ladders para progresión, calentamiento/enfriamiento explícitos, coach_tips, y un sistema de publicación a Garmin Connect vía API REST.

**Veredicto global: 8/10.** La mayoría de templates están bien calibrados fisiológicamente. Hay hallazgos menores que corregir y dos hallazgos significativos que merecen atención.

---

## Familias de sesión

### Running (22 templates)

#### LT1 extensivo (`run_lt1_extensive`)
- **Intervalos**: 3-5 x 8-15' con 1.5-2' rec. **Correcto.** Intervalos LT1 de 8-15' son apropiados para acumular tiempo subumbral (Seiler 2006, Solli 2017).
- **Dose ladder (8 peldaños)**: Progresión coherente de 24' a 40' útiles. El paso de intervalos a continuo (40' cont) es fisiológicamente lógico.
- **Calentamiento**: 20' (15' progresivo + 4x15'' rectas). **Adecuado.**
- **Enfriamiento**: 10'. **Adecuado** para intensidad subumbral.
- **Coach tips**: Correctos (control FC min 3-4, deriva cardiaca).

#### LT2 cruise intervals (`run_lt2_cruise`)
- **Intervalos**: 4-8 x 800m-1km o 3x2km con pausas 1-1.25'. **Correcto.** Las duraciones de 3-5' por repetición a LT2 son el estándar (Billat 2001, Seiler 2013).
- **Dose ladder (6 peldaños)**: De 16' a 40' útiles. Progresión razonable.
- **Descanso**: 1-2' entre repeticiones. **Adecuado** para LT2 — suficiente para releer sin perder la señal metabólica.
- **OBSERVACION**: La pausa de 1' en 4x800m (peldaño 1) es justa para un atleta en introducción. Considerar 1.5' como primer peldaño.

#### VO2 y cuestas (`run_vo2_hills`)
- **Intervalos**: 4-6 x 3-4' VO2. **Correcto.** Billat (2001): intervalos de 3-5' son óptimos para acumular tiempo en VO2max. La ventana de 3-4' es conservadora y apropiada.
- **Dose ladder (6 peldaños)**: 12-24' útiles con 3-4' de descanso. **Correcto.** Descanso 1:1 (3' trabajo / 3' rec) es el estándar para VO2max (Midgley 2006).
- **Fatigue cost**: 5/5. **Correcto.**
- **Requires_fresh**: True. **Correcto.**

#### VO2 30-30 (`run_vo2_30_30`)
- **Formato**: 10-15 x 30''/30''. **Correcto.** Formato clásico de Billat (2001) para acumular tiempo en VO2max con menor estrés mecánico.
- **OBSERVACION**: No tiene dose_ladder ni calentamiento/enfriamiento definidos. Debería tener al menos 15-20' de calentamiento dado que es fatigue_cost 5 y requires_fresh.

#### Threshold continuo (`run_threshold_continuous`)
- **Intervalos**: 20-40' continuo LT2. **Correcto.** El "classic tempo run" (Daniels 2014).
- **Dose ladder (6 peldaños)**: De 20' a 40' continuo. **Buena progresión.** 40' continuo a LT2 es carga alta pero alcanzable para atletas experimentados.
- **Calentamiento**: 15'. **Correcto** (minimum recommendation para sesiones de umbral).

#### LT2 short reps (`run_lt2_short_reps`)
- **Formato**: 6-10 x 3' LT2 con 1' rec. **Correcto.** Repeticiones de 3' a LT2 con 1' son un formato standard de Daniels y del CSV de Nacho.
- **Dose ladder (5 peldaños)**: Incluye 2x(6x3') doble bloque como peldaño 5. **Buena progresión.**
- **OBSERVACION**: El peldaño 5 (36' útiles a LT2 en doble bloque) es una carga sustancial. La pausa entre bloques de 2' podría ser insuficiente para doble bloque; considerar 3-4'.

#### Escalated intervals (`run_escalated_intervals`)
- **Formato**: 3-5 x (3'LT1 + 3'LT2 + 2'LT2b). **Interesante y original.** La progresión intra-repetición es un formato mixto bien documentado en entrenadores noruegos (Seiler 2013).
- **Dose ladder (4 peldaños)**: De 18' a 40' útiles. **Correcto.**
- **Coach tips**: Excelentes (respiración nasal en LT1, definición clara de LT1/LT2).

#### uLT1 + VO2 combo (`run_uLT1_vo2_combo`)
- **Formato**: 8' uLT1 + 2 bloques VO2 (40''/20'') + 8' uLT1. **Formato sofisticado.** Combina estímulo aeróbico alto con microintervalos VO2.
- **HALLAZGO MENOR**: El enfriamiento es de solo 5'. Para una sesión de fatigue_cost 5 con VO2, **debería ser 10-15'** para facilitar la eliminación de lactato post-sesión y reducir respuesta simpática residual (Menzies 2010).
- **Calentamiento**: 20' (3km progresivo + activaciones). **Adecuado.**

#### ANC submax spice + LT1 (`run_anc_submax_spice`)
- **Formato**: 4-5 x 20-30'' submáx + 6-8 x 4' LT1. **Correcto.** Patrón Olbrecht Tipo I exacto: spice anaeróbico breve al inicio, cola aeróbica extensiva.
- **Coach tips**: Excelentes. Refuerza que el spice va AL INICIO (clave Olbrecht).
- **OBSERVACION**: Los DoseStep tienen `total_useful_time_min=0`, lo que podría causar problemas en la UI de duración. Debería calcularse como tiempo de trabajo real (spice + cola LT1).

#### VO2 microburst (`run_anc_vo2_short`)
- **Formato**: 8'LT1 + 20x20''/15''. **Correcto.** Progresión documentada 20/15 -> 30/20 -> 40/30 es un formato de densidad progresiva bien respaldado.
- **Calentamiento**: 20'. **Correcto.**
- **Enfriamiento**: 20'. **Correcto** — adecuado para post-VO2.

#### Half pace progresivo (`run_halfpace_progressive`)
- **Formato**: 3x12' a 3x15' a 2x20' a ritmo HM. **Correcto.** Zona LT1+/LT2- con progresión por duración.
- **OBSERVACION**: No tiene calentamiento/enfriamiento definidos. Para una sesión de fatigue_cost 4, debería tener 15-20' de calentamiento.

#### Openers (`run_openers`)
- **Formato**: 20-30' total: calentamiento + progresivos + rectas. **Correcto.** Sesión de activación pre-competición standard.
- **Fatigue cost**: 1. **Correcto.**
- **No tiene calentamiento/enfriamiento definidos**: coherente porque la sesión en sí es calentamiento + activación.

#### E2 progresivo medio (`run_e2_progressive_medium`)
- **Formato**: 10'E1 + 30'E2 + 20'D2 + 10'LT1 + 10'E1. **Correcto.** Escalada continua de zonas.
- **Sin calentamiento/enfriamiento**: Coherente porque el E1 inicial/final hace las funciones de warm-up/cool-down.

#### ANP sprint tolerance (`run_anp_sprint_tolerance`)
- **Formato**: 8-12 x 30-60m a velocidad máxima con 5-15'' descanso. **Correcto.** Patrón ANP de Olbrecht: descanso muy breve = tolerancia a la acidosis.
- **Cautelas**: Excelentes. Incluyen la advertencia de Olbrecht sobre máximo 2-3 semanas consecutivas.

### Cycling (19 templates)

#### LT1 blocks (`bike_lt1_blocks`)
- **Intervalos**: 3-6 x 10-15' LT1, continuo hasta 60'. **Correcto.**
- **Dose ladder (7 peldaños)**: De 30' a 60' útiles. Total_duration_min incluido (65-90'). **Buena calibración.**
- **Sin calentamiento/enfriamiento explícito en template**: Aceptable en ciclismo donde el rodaje suave inicial es convencional.

#### LT2 half pace (`bike_lt2_halfpace`)
- **Formato**: 2-4 x 12-30' LT2. **Correcto.** Referencia clásica 2x20' FTP.
- **Dose ladder (6 peldaños)**: De 24' a 60' útiles (2x12' a 3x20'). **Correcto.**
- **Total_duration_min**: 62-100'. **Coherente** con la práctica.

#### Over-under threshold (`bike_over_under_threshold`)
- **Formato**: 2-3 x 10-20' alternando LT1 alto / LT2. **Correcto.** Formato standard de sweet-spot training.
- **Dose ladder (5 peldaños)**: De 20' a 40' útiles con 4-5' rec. **Adecuado.** Los descansos de 5' son correctos para permitir clearance de lactato parcial.

#### SIT + LT1 progresivo (`bike_sit_lt1_progressive`)
- **Formato**: 10'D2 + 6-8 x 30'' SIT + 3-4 x 12-15' LT1. **Innovador.** Combina Sprint Interval Training con cola LT1.
- **Coach tips**: Excelentes (potencia cae >20% = descanso insuficiente).
- **Enfriamiento**: 20'. **Correcto** para post-SIT.
- **Descanso SIT**: 4' entre sprints de 30''. **Correcto.** Ratio 1:8 es standard para SIT (Gibala 2012).

#### Fuerza Q2 (`bike_fuerza_q2`)
- **Formato**: 6-12 x 8-10'' semi-parado. **Correcto.** ANC puro con máxima aplicación de fuerza.
- **Enfriamiento**: 30'. **Correcto** y coherente con la filosofía Olbrecht de "cola extensiva obligatoria post-ANC".
- **Coach tips**: Excelentes (cadencia <40rpm, descanso pasivo).

#### LT2 torque reps (`bike_lt2_torque_reps`)
- **Formato**: 5-6 x 1' LT2 @50rpm + 2' Z1 @95rpm. **Correcto.** Alternancia cadencia baja/alta para eficiencia neuromuscular.
- **OBSERVACION**: La cautela "no más de 3 semanas consecutivas de torque" es correcta y bien justificada (riesgo de sobrecarga tendinosa rodilla).

#### Half pace largo (`bike_lt2_halfpace_long`)
- **Formato**: 3 x 30' half pace. **Correcto** como versión de alta carga.
- **Calentamiento/enfriamiento**: 15'/15'. **Adecuado.**

#### Fatmax + intervalos LT1 (`bike_fatmax_intervals`)
- **Formato**: 20'E1 + 3-4x8'LT1 + 20'E1. **Correcto.** Fondo con estímulo integrado.
- **Dose ladder (5 peldaños)**: De 78' a 120' útiles (90-150' totales). **Coherente** con sesiones de fondo ciclista.
- **OBSERVACION**: Sin calentamiento/enfriamiento explícito, pero el formato E1 inicial/final cumple la función.

### Swimming (13 templates)

#### Aerobic continuity (`swim_aerobic_continuity`)
- **Formato**: 3-4 x 400-500m LT1 con 30'' rec. **Correcto** para base acuática.
- **Dose ladder (6 peldaños)**: De 24' a 30' útiles. **Correcto** para natación donde los volúmenes son menores.
- **Calentamiento**: Template descrito (400m suave + 6x50m técnica). **Correcto** para natación.

#### CSS threshold (`swim_css_threshold`)
- **Formato**: 8-10 x 100m CSS con 15'' rec, progresando a 3x400m CSS. **Correcto.** CSS (Critical Swim Speed) es el equivalente acuático del LT2.
- **Dose ladder (6 peldaños)**: De 14' a 23' útiles. **Apropiado** para la menor tolerancia al volumen intenso en agua.
- **Descansos**: 15-45'' entre repeticiones. **Correcto** — el descanso en natación es más corto por la menor carga mecánica.

#### VO2 / ANC acuático (`swim_vo2_anaerobic`)
- **Formato**: 16 x 50m VO2 con 30'' rec. **Correcto.** Repeticiones de ~35-45'' a velocidad alta con descanso activo.
- **Calentamiento**: 400m suave + drills + progresivos. **Correcto.**

#### ANC capacity sets (`swim_anc_capacity_sets`)
- **Formato**: 12-20 x 25m casi-máximos con 30-45'' pasivo. **Correcto.** Patrón ANC acuático de Olbrecht.
- **Enfriamiento**: 20' (400-800m LT1 suave). **Correcto** — cola extensiva AEC.

### Transversales (fuerza, movilidad, test, recuperación — 8 templates)

- **Fuerza general**, **adaptación anatómica**, **fuerza máxima**, **fuerza-resistencia**: Templates de soporte bien definidos con fatigue_cost apropiados (1-3) y cautelas correctas.
- **Movilidad y reset**: Correcto como recuperación activa.
- **Test profile anchor**: Correcto. Confidence 0.93 es coherente (protocolo estandarizado).
- **Descanso completo y regeneración**: fatigue_cost 1, sin spacing. **Correcto.**

---

## Calentamiento y enfriamiento

### Templates implementados

| Sesión | Calentamiento | Enfriamiento | Veredicto |
|---|---|---|---|
| LT1 extensivo | 20' (progresivo + rectas) | 10' trote | OK |
| LT2 cruise | 20' (progresivo + 200m LT2) | 10' trote | OK |
| VO2 hills | 20' (progresivo + 200m VO2) | 10' trote | OK |
| Threshold continuo | 15' progresivo | 10' trote | OK |
| LT2 short reps | 20' (progresivo + 200m) | 10' trote | OK |
| uLT1+VO2 combo | 20' (3km prog + activaciones) | **5' trote** | **BAJO** |
| ANC spice run | 15' rodaje + movilidad | 10' trote | OK |
| VO2 microburst | 20' progresivo + 100m | 20' sub-LT1 | OK |
| ANC short reps run | 20' rodaje + movilidad | 15' sub-LT1 | OK |
| Bike LT1 blocks | No definido | No definido | MEJORABLE |
| Bike LT2 halfpace | No definido | No definido | MEJORABLE |
| Bike Fuerza Q2 | 15' suave | 30' sub-LT1 | OK (cola AEC) |
| Bike SIT+LT1 | 15' suave | 20' sub-LT1 | OK |
| Swim CSS | 400m + drills + progresivos | No definido | OK natacion |
| Swim VO2 | 400m + drills + progresivos | No definido | MEJORABLE |

### Problemas detectados

1. **`run_uLT1_vo2_combo`**: Enfriamiento de 5' para una sesión VO2 fatigue_cost 5. Debería ser 10-15' minimo.
2. **`run_vo2_30_30`**: Sin calentamiento ni enfriamiento definidos. Como fatigue_cost 5 y requires_fresh, necesita minimo 15-20' de calentamiento.
3. **`run_halfpace_progressive`**: Sin calentamiento ni enfriamiento. Para fatigue_cost 4 y requires_fresh, necesita calentamiento.
4. **Templates de ciclismo de alta intensidad** (bike_vo2_power, bike_vo2_30_30): Sin calentamiento/enfriamiento explícito. En ciclismo es menos critico (el rodaje suave es convencional), pero deberia documentarse.

---

## Publicación Garmin

### Formato de workout

La implementación usa la API REST de Garmin Connect (`/workout-service/workout`) con el formato `ExecutableStepDTO` / `RepeatGroupDTO`. Esto es correcto: Garmin Connect acepta workouts JSON via esta API.

### Conversión de pasos

| Concepto | Implementación | Veredicto |
|---|---|---|
| Step types | warmup/steady/interval/recovery/cooldown/repeat mapeados correctamente a Garmin stepTypeIds | OK |
| End conditions | time (conditionTypeId 2), distance (3), lap_button (1) | OK |
| Repeat groups | RepeatGroupDTO con numberOfIterations | OK |
| Targets pace | value_from/value_to en s/km -> Garmin pace zone | OK |
| Targets HR | value_from/value_to bpm -> Garmin HR zone | OK |
| Targets power | value_from/value_to watts -> Garmin power zone | OK |
| Targets free | No target (workoutTargetTypeId 1) | OK |
| Sport types | running/ciclismo/natacion mapeados via _SPORT_TYPE_MAP | OK |
| Scheduling | POST /workout-service/schedule/{workoutId} best-effort | OK |
| Instructions | Truncadas a 200 chars (limite Garmin) | OK |

### Flujo completo

1. `prepare_planned_session_for_publish()` genera WorkoutDefinition via `build_workout_definition()` o `build_library_workout_definition()`
2. Si el coach edito manualmente (`coach_edited` flag), se preserva el payload editado
3. `push_workout_to_garmin()` convierte a Garmin payload y envia via garth (wrapper de Garmin Connect API)
4. Si hay fecha, intenta schedule (best-effort)
5. Token se refresca automaticamente

### Problemas detectados

1. **`_parse_recovery` solo detecta "descanso", "recovery", "rest"**: Si un template usa "rec" o "D:" como marcador de descanso (ej: `"3 x 2km LT1 D:500m"`), el parser no extraera la pausa. En la practica, el `build_library_workout_definition` usa el `rest_min` del DoseStep directamente, evitando este problema para dose_ladder. Pero para `csv_examples` parseadas, el recovery no se detectara.

2. **Targets genericos sin rango numerico**: La mayoria de templates generados via dose_ladder usan `WorkoutTarget(target_type="other", label=zone)` — Garmin recibe `no.target` con una descripcion textual. Esto funciona (el atleta ve la nota en el reloj) pero no activa alertas de zona en el dispositivo. Para sesiones con pace/HR/power conocidos, seria mejor generar targets numericos.

### Veredicto

**Funcional y correcto.** La implementacion cubre el flujo completo de creacion, edicion manual, y push a Garmin. El formato JSON es compatible con la API de Garmin Connect. Las limitaciones (targets genericos) son menores y no impiden el uso.

---

## BLa check placement

### Logica de colocacion (`mesocycle_prescription.py`)

```
Regla:
- 1 BLa en semana de LOAD (acumulacion) → sesion KEY mas temprana → "referencia pre-bloque"
- 1 BLa en ultima semana de BUILD/BUILD_PEAK → sesion KEY mas temprana → "validacion del estimulo"
- Si solo hay 1-2 semanas: un solo BLa en la primera semana
- El entrenador puede mover/añadir BLa con toggle manual
```

### Analisis

- **Frecuencia**: 2 BLa por mesociclo (uno de referencia, uno de validacion). **Correcto.** Olbrecht recomienda lactato para validar el bloque, no para dirigir cada sesion.
- **Colocacion**: En la primera sesion KEY de la semana designada. **Correcto** — permite lectura limpia sin fatiga acumulada de la semana.
- **Razon guardada en payload**: `bla_check_reason` con texto descriptivo. **Correcto** para trazabilidad.
- **Toggle manual del entrenador**: Via endpoint PATCH. **Correcto** — permite flexibilidad sin romper el automatismo.

### Recomendaciones

- **Considerar 3 BLa para mesociclos de 5+ semanas**: referencia (load), mid-point (build), validacion (build_peak). Esto daria una curva de 3 puntos para evaluar la tendencia del bloque.
- **BLa en sesion SUB-T o LT2**: Actualmente se marca en la primera KEY. Si la KEY es una sesion VO2 o ANC, el lactato post-repeticion no sera comparable con una sesion LT1/LT2. Considerar filtrar por familia para que el BLa se coloque en sesiones de tipo LT2 o SUB-T preferentemente.

---

## Hallazgos criticos

### H1: Enfriamiento insuficiente en `run_uLT1_vo2_combo` (5 min)
**Severidad: Media.** Una sesion con fatigue_cost 5 que incluye bloques VO2 necesita minimo 10-15' de enfriamiento para:
- Facilitar clearance de lactato (Menzies et al. 2010)
- Reducir la activacion simpatica post-ejercicio
- Prevenir rigidez muscular

**Recomendacion**: Subir `enfriamiento_min` de 5 a 10-15.

### H2: `run_vo2_30_30` sin calentamiento ni enfriamiento
**Severidad: Media.** Sesion de fatigue_cost 5 y requires_fresh sin calentamiento definido. El VO2 30-30 requiere activacion neuromuscular previa para:
- Alcanzar VO2max rapidamente en las primeras repeticiones (Midgley 2006)
- Reducir riesgo de lesion con esfuerzos maximos desde el inicio

**Recomendacion**: Añadir `calentamiento_min=20`, `calentamiento_template="15' progresivo + 4 x 100m a ritmo VO2 con 2' andando."`, `enfriamiento_min=10`.

### H3: `run_halfpace_progressive` sin calentamiento
**Severidad: Baja.** Sesion de fatigue_cost 4 sin calentamiento. Menos critico que VO2 porque la intensidad es subumbral alta, pero deberia tener 10-15' de calentamiento.

### H4: DoseStep con `total_useful_time_min=0` en templates ANC/spice
**Severidad: Baja.** Los templates ANC (run_anc_submax_spice, bike_anc_submax_spice, bike_fuerza_q2, run_escalated_lt1) tienen `total_useful_time_min=0` en sus DoseSteps. Esto es incorrecto — el campo deberia reflejar la suma del spice + cola LT1. La UI podria mostrar "0 min utiles" cuando en realidad hay 30-45' de trabajo.

**Recomendacion**: Calcular y asignar `total_useful_time_min` correctamente. Ejemplo para `"4×20'' + 6×4' LT1"`: spice ~1.5' + cola 24' = ~26' utiles.

### H5: Evidence sources no existentes referenciadas
**Severidad: Minima.** Algunos templates nuevos referencian `evidence_ids` que no estan en `EVIDENCE_SOURCES`:
- `"seiler_2013_tid"`, `"stoggl_2014_polarized"`, `"seiler_2006_tid"`, `"gibala_2012_sprint"`, `"mujika_2010_taper"`, `"tonnessen_2014_openers"`

Esto no causa errores en runtime (la funcion `evidence_for_ids` filtra silenciosamente), pero significa que estos templates no tienen trazabilidad bibliografica completa.

---

## Recomendaciones

### Prioridad alta
1. **Subir enfriamiento de `run_uLT1_vo2_combo`** de 5' a 10-15'.
2. **Añadir calentamiento/enfriamiento a `run_vo2_30_30`** (20' / 10').
3. **Corregir `total_useful_time_min=0`** en 6 templates ANC/spice.

### Prioridad media
4. **Añadir calentamiento a `run_halfpace_progressive`** (15' + enfriamiento 10').
5. **Añadir evidence sources faltantes** a `EVIDENCE_SOURCES` dict.
6. **Considerar targets numericos** para Garmin push en sesiones con pace/HR/power conocidos (mejoraria alertas en dispositivo).
7. **Considerar 3 BLa** para mesociclos de 5+ semanas.

### Prioridad baja
8. **Documentar calentamiento convencional en ciclismo** para templates que no lo definen explicitamente.
9. **Filtrar BLa check** por familia de sesion (preferir LT2/SUB-T sobre VO2/ANC para comparabilidad).
10. **Revisar pausa del peldaño 5 de `run_lt2_short_reps`** (2' entre doble bloque de 6x3' — considerar 3-4').

---

## Coach tips — analisis de calidad

Los coach_tips son en general **excelentes**. Puntos fuertes:
- **Especificos y accionables**: "Si el ritmo cae >5'' en la ultima serie, el volumen es demasiado alto para hoy"
- **Calibrados fisiologicamente**: "Si hay deriva cardiaca antes del min 4, la intensidad es demasiado alta"
- **Coherentes con Olbrecht**: "Spice siempre AL INICIO", "descanso pasivo"
- **Incluyen señales de alerta**: "Si el uLT1 final no sale, la sesion de VO2 fue demasiado larga"

Templates sin coach_tips (deberian tenerlos): `run_long_aerobic`, `run_specific_durability`, `run_progressive_aerobic`, `run_e2_steady`, `run_lt1_lt2_mix`, `run_subthreshold_3min`. Estos son templates mas antiguos que podrian beneficiarse de coach_tips.

---

## Arquitectura del WorkoutStepEditor (frontend)

### Funcionalidades
- Editor de pasos con tipos (calentamiento, intervalo, continuo, recuperacion, enfriamiento, repeticion)
- 7 zonas de intensidad (Easy, LT1, SUB-T, LT2, VO2, MAX, Libre)
- Targets de HR (bpm min/max) editables
- Mini timeline visual con alturas proporcionales a la intensidad
- Soporte para repeat steps con children editables
- Duracion en formato flexible (3', 90'', 1km, 3:30)
- Flag `coach_edited` para preservar cambios manuales en el push a Garmin

### Veredicto
**Bien implementado.** El editor cubre todos los step types del schema WorkoutDefinition, permite targets de HR, y la timeline visual es una buena herramienta de comunicacion coach-atleta.

---

## Referencias bibliograficas

- Billat VL et al. (2001). Interval training at VO2max: effects on aerobic performance and overtraining markers. *Med Sci Sports Exerc*.
- Daniels J (2014). *Daniels' Running Formula*. 3rd ed. Human Kinetics.
- Faude O et al. (2009). Lactate threshold concepts. *Sports Med*.
- Gibala MJ et al. (2012). Physiological adaptations to low-volume, high-intensity interval training. *J Physiol*.
- Menzies P et al. (2010). Blood lactate clearance during active recovery after an intense running bout. *Int J Sports Med*.
- Midgley AW et al. (2006). Training to enhance the physiological determinants of long-distance running performance. *Sports Med*.
- Olbrecht J. *The Science of Winning*. F&G Partners.
- Seiler S (2006). What is best practice for training intensity and duration distribution in endurance athletes? *Int J Sports Physiol Perform*.
- Seiler S et al. (2013). Adaptations to aerobic interval training: interactive effects of exercise intensity and total work duration. *Scand J Med Sci Sports*.
- Solli GS et al. (2017). The training characteristics of the world's most successful female cross-country skier. *Front Physiol*.
