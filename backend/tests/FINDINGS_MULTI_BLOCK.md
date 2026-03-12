# Hallazgos del test agent multi-bloque

Fecha: 2026-03-12

## Resumen
17 atletas dispares simulados, 19 tests total (17 multi-bloque + 2 edge cases).
**17 passed, 2 failed** — los fallos son bugs reales del motor.

## BUG 1: ANP sin límite de repetición (CRÍTICO)

**Regla violada**: Olbrecht SoW: "ANP training should not exceed 2 consecutive weeks"

**Qué pasa**: Cuando el atleta tiene gap negativo (ya supera el objetivo) en pre_comp
y la prueba está en `_ANP_EVENTS`, el motor sigue prescribiendo ANP indefinidamente.
No hay un mecanismo para saltar a COMP tras 2 bloques ANP.

**Atletas afectados**:
- Maria (recreational 10k): 3 ANP seguidos en pre_comp con gap -0.77 a -1.03
- Sergio (competitive road race): 3 ANP seguidos

**Fix propuesto**: En `analyse_physiological_gap()`, añadir historial de bloques
recientes. Si el atleta ya ha hecho 2 bloques ANP → forzar COMP.
Alternativa: el motor no tiene acceso al historial — implementar en `planning_engine.py`
como guardrail post-selección.

## BUG 2: Estancamiento en AEC (WARNING)

**Regla violada**: El motor no progresa de AEC a THR cuando el gap LT1 se cierra
pero LT2 sigue siendo el limitante.

**Qué pasa**: En atletas con LT1 como limitante principal (ironman, HM),
el motor prescribe AEC repetidamente porque el LT1 gap nunca baja lo suficiente
para que la lógica salte a THR. Esto ocurre porque:
1. La adaptación simulada de AEC mueve LT1 un 12% del gap por bloque
2. Pero los LT1_RACE_FACTOR son muy exigentes (especialmente ironman: 0.90 trained)
3. El gap nunca cruza el umbral de "LT1 acompaña" para permitir THR

**Atletas afectados**:
- Carlos (trained HM): 5 AEC seguidos — gap LT1 pasa de 3.2 a 1.25 pero nunca baja lo suficiente
- Raul (trained ironman_run): 6 AEC seguidos

**Fix propuesto**:
1. Después de 3+ bloques AEC consecutivos, relajar el threshold de "LT1 acompaña"
2. O implementar un "diminishing returns" guardrail: si el gap no mejora >X% en 2 bloques, cambiar de estrategia

## Hallazgos positivos

1. **Sequencing correcto en la mayoría de casos**:
   - Javi (diesel 5k): THR → THR → ANP → COMP (perfecto)
   - Elena (VLamax alta 10k): THR → THR → AEP → ANP → ANP → COMP (perfecto)
   - Pedro (competitive 5k ya en rango): ANP → ANP → COMP (correcto)
   - Miguel (taper 2s): COMP directo (correcto)

2. **BLa checks**: Presentes en todos los bloques ≥3 semanas

3. **Técnica natación**: technique_context presente en todas las sesiones de natación

4. **Objective inalcanzable**: Motor se mantiene conservador (AEC) para Laura (recreational con objetivo de sub-3h maratón)

5. **Test stale**: testing_decision_block correctamente disparado con test >56d en pre_comp

6. **Taper**: Siempre recomienda COMP en ≤3 semanas (R7 nunca violada)

7. **base_early → AEC**: Siempre respetado (R1 nunca violada)

8. **ANC gate**: Nunca se activa ANC en base_early (R3 nunca violada)

## Secuencias representativas

| Atleta | Journey | Resultado |
|--------|---------|-----------|
| Maria 10k rec | AEC→THR→THR→AEP→COMP→ANP→ANP→**ANP** | BUG: 3 ANP |
| Carlos HM trained | AEC→AEC→AEC→AEC→AEC | WARNING: estancamiento |
| Javi 5k diesel | THR→THR→ANP→COMP | Perfecto |
| Pedro 5k comp | ANP→ANP→COMP | Correcto |
| Elena 10k VLamax alta | THR→THR→AEP→ANP→ANP→COMP | Excelente |
| David TT ciclista | THR→AEP→COMP→ANP→ANP→COMP | Correcto |
| Raul ironman_run | AEC×6→COMP | WARNING: estancamiento |
