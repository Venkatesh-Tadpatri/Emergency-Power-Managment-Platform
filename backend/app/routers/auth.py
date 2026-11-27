import logging
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.local import (
    create_access_token,
    create_first_login_setup_token,
    decode_first_login_setup_token,
    hash_otp,
    hash_password,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.models.user import AuthOtp, User
from app.schemas.auth import (
    EmailRequest,
    FirstLoginCompleteRequest,
    FirstLoginVerifyResponse,
    LoginRequest,
    MessageResponse,
    OtpVerifyRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.services.email import EmailDeliveryError, otp_email, send_email

router = APIRouter(prefix="/api/auth", tags=["authentication"])
logger = logging.getLogger(__name__)
_ip_attempts: dict[str, list[datetime]] = {}


def now() -> datetime:
    return datetime.utcnow()


def normalize_email(email: str) -> str:
    return email.strip().lower()


INVITED = "invited"
FIRST_LOGIN_REQUIRED = "Your account has not been activated yet. Use First-time login to verify your email and set your password."


def send_otp(db: Session, user: User, purpose: str) -> MessageResponse:
    latest = db.query(AuthOtp).filter(AuthOtp.user_id == user.id, AuthOtp.purpose == purpose).order_by(AuthOtp.created_at.desc()).first()
    if latest:
        elapsed = (now() - latest.created_at.replace(tzinfo=None)).total_seconds()
        if elapsed < settings.otp_resend_cooldown_seconds:
            remaining = int(settings.otp_resend_cooldown_seconds - elapsed) + 1
            raise HTTPException(429, f"Please wait {remaining} seconds before requesting another code", headers={"Retry-After": str(remaining)})
    code = f"{secrets.randbelow(1_000_000):06d}"
    otp = AuthOtp(user_id=user.id, purpose=purpose, code_hash=hash_otp(user.id, purpose, code), expires_at=now() + timedelta(minutes=settings.otp_expiry_minutes))
    db.add(otp)
    db.commit()
    name = user.first_name or user.display_name
    try:
        delivered = send_email(user.email, otp_email(purpose, name, code, settings.otp_expiry_minutes))
    except EmailDeliveryError as exc:
        # Do not leave an undelivered code enforcing the resend cooldown; the user
        # can retry immediately and receive a fresh code.
        db.delete(otp)
        db.commit()
        raise HTTPException(503, "Verification email could not be sent. Please try again.") from exc
    if not delivered:
        logger.warning("SMTP is not configured; development OTP for %s is %s", user.email, code)
    return MessageResponse(message="Verification code sent", cooldown_seconds=settings.otp_resend_cooldown_seconds, dev_otp=code if not settings.smtp_host else None)


def validate_otp(db: Session, user: User, purpose: str, code: str) -> AuthOtp:
    otp = db.query(AuthOtp).filter(AuthOtp.user_id == user.id, AuthOtp.purpose == purpose, AuthOtp.consumed_at.is_(None)).order_by(AuthOtp.created_at.desc()).first()
    if not otp or otp.expires_at.replace(tzinfo=None) < now():
        raise HTTPException(400, "The verification code is invalid or expired")
    if otp.attempts >= settings.otp_max_attempts:
        raise HTTPException(429, "Too many verification attempts. Request a new code.")
    if secrets.compare_digest(otp.code_hash, hash_otp(user.id, purpose, code)) is False:
        otp.attempts += 1
        db.commit()
        raise HTTPException(400, "The verification code is invalid or expired")
    otp.consumed_at = now()
    return otp


@router.post("/register", status_code=410)
def register():
    """Self-registration is closed: Super Admins, Reseller Admins and Customer
    Admins create accounts, and users activate them through First-time login."""
    raise HTTPException(410, "Self-registration is disabled. Ask your administrator to create your account.")


@router.post("/verify-email", response_model=TokenResponse)
def verify_email(data: OtpVerifyRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == normalize_email(data.email)).one_or_none()
    if not user:
        raise HTTPException(400, "The verification code is invalid or expired")
    validate_otp(db, user, "email_verification", data.code)
    user.email_verified_at = now()
    user.account_state = "active"
    db.commit()
    token, expires = create_access_token(user.id)
    return TokenResponse(access_token=token, expires_in=expires)


@router.post("/resend-verification", response_model=MessageResponse)
def resend_verification(data: EmailRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == normalize_email(data.email)).one_or_none()
    if not user or user.email_verified_at:
        return MessageResponse(message="If the account requires verification, a code has been sent")
    return send_otp(db, user, "email_verification")


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    cutoff = now() - timedelta(minutes=settings.login_lockout_minutes)
    recent = [stamp for stamp in _ip_attempts.get(ip, []) if stamp > cutoff]
    _ip_attempts[ip] = recent
    if len(recent) >= settings.login_max_attempts * 3:
        raise HTTPException(429, "Too many login attempts. Please try again later.")
    user = db.query(User).filter(User.email == normalize_email(data.email)).one_or_none()
    if user and user.locked_until and user.locked_until.replace(tzinfo=None) > now():
        raise HTTPException(423, "Account temporarily locked. Please try again later.")
    if user and user.account_state == INVITED:
        raise HTTPException(403, FIRST_LOGIN_REQUIRED)
    if user and user.zitadel_sub and not user.password_hash:
        raise HTTPException(403, "This legacy account needs a local password. Use Forgot password to verify your email and create one.")
    if not user or not verify_password(data.password, user.password_hash):
        _ip_attempts[ip].append(now())
        if user:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= settings.login_max_attempts:
                user.account_state = "locked"
                user.locked_until = now() + timedelta(minutes=settings.login_lockout_minutes)
                user.failed_login_attempts = 0
            db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.email_verified_at:
        raise HTTPException(403, "Email verification is required")
    if user.account_state == "suspended" or not user.is_active:
        raise HTTPException(403, "This account is suspended")
    user.failed_login_attempts = 0
    user.locked_until = None
    user.account_state = "active"
    db.commit()
    token, expires = create_access_token(user.id)
    return TokenResponse(access_token=token, expires_in=expires)


@router.post("/first-login/start", response_model=MessageResponse)
def first_login_start(data: EmailRequest, db: Session = Depends(get_db)):
    """Step 1: email a one-time code to an admin-created account that has not been activated."""
    user = db.query(User).filter(User.email == normalize_email(data.email)).one_or_none()
    if not user:
        raise HTTPException(404, "No account has been created for this email. Ask your administrator to create one.")
    if user.account_state != INVITED:
        raise HTTPException(409, "This account is already activated. Sign in with your password, or use Forgot password.")
    return send_otp(db, user, "first_login")


@router.post("/first-login/verify", response_model=FirstLoginVerifyResponse)
def first_login_verify(data: OtpVerifyRequest, db: Session = Depends(get_db)):
    """Step 2: check the code and hand back a short-lived token for setting the password."""
    user = db.query(User).filter(User.email == normalize_email(data.email)).one_or_none()
    if not user or user.account_state != INVITED:
        raise HTTPException(400, "The verification code is invalid or expired")
    validate_otp(db, user, "first_login", data.code)
    db.commit()
    token, expires = create_first_login_setup_token(user.id)
    return FirstLoginVerifyResponse(setup_token=token, expires_in=expires)


@router.post("/first-login/complete", response_model=MessageResponse)
def first_login_complete(data: FirstLoginCompleteRequest, db: Session = Depends(get_db)):
    """Step 3: set the password and activate the account. The user then signs in normally."""
    user_id = decode_first_login_setup_token(data.setup_token)
    user = db.get(User, user_id) if user_id else None
    if not user or user.account_state != INVITED:
        raise HTTPException(400, "This activation link has expired. Start First-time login again.")
    user.password_hash = hash_password(data.password)
    user.email_verified_at = now()
    user.account_state = "active"
    user.is_active = True
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    return MessageResponse(message="Your password has been set. You can now sign in.")


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(data: EmailRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == normalize_email(data.email)).one_or_none()
    # ZITADEL-provisioned accounts predate local email verification. Let each
    # legacy user prove control of the email imported from ZITADEL, then create
    # a local password without changing role, tenant scope, or assignments.
    if user and user.account_state == INVITED:
        raise HTTPException(403, FIRST_LOGIN_REQUIRED)
    if not user or (not user.email_verified_at and not user.zitadel_sub):
        return MessageResponse(message="If an eligible account exists, a reset code has been sent")
    return send_otp(db, user, "password_reset")


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == normalize_email(data.email)).one_or_none()
    if not user:
        raise HTTPException(400, "The verification code is invalid or expired")
    validate_otp(db, user, "password_reset", data.code)
    user.password_hash = hash_password(data.password)
    user.email_verified_at = user.email_verified_at or now()
    user.failed_login_attempts = 0
    user.locked_until = None
    user.account_state = "active"
    db.commit()
    return MessageResponse(message="Password reset successfully")
