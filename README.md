# Lactate Lab

Plataforma full-stack para registrar, analizar e interpretar datos de lactato en deportes de resistencia. La primera entrega deja Fase 1 y Fase 2 operativas:

- CRUD de atletas, sesiones, intervalos y muestras.
- Dashboard con alertas, evolución y últimos tests.
- Motor analítico explicable para curva de lactato, LT1, LT2, contextualización del lactato y estimaciones iniciales.
- Frontend React responsive para entrenador.
- Datos demo realistas para running, ciclismo y triatlón.

## Estructura

```text
.
├── backend
│   ├── alembic
│   ├── app
│   ├── tests
│   └── seed.py
├── frontend
│   ├── src
│   └── public
├── docker-compose.yml
└── .env.example
```

## Stack

- Frontend: React + TypeScript + Vite + Recharts
- Backend: FastAPI + SQLAlchemy + Alembic + Pydantic
- DB: SQLite en desarrollo, PostgreSQL en producción
- Auth: JWT simple con roles `coach` y `athlete`

## Arranque local

1. Copia variables:

```bash
cp .env.example .env
```

2. Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python seed.py
uvicorn app.main:app --reload
```

3. Frontend:

```bash
cd frontend
npm install
npm run dev
```

4. Abre:

- Frontend: [http://localhost:5173](http://localhost:5173)
- API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

## Docker

```bash
docker-compose up --build
```

## Usuario demo

- `coach@lactatelab.dev`
- `demo1234`

## Qué implementa el motor analítico

- Curvas lactato vs ritmo, potencia y frecuencia cardiaca.
- Suavizado simple por media móvil local.
- Detección heurística de LT1 y LT2 con trazabilidad del método y confianza.
- `Contextual Lactate Score` que ajusta lactato según duración, descanso, tiempo de toma de muestra, densidad y disciplina.
- Tendencias longitudinales por atleta ponderando más lo reciente.
- Estimaciones de zonas, VO2max, FTP y rendimiento 5K/10K/HM/Maratón con intervalo de confianza y fiabilidad.

## Ejemplos de uso

- Crear atleta: `POST /api/athletes`
- Crear sesión con intervalos: `POST /api/sessions`
- Recalcular análisis del atleta: `POST /api/athletes/{athlete_id}/recalculate`
- Ver análisis completo: `GET /api/athletes/{athlete_id}/analysis`
- Comparar dos sesiones: `GET /api/analytics/compare?session_a=1&session_b=4`

## Decisiones analíticas

- El lactato nunca se interpreta aislado; cada muestra se ajusta con factores contextuales trazables.
- LT1 y LT2 se estiman con reglas fisiológicas explicables, no con caja negra.
- Las tendencias longitudinales usan medias ponderadas y comparación contra snapshots previos.
- Las estimaciones de rendimiento se degradan en confianza cuando faltan datos o la coherencia histórica es baja.

## TODOs

- Informes PDF exportables.
- Comparativas avanzadas multiatleta.
- Machine learning explicable opcional por atleta.
- Mejoras de auth, permisos finos y auditoría.
- Importación CSV/Excel de analizadores de lactato y plataformas como TrainingPeaks o Garmin.

