# bike_torque_pyramid

**Tipo:** Fuerza especifica endurance (ciclismo)
**Disciplina:** Ciclismo
**public_label:** "Torque piramidal baja cadencia"

## Descripcion

Piramide de cadencia baja: 30''-1'-2'-3'-2'-1'-30'' a potencia LT1-LT2, cadencia 50-60rpm. Seguido de 5' cadencia alta 100rpm.

## Dose Ladder

| Step | Descripcion | Tiempo util |
|---|---|---|
| 1 | 2 piramides + 5' spin | 18 min |
| 2 | 3 piramides + 5' spin | 24 min |
| 3 | 3 piramides con 3' a 50rpm + 5' spin | 30 min |
| 4 | 4 piramides + 5' spin | 32 min |

## Parametros

- **fatigue_cost:** 4
- **session_role:** key
- **compatible_block_types:** threshold_development_block, aerobic_power_block

## Justificacion cientifica

Ronnestad (2022): la fuerza pesada secuenciada mejora sprint y fuerza en ciclistas. La alternancia cadencia baja/alta es patron del CSV de Nacho (bike_lt2_torque_reps).

## Perfiles beneficiados

- P02 (ciclista veterano): fuerza especifica en bici
- P07 (ciclista -> triatleta): mantener fuerza ciclismo
- P11 (ciclista puro): variedad en sesiones de torque
