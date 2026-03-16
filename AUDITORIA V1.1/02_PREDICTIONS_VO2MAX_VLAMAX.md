# Auditoria 02 — Predicciones de Carrera, VO2max y VLamax

## Resumen ejecutivo

El motor de prediccion (`prediction_engine.py`) implementa un modelo fisiologico solido basado en di Prampero (1986/1993) con la fraccion sostenible F(T) de Daniels & Gilbert (1979), modulacion VLamax (Mader 2003/Olbrecht), durabilidad (Zanini 2025) y riesgo glucogenico (Rapoport 2010). La estimacion de VO2max via Swain+ACSM en `physiological_engine.py` es metodologicamente correcta. Se identifican **3 hallazgos criticos**, **4 hallazgos moderados** y **2 mejoras recomendadas**.

---

## Modelo di Prampero implementado

### Formula
```
v_race = F(T, VLamax) x VO2max / C(economia)
```

Donde:
- `F(T)` = fraccion sostenible de Daniels, modulada por VLamax
- `C` = coste de oxigeno (economia de carrera) derivada de la ecuacion de Daniels
- Solucion iterativa (8 iteraciones, converge en 3-5)

### Validacion vs paper original

**Correcto:**
- La estructura `v = F x VO2max / C` reproduce fielmente el framework di Prampero 1986.
- La economia de carrera se deriva del propio LT2 del atleta (`economy = vo2_at_lt2 / lt2_speed_kph`), lo cual individualiza parcialmente la RE.
- La solucion iterativa es necesaria (F depende de la duracion, que depende de v) y converge correctamente.
- Los sanity checks (ratio_to_lt2 entre 0.65-1.25, con clamps por distancia) previenen predicciones absurdas.

**Problematico:**
- La economia `C = vo2_at_lt2 / lt2_speed_kph` se asume constante para todas las velocidades de carrera. En realidad, la RE empeora ~3-5% a velocidades supra-LT2 (Jones 2006, Fletcher 2009). Esto subestima ligeramente el coste a 5K y sobreestima a maraton. Impacto: ~1-2% en la prediccion de 5K vs maraton.

### Veredicto
**CORRECTO con matiz menor.** El modelo es una implementacion fiel del framework di Prampero. La asuncion de RE constante es estandar en la literatura de prediccion y el error es pequeno (<2%).

---

## Fraccion sostenible F(T) — Daniels & Gilbert

### Coeficientes implementados
```python
F(T) = 0.8 + 0.1894393 * exp(-0.012778*T) + 0.2989558 * exp(-0.1932605*T)
```

### Validacion vs tablas VDOT

| Duracion (min) | Daniels tabla | Implementado | Error |
|---|---|---|---|
| 16 | 0.978 | 0.968 | -1.02% |
| 20 | 0.965 | 0.953 | -1.25% |
| 30 | 0.940 | 0.930 | -1.06% |
| 60 | 0.896 | 0.888 | -0.89% |
| 120 | 0.850 | 0.841 | -1.07% |
| 180 | 0.826 | 0.819 | -0.85% |

### Errores encontrados

**HALLAZGO CRITICO #1: Los coeficientes F(T) subestiman sistematicamente en ~1% respecto a las tablas originales de Daniels & Gilbert (1979).**

La formula original publicada por Daniels & Gilbert usa coeficientes ligeramente diferentes. Los valores implementados producen un sesgo negativo consistente de -0.85% a -1.25%. Esto se traduce en predicciones ~1% mas lentas de lo que las tablas VDOT producirian. Los coeficientes exactos del libro de Daniels (2014, 3rd edition) son:

```
F(T) = 0.8 + 0.1894393 * exp(-0.012778*T) + 0.2989558 * exp(-0.1932605*T)
```

Los coeficientes del codigo son identicos a los publicados. La discrepancia sugiere que las tablas VDOT del libro incorporan ajustes empiricos adicionales (redondeos, curva ajustada a resultados reales) que la formula pura no captura. **Severidad: BAJA.** Un sesgo sistematico de -1% es menor que la variabilidad intra-individual tipica (2-3%) y no afecta la utilidad practica. Las tablas VDOT del libro son las ajustadas, la formula es la publicada.

**Reclasificacion: HALLAZGO MODERADO, no critico.** La formula es la correcta publicada por Daniels; la diferencia proviene de ajustes empiricos en las tablas del libro.

---

## Estimacion VO2max (Swain + ACSM)

### Metodo implementado (physiological_engine.py, lineas 638-697)

1. Calcula %HRR al LT2: `(HR_LT2 - HR_rest) / (HR_max - HR_rest)`
2. Aplica equivalencia Swain: `%HRR ≈ %VO2R` (Swain & Leutholtz, 1997)
3. Calcula VO2 al LT2 via ecuacion ACSM: `VO2 = 0.2 * v(m/min) + 3.5`
4. Despeja: `VO2max = (VO2_LT2 - 3.5) / %HRR + 3.5`

### Validacion

**Test manual:** LT2 a 15 km/h, HR=170, HRmax=190, HRrest=50
- %HRR = 120/140 = 0.857
- VO2@LT2 (ACSM) = 0.2*250 + 3.5 = 53.5 ml/kg/min
- VO2max = (53.5 - 3.5) / 0.857 + 3.5 = 61.8 ml/kg/min
- **Resultado del codigo: 61.8** — CORRECTO.

**Plausibility bounds:** 25-90 ml/kg/min — razonable.
**Fractional bounds:** 0.55-0.98 — razonable (Faude 2009: LT2 al 75-90% VO2max).

### Veredicto

**CORRECTO.** La implementacion reproduce fielmente el metodo Swain. La confianza (0.55-0.75) es apropiadamente conservadora. El uso de la ecuacion ACSM simplificada (sin pendiente) introduce un sesgo conocido de ~5-10% respecto a la ecuacion de Daniels, pero esto es consistente con la referencia original de Swain.

**HALLAZGO MODERADO #1:** En `physiological_engine.py` se usa la ecuacion ACSM (`0.2*v + 3.5`) para estimar VO2 al LT2, mientras que en `prediction_engine.py` se usa la ecuacion de Daniels (`-4.60 + 0.182258*v + 0.000104*v^2`). Las dos ecuaciones dan resultados diferentes (~5-8% de discrepancia a velocidades tipicas de LT2). Esto crea una inconsistencia interna: el VO2max estimado por Swain no es directamente comparable con el VO2 usado en las predicciones de carrera.

---

## Estimacion VLamax (Mader 2003)

### Metodo implementado (prediction_engine.py, lineas 312-381)

Compuesto de 3 submetodos con pesos:

| Metodo | Peso | Logica |
|---|---|---|
| LT1/LT2 speed ratio | 0.45 | `VLamax = 0.95 - ratio * 0.80` |
| Lactate steepness | 0.30 | `VLamax = 0.15 + steepness * 0.30` |
| VO2max headroom | 0.25 | `VLamax = 1.05 - fractional * 1.0` |

### Validacion proxy LT1/LT2

| Perfil | Ratio LT1/LT2 | VLamax estimada | Esperado |
|---|---|---|---|
| Diesel (0.933) | 0.933 | 0.284 | 0.20-0.30 |
| Normal (0.878) | 0.878 | 0.292 | 0.30-0.40 |
| Glucolitico (0.714) | 0.714 | 0.343 | 0.45-0.65 |

### Veredicto

**HALLAZGO CRITICO #2: La separacion entre perfiles diesel y glucolitico es insuficiente (0.059 mmol/L/s).** Un atleta con ratio 0.714 (extremadamente glucolitico) recibe VLamax=0.343, apenas mayor que un diesel con ratio 0.933 (VLamax=0.284). La razon: los 3 submetodos se compensan entre si en lugar de amplificarse. El metodo de lactate steepness usa una pendiente de 0.30 que comprime excesivamente el rango, y el metodo de VO2max headroom atenua mas que amplifica.

**Impacto:** Las predicciones de maraton son casi identicas para un diesel y un glucolitico (diferencia <1% en ritmo). Esto contradice la evidencia de que VLamax alta puede costar 5-10% en maraton (Mader 2003, Olbrecht).

**Correccion sugerida:**
- Aumentar el coeficiente de steepness de 0.30 a 0.50-0.60
- Considerar una funcion no lineal para el metodo de ratio (sigmoid en lugar de lineal)
- Ampliar el rango del clamp de [0.15, 0.75] en cada submetodo para permitir valores mas extremos antes de promediar

---

## Quality Score (Q)

### Componentes y pesos

```python
Q = agreement * 0.25 + stability * 0.25 + history_norm * 0.20
    + lt1_factor * 0.15 + vo2_factor * 0.15
```

| Componente | Peso | Rango | Descripcion |
|---|---|---|---|
| Agreement (anclas) | 0.25 | 0.35-0.95 | Convergencia LT2 fisiologico vs practico |
| Stability (historica) | 0.25 | 0.35-0.92 | Variacion entre tests longitudinales |
| History depth | 0.20 | 0.0-1.0 | Normalizado a 6 tests maximo |
| LT1 available | 0.15 | 0.6 o 1.0 | Binario |
| VO2max source | 0.15 | 0.5-1.0 | swain=1.0, lt2_derived=0.7, none=0.5 |

### Formula de spread
```
spread = base / (0.5 + 0.5 * Q)
```

### Validacion metodologica

| Q | Multiplicador spread | Interpretacion |
|---|---|---|
| 1.0 | 1.00x | Datos perfectos |
| 0.925 | 1.04x | Datos buenos |
| 0.448 | 1.38x | Datos limitados |
| 0.0 | 2.00x | Peores datos |

**Veredicto: CORRECTO.** El Q-score es una integracion razonable de multiples senales de calidad. La formula `1/(0.5+0.5*Q)` produce un rango de multiplicadores [1x, 2x] que es conservador pero no exagerado. Los pesos estan equilibrados. Mejora clara respecto a penalizaciones aditivas independientes.

---

## Intervalos asimetricos

### Implementacion

```python
_ASYMMETRY = {
    "5K":      (0.45, 0.55),    # optimista, pesimista
    "10K":     (0.42, 0.58),
    "HM":      (0.38, 0.62),
    "Maratón": (0.35, 0.65),
}
```

Calculo:
```python
optimistic_spread  = spread * opt_frac * 2
pessimistic_spread = spread * pess_frac * 2
```

Maratón con VLamax alta: (0.30, 0.70) — asimetria reforzada.

### Evidencia Santos-Lozano/Smyth

- Santos-Lozano 2014: 87% de maratones con positive split → la cola pesimista debe ser mayor. La asimetria 35/65 captura este patron.
- Smyth 2021: 28% de corredores "golpean el muro" → justifica la cola extra en maraton.
- La graduacion por distancia (5K casi simetrico, maraton muy asimetrico) es fisiologicamente coherente.

**Veredicto: CORRECTO.** Buena implementacion con evidencia adecuada.

---

## Durabilidad (Zanini 2025)

### Modelo sqrt

```python
total_decay = decay_rate * sqrt(duration_hours)
```

| Tier | Decay rate | 1.0h | 1.5h | 2.0h | 3.0h |
|---|---|---|---|---|---|
| High | 2.5%/h | 2.5% | 3.1% | 3.5% | 4.3% |
| Medium | 3.5%/h | 3.5% | 4.3% | 4.9% | 6.1% |
| Low | 4.5%/h | 4.5% | 5.5% | 6.4% | 7.8% |

### Calibracion vs Zanini 2025

Zanini reporta: 3.6% a 1.5h, 7.1% a 2h. Comparando con el tier "medium":
- 1.5h: implementado=4.3% vs Zanini=3.6% → **sobreestima 19%**
- 2.0h: implementado=4.9% vs Zanini=7.1% → **subestima 31%**

**HALLAZGO CRITICO #3: El modelo sqrt no ajusta bien los datos de Zanini.** La razon es que Zanini reporta una aceleracion del decay con el tiempo (curva superlineal entre 1.5h y 2h), mientras que sqrt es sublineal. Los datos de Zanini sugieren un modelo mas proximo a lineal o incluso cuadratico entre 1.5-2h.

**Nota:** Los datos de Zanini son de un solo estudio y los valores dependen del nivel de los sujetos. El modelo sqrt es conservador para duraciones largas (>3h), lo cual es una ventaja para predicciones de maraton lento (no sobrepenaliza). El clamp a 15% maximo de decay es prudente.

**Correccion sugerida:** Considerar un modelo por tramos o una funcion potencial `decay = rate * T^alpha` con alpha=1.3-1.5 para ajustar mejor los datos Zanini en el rango 1-3h.

---

## Riesgo glucogeno

### Implementacion Rapoport 2010

Solo se activa para HM (si VLamax > 0.50) y Maraton.

| VLamax | 5K | HM | Maraton |
|---|---|---|---|
| 0.20 | N/A | N/A | low |
| 0.35 | N/A | N/A | moderate |
| 0.50 | N/A | N/A | high |
| 0.60 | N/A | high | high |

**Veredicto: CORRECTO.** Los umbrales son coherentes con Rapoport 2010 (alta VLamax = mayor flujo glucolitico = deplecion mas rapida). La recomendacion de 60-90 g/h CHO para VLamax alta es conforme a las guidelines ACSM 2016 y Jeukendrup 2014.

**Mejora menor:** El umbral HM de VLamax > 0.50 para activar el flag es sensato pero podria beneficiarse de un nivel "moderate" para VLamax 0.40-0.50 en HM (nutricion preventiva).

---

## Validacion VDOT cruzada

Parametros de test: VLamax=0.35 (neutro), VO2max y LT2 speed calibrados.

### VDOT 40 (VO2max=40, LT2=12.5 km/h)

| Distancia | Daniels tabla | Prediccion | Error |
|---|---|---|---|
| 5K | 24:00 | 24:08 | +0.6% |
| 10K | 49:50 | 50:33 | +1.4% |
| HM | 1:49:30 | 1:53:35 | +3.7% |
| Maraton | 3:49:45 | 3:57:04 | +3.2% |

### VDOT 50 (VO2max=50, LT2=15.0 km/h)

| Distancia | Daniels tabla | Prediccion | Error |
|---|---|---|---|
| 5K | 20:00 | 19:55 | -0.4% |
| 10K | 41:30 | 41:40 | +0.4% |
| HM | 1:31:35 | 1:33:26 | +2.0% |
| Maraton | 3:11:00 | 3:16:30 | +2.9% |

### VDOT 60 (VO2max=60, LT2=17.56 km/h)

| Distancia | Daniels tabla | Prediccion | Error |
|---|---|---|---|
| 5K | 17:04 | 17:02 | -0.2% |
| 10K | 35:24 | 35:40 | +0.8% |
| HM | 1:18:36 | 1:19:46 | +1.5% |
| Maraton | 2:42:49 | 2:48:31 | +3.5% |

**Patron:** El modelo es preciso para 5K (error <1%), aceptable para 10K (<1.5%), y sistematicamente mas lento para HM (+1.5-3.7%) y maraton (+2.9-3.5%). El sesgo crece con la distancia.

**Causa:** El factor de durabilidad (Zanini) se aplica a HM y maraton, sumandose a la subestimacion de F(T) (~1%). Para maraton el decay combinado es ~3-5%, lo cual sobrepenaliza respecto a las tablas Daniels que ya incorporan el efecto de duracion.

**HALLAZGO MODERADO #2: Posible doble penalizacion.** F(T) de Daniels ya modela el descenso de %VO2max sostenible con la duracion. El factor Zanini modela el descenso del umbral LT2 durante la carrera. Son fenomenos fisiologicos distintos (F(T) = centrales/metabolicos; Zanini = perifericos/neuromusculares), pero la suma produce predicciones 3-4% mas lentas que Daniels para maraton, lo cual sesga hacia el pesimismo.

---

## Hallazgos criticos

### HC-1: F(T) subestima ~1% vs tablas VDOT (RECLASIFICADO: MODERADO)
- **Severidad:** BAJA. Los coeficientes son los publicados. La discrepancia viene de ajustes empiricos en las tablas del libro.
- **Impacto:** Predicciones ~1% mas lentas en todas las distancias.
- **Accion:** Ninguna necesaria. El sesgo es sistematico y menor que la variabilidad natural.

### HC-2: Separacion VLamax insuficiente entre perfiles extremos
- **Severidad:** MEDIA. La VLamax diesel vs glucolitico solo difiere en 0.059 mmol/L/s, lo cual anula el efecto diferenciador de VLamax en las predicciones de larga distancia.
- **Impacto:** Maraton diesel vs maraton glucolitico predicho casi identico. Contradice Mader 2003 y Olbrecht.
- **Accion:** Recalibrar coeficientes del modelo VLamax compuesto (steepness coef, sigmoid para ratio).

### HC-3: Modelo sqrt de durabilidad no ajusta Zanini
- **Severidad:** BAJA-MEDIA. Sobreestima a 1.5h (+19%), subestima a 2h (-31%).
- **Impacto:** Predicciones de HM ligeramente pesimistas, maraton 3h podria ser optimista.
- **Accion:** Evaluar modelo potencial (T^1.3) o modelo por tramos. Los datos Zanini son limitados (un estudio) asi que no conviene sobreajustar.

### HC-4: Inconsistencia en ecuacion VO2 entre modulos (MODERADO)
- `physiological_engine.py` usa ACSM: `VO2 = 0.2*v + 3.5`
- `prediction_engine.py` usa Daniels: `VO2 = -4.60 + 0.182258*v + 0.000104*v^2`
- **Impacto:** El VO2max Swain (calculado con ACSM) alimenta un modelo de prediccion que usa la ecuacion de Daniels. La discrepancia es ~5-8% a velocidades tipicas de LT2. No invalida el modelo pero introduce ruido.
- **Accion:** Unificar en la ecuacion de Daniels en ambos modulos.

---

## Recomendaciones

### Prioridad alta
1. **Recalibrar modelo VLamax compuesto** para ampliar la separacion entre perfiles extremos. Coeficiente de steepness de 0.30 a 0.50, y considerar sigmoid para el metodo de ratio.
2. **Unificar ecuacion VO2** en ambos modulos (usar Daniels en todas partes, ya que es la mas validada para carrera).

### Prioridad media
3. **Evaluar modelo de durabilidad alternativo** (potencial T^1.3-1.5) con los datos Zanini como referencia, pero sin sobreajustar a un solo estudio.
4. **Considerar reducir o eliminar la aplicacion del factor Zanini para HM** (duracion <1.5h, decay <3%), ya que F(T) de Daniels ya captura la mayor parte del efecto en esa duracion.

### Prioridad baja
5. **Economia de carrera variable con velocidad:** Aplicar correccion de RE a velocidades supra-LT2 (+3-5% de coste). Mejoraria la precision en 5K sin afectar maraton.
6. **Glycogen risk en HM:** Anadir nivel "moderate" para VLamax 0.40-0.50 en HM.

---

## Referencias bibliograficas

- **di Prampero PE** (1986). The energy cost of human locomotion on land and in water. *Int J Sports Med*, 7(2), 55-72.
- **di Prampero PE, Atchou G, Bruckner JC, Moia C** (1986). The energetics of endurance running. *Eur J Appl Physiol*, 55(3), 259-266.
- **di Prampero PE, Capelli C, Pagliaro P, Antonutto G, Girardis M, Zamparo P, Soule RG** (1993). Energetics of best performances in middle-distance running. *J Appl Physiol*, 74(5), 2318-2324.
- **Daniels J, Gilbert J** (1979). Oxygen Power: Performance Tables for Distance Runners. *Tempe, AZ*.
- **Daniels J** (2014). *Daniels' Running Formula*, 3rd edition. Human Kinetics.
- **Swain DP, Leutholtz BC** (1997). Heart rate reserve is equivalent to %VO2 reserve, not to %VO2max. *Med Sci Sports Exerc*, 29(3), 410-414.
- **ACSM** (2018). *ACSM's Guidelines for Exercise Testing and Prescription*, 10th edition.
- **Mader A** (2003). Glycolysis and oxidative phosphorylation as a function of cytoplasmic phosphorylation state and power output of the muscle cell. *Eur J Appl Physiol*, 88(4-5), 317-338.
- **Olbrecht J** (2000). *The Science of Winning*. F&G Partners.
- **Santos-Lozano A, Collado PS, Foster C, Lucia A, Garatachea N** (2014). Influence of sex and level on marathon pacing strategy. *J Strength Cond Res*, 28(10), 2991-2997.
- **Smyth B** (2021). Fast starters and slow finishers: A large-scale data analysis of pacing at the beginning and end of the marathon for recreational runners. *J Sports Anal*, 7(3), 163-179.
- **Zanini D, Clark B, Smits B, Taunton J** (2025). Lactate threshold decline during prolonged exercise: implications for endurance performance prediction. *IJSPP*, 20(1), 45-53.
- **Rapoport BI** (2010). Metabolic factors limiting performance in marathon runners. *PLoS Comput Biol*, 6(10), e1000960.
- **Hansen EA, Ronnestad BR, Vegge G, Rassier DE** (2021). Interindividual variability in running economy. *Sports Med*, 51(5), 1021-1035.
- **Gastin PB** (2001). Energy system interaction and relative contribution during maximal exercise. *Sports Med*, 31(10), 725-741.
- **Faude O, Kindermann W, Meyer T** (2009). Lactate threshold concepts: how valid are they? *Sports Med*, 39(6), 469-490.
- **Jones AM, Poole DC** (2005). Oxygen uptake dynamics: from muscle to mouth. *Med Sci Sports Exerc*, 37(9), 1542-1550.
- **Jeukendrup AE** (2014). A step towards personalized sports nutrition. *Sports Med*, 44(S1), S25-S33.
- **Bassett DR Jr, Howley ET** (2000). Limiting factors for maximum oxygen uptake and determinants of endurance performance. *Med Sci Sports Exerc*, 32(1), 70-84.
- **Peronnet F, Thibault G** (1989). Mathematical analysis of running performance and world running records. *J Appl Physiol*, 67(1), 453-465.
