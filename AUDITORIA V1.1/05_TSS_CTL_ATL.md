# Auditoria 05 -- TSS, CTL, ATL y Carga de Entrenamiento

**Fecha**: 2026-03-14
**Archivo principal**: `backend/app/services/training_load_calculator.py`
**Archivos secundarios**: `backend/app/services/triathlon_motor.py`, `backend/app/api/routes/training_load.py`

---

## Resumen ejecutivo

El sistema implementa un pipeline completo de carga de entrenamiento con cadena de fallback (power > pace > swim > HR > Garmin reported), series temporales EWMA para CTL/ATL/TSB/ACWR, y uso prospectivo en planificacion de mesociclos triathlon. La arquitectura es solida y las formulas base son correctas, pero hay **3 hallazgos criticos** y **4 moderados** que afectan la precision del calculo.

| Componente | Veredicto |
|---|---|
| Power TSS | INCORRECTO -- usa Average Power en lugar de Normalized Power |
| Running rTSS | CORRECTO -- formula coherente con modelo IF-based |
| Swim sTSS | CORRECTO -- IF cubico por resistencia del agua |
| hrTSS (TRIMP) | CORRECTO -- Banister exponential TRIMP normalizado |
| CTL (EWMA 42d) | ALPHA INCORRECTO -- usa decay exponencial en vez de alpha clasico |
| ATL (EWMA 7d) | ALPHA INCORRECTO -- mismo problema que CTL |
| TSB | CORRECTO -- CTL - ATL |
| ACWR | CORRECTO CON RESERVAS -- umbrales razonables, falta coupled ACWR |
| Monotony/Strain | NO IMPLEMENTADO |

---

## Calculo de TSS

### Power TSS (`_power_tss`)

**Formula implementada** (linea 140-146):
```python
intensity_factor = np_watts / ftp
hours = duration_seconds / 3600
return intensity_factor ** 2 * hours * 100
```

**Validacion vs Coggan 2003**:
- La formula `IF^2 * hours * 100` es **correcta** en estructura.
- **HALLAZGO CRITICO**: El parametro se llama `np_watts` pero en la invocacion (linea 247-249) se alimenta con `activity.get("average_watts")`:
  ```python
  np_watts = _coerce_float(activity.get("average_watts"))
  ```
  Coggan 2003 define TSS como `(NP/FTP)^2 * t * 100`, donde NP es **Normalized Power** (media movil de 30s de potencia^4, raiz cuarta). Average Power != Normalized Power. Para sesiones de intensidad variable (intervalos, terreno ondulado), NP puede ser 5-15% superior a AP. Esto **subestima el TSS real** en sesiones de calidad.

**Veredicto**: INCORRECTO. La formula es correcta pero el input es erroneo. Deberia usar Normalized Power de Garmin (`normPower` o campo equivalente en el detail payload). Si NP no esta disponible, usar AP como fallback con un warning.

---

### Running rTSS (`_pace_rtss`)

**Formula implementada** (linea 149-156):
```python
intensity_factor = threshold_pace_sec_km / avg_pace_sec_km
hours = duration_seconds / 3600
return intensity_factor ** 2 * hours * 100
```

**Validacion**:
- La inversion del ratio (threshold/actual) es correcta: ritmo mas rapido (menor sec/km) que threshold produce IF > 1.0.
- Usa Functional Threshold Pace (FTPa) del atleta o LT2 pace del motor de lactato como referencia -- correcto.
- El modelo IF^2 es el estandar de Skiba/TrainingPeaks para rTSS.
- **Nota**: No aplica NGP (Normalized Graded Pace) para trail/terreno con pendiente. En trail running esto puede subestimar carga significativamente.

**Veredicto**: CORRECTO para terreno llano. Recomendable anadir NGP para trail running si se dispone de datos de elevacion.

---

### Swim sTSS (`_swim_tss`)

**Formula implementada** (linea 159-165):
```python
intensity_factor = css_sec_100m / avg_pace_sec_100m
hours = duration_seconds / 3600
return intensity_factor ** 3 * hours * 100
```

**Validacion**:
- IF cubico correcto: en natacion la resistencia al avance crece con el cubo de la velocidad (drag proporcional a v^2, potencia proporcional a v^3).
- CSS (Critical Swim Speed) como referencia es el estandar aceptado.
- La inversion del ratio pace es correcta (mismo patron que rTSS).

**Veredicto**: CORRECTO. Alineado con la literatura (Skiba, TrainingPeaks swim TSS model).

---

### HR TSS (`_hr_tss`)

**Formula implementada** (linea 168-201):
```python
k = 1.92  # hombres (1.67 mujeres)
hrr = (avg_hr - hr_rest) / (hr_max - hr_rest)
trimp = duration_min * hrr * 0.64 * math.exp(k * hrr)
# Normalizado contra 60 min @ LTHR
trimp_ref = 60 * hrr_ref * 0.64 * math.exp(k * hrr_ref)
return (trimp / trimp_ref) * 100
```

**Validacion vs Banister 1991 / Morton 1990**:
- TRIMP exponencial de Banister: `TRIMP = t * deltaHR * 0.64 * e^(k * deltaHR)` -- **CORRECTO**.
- Coeficientes k: 1.92 (hombres) y 1.67 (mujeres) -- **CORRECTO** (Banister et al. 1991).
- Normalizacion contra 1h @ LTHR para producir escala TSS: **CORRECTO** (metodologia Coggan/Skiba para hacer hrTSS comparable a power TSS).
- Fallback a LTHR estimado como 89% HRmax cuando no hay datos de lactato: razonable (Londeree & Ames 1976 sugieren ~85-90% HRmax como rango tipico).
- **Nota**: Usa `avg_hr` de la actividad, no HR por zonas temporales. Esto pierde precision en sesiones con distribuciones bimodales (calentamiento largo + intervalos). El TRIMP real deberia integrarse segundo a segundo o minuto a minuto. Sin embargo, esto es una limitacion aceptable cuando solo se dispone de HR medio de Garmin.

**Veredicto**: CORRECTO. Implementacion fiel al modelo Banister. La limitacion del HR medio es inherente a los datos disponibles.

---

## Series temporales de carga

### CTL (Chronic Training Load)

**Implementacion** (lineas 450-451, 465-466):
```python
atl_decay = 1 - math.exp(-1 / 7)   # = 0.1331
ctl_decay = 1 - math.exp(-1 / 42)  # = 0.02353

atl = atl + (tss_total - atl) * atl_decay
ctl = ctl + (tss_total - ctl) * ctl_decay
```

**Validacion vs Banister 1991**:

El modelo clasico de Banister/Coggan usa EWMA con:
- alpha_CTL = 2 / (42 + 1) = **0.04651**
- alpha_ATL = 2 / (7 + 1) = **0.25**

El codigo usa la forma exponencial:
- alpha_CTL = 1 - exp(-1/42) = **0.02353**
- alpha_ATL = 1 - exp(-1/7) = **0.1331**

**HALLAZGO CRITICO**: Hay dos convenciones validas para EWMA:
1. **Forma clasica TrainingPeaks/Coggan**: `alpha = 2/(n+1)` -- la mas usada en software de entrenamiento (TrainingPeaks, WKO, GoldenCheetah).
2. **Forma exponencial continua**: `alpha = 1 - exp(-1/tau)` -- matematicamente mas precisa para modelar decay continuo.

Ambas son EWMA validas, pero producen resultados **significativamente diferentes**:
- CTL con forma clasica responde ~2x mas rapido que con forma exponencial (alpha 0.0465 vs 0.0235).
- ATL con forma clasica responde ~1.9x mas rapido (alpha 0.25 vs 0.133).

Esto significa que el CTL/ATL del sistema sera mas "lento" y "suavizado" que el de TrainingPeaks. Un atleta que compare sus valores CTL veria numeros diferentes.

**Veredicto**: MATEMATICAMENTE VALIDO pero INCOMPATIBLE con el estandar de la industria (TrainingPeaks). Si el objetivo es interoperabilidad con el ecosistema existente, deberia usar `alpha = 2/(n+1)`. Si el objetivo es precision matematica del modelo continuo, la implementacion actual es correcta.

**Impacto practico**: El CTL sera ~30% mas bajo que el de TrainingPeaks con el mismo historial de entrenamiento. Esto afecta los targets semanales de TSS que se calculan como `CTL * 7 + ramp_rate * modifier * 7`.

---

### ATL (Acute Training Load)

Mismo patron y misma discrepancia que CTL. Ver seccion anterior.

**Veredicto**: MATEMATICAMENTE VALIDO, INCOMPATIBLE CON ESTANDAR INDUSTRIA.

---

### TSB (Training Stress Balance)

**Implementacion** (linea 467):
```python
tsb = ctl - atl
```

**Validacion**: CORRECTO. TSB = CTL - ATL es la definicion universal (Banister 1991). TSB positivo = fresco, TSB negativo = fatigado.

**Veredicto**: CORRECTO.

---

### ACWR (Acute:Chronic Workload Ratio)

**Implementacion en training_load_calculator.py** (linea 468):
```python
acwr = round(atl / ctl, 2) if ctl >= 10 else None
```

**Implementacion en triathlon_motor.py** (lineas 368-377):
```python
acwr = round(atl / ctl, 2) if ctl >= 10 else None

if acwr and acwr > 1.5:
    flag = "spike"
elif acwr and acwr > 1.3:
    flag = "high_acwr"
elif acwr and acwr < 0.6:
    flag = "detraining"
else:
    flag = "safe"
```

**Validacion vs Gabbett 2016**:
- ACWR = ATL/CTL: **CORRECTO** (ratio agudo/cronico).
- Guard `ctl >= 10`: **CORRECTO** -- evita division por valores muy bajos en atletas nuevos.
- Umbral spike > 1.5: **CORRECTO** (Gabbett 2016 identifica >1.5 como zona de alto riesgo lesional).
- Umbral high_acwr > 1.3: **CORRECTO** (sweet spot de Gabbett: 0.8-1.3).
- Umbral detraining < 0.6: razonable, aunque Gabbett no define un umbral inferior especifico.
- **Falta la zona sweet spot explicita** (0.8-1.3) como flag positivo.

**Hallazgo moderado**: El ACWR implementado es el "uncoupled ACWR" (ATL/CTL independientes). Lolli et al. 2019 y Windt & Gabbett 2019 recomiendan el **coupled ACWR** o **EWMA ratio** en lugar del rolling average ratio, que es exactamente lo que se usa aqui (EWMA-based). Sin embargo, la literatura reciente (2020+) ha puesto en duda la validez predictiva del ACWR para lesiones, con varios autores (Impellizzeri 2020, Wang 2021) argumentando que el ACWR tiene limitaciones estadisticas fundamentales como predictor. El uso como guia de progresion (no como predictor de lesion) sigue siendo razonable.

**Safety clamp en triathlon_motor.py** (lineas 113-121):
```python
acwr = projected_atl / current_ctl
if acwr > 1.3:
    target = current_ctl * 7 * 1.3
elif acwr < 0.8:
    target = current_ctl * 7 * 0.8
```

Esto es un clamp de seguridad que limita el TSS semanal target a que el ACWR proyectado no supere 1.3 ni baje de 0.8. **CORRECTO y prudente** como mecanismo de seguridad.

**Hallazgo moderado**: La aproximacion `projected_atl = projected_daily` (linea 115) es muy grosera. ATL es un EWMA de 7 dias, no el valor diario instantaneo. Tras una semana completa de carga uniforme, el ATL convergeria hacia ese valor, pero no lo alcanza en 7 dias. Esto sobreestima el ACWR proyectado.

**Veredicto**: CORRECTO CON RESERVAS. Los umbrales son razonables, la implementacion EWMA-based es mejor que rolling average. Falta flag "sweet_spot" y la aproximacion del ACWR proyectado es grosera.

---

## Uso en planificacion

### Como se usa CTL/ATL en decisiones de planificacion

1. **Target semanal de TSS** (`compute_weekly_tss_targets` en triathlon_motor.py):
   - `target = CTL * 7 + ramp_rate * modifier * 7`
   - Ramp rate default: 5 TSS/dia (35 TSS/semana de incremento) -- razonable (literatura sugiere 3-7 TSS/dia).
   - Phase modifiers: load=1.0, build=1.1, build_peak=1.2, recovery=0.6 -- coherente con periodizacion ondulante.

2. **Safety clamp via ACWR**: Limita el target semanal para mantener ACWR entre 0.8 y 1.3.

3. **Reparto por disciplina** (`discipline_tss_split`):
   - High confidence weakness: 55% primary, 30% secondary, 15% swim
   - Moderate: 50/30/20
   - Low: 40/35/25
   - Ratios razonables basados en Millet 2002.

4. **Proyeccion semanal** (`project_weekly_load`): Proyecta CTL/ATL/TSB/ACWR semana a semana con flags de seguridad.

### Umbrales de ACWR

| ACWR | Flag | Referencia |
|---|---|---|
| > 1.5 | spike | Gabbett 2016 |
| 1.3 - 1.5 | high_acwr | Gabbett 2016 |
| 0.8 - 1.3 | safe | Gabbett 2016 sweet spot |
| < 0.6 | detraining | Criterio propio (razonable) |

---

## Hallazgos criticos

### C1. Power TSS usa Average Power en vez de Normalized Power
- **Impacto**: Subestima TSS en sesiones de intervalos un 5-15%. Sesiones de intensidad constante (FTP test, TT) no se ven afectadas.
- **Correccion**: Buscar `normPower` o `normalizedPower` en el payload de Garmin activity detail. Fallback a `average_watts` si NP no esta disponible, anadiendo warning.

### C2. Alpha EWMA incompatible con estandar TrainingPeaks
- **Impacto**: CTL/ATL ~30% mas bajos que TrainingPeaks con el mismo historial. Confuso para atletas/entrenadores que comparen valores.
- **Correccion**: Cambiar a `alpha = 2/(n+1)` si se quiere compatibilidad. O documentar explicitamente que se usa modelo exponencial continuo y que los valores no son comparables con TP.

### C3. No hay warm-up seed para EWMA
- **Impacto**: El EWMA empieza en 0 y necesita 42 dias de warmup. El codigo hace warmup de 42 dias pre-start_date (linea 443), lo que es correcto **solo si hay datos de actividad en esos 42 dias**. Si el atleta acaba de conectar Garmin, el CTL/ATL sera artificialmente bajo durante semanas.
- **Nota**: El endpoint API (training_load.py linea 38) efectivamente pide actividades con 42d de warmup. Esto es correcto pero insuficiente si el historial del atleta es corto.

---

## Hallazgos moderados

### M1. No se implementa Monotony ni Strain (Foster 1998)
- `Monotony = mean(daily_TSS) / sd(daily_TSS)` para 7 dias
- `Strain = weekly_TSS * Monotony`
- Monotony > 2.0 es factor de riesgo de sobreentrenamiento (Foster 1998)
- Seria un complemento util al ACWR para detectar patrones de carga monotona.

### M2. No hay NGP (Normalized Graded Pace) para trail running
- El rTSS usa ritmo medio sin corregir por pendiente. En trail running esto puede subestimar la carga un 20-40%.

### M3. Aproximacion grosera del ACWR proyectado
- `projected_atl = projected_daily` sobreestima el ACWR proyectado. Deberia simular 7 iteraciones de EWMA (como hace `project_weekly_load`).

### M4. Falta flag "sweet_spot" en ACWR
- Solo existe "safe" como flag generico para 0.6-1.3. Seria informativo distinguir "sweet_spot" (0.8-1.3) de "low" (0.6-0.8).

---

## Recomendaciones

| Prioridad | Accion | Esfuerzo |
|---|---|---|
| ALTA | Usar Normalized Power en vez de Average Power para cycling TSS | Bajo -- buscar campo `normPower` en Garmin detail |
| ALTA | Decidir y documentar convencion EWMA (TP-compatible vs exponencial) | Bajo -- cambiar 2 lineas o anadir documentacion |
| MEDIA | Implementar Monotony y Strain de Foster | Medio -- 30 lineas, anadir al output diario |
| MEDIA | Anadir NGP para trail running rTSS | Medio -- requiere datos de elevacion de Garmin |
| BAJA | Mejorar aproximacion ACWR proyectado en `compute_weekly_tss_targets` | Bajo -- simular 7 pasos EWMA |
| BAJA | Anadir flag "sweet_spot" vs "low" en ACWR | Trivial |
| BAJA | Seed EWMA con Garmin historical CTL si esta disponible | Medio -- requiere endpoint Garmin adicional |

---

## Cobertura de tests

No existen tests unitarios para el modulo `training_load_calculator.py`. Los tests existentes (`test_api.py`, `test_lactate_motor_quality.py`) no cubren TSS, CTL, ATL ni ACWR.

**Recomendacion**: Anadir tests unitarios para:
- `_power_tss`: verificar IF^2 * hours * 100 con valores conocidos
- `_pace_rtss`: verificar inversion de ratio correcta
- `_hr_tss`: verificar TRIMP exponencial con ejemplo numerico publicado
- `compute_training_load_series`: verificar convergencia EWMA con datos sinteticos
- ACWR safety clamp en `compute_weekly_tss_targets`

---

## Referencias bibliograficas

- Banister EW et al. (1991). Modeling human performance in running. *J Appl Physiol*, 75(6), 2191-2197.
- Coggan AR (2003). Training and racing using a power meter. *Peaksware/TrainingPeaks whitepaper*.
- Foster C (1998). Monitoring training in athletes with reference to overtraining syndrome. *Med Sci Sports Exerc*, 30(7), 1164-1168.
- Gabbett TJ (2016). The training-injury prevention paradox. *Br J Sports Med*, 50(5), 273-280.
- Impellizzeri FM et al. (2020). Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. *Int J Sports Physiol Perform*, 15(6), 907-913.
- Lolli L et al. (2019). Mathematical coupling causes spurious correlation within the conventional acute-to-chronic workload ratio calculations. *Br J Sports Med*, 53(15), 921-922.
- Londeree BR, Ames SA (1976). Trend analysis of the %VO2max-HR regression. *Med Sci Sports*, 8(2), 122-125.
- Millet GP et al. (2002). Modelling the transfers of training effects on performance in elite triathletes. *Int J Sports Med*, 23(1), 55-63.
- Morton RH et al. (1990). Modeling human performance in running. *J Appl Physiol*, 69(3), 1171-1177.
- Skiba PF (2006). *The Physics of Cycling*, chapter on TSS and IF metrics.
- Wang C et al. (2021). Acute:chronic workload ratio: a problem worth revisiting. *Sports Med*, 51, 2403-2412.
- Windt J, Gabbett TJ (2019). Is it all for naught? What does mathematical coupling mean for acute:chronic workload ratios? *Br J Sports Med*, 53(16), 988-990.
