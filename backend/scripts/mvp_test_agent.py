#!/usr/bin/env python3
"""MVP Test Agent — Simulates a real athlete's full journey through PeakAerobic.

Usage:
    python scripts/mvp_test_agent.py [--base-url https://api.peakaerobic.com/api]

Creates a test athlete, adds sessions with lactate data, tests all major flows,
and reports weaknesses / issues found.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date, timedelta
from typing import Any

import httpx

# ═══════════════════════════════════════════════════════════════════════════════
# Config
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_BASE = "https://api.peakaerobic.com/api"
TEST_EMAIL = "athlete@lactatelab.dev"
TEST_PASSWORD = "demo1234"
TIMEOUT = 60.0


class TestResult:
    def __init__(self):
        self.passed: list[str] = []
        self.failed: list[tuple[str, str]] = []
        self.warnings: list[tuple[str, str]] = []

    def ok(self, name: str):
        self.passed.append(name)
        print(f"  ✅ {name}")

    def fail(self, name: str, reason: str):
        self.failed.append((name, reason))
        print(f"  ❌ {name}: {reason}")

    def warn(self, name: str, reason: str):
        self.warnings.append((name, reason))
        print(f"  ⚠️  {name}: {reason}")

    def summary(self):
        print(f"\n{'═' * 60}")
        print(f"  RESULTADOS MVP TEST AGENT")
        print(f"{'═' * 60}")
        print(f"  ✅ Pasados: {len(self.passed)}")
        print(f"  ❌ Fallidos: {len(self.failed)}")
        print(f"  ⚠️  Avisos: {len(self.warnings)}")
        if self.failed:
            print(f"\n  FALLOS:")
            for name, reason in self.failed:
                print(f"    ❌ {name}: {reason}")
        if self.warnings:
            print(f"\n  AVISOS:")
            for name, reason in self.warnings:
                print(f"    ⚠️  {name}: {reason}")
        print(f"{'═' * 60}\n")
        return len(self.failed) == 0


# ═══════════════════════════════════════════════════════════════════════════════
# HTTP helpers
# ═══════════════════════════════════════════════════════════════════════════════

class APIClient:
    def __init__(self, base_url: str):
        self.base = base_url.rstrip("/")
        self.client = httpx.Client(timeout=TIMEOUT)
        self.token: str | None = None
        self.athlete_id: int | None = None
        self.user_id: int | None = None

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def get(self, path: str) -> httpx.Response:
        return self.client.get(f"{self.base}{path}", headers=self._headers())

    def post(self, path: str, body: dict | None = None) -> httpx.Response:
        return self.client.post(f"{self.base}{path}", headers=self._headers(), json=body or {})

    def patch(self, path: str, body: dict) -> httpx.Response:
        return self.client.patch(f"{self.base}{path}", headers=self._headers(), json=body)

    def delete(self, path: str) -> httpx.Response:
        return self.client.delete(f"{self.base}{path}", headers=self._headers())


# ═══════════════════════════════════════════════════════════════════════════════
# Test flows
# ═══════════════════════════════════════════════════════════════════════════════

def test_registration(api: APIClient, r: TestResult, email: str = "", password: str = ""):
    print("\n🏃 1. LOGIN")

    resp = api.post("/auth/login", {"email": email, "password": password})
    if resp.status_code == 200:
        api.token = resp.json().get("access_token")
        r.ok("Login OK")
    else:
        r.fail("Login", f"Status {resp.status_code}")
        return False

    # Get me
    resp = api.get("/auth/me")
    if resp.status_code == 200:
        me = resp.json()
        api.athlete_id = me.get("athlete_id")
        api.user_id = me.get("id")
        if api.athlete_id:
            r.ok(f"Auth/me → athlete_id={api.athlete_id}")
        else:
            r.fail("Auth/me", "athlete_id es null")
            return False
    else:
        r.fail("Auth/me", f"Status {resp.status_code}")
        return False

    return True


def test_athlete_profile(api: APIClient, r: TestResult):
    print("\n👤 2. PERFIL ATLETA")

    # Update profile
    resp = api.patch(f"/athletes/{api.athlete_id}", {
        "name": "MVP Test Athlete",
        "primary_discipline": "running",
        "weight": 75.0,
        "sex": "male",
        "training_goal": "Mejorar maratón sub-3:30",
        "athlete_level": "trained",
    })
    if resp.status_code == 200:
        r.ok("Actualizar perfil")
    else:
        r.fail("Actualizar perfil", f"Status {resp.status_code}: {resp.text[:200]}")

    # Set physiological data (FC Max, FTP, CSS)
    resp = api.patch(f"/athletes/{api.athlete_id}", {
        "training_hr_max": 188,
        "ftp_cycling_watts": 245,
        "css_swimming_pace": 105,  # 1:45/100m
    })
    if resp.status_code == 200:
        r.ok("Guardar FC Max + FTP + CSS")
    else:
        r.fail("Guardar FC Max + FTP + CSS", f"Status {resp.status_code}: {resp.text[:200]}")

    # Verify saved
    resp = api.get(f"/athletes/{api.athlete_id}")
    if resp.status_code == 200:
        ath = resp.json()
        if ath.get("training_hr_max") == 188:
            r.ok("FC Max persistida correctamente")
        else:
            r.fail("FC Max persistida", f"Esperado 188, got {ath.get('training_hr_max')}")
        if ath.get("ftp_cycling_watts") == 245:
            r.ok("FTP persistido correctamente")
        else:
            r.fail("FTP persistido", f"Esperado 245, got {ath.get('ftp_cycling_watts')}")
        if ath.get("css_swimming_pace") == 105:
            r.ok("CSS persistido correctamente")
        else:
            r.warn("CSS persistido", f"Esperado 105, got {ath.get('css_swimming_pace')}")


def test_incremental_test(api: APIClient, r: TestResult):
    print("\n🔬 3. TEST INCREMENTAL DE LACTATO")

    today = date.today()
    session_data = {
        "athlete_id": api.athlete_id,
        "performed_at": f"{today}T09:00:00",
        "discipline": "running",
        "session_type": "test incremental",
        "goal": "test",
        "notes": "Test incremental running 7 escalones",
        "intervals": [
            {"order_index": 1, "purpose": "work", "pace_seconds_per_km": 360, "heart_rate_avg": 130, "duration_seconds": 240, "rest_seconds": 60, "cadence": 168,
             "lactate_sample": {"lactate_mmol": 1.2, "baseline_lactate": 1.0, "sample_delay_seconds": 30, "sample_timing_label": "end_of_step"}},
            {"order_index": 2, "purpose": "work", "pace_seconds_per_km": 330, "heart_rate_avg": 142, "duration_seconds": 240, "rest_seconds": 60, "cadence": 172,
             "lactate_sample": {"lactate_mmol": 1.4, "baseline_lactate": 1.0, "sample_delay_seconds": 30, "sample_timing_label": "end_of_step"}},
            {"order_index": 3, "purpose": "work", "pace_seconds_per_km": 300, "heart_rate_avg": 155, "duration_seconds": 240, "rest_seconds": 60, "cadence": 176,
             "lactate_sample": {"lactate_mmol": 1.9, "baseline_lactate": 1.0, "sample_delay_seconds": 30, "sample_timing_label": "end_of_step"}},
            {"order_index": 4, "purpose": "work", "pace_seconds_per_km": 280, "heart_rate_avg": 163, "duration_seconds": 240, "rest_seconds": 60, "cadence": 180,
             "lactate_sample": {"lactate_mmol": 2.5, "baseline_lactate": 1.0, "sample_delay_seconds": 30, "sample_timing_label": "end_of_step"}},
            {"order_index": 5, "purpose": "work", "pace_seconds_per_km": 260, "heart_rate_avg": 170, "duration_seconds": 240, "rest_seconds": 60, "cadence": 182,
             "lactate_sample": {"lactate_mmol": 3.4, "baseline_lactate": 1.0, "sample_delay_seconds": 30, "sample_timing_label": "end_of_step"}},
            {"order_index": 6, "purpose": "work", "pace_seconds_per_km": 245, "heart_rate_avg": 178, "duration_seconds": 240, "rest_seconds": 60, "cadence": 184,
             "lactate_sample": {"lactate_mmol": 5.2, "baseline_lactate": 1.0, "sample_delay_seconds": 30, "sample_timing_label": "end_of_step"}},
            {"order_index": 7, "purpose": "work", "pace_seconds_per_km": 230, "heart_rate_avg": 185, "duration_seconds": 240, "rest_seconds": 60, "cadence": 186,
             "lactate_sample": {"lactate_mmol": 8.1, "baseline_lactate": 1.0, "sample_delay_seconds": 30, "sample_timing_label": "end_of_step"}},
        ],
    }
    resp = api.post("/sessions", session_data)
    if resp.status_code in (200, 201):
        session = resp.json()
        session_id = session.get("id")
        r.ok(f"Crear sesión incremental (id={session_id})")
    else:
        r.fail("Crear sesión incremental", f"Status {resp.status_code}: {resp.text[:300]}")
        return

    # Check analysis was generated
    resp = api.get(f"/athletes/{api.athlete_id}/analysis")
    if resp.status_code == 200:
        analysis = resp.json()
        thresholds = analysis.get("thresholds", [])
        lt1 = next((t for t in thresholds if t.get("name") == "LT1"), None)
        lt2 = next((t for t in thresholds if t.get("name") == "LT2"), None)

        if lt1:
            r.ok(f"LT1 detectado: lactato={lt1.get('lactate')}, ritmo={lt1.get('pace_seconds_per_km')}s/km")
        else:
            r.fail("LT1 no detectado", "Sin LT1 en thresholds")

        if lt2:
            r.ok(f"LT2 detectado: lactato={lt2.get('lactate')}, ritmo={lt2.get('pace_seconds_per_km')}s/km")
        else:
            r.fail("LT2 no detectado", "Sin LT2 en thresholds")

        # Check curve_history
        views = analysis.get("discipline_views", {})
        running_view = views.get("running", {})
        curve_history = running_view.get("curve_history", {})
        pace_points = curve_history.get("pace", [])
        if len(pace_points) >= 5:
            r.ok(f"Curva de lactato: {len(pace_points)} puntos por ritmo")
        else:
            r.warn("Curva de lactato", f"Solo {len(pace_points)} puntos (esperados ≥5)")

        # Check zones
        zones = running_view.get("zones") or analysis.get("zones", [])
        if len(zones) >= 3:
            r.ok(f"Zonas de entrenamiento: {len(zones)} zonas generadas")
        else:
            r.warn("Zonas", f"Solo {len(zones)} zonas")

        # Check estimates
        estimates = running_view.get("estimates") or analysis.get("estimates", [])
        est_types = [e.get("estimate_type") for e in estimates]
        if "VO2max" in est_types:
            r.ok(f"VO2max estimado")
        else:
            r.warn("VO2max", "No estimado")

        # Check curve_insights
        insights = running_view.get("curve_insights")
        if insights:
            alerts = insights.get("curve_alerts", [])
            r.ok(f"Curve insights: {len(alerts)} alertas")
        else:
            r.warn("Curve insights", "No generados")

        # Check ai_advisory
        advisory = running_view.get("ai_advisory")
        if advisory and advisory.get("bullets"):
            r.ok(f"AI Advisory: {len(advisory['bullets'])} bullets narrativos")
        else:
            r.warn("AI Advisory", "No generado (puede ser que OpenRouter no esté configurado o primera recalculación)")

    else:
        r.fail("Obtener análisis", f"Status {resp.status_code}: {resp.text[:200]}")


def test_ai_chat(api: APIClient, r: TestResult):
    print("\n💬 4. CHAT IA")

    # Chat
    resp = api.post(f"/athlete-health/athletes/{api.athlete_id}/ai-coach/chat", {
        "message": "¿Cuál es mi LT2?",
    })
    if resp.status_code == 200:
        data = resp.json()
        response_text = data.get("response", "")
        if len(response_text) > 20:
            r.ok(f"Chat responde ({len(response_text)} chars)")
            # Check if it mentions real data
            if any(kw in response_text.lower() for kw in ["lt2", "umbral", "lactato", "ritmo", "mmol"]):
                r.ok("Chat menciona datos fisiológicos reales")
            else:
                r.warn("Chat sin datos fisiológicos", "Respuesta no menciona umbrales/lactato")
        else:
            r.fail("Chat respuesta vacía", f"Solo {len(response_text)} chars")
    else:
        r.fail("Chat IA", f"Status {resp.status_code}: {resp.text[:200]}")

    # History
    resp = api.get(f"/athlete-health/athletes/{api.athlete_id}/ai-coach/history")
    if resp.status_code == 200:
        messages = resp.json().get("messages", [])
        if len(messages) >= 2:
            r.ok(f"Historial chat: {len(messages)} mensajes persistidos")
        else:
            r.warn("Historial chat", f"Solo {len(messages)} mensajes")
    else:
        r.fail("Historial chat", f"Status {resp.status_code}")

    # Second question
    resp = api.post(f"/athlete-health/athletes/{api.athlete_id}/ai-coach/chat", {
        "message": "¿Estoy mejorando?",
    })
    if resp.status_code == 200:
        r.ok("Segunda pregunta al chat")
    else:
        r.fail("Segunda pregunta", f"Status {resp.status_code}")

    # Clear history
    resp = api.delete(f"/athlete-health/athletes/{api.athlete_id}/ai-coach/history")
    if resp.status_code == 200:
        r.ok("Limpiar historial chat")
    else:
        r.fail("Limpiar historial", f"Status {resp.status_code}")


def test_training_zones(api: APIClient, r: TestResult):
    print("\n🎯 5. ZONAS DE ENTRENAMIENTO")

    resp = api.get(f"/athletes/{api.athlete_id}/training-zones/active?discipline=running")
    if resp.status_code == 200:
        zones = resp.json()
        if isinstance(zones, dict) and zones.get("zones"):
            r.ok(f"Zonas activas running: {len(zones['zones'])} zonas")
        elif isinstance(zones, list) and len(zones) > 0:
            r.ok(f"Zonas activas running: {len(zones)} zonas")
        else:
            r.warn("Zonas activas", "Sin zonas activas para running")
    elif resp.status_code == 404:
        r.warn("Zonas activas", "404 — No hay zona activa configurada")
    else:
        r.fail("Zonas activas", f"Status {resp.status_code}")


def test_recovery(api: APIClient, r: TestResult):
    print("\n❤️ 6. RECOVERY Y WELLNESS")

    # Recovery score
    resp = api.get(f"/athlete-health/athletes/{api.athlete_id}/recovery-score")
    if resp.status_code == 200:
        score = resp.json()
        r.ok(f"Recovery score: {score.get('score', 'N/A')}")
    else:
        r.warn("Recovery score", f"Status {resp.status_code} (normal sin Garmin)")

    # Wellness checkin
    resp = api.post(f"/athlete-health/athletes/{api.athlete_id}/wellness-checkins", {
        "check_date": date.today().isoformat(),
        "fatigue": 3,
        "soreness": 2,
        "mood": 4,
        "sleep_quality": 4,
        "notes": "Test MVP agent",
    })
    if resp.status_code in (200, 201):
        r.ok("Wellness checkin registrado")
    else:
        r.fail("Wellness checkin", f"Status {resp.status_code}: {resp.text[:200]}")


def test_dynamic_thresholds(api: APIClient, r: TestResult):
    print("\n📈 7. UMBRALES DINÁMICOS")

    resp = api.get(f"/analytics/athletes/{api.athlete_id}/dynamic-thresholds")
    if resp.status_code == 200:
        data = resp.json()
        if data.get("acute") or data.get("chronic"):
            r.ok("Umbrales dinámicos calculados")
        else:
            r.warn("Umbrales dinámicos", "Sin datos acute/chronic")
    else:
        r.warn("Umbrales dinámicos", f"Status {resp.status_code}")


def test_sessions_list(api: APIClient, r: TestResult):
    print("\n📋 8. LISTADO DE SESIONES")

    resp = api.get("/sessions")
    if resp.status_code == 200:
        sessions = resp.json()
        if isinstance(sessions, list) and len(sessions) > 0:
            r.ok(f"Sesiones listadas: {len(sessions)}")
        else:
            r.warn("Sesiones", "Lista vacía")
    else:
        r.fail("Listar sesiones", f"Status {resp.status_code}")


def test_health_overview(api: APIClient, r: TestResult):
    print("\n🏥 9. HEALTH OVERVIEW")

    resp = api.get(f"/athlete-health/athletes/{api.athlete_id}/overview?days=7")
    if resp.status_code == 200:
        r.ok("Health overview disponible")
    else:
        r.warn("Health overview", f"Status {resp.status_code}")


def test_cleanup(api: APIClient, r: TestResult):
    """Optional: clean up test data."""
    print("\n🧹 10. LIMPIEZA")

    # Delete test athlete sessions
    resp = api.get("/sessions")
    if resp.status_code == 200:
        sessions = resp.json()
        for s in (sessions if isinstance(sessions, list) else []):
            api.delete(f"/sessions/{s['id']}")
        r.ok(f"Sesiones eliminadas: {len(sessions) if isinstance(sessions, list) else 0}")


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="MVP Test Agent")
    parser.add_argument("--base-url", default=DEFAULT_BASE, help="API base URL")
    parser.add_argument("--no-cleanup", action="store_true", help="Don't delete test data")
    parser.add_argument("--email", default=TEST_EMAIL, help="Test user email")
    parser.add_argument("--password", default=TEST_PASSWORD, help="Test user password")
    args = parser.parse_args()

    test_email = args.email
    test_password = args.password

    print(f"{'═' * 60}")
    print(f"  MVP TEST AGENT — PeakAerobic")
    print(f"  Base: {args.base_url}")
    print(f"  User: {test_email}")
    print(f"{'═' * 60}")

    api = APIClient(args.base_url)
    results = TestResult()

    # Run all tests in sequence
    if not test_registration(api, results, email=test_email, password=test_password):
        print("\n⛔ No se pudo autenticar. Abortando.")
        results.summary()
        sys.exit(1)

    test_athlete_profile(api, results)
    test_incremental_test(api, results)
    test_ai_chat(api, results)
    test_training_zones(api, results)
    test_recovery(api, results)
    test_dynamic_thresholds(api, results)
    test_sessions_list(api, results)
    test_health_overview(api, results)

    if not args.no_cleanup:
        test_cleanup(api, results)

    success = results.summary()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
