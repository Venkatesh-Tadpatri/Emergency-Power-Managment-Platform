from app.services.email import BRAND, SIGN_OFF, alarm_disable_reminder_email, otp_email, render_html, render_text


def test_every_email_has_greeting_and_cpc_sign_off():
    emails = [
        otp_email("first_login", "Sumanth", "815404", 10),
        otp_email("password_reset", "Sumanth", "815404", 10),
        otp_email("email_verification", None, "815404", 10),
        alarm_disable_reminder_email("AsterPrime-001", "Superadmin", "23 Nov 2026, 05:00 UTC", "Maintenance"),
    ]
    for content in emails:
        text, html = render_text(content), render_html(content)
        assert SIGN_OFF in text and BRAND in text
        assert SIGN_OFF in html and "Critical Power Command" in html
        assert text.startswith("Hello")


def test_code_and_expiry_are_shown():
    text = render_text(otp_email("first_login", "Sumanth", "815404", 10))
    assert "815404" in text and "expires in 10 minutes" in text
    assert "Hello Sumanth," in text


def test_user_values_are_html_escaped():
    html = render_html(otp_email("first_login", "<script>x</script>", "123456", 10))
    assert "<script>x</script>" not in html and "&lt;script&gt;" in html
