# Auditoria v1.2 — Lactate Lab

Fecha: 2026-03-15

## Contenido

### 01_auditoria_cientifica.md
Revision de 12 decisiones del sistema contra evidencia publicada 2020-2026.
Resultado: 4 items requieren atencion (VLamax proxy, TRIMP, EWMA, LT2 3.1mmol).

### 02_bateria_atletas.md
42 atletas organizados en 7 categorias cubriendo:
- 3 disciplinas puras (running, ciclismo, natacion)
- 10 triatletas con diferentes perfiles
- 7 edge cases (3 puntos, outlier brutal, curva inversa, etc.)
- 3 progresiones temporales
- 5 atletas con objetivos inalcanzables

### 03_criterios_examen.md
23 criterios de examen en 6 modulos:
- Motor de curvas (E01-E05)
- Motor dinamico (E06-E09)
- Motor fisiologico (E10-E14)
- Mesociclos (E15-E18)
- Prediccion (E19-E21)
- Coherencia cross-modulo (E22-E23)

### Test ejecutable
Ubicado en: `tests/test_simulation_battery.py`
- 60 tests
- 313/313 tests del suite completo pasan
- Tiempo de ejecucion: ~4 segundos

## Resumen de hallazgos cientificos

| Prioridad | Item | Estado |
|-----------|------|--------|
| **Alta** | VLamax proxy desde ratio LT1/LT2 | No validado empiricamente |
| **Alta** | TRIMP constantes 1.92/1.67 | Anticuado, muestra pequena |
| **Media** | EWMA CTL/ATL como predictor | Cuestionado (Imbach 2025) |
| **Media** | LT2 practico 3.1 mmol | Suboptimo como anchor universal |
| Baja | Durability t^1.5 | Fuente incierta |
| Baja | Swim TSS IF^3 | Fisicamente motivado, no validado |
| OK | LT1 +0.5 mmol | Aceptable (Faude 2009) |
| OK | ModDmax | Correcto (Bishop 1998) |
| OK | 5 zonas | Correcto (Seiler 2006) |
| OK | Daniels F(T) | Correcto |
| OK | Swain %HRR~%VO2R | Aceptable |
| OK | Olbrecht bloques | Razonable |
