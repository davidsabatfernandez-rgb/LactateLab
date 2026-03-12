import base64
import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
from cryptography.fernet import Fernet, InvalidToken
from jose import jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError

from app.core.config import get_settings

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False

    if _is_legacy_bcrypt_hash(hashed_password):
        return _verify_legacy_bcrypt_password(plain_password, hashed_password)

    try:
        return pwd_context.verify(plain_password, hashed_password)
    except (UnknownHashError, ValueError, TypeError):
        return False


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def password_needs_rehash(hashed_password: str) -> bool:
    if not hashed_password:
        return False
    if _is_legacy_bcrypt_hash(hashed_password):
        return True
    try:
        return pwd_context.needs_update(hashed_password)
    except (UnknownHashError, ValueError, TypeError):
        return False


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.access_token_algorithm)


def _fernet_key() -> bytes:
    settings = get_settings()
    secret = settings.strava_token_encryption_key or settings.jwt_secret
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_secret(value: str) -> str:
    return Fernet(_fernet_key()).encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str) -> str:
    try:
        return Fernet(_fernet_key()).decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Invalid encrypted secret payload") from exc


def _is_legacy_bcrypt_hash(hashed_password: str) -> bool:
    return hashed_password.startswith(("$2a$", "$2b$", "$2y$"))


def _verify_legacy_bcrypt_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False
