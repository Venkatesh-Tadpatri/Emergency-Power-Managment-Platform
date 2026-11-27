import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=64)
    return f"scrypt$16384$8$1${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        _, n, r, p, salt, expected = encoded.split("$", 5)
        actual = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=64
        )
        return hmac.compare_digest(actual, base64.b64decode(expected))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: str) -> tuple[str, int]:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    token = jwt.encode({"sub": user_id, "auth_provider": "local", "exp": expires}, settings.local_auth_secret, algorithm=ALGORITHM)
    return token, settings.access_token_minutes * 60


def decode_local_token(token: str) -> str | None:
    try:
        claims = jwt.decode(token, settings.local_auth_secret, algorithms=[ALGORITHM])
        return claims.get("sub") if claims.get("auth_provider") == "local" else None
    except JWTError:
        return None


FIRST_LOGIN_SETUP_MINUTES = 15


def create_first_login_setup_token(user_id: str) -> tuple[str, int]:
    """Short-lived proof that the first-login OTP was verified. It carries no
    ``auth_provider`` claim, so it can never be used as a session token."""
    expires = datetime.now(timezone.utc) + timedelta(minutes=FIRST_LOGIN_SETUP_MINUTES)
    token = jwt.encode({"sub": user_id, "purpose": "first_login_setup", "exp": expires}, settings.local_auth_secret, algorithm=ALGORITHM)
    return token, FIRST_LOGIN_SETUP_MINUTES * 60


def decode_first_login_setup_token(token: str) -> str | None:
    try:
        claims = jwt.decode(token, settings.local_auth_secret, algorithms=[ALGORITHM])
        return claims.get("sub") if claims.get("purpose") == "first_login_setup" else None
    except JWTError:
        return None


def hash_otp(user_id: str, purpose: str, code: str) -> str:
    message = f"{user_id}:{purpose}:{code}".encode()
    return hmac.new(settings.local_auth_secret.encode(), message, hashlib.sha256).hexdigest()
