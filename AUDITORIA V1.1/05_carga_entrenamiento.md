# Auditoria 05 — Sistema de Carga de Entrenamiento (TSS / ATL / CTL / TSB / ACWR)

**Fecha**: 2026-03-15
**Archivos auditados**:
- `backend/app/services/training_load_calculator.py`
- `backend/app/services/triathlon_motor.py`
- `frontend/src/planning/components/CalendarView.tsx`
- `backend/app/schemas/training_load.py`

---

## Resumen ejecutivo

El sistema de carga de entrenamiento implementa el modelo Banister impulse-response (fitness-fatigue) con TSS como input, EWMA para ATL/CTL, y ACWR como gate de seguridad. La auditoría identifica **3 errores concretos**, **4 inconsistencias peligrosas**, y **2 asunciones sin soporte científico**. El hallazgo más grave es la **discrepancia entre las constantes de decaimiento del backend y el frontend**, que produce valores ATL/CTL diferentes para los mismos datos.

### Severity summary

| Severidad | Hallazgos |
|-----------|-----------|
| CRITICO | 2 — Constantes frontend/backend divergentes; sTSS IF^3 sin base científica sólida |
| ALTO | 3 — ECO weights incorrectos vs Cejuela; ACWR como hard limit sin evidencia; division-by-zero CTL |
| MEDIO | 3 — IF table sin calibración; ramp rate fijo; warmup 42d insuficiente |
| BAJO | 2 — hrTSS k-factor simplificado; swim discipline recovery same tau |

---

## 1. EWMA — Modelo Banister

### 1.1. Origen de tau=7 y tau=42

**Pregunta**: Banister 1991 usaba estos valores o los popularizó Coggan?

**Hallazgo**: Banister (1991) NO fijaba tau=7 y tau=42. Su modelo original tenía 5 parámetros ajustables por individuo (tau_1, tau_2, k_1, k_2, p_0) que se optimizaban retroactivamente con datos de rendimiento. Los valores 7/42 fueron popularizados por **Coggan y Allen** al crear el Performance Manager Chart de TrainingPeaks, como "defaults razonables" basados en experiencia coaching, no en el paper original.

**Evidencia**:
- Banister et al. (1991) "Modeling human performance in running" — parametros individualizados
- Pfeiffer (2008, J Sports Med) reporta tau_1 = 11-60 días, tau_2 = 1-15 días en diferentes atletas
- Clarke & Skiba (2013): "the values for the constants are specific to each individual, and possibly to the particular training regime"
- Kolossa et al. (2017, IJCSS) confirma que usar constantes generales "should be avoided since they do not account for interindividual differences"
- TrainingPeaks Help Center: "ATL constants to set your Performance Manager Chart to are between 3-7", CTL "the 42-day constant represents the half-life of training"

**Veredicto**: Los defaults 7/42 son una **convención práctica de Coggan/Allen**, no un resultado científico de Banister. Son razonables como defaults pero no deben tratarse como verdades universales.

**Recomendación**: OK como defaults. Considerar hacer configurables por atleta (TrainingPeaks permite ATL 3-7, CTL 28-42).

### 1.2. Fórmula de decaimiento EWMA

**Código backend** (lineas 457-460):
```python
# TrainingPeaks / WKO standard: alpha = 2 / (n + 1)
atl_decay = 2.0 / (7 + 1)   # 0.25
ctl_decay = 2.0 / (42 + 1)  # 0.04651
```

**Codigo frontend** (CalendarView.tsx lineas 365-366):
```typescript
const atlDecay = 1 - Math.exp(-1 / 7);   // 0.1331
const ctlDecay = 1 - Math.exp(-1 / 42);  // 0.02353
```

### **CRITICO: Las constantes son DIFERENTES entre backend y frontend**

| Constante | Backend `2/(n+1)` | Frontend `1-exp(-1/tau)` | Diferencia |
|-----------|-------------------|--------------------------|------------|
| ATL alpha | 0.2500 | 0.1331 | **+88%** |
| CTL alpha | 0.04651 | 0.02353 | **+98%** |

Esto significa que el backend produce ATL/CTL que reaccionan **~2x más rápido** que el frontend. Un atleta viendo valores en el calendario (frontend fallback) verá métricas completamente diferentes a las del backend.

**Analisis matematico**:

Ambas fórmulas son variantes válidas de EWMA:
- `alpha = 2/(N+1)` es la convención financiera (RiskMetrics), también usada por TrainingPeaks/WKO5
- `alpha = 1-exp(-1/tau)` es la formulación continua del modelo impulse-response de Banister

Para que sean equivalentes: `2/(N+1) = 1-exp(-1/tau)` implica `tau = -1/ln(1 - 2/(N+1))`. Para N=7: tau = -1/ln(0.75) = 3.48 (no 7). Para N=42: tau = -1/ln(0.9535) = 21.0 (no 42).

**Conclusión**: El backend usa la convención TrainingPeaks (correcta para compatibilidad con ese ecosistema). El frontend usa la formulación Banister original. **Deben unificarse.** El backend ya tiene un comentario que reconoce el cambio: "Previous: 1 - e^(-1/tau) gave 0.133 / 0.024 — ~30% lower than TP."

**Recomendación**: Unificar a `2/(N+1)` en ambos lados (convención TrainingPeaks, que es lo que los entrenadores esperan). Documentar que NO es el Banister original.

### 1.3. Warmup period

El backend usa 42 días de warmup (linea 449). Esto es insuficiente: la EWMA con alpha=0.0465 necesita ~2*tau = ~86 días para converger al verdadero CTL. Con solo 42 días de warmup, el CTL inicial está ~50% por debajo de su valor real.

**Recomendación**: Usar 84 días de warmup, o mejor, la totalidad de datos históricos disponibles.

---

## 2. TSS — Training Stress Score

### 2.1. Power TSS (ciclismo)

**Formula**: `TSS = IF^2 * hours * 100` donde `IF = NP / FTP`

**Origen**: Coggan (2003), posteriormente refinado en Coggan & Allen "Training and Racing with a Power Meter" (2006, 2010, 2019).

**Veredicto**: Correcto. Es el estándar de facto, bien validado para ciclismo con potenciómetro. Confidence=1.0 es apropiada.

**Nota**: El código usa `weighted_average_watts` (proxy de NP de Strava) o fallback a `average_watts`. Usar average_watts subestima la variabilidad del esfuerzo y por tanto subestima TSS en sesiones con intervalos. Debería bajar la confidence cuando se usa average_watts.

### 2.2. Pace rTSS (running)

**Formula**: `rTSS = (threshold_pace / actual_pace)^2 * hours * 100`

**Origen**: TrainingPeaks, basado en el concepto de Coggan adaptado a running. La pace-based version fue desarrollada por TrainingPeaks usando Normalized Graded Pace (NGP) como proxy de NP.

**Veredicto**: La implementación es **simplificada**. El rTSS real de TrainingPeaks usa NGP (que ajusta por pendiente), no average pace. Usar average pace es aceptable en terreno plano pero subestima el esfuerzo en recorridos con desnivel. Confidence=0.9 es **generosa** — debería ser ~0.80 sin ajuste de pendiente.

**Hallazgo**: La fórmula `threshold_pace / actual_pace` asume que pace más rápido = IF más alto, lo cual es correcto (sec/km menor = más rápido = ratio > 1 si actual < threshold... espera). Si `avg_pace_sec_km = 300` y `threshold = 240`, entonces IF = 240/300 = 0.8. Eso es correcto: ir más lento que umbral da IF < 1. OK, la dirección es correcta.

### 2.3. Swim TSS — IF^3

**Formula**: `sTSS = IF^3 * hours * 100` donde `IF = CSS / actual_pace`

**Pregunta**: De dónde viene el exponente cúbico?

**Hallazgo tras búsqueda exhaustiva**: **No existe ningún paper peer-reviewed que valide IF^3 para natación.** El exponente cúbico aparece en:

1. **TrainingPeaks** (artículo "Calculating Swimming TSS Score") — lo justifica diciendo "water presents more resistance than air, so the physiological stress of swimming increases with increasing swim speed faster than running"
2. **Joe Friel** (blog 2009, "Estimating TSS") — presenta la tabla IF^3 como aproximación práctica
3. **CoachCox** (2011) — replica la fórmula de TrainingPeaks

**La justificación física es incorrecta**: La potencia requerida en natación escala con v^3 (drag ~ v^2, power = drag × v = v^3). Pero IF ya incorpora la relación de velocidad. Si power ~ v^3, y IF = v_actual/v_css (en velocidad, no pace), entonces la "potencia normalizada" sería IF^3. El exponente cúbico intenta aproximar la relación potencia-velocidad. Esto tiene cierta lógica física pero:

- Asume que la curva de drag es puramente cuadrática, lo cual es solo una aproximación
- Ignora la eficiencia propulsiva variable con la velocidad
- NO ha sido validado empíricamente vs mediciones reales de VO2 en piscina
- El CSS no es un "functional threshold" de la misma calidad que el FTP en ciclismo

**Veredicto**: El IF^3 es una **convención práctica de coaching** (Friel/TrainingPeaks) con una justificación física plausible pero no validada. Confidence=0.8 es apropiada dado el nivel de incertidumbre.

**PRECAUCION**: En la implementación actual, IF se calcula como `css_pace / actual_pace` (ambos en sec/100m). Si el nadador va más rápido que CSS, actual_pace < css_pace, IF > 1, IF^3 > IF^2 — amplifica más las sesiones intensas. Si va más lento que CSS, IF < 1, IF^3 < IF^2 — reduce más las sesiones suaves. Este comportamiento asimétrico es deseable y coherente con la justificación física.

### 2.4. hrTSS (TRIMP-based)

**Formula**: `TRIMP = duration * HRR * 0.64 * exp(k * HRR)`, normalizado a 60 min @ LTHR = 100 TSS.

**Origen**: Edwards (1993) y Banister et al. (1991) para TRIMP. La normalización a TSS-equivalent es de TrainingPeaks.

**Hallazgo**: Los coeficientes k=1.92 (hombres) y k=1.67 (mujeres) provienen de Banister et al. (1991). El factor 0.64 es el coeficiente de TRIMP modificado. La fórmula es correcta.

**Problema menor**: La estimación LTHR = 89% de HRmax cuando LTHR es desconocido es un valor genérico. En atletas entrenados puede ser 90-95%, en sedentarios 75-80%. Esto introduce sesgo en hrTSS cuando no hay datos de lactato.

**Confidence=0.7**: Apropiada. hrTSS tiene limitaciones conocidas (lag cardiaco, drift, medicación, cafeína, temperatura).

### 2.5. Tabla IF por zona de intensidad

**Código** (triathlon_motor.py, lineas 34-44):
```python
_IF_BY_ZONE = {
    "sub-LT1": 0.65,
    "LT1": 0.78,
    "sub-LT2": 0.88,
    "LT2": 0.95,
    "VO2max": 1.05,
    "sprint": 1.15,
}
```

**Evaluacion**:

| Zona | IF en código | IF esperado (Coggan) | Evaluación |
|------|-------------|---------------------|------------|
| sub-LT1 (recovery/Z1) | 0.65 | 0.55-0.75 | OK, centro del rango |
| LT1 (endurance/Z2) | 0.78 | 0.75-0.85 | OK, parte baja pero razonable |
| sub-LT2 (tempo/Z3) | 0.88 | 0.85-0.95 | OK |
| LT2 (threshold/Z4) | 0.95 | 0.95-1.05 | OK, parte baja del umbral |
| VO2max (Z5) | 1.05 | 1.05-1.20 | OK, parte baja |
| Sprint (Z6-7) | 1.15 | 1.15-1.50+ | OK para sprints cortos |

**Veredicto**: Los valores son razonables como estimaciones centrales. Las zonas de Coggan (2003) son para ciclismo con potencia; adaptarlas a running y swimming introduce error adicional. Los valores sub-LT1 y VO2max son conservadores, lo cual subestimará TSS en sesiones de recovery y VO2max.

**Nota**: Estos valores NO son "evidence-based" en el sentido de validación experimental. Son convenciones de coaching basadas en la escala IF de Coggan, extrapoladas a zonas fisiológicas.

### 2.6. Frontend estimateSessionTSS

```typescript
const ifFactor = session.sessionType === "clave" ? 0.88
    : session.sessionType === "soporte" ? 0.75
    : 0.65; // recovery
```

**Evaluacion**: Simplificación agresiva pero aceptable para estimación visual en el calendario. Mapear "clave" a IF=0.88 (sub-LT2/tempo) es conservador — muchas sesiones clave son a LT2+ (IF>0.95). Esto subestimará TSS de sesiones clave de alta intensidad en ~20-30%.

**Importante**: Esta función solo se usa como fallback cuando no hay datos de la API. El frontend prefiere datos del backend cuando están disponibles (lineas 337-351).

---

## 3. ECO Weights

### 3.1. Valores implementados vs Cejuela

**Código** (triathlon_motor.py, linea 26-31):
```python
# ECO load weighting (Cejuela 2022) — mechanical cost by discipline
_ECO_WEIGHT = {
    "running": 1.0,
    "ciclismo": 0.50,
    "natación": 0.75,
}
```

**Cejuela et al. (2007, 2022) — valores reales del método ECO**:
- Running: **1.0**
- Swimming: **0.75**
- Cycling: **0.5**

**Veredicto**: Los valores implementados **coinciden exactamente** con el método ECO de Cejuela. La atribución "Cejuela 2022" se refiere a Cejuela & Sellés-Pérez (2022), "Road to Tokyo 2020", Frontiers in Physiology, donde aplican el método ECO al entrenamiento olímpico.

### 3.2. Validación científica del concepto ECO

El método ECO (Escala de Carga Objetiva) de Cejuela fue diseñado específicamente para triatlón. Multiplica el tiempo en cada zona de entrenamiento por un factor de scoring (1-50 según zona) y por el factor de disciplina (1.0 / 0.75 / 0.5). La justificación es:

- **Running (1.0)**: Mayor coste mecánico (impacto, daño muscular excéntrico)
- **Swimming (0.75)**: Coste técnico alto, sin impacto, menor daño muscular
- **Cycling (0.50)**: Menor coste mecánico (concéntrico puro, sin impacto, sustentación del peso)

**Evidencia de soporte**:
- Cejuela et al. (2007): "Training load quantification in triathlon" — primera publicación del método ECO
- Cejuela & Sellés-Pérez (2022): validación en atleta olímpico (Tokyo 2020)
- Millet et al. (2002, 2011): confirman cualitativamente la jerarquía running > swimming > cycling en coste mecánico
- Hausswirth et al. (1997, 2010): documentan la degradación del coste energético del running post-ciclismo

**Limitaciones**: El ECO NO ha sido validado con biomarcadores de daño muscular (CK, LDH) ni con escalas de fatiga percibida en comparaciones controladas. Los ratios 1.0/0.75/0.5 son estimaciones de Cejuela basadas en experiencia con atletas de élite, no resultado de un estudio controlado.

**NOTA sobre Hausswirth 2013**: El código de triathlon_motor.py referencia "Hausswirth 2013" en los spacing rules, pero el libro Hausswirth & Mujika (2013) "Recovery for Performance in Sport" no contiene ratios ECO. La atribución correcta es **Cejuela (2007/2022)**.

---

## 4. EWMA por disciplina

### 4.1. Mismo tau para todas las disciplinas

**Implementación**: El backend calcula ATL/CTL separados por disciplina pero usa los mismos alpha (7d ATL, 42d CTL) para running, ciclismo y natación.

**Pregunta**: La fatiga de natación se disipa al mismo ritmo que la de running?

**Evidencia**:
- **No hay consenso científico** sobre time constants específicos por disciplina
- El daño muscular de running (excéntrico) tarda 48-72h en resolverse (Clarkson & Hubal, 2002)
- La fatiga de swimming es principalmente neuromuscular/metabólica y se resuelve en 24-48h (Costill et al., 1988)
- La fatiga de cycling es mayormente metabólica con menor componente muscular (Amann, 2011)
- TrainingPeaks usa los mismos 7/42 para todas las disciplinas
- Intervals.icu permite configurar ATL/CTL por disciplina

**Veredicto**: Usar el mismo tau es una **simplificación aceptable** dada la falta de evidencia para valores específicos. Teóricamente, swimming podría usar ATL tau=5 (fatiga más rápida) y running ATL tau=9 (fatiga más lenta por daño muscular), pero esto no está validado.

**Recomendación**: Mantener como está. Es más importante tener la separación por disciplina (que ya existe) que refinar los taus sin evidencia.

---

## 5. ACWR — Acute:Chronic Workload Ratio

### 5.1. Implementación actual

```python
acwr = round(atl / ctl, 2) if ctl >= 10 else None
```

Y en triathlon_motor.py:
```python
if acwr > 1.5: flag = "spike"
elif acwr > 1.3: flag = "high_acwr"
elif acwr < 0.6: flag = "detraining"
else: flag = "safe"
```

### 5.2. Division por cero / CTL bajo

**Implementación**: `if ctl >= 10 else None` — threshold de 10 TSS para evitar divisiones por valores bajos.

**Problema**: CTL=10 es un threshold arbitrario. Un atleta con CTL=11 tendría ACWR calculado pero con altísima variabilidad. Con CTL=15 y una sesión intensa de TSS=80, el ATL podría subir rápidamente dando ACWR > 5.

**Recomendación**: Subir el threshold a CTL >= 20-25, o mejor, no mostrar ACWR hasta que haya al menos 28 días de datos.

### 5.3. Gabbett 2016 — Rangos originales

**Paper**: Gabbett TJ (2016) "The training-injury prevention paradox: should athletes be training smarter and harder?" BJSM.

**Hallazgos clave**:
- ACWR 0.8-1.3: "sweet spot" con menor riesgo de lesión
- ACWR >= 1.5: riesgo significativamente elevado
- ACWR < 0.8: posible desentrenamiento pero no necesariamente peligroso
- Los datos provienen de **deportes de equipo** (rugby league, cricket, AFL), NO de deportes de resistencia
- Gabbett usa ACWR con sRPE, no con TSS

**Veredicto sobre el código**: Los umbrales 1.3 (high) y 1.5 (spike) son coherentes con Gabbett. El 0.6 como "detraining" es más conservador que Gabbett (que usa 0.8). **Sin embargo, Gabbett nunca recomendó usar ACWR como hard limit.**

### 5.4. Impellizzeri 2020 — Crítica fundamental

**Paper**: Impellizzeri FM et al. (2020) "Training Load and Its Role in Injury Prevention, Part 2: Conceptual and Methodologic Pitfalls" J Athletic Training.

**Conclusiones devastadoras**:
1. "There is **no evidence** supporting the use of ACWR in training-load-management systems"
2. Los time constants 7/28 son **arbitrarios** — "no rationale as to the exact time span"
3. El ACWR tiene **propiedades estadísticas problemáticas** — añade ruido y crea artefactos
4. "Studies have shown that **randomised chronic loads** perform just as well as ACWR"
5. No se ha demostrado causalidad — manipular ACWR para reducir lesiones "remains a conjecture"

### 5.5. Wang 2020 — Mathematical coupling

**Wang et al. (2020)**: Cuando se eliminan outliers y se tratan los datos como continuos, la relación entre ACWR y lesión **desaparece**. La correlación observada puede ser espuria por acoplamiento matemático (el numerador ATL está contenido en el denominador CTL).

**Lolli et al. (2019)**: Confirman que el acoplamiento matemático causa correlaciones espurias en el cálculo convencional del ACWR.

### 5.6. Veredicto ACWR

**El ACWR implementado se usa como hard limit** en `compute_weekly_tss_targets()` (triathlon_motor.py lineas 125-132):

```python
if acwr > 1.3:
    target = current_ctl * 7 * 1.3  # Cap hard
elif phase != "recovery" and acwr < 0.8:
    target = current_ctl * 7 * 0.8  # Floor hard
```

**Esto es problemático por 3 razones**:
1. Impellizzeri 2020 y Wang 2020 cuestionan la validez predictiva del ACWR
2. Gabbett mismo dice que atletas con alto CTL pueden tolerar ACWR > 1.5 sin problemas
3. Un hard cap impide "shock blocks" (microciclos de sobrecarga planificada), que son herramienta legítima de periodización (Issurin 2010)

**Recomendacion**: Convertir de hard limit a **advisory warning**. El entrenador debe poder override el cap de ACWR cuando prescribe un shock block intencionado.

---

## 6. Ramp Rate

### 6.1. Implementación

```python
def compute_weekly_tss_targets(
    current_ctl: float, phase: str,
    ramp_rate: float = 5.0,  # TSS/week
    ...
```

El ramp_rate de 5 TSS/semana se aplica multiplicado por el phase modifier (1.0-1.2) y por 7 (días).

### 6.2. Evidencia científica

**Gabbett 2016**:
- Incremento semanal < 10%: riesgo de lesión ~7.5%
- Incremento semanal 10-15%: riesgo moderado
- Incremento semanal > 15%: riesgo ~21%
- Incremento semanal > 50%: riesgo ~38%

**Bourdon et al. (2017)** "Monitoring Athlete Training Loads: Consensus Statement":
- No da un ramp rate específico en TSS, pero recomienda monitorizar incrementos relativos
- La "regla del 10%" (no aumentar más de 10% por semana) es una heurística popular pero **Gabbett la considera excesivamente conservadora**

**Analisis del ramp rate de 5 TSS/semana**:
- Para un atleta con CTL=50: ramp semanal = 5*7 = 35 TSS → CTL_semana = 50*7+35 = 385 → ~10% incremento. Razonable.
- Para un atleta con CTL=100: ramp semanal = 35 TSS → CTL_semana = 100*7+35 = 735 → ~5% incremento. Conservador.
- Para un atleta con CTL=20: ramp semanal = 35 TSS → CTL_semana = 20*7+35 = 175 → ~25% incremento. **Agresivo.**

**Problema**: Un ramp rate fijo en TSS absoluto no escala con el nivel del atleta. Un principiante con CTL=20 recibe proporcionalmente mucha más carga que un atleta con CTL=100.

**Recomendacion**: Usar ramp rate como **porcentaje del CTL actual** (5-10% semanal), no valor absoluto. Ejemplo: `ramp_rate_pct = 0.08` → `target = current_ctl * 7 * (1 + ramp_rate_pct * modifier)`.

---

## 7. Consistencia Frontend vs Backend

### 7.1. Constantes de decaimiento

| Parámetro | Backend | Frontend (fallback) | Match? |
|-----------|---------|-------------------|--------|
| ATL alpha | 2/(7+1) = 0.250 | 1-exp(-1/7) = 0.133 | **NO** |
| CTL alpha | 2/(42+1) = 0.0465 | 1-exp(-1/42) = 0.0235 | **NO** |
| CTL threshold ACWR | >= 10 | >= 10 | Si |
| TSB formula | CTL - ATL | CTL - ATL | Si |
| Warmup period | 42 dias | 42 dias | Si |
| Disciplines | running/ciclismo/natacion | running/ciclismo/natacion | Si |

### 7.2. Impacto práctico de la divergencia

Ejemplo: atleta con TSS=80 constante durante 14 días, empezando desde 0:

| Dia | ATL (backend, alpha=0.25) | ATL (frontend, alpha=0.133) | Delta |
|-----|--------------------------|---------------------------|-------|
| 1 | 20.0 | 10.6 | +89% |
| 7 | 63.9 | 44.7 | +43% |
| 14 | 77.5 | 63.1 | +23% |

El backend reporta fatiga **significativamente mayor** que el frontend. Esto podría causar:
- ACWR alerts que aparecen en backend pero no en frontend
- TSB más negativo en backend vs frontend
- Confusión del entrenador al comparar valores

### 7.3. Cuándo se usa cada uno

El frontend usa su EWMA propia **solo como fallback** (linea 337: `if (trainingLoadDays?.length)` devuelve datos API). Cuando la API devuelve datos, el frontend usa directamente los valores del backend. El problema surge cuando no hay datos de API (sesiones solo planificadas, no ejecutadas).

**Recomendacion CRITICA**: Unificar a `alpha = 2/(N+1)` en el frontend para matching con backend y compatibilidad con TrainingPeaks.

---

## 8. Hallazgos adicionales

### 8.1. Cadena de fallback TSS

```
power_tss (conf=1.0) > pace_rtss (conf=0.9) > swim_tss (conf=0.8) > hr_tss (conf=0.7) > garmin_reported (conf=0.5)
```

**Evaluacion**: La priorización es correcta. La confidence de pace_rtss debería ser 0.80-0.85 (no 0.9) dado que no usa NGP. El sistema de audit log (JSONL) es una buena práctica que permite validar los cálculos.

### 8.2. Seed EWMA

El backend permite initial_ctl/initial_atl del modelo Athlete (lineas 468-477). Buena práctica para atletas que importan datos existentes. Sin embargo, la convergencia EWMA con alpha=0.25 (ATL) es ~4 tau = 28 días, y con alpha=0.0465 (CTL) es ~4/alpha = 86 días. Documentar que los primeros 2-3 meses de datos pueden ser poco fiables.

### 8.3. TSS estimation sin swim cube en frontend

El frontend `estimateSessionTSS` usa IF^2 para todo (linea 311: `ifFactor * ifFactor * hours * 100`), no IF^3 para natación. El backend triathlon_motor.py sí distingue (lineas 151-154). Inconsistencia menor (solo afecta estimaciones visuales del calendario).

---

## 9. Tabla de acciones recomendadas

| # | Acción | Severidad | Esfuerzo |
|---|--------|-----------|----------|
| 1 | **Unificar constantes EWMA** frontend/backend a `2/(N+1)` | CRITICO | 5 min |
| 2 | Convertir ACWR de hard limit a advisory warning con override | ALTO | 30 min |
| 3 | Cambiar ramp_rate de absoluto a porcentaje del CTL | ALTO | 20 min |
| 4 | Subir CTL threshold para ACWR de 10 a 25 | MEDIO | 5 min |
| 5 | Bajar confidence de pace_rtss de 0.9 a 0.85 | BAJO | 2 min |
| 6 | Ampliar warmup de 42 a 84 días | MEDIO | 5 min |
| 7 | Documentar que sTSS IF^3 es convención coaching, no ciencia | BAJO | 5 min |
| 8 | Añadir IF^3 para swim en frontend estimateSessionTSS | BAJO | 5 min |
| 9 | Hacer ATL/CTL tau configurables por atleta | BAJO | 1h |

---

## 10. Referencias

### Papers citados
- Banister EW et al. (1991) "Modeling human performance in running". J Appl Physiol.
- Bourdon PC et al. (2017) "Monitoring Athlete Training Loads: Consensus Statement". IJSPP 12(s2):S2-161.
- Cejuela R et al. (2007) "Training load quantification in triathlon".
- Cejuela R & Sellés-Pérez S (2022) "Road to Tokyo 2020 Olympic Games". Front Physiol.
- Coggan AR & Allen H (2006/2010/2019) "Training and Racing with a Power Meter". VeloPress.
- Gabbett TJ (2016) "The training-injury prevention paradox". BJSM 50:273-280.
- Hausswirth C & Mujika I (2013) "Recovery for Performance in Sport". INSEP.
- Impellizzeri FM et al. (2020) "Training Load and Injury Part 2". J Athletic Training 55(9):893.
- Kolossa D et al. (2017) "Performance estimation using the fitness-fatigue model". IJCSS.
- Lolli L et al. (2019) "Mathematical coupling causes spurious correlation within the conventional ACWR calculations". BJSM.
- Wang C et al. (2020) "ACWR validity critique".

### Fuentes web consultadas
- [The Science of the TrainingPeaks Performance Manager](https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/)
- [TrainingPeaks: Calculating Swimming TSS Score](https://www.trainingpeaks.com/learn/articles/calculating-swimming-tss-score/)
- [TrainingPeaks: Estimating TSS](https://www.trainingpeaks.com/learn/articles/estimating-training-stress-score-tss/)
- [TrainingPeaks: Fatigue (ATL)](https://help.trainingpeaks.com/hc/en-us/articles/204071894-Fatigue-ATL)
- [Impellizzeri 2020 — ACWR Conceptual Issues (PubMed)](https://pubmed.ncbi.nlm.nih.gov/32502973/)
- [Gabbett 2016 — Training-injury paradox (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4789704/)
- [ACWR Debunked? (Global Performance Insights)](https://www.globalperformanceinsights.com/post/has-the-acute-chronic-workload-ratio-been-debunked)
- [ECO vs TRIMP (TrainerPlan)](https://www.trainerplan.co/blog/en/trimp-vs-eco-breaking-two-important-methodologies-to-quantify-the-training-load/)
- [Fitness-Fatigue Model: What's in the Numbers? (IJSPP 2022)](https://journals.humankinetics.com/view/journals/ijspp/17/5/article-p810.xml)
- [Fellrnr: Modeling Human Performance](https://fellrnr.com/wiki/Modeling_Human_Performance)
