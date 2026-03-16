import time
from collections import defaultdict

from fastapi import HTTPException, Request

_attempts: dict[str, list[float]] = defaultdict(list)
_WINDOW = 300  # 5 minutes
_MAX_ATTEMPTS = 10  # max 10 attempts per 5 min per IP


def check_rate_limit(request: Request) -> None:
    """Simple in-memory rate limiter for auth endpoints."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()

    # Clean old entries
    _attempts[ip] = [t for t in _attempts[ip] if now - t < _WINDOW]

    if len(_attempts[ip]) >= _MAX_ATTEMPTS:
        raise HTTPException(429, "Demasiados intentos. Espera 5 minutos.")

    _attempts[ip].append(now)
