import { FormEvent, useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AxiosError } from "axios";
import { api } from "../../api/client";
import { useAuth } from "../../auth/LocalAuth";
import { useToast } from "../../components/common/Toast";
import "./auth.css";
import "./validation.css";

type ApiValidationError = { msg?: string; loc?: Array<string | number> };
type ApiError = { detail?: string | ApiValidationError[] };
const API_FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  email: "Work email",
  contact_number: "Contact number",
  company_name: "Company name",
  password: "Password",
  code: "Verification code",
};

const validationMessage = (item: ApiValidationError) => {
  const field = [...(item.loc || [])].reverse().find((part): part is string => typeof part === "string" && part !== "body");
  const label = field ? (API_FIELD_LABELS[field] || field.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase())) : "Input";
  return `${label}: ${item.msg || "Invalid value"}`;
};

const messageFor = (error: unknown) => {
  const detail = (error as AxiosError<ApiError>).response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(validationMessage).join(". ");
  return "Something went wrong. Please try again.";
};

const BENEFITS = [
  {
    label: "Real-time Monitoring",
    // Pulse / activity line
    icon: <svg viewBox="0 0 24 24"><path d="M3 12h4l2.5-6 4 12 2.5-6H21" /></svg>,
  },
  {
    label: "Smart Analytics",
    // Rising bar chart
    icon: <svg viewBox="0 0 24 24"><path d="M4 20h16" /><path d="M7 16v-4" /><path d="M12 16V8" /><path d="M17 16V5" /></svg>,
  },
  {
    label: "Reliable Operations",
    // Shield with check
    icon: <svg viewBox="0 0 24 24"><path d="M12 3 19 6v5.5c0 4.4-3 7.9-7 9.5-4-1.6-7-5.1-7-9.5V6l7-3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>,
  },
];

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const isRegistration = title.toLowerCase().includes("create");
  return <main className={`auth-page${isRegistration ? " auth-register-page" : ""}`}>
    <section className="auth-visual">
      <Link to="/" className="auth-brand"><img src="/images/cpc-logo.png" alt="CPC" /><span>Critical Power<br />Command</span></Link>
      <div className="auth-hero-copy"><span className="auth-kicker">POWER CONTINUITY</span><h1>Confidence<br />when it matters<br /><em>most.</em></h1><p>Securely monitor and manage<br />critical power infrastructure<br />from one intelligent platform.</p></div>
      <ul className="auth-benefits" aria-label="Platform highlights">
        {BENEFITS.map(({ label, icon }) => <li key={label}><span className="auth-benefit-icon" aria-hidden="true">{icon}</span><span className="auth-benefit-label">{label}</span></li>)}
      </ul>
    </section>
    <section className="auth-panel">
      <Link to="/" className="auth-back"><span aria-hidden="true">←</span> Back to Home</Link>
      <div className="auth-card"><div className="auth-card-icon" aria-hidden="true">{isRegistration ? <svg viewBox="0 0 48 48"><circle cx="19" cy="16" r="7" /><path d="M7 37c1.5-8 6-12 12-12s10.5 4 12 12" /><path className="auth-icon-accent" d="M37 20v13M30.5 26.5h13" /></svg> : <svg viewBox="0 0 48 48"><path className="auth-shield" d="M24 4 39 10v10c0 11-6.2 19-15 24C15.2 39 9 31 9 20V10L24 4Z" /><path className="auth-bolt" d="m27 10-10 17h7l-3 12 11-18h-7l2-11Z" /></svg>}</div><div className="auth-mobile-brand"><img src="/images/cpc-logo.png" alt="CPC" /></div><h2>{title}</h2><p className="auth-subtitle">{subtitle}</p>{children}</div></section>
  </main>;
}

export const PASSWORD_MAX = 30;
export const PASSWORD_MIN = 10;

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; required?: boolean; hint?: string };

function FieldLabel({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return <label htmlFor={htmlFor} className="auth-field-label">{label}{required && <b className="auth-required" aria-hidden="true">*</b>}</label>;
}

const Field = ({ label, error, required, hint, ...props }: FieldProps) => {
  const id = useId();
  return <div className={`auth-field${error ? " has-error" : ""}`}>
    <FieldLabel htmlFor={id} label={label} required={required} />
    <input id={id} {...props} required={required} aria-required={required || undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
    {error ? <small className="field-error" id={`${id}-error`}>{error}</small> : hint && <small className="auth-field-hint">{hint}</small>}
  </div>;
};

/** Password input with a show/hide (eye) toggle. Capped at PASSWORD_MAX characters. */
const PasswordField = ({ label, error, required, ...props }: FieldProps) => {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className={`auth-field${error ? " has-error" : ""}`}>
    <FieldLabel htmlFor={id} label={label} required={required} />
    <div className="auth-password-wrap">
      <input id={id} {...props} type={visible ? "text" : "password"} maxLength={PASSWORD_MAX} required={required} aria-required={required || undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      <button type="button" className="auth-eye" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} title={visible ? "Hide password" : "Show password"}>
        {visible
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 19 12 19a9.4 9.4 0 0 0 4.4-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" /><circle cx="12" cy="12" r="3" /></svg>}
      </button>
    </div>
    {error && <small className="field-error" id={`${id}-error`}>{error}</small>}
  </div>;
};

type LoginMode = "sign-in" | "first-login";
const FIRST_LOGIN_REQUIRED = "Your account has not been activated yet.";

/** Sign in, or activate an admin-created account (First-time login: email → OTP → password). */
export function LoginPage() {
  const auth = useAuth(), navigate = useNavigate(), toast = useToast();
  const [params, setParams] = useSearchParams();
  const mode: LoginMode = params.get("mode") === "first-login" ? "first-login" : "sign-in";
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);

  const switchMode = (next: LoginMode, options: { notice?: string } = {}) => {
    setError(""); setNotice(options.notice || "");
    setParams(next === "first-login" ? { mode: "first-login", ...(email.trim() ? { email: email.trim() } : {}) } : {}, { replace: true });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      auth.login(data.access_token, email); navigate("/");
    } catch (e) {
      const response = (e as AxiosError<ApiError>).response;
      const detail = typeof response?.data?.detail === "string" ? response.data.detail : "";
      if (response?.status === 403 && detail.startsWith(FIRST_LOGIN_REQUIRED)) { switchMode("first-login", { notice: detail }); return; }
      if (response?.status === 403 && detail === "Email verification is required") { navigate("/verify-email", { state: { email: email.trim(), needsOtp: true } }); return; }
      setError(messageFor(e));
    } finally { setBusy(false); }
  };

  const activated = (activatedEmail: string) => {
    setEmail(activatedEmail); setPassword("");
    toast.success("Your account is activated. Sign in with your new password.");
    switchMode("sign-in", { notice: "Account activated. Sign in with your new password." });
  };

  return <Shell title={mode === "first-login" ? "First-time login" : "Welcome back"} subtitle={mode === "first-login" ? "Activate the account your administrator created for you" : "Sign in to your CPC account"}>
    <div className="auth-tabs" role="tablist" aria-label="Sign-in options">
      <button type="button" role="tab" aria-selected={mode === "sign-in"} className={mode === "sign-in" ? "active" : ""} onClick={() => switchMode("sign-in")}>Sign in</button>
      <button type="button" role="tab" aria-selected={mode === "first-login"} className={mode === "first-login" ? "active" : ""} onClick={() => switchMode("first-login")}>First-time login</button>
    </div>
    {mode === "sign-in"
      ? <form onSubmit={submit} className="auth-form">
          <Field label="Email address" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          <PasswordField label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
          <div className="auth-row"><label className="auth-check"><input type="checkbox" /> Remember me</label><Link to="/forgot-password">Forgot password?</Link></div>
          {notice && <div className="auth-info" role="status">{notice}</div>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="auth-switch">Received an account-created email? <button type="button" className="auth-inline-link" onClick={() => switchMode("first-login")}>Activate your account</button></p>
        </form>
      : <FirstLoginFlow initialEmail={email} notice={notice} onEmailChange={setEmail} onActivated={activated} onBackToSignIn={() => switchMode("sign-in")} />}
  </Shell>;
}

type FirstLoginStep = "email" | "code" | "password";

function FirstLoginFlow({ initialEmail, notice, onEmailChange, onActivated, onBackToSignIn }: {
  initialEmail: string; notice: string; onEmailChange: (email: string) => void; onActivated: (email: string) => void; onBackToSignIn: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<FirstLoginStep>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(""), [setupToken, setSetupToken] = useState("");
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [error, setError] = useState(""), [info, setInfo] = useState(notice), [busy, setBusy] = useState(false), [cooldown, setCooldown] = useState(0);

  useEffect(() => { if (cooldown <= 0) return; const id = setTimeout(() => setCooldown((value) => value - 1), 1000); return () => clearTimeout(id); }, [cooldown]);

  const sendCode = async (resend = false) => {
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/api/auth/first-login/start", { email: email.trim() });
      setCooldown(data.cooldown_seconds || 60);
      setCode(data.dev_otp || "");
      setInfo(data.dev_otp ? `Development code: ${data.dev_otp}` : `We sent a 6-digit code to ${email.trim()}.`);
      setStep("code");
      toast.success(resend ? "A new verification code has been sent." : "Verification code sent to your email.");
    } catch (e) { setError(messageFor(e)); } finally { setBusy(false); }
  };

  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setError("Enter a valid email address"); return; }
    onEmailChange(email.trim());
    void sendCode();
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { data } = await api.post("/api/auth/first-login/verify", { email: email.trim(), code });
      setSetupToken(data.setup_token); setInfo(""); setStep("password");
      toast.success("Email verified. Now set your password.");
    } catch (e) { setError(messageFor(e)); } finally { setBusy(false); }
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = passwordError(password);
    if (invalid) { setError(invalid); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setBusy(true); setError("");
    try {
      await api.post("/api/auth/first-login/complete", { setup_token: setupToken, password });
      onActivated(email.trim());
    } catch (e) {
      const message = messageFor(e);
      setError(message);
      // The setup token expired: start again from the code step.
      if ((e as AxiosError).response?.status === 400 && message.includes("expired")) { setStep("email"); setSetupToken(""); setCode(""); }
    } finally { setBusy(false); }
  };

  const steps: Array<[FirstLoginStep, string]> = [["email", "Email"], ["code", "Verify"], ["password", "Set password"]];
  const stepIndex = steps.findIndex(([key]) => key === step);

  return <div className="auth-form">
    <ol className="auth-steps" aria-label="Activation steps">
      {steps.map(([key, label], index) => <li key={key} className={index < stepIndex ? "done" : index === stepIndex ? "current" : ""} aria-current={index === stepIndex ? "step" : undefined}><b>{index < stepIndex ? "✓" : index + 1}</b><span>{label}</span></li>)}
    </ol>

    {step === "email" && <form onSubmit={submitEmail} className="auth-form" noValidate>
      <Field label="Email address" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="The email your administrator registered" hint="We'll email you a one-time code to confirm it's you." />
      {info && <div className="auth-info" role="status">{info}</div>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" disabled={busy || !email.trim()}>{busy ? "Sending code…" : "Send verification code"}</button>
    </form>}

    {step === "code" && <form onSubmit={submitCode} className="auth-form">
      <div className="auth-step-email"><span>{email.trim()}</span><button type="button" className="auth-inline-link" disabled={busy} onClick={() => { setStep("email"); setCode(""); setError(""); setInfo(""); }}>Change</button></div>
      <OtpInput value={code} onChange={setCode} />
      {info && <div className="auth-info" role="status">{info}</div>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify code"}</button>
      <button type="button" className="auth-link-button" onClick={() => void sendCode(true)} disabled={busy || cooldown > 0}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button>
    </form>}

    {step === "password" && <form onSubmit={submitPassword} className="auth-form">
      <div className="auth-step-email"><span>{email.trim()}</span><em>Verified</em></div>
      <div className="auth-grid">
        <PasswordField label="New password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordField label="Confirm password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <small className="auth-hint">Use {PASSWORD_MIN}–{PASSWORD_MAX} characters with uppercase, lowercase, number, and special character.</small>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" disabled={busy}>{busy ? "Saving…" : "Set password"}</button>
    </form>}

    <p className="auth-switch">Already set your password? <button type="button" className="auth-inline-link" onClick={onBackToSignIn}>Sign in</button></p>
  </div>;
}

export function passwordError(password: string): string | undefined {
  if (!password) return "Password is required";
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Password can be at most ${PASSWORD_MAX} characters`;
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return "Password needs an uppercase letter, a lowercase letter, a number and a special character";
  return undefined;
}

function OtpInput({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} placeholder="000000" required />; }

export function VerifyEmailPage() {
  const location = useLocation(), navigate = useNavigate(), auth = useAuth(), toast = useToast();
  const needsOtp = Boolean(location.state?.needsOtp);
  const [email, setEmail] = useState(location.state?.email || ""), [code, setCode] = useState(location.state?.devOtp || ""), [error, setError] = useState(""), [info, setInfo] = useState(location.state?.devOtp ? `Development code: ${location.state.devOtp}` : needsOtp ? "Send a verification code to continue." : ""), [busy, setBusy] = useState(false), [sending, setSending] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(""); try { const { data } = await api.post("/api/auth/verify-email", { email, code }); auth.login(data.access_token, email); toast.success("Email verified successfully."); navigate("/"); } catch (err) { setError(messageFor(err)); } finally { setBusy(false); } };
  const resend = async () => { setSending(true); setError(""); try { const { data } = await api.post("/api/auth/resend-verification", { email }); setInfo(data.dev_otp ? `Development code: ${data.dev_otp}` : data.message); toast.success("Verification code sent successfully."); } catch (e) { setError(messageFor(e)); } finally { setSending(false); } };
  return <Shell title="Verify your email" subtitle={needsOtp ? "Send a code, then enter it below" : `Enter the 6-digit code sent to ${email || "your email"}`}><form onSubmit={submit} className="auth-form"><Field label="Email address" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><OtpInput value={code} onChange={setCode} />{info && <div className="auth-info">{info}</div>}{error && <div className="auth-error">{error}</div>}<button className="auth-submit" disabled={busy || sending || code.length !== 6}>{busy ? "Verifying…" : "Verify email"}</button><button type="button" className="auth-link-button" onClick={resend} disabled={busy || sending || !email.trim()}>{sending ? "Sending…" : needsOtp && !code ? "Send verification code" : "Resend code"}</button></form></Shell>;
}

export function ForgotPasswordPage() {
  const navigate = useNavigate(); const [email, setEmail] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); try { const { data } = await api.post("/api/auth/forgot-password", { email }); navigate("/reset-password", { state: { email, devOtp: data.dev_otp } }); } catch (err) { setError(messageFor(err)); } finally { setBusy(false); } };
  return <Shell title="Reset your password" subtitle="We’ll email you a secure verification code"><form onSubmit={submit} className="auth-form"><Field label="Email address" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />{error && <div className="auth-error">{error}</div>}{error.startsWith(FIRST_LOGIN_REQUIRED) && <Link className="auth-inline-link" to={`/login?mode=first-login&email=${encodeURIComponent(email.trim())}`}>Go to First-time login →</Link>}<button className="auth-submit" disabled={busy}>{busy ? "Sending…" : "Send reset code"}</button><p className="auth-switch"><Link to="/login">Back to sign in</Link></p></form></Shell>;
}

export function ResetPasswordPage() {
  const location = useLocation(), navigate = useNavigate(); const [email, setEmail] = useState(location.state?.email || ""), [code, setCode] = useState(location.state?.devOtp || ""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); const invalid = passwordError(password); if (invalid) { setError(invalid); return; } if (password !== confirm) { setError("Passwords do not match"); return; } setError(""); setBusy(true); try { await api.post("/api/auth/reset-password", { email, code, password }); navigate("/login", { replace: true }); } catch (err) { setError(messageFor(err)); } finally { setBusy(false); } };
  return <Shell title="Choose a new password" subtitle="Confirm the code and set a strong new password"><form onSubmit={submit} className="auth-form"><Field label="Email address" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><OtpInput value={code} onChange={setCode} /><div className="auth-grid"><PasswordField label="New password" autoComplete="new-password" minLength={PASSWORD_MIN} required value={password} onChange={(e) => setPassword(e.target.value)} /><PasswordField label="Confirm password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div><small className="auth-hint">Use {PASSWORD_MIN}–{PASSWORD_MAX} characters with uppercase, lowercase, number, and special character.</small>{location.state?.devOtp && <div className="auth-info">Development code: {location.state.devOtp}</div>}{error && <div className="auth-error">{error}</div>}<button className="auth-submit" disabled={busy}>{busy ? "Updating…" : "Reset password"}</button></form></Shell>;
}
