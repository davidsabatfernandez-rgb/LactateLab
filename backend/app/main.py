from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analytics, athlete_health, athletes, auth, garmin, planning, reports, science_advisor, sessions, strava, training_load
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(athletes.router, prefix=settings.api_prefix)
app.include_router(sessions.router, prefix=settings.api_prefix)
app.include_router(analytics.router, prefix=settings.api_prefix)
app.include_router(planning.router, prefix=settings.api_prefix)
app.include_router(reports.router, prefix=settings.api_prefix)
app.include_router(strava.router, prefix=settings.api_prefix)
app.include_router(garmin.router, prefix=settings.api_prefix)
app.include_router(athlete_health.router, prefix=settings.api_prefix)
app.include_router(training_load.router, prefix=settings.api_prefix)
app.include_router(science_advisor.router, prefix=settings.api_prefix)


@app.get("/")
def root():
    return {"name": settings.app_name, "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
