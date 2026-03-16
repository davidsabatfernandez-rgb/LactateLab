# Bateria de Atletas — Auditoria v1.2

42 atletas organizados en 7 categorias. Cada uno tiene un contexto unico
que fuerza al sistema a responder de forma diferente.

---

## A1. Running puro (8 atletas)

### R01 — Maratonista elite varon
- **Nivel:** competitive | **Sexo:** male | **Peso:** 62kg | **Objetivo:** Maraton sub-2:25
- **LT1:** 3.8 mmol @ 3:35/km | **LT2:** 4.2 mmol @ 3:20/km | **HR:** 162/172
- **Particularidad:** Ratio LT1/LT2=0.905 (diesel). VLamax proxy deberia ser LOW.
  Fase pre_comp (8 semanas). CTL ~95.
- **Que estresa:** VLamax proxy en extremo diesel, race factors marathon competitive,
  bloque deberia ser competition_specific o AEP.

### R02 — 10K competitiva mujer
- **Nivel:** competitive | **Sexo:** female | **Peso:** 52kg | **Objetivo:** 10K sub-38
- **LT1:** 2.1 mmol @ 4:15/km | **LT2:** 3.8 mmol @ 3:50/km | **HR:** 155/175
- **Particularidad:** Ratio 0.55 → VLamax HIGH. Fase specific (14 semanas).
  Buena separacion LT1-LT2.
- **Que estresa:** Zona model con gran gap Z3 (LT1→LT2), VLamax high en competitive,
  bloque threshold_development.

### R03 — HM trained con progresion (3 tests)
- **Nivel:** trained | **Sexo:** male | **Peso:** 73kg | **Objetivo:** HM sub-1:30
- **Test 1 (sem -8):** LT2=4.0 @ 4:30/km | **Test 2 (sem -4):** LT2=3.9 @ 4:20/km
  **Test 3 (sem 0):** LT2=3.8 @ 4:12/km
- **Particularidad:** Mejora progresiva LT2. Motor dinamico debe reflejar tendencia.
  Fase specific. block_validation_signal = "improving".
- **Que estresa:** Threshold dinamico multi-sesion, decaimiento temporal, dose step selection.

### R04 — 5K recreacional mujer (curva ruidosa)
- **Nivel:** recreational | **Sexo:** female | **Peso:** 65kg | **Objetivo:** 5K sub-30
- **Test:** 4 puntos: [1.8, 2.1, 5.2, 3.8] mmol @ [6:30, 6:00, 5:30, 5:00]/km
- **Particularidad:** Punto 3 es outlier claro (salto a 5.2, luego baja a 3.8).
  Solo 4 puntos → confidence cap 0.60. ModDmax puede fallar.
- **Que estresa:** Outlier detection, confidence capping, P6 gate, robustez.

### R05 — Ultra-trail varon
- **Nivel:** trained | **Sexo:** male | **Peso:** 70kg | **Objetivo:** Ultra 80K
- **LT1:** 1.4 mmol @ 5:20/km | **LT2:** 2.8 mmol @ 4:40/km | **HR:** 140/158
- **Particularidad:** LT1 muy bajo, LT2 bajo. Durability decay largo (>6h).
  Ratio 0.50 → VLamax HIGH (pero es ultra runner, deberia ser diesel).
  **BUG POTENCIAL:** ratio bajo por lactato absoluto bajo, no por glucolitico alto.
- **Que estresa:** VLamax proxy falla en atletas con lactatos absolutos bajos,
  durability para ultra, prediccion > 50K.

### R06 — Principiante absoluto varon (sin test)
- **Nivel:** recreational | **Sexo:** male | **Peso:** 85kg | **Objetivo:** 10K primera vez
- **Sin test de lactato.** CTL/ATL seed manual: CTL=15, ATL=20.
- **Particularidad:** Sin datos fisiologicos. El sistema debe funcionar solo con seeds
  y dar recomendaciones conservadoras.
- **Que estresa:** Pipeline sin datos de lactato, EWMA seeding, mesociclo por defecto,
  nivel recreational sin confirmacion.

### R07 — Runner con regresion (post-lesion)
- **Nivel:** trained→recreational | **Sexo:** female | **Peso:** 58kg | **Objetivo:** HM
- **Test 1 (sem -16):** LT2=3.5 @ 4:20/km | **Test 2 (sem -8):** LT2=3.3 @ 4:10/km
  **Test 3 (sem 0):** LT2=4.2 @ 4:55/km (post-lesion, peor)
- **Particularidad:** Regresion real. El motor dinamico debe dar mas peso al test reciente
  (peor). block_validation_signal = "degrading". suggest_level deberia bajar.
- **Que estresa:** Regresion temporal, signal degrading, cambio de nivel,
  mesociclo conservador.

### R08 — Runner trained curva plana
- **Nivel:** trained | **Sexo:** male | **Peso:** 68kg | **Objetivo:** 10K
- **Test:** 6 puntos: [1.2, 1.3, 1.5, 1.8, 2.2, 2.8] mmol @ ritmos decrecientes
- **Particularidad:** Lactato nunca sube de 3.0. No hay inflexion clara.
  LT2 por 4.0 mmol no existe. ModDmax busca desviacion en curva casi lineal.
- **Que estresa:** Ausencia de LT2 clasico, todos los metodos deberian dar baja confianza,
  practical anchor 3.1 mmol como unico recurso.

---

## A2. Ciclismo puro (7 atletas)

### C09 — Ciclista FTP alto varon
- **Nivel:** competitive | **Sexo:** male | **Peso:** 72kg | **FTP:** 320W
- **LT1:** 2.0 mmol @ 240W | **LT2:** 3.8 mmol @ 305W | **HR:** 152/170
- **Particularidad:** Potencia medida directa. TSS por potencia (no HR).
  Ratio 0.787 → VLamax moderate.
- **Que estresa:** Power-TSS path, zonas en watts, prediccion TT.

### C10 — Ciclista recreacional mujer (solo HR)
- **Nivel:** recreational | **Sexo:** female | **Peso:** 60kg
- **LT1:** 2.2 mmol @ HR 138 | **LT2:** 4.1 mmol @ HR 162 | Sin potencia
- **Particularidad:** Sin potenciometro. TSS por HR-TRIMP (constante 1.67).
  Zonas solo en HR. VO2max estimado por Swain.
- **Que estresa:** HR-only pipeline, TRIMP femenino, Swain estimation accuracy.

### C11 — MTB varon (lactatos elevados)
- **Nivel:** trained | **Sexo:** male | **Peso:** 78kg | **Objetivo:** Marathon MTB
- **Test:** [2.5, 3.0, 3.8, 5.2, 7.1, 9.8] mmol @ [150, 180, 210, 240, 270, 300]W
- **Particularidad:** Lactatos altos en toda la curva. Baseline > 2.0.
  Curva empinada. VLamax deberia ser HIGH.
- **Que estresa:** Baseline elevado (no arruinado, < 3.0 pero cerca), steepness alta,
  VLamax sigmoid extremo.

### C12 — CRI/contrarreloj mujer
- **Nivel:** competitive | **Sexo:** female | **Peso:** 58kg | **FTP:** 270W
- **LT1:** 1.8 mmol @ 210W | **LT2:** 3.5 mmol @ 260W | **HR:** 155/173
- **Particularidad:** Objetivo TT (20-40km). Fase pre_comp (10 semanas).
  competition_specific_block candidato.
- **Que estresa:** Race factor TT, bloque pre_comp, ANP vs competition_specific.

### C13 — Ciclista con estancamiento (4 tests)
- **Nivel:** trained | **Sexo:** male | **Peso:** 74kg | **Objetivo:** Gran Fondo
- **Test 1-4 (cada 3 sem):** LT2 = 3.9, 3.8, 4.0, 3.9 mmol @ 250, 248, 252, 250W
- **Particularidad:** LT2 no cambia en 12 semanas (<5% variacion).
  block_validation = "stable". Motor debe detectar estancamiento.
  I3 gate deberia considerar ANC como "spark plug".
- **Que estresa:** Deteccion de plateau, I3 gate, ANC en contexto estancado.

### C14 — Sprinter pista mujer
- **Nivel:** competitive | **Sexo:** female | **Peso:** 68kg | **Objetivo:** Keirin/Sprint
- **Test:** [2.8, 4.5, 7.2, 11.0, 14.5] mmol @ [200, 300, 400, 500, 600]W
- **Particularidad:** VLamax altisima. Ratio LT1/LT2 << 0.70.
  Lactatos extremos (>14 mmol). Evento ultra-corto.
  El motor de umbrales deberia funcionar pero con confidence baja.
  **Edge:** baseline 2.8 < 3.0 (pasa B1 gate pero al limite).
- **Que estresa:** Extremo glucolitico, lactatos > 10 mmol, ANP block selection,
  filtro de extremos absolutos (max 7.0 o p90*1.3).

### C15 — Ciclista base_early recreacional
- **Nivel:** recreational | **Sexo:** male | **Peso:** 82kg | **Objetivo:** Cicloturista 160km
- **Test:** 5 puntos @ potencias bajas. LT2 ~ 180W.
- **Particularidad:** 30+ semanas al objetivo. Fase base_early.
  Bloque obligatorio = AEC (siempre en base_early).
  CTL = 25. Primer mesociclo.
- **Que estresa:** base_early siempre AEC, mesociclo largo (5+ semanas),
  dose ladder peldano minimo.

---

## A3. Natacion pura (5 atletas)

### S16 — Nadador CSS alto varon
- **Nivel:** competitive | **Sexo:** male | **Peso:** 80kg | **Objetivo:** 1500m OW
- **Test:** 8 puntos, curva limpia. CSS = 1:18/100m. LT2 = 3.6 @ 1:22/100m.
- **Que estresa:** Pipeline natacion completo, sTSS cubico, zonas en /100m.

### S17 — Nadadora aguas abiertas mujer
- **Nivel:** trained | **Sexo:** female | **Peso:** 62kg | **Objetivo:** OW 10K
- **Test:** 6 puntos. LT2 = 3.2 @ 1:38/100m. Fase specific.
- **Que estresa:** Evento OW largo, durability en natacion, bloque competition_specific.

### S18 — Nadador master recreacional
- **Nivel:** recreational | **Sexo:** male | **Peso:** 88kg | **Objetivo:** 1.5K triathlon swim
- **Test:** 4 puntos ruidosos. Curva irregular.
- **Que estresa:** Pocos puntos natacion, confidence baja, mesociclo conservador.

### S19 — Nadadora sprint 200m
- **Nivel:** competitive | **Sexo:** female | **Peso:** 65kg | **Objetivo:** 200m libre
- **Test:** VLamax alta, curva empinada. Evento ultra-corto.
- **Que estresa:** ANP en natacion, VLamax extrema, factor anaerobico > 6%.

### S20 — Nadador sin test reciente
- **Nivel:** trained | **Sexo:** male | **Peso:** 76kg | **Objetivo:** 800m libre
- **Ultimo test:** 65 dias atras. Datos stale.
- **Que estresa:** Stale data warning (P21a), testing_decision_block, confianza reducida.

---

## A4. Triatletas (10 atletas)

### T21 — Ironman trained varon (3 disciplinas testeadas)
- **Nivel:** trained | **Sexo:** male | **Peso:** 75kg | **Objetivo:** IM sub-10h
- **Run LT2:** 3.6 @ 4:30/km | **Bike LT2:** 3.4 @ 250W | **Swim LT2:** 3.0 @ 1:40/100m
- **Particularidad:** Tests en las 3 disciplinas. Coherencia cross-discipline.
  Ratio run 0.83, bike 0.80 → VLamax moderate en ambas. Fase specific (16 sem).
- **Que estresa:** Pipeline multi-disciplina, coherencia VLamax entre disciplinas,
  race factor Ironman, durability >9h.

### T22 — Ironman recreacional mujer (sin test swim)
- **Nivel:** recreational | **Sexo:** female | **Peso:** 68kg | **Objetivo:** IM finish
- **Run LT2:** 4.5 @ 5:40/km | **Bike LT2:** 4.0 @ 160W | Sin test natacion.
- **Particularidad:** Falta test de natacion. El sistema debe funcionar parcialmente.
  CTL bajo (~30). Fase base_late.
- **Que estresa:** Disciplina sin datos, pipeline parcial, prediccion IM con datos
  incompletos, EWMA bajo.

### T23 — Half-Ironman competitive varon (tests recientes en 3)
- **Nivel:** competitive | **Sexo:** male | **Peso:** 70kg | **Objetivo:** 70.3 sub-4:15
- **Tests:** Todos <14 dias. Datos frescos.
- **Particularidad:** Todos los datos frescos y completos. Fase pre_comp (10 sem).
  El "caso ideal" — si aqui falla, hay bug grave.
- **Que estresa:** Pipeline completo sin excusas, prediccion 70.3, race factors multi-seg.

### T24 — Sprint triathlon competitive mujer
- **Nivel:** competitive | **Sexo:** female | **Peso:** 56kg | **Objetivo:** Sprint tri <1:10
- **Particularidad:** VLamax alta, evento corto. ANP candidato.
  Pero el sprint tri no es puro ANP — tiene componente aerobico significativo.
- **Que estresa:** ANP vs AEP decision en sprint tri, VLamax alta en competitive,
  contribucion anaerobica >6%.

### T25 — Olimpico trained varon (2 tests running, 1 bike)
- **Nivel:** trained | **Sexo:** male | **Peso:** 72kg | **Objetivo:** Olimpico sub-2:15
- **Run Test 1 (sem -6):** LT2=3.8 @ 4:15/km | **Run Test 2 (sem 0):** LT2=3.6 @ 4:08/km
  **Bike Test 1 (sem -3):** LT2=3.5 @ 240W
- **Particularidad:** Progresion running, solo 1 test bike. Motor dinamico running vs
  single-test bike.
- **Que estresa:** Asimetria datos entre disciplinas, motor dinamico con N diferente.

### T26 — Triatleta con disciplina debil mujer
- **Nivel (run):** competitive | **Nivel (swim):** recreational
- **Sexo:** female | **Peso:** 55kg | **Objetivo:** Olimpico
- **Run LT2:** 3.2 @ 3:55/km (excelente) | **Swim LT2:** 4.5 @ 2:10/100m (pobre)
- **Particularidad:** Nivel diferente por disciplina. suggest_level deberia dar
  competitive en running pero recreational en natacion. Gap inter-disciplina.
- **Que estresa:** Nivel multi-disciplina, suggest_level por disciplina,
  bloque que priorice la debilidad.

### T27 — Triatleta base_early recreacional
- **Nivel:** recreational | **Sexo:** male | **Peso:** 90kg | **Objetivo:** IM (primer IM)
- **Tests:** 1 por disciplina, todos basicos. 30+ semanas.
- **Particularidad:** Todo bajo, todo lejos. Primer IM. base_early → AEC obligatorio.
  CTL seed manual (20). Peso alto.
- **Que estresa:** base_early, AEC forzado, seed manual, objetivo ambicioso con
  perfil bajo, peso en prediccion running.

### T28 — Triatleta con lesion (running pausado)
- **Nivel:** trained | **Sexo:** female | **Peso:** 60kg | **Objetivo:** 70.3
- **Bike y Swim activos, Running suspendido** por fascitis plantar.
- **Run test:** 90 dias atras (stale). Bike/Swim tests: 10 dias.
- **Particularidad:** Running stale → P21a warning. Mesociclo solo bike/swim.
  El sistema no debe prescribir running sessions.
- **Que estresa:** Disciplina suspendida, stale data selectivo, mesociclo 2-disciplina.

### T29 — Triatleta con mejora explosiva (VLamax alta natural)
- **Nivel:** trained | **Sexo:** male | **Peso:** 78kg | **Objetivo:** Sprint tri
- **Run:** Ratio 0.65 → VLamax high | **Bike:** Ratio 0.70 → VLamax high
- **Particularidad:** Atleta naturalmente glucolitico que quiere hacer sprint tri.
  El motor no deberia recomendar ANC (ya tiene VLamax alta).
  Deberia ir a AEC/THR para construir base aerobica.
- **Que estresa:** VLamax alta + evento corto → NO ANC, sino AEC.
  El gate de ANC deberia bloquearlo (VLamax no es low).

### T30 — Triatleta experimentado con 6 tests (longitudinal)
- **Nivel:** competitive | **Sexo:** male | **Peso:** 67kg | **Objetivo:** Olimpico sub-2:00
- **6 tests running en 6 meses:** progresion escalonada con meseta intermedia.
- **Particularidad:** Timeline completo. Motor dinamico con 6 puntos.
  Detectar meseta, luego mejora. block_validation cambiante.
- **Que estresa:** Motor dinamico a largo plazo, meseta + reanudacion, temporal decay
  con muchos tests.

---

## A5. Edge cases y stress tests (7 atletas)

### E31 — Test con 3 puntos (minimo absoluto)
- **Test:** [1.0, 2.5, 6.0] mmol @ [6:00, 5:00, 4:00]/km
- **Que estresa:** Confidence cap 0.45, metodos con <4 puntos, ModDmax imposible,
  sustained_increase imposible. Solo baseline_rise podria funcionar.
  El sistema NO debe crashear.

### E32 — Test con outlier brutal
- **Test:** [1.2, 1.8, 12.0, 3.2, 4.5, 6.0] mmol @ ritmos decrecientes
- **Que estresa:** Punto 3 a 12.0 mmol entre 1.8 y 3.2. Filtro extremos absolutos
  (max 7.0 o p90*1.3). LOO debe penalizarlo. LT1/LT2 no deben anclarse a el.

### E33 — Test con lactato descendente (curva inversa)
- **Test:** [5.0, 4.2, 3.5, 2.8, 2.2, 1.8] mmol (desciende con intensidad)
- **Que estresa:** Patologia o error de medicion. Monotonicity ~0.
  Todos los gates de REAL deberian bloquearse. Confidence minima.
  El sistema debe degradar gracefully, no crashear.

### E34 — Dos tests el mismo dia
- **Test AM:** 6 puntos, curva limpia. LT2 = 3.5 @ 4:20/km
- **Test PM:** 6 puntos, curva desplazada (fatiga). LT2 = 4.0 @ 4:30/km
- **Que estresa:** Motor dinamico con 2 tests mismo dia. Recency identica.
  No deberia promediar ciegamente — el test PM tiene baseline elevado por fatiga.

### E35 — Test sin FC (solo lactato + ritmo)
- **Test:** 7 puntos con lactato y pace, HR = None en todos.
- **Que estresa:** Pipeline sin HR. No puede estimar VO2max por Swain.
  Zonas solo en pace. TRIMP imposible → TSS solo por pace (rTSS).

### E36 — Test con baseline arruinado (>3.0)
- **Test:** [3.5, 4.0, 4.8, 6.2, 8.5] mmol
- **Que estresa:** B1 gate debe activarse (baseline > 3.0). Test invalidado.
  El sistema no debe producir umbrales de este test.

### E37 — Atleta con objetivo inalcanzable
- **Nivel:** recreational | **Sexo:** male | **Peso:** 92kg
- **LT2:** 4.8 @ 6:00/km | **Objetivo:** Maraton sub-3:00 (4:16/km)
- **Particularidad:** Su LT2 pace es 6:00/km. Maraton sub-3:00 requiere ~4:16/km.
  Race factor marathon recreational = 0.79. Pace predicho = 6:00/0.79 = ~7:36/km.
  El sistema deberia mostrar que el objetivo es **completamente inalcanzable**.
- **Que estresa:** Prediccion realista vs objetivo ambicioso, gap enorme entre
  prediccion y target, UI deberia comunicar esto claramente.

---

## A6. Progresion temporal (3 atletas con timeline)

### P38 — Runner 6 meses (4 tests, mejora-meseta-mejora)
- **Test 1 (sem 0):** LT2=4.2 @ 4:40/km → **Test 2 (sem +8):** LT2=3.8 @ 4:25/km
  **Test 3 (sem +16):** LT2=3.9 @ 4:22/km (meseta) → **Test 4 (sem +24):** LT2=3.5 @ 4:08/km
- **Que estresa:** Motor dinamico 4 tests, deteccion de meseta (test 2→3),
  reanudacion de mejora (test 3→4), temporal decay del test 1.

### P39 — Ciclista 4 meses (3 tests, bloque AEC→THR)
- **Test 1 (sem 0):** LT2=3.8 @ 220W → Bloque AEC → **Test 2 (sem +6):** LT2=3.6 @ 230W (LT1 mejora)
  → Bloque THR → **Test 3 (sem +12):** LT2=3.4 @ 245W (LT2 mejora)
- **Que estresa:** Bloque AEC mejora LT1 → siguiente bloque THR es logico.
  Bloque THR mejora LT2 → validacion del block_validation_signal.
  Secuencia fisiologica coherente (capacidad antes de potencia).

### P40 — Triatleta 3 meses (tests cruzados bike+run)
- **Run Test 1 (sem 0)** → **Bike Test 1 (sem +2)** → **Run Test 2 (sem +8)**
- **Que estresa:** Coherencia cross-discipline. El test de bike no deberia
  afectar las metricas de running. El motor dinamico de running debe usar
  solo los tests de running.

---

## A7. Perfiles que NO cumplen su objetivo (5 atletas)

### F41 — Triatleta recreational que quiere IM sub-9h
- **Nivel:** recreational | LT2 run = 5:30/km, LT2 bike = 180W, CTL = 25
- **Objetivo:** IM sub-9h (requiere LT2 run ~4:20, bike ~250W, CTL >80)
- **Que estresa:** Gap enorme entre estado actual y objetivo.
  El sistema debe comunicar que es inalcanzable en el timeframe.

### F42 — Runner trained que quiere sub-3 maraton pero VLamax alta
- **Nivel:** trained | LT2 = 3.5 @ 4:00/km | Ratio 0.68 → VLamax HIGH
- **Objetivo:** Maraton sub-3:00
- **Particularidad:** Tiene velocidad para 10K-HM pero su VLamax alta
  hace que la prediccion de maraton sea mucho peor. Glycogen risk HIGH.
  El sistema debe advertir del riesgo de "hitting the wall".
- **Que estresa:** VLamax impact en maraton, glycogen risk warning,
  asimetria optimistic/pessimistic (0.30/0.70).

---

## Resumen de cobertura

| Dimension | Atletas que la cubren |
|-----------|----------------------|
| 3 disciplinas puras | R01-R08, C09-C15, S16-S20 |
| Triatletas multi-disciplina | T21-T30 |
| 3 niveles (rec/trained/comp) | Cada categoria tiene los 3 |
| 5 fases temporada | base_early(C15,T27), base_late(T22), specific(R02,T21), pre_comp(R01,C12,T23), taper(implicito) |
| Progresion (mejora) | R03, P38, P39 |
| Regresion (empeora) | R07 |
| Estancamiento (plateau) | C13, P38(meseta) |
| Curva ruidosa / outliers | R04, E32, S18 |
| Pocos datos (<5 puntos) | R04, E31, S18 |
| Sin datos lactato | R06 |
| Datos stale (>56d) | S20, T28 |
| Sin HR | E35 |
| Baseline arruinado | E36 |
| Curva plana | R08 |
| Curva inversa | E33 |
| VLamax extrema (alta) | C14, S19, R02, T29 |
| VLamax extrema (baja/diesel) | R01, R05 |
| Objetivo inalcanzable | E37, F41, F42 |
| Cross-discipline coherencia | T21, T26, P40 |
| Multi-test dinamico | R03, C13, T30, P38, P39 |
| CTL/ATL seed manual | R06, T27 |
| 2 tests mismo dia | E34 |
| Disciplina suspendida | T28 |
| Glycogen risk | F42, T21(IM), R01(marathon) |
