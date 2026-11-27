import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../../api/client";
import { useAuth } from "../../auth/LocalAuth";
import { QueryState } from "../../components/common/QueryState";
import { StatusPill } from "../../components/common/StatusPill";
import { useToast } from "../../components/common/Toast";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useMe } from "../../queries/me";
import { SLOT_PREFIX, usePanelLimitsSettings, useUpdatePanelLimits } from "../../queries/settings";

const PANEL_LIMIT_FIELDS = [
  ["generator", "Generators per panel", "Generator slots"],
  ["ats", "ATS units per panel", "ATS slots"],
  ["meter", "Power meters per panel", "Meter slots"],
  ["fuel_tank", "Fuel tanks per panel", "Fuel tank slots"],
];

// The API stores UTC without a zone marker; read it as UTC so it shows in local time.
const parseUtc = (value) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);

function PanelLimitsCard() {
  const query = usePanelLimitsSettings();
  const save = useUpdatePanelLimits();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState("");

  if (query.isPending) return <section className="settings-card panel-limits-card"><p className="settings-note">Loading panel device limits…</p></section>;
  if (query.isError) return <section className="settings-card panel-limits-card"><p className="settings-note">Panel device limits could not be loaded.</p></section>;

  const { limits, defaults, max, in_use: inUse, updated_by: updatedBy, updated_at: updatedAt } = query.data;
  const startEdit = () => { setDraft(Object.fromEntries(PANEL_LIMIT_FIELDS.map(([key]) => [key, String(limits[key])]))); setError(""); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setError(""); };
  // Digits only, at most two (1–99); the server enforces the same ceiling.
  const typeValue = (key, raw) => setDraft({ ...draft, [key]: raw.replace(/\D/g, "").slice(0, 2) });
  const step = (key, delta) => {
    const current = Number(draft[key]) || 0;
    setDraft({ ...draft, [key]: String(Math.min(max[key], Math.max(1, current + delta))) });
    setError("");
  };
  // While editing, the preview (slot range, warnings) follows the typed value when it is a valid number.
  const shown = (key) => { const value = Number(draft[key]); return editing && Number.isInteger(value) && value >= 1 ? value : limits[key]; };
  const dirty = editing && PANEL_LIMIT_FIELDS.some(([key]) => String(limits[key]) !== String(draft[key]).trim());

  const submit = (event) => {
    event.preventDefault();
    const values = {};
    for (const [key, label] of PANEL_LIMIT_FIELDS) {
      const raw = String(draft[key] ?? "").trim();
      const value = Number(raw);
      if (!raw || !Number.isInteger(value) || value < 1 || value > max[key]) {
        setError(`${label} must be a whole number from 1 to ${max[key]}.`);
        return;
      }
      values[key] = value;
    }
    if (!dirty) { setEditing(false); return; }
    setError("");
    save.mutate(values, {
      onSuccess: () => { setEditing(false); toast.success("Panel device limits updated successfully."); },
      onError: (err) => setError(err?.response?.data?.detail || "The panel device limits could not be saved. Please try again."),
    });
  };

  return (
    <form className="settings-card panel-limits-card" onSubmit={submit}>
      <header className="settings-card-head">
        <h3>Panel Device Limits</h3>
        {editing
          ? <StatusPill status="warning" label="Editing" />
          : <button type="button" className="header-btn primary" onClick={startEdit}>Edit Limits</button>}
      </header>
      <p className="settings-note" style={{ marginTop: 0, marginBottom: 12 }}>
        Maximum number of each device type that can be added to a single PLC panel. Device Administration uses these limits for its slot lists and empty “+ Add” boxes, and the server rejects devices beyond them.
      </p>
      <div className="panel-limits-grid">
        {PANEL_LIMIT_FIELDS.map(([key, label, slotLabel]) => {
          const value = shown(key);
          const over = inUse[key] > value;
          return (
            <div className="panel-limit-item" key={key}>
              <b>{label}</b>
              <div className="panel-limit-value">
                {editing
                  ? <div className="panel-limit-stepper">
                      <button type="button" aria-label={`Decrease ${label}`} disabled={save.isPending || (Number(draft[key]) || 0) <= 1} onClick={() => step(key, -1)}>−</button>
                      <input type="text" inputMode="numeric" pattern="[0-9]{1,2}" maxLength={2} required value={draft[key]} aria-label={label} disabled={save.isPending} autoFocus={key === PANEL_LIMIT_FIELDS[0][0]} onChange={(event) => typeValue(key, event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowUp") { event.preventDefault(); step(key, 1); } else if (event.key === "ArrowDown") { event.preventDefault(); step(key, -1); } }} />
                      <button type="button" aria-label={`Increase ${label}`} disabled={save.isPending || (Number(draft[key]) || 0) >= max[key]} onClick={() => step(key, 1)}>+</button>
                    </div>
                  : <strong>{limits[key]}</strong>}
                <code>{SLOT_PREFIX[key]}1{value > 1 ? `–${SLOT_PREFIX[key]}${value}` : ""}</code>
              </div>
              <small>{slotLabel} · allowed 1–{max[key]} · default {defaults[key]}</small>
              {over
                ? <small className="settings-warn">A panel already has {inUse[key]}. Those devices are kept, but no more can be added to that panel while it has {value} or more.</small>
                : <small>Most on any panel today: {inUse[key]}</small>}
            </div>
          );
        })}
      </div>
      {error && <div className="panel-limits-error" role="alert">{error}</div>}
      <div className="panel-limits-actions">
        <span>{updatedAt ? `Last changed ${parseUtc(updatedAt).toLocaleString()}${updatedBy ? ` by ${updatedBy}` : ""}` : "Using the default limits."}</span>
        {editing && <>
          <button type="button" className="header-btn" disabled={save.isPending} onClick={() => setDraft(Object.fromEntries(PANEL_LIMIT_FIELDS.map(([key]) => [key, String(defaults[key])])))}>Reset to defaults</button>
          <button type="button" className="header-btn" disabled={save.isPending} onClick={cancelEdit}>Cancel</button>
          <button type="submit" className="header-btn primary" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</button>
        </>}
      </div>
      <p className="settings-env">Stored in the database (<code>platform_settings</code>). Changes apply immediately — no restart needed. Push each affected panel to its PLC afterwards.</p>
    </form>
  );
}

const ROLE_LABEL = {
  superadmin: "Superadmin",
  reseller_admin: "Reseller Admin",
  company_admin: "Customer Admin",
  system_operator: "System Operator",
  system_viewer: "System Viewer",
};

const yesNo = (value) => (value ? "Yes" : "No");
const setOrNot = (value) => (value ? "Configured" : "Not set");

function SettingsCard({ title, status, statusLabel, env, rows, children }) {
  return (
    <section className="settings-card">
      <header className="settings-card-head">
        <h3>{title}</h3>
        {status && <StatusPill status={status} label={statusLabel} />}
      </header>
      <dl className="settings-rows">
        {rows.filter(Boolean).map(([label, value, tone]) => (
          <div className="settings-row" key={label}>
            <dt>{label}</dt>
            <dd className={tone ? `settings-${tone}` : undefined}>{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {children}
      {env && <p className="settings-env">Set via <code>{env}</code></p>}
    </section>
  );
}

export function Settings() {
  usePageHeader("Platform Settings");
  const auth = useAuth();
  const navigate = useNavigate();
  const { data: me } = useMe(auth.isAuthenticated);
  const isSuperadmin = me?.role === "superadmin";
  const overview = useQuery({
    queryKey: ["settings-overview"],
    queryFn: async () => (await api.get("/api/settings/overview")).data,
    enabled: isSuperadmin,
    refetchInterval: 30_000,
  });

  if (me && !isSuperadmin) {
    return <QueryState title="Platform settings are restricted" message="Only superadmins can view platform configuration. Your own account details are on your profile page." />;
  }
  if (!me || overview.isPending) return <QueryState loading title="Loading platform settings…" />;
  if (overview.isError) return <QueryState title="Settings unavailable" message="We couldn't load the platform configuration." onRetry={() => { void overview.refetch(); }} />;

  const { warnings, inventory, users, mqtt, influxdb, auth: authCfg, email, logging, network } = overview.data;
  const mqttStatus = !mqtt.enabled ? "offline" : mqtt.connected ? "online" : "emergency";
  const mqttLabel = !mqtt.enabled ? "Disabled" : mqtt.connected ? "Connected" : "Disconnected";

  return <div className="settings-page">
    <div className="settings-toolbar">
      <div className="reseller-total-strip">
        <div className="reseller-total-item purple"><span>Resellers</span><strong>{inventory.resellers}</strong></div>
        <div className="reseller-total-item blue"><span>Customers</span><strong>{inventory.customers}</strong></div>
        <div className="reseller-total-item amber"><span>Sites</span><strong>{inventory.sites}</strong></div>
        <div className="reseller-total-item cyan"><span>Systems</span><strong>{inventory.systems}</strong></div>
        <div className={`reseller-total-item ${inventory.active_alarms ? "red" : "green"}`}><span>Active Alarms</span><strong>{inventory.active_alarms}</strong></div>
      </div>
      <button type="button" className="header-btn" onClick={() => { void overview.refetch(); }} disabled={overview.isFetching}>
        {overview.isFetching ? "Checking…" : "Re-check status"}
      </button>
    </div>

    {warnings.length > 0 && (
      <div className="settings-warnings" role="status">
        <strong>{warnings.length} configuration {warnings.length === 1 ? "item needs" : "items need"} attention</strong>
        <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      </div>
    )}

    <div className="settings-grid">
      <PanelLimitsCard />

      <SettingsCard title="MQTT / Ingestion" status={mqttStatus} statusLabel={mqttLabel} env="MQTT_* in backend .env" rows={[
        ["Broker", `${mqtt.host}:${mqtt.port}`],
        ["TLS", yesNo(mqtt.tls), mqtt.enabled && !mqtt.tls ? "warn" : null],
        ["Broker login", setOrNot(mqtt.auth_configured)],
        ["Topic filter", <code key="t">{mqtt.topic_filter}</code>],
        ["Active topic mappings", mqtt.topic_mappings],
        ["Sample interval", `${mqtt.sample_interval_seconds}s`],
        ["Last message topic", mqtt.last_message_topic ? <code key="l">{mqtt.last_message_topic}</code> : "None received"],
        mqtt.last_error && ["Last error", mqtt.last_error, "bad"],
      ]} />

      <SettingsCard title="InfluxDB (Telemetry History)" status={influxdb.reachable ? "online" : "emergency"} statusLabel={influxdb.reachable ? "Reachable" : "Unreachable"} env="INFLUXDB_* in backend .env" rows={[
        ["URL", influxdb.url],
        ["Organisation", influxdb.org],
        ["Bucket", influxdb.bucket],
        ["API token", influxdb.token_is_default ? "Development default" : setOrNot(influxdb.token_configured), influxdb.token_is_default ? "warn" : null],
        influxdb.version && ["Server version", influxdb.version],
        influxdb.error && ["Error", influxdb.error, "bad"],
      ]} />

      <SettingsCard title="Authentication" status={authCfg.local_secret_is_default && authCfg.local_auth_enabled ? "warning" : "online"} statusLabel={authCfg.local_secret_is_default && authCfg.local_auth_enabled ? "Review" : "Secure"} env="LOCAL_AUTH_* / ZITADEL_* / OTP_* / LOGIN_*" rows={[
        ["Email + OTP sign-in", authCfg.local_auth_enabled ? "Enabled" : "Disabled"],
        ["Signing secret", authCfg.local_secret_is_default ? "Default (change it)" : "Custom", authCfg.local_secret_is_default ? "warn" : null],
        ["Session length", `${Math.round(authCfg.access_token_minutes / 60 * 10) / 10} hours`],
        ["OTP expiry", `${authCfg.otp_expiry_minutes} min`],
        ["OTP resend cooldown", `${authCfg.otp_resend_cooldown_seconds}s`],
        ["OTP attempts allowed", authCfg.otp_max_attempts],
        ["Login lockout", `${authCfg.login_max_attempts} attempts → ${authCfg.login_lockout_minutes} min`],
        ["Zitadel SSO client", setOrNot(authCfg.zitadel_client_configured)],
        ["Trusted issuers", authCfg.zitadel_issuers.join(", ")],
      ]} />

      <SettingsCard title="Email & Notifications" status={email.configured ? "online" : "warning"} statusLabel={email.configured ? "Configured" : "Not configured"} env="SMTP_* in backend .env" rows={[
        ["SMTP server", email.configured ? `${email.host}:${email.port}` : "Not set", email.configured ? null : "warn"],
        ["Sender address", email.from_email],
        ["STARTTLS", yesNo(email.starttls)],
        ["SMTP login", setOrNot(email.auth_configured)],
        ["Used for", "Sign-in OTP codes, alarm notifications"],
      ]}>
        <p className="settings-note">On-call schedules and escalation are set per customer under <b>Customer → On-Call</b>.</p>
      </SettingsCard>

      <SettingsCard title="Users & Roles" rows={[
        ["Total accounts", users.total],
        ["Awaiting role assignment", users.unassigned, users.unassigned ? "warn" : null],
        ...Object.entries(ROLE_LABEL).map(([role, label]) => [label, users.by_role[role] || 0]),
      ]}>
        <button type="button" className="header-btn primary settings-card-action" onClick={() => navigate("/users")}>Manage users</button>
      </SettingsCard>

      <SettingsCard title="Logging & Runtime" env="LOG_* / CORS_ORIGINS / SEED_ON_START" rows={[
        ["Log level", logging.level],
        ["Log directory", <code key="d">{logging.directory}</code>],
        ["Log retention", `${logging.retention_days} days`],
        ["Allowed web origins", network.cors_origins.join(", ")],
        ["Seed demo data on start", yesNo(network.seed_on_start), network.seed_on_start ? "warn" : null],
      ]} />
    </div>
    <p className="settings-footnote">Panel Device Limits are editable above. The other values come from the backend environment and are read-only here. Change them in the server's <code>.env</code> file and restart the backend. Status refreshes every 30 seconds.</p>
  </div>;
}
