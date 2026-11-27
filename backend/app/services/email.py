"""Outbound platform email: one branded layout for every message.

Every email is sent as multipart/alternative — an HTML version for mail clients
and a plain-text version as the fallback — and ends with the same sign-off:

    Thanks and regards,
    CPC – Critical Power Command

When SMTP is not configured the message is written to the server log instead,
so development and demo environments still work end to end.
"""

import logging
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage
from html import escape
from urllib.parse import quote

from app.config import settings

logger = logging.getLogger(__name__)

BRAND = "CPC – Critical Power Command"
SIGN_OFF = "Thanks and regards,"
AUTOMATED_NOTE = "This is an automated message from Critical Power Command. Please do not reply to this email."


class EmailDeliveryError(Exception):
    """SMTP is configured but the message could not be delivered."""


def smtp_configured() -> bool:
    return bool(settings.smtp_host)


@dataclass
class EmailContent:
    """Building blocks of a CPC email; rendered to both HTML and plain text."""

    subject: str
    greeting_name: str | None
    intro: list[str]
    code: str | None = None
    code_caption: str | None = None
    details: list[tuple[str, str]] = field(default_factory=list)
    steps: list[str] = field(default_factory=list)
    button: tuple[str, str] | None = None  # (label, url)
    notes: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- rendering

def _greeting(name: str | None) -> str:
    return f"Hello {name}," if name else "Hello,"


def render_text(content: EmailContent) -> str:
    lines = [_greeting(content.greeting_name), ""]
    for paragraph in content.intro:
        lines += [paragraph, ""]
    if content.code:
        lines += [f"    {content.code}", ""]
        if content.code_caption:
            lines += [content.code_caption, ""]
    if content.details:
        lines += [f"{label}: {value}" for label, value in content.details] + [""]
    if content.steps:
        lines += [f"  {index}. {step}" for index, step in enumerate(content.steps, 1)] + [""]
    if content.button:
        lines += [f"{content.button[0]}: {content.button[1]}", ""]
    for note in content.notes:
        lines += [note, ""]
    lines += [SIGN_OFF, BRAND, "", "—", AUTOMATED_NOTE]
    return "\n".join(lines)


def render_html(content: EmailContent) -> str:
    font = "font-family:Segoe UI,Arial,Helvetica,sans-serif;"
    p = f'<p style="margin:0 0 14px;{font}font-size:14px;line-height:1.6;color:#1f2937;">'
    parts = [f"{p}{escape(_greeting(content.greeting_name))}</p>"]
    parts += [f"{p}{escape(paragraph)}</p>" for paragraph in content.intro]
    if content.code:
        caption = f'<div style="margin-top:8px;{font}font-size:12px;color:#64748b;">{escape(content.code_caption)}</div>' if content.code_caption else ""
        parts.append(
            '<div style="margin:6px 0 20px;padding:18px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;text-align:center;">'
            f'<div style="font-family:Consolas,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#0b3a75;">{escape(content.code)}</div>'
            f"{caption}</div>"
        )
    if content.details:
        rows = "".join(
            f'<tr><td style="padding:6px 12px 6px 0;{font}font-size:13px;color:#64748b;white-space:nowrap;vertical-align:top;">{escape(label)}</td>'
            f'<td style="padding:6px 0;{font}font-size:13px;color:#111827;font-weight:600;">{escape(value)}</td></tr>'
            for label, value in content.details
        )
        parts.append(f'<table role="presentation" style="margin:0 0 18px;border-collapse:collapse;">{rows}</table>')
    if content.steps:
        items = "".join(f'<li style="margin:0 0 6px;">{escape(step)}</li>' for step in content.steps)
        parts.append(f'<ol style="margin:0 0 18px;padding-left:20px;{font}font-size:14px;line-height:1.6;color:#1f2937;">{items}</ol>')
    if content.button:
        label, url = content.button
        parts.append(
            '<div style="margin:4px 0 22px;">'
            f'<a href="{escape(url, quote=True)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#0a6fd6;color:#ffffff;'
            f'{font}font-size:14px;font-weight:700;text-decoration:none;">{escape(label)}</a>'
            f'<div style="margin-top:10px;{font}font-size:12px;color:#64748b;">Or open this link: '
            f'<a href="{escape(url, quote=True)}" style="color:#0a6fd6;word-break:break-all;">{escape(url)}</a></div></div>'
        )
    parts += [f'<p style="margin:0 0 14px;{font}font-size:13px;line-height:1.6;color:#475569;">{escape(note)}</p>' for note in content.notes]
    parts.append(f'<p style="margin:22px 0 0;{font}font-size:14px;line-height:1.6;color:#1f2937;">{SIGN_OFF}<br><strong>{escape(BRAND)}</strong></p>')
    body = "".join(parts)
    return (
        '<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;"><tr><td align="center">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">'
        f'<tr><td style="background:#0b3a75;padding:18px 28px;{font}color:#ffffff;">'
        '<div style="font-size:18px;font-weight:800;letter-spacing:.5px;">CPC</div>'
        '<div style="font-size:12px;color:#bfdbfe;">Critical Power Command · Critical Infrastructure. Managed.</div></td></tr>'
        f'<tr><td style="padding:28px;">{body}</td></tr>'
        f'<tr><td style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;{font}font-size:11px;line-height:1.5;color:#94a3b8;">{escape(AUTOMATED_NOTE)}</td></tr>'
        "</table></td></tr></table></body></html>"
    )


# ---------------------------------------------------------------- sending

def send_email(to: str | list[str], content: EmailContent) -> bool:
    """Send a CPC email. Returns False when SMTP is not configured (the text is
    logged instead); raises EmailDeliveryError when delivery fails."""
    recipients = [to] if isinstance(to, str) else list(to)
    text = render_text(content)
    if not settings.smtp_host:
        logger.warning("SMTP is not configured; email to %s not sent.\nSubject: %s\n%s", ", ".join(recipients), content.subject, text)
        return False
    message = EmailMessage()
    message["Subject"] = content.subject
    message["From"] = f"Critical Power Command <{settings.smtp_from_email}>"
    message["To"] = ", ".join(recipients)
    message.set_content(text)
    message.add_alternative(render_html(content), subtype="html")
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        logger.exception("Email delivery to %s failed", ", ".join(recipients))
        raise EmailDeliveryError(str(exc)) from exc
    return True


# ---------------------------------------------------------------- messages

def login_url(email: str | None = None, first_login: bool = False) -> str:
    url = f"{settings.public_app_url}/login"
    if first_login:
        url += "?mode=first-login" + (f"&email={quote(email)}" if email else "")
    return url


def otp_email(purpose: str, name: str | None, code: str, expiry_minutes: int) -> EmailContent:
    """Verification-code emails (account activation, email verification, password reset)."""
    caption = f"This code expires in {expiry_minutes} minutes."
    security = "For your security, never share this code with anyone. CPC staff will never ask you for it."
    if purpose == "first_login":
        return EmailContent(
            subject="Your CPC account activation code",
            greeting_name=name,
            intro=["Use the verification code below to confirm your email address and activate your Critical Power Command account."],
            code=code, code_caption=caption,
            steps=["Enter this code on the First-time login screen.", "Set your new password.", "Sign in with your email and new password."],
            notes=[security, "If you did not try to activate a CPC account, you can safely ignore this email."],
        )
    if purpose == "password_reset":
        return EmailContent(
            subject="Your CPC password reset code",
            greeting_name=name,
            intro=["We received a request to reset the password for your Critical Power Command account. Use the code below to choose a new password."],
            code=code, code_caption=caption,
            notes=[security, "If you did not request a password reset, ignore this email. Your password will not change."],
        )
    return EmailContent(
        subject="Your CPC verification code",
        greeting_name=name,
        intro=["Use the verification code below to verify your email address for Critical Power Command."],
        code=code, code_caption=caption,
        notes=[security, "If you did not request this code, you can safely ignore this email."],
    )


def send_account_created_email(to: str, name: str | None, invited_by: str | None) -> bool:
    by = f" by {invited_by}" if invited_by else ""
    content = EmailContent(
        subject="Your CPC account has been created",
        greeting_name=name,
        intro=[f"An account has been created for you on Critical Power Command (CPC){by}. Your sign-in email is {to}."],
        steps=[
            "Open the CPC sign-in page using the button below.",
            "Choose \"First-time login\" and enter your email address.",
            "Enter the one-time verification code we email you.",
            "Set your password, then sign in.",
        ],
        button=("Activate my account", login_url(to, first_login=True)),
        notes=[
            "Once you have signed in, your administrator will assign your access.",
            "If you were not expecting this email, you can safely ignore it.",
        ],
    )
    return send_email(to, content)


def alarm_disable_reminder_email(system_name: str, disabled_by: str | None, disabled_at: str, reason: str | None) -> EmailContent:
    return EmailContent(
        subject=f"Reminder: alarms remain disabled for {system_name}",
        greeting_name=None,
        intro=[f"Alarms are still disabled for {system_name}. This suppression has no automatic end time, so new alarms from this system are not being raised."],
        details=[("System", system_name), ("Disabled by", disabled_by or "Unknown"), ("Disabled at", disabled_at), ("Reason", reason or "Not given")],
        button=("Open CPC", login_url()),
        notes=["Re-enable alarms from the system overview when it is appropriate. You will receive this reminder every 24 hours until alarms are re-enabled."],
    )
