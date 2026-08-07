"""Fetches and caches Zitadel's JWKS so bearer tokens can be signature-verified
without round-tripping to Zitadel on every request.
"""
import time
from urllib.parse import urlparse

import httpx
from jose import jwt
from jose.exceptions import JOSEError

from app.config import settings

_cache: dict = {"keys": {}, "fetched_at": 0.0}
_CACHE_TTL_SECONDS = 3600


def _fetch_jwks() -> dict:
    # Always reach Zitadel via its internal Docker network address — the discovery
    # document's URLs are absolute and use the external issuer (e.g. localhost:8080),
    # which isn't reachable from inside this container, so only the path is reused.
    # Zitadel also does instance routing off the Host header and expects it to match
    # ZITADEL_EXTERNALDOMAIN, so that has to be forced explicitly here too.
    base = settings.zitadel_internal_url
    host_header = urlparse(settings.zitadel_issuer).netloc
    headers = {"Host": host_header}
    discovery = httpx.get(
        f"{base}/.well-known/openid-configuration", headers=headers, timeout=10
    ).json()
    jwks_path = urlparse(discovery["jwks_uri"]).path
    jwks = httpx.get(f"{base}{jwks_path}", headers=headers, timeout=10).json()
    return {key["kid"]: key for key in jwks["keys"]}


def _get_key(kid: str) -> dict | None:
    now = time.time()
    if not _cache["keys"] or now - _cache["fetched_at"] > _CACHE_TTL_SECONDS:
        _cache["keys"] = _fetch_jwks()
        _cache["fetched_at"] = now
    key = _cache["keys"].get(kid)
    if key is None:
        # kid rotated since our last fetch — refresh once and retry.
        _cache["keys"] = _fetch_jwks()
        _cache["fetched_at"] = time.time()
        key = _cache["keys"].get(kid)
    return key


def fetch_userinfo(access_token: str) -> dict:
    """Zitadel's JWT access tokens only carry `sub` + auth-flow claims — email/name
    live on the OIDC UserInfo endpoint instead, keyed off the same access token."""
    base = settings.zitadel_internal_url
    host_header = urlparse(settings.zitadel_issuer).netloc
    headers = {"Host": host_header, "Authorization": f"Bearer {access_token}"}
    resp = httpx.get(f"{base}/oidc/v1/userinfo", headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json()


class TokenValidationError(Exception):
    pass


def verify_token(token: str) -> dict:
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JOSEError as exc:
        raise TokenValidationError(f"malformed token header: {exc}") from exc

    kid = unverified_header.get("kid")
    key = _get_key(kid) if kid else None
    if key is None:
        raise TokenValidationError("unknown signing key (kid)")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[key.get("alg", "RS256")],
            audience=settings.zitadel_client_id or None,
            issuer=settings.zitadel_issuer,
            options={"verify_aud": bool(settings.zitadel_client_id)},
        )
    except JOSEError as exc:
        raise TokenValidationError(f"token verification failed: {exc}") from exc
    return claims
