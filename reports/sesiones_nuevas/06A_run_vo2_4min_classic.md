# run_vo2_4min_classic

**Tipo:** Z5 VO2max intervalos largos
**Disciplina:** Running
**public_label:** "VO2 clasico 4x4' (Wisloff)"

## Descripcion

El formato clasico 4x4' a 90-95% HRmax con 3' recuperacion activa. Referencia de la literatura noruega.

## Dose Ladder

| Step | Descripcion | Tiempo util |
|---|---|---|
| 1 | 3x4' VO2 D:3' | 12 min |
| 2 | 4x4' VO2 D:3' | 16 min |
| 3 | 4x4' VO2 D:2'30'' | 16 min (mas denso) |
| 4 | 5x4' VO2 D:3' | 20 min |
| 5 | 4x5' VO2 D:3' | 20 min |

## Parametros

- **fatigue_cost:** 5
- **session_role:** key
- **compatible_block_types:** aerobic_power_block

## Justificacion cientifica

4x4min es el formato mas estudiado en la literatura (Wisloff 2007, Helgerud 2007). T@VO2max >12 min en formato optimo. Complementa run_vo2_hills que es mas neuromuscular.

## Perfiles beneficiados

- P05 (estancamiento): estimulo clasico VO2max
- P03 (Ironman): potencia aerobica para competicion larga
- P08 (masters): formato conocido y seguro
