# bike_z2_endurance_structured

**Tipo:** Z2 base aerobica larga
**Disciplina:** Ciclismo
**public_label:** "Fondo Z2 estructurado con checkpoints"

## Descripcion

Salida larga Z2 con checkpoints de potencia cada 30 min para verificar estabilidad y prevenir drift ascendente.

## Dose Ladder

| Step | Descripcion | Tiempo util |
|---|---|---|
| 1 | 2h Z2 con checkpoint c/30' | 120 min |
| 2 | 2h30 Z2 con checkpoint c/30' | 150 min |
| 3 | 3h Z2 | 180 min |
| 4 | 3h30 Z2 | 210 min |
| 5 | 4h Z2 con bloque final E2 20' | 240 min |

## Parametros

- **fatigue_cost:** 4
- **session_role:** key
- **compatible_block_types:** aerobic_capacity_block, competition_specific_block

## Justificacion cientifica

Los checkpoints previenen el drift ascendente comun en salidas largas (Pinot 2015). La progresion de volumen es conservadora (~20% entre peldanos).

## Perfiles beneficiados

- P02 (ciclista veterano): fondo estructurado con control de potencia
- P03 (Ironman): fondo especifico con checkpoints
- P11 (ciclista puro): base de volumen con calidad
