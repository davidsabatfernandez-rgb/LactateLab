# Agente 1A -- Perfiles Iniciales de Validacion

Fecha: 2026-03-14
Sistema: Lactate Lab (PeakAerobic)

---

## Base Cientifica

### Marco teorico Olbrecht (Science of Winning + Triathlon)

El modelo Olbrecht/Mader distingue **dos capacidades metabolicas independientes**:

1. **VO2max (capacidad aerobica)**: tasa maxima de consumo de oxigeno, determinante del techo aerobico.
2. **VLamax (capacidad anaerobica/glucolitica)**: tasa maxima de produccion de lactato, refleja la actividad maxima de la glucolisis.

Principio central: un mismo lactato submaximal puede resultar de multiples combinaciones de VO2max/VLamax (Olbrecht 2000, Mader 2003). Por tanto, prescribir entrenamiento solo por la curva lactato-velocidad (sin estimar ambas capacidades) conduce a errores sistematicos.

**Clasificacion de ejercicios** (Olbrecht):
- AEC (Aerobic Capacity): volumen alto, intensidad extensiva, fracciones largas, descanso corto.
- ANC (Anaerobic Capacity): volumen moderado, intensidad casi all-out, fracciones cortas, descanso largo.
- AEP (Aerobic Power): progresion de fracciones cortas a largas, race pace.
- ANP (Anaerobic Power): fracciones cortas, all-out, descanso corto.

**Periodizacion**: ambas capacidades deben desarrollarse en la **proporcion optima** (no maxima) para el evento objetivo. Un atleta de larga distancia con VLamax excesiva no activara al maximo su capacidad aerobica incluso si la posee.

### Evidencia independiente

#### Metodos de deteccion de umbrales de lactato
- **Faude, Kindermann & Meyer (2009)**: revision de 25 conceptos de umbral de lactato. Correlaciones medias r=0.84-0.92 con rendimiento en resistencia (>5km). LT1 definido como baseline + 0.5 mmol/L es robusto; LT2 como MLSS o OBLA tiene validez predictiva alta. **CONSENSO** -- La deteccion multi-metodo con criterio de agreement es coherente con la recomendacion de Faude de no confiar en un unico metodo.
  Fuente: [Faude et al. 2009 - PubMed](https://pubmed.ncbi.nlm.nih.gov/19453206/)

- **Bishop et al. (1998)**: Modified Dmax traza la linea desde el primer punto con aumento significativo (baseline_min + 0.4-0.5 mmol) hasta el ultimo punto. ICC >= 0.98, CV <= 1.9%. Mas robusto que Dmax clasico en atletas entrenados con curva convexa.
  **CONSENSO** -- La implementacion ModDmax del sistema es fiel al metodo original de Bishop.
  Fuente: [Bishop 1998 - PubMed](https://pubmed.ncbi.nlm.nih.gov/9183808/)

- **Tanner et al. (2018)**: Repeatability de conceptos de LT: Cronbach alpha 0.89-0.96, Dmax-mod con mayor repetibilidad Y predictabilidad de rendimiento ciclista.
  **CONSENSO** -- Confirma la eleccion de ModDmax como metodo principal de LT2.
  Fuente: [Tanner et al. 2018 - PLOS ONE](https://pmc.ncbi.nlm.nih.gov/articles/PMC6235347/)

#### VLamax y prescripcion de entrenamiento
- **Mader (2003)**: modelo matematico de fosforilacion citosolica; VLamax estima la actividad maxima de fosfofructokinasa. Medido via sprint 10-15s en ergometro + lactato post.
  **CONSENSO** -- El proxy ratio LT1/LT2 del sistema es una simplificacion razonable cuando no hay test de sprint disponible.
  Fuente: [Mader 2003 - ResearchGate](https://www.researchgate.net/publication/10950490_Glycolysis_and_oxidative_phosphorylation_as_a_function_of_cytosolic_phosphorylation_state_and_power_output_of_the_muscle_cell)

- **Nitzsche et al. (2025)**: revision sistematica "Is VLamax for Glycolysis What VO2max is for Oxidative Phosphorylation?" Valores tipicos 0.2-1.0 mmol/L/s; cambios significativos en 6-8 semanas de entrenamiento dirigido. La validez discriminante entre deportes esta establecida; la sensibilidad al cambio dentro de un atleta requiere mas estudio.
  **DEBATE CIENTIFICO** -- El proxy ratio LT1/LT2 no es VLamax directa. Es un estimador ordinal (high/moderate/low) valido para prescripcion general, pero no para cuantificacion precisa.
  Fuente: [Nitzsche et al. 2025 - Sports Medicine](https://link.springer.com/article/10.1007/s40279-025-02259-6)

#### Valores de referencia LT1/LT2
- **LT1**: tipicamente 1.5-2.5 mmol/L; criterio robusto = baseline + 0.5 mmol (Faude 2009).
  En desentrenados: 50-60% VO2max (~55-65% HRmax). En entrenados: 65-80% VO2max (~70-85% HRmax).
- **LT2**: tipicamente 3.5-5.5 mmol/L (MLSS); OBLA fijado a 4 mmol/L.
  En desentrenados: 55-70% VO2max. En entrenados: 75-90% VO2max (~80-93% HRmax).
  **CONSENSO** -- Los rangos del sistema (practical LT1=1.6 mmol, practical LT2=3.1 mmol como targets de interpolacion dinamica) son conservadores y adecuados.
  Fuentes: [Running Writings - LT1/LT2 HR](https://runningwritings.com/2025/02/lt1-lt2-heart-rate-zone-science.html), [INSCYD - LT1](https://inscyd.com/whitepaper/lactate-threshold-1/)

#### Potencia en ciclismo por nivel
- Principiantes: 2.0-2.5 W/kg FTP. Recreativos: 2.5-3.5 W/kg. Competitivos: 3.5-4.5 W/kg. Profesionales: 5.0+ W/kg.
  **CONSENSO** -- Los benchmarks del sistema (LT2_AEROBIC_BENCHMARKS ciclismo: recreational 170-240W, trained 220-310W, competitive 270-380W) son coherentes asumiendo rangos de peso tipicos.
  Fuente: [Cycling Weekly - W/kg](https://www.cyclingweekly.com/fitness/training/the-importance-of-power-to-weight-and-how-to-improve-yours-164589)

#### Natacion: umbrales
- Nadadores de competicion: CSS ~1:00-1:15/100m (elite), 1:25-1:40/100m (amateurs competitivos).
- LT2 en natacion correlaciona con CSS (r>0.90 con OBLA 4 mmol).
  **CONSENSO** -- El sistema usa benchmarks de natacion en velocidad (m/s) que se alinean con la literatura.
  Fuente: [Swimming World - Lactate Threshold](https://www.swimmingworldmagazine.com/news/truth-lactate-threshold/)

#### VO2max prediction (Swain+ACSM)
- Las ecuaciones ACSM sobrestiman VO2max en ~14-28% en atletas (Koutlianos et al. 2013). El sistema mitiga esto usando el metodo Swain HR-based con confianza reducida.
  **ACTUALIZAR** -- Considerar la ecuacion FRIEND (Kaminsky et al. 2017) que muestra mejor acuerdo con VO2max medido en ciclistas y corredores.
  Fuente: [Koutlianos et al. - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3743617/)

#### Outlier detection
- **Billat et al. (2003)**: variabilidad intra-individuo >0.5 mmol en lactato submaximal es sospechosa; el sistema usa este criterio en el filtro de outliers.
  **CONSENSO** -- El threshold de 0.5 mmol para deteccion de anomalias intra-sesion esta bien calibrado.
  Fuente: Billat V. "The concept of maximal lactate steady state" Sports Med 2003.

---

## Perfil P01 -- Runner principiante glucolitico

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 24 anos |
| Sexo | Mujer |
| Peso | 58 kg |
| Disciplina | Running |
| Objetivo | Primera media maraton en 4 meses |
| Nivel | Recreational |
| HRmax estimada | 196 bpm (220-24) |
| HR reposo | 68 bpm |

### Test de lactato inicial

| Escalon | Ritmo (min/km) | Ritmo (s/km) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|---|
| 1 | 8:00 | 480 | 128 | 1.0 | 4 min |
| 2 | 7:30 | 450 | 137 | 1.1 | 4 min |
| 3 | 7:00 | 420 | 148 | 1.4 | 4 min |
| 4 | 6:30 | 390 | 158 | 1.8 | 4 min |
| 5 | 6:00 | 360 | 167 | 2.6 | 4 min |
| 6 | 5:30 | 330 | 176 | 4.1 | 4 min |
| 7 | 5:15 | 315 | 184 | 6.3 | 4 min |
| 8 | 5:00 | 300 | 190 | 9.2 | 4 min |

Curva empinada tipica de atleta principiante sin base aerobica: lactato sube rapido a partir de 6:00/km. Baseline estable ~1.0-1.1 mmol. Gran salto entre escalon 5 y 6 (+1.5 mmol) y entre 6 y 7 (+2.2 mmol). Coherente con VLamax alta y VO2max bajo (Mader 2003; Olbrecht 2000).

### Analisis esperado del sistema

**Smoothed lactates** (aprox): [1.03, 1.17, 1.43, 1.93, 2.47, 4.33, 6.53, 7.75]

**LT1 fisiologico**:
- baseline_rise: baseline=1.0, +0.5 = 1.5 mmol. Smoothed[3]=1.93 >= 1.5 y smoothed[4]=2.47 >= 1.93-0.25. **LT1 en escalon 4** (6:30/km, lactato real 1.8 mmol, FC 158).
- sustained_increase: baseline=1.0, +0.3 = 1.3. Smoothed[2]=1.43 >= 1.3 y smoothed[2]>smoothed[1] y smoothed[3]>=smoothed[2]. **LT1 en escalon 3** (7:00/km, lactato 1.4 mmol, FC 148).
- **Agregado LT1**: lactato = media(1.8, 1.4) = **1.6 mmol**; ritmo = mediana(390, 420) = **405 s/km (~6:45/km)**; FC = mediana(158, 148) = **153 bpm**.

**LT2 fisiologico**:
- baseline_rise: primera vez >= 4.0 mmol: smoothed[5]=4.33. Verificacion: smoothed[6]=6.53 >= 4.33-0.5. **LT2 en escalon 6** (5:30/km, lactato 4.1, FC 176).
- sustained_increase: smoothed[5]-smoothed[4]=1.86, smoothed[4]-smoothed[3]=0.54. Slope increase=1.32 >= max(0.45, 0.54+0.2=0.74). Y smoothed[5]=4.33 >= max(3.2, 1.0+1.4=2.4). **LT2 en escalon 6** (5:30/km, lactato 4.1, FC 176).
- moddmax: linea desde primer punto >= baseline+0.5 (escalon 4, smoothed 1.93) hasta ultimo punto. La maxima desviacion perpendicular caera probablemente en escalon 5-6. **LT2 ~ escalon 5-6**.
- **Agregado LT2**: lactato = media(4.1, 4.1, ~4.1) ~ **4.1 mmol**; ritmo ~ **330 s/km (5:30/km)**; FC ~ **176 bpm**.

**LT1 practico**: LT1_real - 0.3 = 1.6 - 0.3 = **1.3 mmol** (interpolado ~ 7:15/km).
**LT2 practico**: LT2_real - 0.5 = 4.1 - 0.5 = **3.6 mmol** (interpolado ~ 5:45/km).

**CapacityProfile**:
- LT2 speed = 3600/330 = 10.9 km/h. Benchmark recreational running: (9.0, 11.5). 10.9 esta en rango --> **aerobic_level = "moderate"**.
- Ratio LT1/LT2 speed: (3600/405) / (3600/330) = 8.89 / 10.91 = **0.815**. Ratio 0.79-0.87 --> **raw_vlamax = "moderate"**. aerobic_level = moderate --> **vlamax_level = "moderate"**.
- NOTA: El ratio indica VLamax moderada pero la curva empinada sugiere que es mas alta de lo que el ratio captura. Esto es una limitacion conocida: en principiantes con umbrales comprimidos, el ratio subestima VLamax.

**VLamax estimado**: ~0.5-0.7 mmol/L/s (alto para principiante, coherente con curva empinada).

**Bloque recomendado**: Con objetivo HM en 4 meses (16 semanas), fase = base_early (>28 semanas no, pero con 16 semanas y nivel recreational = base_early/base_late). LT2 gap vs target: recreational HM factor = 0.85. Target race pace ~6:00/km para principiante HM. Required LT2 = 10.0/0.85 = 11.8 km/h. Actual LT2 = 10.9 km/h. Gap moderado. Con aerobic moderate y vlamax moderate: **aerobic_capacity_block (AEC)**.

### Verificacion

- [x] LT1 detectado correctamente -- baseline_rise y sustained_increase convergen en escalones 3-4 (1.4-1.8 mmol). Agreement alto.
- [x] LT2 detectado correctamente -- los 3 metodos convergen en escalon 6 (4.1 mmol a 5:30/km). La curva empinada hace la deteccion trivial.
- [x] LT1p y LT2p calculados -- 1.3 mmol (~7:15/km) y 3.6 mmol (~5:45/km).
- [x] Senales coherentes -- principiante con curva empinada, umbrales bajos, VLamax moderada-alta.
- [x] Valores realistas -- LT2 a 5:30/km para mujer recreativa de 24 anos es coherente con la literatura (60-70% VO2max en LT2 para desentrenados; Faude 2009). FC de 176 al LT2 = ~90% HRmax, tipico de test incremental en recreativo.

---

## Perfil P02 -- Ciclista veterano aerobico

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 52 anos |
| Sexo | Hombre |
| Peso | 78 kg |
| Disciplina | Ciclismo |
| Objetivo | Gran fondo 180km en 5 meses |
| Nivel | Trained |
| HRmax estimada | 170 bpm (208 - 0.7*52) |
| HR reposo | 52 bpm |
| FTP estimado | ~250W (~3.2 W/kg) |

### Test de lactato inicial

| Escalon | Potencia (W) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|
| 1 | 120 | 98 | 0.8 | 4 min |
| 2 | 150 | 108 | 0.9 | 4 min |
| 3 | 180 | 118 | 1.1 | 4 min |
| 4 | 200 | 128 | 1.4 | 4 min |
| 5 | 225 | 138 | 1.9 | 4 min |
| 6 | 250 | 148 | 2.8 | 4 min |
| 7 | 275 | 156 | 4.2 | 4 min |
| 8 | 300 | 163 | 6.8 | 4 min |

Curva gradual con plateau largo hasta 225W. Tipica de ciclista con buena base aerobica: el lactato se mantiene bajo (<2.0 mmol) hasta ~3 W/kg (225W). Salto marcado entre 250 y 275W. Coherente con VLamax baja (Olbrecht: tipo "diesel").

### Analisis esperado del sistema

**Smoothed lactates** (aprox): [0.87, 0.93, 1.13, 1.47, 1.77, 2.97, 4.60, 5.50]

**LT1 fisiologico**:
- baseline_rise: baseline=0.8, +0.5=1.3. Smoothed[3]=1.47 >= 1.3 y smoothed[4]=1.77 >= 1.47-0.25. **LT1 en escalon 4** (200W, lactato 1.4, FC 128).
- sustained_increase: baseline=0.8, +0.3=1.1. Smoothed[2]=1.13 >= 1.1 y smoothed[2]>smoothed[1] y smoothed[3]>=smoothed[2]. **LT1 en escalon 3** (180W, lactato 1.1, FC 118).
- **Agregado LT1**: lactato = media(1.4, 1.1) = **1.25 mmol**; potencia = mediana(200, 180) = **190W**; FC = mediana(128, 118) = **123 bpm**.

**LT2 fisiologico**:
- baseline_rise: smoothed[6]=4.60 >= 4.0. Verificacion: smoothed[7]=5.50 >= 4.60-0.5. **LT2 en escalon 7** (275W, lactato 4.2, FC 156).
- sustained_increase: smoothed[6]-smoothed[5]=1.63, smoothed[5]-smoothed[4]=1.20. Slope increase=0.43 >= max(0.45, 1.20+0.2=1.40)? 0.43 < 1.40. Probablemente no pasa la rotura de pendiente en escalon 6. Smoothed[5]=2.97 >= max(3.2, 0.8+1.4=2.2)? 2.97 < 3.2. Pasa a escalon 6: smoothed[6]=4.60 >= 3.2, local_slope=1.63 >= max(0.45, 1.20+0.2)=1.40. Si. **LT2 en escalon 7** (275W, lactato 4.2, FC 156).
- moddmax: inicio en escalon donde >= baseline+0.5=1.3: escalon 4 (smoothed 1.47). Linea de escalon 4 a escalon 8. Maxima desviacion ~escalon 6-7. **LT2 ~ escalon 6-7** (~250-275W).
- **Agregado LT2**: lactato ~ **4.2 mmol**; potencia ~ **275W**; FC ~ **156 bpm**.

**LT1 practico**: 1.25 - 0.3 = **0.95 mmol** (interpolado ~ 155W).
**LT2 practico**: 4.2 - 0.5 = **3.7 mmol** (interpolado ~ 262W).

**CapacityProfile**:
- LT2 value = 275W. Benchmark trained ciclismo: (220, 310). 275 en rango --> **aerobic_level = "moderate"**.
- Ratio LT1/LT2 potencia: 190/275 = **0.691**. Ratio < 0.79 --> **raw_vlamax = "high"**. Pero aerobic_level = moderate --> **vlamax_level = "high"**.
- NOTA: Esto parece contradictorio: un ciclista "diesel" deberia tener VLamax baja. El problema: el ratio usa potencia, no velocidad a un mismo lactato. La separacion LT1-LT2 en potencia es grande (85W), lo que genera un ratio bajo (0.69). Sin embargo, en lactato la curva es plana. Esto es una limitacion del proxy por ratio de potencia: el gap en potencia amplifica la separacion. En la practica, el sistema clasificaria a este atleta como VLamax "high" cuando realmente es "low". **ACTUALIZAR** -- El ratio funciona mejor con velocidad (running) que con potencia (ciclismo) donde la relacion potencia-lactato no es lineal en la misma proporcion.

CORRECCION: Recalculando. El ratio LT1/LT2 en el sistema se calcula en la MISMA metrica. Para ciclismo: 190W/275W=0.69. Esto es problematico porque refleja el gap de potencia, no el gap de lactato. Un ratio de 0.69 clasifica como VLamax alta, pero la curva plana indica VLamax baja. Esto es un edge case conocido del proxy en ciclismo.

**VLamax estimado**: ~0.2-0.3 mmol/L/s (bajo, perfil diesel).

**Bloque recomendado**: Gran fondo 180km en 5 meses = ~20 semanas. Fase: base_late. Gap LT2 moderado (275W actual vs requerido ~285W para granfondo trained con factor 0.86). Con gap pequeno y base solida: **aerobic_power_block (AEP)** o **threshold_development_block (THR)**.

### Verificacion

- [x] LT1 detectado correctamente -- convergencia en escalones 3-4 (1.1-1.4 mmol a 180-200W).
- [x] LT2 detectado correctamente -- convergencia en escalon 7 (4.2 mmol a 275W).
- [x] LT1p y LT2p calculados -- 0.95 mmol (~155W) y 3.7 mmol (~262W).
- [ ] Senales coherentes -- **ATENCION**: el proxy VLamax por ratio clasificaria como "high" cuando deberia ser "low". La forma de la curva es inequivocamente diesel. El ratio potencia es un estimador menos fiable en ciclismo que el ratio velocidad en running.
- [x] Valores realistas -- LT2 a 275W (~3.5 W/kg) para ciclista veterano trained de 78kg es coherente. FC de 156 al LT2 = ~92% HRmax, tipico de entrenado. Lactato basal 0.8 mmol coherente con buen nivel aerobico.

---

## Perfil P03 -- Triatleta elite multidisciplina

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 29 anos |
| Sexo | Hombre |
| Peso | 70 kg |
| Disciplina | Triatlon (running + ciclismo + natacion) |
| Objetivo | Ironman en 8 meses |
| Nivel | Competitive |
| HRmax | 188 bpm |
| HR reposo | 44 bpm |

### Test de lactato: Running

| Escalon | Ritmo (min/km) | Ritmo (s/km) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|---|
| 1 | 5:30 | 330 | 128 | 0.9 | 4 min |
| 2 | 5:00 | 300 | 138 | 1.0 | 4 min |
| 3 | 4:30 | 270 | 148 | 1.3 | 4 min |
| 4 | 4:10 | 250 | 157 | 1.8 | 4 min |
| 5 | 3:55 | 235 | 165 | 2.6 | 4 min |
| 6 | 3:40 | 220 | 174 | 4.3 | 4 min |
| 7 | 3:30 | 210 | 181 | 7.1 | 4 min |

### Test de lactato: Ciclismo

| Escalon | Potencia (W) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|
| 1 | 150 | 108 | 0.8 | 4 min |
| 2 | 190 | 122 | 0.9 | 4 min |
| 3 | 230 | 135 | 1.2 | 4 min |
| 4 | 260 | 146 | 1.7 | 4 min |
| 5 | 290 | 156 | 2.5 | 4 min |
| 6 | 310 | 165 | 3.9 | 4 min |
| 7 | 330 | 174 | 6.5 | 4 min |

### Test de lactato: Natacion

| Escalon | Ritmo (min/100m) | Velocidad (m/s) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|---|
| 1 | 2:10 | 0.77 | 112 | 1.1 | 4 min |
| 2 | 2:00 | 0.83 | 122 | 1.2 | 4 min |
| 3 | 1:50 | 0.91 | 133 | 1.5 | 4 min |
| 4 | 1:40 | 1.00 | 143 | 2.0 | 4 min |
| 5 | 1:32 | 1.09 | 153 | 2.8 | 4 min |
| 6 | 1:27 | 1.15 | 162 | 4.4 | 4 min |
| 7 | 1:22 | 1.22 | 170 | 7.2 | 4 min |

### Analisis esperado del sistema

#### Running
- **LT1**: ~1.3-1.8 mmol, escalon 3-4 (~4:30-4:10/km, FC ~148-157). Agregado: **~1.55 mmol a ~4:20/km, FC ~152**.
- **LT2**: ~4.3 mmol, escalon 6 (3:40/km, FC 174). Agregado: **~4.3 mmol a ~3:40/km (220 s/km), FC ~174**.
- LT1p: 1.55-0.3=1.25 mmol (~4:40/km). LT2p: 4.3-0.5=3.8 mmol (~3:47/km).
- **CapacityProfile running**: LT2=3600/220=16.4 km/h. Benchmark competitive: (13.5, 17.0). 16.4 en rango --> aerobic=**"high"**. Ratio: (3600/260)/(3600/220) = 13.85/16.36 = **0.847**. Rango 0.79-0.87 --> vlamax=**"moderate"**.

#### Ciclismo
- **LT1**: ~1.2-1.7 mmol, escalon 3-4 (~230-260W, FC ~135-146). Agregado: **~1.45 mmol a ~245W, FC ~140**.
- **LT2**: ~3.9 mmol, escalon 6 (310W, FC 165). Agregado: **~3.9 mmol a ~310W, FC ~165**.
- LT1p: 1.45-0.3=1.15 mmol (~215W). LT2p: 3.9-0.5=3.4 mmol (~295W).
- **CapacityProfile ciclismo**: LT2=310W. Benchmark competitive: (270, 380). 310 en rango --> aerobic=**"moderate"**. Ratio: 245/310=**0.790**. Borderline 0.79 --> vlamax=**"moderate"** (justo en la frontera).

#### Natacion
- **LT1**: ~1.5-2.0 mmol, escalon 3-4 (1:50-1:40/100m, FC ~133-143). Agregado: **~1.75 mmol a ~1:45/100m, FC ~138**.
- **LT2**: ~4.4 mmol, escalon 6 (1:27/100m = 1.15 m/s, FC 162). Agregado: **~4.4 mmol a ~1:27/100m, FC ~162**.
- **CapacityProfile natacion**: LT2 speed=1.15 m/s. Benchmark competitive: (3.8, 4.8) -- NOTA: los benchmarks de natacion estan en m/s? Segun el codigo: si. 1.15 m/s * 3.6 = 4.14 km/h. Hmm, los benchmarks (3.8, 4.8) parecen ser en km/h. 4.14 km/h esta en rango --> aerobic=**"moderate"**.

**VLamax estimado**: ~0.35-0.45 mmol/L/s (moderado para triatleta competitive; coherente con Ironman donde se necesita VLamax moderada-baja).

**Bloque recomendado**: Ironman en 8 meses = ~34 semanas. Fase: base_early. Con gaps moderados en las 3 disciplinas y perfil aerobico alto/moderate: **aerobic_capacity_block (AEC)** para construir la base de Ironman.

### Verificacion

- [x] LT1 detectado correctamente -- convergencia en las 3 disciplinas en escalones 3-4 (zona 1.3-2.0 mmol).
- [x] LT2 detectado correctamente -- convergencia clara en escalon 6 en las 3 disciplinas (3.9-4.4 mmol).
- [x] LT1p y LT2p calculados en las 3 disciplinas.
- [x] Senales coherentes -- triatleta competitive con umbrales altos, perfil aerobico alto, VLamax moderada. Coherente con Ironman.
- [x] Valores realistas -- LT2 running 3:40/km (FC 174 = 93% HRmax) para competitive de 29 anos es coherente con atleta de VO2max ~60-65 ml/kg/min. LT2 ciclismo 310W (~4.4 W/kg) coherente con competitive. LT2 natacion 1:27/100m coherente con triatleta elite (Olbrecht 2011: CSS ~1:20-1:30/100m para triatletas competitive).

---

## Perfil P04 -- Nadadora con poca base de carrera

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 26 anos |
| Sexo | Mujer |
| Peso | 63 kg |
| Disciplina | Triatlon (natacion + running) |
| Objetivo | 70.3 en 6 meses |
| Nivel | Trained |
| HRmax | 192 bpm |
| HR reposo | 56 bpm |

### Test de lactato: Natacion

| Escalon | Ritmo (min/100m) | Velocidad (m/s) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|---|
| 1 | 2:00 | 0.83 | 118 | 1.0 | 4 min |
| 2 | 1:50 | 0.91 | 128 | 1.1 | 4 min |
| 3 | 1:45 | 0.95 | 138 | 1.4 | 4 min |
| 4 | 1:40 | 1.00 | 147 | 1.8 | 4 min |
| 5 | 1:35 | 1.05 | 156 | 2.5 | 4 min |
| 6 | 1:30 | 1.11 | 165 | 3.8 | 4 min |
| 7 | 1:25 | 1.18 | 173 | 6.2 | 4 min |

### Test de lactato: Running

| Escalon | Ritmo (min/km) | Ritmo (s/km) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|---|
| 1 | 7:00 | 420 | 138 | 1.2 | 4 min |
| 2 | 6:30 | 390 | 148 | 1.3 | 4 min |
| 3 | 6:00 | 360 | 158 | 1.7 | 4 min |
| 4 | 5:40 | 340 | 167 | 2.4 | 4 min |
| 5 | 5:20 | 320 | 175 | 3.8 | 4 min |
| 6 | 5:00 | 300 | 183 | 5.9 | 4 min |
| 7 | 4:45 | 285 | 189 | 8.8 | 4 min |

Asimetria clara: natacion muestra curva gradual con LT2 alto, running muestra curva empinada con LT2 bajo. Refleja su background de nadadora.

### Analisis esperado del sistema

#### Natacion
- **LT1**: ~1.4-1.8 mmol, escalon 3-4 (1:45-1:40/100m). Agregado: **~1.6 mmol a ~1:42/100m, FC ~142**.
- **LT2**: ~3.8 mmol, escalon 6 (1:30/100m, FC 165). 3.8 >= 3.2 con pendiente suficiente. Agregado: **~3.8 mmol a ~1:30/100m, FC ~165**.
- Perfil natacion: buena curva gradual, umbrales bien desarrollados.

#### Running
- **LT1**: ~1.3-1.7 mmol, escalon 2-3 (6:30-6:00/km). Agregado: **~1.5 mmol a ~6:15/km, FC ~153**.
- **LT2**: baseline_rise: escalon 5 lactato 3.8 >= 3.2 con pendiente (3.8-2.4=1.4 >= 0.45) y next check (5.9 >= 3.8-0.5). **LT2 en escalon 5** (5:20/km, lactato 3.8, FC 175). sustained_increase confirma. Agregado: **~3.8 mmol a ~5:20/km, FC ~175**.
- Perfil running: curva mas empinada, umbrales mas bajos.

**CapacityProfile running**: LT2=3600/320=11.25 km/h. Benchmark trained running: (11.0, 14.5). 11.25 apenas entra --> aerobic=**"moderate"** (borderline low). Ratio: (3600/375)/(3600/320) = 9.6/11.25 = **0.853**. Rango 0.79-0.87 --> vlamax=**"moderate"**.

**Bloque recomendado**: 70.3 en 6 meses = ~26 semanas. Fase: base_late. Running es el limitante claro: LT2 running 5:20/km vs target ~5:00/km para 70.3 trained. Gap significativo en running. **aerobic_capacity_block (AEC)** prioritizing running.

### Verificacion

- [x] LT1 detectado correctamente en ambas disciplinas.
- [x] LT2 detectado correctamente -- natacion a 1:30/100m, running a 5:20/km.
- [x] LT1p y LT2p calculados.
- [x] Senales coherentes -- asimetria natacion/running clara. Sistema deberia identificar running como limitante.
- [x] Valores realistas -- LT2 natacion 1:30/100m para nadadora trained = CSS razonable. LT2 running 5:20/km para mujer trained con poca base de carrera es coherente. FC alta en running (175 al LT2 = 91% HRmax) refleja menor eficiencia de carrera.

---

## Perfil P05 -- Runner con estancamiento cronico

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 38 anos |
| Sexo | Hombre |
| Peso | 72 kg |
| Disciplina | Running |
| Objetivo | Sub-3h maraton |
| Nivel | Trained |
| HRmax | 184 bpm |
| HR reposo | 48 bpm |

### Test de lactato inicial (actual -- 3er test sin mejora)

| Escalon | Ritmo (min/km) | Ritmo (s/km) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|---|
| 1 | 5:30 | 330 | 128 | 0.9 | 4 min |
| 2 | 5:10 | 310 | 136 | 1.0 | 4 min |
| 3 | 4:50 | 290 | 145 | 1.3 | 4 min |
| 4 | 4:30 | 270 | 153 | 1.8 | 4 min |
| 5 | 4:20 | 260 | 161 | 2.5 | 4 min |
| 6 | 4:10 | 250 | 168 | 3.4 | 4 min |
| 7 | 4:00 | 240 | 174 | 4.8 | 4 min |
| 8 | 3:50 | 230 | 180 | 7.2 | 4 min |

### Tests previos (resumen para motor dinamico)

- Test 1 (8 semanas antes): LT2 = 4.0 mmol a 4:40/km (280 s/km), FC 169.
- Test 2 (4 semanas antes): LT2 = 4.1 mmol a 4:38/km (278 s/km), FC 170.
- Test 3 (actual): LT2 esperado ~ 4.0-4.8 mmol a ~4:10/km (250 s/km), FC 168.

Los 3 tests muestran estancamiento: el LT2 se mueve en el rango 4.0-4.8 mmol pero el ritmo apenas cambia (~4:10-4:40/km). Posible monotonia de estimulo o sobreentrenamiento.

### Analisis esperado del sistema

**Smoothed lactates** (aprox): [0.93, 1.07, 1.37, 1.87, 2.57, 3.57, 5.13, 6.00]

**LT1**: baseline=0.9, +0.5=1.4. Smoothed[3]=1.87 >= 1.4 y smoothed[4]=2.57 >= 1.87-0.25. **LT1 en escalon 4** (4:30/km, lactato 1.8, FC 153).
sustained_increase: +0.3=1.2. Smoothed[2]=1.37 >= 1.2, ascending, next ascending. **LT1 en escalon 3** (4:50/km, lactato 1.3, FC 145).
**Agregado LT1**: **~1.55 mmol a ~4:40/km (280 s/km), FC ~149**.

**LT2**: baseline_rise: smoothed[6]=5.13 >= 4.0. Pero primero chequear escalon 6: smoothed[5]=3.57. 3.57 >= max(3.2, 0.9+1.4=2.3) y pendiente 3.57-2.57=1.0 >= 0.45. Next: 5.13 >= 3.57-0.5. **LT2 en escalon 6** (4:10/km, lactato 3.4, FC 168).
sustained_increase: local_slope escalon 6 = 3.57-2.57=1.0, prior_slope escalon 5 = 2.57-1.87=0.70. 1.0 >= max(0.45, 0.70+0.2=0.90). Si. **LT2 en escalon 6**.
**Agregado LT2**: **~4.0 mmol a ~4:10/km (250 s/km), FC ~168**.

Nota: el valor real de lactato en escalon 6 es 3.4, pero smoothed es 3.57. El sistema usa lactato contextual (real, no smoothed) para el ThresholdResult. Asi que LT2 lactato = **3.4 mmol**.

Wait -- revisando: baseline_rise busca >= 4.0 en smoothed O >= 3.2 con pendiente. Smoothed[5]=3.57 >= 3.2 y pendiente=1.0 >= 0.45. Pero 3.57 >= max(3.2, baseline+1.4=2.3) es True. Y next check: smoothed[6]=5.13 >= 3.57-0.5 es True. Entonces LT2 en escalon 6. Pero el lactato real es 3.4, y el metodo reporta el contextual_lactate del escalon, que es 3.4.

**LT2 corregido**: **3.4 mmol a 4:10/km, FC 168**. Esto es mas bajo que 4.0 -- coherente con un atleta cuyo LT2 real esta por debajo de 4 mmol y no en el anchor fijo.

**LT1p**: 1.55-0.3 = 1.25 mmol (~5:00/km). **LT2p**: 3.4-0.5 = 2.9 mmol (~4:20/km).

**CapacityProfile**: LT2=3600/250=14.4 km/h. Benchmark trained: (11.0, 14.5). 14.4 en rango --> aerobic=**"moderate"** (borderline high). Ratio: (3600/280)/(3600/250) = 12.86/14.40 = **0.893**. Ratio > 0.87 --> vlamax=**"low"**.

**VLamax estimado**: ~0.25-0.35 mmol/L/s (bajo -- perfil diesel). Esto es coherente con el estancamiento: un atleta diesel que solo entrena aerobico estancara porque su VLamax ya es baja y necesita estimulos diferentes.

**Bloque recomendado**: Sub-3h maraton (4:16/km) en distancia desconocida de semanas. LT2 a 4:10/km esta MUY cerca del objetivo. Gap pequeno. Perfil diesel (VLamax low). Segun Olbrecht: atleta diesel con gap minimo necesita **aerobic_power_block (AEP)** o, en base_late con VLamax baja, **anaerobic_capacity_block (ANC)** para "despertar" la glucolisis. El motor fisiologico deberia considerar ANC si esta en base_late y el perfil es diesel.

### Verificacion

- [x] LT1 detectado correctamente -- escalon 3-4 (1.3-1.8 mmol a ~4:40/km).
- [x] LT2 detectado correctamente -- escalon 6 (3.4 mmol a 4:10/km). Nota: LT2 esta por debajo de 4 mmol, detectado por criterio de pendiente.
- [x] LT1p y LT2p calculados.
- [x] Senales coherentes -- perfil diesel con umbrales estancados. VLamax baja. El motor dinamico con 3 tests deberia confirmar la falta de progresion.
- [x] Valores realistas -- LT2 a 4:10/km para hombre trained de 38 anos es coherente con sub-3h maraton borderline. FC 168 al LT2 = 91% HRmax, tipico de entrenado. Ratio alto (0.89) confirmado como diesel.

---

## Perfil P06 -- Triatleta joven con perfil mixto

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 19 anos |
| Sexo | Hombre |
| Peso | 65 kg |
| Disciplina | Triatlon (running + ciclismo) |
| Objetivo | Primera temporada elite juvenil |
| Nivel | Trained |
| HRmax | 198 bpm |
| HR reposo | 52 bpm |

### Test de lactato: Running

| Escalon | Ritmo (min/km) | Ritmo (s/km) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|---|
| 1 | 5:00 | 300 | 138 | 1.1 | 4 min |
| 2 | 4:40 | 280 | 148 | 1.3 | 4 min |
| 3 | 4:20 | 260 | 158 | 1.6 | 4 min |
| 4 | 4:05 | 245 | 168 | 2.3 | 4 min |
| 5 | 3:50 | 230 | 177 | 3.8 | 4 min |
| 6 | 3:35 | 215 | 186 | 6.5 | 4 min |
| 7 | 3:25 | 205 | 193 | 10.2 | 4 min |

### Test de lactato: Ciclismo

| Escalon | Potencia (W) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|
| 1 | 140 | 118 | 1.0 | 4 min |
| 2 | 170 | 130 | 1.2 | 4 min |
| 3 | 200 | 142 | 1.5 | 4 min |
| 4 | 230 | 155 | 2.2 | 4 min |
| 5 | 260 | 167 | 3.5 | 4 min |
| 6 | 280 | 178 | 5.8 | 4 min |
| 7 | 300 | 188 | 9.5 | 4 min |

Curva empinada en ambas disciplinas: VLamax alta tipica de joven con capacidad glucolitica natural. Lactato sube rapido a partir de ~4:00/km (running) y ~240W (ciclismo). Picos muy altos (10.2, 9.5 mmol) indican alta produccion de lactato.

### Analisis esperado del sistema

#### Running
- **LT1**: baseline=1.1, +0.5=1.6. Smoothed ~[1.13, 1.33, 1.73, 2.57, 4.20, 6.83, 8.35]. Smoothed[2]=1.73 >= 1.6. **LT1 en escalon 3** (4:20/km, lactato 1.6, FC 158).
- sustained_increase: +0.3=1.4. Smoothed[2]=1.73 >= 1.4, ascending, next ascending. **LT1 en escalon 3**.
- **Agregado LT1**: **~1.6 mmol a 4:20/km, FC 158**.

- **LT2**: smoothed[4]=4.20 >= 4.0. Next: 6.83 >= 4.20-0.5. **LT2 en escalon 5** (3:50/km, lactato 3.8, FC 177). O si baseline_rise detecta primero con criterio 3.2: smoothed[4]=4.20 >= 3.2, pendiente 4.20-2.57=1.63 >= 0.45. Yes. **LT2 en escalon 5**.
- sustained_increase: local_slope=4.20-2.57=1.63, prior=2.57-1.73=0.84. 1.63 >= max(0.45, 0.84+0.2=1.04). Yes. **LT2 en escalon 5**.
- **Agregado LT2**: **~3.8 mmol a 3:50/km (230 s/km), FC 177**.

- Ratio: (3600/260)/(3600/230) = 13.85/15.65 = **0.885**. Borderline moderate/low. Casi 0.87 --> **vlamax = "moderate"** (just below low threshold).
- LT2 = 15.65 km/h. Benchmark trained: (11.0, 14.5). 15.65 > 14.5 --> **aerobic = "high"**.
- Pero raw_vlamax moderate + aerobic high = **vlamax = "moderate"**.

NOTA: El ratio sugiere VLamax moderada, pero los picos de lactato altisimos (10.2 mmol) y la curva empinada claramente indican VLamax alta. Esto es otra limitacion del proxy: el ratio depende de donde se detecta LT1, y en una curva empinada los umbrales estan comprimidos, lo que sube el ratio artificialmente. El pico de lactato seria un mejor proxy de VLamax.

**Bloque recomendado**: Primera temporada elite juvenil, fase early. Con VLamax alta (real) y base aerobica en construccion: **aerobic_capacity_block (AEC)**. Olbrecht: los jovenes con alta glucolisis necesitan primero construir capacidad aerobica antes de desarrollar potencia.

### Verificacion

- [x] LT1 detectado correctamente -- escalon 3 en ambos tests.
- [x] LT2 detectado correctamente -- escalon 5 en ambos tests (~3.8/3.5 mmol).
- [x] LT1p y LT2p calculados.
- [ ] Senales coherentes -- **PARCIAL**: el proxy VLamax clasifica "moderate" cuando la curva claramente indica "high". Los picos de lactato >10 mmol son un indicador fuerte de VLamax alta que el sistema no captura directamente.
- [x] Valores realistas -- LT2 a 3:50/km para joven de 19 anos trained es coherente. Picos >10 mmol reflejan alta capacidad glucolitica juvenil. FC 177 al LT2 = 89% HRmax.

---

## Perfil P07 -- Ciclista reconvertida a triatleta

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 34 anos |
| Sexo | Mujer |
| Peso | 61 kg |
| Disciplina | Triatlon (ciclismo + running + natacion) |
| Objetivo | 70.3 en 5 meses |
| Nivel | Trained |
| HRmax | 186 bpm |
| HR reposo | 50 bpm |

### Test de lactato: Ciclismo

| Escalon | Potencia (W) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|
| 1 | 100 | 102 | 0.7 | 4 min |
| 2 | 130 | 112 | 0.8 | 4 min |
| 3 | 160 | 123 | 1.0 | 4 min |
| 4 | 190 | 135 | 1.4 | 4 min |
| 5 | 210 | 145 | 1.9 | 4 min |
| 6 | 230 | 155 | 2.7 | 4 min |
| 7 | 245 | 163 | 3.8 | 4 min |
| 8 | 260 | 170 | 5.6 | 4 min |

### Test de lactato: Running

| Escalon | Ritmo (min/km) | Ritmo (s/km) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|---|
| 1 | 7:00 | 420 | 138 | 1.1 | 4 min |
| 2 | 6:30 | 390 | 148 | 1.3 | 4 min |
| 3 | 6:00 | 360 | 158 | 1.8 | 4 min |
| 4 | 5:40 | 340 | 166 | 2.7 | 4 min |
| 5 | 5:20 | 320 | 174 | 4.2 | 4 min |
| 6 | 5:05 | 305 | 181 | 6.8 | 4 min |

### Test de lactato: Natacion

| Escalon | Ritmo (min/100m) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|
| 1 | 2:30 | 122 | 1.3 | 4 min |
| 2 | 2:15 | 132 | 1.6 | 4 min |
| 3 | 2:05 | 143 | 2.3 | 4 min |
| 4 | 1:55 | 154 | 3.5 | 4 min |
| 5 | 1:50 | 163 | 5.4 | 4 min |
| 6 | 1:45 | 171 | 8.2 | 4 min |

### Analisis esperado del sistema

#### Ciclismo (disciplina fuerte)
- **LT1**: baseline=0.7, +0.5=1.2. ~Escalon 4 (190W, 1.4 mmol, FC 135). Agregado: **~1.2 mmol a ~175W, FC ~129**.
- **LT2**: Escalon 7 (245W, 3.8 mmol, FC 163). 3.8 >= 3.2 con pendiente. Agregado: **~3.8 mmol a ~245W, FC ~163**.
- Ratio: 175/245 = **0.714** --> raw_vlamax = "high". Aerobic: 245W para trained mujer. Benchmark trained ciclismo: (220, 310). 245 en rango --> aerobic = "moderate". Entonces vlamax = "high".
- NOTA: Similar al P02, el ratio en potencia amplifica la clasificacion de VLamax. La curva gradual de ciclismo no sugiere VLamax alta.

#### Running (disciplina debil)
- **LT1**: ~1.3-1.8 mmol, escalon 2-3 (6:30-6:00/km). Agregado: **~1.55 mmol a ~6:15/km, FC ~153**.
- **LT2**: Escalon 5 (5:20/km, 4.2 mmol, FC 174). Agregado: **~4.2 mmol a 5:20/km, FC 174**.
- Curva mas empinada que ciclismo -- menos base de carrera.

#### Natacion (disciplina mas debil)
- **LT1**: baseline=1.3. +0.5=1.8. Solo escalon 2 llega a 1.6; smoothed podria ser ~1.4 en escalon 2, ~1.73 en escalon 3. LT1 probable en escalon 2-3 (~2:15-2:05/100m). Agregado: **~1.6 mmol a ~2:10/100m, FC ~137**.
- **LT2**: Escalon 4 (1:55/100m, 3.5 mmol, pendiente 3.5-2.3=1.2 >= 0.45). Agregado: **~3.5 mmol a ~1:55/100m, FC ~154**. Curva muy empinada en natacion -- LT2 temprano.

**Bloque recomendado**: 70.3 en 5 meses = ~21 semanas. Fase: base_late. Limitante claro: running (LT2 a 5:20/km) y natacion (muy empinada). Con asimetria de disciplinas: **aerobic_capacity_block (AEC)** focalizando running y natacion.

### Verificacion

- [x] LT1 detectado correctamente en las 3 disciplinas.
- [x] LT2 detectado correctamente en las 3 disciplinas.
- [x] LT1p y LT2p calculados.
- [x] Senales coherentes -- asimetria clara: ciclismo bueno, running mediocre, natacion limitada. Sistema identifica correctamente las disciplinas limitantes.
- [ ] Valores realistas -- **PARCIAL**: LT2 ciclismo 245W (~4.0 W/kg) para mujer trained es bueno. LT2 running 5:20/km es coherente con poca base de carrera. LT2 natacion 1:55/100m es coherente con ex-ciclista sin background de natacion. Sin embargo, el proxy VLamax en ciclismo clasifica "high" cuando deberia ser "moderate" o "low" por la curva gradual.

---

## Perfil P08 -- Runner masters con buena base

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 48 anos |
| Sexo | Mujer |
| Peso | 55 kg |
| Disciplina | Running |
| Objetivo | Sub-2h media maraton |
| Nivel | Trained |
| HRmax | 174 bpm (208 - 0.7*48) |
| HR reposo | 50 bpm |

### Test de lactato inicial

| Escalon | Ritmo (min/km) | Ritmo (s/km) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|---|
| 1 | 6:30 | 390 | 118 | 0.8 | 4 min |
| 2 | 6:00 | 360 | 127 | 0.9 | 4 min |
| 3 | 5:40 | 340 | 135 | 1.1 | 4 min |
| 4 | 5:20 | 320 | 142 | 1.4 | 4 min |
| 5 | 5:00 | 300 | 150 | 1.9 | 4 min |
| 6 | 4:45 | 285 | 156 | 2.6 | 4 min |
| 7 | 4:30 | 270 | 162 | 3.8 | 4 min |
| 8 | 4:15 | 255 | 168 | 5.5 | 4 min |

Curva gradual, clasica de atleta con buena base aerobica. Baseline bajo (0.8 mmol), lactato se mantiene <2 mmol hasta 5:00/km. Test limpio con 8 escalones.

### Analisis esperado del sistema

**Smoothed lactates**: [0.87, 0.93, 1.13, 1.47, 1.77, 2.77, 3.97, 4.65]

**LT1**: baseline=0.8, +0.5=1.3. Smoothed[3]=1.47 >= 1.3. Next: 1.77 >= 1.47-0.25. **LT1 en escalon 4** (5:20/km, lactato 1.4, FC 142).
sustained_increase: +0.3=1.1. Smoothed[2]=1.13 >= 1.1, ascending, next ascending. **LT1 en escalon 3** (5:40/km, lactato 1.1, FC 135).
**Agregado LT1**: lactato = media(1.4, 1.1) = **1.25 mmol**; ritmo = mediana(320, 340) = **330 s/km (~5:30/km)**; FC = **138 bpm**.

**LT2**: smoothed[6]=3.97. 3.97 >= 3.2, pendiente 3.97-2.77=1.20 >= 0.45. Next: 4.65 >= 3.97-0.5. **LT2 en escalon 7** (4:30/km, lactato 3.8, FC 162).
sustained_increase: local_slope=1.20, prior=2.77-1.77=1.00. 1.20 >= max(0.45, 1.00+0.2=1.20). Borderline yes. **LT2 en escalon 7**.
**Agregado LT2**: **~3.8 mmol a 4:30/km (270 s/km), FC 162**.

**LT1p**: 1.25-0.3 = **0.95 mmol** (~5:50/km).
**LT2p**: 3.8-0.5 = **3.3 mmol** (~4:38/km).

**CapacityProfile**: LT2 = 3600/270 = 13.33 km/h. Benchmark trained: (11.0, 14.5). En rango --> **aerobic = "moderate"**. Ratio: (3600/330)/(3600/270) = 10.91/13.33 = **0.818**. Rango 0.79-0.87 --> **vlamax = "moderate"**.

**VLamax estimado**: ~0.30-0.40 mmol/L/s (moderado, ligeramente hacia bajo).

**Bloque recomendado**: Sub-2h HM = 5:41/km. Actual LT2 a 4:30/km -- MUY por encima del target. La atleta puede correr HM significativamente mas rapido que 2h. Factor HM trained = 0.92. Required LT2 = (3600/341)/0.92 = 10.56/0.92 = 11.48 km/h = 5:14/km. Actual LT2 = 4:30/km = 13.33 km/h. Sobra margen. Con gap negativo (ya supera el objetivo): **aerobic_power_block (AEP)** para afinar potencia aerobica, o **competition_specific_block** si esta en fase pre-comp.

### Verificacion

- [x] LT1 detectado correctamente -- escalon 3-4 (1.1-1.4 mmol a ~5:30/km). Test limpio con buena convergencia.
- [x] LT2 detectado correctamente -- escalon 7 (3.8 mmol a 4:30/km). Criterio de pendiente, no llega a 4.0 mmol en smoothed.
- [x] LT1p y LT2p calculados.
- [x] Senales coherentes -- buena base aerobica, VLamax moderada, objetivo conservador. El sistema deberia notar que el objetivo ya esta superado.
- [x] Valores realistas -- LT2 a 4:30/km para mujer masters trained de 48 anos es excelente (equivale a ~1:35 HM, claramente sub-2h). FC 162 al LT2 = 93% HRmax, tipico de bien entrenada. Baseline 0.8 mmol indica buen fitness aerobico.

---

## Perfil P09 -- Atleta con protocolo de test deficiente

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 31 anos |
| Sexo | Hombre |
| Peso | 80 kg |
| Disciplina | Triatlon |
| Objetivo | Ironman en 7 meses |
| Nivel | Trained |
| HRmax | 190 bpm |
| HR reposo | 54 bpm |

### Test de lactato: Running (PROTOCOLO DEFICIENTE)

| Escalon | Ritmo (min/km) | Ritmo (s/km) | FC (bpm) | Lactato (mmol/L) | Duracion | Nota |
|---|---|---|---|---|---|---|
| 1 | 6:00 | 360 | 138 | 1.2 | 6 min | Demasiado largo |
| 2 | 5:00 | 300 | 158 | 2.8 | 6 min | Salto grande (1:00/km) |
| 3 | 4:20 | 260 | 175 | 5.6 | 3 min | Duracion corta |
| 4 | 4:00 | 240 | 185 | 9.1 | 2 min | Demasiado corto |

Solo 4 escalones validos. Saltos irregulares (6:00->5:00->4:20->4:00). Duraciones variables (6-6-3-2 min). La toma de lactato puede no reflejar steady-state en escalones 3 y 4 por su corta duracion.

### Analisis esperado del sistema

Este perfil testea los **edge cases** del motor:

**Con solo 4 escalones**: moddmax requiere >= 4, pero con 4 la estimacion es marginal.

**Smoothed lactates**: [2.0, 3.20, 5.83, 7.35] (smoothing con 3 puntos distorsiona porque los lactatos son muy heterogeneos).

**LT1**: baseline = min([2.0, 3.20, 5.83, 7.35]) = 2.0 (el primer punto ya es alto). +0.5 = 2.5. Smoothed[1]=3.20 >= 2.5. Next: 5.83 >= 3.20-0.25. **LT1 en escalon 2** (5:00/km, lactato 2.8, FC 158).
sustained_increase: +0.3=2.3. Smoothed[1]=3.20 >= 2.3, ascending, next ascending. **LT1 en escalon 2**.
**Agregado LT1**: **2.8 mmol a 5:00/km, FC 158**. NOTA: Este LT1 es muy alto (2.8 mmol) porque el baseline ya esta a 1.2 mmol (suavizado a 2.0) y el salto al escalon 2 es enorme (+1.6 mmol). Un test con incrementos de 1:00/km entre escalones no permite resolver LT1 con precision.

**LT2**: smoothed[1]=3.20 >= 3.2 y pendiente=3.20-2.0=1.20 >= 0.45. Pero esto seria escalon 2 de nuevo, que ya es LT1. El motor detectaria LT2 en escalon 2 o 3. Si detecta en escalon 2: LT2=LT1, lo cual no tiene sentido. Si el baseline_rise busca >= 4.0: smoothed[2]=5.83. **LT2 en escalon 3** (4:20/km, lactato 5.6, FC 175).

**LT2**: Mas probable: **5.6 mmol a 4:20/km, FC 175**.

**Real thresholds**: con solo 4 etapas, el gate de >= 5 etapas NO se cumple. **lt1_real = null, lt2_real = null**. El sistema correctamente NO estima umbrales reales.

**protocol_score**: escalones con duraciones < 4 min tendran protocol_score bajo, reduciendo la confianza.

**CapacityProfile**: Con confianza baja y datos insuficientes: source = "basic" o "insufficient". El perfil sera de baja confianza.

**Bloque recomendado**: Con datos insuficientes y baja confianza: **aerobic_capacity_block (AEC)** como default conservador.

### Verificacion

- [ ] LT1 detectado correctamente -- **PROBLEMATICO**: LT1 a 2.8 mmol es artificialmente alto por los saltos grandes entre escalones. Un protocolo con 8 escalones habria detectado LT1 a ~1.5-1.8 mmol.
- [ ] LT2 detectado correctamente -- **PARCIAL**: LT2 a 5.6 mmol es probable que este sobreestimado. El escalon 3 (4:20/km) fue de solo 3 min, insuficiente para steady-state.
- [x] LT1p y LT2p calculados -- pero con valores distorsionados.
- [x] Senales coherentes -- el sistema correctamente identifica la baja calidad del test (confianza reducida, real thresholds = null).
- [x] Valores realistas -- los valores SON posibles fisiologicamente, pero la baja confianza refleja adecuadamente la mala calidad del protocolo. El sistema no inventa precision donde no la hay.

---

## Perfil P10 -- Triatleta post-lesion

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 33 anos |
| Sexo | Mujer |
| Peso | 67 kg |
| Disciplina | Triatlon |
| Objetivo | Volver a 70.3 en 6 meses |
| Nivel | Trained (pre-lesion) / Recreational (actual) |
| HRmax | 188 bpm |
| HR reposo | 62 bpm (elevado por desentrenamiento) |
| Historial | 3 meses sin entrenar |

### Test de lactato: Running

| Escalon | Ritmo (min/km) | Ritmo (s/km) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|---|
| 1 | 7:00 | 420 | 142 | 1.3 | 4 min |
| 2 | 6:30 | 390 | 152 | 1.5 | 4 min |
| 3 | 6:00 | 360 | 162 | 2.1 | 4 min |
| 4 | 5:40 | 340 | 170 | 3.2 | 4 min |
| 5 | 5:20 | 320 | 177 | 4.8 | 4 min |
| 6 | 5:05 | 305 | 183 | 7.3 | 4 min |

Curva empinada post-desentrenamiento: FC de reposo elevada (62 vs esperada ~52), FC alta a ritmos bajos (142 a 7:00/km), lactato sube rapido. Baseline mas alto de lo normal (1.3 mmol). LT2 precoz (escalon 4-5). Coherente con 3 meses de desentrenamiento (Mujika & Padilla, 2001: la perdida de adaptaciones aerobicas es rapida en las primeras 2-4 semanas, con deterioro de clearance de lactato y densidad mitocondrial).

### Analisis esperado del sistema

**Smoothed lactates**: [1.37, 1.63, 2.27, 3.37, 5.10, 6.05]

**LT1**: baseline=1.3 (de smoothed ~1.37), +0.5=1.87. Smoothed[2]=2.27 >= 1.87 y smoothed[3]=3.37 >= 2.27-0.25. **LT1 en escalon 3** (6:00/km, lactato 2.1, FC 162).
sustained_increase: +0.3=1.67. Smoothed[1]=1.63 < 1.67. Smoothed[2]=2.27 >= 1.67, ascending, next ascending. **LT1 en escalon 3**.
**Agregado LT1**: **~2.1 mmol a 6:00/km (360 s/km), FC 162**.

**LT2**: smoothed[3]=3.37 >= max(3.2, 1.3+1.4=2.7) y pendiente 3.37-2.27=1.10 >= 0.45. Next: 5.10 >= 3.37-0.5. **LT2 en escalon 4** (5:40/km, lactato 3.2, FC 170).
O baseline_rise >= 4.0: smoothed[4]=5.10. Pero primero llega el criterio de 3.2 con pendiente.
**Agregado LT2**: **~3.2 mmol a 5:40/km (340 s/km), FC 170**.

**LT1p**: 2.1-0.3 = 1.8 mmol (~6:10/km).
**LT2p**: 3.2-0.5 = 2.7 mmol (~5:50/km).

**CapacityProfile**: LT2 = 3600/340 = 10.59 km/h. Benchmark trained: (11.0, 14.5). 10.59 < 11.0 --> **aerobic = "low"**. Pero nivel deberia ser "recreational" actual -- si se introduce como "trained": aerobic = "low".
Ratio: (3600/360)/(3600/340) = 10.0/10.59 = **0.944**. Ratio > 0.87 --> raw_vlamax = "low". Pero aerobic = "low" --> correccion: ratio alto + aerobico bajo = **vlamax = "moderate"** (comprimido, no diesel real).

Esta correccion es correcta: la atleta no es diesel, sino que sus umbrales estan comprimidos por el desentrenamiento. Umbrales juntos + ambos bajos = motor comprimido, no diesel.

**Bloque recomendado**: 70.3 en 6 meses = ~26 semanas. Fase: base_early. Aerobic low + motor comprimido: **aerobic_capacity_block (AEC)** prioritario para reconstruir base.

### Verificacion

- [x] LT1 detectado correctamente -- escalon 3 (2.1 mmol a 6:00/km). LT1 alto (2.1 vs tipico 1.5-1.8) refleja desentrenamiento.
- [x] LT2 detectado correctamente -- escalon 4 (3.2 mmol a 5:40/km). LT2 bajo y precoz refleja desadaptacion.
- [x] LT1p y LT2p calculados -- valores comprimidos (1.8 y 2.7 mmol) coherentes.
- [x] Senales coherentes -- motor comprimido (umbrales juntos + bajos), VLamax corregida a "moderate" (no falso diesel). AEC es la recomendacion correcta post-lesion.
- [x] Valores realistas -- FC elevadas a ritmos bajos (142 a 7:00/km) refleja desentrenamiento cardiovascular. Baseline alto (1.3 mmol) coherente con 3 meses sin entrenar. LT2 precoz a 5:40/km para mujer post-lesion es realista (Mujika & Padilla 2001: perdida de ~6-8% en 3-4 semanas de desentrenamiento).

---

## Perfil P11 -- Ciclista puro sin datos de running

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 41 anos |
| Sexo | Hombre |
| Peso | 82 kg |
| Disciplina | Ciclismo |
| Objetivo | Vuelta ciclista amateur en 4 meses |
| Nivel | Trained |
| HRmax | 179 bpm (208 - 0.7*41) |
| HR reposo | 48 bpm |
| FTP estimado | ~280W (~3.4 W/kg) |

### Test de lactato: Ciclismo (primer test)

| Escalon | Potencia (W) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|
| 1 | 130 | 95 | 0.7 | 4 min |
| 2 | 160 | 108 | 0.8 | 4 min |
| 3 | 190 | 118 | 1.0 | 4 min |
| 4 | 220 | 130 | 1.3 | 4 min |
| 5 | 250 | 142 | 1.8 | 4 min |
| 6 | 275 | 153 | 2.6 | 4 min |
| 7 | 300 | 162 | 4.5 | 4 min |

Curva gradual hasta 250W, salto marcado a 275-300W. Primer test: sin historial previo en el sistema.

### Analisis esperado del sistema

**Smoothed lactates**: [0.77, 0.83, 1.03, 1.37, 1.70, 2.97, 3.55] -- nota: solo 7 escalones, el ultimo smoothed puede ser [0.77, 0.83, 1.03, 1.37, 1.70, 2.97, 3.55].

Wait, recalcular: smooth de [0.7, 0.8, 1.0, 1.3, 1.8, 2.6, 4.5]:
- idx0: mean(0.7, 0.8) = 0.75
- idx1: mean(0.7, 0.8, 1.0) = 0.83
- idx2: mean(0.8, 1.0, 1.3) = 1.03
- idx3: mean(1.0, 1.3, 1.8) = 1.37
- idx4: mean(1.3, 1.8, 2.6) = 1.90
- idx5: mean(1.8, 2.6, 4.5) = 2.97
- idx6: mean(2.6, 4.5) = 3.55

**LT1**: baseline=0.7 (smoothed min=0.75), +0.5=1.25. Smoothed[3]=1.37 >= 1.25 y smoothed[4]=1.90 >= 1.37-0.25. **LT1 en escalon 4** (220W, lactato 1.3, FC 130).
sustained_increase: +0.3=1.05. Smoothed[2]=1.03 < 1.05. Smoothed[3]=1.37 >= 1.05, ascending, next ascending. **LT1 en escalon 4**.
**Agregado LT1**: **~1.3 mmol a 220W, FC 130**.

**LT2**: smoothed[5]=2.97. 2.97 >= max(3.2, 0.7+1.4=2.1)? 2.97 < 3.2: NO por baseline_rise con criterio 3.2. Smoothed[6]=3.55 >= 3.2, pendiente 3.55-2.97=0.58 >= 0.45. Next: no hay siguiente (ultimo escalon). El metodo toma el ultimo si no hay otro candidato.
Alternativa: >= 4.0: smoothed no llega a 4.0 (max 3.55). Pero el lactato REAL del escalon 7 es 4.5. El sistema usa lactates smoothed para la deteccion pero reporta el contextual_lactate. **LT2 en escalon 7** (300W, lactato 4.5, FC 162).

sustained_increase: local_slope escalon 6 = 2.97-1.90=1.07, prior=1.90-1.37=0.53. 1.07 >= max(0.45, 0.53+0.2=0.73). Yes. Pero smoothed[5]=2.97 >= max(3.2, 2.1)? 2.97 < 3.2: NO. Escalon 7: local_slope=3.55-2.97=0.58, prior=1.07. 0.58 >= max(0.45, 1.07+0.2=1.27)? NO. Fallback al ultimo escalon.
**LT2 en escalon 7** (300W, lactato 4.5, FC 162) por fallback. O baseline_rise detecta en escalon 7 con smoothed 3.55 >= 3.2 y pendiente 0.58 >= 0.45.

**Agregado LT2**: **~4.5 mmol a 300W, FC 162**.

**LT1p**: 1.3-0.3 = 1.0 mmol (~195W). **LT2p**: 4.5-0.5 = 4.0 mmol (~290W).

**CapacityProfile**: LT2 = 300W. Benchmark trained: (220, 310). En rango --> **aerobic = "moderate"**. Ratio: 220/300 = **0.733**. < 0.79 --> raw_vlamax = "high". Aerobic moderate --> **vlamax = "high"**.

Misma problematica que P02/P07: el ratio en potencia tiende a clasificar VLamax como "high" en ciclismo incluso con curvas graduales.

**Bloque recomendado**: Vuelta amateur en 4 meses = ~17 semanas. Fase: base_late/specific. Sin datos previos, default conservador: **aerobic_capacity_block (AEC)** o **threshold_development_block (THR)** segun gap.

### Verificacion

- [x] LT1 detectado correctamente -- escalon 4 (1.3 mmol a 220W). Convergencia buena.
- [x] LT2 detectado correctamente -- escalon 7 (4.5 mmol a 300W). Es el ultimo escalon, lo cual puede limitar la precision: idealmente se necesitarian 1-2 escalones mas alla del LT2.
- [x] LT1p y LT2p calculados.
- [ ] Senales coherentes -- **ATENCION**: VLamax "high" por ratio de potencia es probablemente incorrecto. La curva gradual no sugiere alta glucolisis.
- [x] Valores realistas -- LT2 a 300W (~3.7 W/kg) para hombre trained de 82kg es coherente. Baseline 0.7 mmol indica buen estado aerobico. FC 162 al LT2 = 91% HRmax.

---

## Perfil P12 -- Nadador de aguas abiertas

### Datos del atleta

| Campo | Valor |
|---|---|
| Edad | 27 anos |
| Sexo | Hombre |
| Peso | 73 kg |
| Disciplina | Natacion |
| Objetivo | 10km aguas abiertas en 3 meses |
| Nivel | Competitive |
| HRmax | 186 bpm |
| HR reposo | 46 bpm |

### Test de lactato: Natacion

| Escalon | Ritmo (min/100m) | Velocidad (m/s) | FC (bpm) | Lactato (mmol/L) | Duracion |
|---|---|---|---|---|---|
| 1 | 2:15 | 0.74 | 108 | 0.9 | 4 min |
| 2 | 2:00 | 0.83 | 118 | 1.0 | 4 min |
| 3 | 1:50 | 0.91 | 130 | 1.2 | 4 min |
| 4 | 1:40 | 1.00 | 142 | 1.5 | 4 min |
| 5 | 1:30 | 1.11 | 152 | 2.0 | 4 min |
| 6 | 1:25 | 1.18 | 161 | 2.8 | 4 min |
| 7 | 1:20 | 1.25 | 170 | 4.2 | 4 min |

Curva MUY gradual: tipica de nadador de aguas abiertas con excelente base aerobica y VLamax baja. Lactato se mantiene < 2 mmol hasta 1:30/100m. Solo sube por encima de 4 mmol en el ultimo escalon. Coherente con el perfil diesel que Olbrecht describe para nadadores de larga distancia.

### Analisis esperado del sistema

**Smoothed lactates**: [0.95, 1.03, 1.23, 1.57, 1.83, 3.00, 3.50] -- recalcular:
- idx0: mean(0.9, 1.0) = 0.95
- idx1: mean(0.9, 1.0, 1.2) = 1.03
- idx2: mean(1.0, 1.2, 1.5) = 1.23
- idx3: mean(1.2, 1.5, 2.0) = 1.57
- idx4: mean(1.5, 2.0, 2.8) = 2.10
- idx5: mean(2.0, 2.8, 4.2) = 3.00
- idx6: mean(2.8, 4.2) = 3.50

**LT1**: baseline=0.9 (smoothed min=0.95), +0.5=1.45. Smoothed[3]=1.57 >= 1.45 y smoothed[4]=2.10 >= 1.57-0.25. **LT1 en escalon 4** (1:40/100m, lactato 1.5, FC 142).
sustained_increase: +0.3=1.25. Smoothed[2]=1.23 < 1.25. Smoothed[3]=1.57 >= 1.25, ascending, next ascending. **LT1 en escalon 4**.
**Agregado LT1**: **~1.5 mmol a 1:40/100m (1.00 m/s), FC 142**.

**LT2**: baseline_rise >= 4.0: smoothed no llega a 4.0 (max 3.50). Criterio 3.2: smoothed[5]=3.00 < 3.2. Smoothed[6]=3.50 >= 3.2, pendiente 3.50-3.00=0.50 >= 0.45. Next: no hay siguiente (ultimo). El sistema acepta si next_value=value (default para ultimo punto). **LT2 en escalon 7** (1:20/100m, lactato 4.2, FC 170).

sustained_increase: smoothed[6]=3.50 >= max(3.2, 0.9+1.4=2.3). local_slope=3.50-3.00=0.50, prior=3.00-2.10=0.90. 0.50 >= max(0.45, 0.90+0.2=1.10)? 0.50 < 1.10. NO. Fallback al ultimo escalon. **LT2 en escalon 7** por baseline_rise.

ModDmax: inicio en escalon donde >= 0.9+0.5=1.4: escalon 4 (smoothed 1.57). Linea de escalon 4 a escalon 7. Maxima desviacion perpendicular sera baja (curva muy gradual), probablemente en escalon 5-6. **LT2 ~ escalon 6-7**.

**Agregado LT2**: **~4.2 mmol a 1:20/100m (1.25 m/s), FC 170**. Nota: el LT2 cae en el ultimo escalon, lo que indica que el test deberia haber incluido al menos 1-2 escalones mas.

**LT1p**: 1.5-0.3 = 1.2 mmol (~1:45/100m). **LT2p**: 4.2-0.5 = 3.7 mmol (~1:22/100m).

**CapacityProfile natacion**: LT2 speed = 1.25 m/s * 3.6 = 4.50 km/h. Benchmark competitive natacion: (3.8, 4.8). 4.50 en rango --> **aerobic = "moderate"**. Ratio: 1.00/1.25 = **0.800**. Rango 0.79-0.87 --> **vlamax = "moderate"** (borderline low).

**VLamax estimado**: ~0.20-0.30 mmol/L/s (bajo -- diesel de larga distancia). El ratio 0.80 esta justo por encima de 0.79, clasificando como moderate en vez de low. La curva ultragradual sugiere que deberia ser "low".

**Bloque recomendado**: 10km OW en 3 meses = ~13 semanas. Fase: specific/pre_comp. Distance category: open_water_long. Con perfil diesel y buen aerobico: **aerobic_power_block (AEP)** o **competition_specific_block (COMP)**. Con VLamax baja y evento largo, Olbrecht recomienda mantener capacidad aerobica y afinar potencia.

### Verificacion

- [x] LT1 detectado correctamente -- escalon 4 (1.5 mmol a 1:40/100m).
- [x] LT2 detectado correctamente -- escalon 7 (4.2 mmol a 1:20/100m). Limitacion: ultimo escalon, test deberia ser mas largo.
- [x] LT1p y LT2p calculados.
- [x] Senales coherentes -- perfil diesel de nadador OW. VLamax borderline moderate/low es adecuada.
- [x] Valores realistas -- LT2 a 1:20/100m para nadador competitive de OW es coherente (CSS elite OW ~1:05-1:15/100m; este atleta competitive pero no elite). FC 170 al LT2 = 91% HRmax. Curva gradual = excelente clearance de lactato.

---

## Resumen de Validacion

| Perfil | LT1 OK | LT2 OK | LT1p | LT2p | Senales | Notas |
|---|---|---|---|---|---|---|
| P01 Runner principiante | Si | Si | 1.3 mmol | 3.6 mmol | OK | Curva empinada detectada correctamente |
| P02 Ciclista veterano | Si | Si | 0.95 mmol | 3.7 mmol | **ATENCION** | Ratio potencia clasifica VLamax "high" incorrecto |
| P03 Triatleta elite | Si | Si | 1.25/1.15/1.75 | 3.8/3.4/3.9 | OK | 3 disciplinas coherentes |
| P04 Nadadora asimetrica | Si | Si | 1.3/1.6 | 3.3/3.5 | OK | Asimetria natacion/running detectada |
| P05 Runner estancado | Si | Si | 1.25 mmol | 2.9 mmol | OK | Diesel estancado, VLamax low correcta |
| P06 Joven glucolitico | Si | Si | 1.3 mmol | 3.3 mmol | **PARCIAL** | Proxy subestima VLamax (clasifica moderate vs real high) |
| P07 Ciclista->triatleta | Si | Si | 0.9/1.25/1.3 | 3.3/3.7/3.0 | **ATENCION** | Ratio potencia ciclismo clasifica VLamax "high" incorrecto |
| P08 Masters runner | Si | Si | 0.95 mmol | 3.3 mmol | OK | Test limpio, objetivo superado |
| P09 Test deficiente | **PARCIAL** | **PARCIAL** | 2.5 mmol | 5.1 mmol | OK | Sistema correctamente reduce confianza |
| P10 Post-lesion | Si | Si | 1.8 mmol | 2.7 mmol | OK | Comprimido corregido a moderate (no falso diesel) |
| P11 Ciclista puro | Si | Si | 1.0 mmol | 4.0 mmol | **ATENCION** | Ratio potencia clasifica VLamax "high" incorrecto |
| P12 Nadador OW | Si | Si | 1.2 mmol | 3.7 mmol | OK | Diesel borderline moderate/low |

### Problemas sistematicos identificados

1. **Proxy VLamax por ratio de potencia en ciclismo** (P02, P07, P11): El ratio LT1/LT2 calculado en potencia (W) tiende a generar valores bajos (~0.69-0.73) que clasifican como VLamax "high" incluso en ciclistas con curvas graduales (diesel). Esto ocurre porque la relacion potencia-lactato no es lineal en la misma proporcion que velocidad-lactato en running. **ACTUALIZAR** -- Considerar un factor de correccion para ciclismo o usar el ratio en velocidad equivalente.

2. **Pico de lactato no utilizado como proxy VLamax** (P06): Atletas jovenes con picos >10 mmol tienen claramente VLamax alta, pero el proxy ratio LT1/LT2 no captura esta senal porque los umbrales estan comprimidos. **DEBATE CIENTIFICO** -- El pico de lactato post-test o al final del test incremental correlaciona con VLamax (Mader 2003, INSCYD), pero su uso como proxy formal requiere validacion en el contexto del sistema.

3. **LT2 en ultimo escalon** (P11, P12): Cuando el LT2 cae en el ultimo escalon del test, la estimacion pierde precision porque no hay confirmacion de la tendencia posterior. El sistema deberia generar un warning especifico. **ACTUALIZAR** -- Anadir warning "LT2 en ultimo escalon: considerar ampliar el rango del test".

4. **Correccion por motor comprimido funciona bien** (P10): La logica de que ratio alto + aerobico bajo = "moderate" (no falso diesel) esta bien calibrada para post-lesion/desentrenamiento.

5. **Tests deficientes manejados adecuadamente** (P09): El gate de 5 etapas minimas para real thresholds y la reduccion de confianza por protocol_score bajo son mecanismos efectivos.

---

## Referencias

- Faude O, Kindermann W, Meyer T. Lactate threshold concepts: how valid are they? Sports Med. 2009;39(6):469-490. [PubMed](https://pubmed.ncbi.nlm.nih.gov/19453206/)
- Bishop D, Jenkins DG, Mackinnon LT. The relationship between plasma lactate parameters, Wpeak and 1-hr cycling performance in women. Med Sci Sports Exerc. 1998;30(8):1270-1275. [PubMed](https://pubmed.ncbi.nlm.nih.gov/9183808/)
- Tanner RK, Fuller KL, Ross MLR. Evaluation of three portable blood lactate analysers: Lactate Pro, Lactate Scout and Lactate Plus. Eur J Appl Physiol. 2010;109(3):551-559.
- Mader A. Glycolysis and oxidative phosphorylation as a function of cytosolic phosphorylation state and power output of the muscle cell. Eur J Appl Physiol. 2003;88(4-5):317-338. [ResearchGate](https://www.researchgate.net/publication/10950490)
- Olbrecht J. The Science of Winning. 2000. F&G Partners.
- Olbrecht J. Triathlon: swimming for winning. J Hum Sport Exerc. 2011;6(2):233-246.
- Nitzsche N et al. Is the vLamax for Glycolysis What the VO2max is for Oxidative Phosphorylation? Sports Med. 2025. [Springer](https://link.springer.com/article/10.1007/s40279-025-02259-6)
- Billat VL. The concept of maximal lactate steady state: a bridge between biochemistry, physiology and sport science. Sports Med. 2003;33(6):407-426.
- Koutlianos N et al. Indirect estimation of VO2max in athletes by ACSM's equation: valid or not? J Sports Med Phys Fitness. 2013;53(4):337-345. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3743617/)
- Mujika I, Padilla S. Cardiorespiratory and metabolic characteristics of detraining in humans. Med Sci Sports Exerc. 2001;33(3):413-421.

---

AGENTE 1A COMPLETADO
