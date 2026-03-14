# tri_brick_race_simulation

**Tipo:** Brick triatlon (bike->run)
**Disciplina:** Triatlon
**public_label:** "Brick simulacion de carrera bike->run"

## Descripcion

60-90' bici a potencia de prueba + T2 cronometrada + 20-40' run con 10' Z2 + bloques a ritmo objetivo.

## Dose Ladder

| Step | Descripcion | Tiempo util |
|---|---|---|
| 1 | 60' bici race pace + T2 + 10'Z2 + 10' ritmo obj | 80 min |
| 2 | 75' bici race pace + T2 + 10'Z2 + 15' ritmo obj | 100 min |
| 3 | 90' bici race pace + T2 + 5'Z2 + 20' ritmo obj | 115 min |
| 4 | 90' bici race pace + T2 + 30' ritmo obj | 120 min |

## Parametros

- **fatigue_cost:** 5
- **session_role:** key
- **compatible_block_types:** competition_specific_block

## Justificacion cientifica

Hausswirth & Mujika (2013): la fatiga cruzada bici->run penaliza 8-12% el running. Simular esto en entreno es esencial para triatlon. Complementa tri_brick_aep existente.

## Perfiles beneficiados

- P03 (Ironman): simulacion pre-competicion
- P04 (nadadora con running debil): experiencia de fatiga cruzada
