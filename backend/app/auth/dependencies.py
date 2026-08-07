import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.jwks import TokenValidationError, fetch_userinfo, verify_token
from app.database import get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        claims = verify_token(creds.credentials)
    except TokenValidationError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token missing sub claim")

    user = db.query(User).filter(User.zitadel_sub == sub).one_or_none()

    # Zitadel's JWT access token only carries `sub` + auth-flow claims, not
    # email/name — those need a UserInfo round-trip. Do it on first sight of an
    # identity, and self-heal any existing row still missing an email (e.g. one
    # provisioned before this fix existed).
    if user is None or not user.email:
        try:
            userinfo = fetch_userinfo(creds.credentials)
        except httpx.HTTPError:
            userinfo = {}
        email = userinfo.get("email") or claims.get("email") or ""
        name = userinfo.get("name") or userinfo.get("preferred_username") or email or None
        if user is None:
            # First time we've seen this identity: auto-provision an unprivileged
            # local profile row. role stays NULL until a superadmin/admin assigns one.
            user = User(
                zitadel_sub=sub, email=email, display_name=name, role=None, is_active=True
            )
            db.add(user)
        else:
            if email:
                user.email = email
            if name and not user.display_name:
                user.display_name = name
        db.commit()
        db.refresh(user)

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "user is deactivated")

    return user
