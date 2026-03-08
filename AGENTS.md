# AGENTS.md

## Proyecto

Lactate Lab es una plataforma full-stack para análisis de lactato en sangre aplicado a deportes de resistencia. El sistema combina:

- backend `FastAPI + SQLAlchemy + Alembic + Pydantic`
- frontend `React + TypeScript + Vite`
- base de datos `SQLite` en desarrollo y `PostgreSQL` en producción
- motor analítico fisiológico explicable, no caja negra

El objetivo del producto no es solo guardar datos, sino interpretar el significado fisiológico del lactato según contexto de sesión, disciplina e histórico individual del atleta.

## Estructura del repositorio

```text
backend/
  app/
    api/routes/         # endpoints REST
    core/               # config y seguridad
    db/                 # sesión y base ORM
    models/             # modelos SQLAlchemy
    schemas/            # contratos Pydantic
    services/           # lógica de negocio y analítica
  alembic/              # migraciones
  tests/                # tests backend
  seed.py               # datos demo

frontend/
  src/
    components/         # UI reusable
    pages/              # vistas principales
    lib/                # API client y utilidades
    types.ts            # contratos TS del frontend
```

## Principios del proyecto

### 1. Interpretabilidad primero

Toda lógica fisiológica debe ser:

- explicable
- trazable
- auditable
- incremental

Evitar enfoques tipo caja negra salvo que se añadan en el futuro como capa opcional y separada.

### 2. El lactato nunca se interpreta aislado

La arquitectura del motor debe mantener esta premisa:

> un mismo valor de lactato puede significar cosas distintas según duración, descanso, disciplina, densidad de sesión, orden del bloque, retraso de muestra e histórico del atleta

No introducir reglas fisiológicas agresivas, arbitrarias o difíciles de justificar.

### 3. Extensibilidad sin romper contratos

Los cambios futuros deben:

- preservar los endpoints existentes siempre que sea posible
- añadir campos de salida en vez de redefinirlos de forma incompatible
- mantener separación entre datos crudos, métricas derivadas e interpretación

## Reglas de desarrollo backend

### Arquitectura

- `models/`: solo persistencia y relaciones ORM
- `schemas/`: validación de entrada/salida
- `api/routes/`: transporte HTTP, errores y wiring
- `services/`: lógica real de dominio, analítica, importación y cálculo

No meter lógica analítica compleja dentro de rutas ni dentro de modelos SQLAlchemy.

### Analítica

La lógica fisiológica principal vive en:

- `backend/app/services/analytics.py`

La importación masiva vive en:

- `backend/app/services/importer.py`

Si se añaden nuevos métodos analíticos:

1. implementarlos como funciones separadas y pequeñas
2. devolver siempre explicación y confidence
3. integrarlos en una capa agregadora, no sustituir el motor completo
4. guardar en payload qué método produjo qué resultado

### Nuevos métodos LT1/LT2

Todo nuevo método debe devolver como mínimo:

- nombre del umbral
- método usado
- lactato asociado
- ritmo y/o potencia
- FC asociada si existe
- confidence
- explicación textual

Si se añade un método nuevo, debe conectarse a la comparación de métodos existente en vez de desplazar sin más a los previos.

### Contextualización del lactato

Mantener el algoritmo conservador.

Siempre documentar:

- variables de entrada usadas
- ajustes aplicados
- rango máximo de ajuste permitido
- por qué la confianza sube o baja

No introducir transformaciones no acotadas ni factores multiplicativos extremos.

### Longitudinal

La capa longitudinal debe seguir siendo explicable:

- medias ponderadas
- comparaciones snapshot a snapshot
- anclas fisiológicas repetibles
- dirección de tendencia con umbrales claros

Si se incorporan modelos más avanzados, deben convivir como una estrategia adicional y dejar rastro del método.

### Importación

Para importadores futuros:

- primero `preview`
- luego `commit`
- validar antes de persistir
- no importar parcialmente si hay errores severos
- agrupar filas de forma determinista

No asumir formatos cerrados. Siempre mapear columnas explícitamente.

### Autenticación

Actualmente es simple y suficiente para desarrollo/demo.

Si se cambia:

- no romper login demo sin motivo
- evitar dependencias frágiles para hashing
- priorizar compatibilidad local sencilla

## Reglas de desarrollo frontend

### Objetivo UX

La UI está orientada a entrenador y análisis profesional. Debe ser:

- clara
- rápida
- legible
- informativa
- sin ruido visual

### Estructura

- `pages/`: composición principal por vista
- `components/`: piezas reutilizables
- `types.ts`: fuente de verdad de contratos frontend

Si cambia una respuesta API:

1. actualizar schema backend
2. actualizar `frontend/src/types.ts`
3. actualizar consumo en componentes afectados

### Presentación analítica

Las vistas deben seguir mostrando estas capas por separado:

- dato
- interpretación
- confianza
- evolución histórica

No mezclar métricas crudas con conclusiones en el mismo bloque sin etiquetado claro.

### Importación masiva

La pantalla de importación debe conservar:

- selección de archivo
- sugerencia de mapeo
- revalidación manual
- preview de filas
- lista de errores
- confirmación explícita antes de importar

## Base de datos y migraciones

- Toda modificación persistente de esquema requiere migración Alembic
- No editar la base SQLite manualmente como mecanismo normal de cambio
- Mantener índices coherentes con consultas frecuentes

Si se añade una tabla nueva relacionada con analítica:

- definir relación con atleta o sesión
- guardar `confidence` cuando aplique
- guardar `payload` JSON cuando el cálculo tenga contexto adicional

## Convenciones de datos

### Unidades

Usar de forma consistente:

- lactato: `mmol/L`
- ritmo: `s/km`
- potencia: `W`
- FC: `bpm`
- peso: `kg`
- duración/descanso/retraso de muestra: `seconds`

Evitar mezclar minutos, strings y segundos en persistencia interna. Convertir a segundos al entrar.

### Fechas

- Persistir `performed_at` como `datetime`
- snapshots como `date`
- en importación, normalizar formatos antes de validar

## Tests

Cada ampliación relevante debería traer:

- al menos un test backend del endpoint afectado
- si toca analítica, al menos un test del comportamiento esperado
- si toca importación, tests de preview y commit

Priorizar tests sobre:

- regresiones de mapeo
- validación de columnas
- confianza de resultados
- existencia de campos clave de salida

## Datos demo

`seed.py` debe seguir permitiendo:

- login demo funcional
- atletas de running, ciclismo y triatlón
- sesiones con contexto suficiente para mostrar diferencias fisiológicas

Si se amplía el seed:

- mantener realismo
- no añadir datos aleatorios incoherentes
- asegurar que la demo sigue siendo útil para UI y analítica

## Checklist antes de cerrar cambios

Antes de dar una tarea por terminada:

1. revisar si cambió contrato API
2. revisar si cambió `frontend/src/types.ts`
3. validar sintaxis Python
4. ejecutar tests backend si el entorno lo permite
5. comprobar que la demo no queda rota
6. documentar cualquier limitación real encontrada

## Comandos útiles

### Backend

```bash
cd "/Users/davidsabatfernandez/Documents/New project/backend"
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -m alembic upgrade head
python3 seed.py
python3 -m uvicorn app.main:app --reload
```

### Frontend

```bash
cd "/Users/davidsabatfernandez/Documents/New project/frontend"
npm install
npm run dev
```

### Tests backend

```bash
cd "/Users/davidsabatfernandez/Documents/New project/backend"
source .venv/bin/activate
python3 -m pytest tests -q
```

## Decisiones explícitas ya tomadas

- hashing local simplificado con `pbkdf2_sha256` para evitar problemas de compatibilidad con `bcrypt`
- motor analítico híbrido explicable
- comparación de múltiples métodos LT1/LT2
- predicciones con intervalo de confianza y nivel de evidencia
- importación masiva con `preview` y `commit`

## Qué no hacer

- no meter lógica analítica nueva directamente en las rutas
- no devolver solo un número sin explicación y confidence
- no usar reglas fisiológicas extremas o no justificadas
- no romper los datos demo
- no asumir que CSV y Excel traerán las columnas exactas esperadas
- no acoplar frontend a respuestas implícitas o sin tipado

## Mejoras futuras esperadas

Direcciones válidas para el proyecto:

- informes PDF exportables
- comparativas temporales más ricas
- creación automática opcional de atletas al importar
- plantillas descargables de CSV/XLSX
- motor longitudinal con mayor robustez estadística
- ML explicable como capa opcional, nunca como reemplazo opaco del motor base
