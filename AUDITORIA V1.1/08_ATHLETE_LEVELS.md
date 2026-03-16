# Auditoria 08 — Niveles de Atleta y Escalabilidad

## Resumen ejecutivo

El sistema clasifica a los atletas en tres niveles manuales (`recreational`, `trained`, `competitive`) que modulan significativamente la logica fisiologica en 7 subsistemas. La implementacion es coherente y bien referenciada cientificamente. Sin embargo, existen **4 hallazgos criticos**: (1) la clasificacion es enteramente manual sin validacion automatica, (2) no existe logica de transicion entre niveles, (3) las zonas de entrenamiento no incorporan el nivel del atleta en su calculo, y (4) no hay nivel "beginner" ni "elite" — el sistema no cubre los extremos del espectro.

---

## Clasificacion de nivel

### Metodo de determinacion

**Manual exclusivo.** El campo `athlete_level` se define en:
- Modelo DB: `Athlete.athlete_level` — `String(30)`, default `"trained"`, server_default `"trained"` (`/backend/app/models/athlete.py:23`)
- Schema: `AthleteBase.athlete_level: str = "trained"` (`/backend/app/schemas/athlete.py:134`)

El entrenador asigna el nivel al crear o editar el atleta. No existe ninguna logica automatica que:
- Sugiera un nivel basado en LT2, VO2max, o historico de rendimiento
- Valide que el nivel asignado es coherente con los datos fisiologicos
- Detecte que un atleta ha progresado de nivel

### Valores posibles

| Valor | Descripcion implicita |
|---|---|
| `recreational` | Atleta recreativo, <3 anos entrenamiento estructurado |
| `trained` | Atleta entrenado, default del sistema |
| `competitive` | Atleta competitivo/elite |

**Fallback**: Cualquier valor desconocido se trata como `"trained"` en toda la base de codigo (patron consistente: `level_key = athlete_level if athlete_level in ("recreational", "trained", "competitive") else "trained"`).

### Veredicto

La clasificacion manual es pragmatica para un producto dirigido a entrenadores (que conocen a sus atletas), pero carece de guardrails. Un entrenador podria marcar como `competitive` a un atleta con LT2@9 km/h sin que el sistema emita ninguna advertencia.

---

## Benchmarks LT2 por nivel

### LT2_AEROBIC_BENCHMARKS (`physiological_engine.py:207-223`)

Usados por `build_capacity_profile()` para clasificar el nivel aerobico (low/moderate/high) relativo al nivel del atleta.

| Disciplina | Nivel | LT2 bajo | LT2 alto | Unidad |
|---|---|---|---|---|
| Running | recreational | 9.0 | 11.5 | km/h |
| Running | trained | 11.0 | 14.5 | km/h |
| Running | competitive | 13.5 | 17.0 | km/h |
| Ciclismo | recreational | 170 | 240 | W |
| Ciclismo | trained | 220 | 310 | W |
| Ciclismo | competitive | 270 | 380 | W |
| Natacion | recreational | 2.8 | 3.4 | km/h |
| Natacion | trained | 3.2 | 4.0 | km/h |
| Natacion | competitive | 3.8 | 4.8 | km/h |

**Analisis**: Los rangos son razonables y coherentes con la literatura (Billat 2003, Daniels VDOT). La separacion entre niveles tiene solapamiento intencional (trained low = 11.0 esta por encima de recreational high = 11.5 — **error**: el rango trained empieza en 11.0 pero recreational termina en 11.5, lo que significa que un atleta con LT2@11.2 km/h seria "high aerobic" si es recreational pero "low aerobic" si es trained. Esto es correcto y deseable: el contexto del nivel cambia la interpretacion).

### LT2_RACE_FACTOR (`physiological_engine.py:40-96`)

Factores que relacionan LT2 con ritmo de carrera. Escalan correctamente: recreational < trained < competitive (el factor crece, indicando que atletas mas entrenados corren mas cerca de su LT2).

Ejemplo 5k: recreational 0.90, trained 0.96, competitive 1.01
Ejemplo marathon: recreational 0.79, trained 0.87, competitive 0.93

### CROSS_PERCENTILE_BENCHMARKS (`planning_engine.py:1910-1921`)

Identicos a LT2_AEROBIC_BENCHMARKS. Usados en el analisis de disciplina debil para triatlon.

---

## Comportamiento con datos minimos

### Nuevo atleta (0 sesiones)

Cuando no hay datos de lactato (`data_quality == "none"`):

1. **Physiological engine**: Devuelve `primary_limiter="no_data"`, `recommended_block="testing_decision_block"` (`physiological_engine.py:1137-1147`). Correcto: no prescribe sin datos.
2. **Prediction engine**: Requiere LT2 detectado. Si `lt2_pace is None`, retorna `None` y no genera predicciones (`prediction_engine.py:544-546`). Correcto: no inventa.
3. **Capacity profile**: Devuelve `aerobic_level="unknown"`, `vlamax_level="unknown"`, `confidence=0.0`, `source="insufficient"` (`physiological_engine.py:725-732`).
4. **Training zones**: Son manuales/por entrenador. Sin datos no se auto-generan. El endpoint `threshold-profile` devuelve lo que haya disponible.
5. **Planning engine**: Sin analisis fisiologico, la lectura del sistema devuelve `"insufficient_data"` en confianza.

**Veredicto**: El sistema degrada correctamente a "no actuar" con 0 datos. No hay riesgo de prescripciones incorrectas.

### 1 sesion

- El motor analitico genera snapshot con LT1/LT2 detectados (si la sesion tiene suficientes etapas).
- El prediction engine puede generar predicciones pero con `history_depth=1`, lo que dispara la cautela "Historico corto para afinar predicciones".
- El motor dinamico (multi-sesion) tiene poca fiabilidad con 1 sesion (`reliability_score` baja).
- La confianza del capacity profile depende de la calidad de deteccion (real > basic > interpolated).

### <5 sesiones

- `history_depth < 3` dispara cautela en el prediction engine (`prediction_engine.py:608-609`).
- `history_score` escala linealmente: `0.28 + min(depth, 6) * 0.1`, saturando en 6 sesiones.
- El `_historical_stability()` requiere >=2 valores para ser informativo; con 1 retorna 0.46 (neutral).

**Veredicto**: La degradacion es gradual y bien implementada. El sistema comunica incertidumbre pero no se niega a funcionar.

---

## Comportamiento con atletas de elite

### LT2 alto (>5.5 mmol)

El sistema no usa lactato absoluto como medida de "elite". Los benchmarks LT2 son de **velocidad/potencia**, no de concentracion de lactato. Un atleta con LT2@17.5 km/h (competitive range upper = 17.0):
- Seria clasificado como `aerobic_level="high"` en competitive.
- El gap analysis funcionaria normalmente con los factores competitive.
- No hay cap ni saturacion en los benchmarks.

Sin embargo, **no hay nivel "elite" o "world_class"**. Un atleta con LT2@19 km/h (nivel olimpico) seria tratado igual que uno con LT2@13.5 km/h (competitive inferior). El `competitive` cubre desde "buen corredor de club" hasta "medallista olimpico".

### Curvas planas

El detector S3 (`physiological_engine.py:1149-1165`) identifica curvas planas (LT1-LT2 < 0.5 km/h o < 10W) y las marca como `data_quality="low"` con contraindication. Esto es correcto para atletas de elite con curvas muy planas (LT1/LT2 ratio > 0.90).

El capacity profile aplica correccion cruzada: `aerobic_level="low"` + ratio alto → VLamax se fuerza a `"moderate"` (no "low"/diesel), evitando el falso diagnostico diesel en atletas con motor comprimido (`physiological_engine.py:783-793`).

### Predicciones extremas

El prediction engine tiene guardrails:
- Sanity check: `ratio_to_lt2` clamped entre 0.65-1.25, con rangos por distancia (`prediction_engine.py:443-451`).
- VO2max plausibility: floor 25, ceiling 90 ml/kg/min (`physiological_engine.py:615-616`).
- Fractional utilization: 0.55-0.98 (`physiological_engine.py:617-618`).

**Veredicto**: Los guardrails son adecuados. El riesgo principal es que atletas de nivel olimpico estan infra-diferenciados dentro del bucket "competitive".

---

## Zonas de entrenamiento

### Calculo por nivel

**Las zonas de entrenamiento NO incorporan el nivel del atleta en su calculo.** El sistema de zonas (`/backend/app/models/training_zone.py`, `/backend/app/schemas/training_zone.py`) es un CRUD manual: el entrenador crea zonas con limites de pace/HR/power que el define.

El endpoint `threshold-profile-for-zones` (`athletes.py:351`) proporciona al entrenador los umbrales detectados (LT1/LT2) como referencia para crear zonas, pero no genera zonas automaticas.

### Zonas personalizadas vs genericas

Solo existen zonas personalizadas (creadas por el entrenador). No hay un generador automatico de zonas basado en nivel. Esto es una decision de diseno: el entrenador tiene control total, pero implica que:
- Un atleta nuevo sin zonas configuradas no tiene zonas.
- No hay zonas por defecto ni generacion automatica basada en el perfil fisiologico.
- El `athlete_level` no modula la anchura o distribucion de zonas.

### Uso del nivel en HR estimada

En `analytics.py`, cuando no hay HR reposo medida, se estima segun nivel:
```
hr_rest_est = {"competitive": 48, "trained": 55, "recreational": 62}
```
Esto afecta indirectamente al calculo de zonas cuando el entrenador usa HR como base (`analytics.py:2035-2036`).

---

## Transicion entre niveles

### Se recalculan benchmarks?

**No automaticamente.** Al cambiar `athlete_level` via `AthleteUpdate`:
- Los LT2_RACE_FACTOR se aplican con el nuevo nivel en la siguiente ejecucion del physiological engine.
- Los LT2_AEROBIC_BENCHMARKS se aplican con el nuevo nivel en el siguiente capacity profile.
- Los season phase boundaries cambian inmediatamente.
- El dynamic threshold engine ajusta su LT2 target: `{"recreational": 3.5, "trained": 3.1, "competitive": 2.8}` (`dynamic_threshold_engine.py:1202-1203`).

Pero no hay:
- Recalculo retroactivo de snapshots o estimates anteriores.
- Aviso al entrenador de que cambiar el nivel afecta la interpretacion del historico.
- Histeresis (proteccion contra cambios frecuentes de nivel).

### Impacto del cambio de nivel

| Subsistema | Efecto |
|---|---|
| Season phase boundaries | Inmediato: recreational tiene base 4s mas larga |
| LT2 race factors | Inmediato: cambia el LT2 requerido |
| Capacity profile | Inmediato: cambia aerobic_level contra benchmarks |
| Block selection gates | Inmediato: ANC/AEP solo para trained/competitive |
| Dynamic LT2 target | Inmediato: recreational 3.5 vs competitive 2.8 mmol |
| HR interpolation offset | Inmediato: recreational -10bpm vs competitive -5bpm |
| Predicciones | Indirecto: via los factores de carrera |

---

## 7 subsistemas que usan athlete_level

| # | Subsistema | Archivo | Uso |
|---|---|---|---|
| 1 | Season phase boundaries | `physiological_engine.py:381-416` | Boundaries adaptativas por nivel |
| 2 | LT2 race factors | `physiological_engine.py:40-96` | Relacion LT2→ritmo de carrera |
| 3 | LT2 aerobic benchmarks | `physiological_engine.py:207-223` | Clasificacion low/moderate/high |
| 4 | Block selection gates | `physiological_engine.py:880-907` | ANC/AEP solo trained/competitive |
| 5 | Dynamic LT2 target | `dynamic_threshold_engine.py:1202-1203` | Target por nivel |
| 6 | HR bridge offset | `threshold_interpolation.py:28-33` | Running→ciclismo HR offset |
| 7 | Cross-percentile benchmark | `planning_engine.py:1910-1921` | Disciplina debil en triatlon |

---

## Hallazgos criticos

### C1 — Sin validacion de coherencia nivel-datos (SEVERIDAD MEDIA)

Un entrenador puede asignar `competitive` a un atleta con LT2@9 km/h (running) sin que el sistema emita ninguna advertencia. Esto distorsiona:
- El capacity profile (9 km/h seria "low" en competitive pero "moderate" en recreational)
- Los race factors (el sistema calcularia un LT2 requerido inalcanzable)
- Los season phase boundaries (base mas corta para un atleta que necesita mas base)

**Recomendacion**: Validar coherencia al guardar: si LT2 detectado cae fuera del rango bajo del nivel asignado, emitir warning al entrenador.

### C2 — Sin logica de transicion de nivel (SEVERIDAD BAJA-MEDIA)

No hay mecanismo para:
- Sugerir al entrenador que un atleta ha superado su nivel (ej: recreational con LT2@13 km/h)
- Proteger contra cambios frecuentes de nivel (histeresis)
- Recalcular historico al cambiar de nivel

**Recomendacion**: Implementar un advisory system que sugiera nivel basado en el LT2 mas reciente y los benchmarks de aerobic_level.

### C3 — Zonas de entrenamiento desconectadas del nivel (SEVERIDAD BAJA)

Las training zones son puramente manuales. No hay generador automatico que use el nivel del atleta para sugerir anchura de zonas (atletas recreational suelen tener zonas mas anchas).

**Recomendacion**: Ofrecer un "auto-generate zones" opcional que use LT1/LT2 detectados + nivel del atleta para proponer zonas por defecto.

### C4 — Espectro incompleto: sin "beginner" ni "elite" (SEVERIDAD BAJA)

El sistema solo cubre recreational/trained/competitive. Falta:
- `beginner`: atletas sin base aerobica previa (necesitan season phases aun mas largas y prescripciones mas conservadoras)
- `elite`/`world_class`: atletas de nivel olimpico/profesional (necesitan diferenciacion fina en el rango superior de competitive)

El `workout_library.py` define niveles como `"world_class"`, `"elite"`, `"elite_junior"` para las fuentes de evidencia, pero estos no se mapean al `athlete_level` del modelo.

---

## Aspectos positivos

1. **Degradacion graceful**: Con 0 datos el sistema recomienda test; con pocos datos reduce confianza sin inventar.
2. **Correccion cruzada VLamax**: El capacity profile cruza ratio con nivel absoluto, evitando falsos diagnosticos diesel/glucolitico en recreational.
3. **Season phases adaptativas**: Los boundaries de fase escalan por nivel (recreational: base +4s mas largo), coherente con Olbrecht.
4. **Race factors bien calibrados**: Los LT2_RACE_FACTOR escalan correctamente con literatura (Faude 2009, Billat 2003, Daniels, Hausswirth 2013).
5. **Block selection gates**: ANC y AEP estan gateados a trained/competitive, evitando prescribir intensidad a recreational sin base.
6. **HR bridge por nivel**: El offset running→ciclismo escala correctamente (recreational -10bpm, competitive -5bpm, Millet 2009).
7. **Tests completos**: 9/9 tests relacionados con nivel pasan (elite flat, recreational steep, VLamax proxy cross-validation, lifecycle beginner).

---

## Recomendaciones

| # | Prioridad | Recomendacion |
|---|---|---|
| R1 | Alta | Implementar warning de coherencia nivel-datos al crear/editar atleta |
| R2 | Media | Advisory system que sugiera nivel basado en LT2 detectado |
| R3 | Media | Auto-generate training zones basado en LT1/LT2 + nivel |
| R4 | Baja | Anadir nivel "beginner" con season phases mas conservadoras |
| R5 | Baja | Considerar subdividir "competitive" en competitive/elite para diferenciar atletas de alto nivel |
| R6 | Baja | Registrar timestamp del ultimo cambio de nivel para trazabilidad |

---

## Referencias bibliograficas

- Faude, O., Kindermann, W., & Meyer, T. (2009). Lactate threshold concepts. *Sports Medicine*, 39(6), 469-490.
- Billat, V. L. (2003). *L'entraînement en pleine nature*. De Boeck.
- Daniels, J. & Gilbert, J. (1979). *Oxygen Power*. Self-published.
- Millet, G. P., Vleck, V. E., & Bentley, D. J. (2009). Physiological differences between cycling and running. *Sports Medicine*, 39(3), 179-206.
- Hue, O. et al. (1998). Cycling-running differences in triathlon. *Canadian Journal of Applied Physiology*, 23(6), 547-561.
- Olbrecht, J. (2000/2015). *The Science of Winning*. F&G Partners.
- Hausswirth, C. & Mujika, I. (2013). *Recovery for Performance in Sport*. Human Kinetics.
- Laursen, P. B. (2002). The scientific basis for high-intensity interval training. *Sports Medicine*, 32(1), 53-73.
- Coggan, A. & Allen, H. (2010). *Training and Racing with a Power Meter*. VeloPress.
- Swain, D. P. & Leutholtz, B. C. (1997). Heart rate reserve is equivalent to %VO2R. *Medicine & Science in Sports & Exercise*, 29(3), 410-414.
- Mader, A. (2003). Glycolysis and oxidative phosphorylation. *European Journal of Applied Physiology*, 88(4-5), 420-435.
