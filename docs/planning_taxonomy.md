# Taxonomía Canónica de Planificación

## Objetivo

Esta capa evita exponer en producto la nomenclatura privada o reconocible de un entrenador concreto.

La app separa siempre:

- `raw_title`: nombre original importado
- `canonical_session_type`: categoría interna estable
- `public_label`: etiqueta limpia visible al usuario
- `block_type_hint`: tipo de bloque sugerido para planificación

## Principios

1. La taxonomía no copia el lenguaje del entrenador.
2. La clasificación es fisiológica y operativa, no cosmética.
3. Una sesión puede ser mixta si combina más de un objetivo dominante.
4. Los tests son puntos de decisión de bloque, no sesiones normales.
5. Técnica y fuerza existen como módulos de soporte, no como ruido.

## Tipos canónicos de sesión

### `test_aerobic_profile`

- visible: `Test aeróbico de perfil`
- uso: test de lactato, perfil aeróbico, incremental, CSS, evaluación de umbral
- rol: decidir el siguiente bloque

### `test_anaerobic_profile`

- visible: `Test anaeróbico de perfil`
- uso: glyc profile, torque test, capacidad glicolítica
- rol: ajustar el equilibrio capacidad/power

### `technical_assessment`

- visible: `Evaluación técnica`
- uso: revisión técnica con vídeo o skill diagnosis
- rol: corregir limitantes antes de escalar carga

### `aerobic_capacity_easy`

- visible: `Capacidad aeróbica extensiva`
- uso: rodajes suaves, AR, D1, fondo fácil
- rol: construir base

### `lt1_extensive`

- visible: `Trabajo LT1 extensivo`
- uso: bloques largos y sostenibles alrededor de LT1
- rol: ampliar estabilidad subumbral

### `lt2_extensive`

- visible: `Trabajo LT2`
- uso: tempos, extensivos LT2, trabajos sostenidos de umbral alto
- rol: acercarse a potencia/ritmo específico sostenible

### `vo2_power`

- visible: `Potencia aeróbica`
- uso: VO2, 30-30, repeticiones muy intensas
- rol: empujar la parte alta del sistema aeróbico

### `anaerobic_capacity`

- visible: `Capacidad anaeróbica`
- uso: glycolytic capacity, sprint, torque, neuromuscular breve
- rol: soporte específico y modulación anaeróbica

### `strength_support`

- visible: `Fuerza de soporte`
- uso: gimnasio, fuerza general, fuerza específica
- rol: sostener la expresión del bloque principal

### `technique_skill`

- visible: `Técnica y skill`
- uso: drills, snorkel, pull, ejercicios técnicos
- rol: mejorar economía y mecánica

### `recovery_regeneration`

- visible: `Recuperación y regeneración`
- uso: descanso, movilidad, sesiones muy ligeras
- rol: facilitar supercompensación

### `competition_specific`

- visible: `Trabajo específico de competición`
- uso: half pace, race pace, transiciones, ritmo objetivo
- rol: transferir la base a la prueba

### `mixed_session`

- visible: `Sesión mixta`
- uso: mezcla clara de LT1/LT2/VO2 u otros focos
- rol: leer la sesión dentro del mesociclo, no de forma aislada

## Tipos canónicos de bloque

- `aerobic_capacity_block`
- `threshold_development_block`
- `aerobic_power_block`
- `glycolytic_support_block`
- `technical_rebuild_block`
- `recovery_consolidation_block`
- `testing_decision_block`
- `competition_specific_block`

## Traducción a lógica Olbrecht

La taxonomía está pensada para poder construir mesociclos al estilo Olbrecht:

- capacidad antes de especificidad
- testing como punto de decisión
- semanas de trabajo seguidas de descarga
- disciplina débil o limitante como prioridad real
- equilibrio entre capacidad aeróbica y componente anaeróbico, no maximización indiscriminada

## Uso futuro en la app

Esta capa debe alimentar:

1. importación y normalización de sesiones
2. detección de bloques históricos
3. recomendador de mesociclo
4. constructor de microciclos
5. visualización limpia para entrenador y atleta

## Detección de mesociclos

El detector de mesociclos vive en:

- [`backend/app/services/mesocycle_detector.py`](/Users/davidsabatfernandez/Documents/New project/backend/app/services/mesocycle_detector.py)

La lógica actual es conservadora y explicable:

1. clasifica cada sesión con la taxonomía canónica
2. resume por semanas naturales
3. detecta la identidad dominante de cada semana
4. abre un nuevo mesociclo cuando aparece:
   - una semana de test
   - una semana de recuperación seguida de trabajo
   - un cambio claro de fase dominante

La salida no pretende ser verdad absoluta. Pretende reconstruir la intención del plan con una confianza razonable y dejar rastro de por qué se ha clasificado así.
