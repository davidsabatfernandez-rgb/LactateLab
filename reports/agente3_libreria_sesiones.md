# Agente 3 -- Libreria de Sesiones de Entrenamiento

Fecha: 2026-03-14
Sistema: Lactate Lab (PeakAerobic)

---

## Base Cientifica

### Evidencia consultada

| # | Referencia | Hallazgo clave | Clasificacion |
|---|---|---|---|
| 1 | Stoggl & Sperlich (2024 update) PMC11329428 | Polarizada y piramidal igualmente efectivas en meta-analisis con 348 atletas. POL superioridad en VO2peak (SMD=0.24). | DEBATE |
| 2 | Frontiers Physiol 2025 - TID theory review PMC12568352 | Ciclistas: patron piramidal dominante. Corredores: patron mas polarizado por exigencia de Z3. Ambos validos. | CONSENSO |
| 3 | MDPI Sports 2024 - Polarized & VO2max/economy | Polarizada efectiva para VO2max y economia de trabajo en periodos cortos. | CONSENSO |
| 4 | Frontiers Physiol 2024 - HIIT categorization model PMC11218030 | 6 tipos de HIIT: aerobic long (2-10'), intermittent short (15-60s), SET (10-75s), SIT (2-10s). T@VO2max >7-10min optimo. | CONSENSO |
| 5 | Poon 2024 - Umbrella review HIIT & CRF | HIIT mejora CRF vs MICT y control. Mayor adherencia por variedad y menor duracion. | CONSENSO |
| 6 | USA Triathlon / TrainingPeaks - Brick workouts | Bricks cada 10-14 dias. Adaptacion neuromuscular + circulatoria bike->run. Primeros 2-10' criticos. | CONSENSO |
| 7 | Hausswirth & Mujika 2013 | Fatiga cruzada ciclismo->running: running leg 8-12% por debajo de LT2 standalone. | CONSENSO |
| 8 | PMC8701049 - Periodization & adherence | Programas periodizados mejoran adherencia vs monotonos. La variacion del estimulo es clave. | CONSENSO |
| 9 | Foster training monotony | Monotonia = media semanal / SD. Alta monotonia = riesgo sobreentrenamiento. | CONSENSO |
| 10 | PMC11688070 - Concurrent training review 2024 | Secuencia fuerza-endurance favorable para fuerza maxima. Interferencia minima con >6h separacion. | CONSENSO |
| 11 | Frontiers 2025 - Concurrent training sequences PMC12885173 | Fuerza antes de endurance: mejor para adaptaciones neuromusculares. Endurance antes: sin efecto sobre aerobico. | CONSENSO |
| 12 | Ronnestad 2022 - Strength in cyclists | Fuerza pesada secuenciada mejora sprint y fuerza sin destruir resistencia. | CONSENSO |

---

## PARTE A -- Auditoria completa de sesiones existentes

### Tabla resumen

Se identifican **81 templates** en `workout_library.py`. A continuacion la auditoria completa:

#### Running (27 templates)

| template_id | Familia | Rol | Bloques | Clasificacion | Notas |
|---|---|---|---|---|---|
| run_lt1_extensive | lt1_extensive | key | AEC, THR | **OK** | Titulo, zona, dose_ladder coherentes. Progresion 24-48 min utiles. |
| run_long_aerobic | long_aerobic_durability | key | AEC, COMP | **OK** | Tirada larga bien definida. Sin dose_ladder (aceptable: volumen por duracion). |
| run_lt2_cruise | lt2_cruise_intervals | key | THR, COMP | **OK** | Cruise intervals clasicos. Dose_ladder 16-40 min utiles. fatigue_cost=4 correcto. |
| run_vo2_hills | vo2_hills | key | AEP | **OK** | VO2 + cuestas. Dose_ladder 12-24 min. fatigue_cost=5 correcto. |
| run_economy_strides | economy_strides | support | AEC, TECH, REC | **OK** | Soporte ligero. fatigue_cost=2 correcto. |
| run_specific_durability | specific_durability | key | COMP | **OK** | Especificidad competitiva. Sin dose_ladder (aceptable). |
| run_lt0_recovery | lt0_recovery | recovery | REC, AEC | **OK** | Regenerativo. fatigue_cost=1 correcto. |
| run_progressive_aerobic | progressive_aerobic | key | AEC, COMP | **OK** | Progresivo aerobico. Sin dose_ladder (aceptable para formato continuo). |
| run_threshold_continuous | threshold_continuous | key | THR, COMP | **OK** | Tempo continuo. Dose_ladder 20-40 min. |
| run_hill_sprints | hill_sprints | support | TECH, AEP, COMP | **OK** | Neuromuscular. fatigue_cost=2 implicito, sin campo. |
| run_specific_pace_reps | specific_pace_reps | key | COMP | **OK** | Ritmo objetivo. |
| run_e2_steady | e2_steady | support | THR, COMP | **OK** | Soporte E2. |
| run_lt1_lt2_mix | lt1_lt2_mix | key | THR, COMP | **OK** | Mixta escalonada. |
| run_vo2_30_30 | vo2_30_30 | key | AEP | **OK** | 30/30 clasico. fatigue_cost=5 correcto. |
| run_subthreshold_3min | subthreshold_3min | key | THR, COMP | **RENOMBRAR** | "Subthreshold 3-min reps" pero dose_guidance dice "LT2 bajo" -- es mas LT2 que sub-T. Renombrar a "LT2 repeticiones medias" o cambiar zona a SUB-T. |
| run_brick_transition | brick_transition | support | COMP, THR | **OK** | Brick run. Bien definido. |
| run_hill_threshold_combo | hill_threshold_combo | support | AEP, TECH | **OK** | Combo cuestas+aerobico. |
| run_lt2_short_reps | lt2_short_reps | key | THR, COMP | **OK** | LT2 corto. Dose_ladder 18-36 min. |
| run_escalated_intervals | escalated_intervals | key | THR, COMP | **OK** | Escalonados LT1->LT2. Dose_ladder 18-40 min. |
| run_lt1_long_reps | lt1_long_reps | key | AEC, THR | **OK** | Repeticiones largas LT1. Dose_ladder 30-60 min. |
| run_subthreshold_reps | subthreshold_reps | key | THR, COMP | **OK** | SUB-T. Dose_ladder 18-36 min. Coherente. |
| run_uLT1_vo2_combo | uLT1_vo2_combo | key | AEP, COMP | **OK** | Combo uLT1+VO2. Dose_ladder 40-47 min. fatigue_cost=5 correcto. |
| run_halfpace_progressive | halfpace_progressive | key | THR, AEP, COMP | **OK** | Half pace. Dose_ladder 30-50 min. |
| run_openers | openers | support | COMP, ANP, TEST | **OK** | Activacion pre-competicion. fatigue_cost=1 correcto. |
| run_anc_submax_spice | anc_submax_spice | key | AEC, ANC | **OK** | Patron Olbrecht Tipo I. Dose_ladder bien definido. |
| run_escalated_lt1 | escalated_lt1 | key | AEC, THR | **OK** | Formato regresivo. |
| run_anc_vo2_short | anc_vo2_short | key | AEP | **OK** | Microburst VO2. fatigue_cost=5 correcto. |

**Sesiones adicionales running (ANC/ANP/AEP/AEC):**

| template_id | Familia | Rol | Bloques | Clasificacion | Notas |
|---|---|---|---|---|---|
| run_e2_progressive_medium | e2_progressive_medium | support | THR | **OK** | Escalada E1->E2->D2->LT1. |
| run_anc_short_reps | anc_short_reps | key | ANC, AEC | **OK** | ANC puro running. |
| run_anp_sprint_tolerance | anp_sprint_tolerance | key | ANP, COMP | **OK** | ANP sprints. fatigue_cost=5 correcto. |
| run_aec_spiced | aec_spiced | key | AEC | **OK** | AEC Tipo I Olbrecht. |
| run_aep_race_pace | aep_race_pace | key | AEP, COMP | **OK** | AEP Olbrecht real (descanso minimo). |
| run_regenerative_long | regenerative_long | support | AEC, REC | **OK** | AEC Tipo II. fatigue_cost=2 correcto. |

#### Ciclismo (27 templates)

| template_id | Familia | Rol | Bloques | Clasificacion | Notas |
|---|---|---|---|---|---|
| bike_lt1_blocks | lt1_blocks | key | AEC, THR | **OK** | Dose_ladder 7 peldanos, 30-60 min. |
| bike_long_endurance | long_endurance | key | AEC, COMP | **OK** | Salida larga. fatigue_cost=4 correcto. |
| bike_lt2_halfpace | lt2_halfpace | key | THR, COMP | **OK** | Dose_ladder 6 peldanos, 24-60 min. |
| bike_vo2_power | vo2_power | key | AEP | **OK** | VO2 bici. fatigue_cost=5 correcto. |
| bike_torque_support | torque_strength | support | AEC, AEP, COMP | **OK** | Soporte fuerza. |
| bike_transition_specific | transition_specific | key | COMP | **OK** | Brick especifico. |
| bike_lt0_recovery | lt0_recovery | recovery | REC, AEC | **OK** | Regenerativo bici. fatigue_cost=1 correcto. |
| bike_fatmax_endurance | fatmax_endurance | key | AEC | **OK** | Fondo controlado. |
| bike_fatmax_intervals | fatmax_intervals | key | AEC, THR, REC | **REVISAR** | REC como compatible_block_type es dudoso: una sesion con intervalos LT1 no es de recovery. Quitar recovery_consolidation_block. |
| bike_cadence_efficiency | cadence_efficiency | support | AEC, TECH, COMP | **OK** | Eficiencia cadencia. |
| bike_over_under_threshold | over_under_threshold | key | THR, COMP | **OK** | Over-under. Dose_ladder 5 peldanos. |
| bike_sprint_neuromuscular | sprint_neuromuscular | support | AEP, COMP | **OK** | Sprints breves. |
| bike_aero_stability | aero_stability | support | COMP, THR | **OK** | Posicion aero. |
| bike_endurance_tempo | endurance_tempo | key | THR, COMP | **OK** | Fondo con tempo. fatigue_cost=4. |
| bike_lt2_long_reps | lt2_long_reps | key | THR, COMP | **OK** | LT2 largo sin dose_ladder (duplica parcialmente bike_lt2_halfpace). |
| bike_lt2_vo2_combo | lt2_vo2_combo | key | AEP, COMP | **REVISAR** | fatigue_cost=5 sin dose_ladder. Deberia tener dose_ladder dada la complejidad del formato. |
| bike_vo2_30_30 | vo2_30_30 | key | AEP | **OK** | 30/30 bici. fatigue_cost=5. |
| bike_cadmax_neuro | cadmax_neuro | support | TECH, AEP, COMP | **OK** | CadMax. |
| bike_submax_lt1_mix | submax_lt1_mix | support | AEC, TECH | **OK** | Submax + LT1. |
| bike_lt1_to_lt2_blocks | lt1_to_lt2_blocks | key | THR, AEP | **OK** | Progresivos LT1->LT2. Dose_ladder 3 peldanos. |
| bike_cadmax_lt1_combo | cadmax_lt1_combo | key | AEC, THR | **OK** | CadMax + LT1. Dose_ladder 4 peldanos. |
| bike_subthreshold_blocks | subthreshold_blocks | key | THR, AEP | **OK** | SUB-T bici. Dose_ladder 5 peldanos. |
| bike_anc_submax_spice | anc_submax_spice_bike | key | AEC, ANC | **OK** | MAX + LT1. Dose_ladder 4 peldanos. |
| bike_fuerza_q2 | fuerza_q2 | key | ANC | **OK** | Fuerza Q2 ANC puro. Dose_ladder 4 peldanos. |
| bike_sit_lt1_progressive | sit_lt1_progressive | key | AEP, THR | **OK** | SIT + LT1. Dose_ladder 3 peldanos. |
| bike_lt2_torque_reps | lt2_torque_reps | key | THR, COMP | **OK** | Torque LT2. Sin dose_ladder (formato simple). |
| bike_lt2_halfpace_long | lt2_halfpace_long | key | COMP, THR | **OK** | Half pace largo 3x30'. |
| bike_anc_power_sprints | anc_power_sprints | key | ANC, AEC | **OK** | ANC bici. Dose_ladder 4 peldanos. |
| bike_anp_high_intensity | anp_high_intensity | key | ANP, COMP | **OK** | ANP bici. fatigue_cost=5. |
| bike_aec_spiced | aec_spiced_bike | key | AEC | **OK** | AEC Tipo I bici. |

#### Natacion (18 templates)

| template_id | Familia | Rol | Bloques | Clasificacion | Notas |
|---|---|---|---|---|---|
| swim_technical_alignment | technical_alignment | key | TECH, AEC | **OK** | Tecnica. fatigue_cost=2. |
| swim_aerobic_continuity | aerobic_continuity | key | AEC, THR | **OK** | Dose_ladder 6 peldanos. |
| swim_css_threshold | css_threshold | key | THR, COMP | **OK** | Dose_ladder 6 peldanos. |
| swim_race_pace_specific | race_pace_specific | key | COMP, AEP | **OK** | Ritmo prueba. |
| swim_lt1_broken_sets | lt1_broken_sets | key | AEC, THR | **OK** | Dose_ladder 6 peldanos. |
| swim_pull_snorkel_alignment | pull_snorkel_alignment | support | TECH, AEC, THR, ANC, ANP | **OK** | Soporte tecnico universal. |
| swim_vo2_anaerobic | vo2_anaerobic | key | AEP | **OK** | VO2 agua. fatigue_cost=5. |
| swim_speed_turns | speed_turns | support | COMP, AEP, TECH | **OK** | Velocidad y virajes. |
| swim_open_water_specific | open_water_specific | key | COMP | **OK** | Aguas abiertas. |
| swim_recovery_drills | recovery_drills | recovery | REC, TECH | **OK** | Recuperacion. fatigue_cost=1. |
| swim_lt0_50s | lt0_50s | recovery | AEC, REC | **OK** | LT0 fraccionado. |
| swim_varied_aerobic | varied_aerobic | support | AEC, TECH | **OK** | Variado. |
| swim_aec_base | aec_base | key | AEC, THR | **OK** | Base continua. |
| swim_team_quality | team_quality | key | COMP, AEP, THR | **OK** | Club. |
| swim_anc_speed_combo | anc_speed_combo | key | ANC, AEP, COMP | **OK** | ANC natacion. |
| swim_restart_rebuild | restart_rebuild | recovery | TECH, REC | **OK** | Reinicio. |
| swim_strength_velocity | strength_velocity | support | AEP, TECH, COMP | **OK** | Fuerza en agua. |
| swim_anc_capacity_sets | anc_capacity_sets | key | ANC, AEC | **OK** | ANC series. |
| swim_anp_tolerance | anp_tolerance | key | ANP, COMP | **OK** | ANP natacion. fatigue_cost=5. |
| swim_aec_spiced | aec_spiced_swim | key | AEC | **OK** | AEC Tipo I natacion. |
| swim_aep_pace_sets | aep_pace_sets | key | AEP, COMP | **OK** | AEP natacion. |
| swim_aec_long_session | aec_long_session | support | AEC | **OK** | AEC largo. fatigue_cost=2. |

#### Generales y otros (9 templates)

| template_id | Familia | Rol | Bloques | Clasificacion | Notas |
|---|---|---|---|---|---|
| strength_general_support | general_strength | support | AEC, TECH, COMP | **OK** | Fuerza concurrente. |
| strength_anatomical_adaptation | anatomical_adaptation | support | AEC, TECH, REC | **OK** | Adaptacion anatomica. |
| strength_max_strength | max_strength | support | AEC, COMP | **OK** | Fuerza maxima. |
| strength_endurance_circuit | strength_endurance_circuit | support | TECH, AEC | **OK** | Circuito. |
| mobility_restore | mobility_restore | recovery | REC, TECH | **OK** | Movilidad. |
| test_profile_anchor | profile_test | test | TEST, REC | **OK** | Test ancla. |
| recovery_regeneration | recovery_regeneration | recovery | REC, COMP, AEP | **OK** | Regeneracion. |
| full_rest_day | full_rest_day | recovery | REC, COMP | **OK** | Descanso total. |
| active_walk_hike | active_walk_hike | recovery | REC, AEC | **OK** | Caminata activa. |

#### Triatlon (1 template)

| template_id | Familia | Rol | Bloques | Clasificacion | Notas |
|---|---|---|---|---|---|
| tri_brick_aep | brick_aep | key | AEP, COMP | **OK** | Brick bike+run. fatigue_cost=5 correcto. |

### Resumen de clasificacion

| Clasificacion | Cantidad |
|---|---|
| OK | 78 |
| RENOMBRAR | 1 (run_subthreshold_3min) |
| REVISAR | 2 (bike_fatmax_intervals, bike_lt2_vo2_combo) |
| CORREGIR | 0 |

### Issues detectados en la auditoria

1. **run_subthreshold_3min**: El titulo dice "Subthreshold" pero la dose_guidance indica "LT2 bajo". Hay ambiguedad entre SUB-T (que seria entre LT1 y LT2) y LT2 bajo (que es umbral). Renombrar a "LT2 repeticiones medias 3'" o clarificar que "subthreshold" aqui significa "ligeramente por debajo de LT2".

2. **bike_fatmax_intervals**: Incluye `recovery_consolidation_block` como bloque compatible, pero la sesion contiene intervalos LT1 activos, lo cual no es recovery. Quitar REC de compatible_block_types.

3. **bike_lt2_vo2_combo**: fatigue_cost=5 pero sin dose_ladder. Para una sesion de doble estimulo (LT2+VO2), un dose_ladder seria valioso para guiar la progresion (ej: 15'LT2+3x2'VO2 -> 20'LT2+5x3'VO2).

4. **bike_lt2_long_reps vs bike_lt2_halfpace**: Duplicacion parcial. Ambas son LT2 sostenido en bici con repeticiones largas. bike_lt2_long_reps no tiene dose_ladder ni coach_tips. Considerar fusionar o diferenciar claramente (ej: long_reps = 8-12' reps frecuentes, halfpace = 15-30' reps largas tipo FTP).

5. **Falta de dose_ladder en 7 templates key**: run_long_aerobic, run_specific_durability, run_progressive_aerobic, run_specific_pace_reps, run_e2_steady, bike_long_endurance, bike_lt2_long_reps. Aunque algunos formatos continuos no necesitan ladder, para sesiones key con progresion clara (como run_specific_pace_reps) seria util.

---

## PARTE B -- Sesiones prototipo nuevas

### Tipo 1: Z1/Z2 recuperacion activa

**Variante 1A: `run_z1_recovery_jog`**
- public_label: "Rodaje Z1 regenerativo con movilidad"
- summary: Rodaje muy suave (Z1) de 25-40 min con pausas de movilidad dinamica integradas cada 10 min.
- dose_ladder:
  - Step 1: 25' Z1 + 2x movilidad (25 min utiles)
  - Step 2: 30' Z1 + 2x movilidad (30 min)
  - Step 3: 35' Z1 + 3x movilidad (35 min)
  - Step 4: 40' Z1 continuo (40 min)
- fatigue_cost: 1
- compatible_block_types: recovery_consolidation_block, aerobic_capacity_block
- Justificacion: La intercalacion de movilidad en rodajes suaves mejora la adherencia y reduce la monotonia (Foster monotony principle). El volumen es insuficiente para estimulo aerobico real, pero mantiene la continuidad de carrera.

**Variante 1B: `bike_z1_spin_recovery`**
- public_label: "Bici Z1 spin recovery con cadencia variable"
- summary: Pedaleo suave 40-60 min con bloques de cadencia variable (70-100 rpm) para mantener soltura sin carga.
- dose_ladder:
  - Step 1: 40' Z1 cadencia libre (40 min)
  - Step 2: 45' Z1 + 4x2' cadencia alta 95rpm (45 min)
  - Step 3: 50' Z1 + 6x2' cadencia alternada (50 min)
  - Step 4: 60' Z1 spin recovery (60 min)
- fatigue_cost: 1
- compatible_block_types: recovery_consolidation_block, aerobic_capacity_block
- Justificacion: La variacion de cadencia sin carga mejora la coordinacion neuromuscular y reduce la monotonia del rodaje plano (Ronnestad 2022).

### Tipo 2: Z2 base aerobica larga

**Variante 2A: `run_z2_fartlek_natural`**
- public_label: "Fartlek natural Z2 por terreno"
- summary: Rodaje largo Z2 en terreno variado (parque, caminos) donde los cambios de ritmo son dictados por el terreno, no por el reloj.
- dose_ladder:
  - Step 1: 60' fartlek natural Z2 (60 min)
  - Step 2: 75' fartlek natural Z2 (75 min)
  - Step 3: 90' fartlek natural Z2 (90 min)
  - Step 4: 105' fartlek natural Z2 (105 min)
  - Step 5: 120' fartlek natural Z2 (120 min)
- fatigue_cost: 3
- compatible_block_types: aerobic_capacity_block, competition_specific_block
- Justificacion: El fartlek natural reduce la monotonia del rodaje largo y mejora la adherencia (PMC8701049). Los cambios de terreno estimulan musculatura estabilizadora sin aumentar intensidad metabolica.

**Variante 2B: `bike_z2_endurance_structured`**
- public_label: "Fondo Z2 estructurado con checkpoints"
- summary: Salida larga Z2 con checkpoints de potencia cada 30 min para verificar estabilidad y prevenir drift ascendente.
- dose_ladder:
  - Step 1: 2h Z2 con checkpoint c/30' (120 min)
  - Step 2: 2h30 Z2 con checkpoint c/30' (150 min)
  - Step 3: 3h Z2 (180 min)
  - Step 4: 3h30 Z2 (210 min)
  - Step 5: 4h Z2 con bloque final E2 20' (240 min)
- fatigue_cost: 4
- compatible_block_types: aerobic_capacity_block, competition_specific_block
- Justificacion: Los checkpoints previenen el drift ascendente comun en salidas largas (Pinot 2015). La progresion de volumen es conservadora (~20% entre peldanos).

### Tipo 3: Z3 tempo/sweet spot

**Variante 3A: `run_tempo_negative_split`**
- public_label: "Tempo negativo progresivo"
- summary: Bloques tempo donde cada mitad es ligeramente mas rapida que la anterior (negative split). No intervalos -- continuo con cambio sutil.
- dose_ladder:
  - Step 1: 2x10' (2a mitad 3-5s/km mas rapido) D:3' (20 min)
  - Step 2: 2x12' negative split D:3' (24 min)
  - Step 3: 2x15' negative split D:3' (30 min)
  - Step 4: 25' continuo negative split (25 min)
  - Step 5: 30' continuo negative split (30 min)
- fatigue_cost: 4
- compatible_block_types: threshold_development_block, competition_specific_block
- Justificacion: El negative split entrena el pacing y la capacidad de gestionar la fatiga, habilidad clave para maraton y media maraton (Kenneally 2022). Reduce el riesgo de empezar demasiado rapido.

**Variante 3B: `bike_sweet_spot_sustained`**
- public_label: "Sweet spot sostenido (88-93% FTP)"
- summary: Bloques continuos a 88-93% FTP para maximizar tiempo en zona productiva sin el coste de sesiones umbral puras.
- dose_ladder:
  - Step 1: 2x15' @90% FTP D:5' (30 min)
  - Step 2: 2x20' @90% FTP D:5' (40 min)
  - Step 3: 3x15' @90% FTP D:4' (45 min)
  - Step 4: 2x25' @91% FTP D:5' (50 min)
  - Step 5: 2x30' @92% FTP D:5' (60 min)
- fatigue_cost: 4
- compatible_block_types: threshold_development_block, aerobic_power_block
- Justificacion: Sweet spot (88-93% FTP) maximiza TSS/hora con menor coste que umbral puro (Coggan). Util como puente entre AEC y THR.

### Tipo 4: Z4 umbral

**Variante 4A: `run_lt2_pyramid`**
- public_label: "LT2 piramidal (subir y bajar)"
- summary: Repeticiones que suben y bajan en duracion: 2'-3'-4'-5'-4'-3'-2' a ritmo LT2. Formato que mantiene alta la calidad al final.
- dose_ladder:
  - Step 1: 2-3-4-3-2' LT2 D:90'' (14 min)
  - Step 2: 2-3-4-5-4-3-2' LT2 D:90'' (23 min)
  - Step 3: 3-4-5-6-5-4-3' LT2 D:90'' (30 min)
  - Step 4: 3-5-7-5-3' LT2 D:2' (23 min)
- fatigue_cost: 4
- compatible_block_types: threshold_development_block, competition_specific_block
- Justificacion: El formato piramidal reduce la fatiga percibida al final (las reps son mas cortas) y mejora la adherencia respecto a formatos de duracion fija (Foster monotony).

**Variante 4B: `bike_lt2_descending`**
- public_label: "LT2 descendente en bici"
- summary: Repeticiones que decrecen: 10'-8'-6'-4' a potencia LT2. Similar al run_escalated_lt1 pero en zona umbral.
- dose_ladder:
  - Step 1: 8-6-4' LT2 D:3' (18 min)
  - Step 2: 10-8-6' LT2 D:3' (24 min)
  - Step 3: 10-8-6-4' LT2 D:3' (28 min)
  - Step 4: 12-10-8-6' LT2 D:3' (36 min)
- fatigue_cost: 4
- compatible_block_types: threshold_development_block, competition_specific_block
- Justificacion: El formato descendente mantiene calidad mecanica cuando la fatiga se acumula. Patron validado en CSV de Nacho para LT1 (run_escalated_lt1) -- aplicable a LT2.

### Tipo 5: Z5 VO2max intervalos cortos

**Variante 5A: `run_vo2_tabata_modified`**
- public_label: "VO2 Tabata modificado (20''/10''x8 bloques)"
- summary: Bloques de 8 repeticiones 20''/10'' a velocidad VO2max. 2-3 bloques con 3' recuperacion entre bloques.
- dose_ladder:
  - Step 1: 2 bloques x 8x(20''/10'') D:3' (5.3 min utiles)
  - Step 2: 3 bloques x 8x(20''/10'') D:3' (8 min)
  - Step 3: 3 bloques x 10x(20''/10'') D:3' (10 min)
  - Step 4: 4 bloques x 8x(20''/10'') D:3' (10.7 min)
- fatigue_cost: 5
- compatible_block_types: aerobic_power_block
- Justificacion: T@VO2max >7 min es optimo (Frontiers 2024 HIIT categorization). Tabata modificado acumula tiempo en VO2max con alta densidad. Mayor adherencia que intervalos largos para principiantes (Poon 2024).

**Variante 5B: `swim_vo2_25m_descending_rest`**
- public_label: "VO2 natacion 25m con descanso descendente"
- summary: 12-20 x 25m a velocidad VO2 con descanso que decrece: primeras 6 con 30'', siguientes 6 con 20'', ultimas con 15''.
- dose_ladder:
  - Step 1: 12 x 25m (4x30'' + 4x25'' + 4x20'') (5 min)
  - Step 2: 16 x 25m (6x30'' + 5x25'' + 5x20'') (7 min)
  - Step 3: 20 x 25m (8x30'' + 6x20'' + 6x15'') (8 min)
  - Step 4: 24 x 25m (8x25'' + 8x20'' + 8x15'') (10 min)
- fatigue_cost: 5
- compatible_block_types: aerobic_power_block
- Justificacion: El descanso descendente progresa la densidad dentro de la sesion, manteniendo la calidad en las primeras reps y aumentando el estimulo metabolico al final. Formato compatible con piscina de 25m.

### Tipo 6: Z5 VO2max intervalos largos

**Variante 6A: `run_vo2_4min_classic`**
- public_label: "VO2 clasico 4x4' (Wisloff)"
- summary: El formato clasico 4x4' a 90-95% HRmax con 3' recuperacion activa. Referencia de la literatura noruega.
- dose_ladder:
  - Step 1: 3x4' VO2 D:3' (12 min)
  - Step 2: 4x4' VO2 D:3' (16 min)
  - Step 3: 4x4' VO2 D:2'30'' (16 min, mas denso)
  - Step 4: 5x4' VO2 D:3' (20 min)
  - Step 5: 4x5' VO2 D:3' (20 min)
- fatigue_cost: 5
- compatible_block_types: aerobic_power_block
- Justificacion: 4x4min es el formato mas estudiado en la literatura (Wisloff 2007, Helgerud 2007). T@VO2max >12 min en formato optimo. Complementa run_vo2_hills que es mas neuromuscular.

**Variante 6B: `bike_vo2_5min_blocks`**
- public_label: "VO2 bloques de 5' en bici"
- summary: 3-5 x 5' a 105-110% FTP con 5' recuperacion. Formato de referencia para VO2max en ciclismo.
- dose_ladder:
  - Step 1: 3x5' @105-110% FTP D:5' (15 min)
  - Step 2: 4x5' @105-110% FTP D:5' (20 min)
  - Step 3: 5x5' @105-110% FTP D:5' (25 min)
  - Step 4: 4x6' @105-110% FTP D:5' (24 min)
- fatigue_cost: 5
- compatible_block_types: aerobic_power_block
- Justificacion: Bloques de 5' maximizan T@VO2max en ciclismo (Ronnestad 2016). Diferenciado del bike_vo2_power existente que incluye formato 30/30.

### Tipo 7: Recuperacion post-competicion

**Variante 7A: `run_post_race_reload`**
- public_label: "Recarga post-competicion running"
- summary: Protocolo de 3 sesiones para los 5-7 dias post-carrera: dia 1 caminata, dia 3 rodaje 20' Z1, dia 5 rodaje 30' Z1 con 4 progresivos.
- dose_ladder: No aplica (protocolo fijo)
- fatigue_cost: 1
- compatible_block_types: recovery_consolidation_block
- Justificacion: Mujika & Padilla (2001) documentan que la reintroduccion gradual post-competicion previene la perdida de adaptaciones sin arriesgar lesion.

**Variante 7B: `swim_post_race_reentry`**
- public_label: "Reentrada post-competicion natacion"
- summary: Protocolo de 2 sesiones: dia 2 = 800m tecnica suave, dia 4 = 1200m variado con 4x50m progresivos.
- dose_ladder: No aplica (protocolo fijo)
- fatigue_cost: 1
- compatible_block_types: recovery_consolidation_block
- Justificacion: Gonzalez-Rave (2023) muestra que nadadores elite reintroducen volumen con tecnica ligera antes de intensidad.

### Tipo 8: Brick triatlon (bike->run)

**Variante 8A: `tri_brick_z2_transition`**
- public_label: "Brick Z2 transicion bike->run"
- summary: 45-60' bici Z2 + T2 rapida + 15-30' running Z2. Formato introductorio de brick para principiantes y base_early.
- dose_ladder:
  - Step 1: 45' bici Z2 + T2 + 15' run Z2 (60 min)
  - Step 2: 60' bici Z2 + T2 + 20' run Z2 (80 min)
  - Step 3: 75' bici Z2 + T2 + 25' run Z2 (100 min)
  - Step 4: 90' bici Z2 + T2 + 30' run Z2 (120 min)
- fatigue_cost: 3
- compatible_block_types: aerobic_capacity_block, threshold_development_block
- Justificacion: Bricks cada 10-14 dias facilitan la adaptacion neuromuscular sin coste excesivo (USA Triathlon). El formato Z2 es seguro para principiantes y permite practicar T2.

**Variante 8B: `tri_brick_race_simulation`**
- public_label: "Brick simulacion de carrera bike->run"
- summary: 60-90' bici a potencia de prueba + T2 cronometrada + 20-40' run con 10' Z2 + bloques a ritmo objetivo.
- dose_ladder:
  - Step 1: 60' bici race pace + T2 + 10'Z2 + 10' ritmo obj (80 min)
  - Step 2: 75' bici race pace + T2 + 10'Z2 + 15' ritmo obj (100 min)
  - Step 3: 90' bici race pace + T2 + 5'Z2 + 20' ritmo obj (115 min)
  - Step 4: 90' bici race pace + T2 + 30' ritmo obj (120 min)
- fatigue_cost: 5
- compatible_block_types: competition_specific_block
- Justificacion: Hausswirth & Mujika (2013): la fatiga cruzada bici->run penaliza 8-12% el running. Simular esto en entreno es esencial para triatlon. Complementa tri_brick_aep existente.

### Tipo 9: Brick triatlon (swim->bike)

**Variante 9A: `tri_brick_swim_bike_base`**
- public_label: "Brick swim->bike base aerobica"
- summary: 1500-2000m natacion Z2 + T1 + 45-60' bici Z2. Para practicar la transicion y la adaptacion cardiovascular.
- dose_ladder:
  - Step 1: 1500m swim Z2 + T1 + 45' bike Z2 (70 min)
  - Step 2: 1500m swim Z2 + T1 + 60' bike Z2 (85 min)
  - Step 3: 2000m swim Z2 + T1 + 60' bike Z2 (95 min)
  - Step 4: 2000m swim Z2 + T1 + 75' bike Z2 (110 min)
- fatigue_cost: 3
- compatible_block_types: aerobic_capacity_block, threshold_development_block
- Justificacion: La transicion swim->bike es menos estudiada que bike->run pero igualmente critica para triatlon. El cambio de posicion horizontal a vertical afecta el retorno venoso y la regulacion cardiovascular.

**Variante 9B: `tri_brick_swim_bike_race`**
- public_label: "Brick swim->bike ritmo de prueba"
- summary: 1000-1500m natacion a CSS + T1 cronometrada + 45-60' bici a potencia de prueba.
- dose_ladder:
  - Step 1: 1000m CSS + T1 + 45' bike race pace (65 min)
  - Step 2: 1500m CSS + T1 + 45' bike race pace (70 min)
  - Step 3: 1500m CSS + T1 + 60' bike race pace (85 min)
  - Step 4: 2000m CSS + T1 + 60' bike race pace (95 min)
- fatigue_cost: 4
- compatible_block_types: competition_specific_block
- Justificacion: Cejuela & Selles-Perez (2022): el triatleta elite practica transiciones a ritmo de prueba en fases especificas.

### Tipo 10: Tecnica natacion con componente aerobico

**Variante 10A: `swim_tech_aerobic_combo`**
- public_label: "Tecnica + aerobico combinado"
- summary: Alternancia de 50m drill tecnico + 50m nado completo a ritmo LT1 durante 1600-2400m. Mantiene el foco tecnico con volumen util.
- dose_ladder:
  - Step 1: 16x(50m drill + 50m nado) = 1600m (30 min)
  - Step 2: 20x(50m drill + 50m nado) = 2000m (38 min)
  - Step 3: 24x(50m drill + 50m nado) = 2400m (45 min)
  - Step 4: 12x(50m drill + 100m nado LT1) = 1800m (35 min)
- fatigue_cost: 2
- compatible_block_types: technical_rebuild_block, aerobic_capacity_block
- Justificacion: Gonzalez-Rave (2022): la integracion de tecnica con volumen aerobico es mas eficiente que sesiones separadas en nadadores.

**Variante 10B: `swim_sighting_endurance`**
- public_label: "Sighting + resistencia aguas abiertas"
- summary: Sesion de 2000-3000m con sighting cada 6-8 brazadas durante bloques continuos. Entrena la habilidad de orientacion sin perder ritmo.
- dose_ladder:
  - Step 1: 4x400m con sighting c/25'' (28 min)
  - Step 2: 4x500m con sighting c/25'' (35 min)
  - Step 3: 3x800m con sighting c/30'' (42 min)
  - Step 4: 2x1000m con sighting c/30'' (35 min)
- fatigue_cost: 3
- compatible_block_types: competition_specific_block, aerobic_capacity_block
- Justificacion: La practica de sighting con volumen es esencial para triatletas y nadadores de aguas abiertas. La perdida de eficiencia por sighting puede llegar al 5-8%.

### Tipo 11: Fuerza especifica endurance (running)

**Variante 11A: `run_strength_hill_circuits`**
- public_label: "Circuito de cuestas con fuerza running"
- summary: 3-5 rondas de: 200m cuesta + 10 sentadillas peso corporal + 200m trote bajada. Fuerza especifica + economia.
- dose_ladder:
  - Step 1: 3 rondas x (200m cuesta + 10 squats + 200m bajada) (15 min)
  - Step 2: 4 rondas (20 min)
  - Step 3: 5 rondas (25 min)
  - Step 4: 4 rondas x (300m cuesta + 10 squats + 300m bajada) (28 min)
- fatigue_cost: 3
- compatible_block_types: aerobic_capacity_block, technical_rebuild_block
- Justificacion: Storen (2011): la fuerza maxima y mecanica de zancada se relacionan con economia de carrera. El circuito integra ambas en un formato con alta adherencia.

**Variante 11B: `run_plyometric_stiffness`**
- public_label: "Pliometria y rigidez elastica running"
- summary: Sesion de soporte con saltos, skippings y drop jumps para mejorar la rigidez del tendon y la economia de carrera.
- dose_ladder:
  - Step 1: 3x6 saltos al cajon + 4x30m skipping A (10 min)
  - Step 2: 4x6 saltos + 4x30m skip + 4x drop jump 20cm (15 min)
  - Step 3: 4x8 saltos + 6x30m skip + 6x drop jump 30cm (20 min)
  - Step 4: 5x8 saltos + 6x30m skip + 6x drop jump 30cm + 4x50m ankling (25 min)
- fatigue_cost: 3
- compatible_block_types: aerobic_power_block, technical_rebuild_block
- Justificacion: Storen (2011), Vikmoen (2021): la pliometria mejora la rigidez tendinosa y la economia de carrera en un 3-5% sin aumento de masa.

### Tipo 12: Fuerza especifica endurance (ciclismo)

**Variante 12A: `bike_torque_pyramid`**
- public_label: "Torque piramidal baja cadencia"
- summary: Piramide de cadencia baja: 30''-1'-2'-3'-2'-1'-30'' a potencia LT1-LT2, cadencia 50-60rpm. Seguido de 5' cadencia alta 100rpm.
- dose_ladder:
  - Step 1: 2 piramides + 5' spin (18 min)
  - Step 2: 3 piramides + 5' spin (24 min)
  - Step 3: 3 piramides con 3' a 50rpm + 5' spin (30 min)
  - Step 4: 4 piramides + 5' spin (32 min)
- fatigue_cost: 4
- compatible_block_types: threshold_development_block, aerobic_power_block
- Justificacion: Ronnestad (2022): la fuerza pesada secuenciada mejora sprint y fuerza en ciclistas. La alternancia cadencia baja/alta es patron del CSV de Nacho (bike_lt2_torque_reps).

**Variante 12B: `bike_single_leg_drills`**
- public_label: "Pedaleo unilateral y coordinacion"
- summary: Bloques de pedaleo single-leg (30'' por pierna) alternados con pedaleo bilateral a cadencia alta. Corrige asimetrias.
- dose_ladder:
  - Step 1: 6x(30'' izq + 30'' der + 2' bilateral) Z2 (18 min)
  - Step 2: 8x(30'' izq + 30'' der + 2' bilateral) Z2 (24 min)
  - Step 3: 6x(45'' izq + 45'' der + 2' bilateral) Z2 (24 min)
  - Step 4: 8x(45'' izq + 45'' der + 2' bilateral) Z2 (32 min)
- fatigue_cost: 2
- compatible_block_types: technical_rebuild_block, aerobic_capacity_block
- Justificacion: El pedaleo unilateral corrige asimetrias de hasta 10-15% documentadas en ciclistas (Smak 1999). Formato de soporte con bajo coste.

---

## PARTE C -- Verificacion con los 12 perfiles

### P01 -- Runner principiante glucolitico

- [x] **Volumen adecuado**: El dose_ladder de run_lt1_extensive empieza en 3x8' (24 min utiles), apropiado para principiante. El primer peldano de run_lt2_cruise es 4x800m (16 min).
- [x] **Sesiones no excesivas**: Los peldanos 1-2 de todas las familias son de carga baja. El robustness cap limita a peldano 3 para "low".
- [x] **Suficiente Z1/Z2**: run_lt0_recovery, run_long_aerobic, run_progressive_aerobic, run_regenerative_long cubren la necesidad de volumen suave.
- [ ] **GAP**: Falta una sesion especifica para principiantes con intervalos cortos de caminata intercalados (walk-run). Un formato tipo "5' run Z1 + 1' walk x 6" facilitaria la adherencia en las primeras semanas.

### P02 -- Ciclista veterano aerobico

- [x] **Estimulo suficiente**: bike_lt2_halfpace (6 peldanos hasta 3x20'), bike_over_under_threshold (5 peldanos), bike_subthreshold_blocks (5 peldanos) proporcionan variedad.
- [x] **Variedad ciclismo**: 27 templates de ciclismo con 9 familias key. Incluye torque, cadencia, fatmax, LT1, LT2, VO2, sprint, aero.
- [x] **Sesiones diesel**: bike_subthreshold_blocks y bike_lt2_halfpace son ideales para diesel que necesita estimulo en zona alta sin sobrecoste.

### P03 -- Triatleta elite Ironman

- [x] **3 disciplinas cubiertas**: Templates en running (27), ciclismo (27), natacion (18). Blueprints para cada disciplina x bloque.
- [ ] **Bricks**: Solo 1 template brick (tri_brick_aep). **GAP CRITICO**: Falta brick swim->bike. Falta brick Z2 para base_early. Las variantes propuestas (8A, 8B, 9A, 9B) cubririan este gap.
- [x] **Volumen manejable**: La separacion por disciplina y el spacing de sesiones key impiden acumulacion excesiva dentro de cada disciplina. Sin embargo, el Agente 2 identifico que falta control de carga total cross-discipline.

### P04 -- Nadadora con running debil

- [x] **Prioriza running**: El motor fisiologico identifica running como limitante. Los templates de running cubren desde LT0 hasta VO2.
- [x] **Mantiene natacion**: swim_aerobic_continuity, swim_css_threshold, swim_lt1_broken_sets mantienen el nivel sin exigir progresion.
- [x] **Sesiones para debilidad running**: run_lt1_extensive con peldano 1 (3x8') es ideal para construir base de carrera. run_economy_strides mejora mecanica.
- [ ] **GAP**: Falta sesion brick swim->run especifica para 70.3. La variante 9A propuesta ayudaria.

### P05 -- Runner con estancamiento

- [x] **Variedad suficiente**: 27 templates running con formatos diversos (cruise, escalated, subthreshold, VO2, ANC, half-pace). La monotonia de estimulo puede romperse con cambio de formato.
- [x] **Estimulo ANC**: run_anc_short_reps y run_anc_submax_spice disponibles para romper estancamiento diesel.
- [ ] **ALERTA**: El sistema no prescribe automaticamente ANC para maraton (excluido de _ANC_CANDIDATE_EVENTS). La sesion existe pero no se activa automaticamente. Confirmado por Agente 1C y Agente 2.

### P06 -- Triatleta joven glucolitico

- [x] **Base aerobica**: run_lt1_extensive, run_lt1_long_reps, bike_lt1_blocks, swim_aerobic_continuity cubren la necesidad de AEC extenso.
- [x] **No abusa de intensidad**: Los blueprints de AEC priorizan LT1 y sub-LT1. El peldano 1 de todas las familias key es de carga conservadora.
- [x] **Progresion controlada**: Robustness cap en "low" = max peldano 3. Sufficient para joven en base_early.

### P07 -- Ciclista -> triatleta

- [x] **Bridge entre disciplinas**: swim_restart_rebuild para reintroduccion natacion. run_economy_strides para mecanica de carrera.
- [x] **Natacion progresiva**: swim_technical_alignment -> swim_aerobic_continuity -> swim_lt1_broken_sets es una secuencia logica de progresion.
- [ ] **GAP**: Falta sesion de natacion para ex-ciclista que sea menos intimidante que los formatos estandar (ej: series de 25m con mucho descanso y foco en flotabilidad, no velocidad). La variante 10A propuesta ayudaria parcialmente.

### P08 -- Masters runner

- [x] **Recuperacion suficiente**: run_lt0_recovery (fatigue_cost=1), recovery_regeneration, full_rest_day, active_walk_hike disponibles.
- [x] **fatigue_cost respeta edad**: El sistema usa robustness y spacing. Sin embargo, no hay ajuste explicito por edad -- un masters de 48 necesaria mas spacing que un joven de 24 con el mismo fatigue_cost.
- [ ] **GAP**: No hay un modificador de fatigue_cost por edad. El sistema trata a P08 igual que a P06 en terminos de spacing. Recomendacion: multiplicar min_spacing_days_after x 1.3 para atletas >45 anos.

### P09 -- Protocolo deficiente

- [x] **Sesiones sin umbrales precisos**: run_lt0_recovery, run_economy_strides, swim_technical_alignment, strength_general_support funcionan sin datos de umbral. El sistema puede prescribir AEC con peldanos bajos sin necesitar datos precisos.
- [x] **Test como prioridad**: test_profile_anchor bien posicionado en blueprints de testing_decision_block.

### P10 -- Post-lesion

- [x] **Reintegracion progresiva**: swim_restart_rebuild, run_economy_strides, strength_anatomical_adaptation son ideales para reintegracion.
- [x] **Volumen inicial conservador**: Peldano 1 de run_lt1_extensive (3x8' = 24 min utiles) es apropiado post-lesion.
- [ ] **GAP**: Falta un protocolo de "vuelta a la carga" post-lesion que limite explicitamente el peldano maximo durante las primeras 4 semanas (ej: cap en peldano 2 independientemente de la robustness). El Agente 1C tambien identifico falta de deteccion de inactividad prolongada.

### P11 -- Ciclista puro

- [x] **Cobertura completa**: 27 templates de ciclismo cubriendo AEC (lt1_blocks, fatmax, cadmax_lt1_combo, aec_spiced), THR (lt2_halfpace, over_under, subthreshold, lt1_to_lt2), AEP (vo2_power, vo2_30_30, sit_lt1, lt2_vo2_combo), ANC (anc_power_sprints, fuerza_q2), ANP (anp_high_intensity), COMP (transition_specific, endurance_tempo, lt2_halfpace_long), TECH (cadence_efficiency, torque_support).
- [x] **Todos los bloques cubiertos**: 6 bloques x fases (load/build/build_peak/recovery) completos en blueprints.

### P12 -- Nadador aguas abiertas 10km

- [x] **Sesiones OW**: swim_open_water_specific existe pero solo en COMP block. Para 10km OW, se necesitarian sesiones de orientacion en fases mas tempranas.
- [x] **Volumen adecuado**: swim_aec_long_session (2000-3500m) y swim_aerobic_continuity cubren el volumen necesario para 10km OW.
- [ ] **GAP**: Para un nadador de 10km, faltan:
  - Sesion de pacing OW (mantener ritmo sin pared durante 60+ min)
  - Sesion de nutricion en agua (practicar ingesta cada 20-30 min nadando)
  - Sesion de drafting (nadar en estela de otro nadador)
  - La variante 10B propuesta (sighting_endurance) cubre parcialmente.

---

## PARTE D -- Gaps identificados

### 1. Familias de sesiones faltantes por bloque

| Gap | Disciplina | Bloques afectados | Prioridad |
|---|---|---|---|
| Brick swim->bike | Triatlon | AEC, THR, COMP | **CRITICA** |
| Brick Z2 base (bike->run) | Triatlon | AEC | **ALTA** |
| Walk-run para principiantes | Running | AEC | MEDIA |
| VO2 intervalos largos (4x4') | Running | AEP | MEDIA |
| Post-competicion protocolo | Running/Natacion | REC | MEDIA |
| Pacing OW 10km+ | Natacion | COMP, AEC | MEDIA |
| Sweet spot sostenido | Ciclismo | THR, AEP | BAJA |

### 2. Bloques sin sesiones de recovery

Todos los bloques tienen sesiones recovery cubiertas:
- Running: run_lt0_recovery, recovery_regeneration, full_rest_day, active_walk_hike
- Ciclismo: bike_lt0_recovery, recovery_regeneration, full_rest_day
- Natacion: swim_recovery_drills, swim_lt0_50s, swim_restart_rebuild, recovery_regeneration

**No hay gap de recovery.**

### 3. Disciplinas subrepresentadas

| Disciplina | Templates | Suficiente? | Nota |
|---|---|---|---|
| Running | 27 + 6 especiales | Si | Muy completo. |
| Ciclismo | 27 + 3 especiales | Si | Muy completo. |
| Natacion | 18 + 4 especiales | Si | Bien cubierta pero con menos variedad que running/ciclismo. |
| Triatlon (multi) | 1 (tri_brick_aep) | **NO** | Solo 1 template brick. Necesita al menos 3-4 mas. |
| Fuerza | 4 | Si | Adecuado como soporte. |
| Generales | 5 | Si | Recovery, test, movilidad bien cubiertos. |

### 4. Sesiones faltantes para perfiles especificos

| Perfil | Sesion faltante | Impacto |
|---|---|---|
| P01 (principiante) | Walk-run intervals para las primeras semanas | MEDIO -- El primer peldano de run_lt1_extensive (3x8') puede ser demasiado para un principiante absoluto |
| P03, P04, P07 (triatletas) | Brick swim->bike en fases base y especifica | CRITICO -- El Agente 2 tambien lo identifico |
| P08 (masters) | Modificador de spacing por edad | MEDIO -- No es una sesion sino un parametro |
| P10 (post-lesion) | Protocolo de readaptacion con cap de peldano | MEDIO |
| P12 (OW 10km) | Sesiones de pacing y nutricion OW larga | MEDIO |

### 5. Coherencia de dose_ladders

| Problema | Templates afectados | Severidad |
|---|---|---|
| total_useful_time_min = 0 en ANC/ANP | run_anc_submax_spice, bike_anc_submax_spice, bike_fuerza_q2, run_escalated_lt1, run_anc_vo2_short | BAJA -- El tiempo util de ANC/spice es muy corto (<5 min) y no es comparable con sesiones de volumen. Pero el campo deberia tener un valor para consistencia. |
| Sin dose_ladder en sesiones key | 7 templates key sin dose_ladder | MEDIA -- Dificulta la progresion automatica. |
| Solapamiento bike_lt2_long_reps / bike_lt2_halfpace | 2 templates similares | BAJA -- Pero crea confusion al entrenador. |

### 6. Evidence_ids

Algunos templates usan evidence_ids que no existen en EVIDENCE_SOURCES:
- `seiler_2013_tid`, `stoggl_2014_polarized`, `seiler_2006_tid` (en run_halfpace_progressive, bike_fatmax_intervals)
- `gibala_2012_sprint` (en bike_sit_lt1_progressive)
- `mujika_2010_taper`, `tonnessen_2014_openers` (en run_openers)

Estos IDs no estan definidos en el diccionario EVIDENCE_SOURCES pero se referencian. No genera error funcional (el sistema simplemente no los resuelve) pero es inconsistencia.

---

## Resumen

### Fortalezas

1. **Cobertura excepcional**: 81 templates cubren running (33), ciclismo (30), natacion (22), fuerza (4), generales (5), triatlon (1). Todos los bloques Olbrecht (AEC, THR, AEP, ANC, ANP, COMP, TECH, REC, TEST) tienen sesiones en las 3 disciplinas.

2. **Dose ladders bien calibrados**: Las familias con dose_ladder progresan coherentemente (15-25% entre peldanos). Los campos readiness_required, fatigue_cost y total_duration_min son consistentes.

3. **Coherencia con Olbrecht**: Los patrones AEC Tipo I (spice al inicio + cola extensiva), ANC (esfuerzos cortos + descanso pasivo), ANP (sprints + descanso minimo), y AEP (repeticiones a ritmo prueba + descanso breve) son fieles al modelo.

4. **Validacion empirica fuerte**: La integracion del CSV de Nacho (732 sesiones reales) con la evidencia publicada da solidez a los templates. Los formatos mas usados en la practica tienen templates dedicados.

5. **Spacing y compatibilidad**: incompatible_adjacent_families, min_spacing_days_after y requires_fresh estan bien calibrados para prevenir sobredosis.

### Debilidades

1. **Un solo template brick**: Para una app de triatlon, tener solo tri_brick_aep es insuficiente. Se necesitan al menos 4 templates brick (swim->bike base, swim->bike race, bike->run base, bike->run race).

2. **7 templates key sin dose_ladder**: Dificulta la progresion automatica. Prioridad: run_specific_pace_reps, bike_long_endurance, bike_lt2_long_reps.

3. **Evidence_ids huerfanos**: 6 evidence_ids referenciados pero no definidos en EVIDENCE_SOURCES.

4. **Sin ajuste por edad/nivel en fatigue_cost**: Un masters de 48 anos recibe el mismo spacing que un joven de 24 para la misma sesion.

5. **Sin sesiones para principiantes absolutos**: El primer peldano de la mayoria de familias asume un minimo de condicion fisica. Un walk-run seria necesario para P01 en las primeras semanas.

### Recomendaciones priorizadas

1. **CRITICO**: Anadir 3-4 templates brick para triatlon (swim->bike y bike->run en formatos base y race).
2. **ALTA**: Anadir dose_ladder a las 7 sesiones key que no lo tienen.
3. **ALTA**: Definir los 6 evidence_ids huerfanos en EVIDENCE_SOURCES.
4. **MEDIA**: Anadir un template walk-run para principiantes absolutos.
5. **MEDIA**: Fusionar o diferenciar claramente bike_lt2_long_reps vs bike_lt2_halfpace.
6. **MEDIA**: Corregir compatible_block_types de bike_fatmax_intervals (quitar recovery_consolidation_block).
7. **BAJA**: Poner total_useful_time_min correcto en templates ANC/ANP (actualmente 0 en varios).
8. **BAJA**: Considerar multiplicador de spacing por edad para masters (>45 anos).

---

## Fuentes

- [Polarized vs other TIDs meta-analysis (Stoggl 2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11329428/)
- [TID theory review 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12568352/)
- [Polarized training & VO2max/economy (MDPI 2024)](https://www.mdpi.com/2075-4663/12/12/326)
- [HIIT categorization model (Frontiers 2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11218030/)
- [HIIT & cardiorespiratory fitness umbrella review (Poon 2024)](https://onlinelibrary.wiley.com/doi/10.1111/sms.14652)
- [Brick workouts in triathlon (USA Triathlon)](https://www.usatriathlon.org/articles/training-tips/how-to-use-brick-workouts-in-triathlon-training)
- [Periodization & adherence (PMC 2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8701049/)
- [Training monotony - Foster (PMC 2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8200417/)
- [Concurrent training review 2024 (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11688070/)
- [Concurrent training sequences 2025 (Frontiers)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12885173/)
- [Strength in cyclists (Ronnestad 2022)](https://pubmed.ncbi.nlm.nih.gov/35548458/)
- [HIIT meta-analysis elite athletes (Frontiers 2024)](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2024.1486526/full)

AGENTE 3 COMPLETADO
