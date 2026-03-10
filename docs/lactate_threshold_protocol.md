# Protocolo operativo del motor LT1/LT2

## Objetivo

Definir un motor de umbrales estable, interpretable y robusto con poca y mucha información, evitando que una sesión aislada o una curva ruidosa desplace de forma exagerada la carga externa objetivo del atleta.

## Anclajes del motor

- `LT1 fisiológico`: carga externa asociada a `2.0 mmol/L`
- `LT2 fisiológico`: carga externa asociada a `4.0 mmol/L`
- `LT1 práctico`: carga externa asociada a `1.65 mmol/L`
- `LT2 práctico`: carga externa asociada a `3.1 mmol/L`

Los anclajes de lactato se mantienen fijos. La inteligencia del motor no consiste en mover el mmol del umbral, sino en aprender con más precisión la carga externa y la respuesta interna asociadas a esos anclajes:

- ritmo
- frecuencia cardiaca
- potencia
- W/kg
- cadencia contextual en ciclismo

## Justificación fisiológica y práctica

- Las referencias fijas de lactato tienen buena fiabilidad test-retest en velocidad, VO2 y FC, especialmente en el entorno de `2.0`, `2.5` y `4.0 mmol/L`.
- El área de `~2.0 mmol/L` es una referencia clásica útil para el primer umbral o transición aeróbica.
- `4.0 mmol/L` es útil como ancla fisiológica para el segundo umbral, pero no se trata como representación universal exacta del MLSS.
- El entorno de `~3.0 mmol/L` es una referencia operativa sensata para trabajo umbral prolongado; por eso el motor fija `LT2 práctico` en `3.1 mmol/L`.

## Principio de cálculo

Para cada ancla, el motor estima la carga externa correspondiente mediante interpolación y regresión robusta sobre muestras reales del atleta.

No se sustituye el lactato medido por un lactato "corregido". El valor medido se conserva como base del modelo y el contexto entra como peso de la muestra.

## Cómo entra una muestra nueva

Cada muestra recibe un peso compuesto según:

- calidad del protocolo
- retraso de muestra
- duración del bloque
- duración del descanso
- densidad de la sesión
- tipo de sesión
- propósito del intervalo
- recencia
- similitud con el foco del trabajo

En ciclismo se añaden:

- `power_source` aislado:
  - `outdoor`
  - `indoor`
- `cadence_band` como contexto

## Regla de robustez

Un dato aislado no puede reescribir el modelo. La actualización se hace con ponderación robusta:

- los datos nuevos empujan la estimación
- el histórico mantiene inercia
- los outliers bajan de peso

Esto evita errores típicos:

- una curva ruidosa que arrastra LT1
- una sesión muy densa que parece peor de lo real
- una muestra tardía que parece más baja o más alta
- cambios bruscos por una única sesión

## Modos del motor

### Sparse mode

Se activa con muy pocas muestras útiles o cuando la dispersión es alta.

Comportamiento:

- se siguen mostrando referencias
- se marcan como provisionales
- el peso del histórico es muy alto
- la confianza baja de forma visible

### Standard mode

Se activa cuando ya existe una base razonable de puntos comparables.

Comportamiento:

- el modelo aprende la carga externa con mayor precisión
- los cambios recientes tienen más influencia
- se mantiene amortiguación frente a sesiones aisladas

### High-confidence mode

Se activa cuando hay suficiente volumen, repetición y coherencia histórica.

Comportamiento:

- mayor precisión en ritmo, potencia y FC asociados
- tendencia más estable
- mejor lectura del bloque y del foco del mesociclo

## Ciclismo: aislamiento por potenciómetro

Los datos de ciclismo se tratan por separado según el origen de potencia:

- `potenciómetro de a pie` / `outdoor`
- `potenciómetro de interior` / `indoor`

No se cruzan:

- `LT1 fisiológico outdoor`
- `LT1 fisiológico indoor`
- `LT2 fisiológico outdoor`
- `LT2 fisiológico indoor`
- `LT1 práctico outdoor`
- `LT1 práctico indoor`
- `LT2 práctico outdoor`
- `LT2 práctico indoor`

La cadencia no redefine el anclaje, pero sí modifica el peso y la interpretación práctica del dato.

## Qué debe mostrar la UI

- `LT1 fisiológico`
- `LT2 fisiológico`
- `LT1 práctico`
- `LT2 práctico`
- confianza
- explicación breve del anclaje usado
- aviso de lectura provisional cuando falte base

Con poca información:

- la gráfica sigue mostrándose
- las líneas pueden ser provisionales
- el sistema debe explicar que la base es real pero todavía escasa

## Interpretación operativa

- `LT1 fisiológico` y `LT2 fisiológico` sirven como referencias de laboratorio/campo ancladas en lactato.
- `LT1 práctico` y `LT2 práctico` sirven como referencias de prescripción y control de sesiones.
- La evolución se evalúa sobre la carga externa asociada a cada ancla, no sobre cambios arbitrarios del mmol del umbral.

## Fallos a evitar

- Promediar métodos incompatibles para LT1 cuando la curva es corta o ruidosa.
- Mezclar indoor y outdoor en ciclismo.
- Tratar un `6x4` como equivalente fisiológico a un `2x20`.
- Dejar que una única medición rompa la tendencia.
- Presentar una lectura provisional como si fuera un umbral consolidado.
