# run_z1_recovery_jog

**Tipo:** Z1/Z2 recuperacion activa
**Disciplina:** Running
**public_label:** "Rodaje Z1 regenerativo con movilidad"

## Descripcion

Rodaje muy suave (Z1) de 25-40 min con pausas de movilidad dinamica integradas cada 10 min.

## Dose Ladder

| Step | Descripcion | Tiempo util |
|---|---|---|
| 1 | 25' Z1 + 2x movilidad | 25 min |
| 2 | 30' Z1 + 2x movilidad | 30 min |
| 3 | 35' Z1 + 3x movilidad | 35 min |
| 4 | 40' Z1 continuo | 40 min |

## Parametros

- **fatigue_cost:** 1
- **session_role:** recovery
- **compatible_block_types:** recovery_consolidation_block, aerobic_capacity_block

## Justificacion cientifica

La intercalacion de movilidad en rodajes suaves mejora la adherencia y reduce la monotonia (Foster monotony principle). El volumen es insuficiente para estimulo aerobico real, pero mantiene la continuidad de carrera.

## Perfiles beneficiados

- P01 (principiante): rodaje suave con pausas
- P08 (masters): recovery con movilidad integrada
- P10 (post-lesion): reintegracion progresiva
