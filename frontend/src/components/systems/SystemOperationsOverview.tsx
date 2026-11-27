import { Fragment, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { IconAlert, IconATS, IconBell, IconBolt, IconCheckCircle, IconGenerator } from "../common/Icons";
import { Modal } from "../common/Modal";
import { useToast } from "../common/Toast";
import { TestWizard } from "./TestWizard";
import type { ATS, Generator } from "../../types/entities";
import { telemetryFor, useTelemetrySnapshot, type AtsTelemetry, type GeneratorTelemetry } from "../../hooks/useTelemetry";
import { useAlarms } from "../../queries/alarms";
import { useReports } from "../../queries/reports";
import { useMe } from "../../queries/me";
import { useAddEquipmentNote, useDeleteEquipmentNote, useEquipmentNotes } from "../../queries/equipmentNotes";
import { useMonitoredAssets, useSaveMonitoredAsset } from "../../queries/monitoredAssets";
import { useAlarmDisableStatus, useAssetAlarmDisables, useDisableAssetAlarms, useDisableSystemAlarms, useEnableAssetAlarms, useEnableSystemAlarms, useOneLine, useSaveOneLine, useSystemEvents, type AlarmDisableDuration } from "../../queries/systems";
import { alarmOnly, eventOnly } from "../../utils/alarmClassification";
import type { Alarm as AlarmRecord, MonitoredAsset, ReportListItem } from "../../types/entities";
import boilerIcon from "../../assets/equipment/boiler.png";
import chillerIcon from "../../assets/equipment/chiller.png";
import coolingTowerIcon from "../../assets/equipment/cooling-tower.png";
import elevatorIcon from "../../assets/equipment/elevator.png";
import fanIcon from "../../assets/equipment/fan.png";
import pumpIcon from "../../assets/equipment/pump.png";
import generalIcon from "../../assets/equipment/general-gear.svg";
import airCompressorIcon from "../../assets/equipment/air-compressor.png";

type EquipmentSelection = { type: "ats"; id: string } | { type: "generator"; id: string };
const atsNumber = (value: string | undefined) => value?.match(/ats[-\s]*(\d+)/i)?.[1]?.replace(/^0+/, "");

/** Match only telemetry returned for the current system; never borrow demo or another system's data. */
export function resolveGeneratorTelemetry(generatorTelemetry: GeneratorTelemetry[] | undefined, id: string, name: string) {
  return telemetryFor(generatorTelemetry, id, name);
}
export function resolveAtsTelemetry(atsTelemetry: AtsTelemetry[] | undefined, id: string, name: string) {
  const exact = telemetryFor(atsTelemetry, id, name);
  if (exact) return exact;

  const targetNumber = atsNumber(id) || atsNumber(name);
  const numbered = targetNumber
    ? atsTelemetry?.find((item) => atsNumber(item.equipment_id) === targetNumber || atsNumber(item.equipment_name) === targetNumber)
    : undefined;
  return numbered;
}

const unavailableReading = "—";
const reading = (value: number | null | undefined, digits = 0, unit = "") =>
  value == null || !Number.isFinite(value) ? unavailableReading : `${value.toFixed(digits)}${unit}`;

type DetailTab = "details" | "summary" | "notes" | "documents";
type StoredNote = { text: string; authorId: string; authorName: string; authorEmail: string; authorRole: string; createdAt: string };
type StoredDocument = { name: string; size: number; type: string; addedAt: string; dataUrl: string };

function readStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

/** The system whose equipment the open record belongs to — notes are stored per system on the server. */
const EquipmentSystemContext = createContext<string | undefined>(undefined);

const NOTE_ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin", reseller_admin: "Reseller Admin", company_admin: "Customer Admin",
  system_operator: "System Operator", system_viewer: "System Viewer",
};
const noteRoleLabel = (role: string | null | undefined) => (role ? NOTE_ROLE_LABEL[role] || role.replaceAll("_", " ") : "Role not recorded");

function EquipmentRecordTabs({ recordKey, active, onChange, generatedDocument, includeSummary = false }: { recordKey: string; active: DetailTab; onChange: (tab: DetailTab) => void; generatedDocument?: React.ReactNode; includeSummary?: boolean }) {
  const { data: me } = useMe(true);
  const systemId = useContext(EquipmentSystemContext);
  const legacyNotesKey = `cpc:equipment-notes:${recordKey}`;
  const documentsKey = `cpc:equipment-documents:${recordKey}`;
  // Notes live in the database (shared by every user who can view this system), not in this browser.
  const { data: notes = [], isLoading: notesLoading, isError: notesError } = useEquipmentNotes(systemId, recordKey);
  const addNote = useAddEquipmentNote(systemId, recordKey);
  const deleteNote = useDeleteEquipmentNote(systemId, recordKey);
  const canAddNotes = Boolean(me?.role) && me?.role !== "system_viewer";
  const [documents, setDocuments] = useState<StoredDocument[]>(() => readStored(documentsKey, []));
  const [draft, setDraft] = useState("");
  // One-time move of notes this user wrote earlier (when notes were kept only in their own browser)
  // into the shared store, keeping their original time. Other users' leftover browser notes can't be
  // attributed safely from here, so they're left in place untouched.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current || !systemId || !me?.id || !canAddNotes) return;
    const stored = readStored<Array<StoredNote | string>>(legacyNotesKey, []);
    if (!Array.isArray(stored) || !stored.length) return;
    migratedRef.current = true;
    const mine = stored.filter((note): note is StoredNote => typeof note !== "string" && note.authorId === me.id && Boolean(note.text?.trim()));
    const others = stored.filter((note) => typeof note === "string" || note.authorId !== me.id);
    if (!mine.length) return;
    Promise.all(mine.map((note) => addNote.mutateAsync({ text: note.text, ...(note.createdAt ? { created_at: note.createdAt } : {}) })))
      .then(() => { if (others.length) localStorage.setItem(legacyNotesKey, JSON.stringify(others)); else localStorage.removeItem(legacyNotesKey); })
      .catch(() => { migratedRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId, me?.id, canAddNotes, legacyNotesKey]);
  const saveDocuments = (next: StoredDocument[]) => {
    setDocuments(next);
    try { localStorage.setItem(documentsKey, JSON.stringify(next)); } catch { /* Browser storage full: keep the current-session copy. */ }
  };
  const addFiles = async (files: FileList | null) => {
    const selected = Array.from(files || []);
    const added = await Promise.all(selected.map((file) => new Promise<StoredDocument>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, size: file.size, type: file.type, addedAt: new Date().toISOString(), dataUrl: String(reader.result) });
      reader.readAsDataURL(file);
    })));
    if (added.length) saveDocuments([...documents, ...added]);
  };
  return <>
    <div className="equipment-record-tabs" role="tablist">
      {(["details", ...(includeSummary ? ["summary"] : []), "notes", "documents"] as DetailTab[]).map((tab) => <button type="button" role="tab" aria-selected={active === tab} className={active === tab ? "active" : ""} onClick={() => onChange(tab)} key={tab}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
    </div>
    {active === "notes" && <div className="equipment-record-pane">
      {canAddNotes && <div className="equipment-note-compose"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a note about this equipment..." /><button type="button" disabled={!draft.trim() || !me || !systemId || addNote.isPending} onClick={() => {
        if (!me || !draft.trim()) return;
        addNote.mutate({ text: draft.trim() }, { onSuccess: () => setDraft("") });
      }}>{addNote.isPending ? "Saving..." : "Add Note"}</button></div>}
      {notesLoading ? <p className="equipment-record-empty">Loading notes...</p>
        : notesError ? <p className="equipment-record-empty">Could not load notes for this equipment.</p>
        : notes.length ? <div className="equipment-note-list">{notes.map((note) => <div className="equipment-note" key={note.id}><div className="equipment-note-content"><span>{note.text}</span><small><b>{note.author_name}</b>{note.author_email && note.author_email !== note.author_name ? ` · ${note.author_email}` : ""} · {noteRoleLabel(note.author_role)} · {new Date(note.created_at).toLocaleString()}</small></div>{note.can_delete && <button type="button" aria-label="Remove note" disabled={deleteNote.isPending} onClick={() => deleteNote.mutate(note.id)}>×</button>}</div>)}</div>
        : <p className="equipment-record-empty">No notes yet for this equipment.</p>}
    </div>}
    {active === "documents" && <div className="equipment-record-pane">
      <label className="equipment-document-drop">⇧<strong>Choose files to upload</strong><small>Manuals, drawings, photos, and reports</small><input type="file" multiple onChange={(event) => addFiles(event.target.files)} /></label>
      {generatedDocument}
      {documents.length ? <div className="equipment-document-list">{documents.map((document, index) => <div className="equipment-document" key={`${document.name}-${index}`}><div><b>{document.name}</b><small>{Math.max(1, Math.round(document.size / 1024))} KB · added {new Date(document.addedAt).toLocaleDateString()}</small></div><span><a href={document.dataUrl} download={document.name}>↓</a><button type="button" aria-label="Remove document" onClick={() => saveDocuments(documents.filter((_, i) => i !== index))}>×</button></span></div>)}</div> : <p className="equipment-record-empty">No documents uploaded for this equipment.</p>}
    </div>}
  </>;
}

/** Disable alarms for one asset from its popup header. Same durations, required reason, automatic
 * re-enable and badge as the system page's control. The backend posts each disable/re-enable as a
 * system event and adds it to this asset's Notes (same recordKey as the popup's Notes tab). */
function useAssetAlarmDisable(recordKey: string) {
  const systemId = useContext(EquipmentSystemContext);
  const { data } = useAssetAlarmDisables(systemId);
  return { systemId, canControl: Boolean(data?.can_control), active: data?.disables.find((item) => item.record_key === recordKey) };
}

function AssetAlarmDisableControl({ recordKey, assetName }: { recordKey: string; assetName: string }) {
  const { systemId, canControl, active } = useAssetAlarmDisable(recordKey);
  const disableAlarms = useDisableAssetAlarms(systemId, recordKey);
  const enableAlarms = useEnableAssetAlarms(systemId, recordKey);
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState<AlarmDisableDuration>("1h");
  const [reason, setReason] = useState("");
  if (!systemId || !canControl) return null;
  return <>
    {active
      ? <button type="button" className="alarm-disable-control enable" disabled={enableAlarms.isPending} onClick={() => enableAlarms.mutate()}>Re-enable alarms</button>
      : <button type="button" className="alarm-disable-control" onClick={() => setOpen(true)}>Disable alarms</button>}
    {/* Portaled to <body> so it stacks above the equipment popup rather than inside its scroll box. */}
    {open && createPortal(<Modal title={`Disable alarms — ${assetName}`} onClose={() => setOpen(false)}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim()) return;
        disableAlarms.mutate({ asset_name: assetName, duration, reason: reason.trim() }, { onSuccess: () => { setOpen(false); setReason(""); } });
      }}>
        <p className="alarm-disable-warning">Alarm notifications for <b>{assetName}</b> will be suppressed. Live telemetry and alarm records will continue to be monitored. This is recorded in the asset's Notes.</p>
        <div className="form-row"><label>Duration *</label><select value={duration} onChange={(event) => setDuration(event.target.value as AlarmDisableDuration)}><option value="1h">1 hour</option><option value="4h">4 hours</option><option value="8h">8 hours</option><option value="24h">24 hours</option><option value="indefinite">Until turned back on</option></select></div>
        <div className="form-row"><label>Reason *</label><textarea required minLength={3} maxLength={2000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why alarms are being disabled" /></div>
        {disableAlarms.isError && <p className="form-error">Unable to disable alarms. Check your access and try again.</p>}
        <div className="modal-actions"><button type="button" className="header-btn" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="header-btn danger" disabled={reason.trim().length < 3 || disableAlarms.isPending}>{disableAlarms.isPending ? "Disabling…" : "Disable alarms"}</button></div>
      </form>
    </Modal>, document.body)}
  </>;
}

/** Shown to everyone who can open the popup, not only roles with control — same as the system badge. */
function AssetAlarmDisableBadge({ recordKey }: { recordKey: string }) {
  const { active } = useAssetAlarmDisable(recordKey);
  if (!active) return null;
  return <div className="alarms-disabled-badge asset-alarms-disabled-badge">
    <strong><IconAlert size={13} /> Alarms disabled</strong>
    <span>By {active.disabled_by_name || active.disabled_by_email || "Unknown"} on {active.disabled_at ? new Date(active.disabled_at).toLocaleString() : "—"}</span>
    <span>Reason: {active.reason}</span>
    <span>{active.indefinite ? "Until turned back on · reminder emails every 24 hours" : `Ends ${active.disabled_until ? new Date(active.disabled_until).toLocaleString() : "—"}`}</span>
  </div>;
}

const cleanPanelText = (value: unknown) => String(value ?? "")
  .replace(/(?:—|–|�|�)+/g, "—")
  .replace(/\s*—+\s*/g, " — ")
  .trim();

function downloadPanelSchedulePdf(piece: WizardPiece, fedFrom: string, emergency = false, customerLogo?: string | null, customerName?: string) {
  const circuits = (piece.meta?.circuits as WizardCircuit[] | undefined) || [];
  const voltage = String(piece.meta?.voltage || "-");
  const amps = String(piece.meta?.mainAmps || "-").replace(/\s*A?\s*Main$/i, "");
  const safe = (value: unknown) => cleanPanelText(value).replace(/[^\x20-\x7E]/g, "-").replace(/([\\()])/g, "\\$1");
  const rows = Array.from({ length: Math.ceil(circuits.length / 2) }, (_, index) => [circuits[index * 2], circuits[index * 2 + 1]]);
  const escapeHtml = (value: unknown) => cleanPanelText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const htmlRows = rows.map(([left, right]) => `<tr><td>${escapeHtml(left?.ckt || "")}</td><td class="${left?.load?.toLowerCase() === "spare" ? "spare" : ""}">${escapeHtml(left?.load || "")}</td><td>${escapeHtml(right?.ckt || "")}</td><td class="${right?.load?.toLowerCase() === "spare" ? "spare" : ""}">${escapeHtml(right?.load || "")}</td></tr>`).join("");
  const htmlDocument = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(piece.name)} — Panel Schedule</title><style>
    *{box-sizing:border-box}body{margin:0;padding:28px;background:#eaf1f7;color:#0b1d31;font-family:Arial,sans-serif}.actions{max-width:1120px;margin:0 auto 14px}.actions button{padding:11px 16px;border:0;border-radius:7px;background:#0b1d31;color:#fff;font-weight:800;cursor:pointer}.sheet{max-width:1120px;margin:auto;overflow:hidden;border-radius:12px;background:#fff;box-shadow:0 12px 35px rgba(14,42,70,.16)}.brand{display:flex;align-items:center;gap:14px;padding:20px 24px;background:linear-gradient(120deg,#071a2d,#0d3557);color:#fff}.brand-logos{display:flex;align-items:center;gap:10px}.brand-logo-card{display:grid;place-items:center;width:104px;height:52px;padding:4px;overflow:hidden;border-radius:7px;background:#fff}.brand-logo-card img{display:block;width:100%;height:100%;object-fit:contain}.brand-logo-card.customer img{transform:scale(2.25);transform-origin:center}.brand-main{display:flex;flex:1;flex-direction:column;gap:3px}.brand-main strong{font-size:18px}.brand-main span{color:#9fc2df;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.brand small{color:#b8d0e5;line-height:1.5;text-align:right;text-transform:uppercase}.title{display:flex;align-items:center;justify-content:space-between;padding:22px 24px 17px;border-bottom:1px solid #d7e3ef;background:linear-gradient(90deg,#f3f9ff,#fff)}.title span{color:#1680ca;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}h1{margin:5px 0 0;font-size:27px}.status{padding:8px 15px;border-radius:999px;background:${emergency ? "#e7373f" : "#16a760"};color:#fff;font-size:10px;letter-spacing:.06em;text-transform:uppercase}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;padding:15px 24px;background:#eef6fd}.meta div{display:flex;flex-direction:column;gap:5px;padding:11px 13px;border:1px solid #d3e3f1;border-radius:8px;background:#fff;color:#607b93;font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.meta b{color:#0b1d31;font-size:14px;text-transform:none}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:11px;border:1px solid #237bb5;background:#1680ca;color:#fff;font-size:10px;letter-spacing:.04em;text-align:left;text-transform:uppercase}td{padding:9px 11px;border:1px solid #d5e0ea}tbody tr:nth-child(even){background:#f4f8fc}th:nth-child(1),th:nth-child(3),td:nth-child(1),td:nth-child(3){width:54px;text-align:center}.spare{color:#77889a;font-style:italic}footer{display:flex;justify-content:space-between;padding:13px 24px;background:#0b1d31;color:#9eb8d5;font-size:10px}footer b{color:#fff}@media print{body{padding:0;background:#fff}.actions{display:none}.sheet{max-width:none;border-radius:0;box-shadow:none}@page{size:landscape;margin:10mm}}@media(max-width:700px){.meta{grid-template-columns:1fr}.brand>small{display:none}.brand-logo-card{width:78px}h1{font-size:20px}}
  </style></head><body><div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div><main class="sheet"><header class="brand"><div class="brand-logos"><div class="brand-logo-card"><img src="/images/cpc-logo.png" alt="CPC"></div>${customerLogo ? `<div class="brand-logo-card customer"><img src="${escapeHtml(customerLogo)}" alt="${escapeHtml(customerName || "Customer")} logo"></div>` : ""}</div><div class="brand-main"><strong>Critical Power Command</strong><span>${escapeHtml(customerName || "Emergency Power Management Platform")}</span></div><small>Equipment Document<br>Generated ${escapeHtml(new Date().toLocaleDateString())}</small></header><section class="title"><div><span>Electrical Distribution</span><h1>${escapeHtml(piece.name)} — Panel Schedule</h1></div><b class="status">${emergency ? "Emergency" : "Normal"}</b></section><section class="meta"><div>Panel Name<b>${escapeHtml(piece.name)}</b></div><div>Rated Voltage<b>${escapeHtml(voltage)}</b></div><div>Rated Amperage<b>${escapeHtml(amps)}A</b></div></section><table><thead><tr><th>CKT</th><th>Load Description</th><th>CKT</th><th>Load Description</th></tr></thead><tbody>${htmlRows}</tbody></table><footer><span>Auto-generated from the current CPC One-Line equipment record.</span><b>Critical Power Command · Controlled Document</b></footer></main></body></html>`;
  const htmlUrl = URL.createObjectURL(new Blob([htmlDocument], { type: "text/html;charset=utf-8" }));
  const htmlLink = document.createElement("a"); htmlLink.href = htmlUrl; htmlLink.download = `${piece.name}-panel-schedule.html`; htmlLink.click();
  setTimeout(() => URL.revokeObjectURL(htmlUrl), 1000);
  return;
  const commands = [
    "0.8 w", "0.035 0.11 0.2 rg 30 520 782 45 re f", "1 1 1 rg BT /F1 11 Tf 44 548 Td (CPC  |  CRITICAL POWER COMMAND) Tj ET", "0.55 0.75 0.95 rg BT /F1 7 Tf 44 532 Td (EMERGENCY POWER MANAGEMENT PLATFORM) Tj ET",
    "0.05 0.23 0.4 rg 30 467 782 53 re f", "1 1 1 rg BT /F1 20 Tf 44 493 Td", `(${safe(piece.name)} - PANEL SCHEDULE) Tj`, "ET", "0.75 0.88 1 rg BT /F1 8 Tf 44 477 Td", `(Auto-generated equipment record  |  ${safe(new Date().toLocaleDateString())}) Tj ET`,
    emergency ? "0.9 0.15 0.17 rg 680 481 112 22 re f" : "0.08 0.65 0.32 rg 680 481 112 22 re f", "1 1 1 rg BT /F1 8 Tf 702 489 Td", `(${emergency ? "EMERGENCY" : "NORMAL"}) Tj ET`,
    "0.92 0.96 1 rg 30 420 782 39 re f", "0.05 0.12 0.2 rg BT /F1 8 Tf 44 442 Td", `(PANEL  ${safe(piece.name)}     VOLTAGE  ${safe(voltage)}     AMPERAGE  ${safe(amps)}A) Tj ET`,
    "0.08 0.45 0.72 rg 30 393 782 27 re f", "1 1 1 rg BT /F1 9 Tf 44 403 Td (CKT) Tj 43 0 Td (LOAD DESCRIPTION) Tj 347 0 Td (CKT) Tj 43 0 Td (LOAD DESCRIPTION) Tj ET",
  ];
  rows.forEach(([left, right], index) => {
    const y = 365 - index * 28;
    commands.push(index % 2 ? "0.95 0.97 0.99 rg" : "1 1 1 rg", `30 ${y} 782 28 re f`, "0.72 0.78 0.84 RG", `30 ${y} 782 28 re S`, `75 ${y} m 75 ${y + 28} l S`, `421 ${y} m 421 ${y + 28} l S`, `466 ${y} m 466 ${y + 28} l S`, "0.05 0.1 0.16 rg", `BT /F1 9 Tf 49 ${y + 10} Td (${safe(left?.ckt || "")}) Tj 38 0 Td (${safe(left?.load || "")}) Tj 347 0 Td (${safe(right?.ckt || "")}) Tj 38 0 Td (${safe(right?.load || "")}) Tj ET`);
  });
  commands.push("0.25 0.35 0.45 rg BT /F1 7 Tf 30 25 Td (Generated by Critical Power Command - Controlled equipment document) Tj ET");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const link = document.createElement("a"); link.href = url; link.download = `${piece.name}-panel-schedule.pdf`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const generatorHasAlarm = (data?: Partial<GeneratorTelemetry>) => Boolean(
  data?.fault_active ||
  data?.low_fuel_alarm ||
  data?.low_oil_pressure_alarm ||
  data?.high_temperature_alarm ||
  data?.low_battery_alarm ||
  data?.overload_alarm ||
  data?.status === "FAULT"
);

const generatorStatusClass = (data?: Partial<GeneratorTelemetry>) => {
  if (!data || data.communication_healthy === false || data.status === "OFFLINE") return "device-communication-state";
  if (data?.running || data?.status === "RUNNING") return "generator-running-state";
  if (generatorHasAlarm(data) || data?.auto_mode === false) return "generator-warning-state";
  return "ready";
};

const hasDeviceDataPath = (device: ATS | Generator) => Boolean(device.mqtt_topic?.trim() || device.power_mqtt_topic?.trim());
const deviceDisplayStatus = (device: ATS | Generator, data?: Partial<AtsTelemetry> | Partial<GeneratorTelemetry>) => {
  if (!hasDeviceDataPath(device)) return "NO DATA";
  if (!data || data.communication_healthy === false || data.status === "OFFLINE") return "OFFLINE";
  return data.status || "OFFLINE";
};

const formatDuration = (seconds?: number) => {
  if (seconds === undefined || seconds === null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

type Alarm = { id: string; message: string; severity: string; occurred_at: string; ack_by?: string | null };
type ActivityItem = { id: string; message: string; severity: string; occurred_at?: string | null; ack_by?: string | null };

function eventTone(alarm: ActivityItem) {
  if (alarm.ack_by) return "resolved";
  if (alarm.severity === "critical" || alarm.severity === "alarm" || alarm.severity === "emergency") return "critical";
  if (alarm.severity === "warning") return "warning";
  return "info";
}

function EventsPanel({ alarms, events }: { alarms: Alarm[]; events: ActivityItem[] }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"events" | "alarms">("events");
  const items = mode === "events" ? events : alarms;
  const sorted = [...items].sort((a, b) => new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime());
  const visible = sorted.slice(0, 25);
  const remaining = sorted.length - visible.length;
  const emptyText = mode === "events" ? "No active events for this system." : "No active alarms for this system.";
  return <div className="operations-events-panel">
    <div className="operations-events-head">
      <div className="operations-events-title">{mode === "events" ? "Active Events" : "Active Alarms"}</div>
      <div className="operations-events-toggle" role="tablist" aria-label="Activity type">
        <button type="button" className={mode === "events" ? "active" : ""} onClick={() => setMode("events")}>Events</button>
        <button type="button" className={mode === "alarms" ? "active" : ""} onClick={() => setMode("alarms")}>Alarms</button>
      </div>
    </div>
    <ul className="operations-events-list">
      {visible.map((item) => {
        const tone = eventTone(item);
        const Icon = tone === "resolved" ? IconCheckCircle : tone === "info" ? IconBell : IconAlert;
        return <li className={`event-${tone}`} key={item.id}>
          <time>{item.occurred_at ? new Date(item.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}</time>
          <Icon size={12} strokeWidth={2.5} />
          <span>{item.message}</span>
        </li>;
      })}
      {!visible.length && <li className="operations-events-empty">{emptyText}</li>}
    </ul>
    {remaining > 0 && <button type="button" className="operations-events-more" onClick={() => navigate("/alarms")}>+{remaining} Additional Events…</button>}
  </div>;
}

function EquipmentFaceplate({ systemName, ats, generator, nameplate, atsTelemetry, generatorTelemetry, onClose, extraSection, alwaysShowSourceAvailability, fedFromLabel, connectedLoads = [], alarms = [], reports = [], fuelTanks = [], fuelTankTelemetry = [], onTankClick }: { systemName: string; ats?: ATS; generator?: Generator; nameplate?: MonitoredAsset; atsTelemetry?: Partial<AtsTelemetry>; generatorTelemetry?: Partial<GeneratorTelemetry>; onClose: () => void; extraSection?: React.ReactNode; alwaysShowSourceAvailability?: boolean; fedFromLabel?: string; connectedLoads?: string[]; alarms?: AlarmRecord[]; reports?: ReportListItem[]; fuelTanks?: MonitoredAsset[]; fuelTankTelemetry?: Array<{ equipment_id: string; level_percent?: number; volume_gallons?: number; timestamp?: string; communication_healthy?: boolean }>; onTankClick?: (tank: MonitoredAsset) => void }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DetailTab>("details");
  const isAts = Boolean(ats);
  const telemetry = isAts ? atsTelemetry : generatorTelemetry;
  const name = ats?.name || generator?.name || "Equipment";
  const ratedVolts = ats?.rated_volts ?? generator?.rated_volts;
  const ratedAmps = ats?.rated_amps ?? generator?.rated_amps ?? undefined;
  const branch = ats?.branch;
  const branchText = branch === "life-safety" ? "Life Safety" : branch === "critical" ? "Critical" : "Equipment";
  const branchTone = branch === "life-safety" ? "life-safety" : branch === "critical" ? "critical" : "equipment";
  const onNormal = atsTelemetry?.connected_source !== "GENERATOR";
  const emergencyConnected = isAts && atsTelemetry?.connected_source === "GENERATOR";
  const normalAvailable = Boolean(atsTelemetry?.utility_available);
  const emergencyAvailable = Boolean(atsTelemetry?.generator_available);

  const configured = isAts ? Boolean(ats && hasDeviceDataPath(ats)) : Boolean(generator && hasDeviceDataPath(generator));
  const bannerText = !configured ? "NO DATA" : !telemetry || telemetry.communication_healthy === false || telemetry.status === "OFFLINE" ? "OFFLINE" : isAts
    ? (atsTelemetry?.status === "EMERGENCY" ? "EMERGENCY" : atsTelemetry?.status === "FAULT" ? "FAULT" : atsTelemetry?.status === "TRANSFERING" ? "TRANSFERRING" : "READY")
    : (generatorTelemetry?.status === "RUNNING" ? "RUNNING" : generatorTelemetry?.status === "FAULT" ? "FAULT" : generatorTelemetry?.status === "TEST" ? "TEST MODE" : "READY");
  const bannerTone = bannerText === "EMERGENCY" || bannerText === "FAULT" || bannerText === "RUNNING" ? "emergency" : bannerText === "TRANSFERRING" || bannerText === "TEST MODE" ? "warning" : bannerText === "OFFLINE" || bannerText === "NO DATA" ? "offline" : "ready";

  const kva = generatorTelemetry?.apparent_power_kva;
  const kw = generatorTelemetry?.active_power_kw;
  const kvar = kva !== undefined && kw !== undefined ? Math.sqrt(Math.max(0, kva * kva - kw * kw)) : undefined;

  const manufacturer = nameplate?.manufacturer || (isAts ? ats?.manufacturer : generator?.make);
  const model = nameplate?.model || (isAts ? ats?.model : generator?.model);
  const serial = nameplate?.serial_number || ats?.serial_number || generator?.serial_number;
  const nameplateAmps = nameplate?.rating_amps ?? ratedAmps;
  const nameplateVolts = nameplate?.voltage ?? ratedVolts;
  const nameplateKw = nameplate?.rating_kw ?? generator?.rated_kw;
  const nameplateKva = nameplate?.rating_kva ?? generator?.rated_kva;
  const equipmentLocation = nameplate?.location || generator?.location;
  const metaLine2 = [systemName, equipmentLocation].filter(Boolean).join(" | ");
  // Shared by the Notes tab and the alarm-disable control, so disable/re-enable notes land on this asset.
  const recordKey = `${systemName}:${isAts ? "ats" : "generator"}:${ats?.id || generator?.id || name}`;

  const generatorAlarms = generator ? alarmOnly(alarms).filter((alarm) => alarm.status === "active" && [generator.id, generator.name].some((value) => alarm.device_label?.toLowerCase() === value.toLowerCase())) : [];
  const lastRun = generator ? reports.filter((report) => ["gen-run", "test"].includes(report.type)).sort((a, b) => b.report_date.localeCompare(a.report_date))[0] : undefined;
  const atsReports = ats ? reports
    .filter((report) => report.ats_details?.some((detail) => detail.ats_name.toLowerCase() === ats.name.toLowerCase()) || report.initiating_ats?.toLowerCase() === ats.name.toLowerCase())
    .sort((a, b) => `${b.report_date}T${b.time_label || "00:00:00"}`.localeCompare(`${a.report_date}T${a.time_label || "00:00:00"}`)) : [];
  const lastTransferReport = atsReports[0];
  const lastTransferDetail = lastTransferReport?.ats_details?.find((detail) => detail.ats_name.toLowerCase() === ats?.name.toLowerCase());
  const lastTestReport = atsReports.find((report) => report.type === "test" || report.event_type?.toLowerCase().includes("test"));
  const lastTransferAt = lastTransferDetail?.switched_to_emergency || lastTransferDetail?.switched_to_normal || (lastTransferReport ? `${lastTransferReport.report_date}${lastTransferReport.time_label ? `T${lastTransferReport.time_label}` : ""}` : undefined);
  const transferType = lastTransferReport ? (lastTransferReport.type === "test" || lastTransferReport.event_type?.toLowerCase().includes("test") ? "Test" : "Emergency") : undefined;
  const timeToBus = lastTransferDetail?.time_to_bus_sec ?? atsTelemetry?.time_on_emergency_seconds;
  const timeToRexfer = lastTransferDetail?.time_to_available_sec ?? atsTelemetry?.transfer_time_seconds;
  const nfpaLimitedBranch = branch === "life-safety" || branch === "critical";
  const formatReportDate = (date?: string | null) => date ? new Date(date.includes("T") ? date : `${date}T00:00:00`).toLocaleString([], date.includes("T") ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }) : "No record";

  return <Modal title="" onClose={onClose} className="equipment-detail-modal">
    <button type="button" className="equipment-popup-close" aria-label="Close equipment details" onClick={onClose}>x</button>
    <div className="faceplate-v2" role="dialog" aria-label={`${name} details`}>
      <header className="faceplate-v2-header">
        <div>
          <h3>{name}</h3>
          <p className="faceplate-v2-line2">{metaLine2}</p>
        </div>
        <div className="faceplate-v2-header-actions">
          <AssetAlarmDisableControl recordKey={recordKey} assetName={name} />
          {isAts && <span className={`faceplate-v2-branch-pill ${branchTone}`}>{branchText}</span>}
        </div>
      </header>
      <AssetAlarmDisableBadge recordKey={recordKey} />

      <div className="faceplate-v2-tag-row">
        {manufacturer && <div className="faceplate-v2-tag"><span>Make</span><b>{manufacturer}</b></div>}
        {model && <div className="faceplate-v2-tag"><span>Model</span><b>{model}</b></div>}
        {serial && <div className="faceplate-v2-tag"><span>Serial</span><b>{serial}</b></div>}
        {nameplateKw != null && <div className="faceplate-v2-tag"><span>Rated kW</span><b>{nameplateKw} kW</b></div>}
        {nameplateKva != null && <div className="faceplate-v2-tag"><span>Rated kVA</span><b>{nameplateKva} kVA</b></div>}
        {nameplateAmps != null && <div className="faceplate-v2-tag"><span>Rated Amps</span><b>{nameplateAmps} A</b></div>}
        {nameplateVolts != null && <div className="faceplate-v2-tag"><span>Rated Voltage</span><b>{nameplateVolts} V</b></div>}
        {isAts && nameplate?.poles && <div className="faceplate-v2-tag"><span>Poles</span><b>{nameplate.poles}</b></div>}
        {isAts && nameplate?.transition_type && <div className="faceplate-v2-tag"><span>Transition</span><b>{nameplate.transition_type}</b></div>}
      </div>

      <div className={`faceplate-v2-banner ${bannerTone}`}>{bannerText}</div>

      <div className="faceplate-v2-tab-content">
      <EquipmentRecordTabs recordKey={recordKey} active={activeTab} onChange={setActiveTab} includeSummary={!isAts} />

      {activeTab === "summary" && generator && <div className="generator-asset-summary">
        <div><span>Active alarms</span><b className={generatorAlarms.length ? "has-alarms" : "normal"}>{generatorAlarms.length}</b><small>{generatorAlarms.length ? generatorAlarms.map((alarm) => alarm.message).join(" · ") : "No active alarms"}</small></div>
        <div><span>Last test / run</span><b>{lastRun ? new Date(`${lastRun.report_date}T00:00:00`).toLocaleDateString() : "No record"}</b><small>{lastRun ? `${lastRun.type === "test" ? "Test" : "Generator run"}${lastRun.duration_label ? ` · ${lastRun.duration_label}` : ""}` : "No completed test or run report"}</small></div>
        <a href={`/analytics?view=generators&device=generator:${encodeURIComponent(generator.id)}`} onClick={(event) => { event.preventDefault(); navigate(`/analytics?view=generators&device=generator:${encodeURIComponent(generator.id)}`); }}><b>Trend generator data</b><small>Open this generator in CPC Analytics</small></a>
      </div>}

      {activeTab === "details" && <>{isAts ? (
        <>
          <div className="faceplate-v2-section-title">Source Status</div>
          <div className="faceplate-v2-source-grid">
            <div className="faceplate-v2-source-col">
              {alwaysShowSourceAvailability ? (
                <>
                  {/* Both boxes always read "Available" here — the switchgear always has both a utility
                      feed and a generator feed present; only "Connected To" says which one is in use. */}
                  <div className="faceplate-v2-source-box on available">
                    <span>Normal Source</span>
                    <b>Available</b>
                  </div>
                  <div className="faceplate-v2-source-box on available">
                    <span>Emergency Source</span>
                    <b>Available</b>
                  </div>
                </>
              ) : (
                <>
                  <div className={`faceplate-v2-source-box ${normalAvailable ? "on available" : "off unavailable"}`}>
                    <span>Normal Source</span>
                    <b>{normalAvailable ? "Available" : "Unavailable"}</b>
                  </div>
                  <div className={`faceplate-v2-source-box ${emergencyAvailable ? "on available" : "off unavailable"}`}>
                    <span>Emergency Source</span>
                    <b>{emergencyAvailable ? "Available" : "Unavailable"}</b>
                  </div>
                </>
              )}
            </div>
            <div className="faceplate-v2-source-col">
              <div className="faceplate-v2-info-box">
                <span>Connected to</span>
                <b className={onNormal ? "normal" : "emergency"}>{onNormal ? "Normal" : "Emergency"}</b>
              </div>
              <div className="faceplate-v2-info-box">
                <span>{fedFromLabel ? "Fed From" : emergencyConnected ? "Time on Emergency" : "Last Transfer"}</span>
                <b>{fedFromLabel || (emergencyConnected ? formatDuration(atsTelemetry?.time_on_emergency_seconds) : "—")}</b>
              </div>
            </div>
          </div>
          <div className="faceplate-v2-section-title">Transfer Data</div>
          <div className="ats-transfer-summary">
            <div><span>Last transfer</span><b>{formatReportDate(lastTransferAt)}</b></div>
            <div><span>Transfer type</span><b>{transferType || "No record"}</b></div>
            <div className={nfpaLimitedBranch && timeToBus != null && timeToBus > 10 ? "nfpa-exceeded" : ""}><span>Time to Bus</span><b>{timeToBus != null ? `${timeToBus} sec` : "No record"}</b>{nfpaLimitedBranch && timeToBus != null && timeToBus > 10 && <small>Exceeds 10-sec NFPA 110 limit</small>}</div>
            <div className={nfpaLimitedBranch && timeToRexfer != null && timeToRexfer > 10 ? "nfpa-exceeded" : ""}><span>Time to Re-xfer</span><b>{timeToRexfer != null ? `${timeToRexfer} sec` : "No record"}</b>{nfpaLimitedBranch && timeToRexfer != null && timeToRexfer > 10 && <small>Exceeds 10-sec NFPA 110 limit</small>}</div>
            <div><span>Last test</span><b>{formatReportDate(lastTestReport?.report_date)}</b></div>
          </div>
        </>
      ) : (
        <>
          <div className="faceplate-v2-section-title">Engine Data</div>
          <div className="faceplate-v2-engine-grid">
            <div className="faceplate-v2-engine-box"><span>Hours</span><b>{reading(generatorTelemetry?.engine_hours, 1, " hrs")}</b></div>
            <div className="faceplate-v2-engine-box"><span>Oil Pressure</span><b>{reading(generatorTelemetry?.oil_pressure_psi, 0, " PSI")}</b></div>
            <div className="faceplate-v2-engine-box"><span>H₂O Temp</span><b>{reading(generatorTelemetry?.coolant_temperature_c, 0, " °C")}</b></div>
            <div className="faceplate-v2-engine-box"><span>Battery</span><b>{reading(generatorTelemetry?.battery_voltage, 1, " V")}</b></div>
          </div>
          <div className="faceplate-metric-progress fuel"><div className="faceplate-metric-progress-label"><span>Fuel Level</span><b>{reading(generatorTelemetry?.fuel_level_percent, 0, "%")}</b></div><div className="faceplate-metric-progress-track"><i style={{ width: `${Math.max(0, Math.min(100, generatorTelemetry?.fuel_level_percent ?? 0))}%` }} /></div></div>
          {fuelTanks.length > 0 && <div className="generator-tank-links"><div className="faceplate-v2-section-title">Fuel Tanks</div>{fuelTanks.map((tank) => { const live = fuelTankTelemetry.find((item) => item.equipment_id === tank.id); return <button type="button" key={tank.id} onClick={() => onTankClick?.(tank)}><span><b>{tank.asset_tag}</b><small>{tank.tank_type || "Fuel tank"} · {tank.location || "Location not set"}</small></span><strong>{reading(live?.level_percent, 0, "%")}</strong></button>; })}</div>}
          {!fuelTanks.length && <div className="generator-tank-empty"><b>No fuel tank linked</b><span>Add a Fuel Tank in Device Administration, select this generator under “Generators this tank serves,” and configure its F1/FUEL topic.</span></div>}
        </>
      )}

      <div className="faceplate-v2-section-title">{isAts ? "Load Side Electrical Data" : "Electrical Data"}</div>
      <div className="faceplate-v2-electrical-grid">
        <div className="faceplate-v2-electrical-col">
          <div className="faceplate-v2-col-title">Voltage</div>
          <div className="faceplate-v2-row"><span>VAB</span><b>{reading(telemetry?.voltage_ab, 0, " V")}</b></div>
          <div className="faceplate-v2-row"><span>VBC</span><b>{reading(telemetry?.voltage_bc, 0, " V")}</b></div>
          <div className="faceplate-v2-row"><span>VCA</span><b>{reading(telemetry?.voltage_ca, 0, " V")}</b></div>
          <div className="faceplate-v2-row"><span>VAN</span><b>{reading(telemetry?.voltage_an, 0, " V")}</b></div>
          <div className="faceplate-v2-row"><span>VBN</span><b>{reading(telemetry?.voltage_bn, 0, " V")}</b></div>
          <div className="faceplate-v2-row"><span>VCN</span><b>{reading(telemetry?.voltage_cn, 0, " V")}</b></div>
        </div>
        <div className="faceplate-v2-electrical-col">
          <div className="faceplate-v2-col-title">Current</div>
          <div className="faceplate-v2-row"><span>Amps A</span><b>{reading(telemetry?.current_a, 0, " A")}</b></div>
          <div className="faceplate-v2-row"><span>Amps B</span><b>{reading(telemetry?.current_b, 0, " A")}</b></div>
          <div className="faceplate-v2-row"><span>Amps C</span><b>{reading(telemetry?.current_c, 0, " A")}</b></div>
          <div className="faceplate-v2-col-title">Frequency</div>
          <div className="faceplate-v2-row"><span>Hz</span><b>{reading(telemetry?.frequency, 0, " Hz")}</b></div>
        </div>
        <div className="faceplate-v2-electrical-col">
          <div className="faceplate-v2-col-title">Power</div>
          <div className="faceplate-v2-row"><span>kW</span><b>{reading(telemetry?.active_power_kw, 0, " kW")}</b></div>
          {!isAts && <>
            <div className="faceplate-v2-row"><span>kVA</span><b>{reading(generatorTelemetry?.apparent_power_kva, 0, " kVA")}</b></div>
            <div className="faceplate-v2-row"><span>kVAR</span><b>{reading(kvar, 0, " kVAR")}</b></div>
            <div className="faceplate-v2-row"><span>PF</span><b>{reading(generatorTelemetry?.power_factor, 2)}</b></div>
          </>}
        </div>
      </div>

      {!isAts && <div className="faceplate-metric-progress load"><div className="faceplate-metric-progress-label"><span>Generator Load</span><b>{reading(generatorTelemetry?.active_power_kw, 0, " kW")} · {reading(generatorTelemetry?.load_percentage, 0, "%")}</b></div><div className="faceplate-metric-progress-track"><i style={{ width: `${Math.max(0, Math.min(100, generatorTelemetry?.load_percentage ?? 0))}%` }} /></div></div>}

      {isAts && <>
        <div className="faceplate-v2-section-title">Connected Load</div>
        <div className={`faceplate-v2-load-box ${connectedLoads.length ? "has-loads" : "empty"}`}>{connectedLoads.length ? connectedLoads.map((load) => <span key={load}>{load}</span>) : "No connected loads configured"}</div>
      </>}

      {extraSection}</>}
      </div>
    </div>
  </Modal>;
}

function FuelTankFaceplate({ tank, telemetry, generators, onClose }: { tank: MonitoredAsset; telemetry?: { level_percent?: number; volume_gallons?: number; timestamp?: string; communication_healthy?: boolean }; generators: Generator[]; onClose: () => void }) {
  const served = generators.filter((generator) => tank.served_generator_ids?.includes(generator.id));
  const level = telemetry?.level_percent;
  const recordKey = `fuel-tank:${tank.id}`;
  const [activeTab, setActiveTab] = useState<DetailTab>("details");
  return <Modal title="" onClose={onClose} className="equipment-detail-modal fuel-tank-detail-modal">
    <button type="button" className="equipment-popup-close" aria-label="Close fuel tank details" onClick={onClose}>x</button>
    <div className="faceplate-v2">
      <header className="faceplate-v2-header"><div><h3>{tank.asset_tag}</h3><p className="faceplate-v2-line2">{tank.location || "Location not set"} | Fuel Tank</p></div><div className="faceplate-v2-header-actions"><AssetAlarmDisableControl recordKey={recordKey} assetName={tank.asset_tag} /><span className={`tank-communication ${telemetry?.communication_healthy ? "online" : "offline"}`}>{telemetry?.communication_healthy ? "LIVE" : tank.mqtt_topic ? "OFFLINE" : "NO DATA"}</span></div></header>
      <AssetAlarmDisableBadge recordKey={recordKey} />
      <div className="faceplate-v2-tag-row"><div className="faceplate-v2-tag">{tank.tank_type || "Tank type not set"}</div>{tank.capacity_gal != null && <div className="faceplate-v2-tag">{tank.capacity_gal} gal capacity</div>}{tank.construction && <div className="faceplate-v2-tag">{tank.construction}</div>}{tank.tank_gauge_model && <div className="faceplate-v2-tag">{tank.tank_gauge_model}</div>}</div>
      <EquipmentRecordTabs recordKey={recordKey} active={activeTab} onChange={setActiveTab} />
      {activeTab === "details" && <>
      <div className="tank-level-summary"><span>Current fuel level</span><b>{reading(level, 0, "%")}</b><small>{telemetry?.volume_gallons != null ? `${telemetry.volume_gallons.toFixed(1)} gallons` : "Volume unavailable"}</small><div className="tank-level-track" aria-label={`Fuel level ${level ?? 0}%`}><i style={{ width: `${Math.max(0, Math.min(100, level ?? 0))}%` }} /></div></div>
      <div className="faceplate-v2-section-title">Generators served</div>
      <div className="tank-served-generators">{served.length ? served.map((generator) => <span key={generator.id}><b>{generator.name}</b><small>{[generator.make, generator.model].filter(Boolean).join(" ") || "Generator"}</small></span>) : <p>No generators linked to this tank.</p>}</div>
      <dl className="tank-asset-details"><div><dt>Asset ID</dt><dd>{tank.id}</dd></div><div><dt>Level topic</dt><dd>{tank.mqtt_topic || "Not configured"}</dd></div><div><dt>Low-level threshold</dt><dd>{tank.low_level_percent != null ? `${tank.low_level_percent}%` : "Not set"}</dd></div><div><dt>Last update</dt><dd>{telemetry?.timestamp ? new Date(telemetry.timestamp).toLocaleString() : "No telemetry received"}</dd></div></dl>
      </>}
    </div>
  </Modal>;
}

function UtilityFaceplate({ systemName, leadBreaker, entryBreaker, switchgearName, onClose }: { systemName: string; leadBreaker?: WizardPiece; entryBreaker?: WizardPiece; switchgearName?: string; onClose: () => void }) {
  return <Modal title="" onClose={onClose} className="equipment-detail-modal">
    <button type="button" className="equipment-popup-close" aria-label="Close utility details" onClick={onClose}>x</button>
    <div className="faceplate-v2" role="dialog" aria-label="Utility details">
      <header className="faceplate-v2-header">
        <div><h3>Utility</h3><p className="faceplate-v2-line2">{systemName} | Normal power source</p></div>
        <span className="faceplate-v2-branch-pill blue">Normal Source</span>
      </header>
      <div className="faceplate-v2-tag-row"><div className="faceplate-v2-tag">Electrical Utility</div><div className="faceplate-v2-tag">Grid Supply</div></div>
      <div className="faceplate-v2-banner ready">AVAILABLE</div>
      <div className="faceplate-v2-section-title">Connection Path</div>
      <div className="faceplate-v2-source-grid">
        <div className="faceplate-v2-source-col">
          <div className="faceplate-v2-source-box on normal"><span>Source</span><b>Utility</b></div>
          <div className="faceplate-v2-info-box"><span>First Breaker</span><b>{leadBreaker?.name || "Direct connection"}</b></div>
        </div>
        <div className="faceplate-v2-source-col">
          <div className="faceplate-v2-info-box"><span>Incomer</span><b>{entryBreaker?.name || "Direct connection"}</b></div>
          <div className="faceplate-v2-info-box"><span>Feeds</span><b className="normal">{switchgearName || "Switchgear"}</b></div>
        </div>
      </div>
      <div className="faceplate-v2-section-title">Supply Status</div>
      <div className="faceplate-v2-electrical-grid utility-detail-grid">
        <div className="faceplate-v2-electrical-col"><div className="faceplate-v2-col-title">Source</div><div className="faceplate-v2-row"><span>Type</span><b>UTILITY</b></div><div className="faceplate-v2-row"><span>Status</span><b>AVAILABLE</b></div></div>
        <div className="faceplate-v2-electrical-col"><div className="faceplate-v2-col-title">Connection</div><div className="faceplate-v2-row"><span>Position</span><b>CLOSED</b></div><div className="faceplate-v2-row"><span>Bus</span><b>ENERGIZED</b></div></div>
      </div>
    </div>
  </Modal>;
}

function TransformerSymbol({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className="sld-symbol sld-transformer-symbol">
    <circle cx="7.5" cy="10" r="5" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12.5" cy="10" r="5" stroke="currentColor" strokeWidth="1.8" />
  </svg>;
}

function UtilityTowerSymbol({ size = 46 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M27 5h10m-14 8h18M18 22h28M13 34h38M9 47h46M27 5 11 59m26-54 16 54M23 13l18 9-23 12 33 13-40 12m30-46-18 9 23 12-33 13 40 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 59h13m26 0h13" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
  </svg>;
}

function BreakerSymbol({ tone = "normal", position = "Closed", size = 30, strokeWidthPx = 2, centered = false }: { tone?: "normal" | "emergency" | "tie"; position?: "Closed" | "Open"; size?: number; strokeWidthPx?: number; centered?: boolean }) {
  // .sld-gear-connector (the straight wire above/below) is a fixed 2px-wide CSS bar; convert that
  // to viewBox units at this icon's own scale so the arc reads as the same thickness as the wire by
  // default. A bigger, more prominent breaker (strokeWidthPx above 2) needs a bolder stroke to match —
  // otherwise a bigger size alone actually reads as thinner/weaker, not bolder, since this keeps the
  // rendered stroke at a constant pixel width regardless of size unless told to scale it up too.
  const strokeWidth = (strokeWidthPx * 12) / size;
  // Rigid shift right (same shape, no stretch): 4px on screen, converted to this icon's viewBox units.
  // This matches the *old* wire convention (.sld-gear-connector's default margin:0 0 0 14px, a fixed
  // left offset, not centered) — still correct for the untouched real SingleLineDiagram, which still
  // uses that. Everywhere the wire is centered instead (margin:0 auto / align-items:center, no fixed
  // offset — the Result spine and this branch view, after fixing the same misalignment there earlier
  // this session), this rigid shift creates exactly that same offset all over again, just baked into
  // the icon itself instead of a stray margin — pass centered to draw the curve on the icon's true
  // center instead, matching a wire with no offset of its own.
  // Nudged 6px right of true center (rather than dead-on 6) — the wire itself still runs through the
  // exact center; only the curve's own peak shifts slightly, matching the requested visual balance.
  const cx = centered ? 6 + (6 * 12) / size : 6 + (4 * 12) / size;
  return <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ overflow: "visible" }} className={`sld-symbol sld-breaker-symbol ${position === "Open" ? "tie" : tone}`}>
    {position === "Open" ? <>
      {/* An open circuit breaker remains the same curved breaker device, with a visible break in the
          middle of the arc. A diagonal blade here reads as an ANSI disconnect switch, which is a
          different device and was misleading on generator output breakers. */}
      <path d={`M${cx} .5 A5.5 5.5 0 0 1 ${cx + 5.42} 5`} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
      <path d={`M${cx + 5.42} 7 A5.5 5.5 0 0 1 ${cx} 11.5`} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
    </> : <path d={`M${cx} 0.5 A5.5 5.5 0 0 1 ${cx} 11.5`} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />}
  </svg>;
}

export function SingleLineDiagram({ ats, generators, atsTelemetry, generatorTelemetry, onAtsClick, onGeneratorClick }: { ats: ATS[]; generators: Generator[]; atsTelemetry?: AtsTelemetry[]; generatorTelemetry?: GeneratorTelemetry[]; onAtsClick: (id: string) => void; onGeneratorClick: (id: string) => void }) {
  return <section className="system-sld" aria-label="Single line diagram">
    <header className="system-sld-header"><div><span>Power topology</span><h3>Single Line Diagram</h3></div><div className="system-sld-legend"><i className="normal" /> Normal source <i className="emergency" /> Emergency source</div></header>
    <div className="system-sld-canvas">
      <div className="system-sld-canvas-inner" style={{ minWidth: Math.max(700, ats.length * 110 + 260) }}>
        <div className="sld-sources">
          <div className="sld-utility-column">
            <div className="sld-source utility"><i><TransformerSymbol size={27} /></i><div><b>UTILITY</b><small>Normal source available</small></div></div>
            <span className="sld-gear-connector lead normal-source" aria-hidden="true" />
            <span className="sld-breaker-with-tag"><span className="sld-gear-icon"><BreakerSymbol tone="normal" size={34} /></span><div className="sld-breaker-tag normal-source">52-M1</div></span>
            <span className="sld-gear-connector tail normal-source" aria-hidden="true" />
          </div>
          <div className="sld-generators">{generators.map((generator, index) => {
            const data = resolveGeneratorTelemetry(generatorTelemetry, generator.id, generator.name);
            const running = Boolean(data?.running);
            const tone = running ? "emergency-source" : "normal-source";
            return <div className="sld-generator-column" key={generator.id}>
              <button type="button" className={`sld-generator ${tone}`} aria-label={`Open ${generator.name}`} title={`Open ${generator.name}`} onClick={() => onGeneratorClick(generator.id)}>
                <i>G</i><span>{generator.name}</span><small>{data?.status || "Waiting"}</small>
              </button>
              <span className={`sld-gear-connector ${tone}`} aria-hidden="true" />
              <span className="sld-breaker-with-tag"><BreakerSymbol tone={running ? "emergency" : "tie"} /><div className={`sld-breaker-tag ${tone}`}>52-G{index + 1}</div></span>
              <span className={`sld-gear-connector tail ${tone}`} aria-hidden="true" />
            </div>;
          })}</div>
        </div>
        <div className="sld-buses">
          <div className="sld-bus normal"><span>Normal bus</span></div>
          <div className="sld-bus emergency"><span>Emergency bus</span></div>
        </div>
        <div className="sld-ats-grid">{ats.map((item, index) => {
          const data = resolveAtsTelemetry(atsTelemetry, item.id, item.name);
          const onEmergency = data?.connected_source === "GENERATOR";
          return <div className={`sld-ats ${onEmergency ? "on-emergency" : "on-normal"}`} key={item.id}>
            <button type="button" className="sld-switch" aria-label={`Open ${item.name}: ${onEmergency ? "connected to emergency" : "connected to normal"}`} onClick={() => onAtsClick(item.id)}>
              <span className={`sld-terminal normal-terminal ${!onEmergency ? "active" : ""}`}>N</span>
              <span className={`sld-terminal emergency-terminal ${onEmergency ? "active" : ""}`}>E</span>
              <i className="sld-arm" />
              <span className="sld-terminal load-terminal" aria-hidden="true" />
            </button>
            <i className="sld-load-line" aria-hidden="true" />
            <b>{item.name}</b><small>{onEmergency ? "Connected to emergency" : "Connected to normal"}</small>
            <span className="sld-load-label">Load {index + 1}</span>
          </div>;
        })}</div>
        {!ats.length && <p className="operations-empty">No ATS units registered for this system.</p>}
      </div>
    </div>
  </section>;
}

const WIZARD_EQUIPMENT_TYPES: { key: string; label: string; sub?: string; badge?: string; icon: JSX.Element }[] = [
  { key: "container", label: "Container", sub: "Switchgear / Switchboard", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" /><line x1="4.5" y1="7.5" x2="15.5" y2="7.5" stroke="currentColor" strokeWidth="1.4" /><line x1="4.5" y1="11" x2="15.5" y2="11" stroke="currentColor" strokeWidth="1.4" /></svg> },
  { key: "breaker", label: "Breaker/Switch", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2 L4 11 H9 L8 18 L16 8 H11 Z" fill="#ef4444" /></svg> },
  { key: "transformer", label: "Transformer", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="7.5" cy="10" r="5" stroke="currentColor" strokeWidth="1.4" /><circle cx="12.5" cy="10" r="5" stroke="currentColor" strokeWidth="1.4" /></svg> },
  { key: "panel", label: "Panel", badge: "Load", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="2.5" width="14" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><line x1="7" y1="2.5" x2="7" y2="17.5" stroke="currentColor" strokeWidth="1.4" /><line x1="11.5" y1="2.5" x2="11.5" y2="17.5" stroke="currentColor" strokeWidth="1.4" /></svg> },
  { key: "equipment", label: "Equipment", badge: "Load", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="6" width="15" height="8" rx="3" stroke="currentColor" strokeWidth="1.4" /><circle cx="7" cy="10" r="1.1" fill="currentColor" /><circle cx="10" cy="10" r="1.1" fill="currentColor" /><circle cx="13" cy="10" r="1.1" fill="currentColor" /></svg> },
  { key: "area", label: "Area Served", badge: "Load", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2 L17 6 V14 L10 18 L3 14 V6 Z" stroke="currentColor" strokeWidth="1.4" /></svg> },
];

const LOAD_EQUIPMENT_TYPES: { key: string; label: string; icon: JSX.Element }[] = [
  { key: "boiler", label: "Boiler", icon: <svg viewBox="0 0 64 64" fill="none"><path d="M13 27h38v22H13a11 11 0 0 1 0-22Z" stroke="currentColor" /><path d="M18 27v22M48 27v22M20 49v5m25-5v5M17 54h31M24 27v-8m16 8V13h7v7h-4v7" stroke="currentColor" /><circle cx="24" cy="14" r="7" stroke="currentColor" /><path d="m24 14 4-3M24 7v3m-7 4h3M31 14h-3" stroke="currentColor" /><circle cx="34" cy="38" r="8" stroke="currentColor" /><path d="M34 43c-5-3-3-7 0-11 0 3 5 5 2 9" stroke="currentColor" strokeLinejoin="round" /></svg> },
  { key: "chiller", label: "Chiller", icon: <svg viewBox="0 0 64 64" fill="none"><rect x="10" y="20" width="44" height="32" rx="3" stroke="currentColor" /><path d="M15 20v32m34-32v32M18 16h28l4-6h10v7h-8l-3 4M7 27h3v18H7a3 3 0 0 1-3-3V30a3 3 0 0 1 3-3Zm47 0h3a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-3M20 30h11m-11 6h8m-8 6h6" stroke="currentColor" /><path d="M39 29v16m-7-12 14 8m0-8-14 8m7-12-3 4m3-4 3 4m4 0-4 1m4-1-1 4m0 4-3-1m3 1-1 4m-5 0 3-4m-3 4-3-4m-4 0 4-1m-4 1 1-4m0-4 3 1m-3-1 1-4" stroke="currentColor" strokeLinecap="round" /></svg> },
  { key: "cooling-tower", label: "Cooling Tower", icon: <svg viewBox="0 0 64 64" fill="none"><path d="M14 21h36l4 29H10l4-29Zm-1 6h38M11 47h42M15 50v6m10-6v6m14-6v6m10-6v6M14 35h36M14 35l12 12m-12 0 12-12m12 0 12 12m-12 0 12-12" stroke="currentColor" strokeLinejoin="round" /><circle cx="32" cy="31" r="6" stroke="currentColor" /><path d="M32 31c-1-5 5-5 4-1-.5 2-2 2-4 1Zm0 0c5-1 5 5 1 4-2-.5-2-2-1-4Zm0 0c1 5-5 5-4 1 .5-2 2-2 4-1Z" stroke="currentColor" /><path d="M19 17c-3-4 3-5 0-9m13 9c-3-4 3-5 0-9m13 9c-3-4 3-5 0-9" stroke="currentColor" strokeLinecap="round" /></svg> },
  { key: "elevator", label: "Elevator", icon: <svg viewBox="0 0 64 64" fill="none"><path d="M13 10h38v7h-3v38H16V17h-3v-7Zm10 45V22h18v33M32 22v33" stroke="currentColor" strokeLinejoin="round" /><rect x="25" y="11" width="14" height="9" rx="1" stroke="currentColor" /><path d="m29 16 3-4 3 4M50 26h9v19h-9zM54.5 30v5m-2-3 2-2 2 2m-2 9v-5m-2 3 2 2 2-2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  { key: "fan", label: "Fan / Air Handler", icon: <svg viewBox="0 0 64 64" fill="none"><rect x="10" y="9" width="44" height="44" rx="2" stroke="currentColor" /><circle cx="32" cy="31" r="17" stroke="currentColor" /><circle cx="32" cy="31" r="3" stroke="currentColor" /><path d="M32 28c-5-12 8-13 9-5 .5 5-4 7-9 8m3 0c12-5 13 8 5 9-5 .5-7-4-8-9m0 3c5 12-8 13-9 5-.5-5 4-7 9-8m-3 0c-12 5-13-8-5-9 5-.5 7 4 8 9M14 56h36" stroke="currentColor" strokeLinejoin="round" /><circle cx="15" cy="14" r="1" fill="currentColor" /><circle cx="49" cy="14" r="1" fill="currentColor" /><circle cx="15" cy="48" r="1" fill="currentColor" /><circle cx="49" cy="48" r="1" fill="currentColor" /></svg> },
  { key: "pump", label: "Pump", icon: <svg viewBox="0 0 64 64" fill="none"><path d="M8 50h49v6H8zM9 31h5v16H9zM15 35h5m22 0h4m12-2h3v13h-3" stroke="currentColor" /><circle cx="30" cy="38" r="12" stroke="currentColor" /><circle cx="30" cy="38" r="4" stroke="currentColor" /><path d="M30 26v-8h-5v-5h10v5h-5M42 30h7V24h9v28M46 29h12M46 47h12M49 34h9M49 39h9M49 44h9" stroke="currentColor" strokeLinejoin="round" /></svg> },
  { key: "air-compressor", label: "Air Compressor", icon: <svg viewBox="0 0 28 28" fill="none"><rect x="3" y="12" width="22" height="10" rx="4" stroke="currentColor" strokeWidth="1.8" /><circle cx="9" cy="9" r="4" stroke="currentColor" strokeWidth="1.8" /><path d="M13 9h5v3M7 22v3m14-3v3" stroke="currentColor" strokeWidth="1.8" /></svg> },
  { key: "general", label: "General", icon: <svg viewBox="0 0 28 28" fill="none"><rect x="4" y="8" width="20" height="13" rx="4" stroke="currentColor" strokeWidth="1.8" /><circle cx="10" cy="14.5" r="1.3" fill="currentColor" /><circle cx="14" cy="14.5" r="1.3" fill="currentColor" /><circle cx="18" cy="14.5" r="1.3" fill="currentColor" /></svg> },
];

const LOAD_EQUIPMENT_IMAGE_ICONS: Record<string, string> = {
  boiler: boilerIcon,
  chiller: chillerIcon,
  "cooling-tower": coolingTowerIcon,
  elevator: elevatorIcon,
  fan: fanIcon,
  pump: pumpIcon,
  general: generalIcon,
  "air-compressor": airCompressorIcon,
};

type WizardField =
  | { kind: "text"; key: string; label: string; placeholder?: string }
  | { kind: "select"; key: string; label: string; options: string[] }
  | { kind: "cards"; key: string; label: string; options: { value: string; label: string; sub: string; icon: JSX.Element }[] }
  | { kind: "circuits"; key: string; label: string };

type WizardFormConfig = { kicker: string; heading: string; subtitle?: string; rows: WizardField[][] };

// The exact same glyphs the branch diagram draws for each style (BreakerSymbol's arc for Fixed-Mount,
// DrawoutBreakerGlyph's square-with-arrows for Draw-Out), not a separate simplified pair — so picking a
// style here shows the real symbol you'll actually see once this breaker is wired into a one-line,
// instead of a lookalike that doesn't quite match. Neutral "tie" tone since nothing is energized yet at
// equipment-creation time.
const BREAKER_STYLE_ICONS = {
  // BreakerSymbol only ever draws the arc itself — in the real diagram the wire above/below it is a
  // separate element (.sld-gear-connector) that doesn't exist in this isolated card, so without these
  // it reads as a floating curve instead of a breaker sitting on a line. DrawoutBreakerGlyph doesn't
  // need this — it already draws its own wire-breaker-wire in one self-contained SVG.
  fixedMount: (
    <div className="wizard-style-card-fixed-icon">
      <span className="wizard-style-card-wire" aria-hidden="true" />
      <BreakerSymbol tone="tie" size={28} strokeWidthPx={3} centered />
      <span className="wizard-style-card-wire" aria-hidden="true" />
    </div>
  ),
  drawOut: <DrawoutBreakerGlyph tone="tie" />,
};

const BREAKER_OR_SWITCH_ICONS = {
  breaker: BREAKER_STYLE_ICONS.fixedMount,
  switch: (
    <svg width="54" height="54" viewBox="0 0 54 54" fill="none" aria-hidden="true">
      <path d="M27 5v13M27 36v13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="27" cy="20" r="3.5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="27" cy="34" r="3.5" stroke="currentColor" strokeWidth="2.5" />
      <path d="m27 31 11-15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
};

const WIZARD_EQUIPMENT_FORMS: Record<string, WizardFormConfig> = {
  container: {
    kicker: "Container", heading: "Define the container", subtitle: "Switchgear, Main Switchboard, Paralleling Gear, or Distribution Gear.",
    rows: [
      [{ kind: "text", key: "name", label: "Name", placeholder: "e.g. Emergency Switchgear" }],
      [{ kind: "select", key: "containerType", label: "Container Type", options: ["Switchgear", "Main Switchboard", "Paralleling Gear", "Distribution Gear"] }, { kind: "text", key: "voltage", label: "Voltage", placeholder: "480V" }],
      [{ kind: "text", key: "amperage", label: "Amperage (Busbar Rating)", placeholder: "e.g. 2000" }],
      [{ kind: "text", key: "description", label: "Description", placeholder: "Optional" }],
    ],
  },
  breaker: {
    kicker: "Breaker/Switch", heading: "Define the breaker or switch", subtitle: "Choose the device shown on the paper one-line, then enter its rating.",
    rows: [
      [{ kind: "cards", key: "deviceType", label: "Device Type", options: [
        { value: "breaker", label: "Breaker", sub: "Overcurrent protection device", icon: BREAKER_OR_SWITCH_ICONS.breaker },
        { value: "switch", label: "Switch", sub: "Disconnect or isolation switch", icon: BREAKER_OR_SWITCH_ICONS.switch },
      ] }],
      [{ kind: "text", key: "name", label: "Name", placeholder: "e.g. GEN-1 Breaker or Main Switch" }],
      [{ kind: "cards", key: "style", label: "Style", options: [
        { value: "fixed-mount", label: "Fixed-Mount", sub: "Bolted in, no withdrawn state", icon: BREAKER_STYLE_ICONS.fixedMount },
        { value: "draw-out", label: "Draw-Out", sub: "Can be racked out", icon: BREAKER_STYLE_ICONS.drawOut },
      ] }],
      [{ kind: "select", key: "normalPosition", label: "Normal Position", options: ["Closed", "Open"] }],
      [{ kind: "text", key: "frameSize", label: "Frame Size (AF)", placeholder: "800" }, { kind: "text", key: "tripRating", label: "Trip Rating (AT)", placeholder: "700" }],
      [{ kind: "text", key: "ratedVoltage", label: "Rated Voltage", placeholder: "480 V" }, { kind: "text", key: "interruptingRating", label: "Interrupting Rating (kA)", placeholder: "65" }],
      [{ kind: "text", key: "poles", label: "Poles", placeholder: "3" }],
      [{ kind: "text", key: "switchRating", label: "Switch Rating (A)", placeholder: "800" }],
    ],
  },
  transformer: {
    kicker: "Transformer", heading: "Define the transformer", subtitle: "Transformers stand on their own — no Incomer/Feeder classification.",
    rows: [
      [{ kind: "text", key: "name", label: "Name", placeholder: "e.g. XFMR-1" }],
      [{ kind: "text", key: "primaryVoltage", label: "Primary Voltage", placeholder: "480V" }, { kind: "text", key: "secondaryVoltage", label: "Secondary Voltage", placeholder: "208Y/120V" }],
      [{ kind: "text", key: "kva", label: "kVA Rating", placeholder: "300" }],
    ],
  },
  panel: {
    kicker: "Panel", heading: "Name the panel",
    rows: [
      [{ kind: "text", key: "name", label: "Name", placeholder: "e.g. LP-1" }],
      [{ kind: "text", key: "voltage", label: "Voltage", placeholder: "208Y/120V" }, { kind: "text", key: "mainAmps", label: "Main Amps", placeholder: "100" }],
      [{ kind: "select", key: "numberOfSpaces", label: "Number of Spaces / Circuits", options: ["24", "30", "42", "84"] }],
      [{ kind: "circuits", key: "circuits", label: "Panel Schedule" }],
    ],
  },
  equipment: {
    kicker: "Equipment", heading: "Name the equipment",
    rows: [
      [{ kind: "text", key: "name", label: "Name", placeholder: "e.g. Chiller, Boiler, Elevator, Fire Pump" }],
    ],
  },
  area: {
    kicker: "Area Served", heading: "Name the area served",
    rows: [
      [{ kind: "text", key: "name", label: "Name", placeholder: "e.g. ICU, Radiology, OR Suite" }],
    ],
  },
};

type WizardCircuit = { ckt: number; load: string };
type WizardPiece = { type: string; name: string; meta?: Record<string, string | WizardCircuit[]> };

/** A short, human-readable summary of a piece's extra fields for the review table — e.g. a panel
 * shows its voltage/main amps/circuit count, a breaker shows its style and ratings. */
function summarizeWizardPieceMeta(piece: WizardPiece): string {
  const meta = piece.meta || {};
  const parts: string[] = [];
  if (piece.type === "container") {
    if (meta.containerType) parts.push(String(meta.containerType));
    if (meta.voltage) parts.push(String(meta.voltage));
    if (meta.amperage) parts.push(`${meta.amperage}A bus`);
    if (meta.busCount) parts.push(`${meta.busCount} bus${meta.busCount === "1" ? "" : "es"}`);
    if (meta.busCount && Number(meta.busCount) > 1) {
      const ratings = Array.from({ length: Number(meta.busCount) }, (_, index) => meta[`bus${index + 1}Amperage`]).filter(Boolean);
      if (ratings.length) parts.push(ratings.map((rating, index) => `Bus ${String.fromCharCode(65 + index)} ${rating}A`).join(" / "));
    }
  } else if (piece.type === "breaker") {
    if (meta.deviceType === "switch") {
      parts.push("Switch");
      if (meta.switchRating) parts.push(`${meta.switchRating} A`);
    } else {
      parts.push("Breaker");
      if (meta.style) parts.push(meta.style === "draw-out" ? "Draw-Out" : "Fixed-Mount");
      if (meta.frameSize) parts.push(`${meta.frameSize} AF`);
      if (meta.tripRating) parts.push(`${meta.tripRating} AT`);
      if (meta.ratedVoltage) parts.push(String(meta.ratedVoltage));
      if (meta.interruptingRating) parts.push(`${meta.interruptingRating} kA`);
      if (meta.poles) parts.push(`${meta.poles} poles`);
      if (meta.normalPosition) parts.push(`Normally ${meta.normalPosition}`);
    }
  } else if (piece.type === "transformer") {
    if (meta.primaryVoltage || meta.secondaryVoltage) parts.push(`${meta.primaryVoltage || "?"} / ${meta.secondaryVoltage || "?"}`);
    if (meta.kva) parts.push(`${meta.kva} kVA`);
  } else if (piece.type === "panel") {
    if (meta.voltage) parts.push(String(meta.voltage));
    if (meta.mainAmps) parts.push(`${meta.mainAmps}A Main`);
    const circuits = meta.circuits as WizardCircuit[] | undefined;
    if (circuits?.length) parts.push(`${circuits.length} circuit${circuits.length === 1 ? "" : "s"}`);
  } else if (piece.type === "equipment" && meta.equipmentType) {
    parts.push(meta.equipmentType === "Fan" ? "Fan / Air Handler" : String(meta.equipmentType));
  }
  return parts.join(" · ") || "—";
}

type WizardConnectKind = "generator" | "utility" | "ats" | "piece";
type OneLineKind = "emergency" | "normal";
function OneLineWizardTab({
  systemId, systemName, ats, generators, monitoredAssets, pieces, addPiece, removePiece, updatePiece,
  sourceLinks, setSourceLink, removeSourceLink, atsDownstream, setAtsDownstreamLink, removeAtsLink, pieceDownstream, setPieceDownstreamLink, removePieceLink,
  reorderPieceLink,
  onGenerate, editPieceRequest, onEditRequestHandled, lineType, onSelectLine, lineStatus, onRebuildLine, atsFeedWarnings,
}: {
  systemId: string; systemName: string; ats: ATS[]; generators: Generator[]; monitoredAssets: MonitoredAsset[];
  pieces: WizardPiece[]; addPiece: (piece: WizardPiece) => void; removePiece: (name: string) => void; updatePiece: (oldName: string, piece: WizardPiece) => void;
  sourceLinks: Record<string, string>; setSourceLink: (id: string, destination: string) => void; removeSourceLink: (id: string) => void;
  atsDownstream: Record<string, string>; setAtsDownstreamLink: (id: string, destination: string) => void; removeAtsLink: (id: string) => void;
  pieceDownstream: Record<string, string[]>; setPieceDownstreamLink: (name: string, destination: string) => void; removePieceLink: (name: string, destination: string) => void;
  reorderPieceLink: (name: string, fromIndex: number, toIndex: number) => void;
  onGenerate: () => void;
  editPieceRequest?: WizardPiece | null; onEditRequestHandled?: () => void;
  lineType: OneLineKind | null; onSelectLine: (line: OneLineKind) => void;
  lineStatus: Record<OneLineKind, { hasContent: boolean; generated: boolean }>;
  onRebuildLine: (line: OneLineKind) => void; atsFeedWarnings: string[];
}) {
  const [step, setStep] = useState<"start" | "equipment" | "connections">("start");
  const [activeType, setActiveType] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [selectedLoadType, setSelectedLoadType] = useState<string | null>(null);
  const [formCircuits, setFormCircuits] = useState<string[]>([]);
  const [pendingContainer, setPendingContainer] = useState<{ name: string; meta: Record<string, string> } | null>(null);
  const [pendingBusCount, setPendingBusCount] = useState<string | null>(null);
  const [busAmperages, setBusAmperages] = useState<string[]>([]);
  // The piece being edited, if any — set by clicking "Edit" on an existing piece in the review table.
  // Kept separate from activeType/formValues (which the form itself reads/writes either way) purely to
  // know, on submit, whether to update this piece in place or add a new one.
  const [editingPiece, setEditingPiece] = useState<WizardPiece | null>(null);
  const [breakerCreationMode, setBreakerCreationMode] = useState<"unmonitored" | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ id: string; name: string; kind: WizardConnectKind } | null>(null);
  const [selectedDownstream, setSelectedDownstream] = useState<string | null>(null);
  const [changingDestination, setChangingDestination] = useState<string | null>(null);
  const [addingAnotherFeed, setAddingAnotherFeed] = useState(false);
  const targetSearchRef = useRef<HTMLInputElement | null>(null);
  const [connectionSearch, setConnectionSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [connectionType, setConnectionType] = useState("all");
  const [showOnlyUnconnected, setShowOnlyUnconnected] = useState(false);
  const [replaceLine, setReplaceLine] = useState<OneLineKind | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<
    | { kind: "piece" | "source" | "ats" | "piece-link"; key: string; destination?: string; label: string }
    | { kind: "bulk"; items: { kind: "source" | "ats" | "piece-link"; key: string; destination?: string }[]; label: string }
    | null
  >(null);
  const [selectedConnections, setSelectedConnections] = useState<Set<string>>(new Set());
  const normalizedAssetName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const monitoredAssetNames = new Set(monitoredAssets.map((asset) => normalizedAssetName(asset.asset_tag)));
  const saveMonitoredAsset = useSaveMonitoredAsset();
  const toast = useToast();
  // "Move to Monitored": registers an unmonitored wizard breaker in Device Administration and links the
  // existing topology piece to it, so its one-line position and every connection are kept.
  const [monitorTarget, setMonitorTarget] = useState<WizardPiece | null>(null);
  const [monitorError, setMonitorError] = useState("");
  const amps = (value: unknown) => { const match = String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/); return match ? Number(match[0]) : 0; };
  const monitorPlan = monitorTarget ? (() => {
    const meta = monitorTarget.meta || {};
    const frame = amps(meta.frameSize);
    const trip = amps(meta.tripRating);
    const voltage = amps(meta.ratedVoltage);
    const interrupting = amps(meta.interruptingRating);
    const feeders = Object.entries(pieceDownstream).filter(([, targets]) => targets.includes(monitorTarget.name)).map(([name]) => name);
    const feeds = pieceDownstream[monitorTarget.name] || [];
    const problems: string[] = [];
    if (!frame) problems.push("Frame size (AF) is missing.");
    if (!trip) problems.push("Trip rating (AT) is missing.");
    if (frame && trip && trip >= frame) problems.push(`Trip rating (${trip} AT) must be lower than the frame size (${frame} AF) for a monitored breaker.`);
    return {
      problems,
      rows: [
        ["Asset tag", monitorTarget.name],
        ["Type", "Breaker"],
        ["Style", meta.style === "draw-out" ? "Draw-Out" : "Fixed-Mount"],
        ["Frame size", frame ? `${frame} AF` : "—"],
        ["Trip rating", trip ? `${trip} AT` : "—"],
        ["Rated voltage", voltage ? `${voltage} V` : "—"],
        ["Interrupting rating", interrupting ? `${interrupting} kA` : "—"],
      ] as [string, string][],
      data: {
        system_id: systemId,
        asset_type: "breaker",
        asset_tag: monitorTarget.name,
        description: `${meta.style === "draw-out" ? "Draw-out" : "Fixed-mount"} breaker moved from the one-line wizard`,
        rating_amps: frame || null,
        trip_amps: trip || null,
        voltage: voltage || null,
        interrupting_ka: interrupting || null,
        poles: typeof meta.poles === "string" && meta.poles ? meta.poles : null,
        fed_from: feeders.join(", ") || null,
        feeds: feeds.join(", ") || null,
        status: "pending",
      } as Partial<MonitoredAsset>,
    };
  })() : null;
  const openMonitorDialog = (piece: WizardPiece) => { setMonitorError(""); setMonitorTarget(piece); };
  const confirmMoveToMonitored = () => {
    if (!monitorTarget || !monitorPlan || monitorPlan.problems.length || saveMonitoredAsset.isPending) return;
    const piece = monitorTarget;
    setMonitorError("");
    saveMonitoredAsset.mutate({ data: monitorPlan.data }, {
      onSuccess: (asset) => {
        updatePiece(piece.name, { ...piece, meta: { ...(piece.meta || {}), monitoredAssetId: asset.id } });
        setMonitorTarget(null);
        toast.success(`${piece.name} moved to Monitored Equipment. Finish its PLC/MQTT binding in Device Administration to start live monitoring.`);
      },
      onError: (error: any) => {
        const detail = error?.response?.data?.detail;
        const message = typeof detail === "string"
          ? (detail === "asset tag already exists in this system" ? `A device tagged "${piece.name}" already exists in Device Administration for this system.` : detail)
          : Array.isArray(detail) ? detail.map((item: any) => String(item?.msg || "").replace(/^Value error, /, "")).join(". ") : `Could not move ${piece.name} to Monitored Equipment. Please try again.`;
        setMonitorError(message);
        toast.error(message);
      },
    });
  };
  const placedMonitoredBreakerIds = new Set(pieces.map((piece) => String(piece.meta?.monitoredAssetId || "")).filter(Boolean));
  const availableMonitoredBreakers = monitoredAssets.filter((asset) => asset.asset_type === "breaker"
    && !placedMonitoredBreakerIds.has(asset.id)
    && !pieces.some((piece) => normalizedAssetName(piece.name) === normalizedAssetName(asset.asset_tag)));
  const promotedPieces = pieces.filter((piece) => monitoredAssetNames.has(normalizedAssetName(piece.name)));
  const unmonitoredPieces = pieces.filter((piece) => !monitoredAssetNames.has(normalizedAssetName(piece.name)));
  const monitoredEquipment = [
    ...generators.map((item) => ({ key: `generator:${item.id}`, name: item.name, type: "Generator", details: [item.make, item.model, item.rated_kw ? `${item.rated_kw} kW` : ""].filter(Boolean).join(" · ") || "Registered generator", piece: undefined as WizardPiece | undefined })),
    ...ats.map((item) => ({ key: `ats:${item.id}`, name: item.name, type: "ATS", details: [item.manufacturer, item.model, item.rated_amps ? `${item.rated_amps}A` : ""].filter(Boolean).join(" · ") || "Registered ATS", piece: undefined as WizardPiece | undefined })),
    ...monitoredAssets.filter((asset) => asset.asset_type === "meter").map((asset) => ({ key: `meter:${asset.id}`, name: asset.asset_tag, type: "Meter", details: [asset.manufacturer, asset.model, asset.measures].filter(Boolean).join(" · ") || "Device Administration meter", piece: undefined as WizardPiece | undefined })),
    ...promotedPieces.map((piece) => ({ key: `piece:${piece.name}`, name: piece.name, type: WIZARD_EQUIPMENT_TYPES.find((type) => type.key === piece.type)?.label || piece.type, details: `${summarizeWizardPieceMeta(piece)} · Linked in Device Administration`, piece })),
  ].filter((item, index, rows) => rows.findIndex((candidate) => normalizedAssetName(candidate.name) === normalizedAssetName(item.name)) === index);
  const connKey = (kind: "source" | "ats" | "piece-link", key: string, destination?: string) => `${kind}:${key}:${destination ?? ""}`;
  const toggleConnection = (key: string) => setSelectedConnections((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const allConnectionItems: { kind: "source" | "ats" | "piece-link"; key: string; destination?: string; label: string }[] = [
    ...Object.entries(sourceLinks).map(([id, destination]) => ({ kind: "source" as const, key: id, label: `${id} → ${destination}` })),
    ...Object.entries(atsDownstream).map(([id, destination]) => ({ kind: "ats" as const, key: id, label: `${id} → ${destination}` })),
    ...Object.entries(pieceDownstream).flatMap(([name, destinations]) => destinations.map((destination) => ({ kind: "piece-link" as const, key: name, destination, label: `${name} → ${destination}` }))),
  ];
  const selectedConnectionItems = allConnectionItems.filter((item) => selectedConnections.has(connKey(item.kind, item.key, item.destination)));
  const allConnectionsSelected = allConnectionItems.length > 0 && selectedConnections.size === allConnectionItems.length;
  const toggleSelectAllConnections = () => setSelectedConnections(allConnectionsSelected ? new Set() : new Set(allConnectionItems.map((item) => connKey(item.kind, item.key, item.destination))));

  const confirmRemove = () => {
    if (!removeConfirm) return;
    if (removeConfirm.kind === "bulk") {
      removeConfirm.items.forEach((item) => { if (item.kind === "source") removeSourceLink(item.key); else if (item.kind === "ats") removeAtsLink(item.key); else if (item.destination) removePieceLink(item.key, item.destination); });
      setSelectedConnections(new Set()); setRemoveConfirm(null); return;
    }
    if (removeConfirm.kind === "piece") removePiece(removeConfirm.key);
    else if (removeConfirm.kind === "source") removeSourceLink(removeConfirm.key);
    else if (removeConfirm.kind === "ats") removeAtsLink(removeConfirm.key);
    else if (removeConfirm.destination) removePieceLink(removeConfirm.key, removeConfirm.destination);
    setRemoveConfirm(null);
  };

  const beginNew = () => { setStep("equipment"); };

  const startConnecting = (target: { id: string; name: string; kind: WizardConnectKind }) => {
    setSelectedDownstream(null);
    setChangingDestination(null);
    setAddingAnotherFeed(false);
    setTargetSearch("");
    setConnectingFrom(target);
  };

  const beginAddingFeed = () => {
    setChangingDestination(null);
    setSelectedDownstream(null);
    setTargetSearch("");
    setAddingAnotherFeed(true);
    requestAnimationFrame(() => {
      targetSearchRef.current?.focus();
      targetSearchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const beginChangingDestination = (destination: string) => {
    setChangingDestination(destination);
    // Require an explicit replacement choice instead of leaving the existing
    // destination selected, which made the Change action appear to do nothing.
    setSelectedDownstream(null);
    setTargetSearch("");
    setAddingAnotherFeed(false);
    requestAnimationFrame(() => {
      targetSearchRef.current?.focus();
      targetSearchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const destinationsFor = (target: { id: string; name: string; kind: WizardConnectKind } | null): string[] => {
    if (!target) return [];
    if (target.kind === "generator" || target.kind === "utility") return sourceLinks[target.id] ? [sourceLinks[target.id]] : [];
    if (target.kind === "ats") return atsDownstream[target.id] ? [atsDownstream[target.id]] : [];
    return pieceDownstream[target.name] || [];
  };

  const upstreamFor = (name: string): string[] => {
    const upstream: string[] = [];
    Object.entries(sourceLinks).forEach(([id, destination]) => {
      if (destination === name) upstream.push(id === "utility" ? "Utility" : generators.find((generator) => generator.id === id)?.name || id);
    });
    Object.entries(atsDownstream).forEach(([id, destination]) => {
      if (destination === name) upstream.push(ats.find((item) => item.id === id)?.name || id);
    });
    Object.entries(pieceDownstream).forEach(([from, destinations]) => { if (destinations.includes(name)) upstream.push(from); });
    return upstream;
  };

  const confirmDownstream = () => {
    if (!connectingFrom || !selectedDownstream) return;
    if (connectingFrom.kind === "generator" || connectingFrom.kind === "utility") {
      setSourceLink(connectingFrom.id, selectedDownstream);
    } else if (connectingFrom.kind === "ats") {
      setAtsDownstreamLink(connectingFrom.id, selectedDownstream);
    } else {
      if (changingDestination) removePieceLink(connectingFrom.name, changingDestination);
      setPieceDownstreamLink(connectingFrom.name, selectedDownstream);
      const upstreamPiece = pieces.find((piece) => piece.name === connectingFrom.name);
      const placedBreaker = pieces.find((piece) => piece.name === selectedDownstream && piece.type === "breaker");
      const monitoredAssetId = String(placedBreaker?.meta?.monitoredAssetId || "");
      if (upstreamPiece?.type === "container" && monitoredAssetId) {
        // This patches the existing Device Administration record; no second breaker record is created.
        saveMonitoredAsset.mutate({ id: monitoredAssetId, data: { location: connectingFrom.name, fed_from: connectingFrom.name } });
      }
    }
    setConnectingFrom(null);
    setSelectedDownstream(null);
    setChangingDestination(null);
    setAddingAnotherFeed(false);
  };

  const currentDestinations = destinationsFor(connectingFrom);
  const upstreamNames = connectingFrom ? upstreamFor(connectingFrom.name) : [];
  const commonTargetTypes = ["breaker", "container", "transformer", "ATS", "panel"];
  const targetTypeRank = (type: string) => {
    const index = commonTargetTypes.indexOf(type);
    return index < 0 ? commonTargetTypes.length : index;
  };
  const downstreamOptions = !connectingFrom ? [] : [
    ...ats.map((item) => ({ key: item.id, name: item.name, sub: "ATS", existing: currentDestinations.includes(item.name), alreadyFed: upstreamFor(item.name).length > 0 })),
    ...pieces.map((piece) => ({ key: piece.name, name: piece.name, sub: piece.type, existing: currentDestinations.includes(piece.name), alreadyFed: upstreamFor(piece.name).length > 0 })),
  ]
    .filter((option) => option.name !== connectingFrom.name && !upstreamNames.includes(option.name))
    .sort((a, b) => Number(b.existing) - Number(a.existing) || targetTypeRank(a.sub) - targetTypeRank(b.sub) || a.name.localeCompare(b.name));
  const visibleDownstreamOptions = downstreamOptions.filter((option) => option.name.toLowerCase().includes(targetSearch.trim().toLowerCase()));

  const matchesConnectionFilters = (name: string, type: string, connected: boolean) =>
    name.toLowerCase().includes(connectionSearch.trim().toLowerCase()) &&
    (connectionType === "all" || connectionType === type) &&
    (!showOnlyUnconnected || !connected);
  // Show the complete source inventory on both one-line views. Opposite-line
  // sources switch to their correct topology before any connection can be made.
  const filteredGenerators = generators.filter((generator) => matchesConnectionFilters(
    generator.name,
    "generator",
    lineType === "emergency" && Boolean(sourceLinks[generator.id]),
  ));
  const showUtility = matchesConnectionFilters(
    "Utility",
    "utility",
    lineType === "normal" && Boolean(sourceLinks.utility),
  );
  // ATS units belong in both connection overviews. The Normal wizard uses their normal terminals,
  // while downstream wiring remains shared with the Emergency one-line. Previously this list was
  // hidden on Normal even though the same ATS units appeared after selecting another connection item.
  const filteredAts = ats.filter((item) => matchesConnectionFilters(item.name, "ats", Boolean(upstreamFor(item.name).length || atsDownstream[item.id])));
  const filteredPieces = pieces.filter((piece) => matchesConnectionFilters(piece.name, piece.type, Boolean(upstreamFor(piece.name).length || (pieceDownstream[piece.name] || []).length)));

  const openEquipmentForm = (key: string) => {
    setEditingPiece(null);
    setBreakerCreationMode(key === "breaker" ? null : "unmonitored");
    setFormValues(key === "panel" ? { numberOfSpaces: "42" } : key === "breaker" ? { deviceType: "breaker", style: "fixed-mount", normalPosition: "Closed" } : {});
    setFormCircuits(key === "panel" ? Array.from({ length: 42 }, () => "") : []);
    setSelectedLoadType(null);
    setPendingBusCount(null);
    setBusAmperages([]);
    setActiveType(key);
  };

  // Pre-fills the form from an existing piece's own fields (meta values are already the same strings
  // the form itself writes) and opens it in edit mode — submitting updates this piece in place instead
  // of adding a new one.
  const openEditForm = (piece: WizardPiece) => {
    setEditingPiece(piece);
    setBreakerCreationMode("unmonitored");
    const stringFields = Object.fromEntries(
      Object.entries(piece.meta || {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
    const savedCircuits = piece.type === "panel" ? ((piece.meta?.circuits as WizardCircuit[] | undefined) || []).map((circuit) => cleanPanelText(circuit.load)) : [];
    const savedSpaceCount = piece.type === "panel" ? String(piece.meta?.numberOfSpaces || savedCircuits.length || 42) : "";
    setFormValues({ name: piece.name, ...(piece.type === "breaker" ? { deviceType: "breaker", style: "fixed-mount", normalPosition: "Closed" } : {}), ...stringFields, ...(piece.type === "panel" ? { numberOfSpaces: savedSpaceCount } : {}) });
    setFormCircuits(piece.type === "panel" ? Array.from({ length: Number(savedSpaceCount) }, (_, index) => savedCircuits[index] || "") : []);
    setPendingContainer(null);
    setPendingBusCount(null);
    setBusAmperages([]);
    setSelectedLoadType(piece.type === "equipment" ? String(piece.meta?.equipmentTypeKey || "general") : null);
    setActiveType(piece.type);
    setStep("equipment");
  };

  const placeMonitoredBreaker = (asset: MonitoredAsset) => {
    addPiece({
      type: "breaker",
      name: asset.asset_tag,
      meta: {
        deviceType: "breaker",
        style: "fixed-mount",
        monitoredAssetId: asset.id,
        frameSize: asset.rating_amps ? String(asset.rating_amps) : "",
        tripRating: asset.trip_amps ? String(asset.trip_amps) : "",
        ratedVoltage: asset.voltage ? `${asset.voltage} V` : "",
        interruptingRating: asset.interrupting_ka ? String(asset.interrupting_ka) : "",
        poles: asset.poles || "",
      },
    });
    setActiveType(null);
    setBreakerCreationMode(null);
  };

  useEffect(() => {
    if (!editPieceRequest) return;
    openEditForm(editPieceRequest);
    onEditRequestHandled?.();
    // The request object is consumed once when the wizard opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPieceRequest]);

  const setField = (key: string, value: string) => setFormValues((current) => ({ ...current, [key]: value }));
  const setPanelSpaceCount = (value: string) => {
    const count = Number(value);
    setField("numberOfSpaces", value);
    setFormCircuits((current) => Array.from({ length: count }, (_, index) => current[index] || ""));
  };
  const updateCircuit = (index: number, load: string) => setFormCircuits((current) => current.map((existing, i) => (i === index ? load : existing)));

  // Two pieces sharing a name silently corrupts the whole wizard downstream — every pieceDownstream/
  // sourceLinks/atsDownstream lookup finds only the FIRST match by name, so the second one becomes an
  // unreachable duplicate that still renders (the Equipment grid just lists every piece, not deduplicated
  // by name), showing up twice with no way to individually pick either. Nothing previously stopped the
  // form from creating one.
  const nameTaken = (name: string) => pieces.some((piece) => piece.name === name && piece.name !== editingPiece?.name);
  // Accept plain values as well as pasted engineering notation such as "1,200 A". Number() turns
  // the latter into NaN and silently bypasses the comparison, which allowed an invalid breaker to save.
  const parseAmpRating = (value: string | undefined) => {
    const match = String(value || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  };
  const frameSize = parseAmpRating(formValues.frameSize);
  const tripRating = parseAmpRating(formValues.tripRating);
  const tripExceedsFrame = activeType === "breaker" && formValues.deviceType !== "switch" && frameSize > 0 && tripRating > 0 && tripRating > frameSize;

  const chooseLoadEquipmentType = (equipmentType: { key: string; label: string }) => {
    setSelectedLoadType(equipmentType.key);
    if (!editingPiece) setFormValues({ name: "" });
  };

  const submitLoadEquipmentName = (event: React.FormEvent) => {
    event.preventDefault();
    const equipmentType = LOAD_EQUIPMENT_TYPES.find((item) => item.key === selectedLoadType);
    const name = formValues.name?.trim();
    if (!equipmentType || !name || nameTaken(name)) return;
    const piece: WizardPiece = { type: "equipment", name, meta: { equipmentType: equipmentType.label, equipmentTypeKey: equipmentType.key } };
    if (editingPiece) updatePiece(editingPiece.name, piece);
    else addPiece(piece);
    setEditingPiece(null);
    setSelectedLoadType(null);
    setActiveType(null);
  };

  const submitEquipmentForm = (event: React.FormEvent) => {
    event.preventDefault();
    // Re-evaluate from the submitted state here as a hard save guard; the disabled button and inline
    // warning are UX, but neither is allowed to be the only protection for persisted topology data.
    const invalidBreakerRatings = activeType === "breaker" && formValues.deviceType !== "switch"
      && parseAmpRating(formValues.frameSize) > 0 && parseAmpRating(formValues.tripRating) > parseAmpRating(formValues.frameSize);
    if (!activeType || !formValues.name?.trim() || invalidBreakerRatings) return;
    if (nameTaken(formValues.name.trim())) return;
    if (activeType === "container") {
      setPendingContainer({ name: formValues.name.trim(), meta: { containerType: formValues.containerType || "", voltage: formValues.voltage || "", amperage: formValues.amperage || "", description: formValues.description || "" } });
      const existingBusCount = editingPiece ? formValues.busCount || "1" : null;
      setPendingBusCount(existingBusCount);
      setBusAmperages(existingBusCount ? Array.from({ length: Number(existingBusCount) }, (_, index) => formValues[`bus${index + 1}Amperage`] || formValues.amperage || "") : []);
      return;
    }
    // Preserve topology identity fields (especially monitoredAssetId) when a placed monitored breaker
    // is edited. Form-owned fields below are then updated in place.
    const meta: Record<string, string | WizardCircuit[]> = { ...(editingPiece?.meta || {}) };
    if (activeType === "breaker") {
      meta.deviceType = formValues.deviceType || "breaker";
      if (meta.deviceType === "switch") meta.switchRating = formValues.switchRating || "";
      else {
        meta.style = formValues.style || "fixed-mount";
        meta.frameSize = formValues.frameSize || "";
        meta.tripRating = formValues.tripRating || "";
        if (!monitoredAssetNames.has(normalizedAssetName(formValues.name))) meta.normalPosition = formValues.normalPosition || "Closed";
      }
    }
    if (activeType === "transformer") { meta.primaryVoltage = formValues.primaryVoltage || ""; meta.secondaryVoltage = formValues.secondaryVoltage || ""; meta.kva = formValues.kva || ""; }
    if (activeType === "panel") { meta.voltage = formValues.voltage || ""; meta.mainAmps = formValues.mainAmps || ""; meta.numberOfSpaces = formValues.numberOfSpaces || String(formCircuits.length); meta.circuits = formCircuits.map((load, i) => ({ ckt: i + 1, load: cleanPanelText(load) })); }
    if (editingPiece) updatePiece(editingPiece.name, { type: activeType, name: formValues.name.trim(), meta });
    else addPiece({ type: activeType, name: formValues.name.trim(), meta });
    setEditingPiece(null);
    setActiveType(null);
  };

  const chooseBusCount = (busCount: string) => {
    if (!pendingContainer) return;
    setPendingBusCount(busCount);
    setBusAmperages(Array.from({ length: Number(busCount) }, () => pendingContainer.meta.amperage || ""));
  };

  const saveContainer = () => {
    if (!pendingContainer || !pendingBusCount) return;
    const perBusRatings = Object.fromEntries(busAmperages.map((rating, index) => [`bus${index + 1}Amperage`, rating]));
    const piece: WizardPiece = { type: "container", name: pendingContainer.name, meta: { ...pendingContainer.meta, busCount: pendingBusCount, ...perBusRatings } };
    if (editingPiece) updatePiece(editingPiece.name, piece);
    else addPiece(piece);
    setEditingPiece(null);
    setPendingContainer(null);
    setPendingBusCount(null);
    setBusAmperages([]);
    setActiveType(null);
  };

  // At least one real connection made (a source, an ATS's feed, or a piece's feed) before the Result
  // tab is allowed to generate anything — otherwise clicking this straight from Phase 1 would "finish"
  // a diagram that's really still just a pile of unconnected equipment.
  const hasAnyConnection = Object.keys(sourceLinks).length > 0 || Object.keys(atsDownstream).length > 0 || Object.keys(pieceDownstream).length > 0;
  const sourceConnectionCount = Object.keys(sourceLinks).length;
  const atsConnectionCount = Object.keys(atsDownstream).length;
  const equipmentConnectionCount = Object.values(pieceDownstream).reduce((total, destinations) => total + destinations.length, 0);
  const connectionCount = sourceConnectionCount + atsConnectionCount + equipmentConnectionCount;
  const headerBar = (
    <div className="wizard-header-bar">
      <img className="wizard-brand-logo" src="/images/cpc-logo.png" alt="CPC" />
      <span className="wizard-header-label">{lineType ? `${lineType === "emergency" ? "Emergency" : "Normal"} One-Line Wizard` : "One-Line Wizard"}</span>
      <button type="button" className="header-btn primary" disabled={step === "start" || !hasAnyConnection} onClick={onGenerate}>Finish &amp; Generate</button>
    </div>
  );

  if (step === "equipment" || step === "connections") {
    const activeForm = activeType ? WIZARD_EQUIPMENT_FORMS[activeType] : null;
    return (
      <section className="operations-section wizard-section">
        {headerBar}
        <div className="wizard-body">
          <div className="wizard-main-card">
            <button type="button" className="wizard-line-back" onClick={() => { setStep("start"); setActiveType(null); setConnectingFrom(null); }}>← Emergency / Normal one-lines</button>
            <div className="wizard-breadcrumb">
              <span className={step === "equipment" ? "active" : "done"} onClick={() => { setActiveType(null); setEditingPiece(null); setStep("equipment"); }} role="button" tabIndex={0}>1 · Create Equipment</span>
              <span className="wizard-breadcrumb-sep">→</span>
              <span className={step === "connections" ? "active" : ""}>2 · Connections</span>
            </div>
            {lineType === "normal" && <div className="wizard-line-guidance"><b>Normal-side rule:</b> Link Utility or normal-only equipment to an existing ATS normal terminal. Everything on an ATS's load side — its downstream connection and all equipment wired below it — is shared by both source views, so connecting it here also updates the Emergency one-line.</div>}
            {atsFeedWarnings.length > 0 && <div className="wizard-feed-warning" role="status"><b>ATS feed check</b>{atsFeedWarnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
            {step === "equipment" && pendingContainer ? (
              <>
                <div className="wizard-kicker">{pendingContainer.name}</div>
                <h2>How many buses?</h2>
                <p>Most containers have one common bus. Multiples (rare) get a tie breaker between them.</p>
                <div className="wizard-equipment-grid wizard-bus-grid">
                  <button type="button" className={`wizard-equipment-card wizard-bus-card${pendingBusCount === "1" ? " selected" : ""}`} onClick={() => chooseBusCount("1")}><b>1</b><small>Most common</small></button>
                  <button type="button" className={`wizard-equipment-card wizard-bus-card${pendingBusCount === "2" ? " selected" : ""}`} onClick={() => chooseBusCount("2")}><b>2</b><small>Bus A / Bus B</small></button>
                  <button type="button" className={`wizard-equipment-card wizard-bus-card${pendingBusCount === "3" ? " selected" : ""}`} onClick={() => chooseBusCount("3")}><b>3</b><small>Rare</small></button>
                </div>
                {pendingBusCount && <div className="wizard-bus-ratings">
                  <p>{pendingBusCount === "1" ? "Confirm the busbar rating." : "Confirm each bus section rating. Values default to the container amperage and may be changed independently."}</p>
                  <div className="wizard-form-grid-2">
                    {busAmperages.map((rating, index) => <div className="wizard-form-row" key={index}>
                      <label>Bus {String.fromCharCode(65 + index)} Amperage</label>
                      <input value={rating} onChange={(event) => setBusAmperages((current) => current.map((value, ratingIndex) => ratingIndex === index ? event.target.value : value))} placeholder="e.g. 2000" />
                    </div>)}
                  </div>
                </div>}
                <div className="wizard-form-actions">
                  <button type="button" className="header-btn" onClick={() => { setFormValues((current) => ({ ...current, name: pendingContainer.name, ...pendingContainer.meta })); setPendingContainer(null); setPendingBusCount(null); setBusAmperages([]); }}>Back</button>
                  <button type="button" className="header-btn primary" disabled={!pendingBusCount} onClick={saveContainer}>{editingPiece ? "Save Changes" : "Add Container"}</button>
                </div>
              </>
            ) : step === "equipment" && activeType === "equipment" && selectedLoadType ? (
              <form onSubmit={submitLoadEquipmentName}>
                <div className="wizard-kicker">Equipment · {LOAD_EQUIPMENT_TYPES.find((item) => item.key === selectedLoadType)?.label}</div>
                <h2>Name the equipment</h2>
                <div className="wizard-form-row">
                  <label>Name</label>
                  <input
                    required
                    autoFocus
                    value={formValues.name || ""}
                    onChange={(event) => setField("name", event.target.value)}
                    placeholder={`e.g. ${LOAD_EQUIPMENT_TYPES.find((item) => item.key === selectedLoadType)?.label} 1`}
                  />
                  {nameTaken(formValues.name?.trim() || "") && (
                    <p className="wizard-form-error">A piece named "{formValues.name?.trim()}" already exists — pick a different name.</p>
                  )}
                </div>
                <div className="wizard-form-actions wizard-load-name-actions">
                  <button type="submit" className="header-btn primary" disabled={!formValues.name?.trim() || nameTaken(formValues.name?.trim() || "")}>{editingPiece ? "Save Changes" : "Continue"}</button>
                  <button type="button" className="wizard-load-type-back" onClick={() => setSelectedLoadType(null)}>← Back to equipment type</button>
                </div>
              </form>
            ) : step === "equipment" && activeType === "equipment" ? (
              <div className="wizard-load-type-picker">
                <div className="wizard-kicker">Equipment</div>
                <h2>What type of equipment?</h2>
                <p>Pick the icon shown for this load everywhere it appears. Pick General if none of these fit.</p>
                <div className="wizard-load-type-grid">
                  {LOAD_EQUIPMENT_TYPES.map((item) => (
                    <button type="button" key={item.key} className="wizard-load-type-card" onClick={() => chooseLoadEquipmentType(item)}>
                      <span className="wizard-load-type-icon">
                        {LOAD_EQUIPMENT_IMAGE_ICONS[item.key]
                          ? <img src={LOAD_EQUIPMENT_IMAGE_ICONS[item.key]} alt="" />
                          : item.icon}
                      </span>
                      <b>{item.label}</b>
                    </button>
                  ))}
                </div>
                <div className="wizard-form-actions">
                  <button type="button" className="header-btn" onClick={() => { setActiveType(null); setEditingPiece(null); }}>Back</button>
                </div>
              </div>
            ) : step === "equipment" && activeType === "breaker" && breakerCreationMode === null ? (
              <div className="wizard-breaker-source-picker">
                <div className="wizard-kicker">Breaker</div>
                <h2>Add a breaker</h2>
                <p>Use an existing Device Administration breaker, or create an unmonitored topology breaker.</p>
                <div className="wizard-breaker-source-grid">
                  <section>
                    <h3>Use a monitored breaker</h3>
                    <p>Only breakers not already placed on this one-line are shown.</p>
                    {availableMonitoredBreakers.length ? availableMonitoredBreakers.map((asset) => (
                      <button type="button" className="wizard-monitored-breaker-option" key={asset.id} onClick={() => placeMonitoredBreaker(asset)}>
                        <b>{asset.asset_tag}</b>
                        <span>{[asset.manufacturer, asset.model, asset.rating_amps ? `${asset.rating_amps} AF` : "", asset.trip_amps ? `${asset.trip_amps} AT` : ""].filter(Boolean).join(" · ") || "Device Administration breaker"}</span>
                      </button>
                    )) : <p className="operations-empty">No unplaced monitored breakers are available.</p>}
                  </section>
                  <section>
                    <h3>Create an unmonitored breaker</h3>
                    <p>Define a topology-only breaker now. A Superadmin can later monitor it without changing its wiring.</p>
                    <button type="button" className="header-btn primary" onClick={() => setBreakerCreationMode("unmonitored")}>Create unmonitored breaker</button>
                  </section>
                </div>
                <div className="wizard-form-actions"><button type="button" className="header-btn" onClick={() => setActiveType(null)}>Back</button></div>
              </div>
            ) : step === "equipment" && activeForm ? (
              <form onSubmit={submitEquipmentForm}>
                <div className="wizard-kicker">{editingPiece ? `Editing ${editingPiece.name}` : activeForm.kicker}</div>
                <h2>{editingPiece ? `Edit ${activeForm.kicker.toLowerCase()}` : activeForm.heading}</h2>
                {activeForm.subtitle && <p>{activeForm.subtitle}</p>}
                {activeForm.rows.filter((row) => {
                  if (activeType !== "breaker") return true;
                  const keys = row.map((field) => field.key);
                  if (keys.includes("deviceType") || keys.includes("name")) return true;
                  if (keys.includes("normalPosition")) return formValues.deviceType !== "switch" && !monitoredAssetNames.has(normalizedAssetName(formValues.name || editingPiece?.name || ""));
                  return formValues.deviceType === "switch" ? keys.includes("switchRating") : !keys.includes("switchRating");
                }).map((row, rowIndex) => (
                  <div className={row.length > 1 ? "wizard-form-grid-2" : undefined} key={rowIndex}>
                    {row.map((field) => (
                      <div className="wizard-form-row" key={field.key}>
                        <label>{field.label}</label>
                        {field.kind === "text" && (
                          <input required={field.key === "name"} value={formValues[field.key] || ""} onChange={(event) => setField(field.key, event.target.value)} placeholder={field.placeholder} autoFocus={field.key === "name"} aria-invalid={(field.key === "frameSize" || field.key === "tripRating") && tripExceedsFrame ? true : undefined} />
                        )}
                        {field.key === "tripRating" && tripExceedsFrame && (
                          <p className="wizard-form-warning" role="alert">Trip rating ({tripRating} AT) cannot exceed frame size ({frameSize} AF).</p>
                        )}
                        {field.key === "name" && nameTaken(formValues.name?.trim() || "") && (
                          <p className="wizard-form-error">A piece named "{formValues.name?.trim()}" already exists — pick a different name.</p>
                        )}
                        {field.kind === "select" && (
                          <select value={formValues[field.key] || field.options[0]} onChange={(event) => field.key === "numberOfSpaces" ? setPanelSpaceCount(event.target.value) : setField(field.key, event.target.value)}>
                            {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        )}
                        {field.kind === "cards" && (
                          <div className="wizard-style-cards">
                            {field.options.map((option) => (
                              <button type="button" key={option.value} className={`wizard-style-card${formValues[field.key] === option.value ? " selected" : ""}`} onClick={() => setField(field.key, option.value)}>
                                <span className="wizard-style-card-icon">{option.icon}</span>
                                <b>{option.label}</b>
                                <small>{option.sub}</small>
                              </button>
                            ))}
                          </div>
                        )}
                        {field.kind === "circuits" && (
                          <div className="wizard-circuit-builder">
                            <p className="wizard-circuit-help">Enter one load per numbered space. For a multi-pole circuit, repeat the same description in every occupied space.</p>
                            <div className="wizard-circuit-head" aria-hidden="true"><span>Odd circuits</span><span>Even circuits</span></div>
                            <div className="wizard-circuit-list">
                              {Array.from({ length: Math.ceil(formCircuits.length / 2) }, (_, rowIndex) => {
                                const oddIndex = rowIndex * 2;
                                const evenIndex = oddIndex + 1;
                                return <div className="wizard-circuit-row" key={rowIndex}>
                                  <label><span className="wizard-circuit-ckt">{oddIndex + 1}</span><input className="wizard-circuit-load-input" value={formCircuits[oddIndex] || ""} onChange={(event) => updateCircuit(oddIndex, event.target.value)} aria-label={`Circuit ${oddIndex + 1} load`} placeholder="Blank / load description" /></label>
                                  {evenIndex < formCircuits.length && <label><span className="wizard-circuit-ckt">{evenIndex + 1}</span><input className="wizard-circuit-load-input" value={formCircuits[evenIndex] || ""} onChange={(event) => updateCircuit(evenIndex, event.target.value)} aria-label={`Circuit ${evenIndex + 1} load`} placeholder="Blank / load description" /></label>}
                                </div>
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="wizard-form-actions">
                  <button type="button" className="header-btn" onClick={() => { setActiveType(null); setEditingPiece(null); }}>Back</button>
                  <button type="submit" className="header-btn primary" disabled={nameTaken(formValues.name?.trim() || "") || tripExceedsFrame}>{editingPiece ? "Save Changes" : "Continue"}</button>
                </div>
              </form>
            ) : step === "equipment" ? (
              <>
                <div className="wizard-kicker">Create Equipment</div>
                <h2>Add a piece of equipment</h2>
                <p>Define everything on the paper one-line first — no connections yet, just what exists.</p>
                <div className="wizard-equipment-grid">
                  {WIZARD_EQUIPMENT_TYPES.map((item) => (
                    <button type="button" key={item.key} className="wizard-equipment-card" onClick={() => openEquipmentForm(item.key)}>
                      <span className="wizard-equipment-icon">{item.icon}</span>
                      <span className="wizard-equipment-text"><b>{item.label}</b>{item.sub && <small>{item.sub}</small>}</span>
                      {item.badge && <span className="wizard-equipment-badge">{item.badge}</span>}
                    </button>
                  ))}
                </div>
                {/* Only the equipment lists scroll; the type cards above and the Back / Switch to Connections footer stay in view. */}
                <div className="wizard-equipment-list-scroll">
                <div className="wizard-review-table-wrap wizard-equipment-section monitored">
                  <div className="wizard-connections-section-title">Monitored Equipment ({monitoredEquipment.length})</div>
                  <p className="wizard-connections-hint">Pulled automatically from Device Administration. Generators, ATS units, and bound meters are maintained there.</p>
                  {monitoredEquipment.length ? <div className="wizard-review-table-scroll"><table className="wizard-review-table">
                    <thead><tr><th>Name</th><th>Type</th><th>Details</th><th>Actions</th></tr></thead>
                    <tbody>{monitoredEquipment.map((item) => <tr key={item.key}><td>{item.name}</td><td><span className="wizard-monitoring-badge">Monitored · {item.type}</span></td><td className="wizard-review-details">{item.details}</td><td>{item.piece ? <button type="button" className="wizard-review-edit" onClick={() => openEditForm(item.piece!)}>Edit topology item</button> : <span className="wizard-managed-label">Managed in Device Administration</span>}</td></tr>)}</tbody>
                  </table></div> : <p className="operations-empty">No monitored generators, ATS units, or meters are registered.</p>}
                </div>
                {unmonitoredPieces.length > 0 && (
                  <div className="wizard-review-table-wrap">
                    <div className="wizard-connections-section-title">Unmonitored Equipment ({unmonitoredPieces.length})</div>
                    <p className="wizard-connections-hint">Created in this wizard. Add a matching asset tag in Device Administration later to monitor an item without rebuilding its one-line topology.</p>
                    {/* Grouped by type (Container, Breaker, Transformer, Panel, Equipment, Area Served),
                        in the same order as the Create Equipment cards above, instead of one long table
                        mixing every type together — each group gets its own heading and stays that
                        piece's own table, so the Type column (now redundant with the heading) is gone. */}
                    {WIZARD_EQUIPMENT_TYPES.map((typeInfo) => {
                      const group = unmonitoredPieces.filter((piece) => piece.type === typeInfo.key);
                      if (!group.length) return null;
                      return (
                        <div className="wizard-review-group" key={typeInfo.key}>
                          <div className="wizard-review-group-title">{typeInfo.label} ({group.length})</div>
                          <div className="wizard-review-table-scroll">
                            <table className="wizard-review-table">
                              <thead><tr><th>Name</th><th>Details</th><th>Actions</th></tr></thead>
                              <tbody>
                                {group.map((piece) => (
                                  <tr key={piece.name}>
                                    <td>{piece.name}</td>
                                    <td className="wizard-review-details">{summarizeWizardPieceMeta(piece)}</td>
                                    <td>
                                      <div className="wizard-review-actions">
                                        <button type="button" className="wizard-review-edit" onClick={() => openEditForm(piece)}>Edit</button>
                                        {piece.type === "breaker" && piece.meta?.deviceType !== "switch" && (
                                          <button type="button" className="wizard-review-monitor" title="Register this breaker in Device Administration and move it to Monitored Equipment" onClick={() => openMonitorDialog(piece)}>Move to Monitored</button>
                                        )}
                                        <button type="button" className="wizard-review-remove" onClick={() => setRemoveConfirm({ kind: "piece", key: piece.name, label: piece.name })}>Remove</button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>
                <div className="wizard-equipment-footer">
                  <button type="button" className="header-btn" onClick={() => setStep("start")}>Back</button>
                  <span>{pieces.length} piece{pieces.length === 1 ? "" : "s"} created so far</span>
                  <button type="button" className="header-btn primary" onClick={() => setStep("connections")}>Switch to Connections</button>
                </div>
              </>
            ) : step === "connections" && connectingFrom ? (
              <>
                <div className="wizard-kicker">Downstream Connection</div>
                <h2>Where does {connectingFrom.name} feed to?</h2>
                <p>Picking marks the connection — everything here already exists from Phase 1.</p>
                <div className={`wizard-target-toolbar${addingAnotherFeed || changingDestination ? " adding-feed" : ""}`}>
                  <div className="wizard-connections-section-title">Available Equipment ({visibleDownstreamOptions.length})</div>
                  <input ref={targetSearchRef} type="search" value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} placeholder={changingDestination ? `Choose a replacement for ${changingDestination}…` : addingAnotherFeed ? "Choose another feed target…" : "Search connection targets…"} aria-label="Search connection targets" />
                </div>
                {/* Same by-category grouping as the Equipment grid on the main Connections screen — ATS
                    first, then each piece type — instead of one flat grid mixing everything, which got
                    hard to scan once a container/breaker had this many valid targets to pick from. */}
                {[{ key: "ATS", label: "ATS" }, ...WIZARD_EQUIPMENT_TYPES].map((group) => {
                  const groupOptions = visibleDownstreamOptions.filter((option) => option.sub === group.key);
                  if (!groupOptions.length) return null;
                  return (
                    <div className="wizard-connections-piece-group" key={group.key}>
                      <div className="wizard-connections-piece-group-title">{group.label} ({groupOptions.length})</div>
                      <div className="wizard-equipment-grid wizard-connections-grid">
                        {groupOptions.map((option) => (
                          <button type="button" key={option.key} className={`wizard-connection-card${selectedDownstream === option.name ? " selected" : ""}${option.existing ? " already-connected" : option.alreadyFed ? " already-fed" : ""}`} onClick={() => { setSelectedDownstream(option.name); setAddingAnotherFeed(false); }}>
                            <span className="wizard-connection-badge ats"><IconATS size={13} /></span>
                            <span className="wizard-connection-text"><b>{option.name}</b><small>{option.existing ? `✓ Current connection · ${option.sub}` : option.alreadyFed ? `Already fed · ${option.sub}` : option.sub}</small></span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!visibleDownstreamOptions.length && <p className="operations-empty">{downstreamOptions.length ? "No targets match your search." : "No ATS units or equipment pieces are available."}</p>}
                <button type="button" className={`wizard-end-here${selectedDownstream === "End" ? " selected" : ""}`} onClick={() => setSelectedDownstream("End")}>End — stop here</button>
              </>
            ) : (
              <>
                <div className="wizard-connections-list-scroll">
                <div className="wizard-kicker">Connections</div>
                <h2>Pick something to connect or review</h2>
                <div className="wizard-connection-filters">
                  <input type="search" value={connectionSearch} onChange={(event) => setConnectionSearch(event.target.value)} placeholder="Search sources, ATS or equipment…" aria-label="Search connections" />
                  <select value={connectionType} onChange={(event) => setConnectionType(event.target.value)} aria-label="Filter connection items by type">
                    <option value="all">All types</option><option value="generator">Generators</option><option value="utility">Utility</option><option value="ats">ATS</option>
                    {WIZARD_EQUIPMENT_TYPES.map((type) => <option value={type.key} key={type.key}>{type.label}</option>)}
                  </select>
                  <label><input type="checkbox" checked={showOnlyUnconnected} onChange={(event) => setShowOnlyUnconnected(event.target.checked)} /> Show only unconnected</label>
                </div>
                <p>Items with a ✓ are already wired — click to review or change them.</p>
                <div className="wizard-connections-section-title">Sources ({generators.length + 1})</div>
                <div className="wizard-equipment-grid wizard-connections-grid">
                  {filteredGenerators.map((generator) => (
                    <button type="button" key={generator.id} className="wizard-connection-card" disabled={lineType !== "emergency"} onClick={() => startConnecting({ id: generator.id, name: generator.name, kind: "generator" })}>
                      <span className="wizard-connection-badge generator"><IconGenerator size={13} /></span>
                      <span className="wizard-connection-text"><b>{generator.name}</b><small>{lineType !== "emergency" ? "Emergency source · Available only in Emergency one-line" : sourceLinks[generator.id] ? `Feeds ${sourceLinks[generator.id]}` : "⚠ Not connected"}</small></span>
                    </button>
                  ))}
                  {showUtility && <button type="button" className="wizard-connection-card" disabled={lineType !== "normal"} onClick={() => startConnecting({ id: "utility", name: "Utility", kind: "utility" })}>
                    <span className="wizard-connection-badge utility"><IconBolt size={13} /></span>
                    <span className="wizard-connection-text"><b>Utility</b><small>{lineType !== "normal" ? "Normal source · Available only in Normal one-line" : sourceLinks.utility ? `Feeds ${sourceLinks.utility}` : "⚠ Not connected"}</small></span>
                  </button>}
                </div>
                <div className="wizard-connections-section-title">ATS ({ats.length})</div>
                <div className="wizard-equipment-grid wizard-connections-grid">
                  {filteredAts.map((item) => (
                    <button type="button" key={item.id} className="wizard-connection-card" onClick={() => startConnecting({ id: item.id, name: item.name, kind: "ats" })}>
                      <span className="wizard-connection-badge ats"><IconATS size={13} /></span>
                      <span className="wizard-connection-text"><b>{item.name}</b><small>{upstreamFor(item.name).length ? `Fed from ${upstreamFor(item.name).join(", ")}` : "⚠ Not fed"}{atsDownstream[item.id] ? ` · Feeds ${atsDownstream[item.id]}` : " · Feeds —"}</small></span>
                    </button>
                  ))}
                  {!ats.length && <p className="operations-empty">No ATS units registered for this system.</p>}
                </div>
                <div className="wizard-connections-section-title">Equipment ({pieces.length})</div>
                <p className="wizard-connections-hint">Select any item to review its current wiring, change it, remove it, or add another feed where supported.</p>
                {/* Grouped by type (Container, Breaker, Transformer, Panel, Equipment, Area Served), same
                    order and headings as Create Equipment's own review table — a flat list mixing every
                    piece together got hard to scan once there were more than a handful. */}
                {WIZARD_EQUIPMENT_TYPES.map((typeInfo) => {
                  const group = filteredPieces.filter((piece) => piece.type === typeInfo.key);
                  if (!group.length) return null;
                  return (
                    <div className="wizard-connections-piece-group" key={typeInfo.key}>
                      <div className="wizard-connections-piece-group-title">{typeInfo.label} ({group.length})</div>
                      <div className="wizard-equipment-grid wizard-connections-grid">
                        {group.map((piece) => {
                          const linked = pieceDownstream[piece.name] || [];
                          const upstream = upstreamFor(piece.name);
                          const isLoad = piece.type === "equipment" || piece.type === "area";
                          return (
                            <button type="button" key={piece.name} className="wizard-connection-card" onClick={() => startConnecting({ id: `piece:${piece.name}`, name: piece.name, kind: "piece" })}>
                              <span className="wizard-connection-badge ats"><IconATS size={13} /></span>
                              <span className="wizard-connection-text"><b>{piece.name}</b><small>{isLoad ? (upstream.length ? `Fed from ${upstream.join(", ")}` : "⚠ Not fed") : `${upstream.length ? `Fed from ${upstream.join(", ")}` : "⚠ Not fed"} · ${linked.length ? `Feeds ${linked.join(", ")}` : "Feeds —"}`}</small></span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {!pieces.length && <p className="operations-empty">No equipment created yet — add pieces in Create Equipment first.</p>}
                {false && (Object.keys(sourceLinks).length > 0 || Object.keys(atsDownstream).length > 0 || Object.keys(pieceDownstream).length > 0) && (
                  <div className="wizard-review-table-wrap">
                    <div className="wizard-connections-section-title">Connections Made</div>
                    <div className="wizard-bulk-toolbar">
                      <label className="wizard-bulk-select-all">
                        <input type="checkbox" checked={allConnectionsSelected} onChange={toggleSelectAllConnections} />
                        Select All ({allConnectionItems.length})
                      </label>
                      <button
                        type="button"
                        className="wizard-bulk-btn"
                        disabled={!selectedConnectionItems.length}
                        onClick={() => setRemoveConfirm({ kind: "bulk", items: selectedConnectionItems, label: `${selectedConnectionItems.length} selected connection${selectedConnectionItems.length === 1 ? "" : "s"}` })}
                      >
                        Remove Selected ({selectedConnectionItems.length})
                      </button>
                      <button
                        type="button"
                        className="wizard-bulk-btn danger"
                        disabled={!allConnectionItems.length}
                        onClick={() => setRemoveConfirm({ kind: "bulk", items: allConnectionItems, label: `all ${allConnectionItems.length} connections` })}
                      >
                        Remove All
                      </button>
                    </div>
                    {/* Grouped by the "from" side's own equipment type (Generator, Utility, ATS,
                        Container, Breaker, Transformer, Panel, Equipment, Area Served) — the same
                        categories as the Equipment grid and the Created Equipment review table above —
                        instead of the three broad wiring stages, so e.g. every feeder/breaker connection
                        lands under one "Breaker Connections" heading regardless of what stage made it. */}
                    {generators.length > 0 && Object.keys(sourceLinks).some((id) => id !== "utility") && (
                      <div className="wizard-review-group">
                        <div className="wizard-review-group-title">Generator Connections ({Object.keys(sourceLinks).filter((id) => id !== "utility").length})</div>
                        <div className="wizard-review-table-scroll">
                          <table className="wizard-review-table wizard-review-table-checkable">
                            <thead><tr><th /><th>From</th><th>To</th><th /></tr></thead>
                            <tbody>
                              {Object.entries(sourceLinks).filter(([id]) => id !== "utility").map(([id, destination]) => {
                                const fromLabel = generators.find((generator) => generator.id === id)?.name || id;
                                const key = connKey("source", id);
                                return (
                                  <tr key={`source-${id}`}>
                                    <td><input type="checkbox" checked={selectedConnections.has(key)} onChange={() => toggleConnection(key)} /></td>
                                    <td>{fromLabel}</td>
                                    <td>{destination === "End" ? "End of line" : destination}</td>
                                    <td><button type="button" className="wizard-review-remove" onClick={() => setRemoveConfirm({ kind: "source", key: id, label: `${fromLabel} → ${destination === "End" ? "End of line" : destination}` })}>Remove</button></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {sourceLinks.utility && (
                      <div className="wizard-review-group">
                        <div className="wizard-review-group-title">Utility Connections (1)</div>
                        <div className="wizard-review-table-scroll">
                          <table className="wizard-review-table wizard-review-table-checkable">
                            <thead><tr><th /><th>From</th><th>To</th><th /></tr></thead>
                            <tbody>
                              <tr>
                                <td><input type="checkbox" checked={selectedConnections.has(connKey("source", "utility"))} onChange={() => toggleConnection(connKey("source", "utility"))} /></td>
                                <td>Utility</td>
                                <td>{sourceLinks.utility === "End" ? "End of line" : sourceLinks.utility}</td>
                                <td><button type="button" className="wizard-review-remove" onClick={() => setRemoveConfirm({ kind: "source", key: "utility", label: `Utility → ${sourceLinks.utility === "End" ? "End of line" : sourceLinks.utility}` })}>Remove</button></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {Object.keys(atsDownstream).length > 0 && (
                      <div className="wizard-review-group">
                        <div className="wizard-review-group-title">ATS Connections ({Object.keys(atsDownstream).length})</div>
                        <div className="wizard-review-table-scroll">
                          <table className="wizard-review-table wizard-review-table-checkable">
                            <thead><tr><th /><th>From</th><th>To</th><th /></tr></thead>
                            <tbody>
                              {Object.entries(atsDownstream).map(([id, destination]) => {
                                const fromLabel = ats.find((item) => item.id === id)?.name || id;
                                const key = connKey("ats", id);
                                return (
                                  <tr key={`ats-${id}`}>
                                    <td><input type="checkbox" checked={selectedConnections.has(key)} onChange={() => toggleConnection(key)} /></td>
                                    <td>{fromLabel}</td>
                                    <td>{destination === "End" ? "End of line" : destination}</td>
                                    <td><button type="button" className="wizard-review-remove" onClick={() => setRemoveConfirm({ kind: "ats", key: id, label: `${fromLabel} → ${destination === "End" ? "End of line" : destination}` })}>Remove</button></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {WIZARD_EQUIPMENT_TYPES.map((typeInfo) => {
                      const rows = Object.entries(pieceDownstream).flatMap(([name, destinations]) =>
                        pieces.find((piece) => piece.name === name)?.type === typeInfo.key
                          ? destinations.map((destination) => ({ name, destination }))
                          : []
                      );
                      if (!rows.length) return null;
                      return (
                        <div className="wizard-review-group" key={`piece-group-${typeInfo.key}`}>
                          <div className="wizard-review-group-title">{typeInfo.label} Connections ({rows.length})</div>
                          <div className="wizard-review-table-scroll">
                            <table className="wizard-review-table wizard-review-table-checkable">
                              <thead><tr><th /><th>From</th><th>To</th><th /></tr></thead>
                              <tbody>
                                {rows.map(({ name, destination }) => {
                                  const key = connKey("piece-link", name, destination);
                                  return (
                                    <tr key={`piece-${name}-${destination}`}>
                                      <td><input type="checkbox" checked={selectedConnections.has(key)} onChange={() => toggleConnection(key)} /></td>
                                      <td>{name}</td>
                                      <td>{destination === "End" ? "End of line" : destination}</td>
                                      <td><button type="button" className="wizard-review-remove" onClick={() => setRemoveConfirm({ kind: "piece-link", key: name, destination, label: `${name} → ${destination === "End" ? "End of line" : destination}` })}>Remove</button></td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>
                <div className="wizard-equipment-footer">
                  <button type="button" className="header-btn" onClick={() => setStep("start")}>Back</button>
                  <span>{allConnectionItems.length} connection{allConnectionItems.length === 1 ? "" : "s"} created so far</span>
                  <button type="button" className="header-btn primary" onClick={() => setStep("equipment")}>Switch to Create Equipment</button>
                </div>
              </>
            )}
          </div>
          <div className="wizard-side-card">
            <div className="wizard-kicker">Where you are</div>
            {step === "connections" && connectingFrom ? (
              <div className="wizard-chain">
                <div className="wizard-chain-node wizard-chain-node-active">
                  <button
                    type="button"
                    className="wizard-chain-node-close"
                    aria-label="Cancel this connection"
                    title="Cancel — picked the wrong thing to connect?"
                    onClick={() => { setConnectingFrom(null); setSelectedDownstream(null); }}
                  >
                    ×
                  </button>
                  <span className={`wizard-connection-badge ${connectingFrom.kind === "utility" ? "utility" : connectingFrom.kind === "generator" ? "generator" : "ats"}`}>{connectingFrom.kind === "utility" ? <IconBolt size={13} /> : connectingFrom.kind === "generator" ? <IconGenerator size={13} /> : <IconATS size={13} />}</span>
                  <b>{connectingFrom.name}</b>
                  <small>{connectingFrom.kind === "ats" ? "ATS" : connectingFrom.kind === "utility" ? "Utility" : connectingFrom.kind === "piece" ? (pieces.find((piece) => piece.name === connectingFrom.name)?.type || "Equipment") : "Generator"}</small>
                </div>
                {currentDestinations.length > 0 && <div className="wizard-current-connections">
                  <strong>Current connections</strong>
                  {currentDestinations.map((destination, destinationIndex) => <div key={destination}>
                    <span>{destination === "End" ? "End of line" : destination}</span>
                    {connectingFrom.kind === "piece" && currentDestinations.length > 1 && <span className="wizard-reorder-controls">
                      <button type="button" aria-label={`Move ${destination} up`} title="Move up" disabled={destinationIndex === 0} onClick={() => reorderPieceLink(connectingFrom.name, destinationIndex, destinationIndex - 1)}>↑</button>
                      <button type="button" aria-label={`Move ${destination} down`} title="Move down" disabled={destinationIndex === currentDestinations.length - 1} onClick={() => reorderPieceLink(connectingFrom.name, destinationIndex, destinationIndex + 1)}>↓</button>
                    </span>}
                    <button type="button" onClick={() => beginChangingDestination(destination)}>Change</button>
                    <button type="button" className="danger" onClick={() => setRemoveConfirm(connectingFrom.kind === "piece" ? { kind: "piece-link", key: connectingFrom.name, destination, label: `${connectingFrom.name} → ${destination}` } : connectingFrom.kind === "ats" ? { kind: "ats", key: connectingFrom.id, label: `${connectingFrom.name} → ${destination}` } : { kind: "source", key: connectingFrom.id, label: `${connectingFrom.name} → ${destination}` })}>Remove</button>
                  </div>)}
                  <button type="button" className={`wizard-add-feed${addingAnotherFeed ? " active" : ""}`} onClick={beginAddingFeed}>{connectingFrom.kind === "piece" ? (addingAnotherFeed ? "Select a target…" : "+ Add another feed") : "+ Change feed"}</button>
                </div>}
                <div className="wizard-chain-arrow">↓</div>
                {selectedDownstream ? (
                  <div className="wizard-chain-node">
                    <span className={`wizard-connection-badge ${selectedDownstream === "End" ? "utility" : "ats"}`}>{selectedDownstream === "End" ? <IconCheckCircle size={13} /> : <IconATS size={13} />}</span>
                    <b>{selectedDownstream === "End" ? "End of line" : selectedDownstream}</b>
                    <small>{selectedDownstream === "End" ? "Stops here" : pieces.find((piece) => piece.name === selectedDownstream)?.type || "ATS"}</small>
                  </div>
                ) : (!currentDestinations.length || addingAnotherFeed || changingDestination) ? (
                  <div className="wizard-chain-node placeholder">
                    <span>?</span>
                    <small>{changingDestination ? `Replace ${changingDestination}` : addingAnotherFeed ? "Choose another target" : "Not set yet"}</small>
                  </div>
                ) : null}
                {selectedDownstream && <div className="wizard-side-confirm">
                  <button type="button" className="header-btn primary" onClick={confirmDownstream}>Confirm</button>
                  <button type="button" className="header-btn" onClick={() => { setSelectedDownstream(null); setChangingDestination(null); }}>Cancel</button>
                </div>}
                <button type="button" className="wizard-side-done" onClick={() => { setConnectingFrom(null); setSelectedDownstream(null); setChangingDestination(null); }}>Back to connections</button>
              </div>
            ) : (
              hasAnyConnection ? (
                <p>
                  This one-line currently has {pieces.length} equipment item{pieces.length === 1 ? "" : "s"} and {connectionCount} connection{connectionCount === 1 ? "" : "s"}.
                  {step === "connections" ? " Pick something to view or change its wiring." : " Existing wiring will be preserved while you edit equipment."}
                </p>
              ) : (
                <p>{step === "equipment" ? "Phase 1 has no connections yet — this fills in once you start wiring things in Phase 2." : "Pick something to connect — its upstream and downstream will show here as you build the connection."}</p>
              )
            )}
          </div>
        </div>
        {removeConfirm && (
          <Modal title="Remove" onClose={() => setRemoveConfirm(null)}>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--text-dim)" }}>
              Remove <b style={{ color: "var(--text)" }}>{removeConfirm.label}</b>? {removeConfirm.kind === "piece" ? "This also clears any connections wired to it." : "This can be re-wired again from Connections."}
            </p>
            <div className="modal-actions">
              <button type="button" className="header-btn" onClick={() => setRemoveConfirm(null)}>Cancel</button>
              <button type="button" className="header-btn danger" onClick={confirmRemove}>Remove</button>
            </div>
          </Modal>
        )}
        {monitorTarget && monitorPlan && <Modal title={`Move ${monitorTarget.name} to Monitored Equipment?`} className="wizard-monitor-modal" onClose={() => !saveMonitoredAsset.isPending && setMonitorTarget(null)}>
          <p className="wizard-monitor-intro">This registers <b>{monitorTarget.name}</b> as a monitored breaker in Device Administration. Its place on the one-line and all of its connections stay exactly as they are.</p>
          <dl className="wizard-monitor-summary">{monitorPlan.rows.map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl>
          {monitorPlan.problems.length > 0 ? (
            <div className="wizard-monitor-problem" role="alert"><b>Update the breaker before moving it:</b><ul>{monitorPlan.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>
          ) : (
            <p className="wizard-monitor-note">It starts as <b>Pending</b>. Live status appears once its PLC slot or MQTT topic is configured in Device Administration.</p>
          )}
          {monitorError && <div className="wizard-monitor-problem" role="alert">{monitorError}</div>}
          <div className="modal-actions">
            <button type="button" className="header-btn" disabled={saveMonitoredAsset.isPending} onClick={() => setMonitorTarget(null)}>Cancel</button>
            {monitorPlan.problems.length > 0
              ? <button type="button" className="header-btn primary" onClick={() => { const piece = monitorTarget; setMonitorTarget(null); openEditForm(piece); }}>Edit breaker</button>
              : <button type="button" className="header-btn primary" disabled={saveMonitoredAsset.isPending} onClick={confirmMoveToMonitored}>{saveMonitoredAsset.isPending ? "Moving…" : "Move to Monitored"}</button>}
          </div>
        </Modal>}
      </section>
    );
  }

  return (
    <section className="operations-section wizard-section">
      {headerBar}
      <div className="wizard-body">
        <div className="wizard-main-card">
          <div className="wizard-kicker">One-Line Wizard</div>
          <h2>Let&apos;s get started</h2>
          <p>Each system has one Emergency and one Normal one-line. Equipment and ATS units are shared between them.</p>
          <div className="wizard-options">
            {(["emergency", "normal"] as OneLineKind[]).map((line) => <div className="wizard-line-option" key={line}>
              <button type="button" className="wizard-option" onClick={() => { onSelectLine(line); beginNew(); }}>
                <b>{line === "emergency" ? "Emergency" : "Normal"} One-Line</b>
                <span>{lineStatus[line].hasContent ? `Edit existing${lineStatus[line].generated ? " generated" : " draft"} one-line` : "Build this one-line"}</span>
              </button>
              {lineStatus[line].hasContent && <button type="button" className="wizard-rebuild-link" onClick={() => setReplaceLine(line)}>Rebuild and replace</button>}
            </div>)}
          </div>
          {atsFeedWarnings.length > 0 && <div className="wizard-feed-warning" role="status"><b>ATS feed check</b>{atsFeedWarnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
        </div>
        <div className="wizard-side-card">
          <div className="wizard-kicker">Where you are</div>
          <p>Emergency: {lineStatus.emergency.hasContent ? (lineStatus.emergency.generated ? "Generated" : "Draft") : "Not built"}<br />Normal: {lineStatus.normal.hasContent ? (lineStatus.normal.generated ? "Generated" : "Draft") : "Not built"}<br />Shared equipment: {pieces.length}</p>
        </div>
      </div>
      {replaceLine && <Modal title={`Replace ${replaceLine === "emergency" ? "Emergency" : "Normal"} One-Line?`} onClose={() => setReplaceLine(null)}>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--text-dim)" }}>Rebuilding will clear every {replaceLine} one-line connection so you can wire it again from scratch. Created equipment and ATS units will be kept.{replaceLine === "emergency" ? " Loads fed from ATS units are wired on the Emergency one-line, so they will also be cleared from the Normal one-line until rewired." : ""}</p>
        <div className="modal-actions"><button type="button" className="header-btn" onClick={() => setReplaceLine(null)}>Cancel</button><button type="button" className="header-btn danger" onClick={() => { const line = replaceLine; setReplaceLine(null); onRebuildLine(line); onSelectLine(line); beginNew(); }}>Replace and rebuild</button></div>
      </Modal>}
    </section>
  );
}

function ResultAtsModal({ ats, data, downstream, feederLabel, onClose, onViewBranch }: { ats: ATS; data?: Partial<AtsTelemetry>; downstream?: string; feederLabel: string; onClose: () => void; onViewBranch: () => void }) {
  const emergency = data?.connected_source === "GENERATOR";
  const meta = [ats.manufacturer, ats.model, ats.rated_amps ? `${ats.rated_amps}A` : null, ats.rated_volts ? `${ats.rated_volts} VAC` : null].filter(Boolean).join(" | ");
  return (
    <Modal title="" onClose={onClose} className="wizard-result-modal wizard-panel-schedule-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close" onClick={onClose}>x</button>
      <div className="wizard-result-modal-body">
        <div className="wizard-panel-schedule-header"><h3>{ats.name}</h3>
        {meta && <p className="wizard-result-modal-meta">{meta}</p>}</div>
        <div className={`wizard-result-banner ${emergency ? "emergency" : "ready"}`}>{emergency ? "On Emergency" : "Normal"}</div>
        <div className="wizard-connections-section-title">Source Status</div>
        <div className="wizard-form-grid-2">
          <div className={`wizard-result-source${data?.utility_available ? " on" : ""}`}><b>Normal Source</b><span>{data?.utility_available ? "Available" : "Unavailable"}</span></div>
          <div className="wizard-result-source"><b>Connected To</b><span className={emergency ? "wizard-result-emergency-text" : "wizard-result-normal-text"}>{emergency ? "Emergency" : "Normal"}</span></div>
          <div className={`wizard-result-source${data?.generator_available ? " on emergency" : ""}`}><b>Emergency Source</b><span>{data?.generator_available ? "Available" : "Unavailable"}</span></div>
          <div className="wizard-result-source"><b>Fed From</b><span>{feederLabel}</span></div>
        </div>
        <div className="wizard-connections-section-title">Downstream</div>
        {downstream ? (
          <button type="button" className="wizard-downstream-link" onClick={onViewBranch}>
            {downstream === "End" ? "End of line" : downstream} — View on separate page →
          </button>
        ) : (
          <p className="operations-empty">No downstream configured — set this in the Wizard&apos;s Connections step.</p>
        )}
      </div>
    </Modal>
  );
}

type WizardTreeNode = { name: string; type: string; children: WizardTreeNode[] };
type BranchPowerTone = "normal" | "emergency" | "deenergized";

function atsBranchTone(data?: Partial<AtsTelemetry>): BranchPowerTone {
  if (!data || data.communication_healthy === false || data.status === "OFFLINE" || data.connected_source === "OFF") return "deenergized";
  return data.connected_source === "GENERATOR" ? "emergency" : "normal";
}

const branchLineClass = (tone: BranchPowerTone) => tone === "emergency" ? "emergency-source" : tone === "deenergized" ? "standby" : "";
const branchBreakerTone = (tone: BranchPowerTone): "normal" | "emergency" | "tie" => tone === "deenergized" ? "tie" : tone;

/** Walks the piece-to-piece downstream links starting from `startName` as a tree — a piece can now
 * feed multiple downstream targets (e.g. one switchgear box feeding 7 feeders), so this recurses
 * into every branch rather than following a single chain. A `seen` set guards against cycles. */
/** Every piece on the load side of an ATS: its downstream connection and everything below it, following
 * the wiring of both source views. That equipment is one physical circuit (fed by whichever source the
 * ATS has selected), so its connections are shared by the Emergency and Normal one-lines; only the
 * source side (Utility/Generator → ... → ATS terminal) differs between the two views. */
function atsLoadSideNodes(atsDownstream: Record<string, string>, ...graphs: Record<string, string[]>[]): Set<string> {
  const nodes = new Set<string>();
  const stack = Object.values(atsDownstream).filter((name) => name && name !== "end");
  while (stack.length) {
    const name = stack.pop()!;
    if (nodes.has(name) || name === "end") continue;
    nodes.add(name);
    for (const graph of graphs) for (const child of graph[name] || []) stack.push(child);
  }
  return nodes;
}

/** Makes the two source views agree on ATS load-side wiring: each load-side piece gets the union of its
 * Emergency and Normal downstream links (Emergency order first). Source-side entries are untouched and
 * nothing is dropped. Returns the same objects when nothing needed merging. */
export function shareAtsLoadSide(atsDownstream: Record<string, string>, emergency: Record<string, string[]>, normal: Record<string, string[]>) {
  const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index]);
  let nextEmergency = emergency;
  let nextNormal = normal;
  for (const name of atsLoadSideNodes(atsDownstream, emergency, normal)) {
    const fromEmergency = emergency[name] || [];
    const fromNormal = normal[name] || [];
    const merged = [...fromEmergency, ...fromNormal.filter((value) => !fromEmergency.includes(value))];
    if (!merged.length) continue;
    if (!sameList(fromEmergency, merged)) nextEmergency = { ...nextEmergency, [name]: merged };
    if (!sameList(fromNormal, merged)) nextNormal = { ...nextNormal, [name]: merged };
  }
  return { emergency: nextEmergency, normal: nextNormal };
}

/** Labels shown in an ATS faceplate's Connected Load section. The one-line is the primary source of
 * truth: walk from the ATS load terminal to every terminal panel/load and show those leaf names. Add
 * Device Administration assets explicitly assigned to the ATS as well, without duplicates. */
function connectedLoadNamesForAts(
  ats: ATS | null | undefined,
  atsDownstream: Record<string, string>,
  topology: Record<string, string[]>,
  monitoredAssets: MonitoredAsset[],
): string[] {
  if (!ats) return [];
  const loads = new Set<string>();
  const visited = new Set<string>();
  const collectLeaves = (name?: string) => {
    if (!name || name.toLowerCase() === "end" || visited.has(name)) return;
    visited.add(name);
    const children = topology[name] || [];
    if (!children.length) loads.add(name);
    else children.forEach(collectLeaves);
  };
  collectLeaves(atsDownstream[ats.id] || atsDownstream[ats.name]);

  const atsKeys = new Set([ats.id, ats.name].map((value) => value.trim().toLowerCase()));
  monitoredAssets.forEach((asset) => {
    const fedFrom = asset.fed_from?.trim().toLowerCase();
    if ((fedFrom && atsKeys.has(fedFrom)) || asset.linked_asset_id === ats.id) loads.add(asset.asset_tag);
  });
  return Array.from(loads);
}

function resolveWizardTree(startName: string | undefined, pieces: WizardPiece[], pieceDownstream: Record<string, string[]>, seen: Set<string> = new Set()): WizardTreeNode[] {
  if (!startName) return [];
  if (startName === "End") return [{ name: "End of line", type: "", children: [] }];
  if (seen.has(startName)) return [];
  const nextSeen = new Set(seen);
  nextSeen.add(startName);
  const piece = pieces.find((item) => item.name === startName);
  const children = (pieceDownstream[startName] || []).flatMap((child) => resolveWizardTree(child, pieces, pieceDownstream, nextSeen));
  return [{ name: startName, type: piece?.type || "", children }];
}

/** Approximate rendered width of equipment trees hanging off the generated spine. Mirrors the spine
 * styles: a leaf load ~130px, a node with children leaves room for its side label (min 200px), sibling
 * branches 24px apart, and a distribution-gear box = 120px per feeder column + 22px gaps + 82px of
 * padding/border (see .result-load-col .wizard-dist-gear-* in global.css). */
function spineTreeWidth(nodes: WizardTreeNode[], pieces: WizardPiece[]): number {
  return nodes.reduce((sum, node, index) => sum + spineNodeWidth(node, pieces) + (index ? 24 : 0), 0);
}
function spineNodeWidth(node: WizardTreeNode, pieces: WizardPiece[]): number {
  const piece = pieces.find((item) => item.name === node.name);
  if (isGearContainerNode(node, piece)) {
    const columns = node.children.map((child) => Math.max(120, child.type === "breaker" ? spineTreeWidth(child.children, pieces) : spineNodeWidth(child, pieces)));
    return columns.reduce((sum, width) => sum + width, 0) + 22 * Math.max(0, columns.length - 1) + 82;
  }
  return node.children.length ? Math.max(200, spineTreeWidth(node.children, pieces)) : 130;
}
/** Width for a spine column whose equipment tree hangs below the bus (e.g. F7 -> DP-N1, TIE -> MSB-B).
 * The bus breaker above and the tree below both get this width, so the breaker stays centred over its
 * tree and a wide tree never spills over the neighbouring columns. */
const loadColumnWidth = (tree: WizardTreeNode[], base: number, pieces: WizardPiece[]) => Math.max(base, spineTreeWidth(tree, pieces));

function withoutAtsBranches(nodes: WizardTreeNode[], ats: ATS[]): WizardTreeNode[] {
  const atsNames = new Set(ats.flatMap((item) => [item.id.toLowerCase(), item.name.toLowerCase()]));
  return nodes.flatMap((node) => {
    if (atsNames.has(node.name.toLowerCase())) return [];
    const children = withoutAtsBranches(node.children, ats);
    // If this was only a path to an ATS, remove the now-empty upstream shell as well. Genuine
    // normal-only terminal loads started with no children and remain visible.
    if (node.children.length > 0 && children.length === 0) return [];
    return [{ ...node, children }];
  });
}

/** The wire between an ATS/piece and one thing it feeds — a breaker at each end of a length of feeder
 * cable by default, matching the wire+breaker language the main Result diagram uses for generators.
 * A shared bus (see WizardBranchChildren) only needs one breaker per leg instead of two. Tone follows
 * the ATS's real normal/emergency state for the whole branch. */
function WizardBranchConnector({ tone, breakers = 1, fromName, toName }: { tone: BranchPowerTone; breakers?: 0 | 1 | 2; fromName: string; toName: string }) {
  const lineClass = branchLineClass(tone);
  // The target is itself an explicit breaker piece — it draws its own glyph (see WizardTreeNodeView),
  // so this is just a plain connecting wire, not another decorative breaker stacked on top of it.
  if (breakers === 0) {
    return <span className={`wizard-branch-connector-plain-wire ${lineClass}`} aria-hidden="true" />;
  }
  // No real breaker piece backs this glyph — it's the implicit output breaker every ATS/feed is drawn
  // with even when the user never explicitly created one — so its popup is marked Auto-derived.
  const makeDetail = (label: string): BreakerDetailData => ({
    key: `conn-${fromName}-${toName}-${label}`, name: `${fromName} Output Breaker`, style: "Fixed-Mount", derived: true,
    position: "Closed", emergency: tone === "emergency", poweredBy: fromName, feeds: toName,
  });
  return (
    <div className="wizard-branch-connector">
      <span className={`sld-gear-connector ${lineClass}`} aria-hidden="true" />
      <BreakerHitButton detail={makeDetail("1")}>
        <BreakerSymbol tone={branchBreakerTone(tone)} size={32} strokeWidthPx={3} centered />
      </BreakerHitButton>
      <span className={`sld-gear-connector ${lineClass}`} aria-hidden="true" />
      {breakers === 2 && (
        <>
          <BreakerHitButton detail={makeDetail("2")}>
            <BreakerSymbol tone={branchBreakerTone(tone)} size={32} strokeWidthPx={3} centered />
          </BreakerHitButton>
          <span className={`sld-gear-connector ${lineClass}`} aria-hidden="true" />
        </>
      )}
    </div>
  );
}

/** Renders what a node feeds. Every hop — including the ATS's own root connection — is a plain wire,
 * exactly as wired in Connections: a breaker is drawn only if the user actually created one as a piece
 * (it then draws its own glyph, see WizardTreeNodeView). An ATS wired directly to a transformer must
 * show a direct line, not an invented "Output Breaker". Multiple targets share a horizontal bus instead
 * of separate wires — matching how a real switchgear box feeds many breakers off one bar. */
function WizardBranchChildren({ nodes, pieces, onViewSchedule, tone, parentLabel }: { nodes: WizardTreeNode[]; pieces: WizardPiece[]; onViewSchedule: (piece: WizardPiece, tone: BranchPowerTone, fedFrom: string) => void; tone: BranchPowerTone; parentLabel: string }) {
  if (!nodes.length) return null;
  const defaultBreakers = 0;
  if (nodes.length === 1) {
    return (
      <div className="wizard-branch-tree-branch">
        <WizardBranchConnector tone={tone} breakers={defaultBreakers} fromName={parentLabel} toName={nodes[0].name} />
        <WizardTreeNodeView node={nodes[0]} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={parentLabel} />
      </div>
    );
  }
  const lineClass = branchLineClass(tone);
  return (
    <div className="wizard-branch-bus-group">
      <WizardBranchConnector tone={tone} breakers={defaultBreakers} fromName={parentLabel} toName="Bus" />
      <div className={`wizard-branch-bus ${lineClass}`} aria-hidden="true" />
      <div className="wizard-branch-tree-children">
        {nodes.map((node, index) => (
          <div className="wizard-branch-tree-branch" key={index}>
            <WizardBranchConnector tone={tone} breakers={defaultBreakers} fromName="Bus" toName={node.name} />
            <WizardTreeNodeView node={node} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={parentLabel} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A feeder's own downstream, rendered below the distribution-gear box — a plain wire straight to the
 * load with no breaker, since the feeder breaker itself already sits inside the box above it. */
function WizardDistGearLoad({ nodes, pieces, onViewSchedule, tone, parentLabel }: { nodes: WizardTreeNode[]; pieces: WizardPiece[]; onViewSchedule: (piece: WizardPiece, tone: BranchPowerTone, fedFrom: string) => void; tone: BranchPowerTone; parentLabel: string }) {
  if (!nodes.length) return <p className="wizard-dist-gear-empty">Not wired</p>;
  const lineClass = branchLineClass(tone);
  return (
    <div className="wizard-dist-gear-load-row">
      {nodes.map((node, index) => (
        <div className="wizard-dist-gear-load-branch" key={index}>
          <span className={`wizard-dist-gear-tail-out ${lineClass}`} aria-hidden="true" />
          <WizardTreeNodeView node={node} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={parentLabel} />
        </div>
      ))}
    </div>
  );
}

/** An installed spare breaker: open and de-energized, but still visibly a breaker. */
function SpareBreakerGlyph({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 1.5V6.5" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 13.5V18.5" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 6.5C15 6.5 15 13.5 10 13.5" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <line x1="7" y1="12" x2="13.5" y2="7.5" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** An empty cubicle: no breaker is installed in this position. */
function SpaceGlyph({ size = 32 }: { size?: number }) {
  return <span className="wizard-space-glyph" style={{ width: size, height: size }} aria-hidden="true"><i /></span>;
}

/** Every container type offered in the wizard (Switchgear, Main Switchboard, Paralleling Gear,
 * Distribution Gear) is a bus with feeders, so all of them get the same dashed-box-plus-bus one-line
 * treatment (see WizardDistGearNode) once at least one feeder is wired. */
const GEAR_CONTAINER_TYPES = ["Switchgear", "Main Switchboard", "Paralleling Gear", "Distribution Gear"];
function isGearContainerNode(node: WizardTreeNode, piece: WizardPiece | undefined): boolean {
  const containerType = typeof piece?.meta?.containerType === "string" ? piece.meta.containerType : "";
  return node.type === "container" && GEAR_CONTAINER_TYPES.includes(containerType) && node.children.length > 0;
}

/** Finds a Distribution Gear container (see WizardDistGearNode) nested anywhere below this node — a
 * feeder that fans back out into another full gear box (e.g. F3 -> 52 CHILL-2 -> CHILLER DIST 2) needs
 * its column widened to fit that box (see colWidthForFeeder below) instead of the fixed 200px every
 * ordinary feeder gets. */
function findNestedDistGear(node: WizardTreeNode, pieces: WizardPiece[]): WizardTreeNode | null {
  const piece = pieces.find((item) => item.name === node.name);
  if (isGearContainerNode(node, piece)) return node;
  for (const child of node.children) {
    const found = findNestedDistGear(child, pieces);
    if (found) return found;
  }
  return null;
}

// Mirrors the actual box CSS (.wizard-branch-diagram scope): 200px per column, 38px gaps between them,
// ~76px combined left/right box padding+border — so a widened column reserves just enough real estate
// for its nested box to render in normal document flow (pushing later feeders further along the row,
// same as any other wider piece of content would) instead of overlapping neighbors or spilling past the
// row's own edge, which happened when this used to grow the box after the fact via absolute overlays.
function distGearBoxWidth(feederCount: number): number {
  return feederCount * 200 + Math.max(0, feederCount - 1) * 38 + 76;
}

/** A container feeding more than one thing renders as an actual distribution-gear box — dashed
 * enclosure, a shared bus, and a breaker per feeder (labeled with the feeder piece's own name, e.g.
 * "FDR-1") — matching the real switchgear box style, instead of the generic chain-node/bus tree used
 * for everything else. Each feeder's own downstream (the load, or a deeper sub-panel/transformer) is
 * rendered below the box via WizardDistGearLoad, aligned under its breaker. */
function WizardDistGearNode({ node, pieces, onViewSchedule, tone, parentLabel }: { node: WizardTreeNode; pieces: WizardPiece[]; onViewSchedule: (piece: WizardPiece, tone: BranchPowerTone, fedFrom: string) => void; tone: BranchPowerTone; parentLabel: string }) {
  const { selectedContainerName, openContainer, isMonitored } = useOneLineInspector();
  const lineClass = branchLineClass(tone);
  const containerPiece = pieces.find((item) => item.name === node.name);
  // A feeder whose own downstream is itself another Distribution Gear box gets its column widened to
  // exactly fit that nested box's own natural width — applied identically to both the breaker row and
  // the loads row below (both map over the same node.children, so the same index is the same feeder in
  // each), so the breaker stays centered above its own wire and box instead of the two drifting apart.
  // Every other, ordinary feeder keeps the plain fixed 200px column from global.css untouched.
  const colWidth = node.children.map((feeder) => {
    const nested = findNestedDistGear(feeder, pieces);
    return nested ? distGearBoxWidth(nested.children.length) : undefined;
  });
  return (
    <div className="wizard-dist-gear">
      <div className={`wizard-dist-gear-box${isMonitored(node.name) ? "" : " one-line-unmonitored-container"}`}>
        <button
          type="button"
          className={`wizard-dist-gear-label${selectedContainerName === node.name ? " selected" : ""}`}
          aria-label={`Open ${node.name} details`}
          onClick={() => containerPiece && openContainer({ piece: containerPiece, feeds: node.children.map((feeder) => feeder.name), feedsLabel: "Feeders", poweredBy: parentLabel })}
        >
          {node.name}
        </button>
        <div className={`wizard-dist-gear-bus ${lineClass}`} aria-hidden="true" />
        <div className="wizard-dist-gear-row">
          {node.children.map((feeder, index) => {
            const isBreaker = feeder.type === "breaker";
            const isSpare = feeder.name.trim().toLowerCase() === "spare";
            const isSpace = feeder.name.trim().toLowerCase() === "space" || feeder.type === "space";
            const feederKey = `distfeeder-${node.name}-${feeder.name}`;
            const feederPiece = isBreaker ? pieces.find((item) => item.name === feeder.name) : undefined;
            const feederPosition = configuredBreakerPosition(feederPiece, isMonitored(feeder.name), isSpare ? "Open" : "Closed");
            const feederDetail: BreakerDetailData = {
              key: feederKey, name: feeder.name, role: "Feeder",
              style: feederPiece?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount", derived: !feederPiece,
              position: feederPosition, emergency: tone === "emergency", poweredBy: node.name,
              feeds: feeder.children.length ? feeder.children.map((child) => child.name).join(", ") : "Not wired",
              ...breakerNameplate(feederPiece),
            };
            return (
              <div className="wizard-dist-gear-col" style={colWidth[index] ? { width: colWidth[index] } : undefined} key={index}>
                {isBreaker || isSpace ? (
                  <>
                    {!isSpace && <span className={`sld-gear-connector ${lineClass}`} aria-hidden="true" />}
                    <span className={`sld-breaker-with-tag${!isSpace && !isMonitored(feeder.name) ? " one-line-unmonitored-breaker" : ""}`}>
                      {isSpace ? (
                        <SpaceGlyph size={32} />
                      ) : isSpare && !feederPiece?.meta?.normalPosition ? (
                        <SpareBreakerGlyph size={32} />
                      ) : (
                        <BreakerHitButton detail={feederDetail}>
                          <PieceSwitchingSymbol piece={feederPiece} tone={branchBreakerTone(tone)} position={feederPosition} size={38} strokeWidthPx={3} />
                        </BreakerHitButton>
                      )}
                      <div className={`sld-breaker-tag ${lineClass}`}>{feeder.name}</div>
                    </span>
                    {/* Real wire on both sides of the box's bottom border (see .wizard-dist-gear-tail-out
                        below, just outside the box) — the border needs to cross the middle of a
                        continuous wire, not sit right at the breaker's own bottom edge. */}
                    {!isSpace && <span className={`wizard-dist-gear-tail-in ${lineClass}`} aria-hidden="true" />}
                  </>
                ) : (
                  // No breaker piece was ever created for this feed — the user wired the load straight
                  // to the bus — so this draws as a plain straight drop, matching the reference
                  // (MCC-CHILLER's loads hang straight off its bus with no breaker at all), the same
                  // "only draw a breaker if one was actually added" rule WizardBranchChildren already
                  // applies everywhere else in this tree.
                  <span className={`wizard-dist-gear-plain-drop ${lineClass}`} aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="wizard-dist-gear-row wizard-dist-gear-loads">
        {node.children.map((feeder, index) => (
          <div className="wizard-dist-gear-col" style={colWidth[index] ? { width: colWidth[index] } : undefined} key={index}>
            {feeder.name.trim().toLowerCase() === "space" || feeder.type === "space" ? null : feeder.type === "breaker" ? (
              <WizardDistGearLoad nodes={feeder.children} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={feeder.name} />
            ) : (
              <WizardDistGearLoad nodes={[feeder]} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={node.name} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Small icon glyph for a terminal load box — a compact bordered square with the icon inside and the
 * name as its own label below, matching the reference's Air Compressor / panel boxes, rather than a
 * bigger text-only card. Equipment/area get the red 3-dot bus glyph; a panel (has its own circuit
 * schedule behind it) gets a distinct 3-line schedule glyph instead, so the icon itself hints at
 * "click for circuits" the way the reference's ICU LTG box does. */
const WIZARD_LOAD_BOX_ICON_EQUIPMENT = (
  <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><rect x="1.5" y="5" width="17" height="10" rx="3.5" stroke="currentColor" strokeWidth="1.6" /><circle cx="6.7" cy="10" r="1.7" fill="#ef4444" /><circle cx="10" cy="10" r="1.7" fill="#ef4444" /><circle cx="13.3" cy="10" r="1.7" fill="#ef4444" /></svg>
);
const WIZARD_LOAD_BOX_ICON_PANEL = (
  <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><line x1="3" y1="5.5" x2="17" y2="5.5" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" /><line x1="3" y1="10" x2="17" y2="10" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" /><line x1="3" y1="14.5" x2="17" y2="14.5" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" /></svg>
);
const WIZARD_LOAD_BOX_ICONS: Record<string, JSX.Element> = {
  equipment: WIZARD_LOAD_BOX_ICON_EQUIPMENT,
  panel: WIZARD_LOAD_BOX_ICON_PANEL,
  area: WIZARD_LOAD_BOX_ICON_EQUIPMENT,
};

function equipmentImageIcon(piece: WizardPiece | undefined, name: string) {
  if (piece?.type !== "equipment") return undefined;
  const savedKey = String(piece.meta?.equipmentTypeKey || "").toLowerCase();
  if (LOAD_EQUIPMENT_IMAGE_ICONS[savedKey]) return LOAD_EQUIPMENT_IMAGE_ICONS[savedKey];

  // Older saved one-lines may predate equipmentTypeKey. Infer their icon from the saved type label or
  // equipment name so they also upgrade from the generic three-dot load symbol automatically.
  const label = String(piece.meta?.equipmentType || name).toLowerCase();
  if (label.includes("cooling tower")) return coolingTowerIcon;
  if (label.includes("boiler")) return boilerIcon;
  if (label.includes("chiller") || label.includes("chillar")) return chillerIcon;
  if (label.includes("elevator")) return elevatorIcon;
  if (label.includes("fan")) return fanIcon;
  if (label.includes("pump")) return pumpIcon;
  if (label.includes("air compressor") || label.includes("compressor")) return airCompressorIcon;
  if (label.includes("general")) return generalIcon;
  return undefined;
}

/** The wide, dashed-bus "distribution gear" treatment (see WizardDistGearNode) is reserved for the
 * root the ATS feeds directly into (ResultBranchModal renders that explicitly) — a nested multi-output
 * device further down the tree (an MCC, a transformer) instead gets the same compact chain-node-plus-bus
 * treatment as everything else, matching how the reference draws those as small boxes/symbols with a
 * couple of short branches, not another full-width gear box competing for room inside its own column. */
function WizardTreeNodeView({ node, pieces, onViewSchedule, tone, parentLabel }: { node: WizardTreeNode; pieces: WizardPiece[]; onViewSchedule: (piece: WizardPiece, tone: BranchPowerTone, fedFrom: string) => void; tone: BranchPowerTone; parentLabel: string }) {
  const { selectedContainerName, openContainer, isMonitored, atsForName, atsTelemetryFor, openAts } = useOneLineInspector();
  const piece = pieces.find((item) => item.name === node.name);
  const nestedAts = atsForName(node.name);
  const circuits = piece?.type === "panel" ? (piece.meta?.circuits as WizardCircuit[] | undefined) : undefined;
  const clickable = Boolean(piece);
  const equipmentImage = equipmentImageIcon(piece, node.name);
  const loadIcon = equipmentImage
    ? <img className="wizard-load-box-equipment-image" src={equipmentImage} alt="" />
    : WIZARD_LOAD_BOX_ICONS[node.type];

  // ATS records live outside the wizard-piece collection, so without this explicit lookup a nested
  // ATS falls through to the generic text pill. Render the same N/E transfer-switch indication used
  // on the main spine and open the same equipment faceplate when it is clicked.
  if (nestedAts) {
    const nestedTelemetry = atsTelemetryFor(nestedAts);
    const nestedTone = atsBranchTone(nestedTelemetry);
    const nestedEmergency = nestedTone === "emergency";
    const nestedDeenergized = nestedTone === "deenergized";
    return (
      <div className="wizard-branch-tree-node wizard-nested-ats-node">
        <div className={`sld-ats result-ats-node wizard-nested-ats ${nestedDeenergized ? "deenergized" : nestedEmergency ? "on-emergency" : "on-normal"}`}>
          <button type="button" className="sld-switch" aria-label={`Open ${nestedAts.name}: ${nestedDeenergized ? "de-energized" : nestedEmergency ? "connected to emergency" : "connected to normal"}`} onClick={() => openAts(nestedAts)}>
            <span className={`sld-terminal normal-terminal ${!nestedEmergency && !nestedDeenergized ? "active" : ""}`}>N</span>
            <span className={`sld-terminal emergency-terminal ${nestedEmergency ? "active" : ""}`}>E</span>
            <i className="sld-arm" />
            <span className="sld-terminal load-terminal" aria-hidden="true" />
          </button>
          <b>{nestedAts.name}</b>
        </div>
        {node.children.length > 0 && <WizardBranchChildren nodes={node.children} pieces={pieces} onViewSchedule={onViewSchedule} tone={nestedTone} parentLabel={nestedAts.name} />}
      </div>
    );
  }

  // A container explicitly built as a "Distribution Gear" (as opposed to a Motor Control Center,
  // Switchgear, etc.) always gets the full dashed-box-plus-bus treatment (see WizardDistGearNode),
  // regardless of how many feeders it currently has wired — a distribution gear is a bus with feeders
  // by definition, not something that only looks like one once it happens to have more than one. This
  // is a different, narrower rule than the one this component used to use (any container with more
  // than one child), which mis-fired on wide multi-output devices like an MCC that aren't actually
  // switchgear and don't need the full box.
  if (isGearContainerNode(node, piece)) {
    return <WizardDistGearNode node={node} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={parentLabel} />;
  }

  // Any other container (no gear type set, or a gear container with nothing wired yet) — clickable like every other container in the one-line, opening the same details
  // popup as "GEN SWBD" or a nested distribution-gear box, just without the wide dashed-bus treatment.
  if (node.type === "container") {
    return (
      <div className="wizard-branch-tree-node">
        <button
          type="button"
          className={`wizard-chain-node wizard-chain-node-clickable${selectedContainerName === node.name ? " selected" : ""}${isMonitored(node.name) ? "" : " one-line-unmonitored-container"}`}
          onClick={() => piece && openContainer({ piece, feeds: node.children.map((child) => child.name), feedsLabel: "Feeders", poweredBy: parentLabel })}
        >
          <b>{node.name}</b>
          <small>{node.type}</small>
        </button>
        {node.children.length > 0 && <WizardBranchChildren nodes={node.children} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={node.name} />}
      </div>
    );
  }

  // A transformer draws as its two-circle symbol inside a square bordered box. The incoming wire lands
  // on the box's top edge and the outgoing wire leaves from its bottom edge, so the name sits beside
  // the box (absolutely positioned) instead of below it — otherwise the label would open a gap in the
  // line between the box and whatever it feeds.
  if (node.type === "transformer") {
    return (
      <div className="wizard-branch-tree-node">
        <button type="button" className="wizard-symbol-node wizard-symbol-node-clickable wizard-transformer-node" aria-label={`Open ${node.name} transformer details`} onClick={() => piece && onViewSchedule(piece, tone, parentLabel)}>
          <span className="wizard-transformer-box">
            <svg width="60" height="60" viewBox="0 0 20 20" fill="none" className="wizard-symbol-icon" aria-hidden="true">
              <circle cx="7.5" cy="10" r="5" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12.5" cy="10" r="5" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </span>
          <b className="wizard-symbol-label wizard-transformer-label">{node.name}</b>
        </button>
        {/* This node is now the immediate feed for whatever's below it — not whatever fed *this* node. */}
        {node.children.length > 0 && <WizardBranchChildren nodes={node.children} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={node.name} />}
      </div>
    );
  }

  // An explicit breaker piece mid-chain (not a feeder inside a distribution-gear box — those already
  // get their own glyph, see WizardDistGearNode) draws as its own breaker symbol — the draw-out glyph
  // for a Draw-Out piece (same one the Result spine's generator columns use), the standard arc for a
  // Fixed-Mount one — instead of the generic chain-node text box every other pass-through piece falls
  // back to below. Its own WizardBranchConnector (see WizardBranchChildren) skips its usual decorative
  // breaker for this same reason, so it doesn't show up twice — once here, once as an unlabeled extra.
  if (node.type === "breaker") {
    const breakerLineClass = branchLineClass(tone);
    const breakerKey = `piece-breaker-${node.name}`;
    const breakerPosition = configuredBreakerPosition(piece, isMonitored(node.name));
    const breakerDetail: BreakerDetailData = {
      key: breakerKey, name: node.name, style: piece?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount", derived: !piece,
      position: breakerPosition, emergency: tone === "emergency", poweredBy: parentLabel,
      feeds: node.children.length ? node.children.map((child) => child.name).join(", ") : undefined,
      ...breakerNameplate(piece),
    };
    return (
      <div className="wizard-branch-tree-node">
        {/* Name to the side, not below — matching FDR-1 and every other breaker tag in this view,
            via the same .sld-breaker-with-tag/.sld-breaker-tag pairing they use. */}
        <span className={`sld-breaker-with-tag${isMonitored(node.name) ? "" : " one-line-unmonitored-breaker"}`}>
          <BreakerHitButton detail={breakerDetail}>
            <PieceSwitchingSymbol piece={piece} tone={branchBreakerTone(tone)} position={breakerPosition} size={40} strokeWidthPx={3} />
          </BreakerHitButton>
          <div className={`sld-breaker-tag ${breakerLineClass}`}>{node.name}</div>
        </span>
        {node.children.length > 0
          ? <WizardBranchChildren nodes={node.children} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={node.name} />
          // Nothing wired downstream yet: still draw the breaker's load-side conductor below the arc,
          // so the symbol doesn't end abruptly at the contact.
          : <>
            <span className={`wizard-branch-connector-plain-wire wizard-breaker-tail-out ${breakerLineClass}`} aria-hidden="true" />
            <span className="wizard-breaker-not-wired">Not wired</span>
          </>}
      </div>
    );
  }

  // An Area Served is drawn as a bare flat-top hexagon (no square box), with the incoming wire landing
  // on its top edge and the name below — the standard one-line symbol for an area served.
  if (node.type === "area") {
    const hexagon = (
      <>
        {/* Pointed-top hexagon: the top vertex sits exactly on the SVG's top edge (and the stroke uses
            a miter join), so the incoming wire meets the corner with no gap. */}
        <svg className="wizard-area-hexagon" width="56" height="64" viewBox="0 0 56 64" fill="none" aria-hidden="true">
          <polygon points="28,0 54.5,15.5 54.5,48.5 28,64 1.5,48.5 1.5,15.5" stroke="currentColor" strokeWidth="3" strokeLinejoin="miter" />
        </svg>
        <b className="wizard-load-box-label wizard-area-label">{node.name}</b>
      </>
    );
    return (
      <div className="wizard-branch-tree-node">
        {clickable ? (
          <button type="button" className="wizard-load-box-wrap wizard-load-box-clickable wizard-area-node" aria-label={`Open ${node.name} area served details`} onClick={() => onViewSchedule(piece!, tone, parentLabel)}>
            {hexagon}
          </button>
        ) : (
          <div className="wizard-load-box-wrap wizard-area-node">{hexagon}</div>
        )}
        {node.children.length > 0 && <WizardBranchChildren nodes={node.children} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={node.name} />}
      </div>
    );
  }

  // A terminal load (equipment/panel/area) is a small icon box with the name below it, not a bigger
  // text card — everything else (a pass-through breaker/container/transformer with more to show) keeps
  // the fuller chain-node box.
  if (loadIcon) {
    const boxContent = (
      <>
        <span className="wizard-load-box">{loadIcon}</span>
        <b className="wizard-load-box-label">{node.name}</b>
      </>
    );
    return (
      <div className="wizard-branch-tree-node">
        {clickable ? (
          <button type="button" className="wizard-load-box-wrap wizard-load-box-clickable" onClick={() => onViewSchedule(piece!, tone, parentLabel)}>
            {boxContent}
          </button>
        ) : (
          <div className="wizard-load-box-wrap">{boxContent}</div>
        )}
        {node.children.length > 0 && <WizardBranchChildren nodes={node.children} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={node.name} />}
      </div>
    );
  }

  const nodeContent = (
    <>
      <b>{node.name}</b>
      {node.type && <small>{node.type}</small>}
    </>
  );
  return (
    <div className="wizard-branch-tree-node">
      {/* A panel with a schedule opens it by clicking the box itself — no separate button label
          cluttering it up. Anything else (no schedule to show) is just a plain, inert box. */}
      {clickable ? (
        <button type="button" className="wizard-chain-node wizard-chain-node-clickable" onClick={() => onViewSchedule(piece!, tone, parentLabel)}>
          {nodeContent}
        </button>
      ) : (
        <div className="wizard-chain-node">{nodeContent}</div>
      )}
      {node.children.length > 0 && <WizardBranchChildren nodes={node.children} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={node.name} />}
    </div>
  );
}

function countWizardTreeLeaves(nodes: WizardTreeNode[]): number {
  return nodes.reduce((total, node) => total + (node.children.length ? countWizardTreeLeaves(node.children) : 1), 0);
}

const WIZARD_PIECE_TYPE_DESCRIPTION: Record<string, string> = {
  panel: "panel",
  equipment: "equipment load",
  area: "area served",
};

/** Scales the content div — up or down — to exactly fill the container div in both dimensions, with
 * no scrollbars: a 3-feeder tree grows to fill the page, an 8-feeder tree with nested distribution-gear
 * boxes shrinks to still land on one page, and it re-measures live via ResizeObserver on both elements
 * as more gets wired, since a fixed size can't guarantee either of those on its own. */
function useFitScale<C extends HTMLElement, T extends HTMLElement>() {
  const containerRef = useRef<C>(null);
  const contentRef = useRef<T>(null);
  const [scale, setScale] = useState(1);
  // How far to shift the scaled content from the container's top-left corner. Centering this by giving
  // the container align-items/justify-content:center (an earlier attempt) fought with the transform:
  // flexbox positions a transformed item using its own pre-transform layout box, not its visual
  // post-scale size, so it could still center content that was actually too big — splitting the real
  // overflow evenly left/right, which made the left half unreachable (scrollLeft can't go negative).
  // Computing the exact pixel offset here instead — directly from the same natural/available sizes
  // already measured for scale — sidesteps that mismatch entirely: Math.max(0, ...) guarantees it can
  // never go negative, so oversized content always collapses back to flush top-left (all overflow
  // positive, reachable by .wizard-result-modal-body's scroll) while content with room to spare gets
  // pushed toward the middle by exactly the leftover space, in one formula with no separate branch.
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    let frame = 0;
    // Deferred a frame so it always measures after the browser has finished reflowing from whatever
    // triggered it (a window resize, or a browser/OS zoom level change) rather than mid-reflow.
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const naturalWidth = content.scrollWidth;
        const naturalHeight = content.scrollHeight;
        const availableWidth = container.clientWidth;
        const availableHeight = container.clientHeight;
        if (!naturalWidth || !naturalHeight || !availableWidth || !availableHeight) return;
        const fit = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight);
        // Browser/OS page zoom shrinks 100vw (in CSS px) as zoom increases, while this content's own
        // fixed-px dimensions don't — left uncapped, that ratio keeps falling as zoom goes up, so the
        // diagram would visibly shrink the more you zoom in instead of growing with the rest of the
        // page. A floor stops that: past this point the container (not .wizard-branch-diagram, which
        // still needs overflow:hidden so the un-clamped scale never scrolls it) takes over scrolling,
        // the same way any other zoomed page does, rather than the content shrinking indefinitely. A
        // ceiling likewise avoids a very simple tree (few feeders, wide page) blowing up oversized.
        const appliedScale = Math.min(1.6, Math.max(0.55, fit));
        setScale(appliedScale);
        setOffset({
          x: Math.max(0, (availableWidth - naturalWidth * appliedScale) / 2),
          y: Math.max(0, (availableHeight - naturalHeight * appliedScale) / 2),
        });
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    // Belt-and-suspenders alongside the ResizeObserver above — some browsers are inconsistent about
    // firing it for a page/browser zoom change (as opposed to an actual element resize), so a window
    // resize listener and the pinch-zoom-aware visualViewport API both re-trigger the same measurement.
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  return { containerRef, contentRef, scale, offset };
}

function ResultBranchModal({
  systemName, ats, atsTelemetry, feederLabel, pieces, monitoredAssets, atsDownstream, pieceDownstream, onClose, onViewSchedule,
}: { systemName: string; ats: ATS; atsTelemetry?: Partial<AtsTelemetry>; feederLabel: string; pieces: WizardPiece[]; monitoredAssets: MonitoredAsset[]; atsDownstream: Record<string, string>; pieceDownstream: Record<string, string[]>; onClose: () => void; onViewSchedule: (piece: WizardPiece, tone: BranchPowerTone, fedFrom: string) => void }) {
  const tree = resolveWizardTree(atsDownstream[ats.id], pieces, pieceDownstream);
  const connectedLoads = useMemo(
    () => connectedLoadNamesForAts(ats, atsDownstream, pieceDownstream, monitoredAssets),
    [ats, atsDownstream, pieceDownstream, monitoredAssets],
  );
  const powerTone = atsBranchTone(atsTelemetry);
  const emergency = powerTone === "emergency";
  const deenergized = powerTone === "deenergized";
  const { containerRef, contentRef, scale, offset } = useFitScale<HTMLDivElement, HTMLDivElement>();
  const [diagramZoom, setDiagramZoom] = useState(1);
  const changeDiagramZoom = (change: number) => setDiagramZoom((current) => Math.min(2, Math.max(0.5, Number((current + change).toFixed(1)))));
  // Same faceplate the ATS grid's own switch opens (see SingleLineDiagram/onAtsClick) — this drill-down
  // view is otherwise a dead end for checking the ATS's own status/source availability once you're
  // already looking at its downstream tree.
  const [showFaceplate, setShowFaceplate] = useState(false);

  // A single, unbranched downstream leaf gets a specific title/subtitle ("ATS-01 — Exit Lighting" /
  // "Single panel with schedule"); a branching feed (multiple targets anywhere in the tree) falls
  // back to a leaf count instead, since there's no single downstream name to summarize it by.
  const singleLeaf = tree.length === 1 && tree[0].children.length === 0 && tree[0].name !== "End of line" ? tree[0] : undefined;
  const singleLeafPiece = singleLeaf ? pieces.find((piece) => piece.name === singleLeaf.name) : undefined;
  const singleLeafCircuits = singleLeafPiece?.type === "panel" ? (singleLeafPiece.meta?.circuits as WizardCircuit[] | undefined) : undefined;

  const title = singleLeaf ? `${ats.name} — ${singleLeaf.name}` : ats.name;
  const branchSummary = !tree.length
    ? "No downstream configured"
    : singleLeaf
    ? `${singleLeafCircuits?.length ? "Single panel with schedule" : `Single ${WIZARD_PIECE_TYPE_DESCRIPTION[singleLeafPiece?.type || ""] || "load"}`}`
    : tree[0].name === "End of line"
    ? "End of line"
    : `${countWizardTreeLeaves(tree)} downstream feed${countWizardTreeLeaves(tree) === 1 ? "" : "s"}`;

  return (
    <>
    <Modal title="" onClose={onClose} className="wizard-result-modal wizard-branch-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close" onClick={onClose}>x</button>
      <div className="wizard-diagram-zoom" aria-label="Diagram zoom controls">
        <button type="button" aria-label="Zoom in" title="Zoom in" disabled={diagramZoom >= 2} onClick={() => changeDiagramZoom(0.1)}>+</button>
        <output aria-live="polite">{Math.round(diagramZoom * 100)}%</output>
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={diagramZoom <= 0.5} onClick={() => changeDiagramZoom(-0.1)}>−</button>
        <button type="button" className="wizard-diagram-zoom-reset" onClick={() => setDiagramZoom(1)}>Reset</button>
      </div>
      <div className="wizard-result-modal-body">
        <div className="wizard-branch-header">
          <button type="button" className="wizard-back-to-spine" onClick={onClose}>← Back to spine</button>
          <nav className="wizard-branch-breadcrumb" aria-label="One-line breadcrumb">
            <button type="button" onClick={onClose}>Spine</button><span>›</span><b>{ats.name}</b>
            {tree[0] && tree[0].name !== "End of line" && <><span>›</span><b>{tree[0].name}</b></>}
          </nav>
          <h3>{title}</h3>
          <p className="wizard-result-modal-meta">Fed from {feederLabel} on GEN SWBD · {branchSummary}</p>
        </div>
        <div className={`wizard-branch-diagram power-${powerTone}`} ref={containerRef}>
          {/* transformOrigin "top left": translate (see offset in useFitScale) shifts the already-scaled
              box by a fixed, never-negative pixel amount to center it when there's room, so scale must
              grow/shrink from that same top-left corner — a "center" origin would instead expand the box
              in all directions including back into negative territory, undoing the offset's guarantee. */}
          <div className="wizard-branch-diagram-fit" ref={contentRef} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale * diagramZoom})`, transformOrigin: "top left" }}>
            <div className="wizard-branch-ats-glyph">
              {/* Name above the switch, not below it — the downstream wire (WizardBranchConnector,
                  rendered right after this glyph) needs to run straight down from the switch's own
                  bottom edge into the breaker, not have the name label and its old stub line break
                  that into two visually disconnected segments. */}
              <div className={`sld-ats ${deenergized ? "deenergized" : emergency ? "on-emergency" : "on-normal"}`}>
                <b>{ats.name}</b>
                <button
                  type="button"
                  className="sld-switch"
                  aria-label={`Open ${ats.name}: ${deenergized ? "de-energized" : emergency ? "connected to emergency" : "connected to normal"}`}
                  onClick={() => setShowFaceplate(true)}
                >
                  <span className={`sld-terminal normal-terminal ${!emergency && !deenergized ? "active" : ""}`}>N</span>
                  <span className={`sld-terminal emergency-terminal ${emergency ? "active" : ""}`}>E</span>
                  <i className="sld-arm" />
                  <span className="sld-terminal load-terminal" aria-hidden="true" />
                </button>
              </div>
            </div>
            {tree.length > 0 && (
              <div className="wizard-branch-tree-root">
                {tree.length === 1 && tree[0].type === "container" && (tree[0].children.length > 1 || isGearContainerNode(tree[0], pieces.find((item) => item.name === tree[0].name))) ? (
                  // Feeding straight into a distribution-gear box: just the plain feed cable, no breaker —
                  // protection lives on the individual feeders inside the box, not on this lead-in.
                  <div className="wizard-branch-tree-branch">
                    <span className={`sld-gear-connector ${branchLineClass(powerTone)}`} aria-hidden="true" />
                    <WizardDistGearNode node={tree[0]} pieces={pieces} onViewSchedule={onViewSchedule} tone={powerTone} parentLabel={ats.name} />
                  </div>
                ) : (
                  <WizardBranchChildren nodes={tree} pieces={pieces} onViewSchedule={onViewSchedule} tone={powerTone} parentLabel={ats.name} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
    {showFaceplate && (
      <EquipmentFaceplate
        systemName={systemName}
        ats={ats}
        atsTelemetry={atsTelemetry}
        connectedLoads={connectedLoads}
        fedFromLabel={feederLabel}
        alwaysShowSourceAvailability
        onClose={() => setShowFaceplate(false)}
      />
    )}
    </>
  );
}

function ResultPanelScheduleModal({ piece, emergency, fedFrom, customerLogo, customerName, onClose, onSave, existingNames = [] }: { piece: WizardPiece; emergency: boolean; fedFrom: string; customerLogo?: string | null; customerName?: string; onClose: () => void; onSave?: (oldName: string, piece: WizardPiece) => void; existingNames?: string[] }) {
  const [activeTab, setActiveTab] = useState<DetailTab>("details");
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(piece.name);
  const [draftVoltage, setDraftVoltage] = useState(typeof piece.meta?.voltage === "string" ? piece.meta.voltage : "");
  const [draftMainAmps, setDraftMainAmps] = useState(typeof piece.meta?.mainAmps === "string" ? piece.meta.mainAmps : "");
  const [draftCircuits, setDraftCircuits] = useState<WizardCircuit[]>(((piece.meta?.circuits as WizardCircuit[] | undefined) || []).map((circuit) => ({ ...circuit })));
  const [editError, setEditError] = useState("");
  const circuits = (piece.meta?.circuits as WizardCircuit[] | undefined) || [];
  const odd = circuits.filter((circuit) => circuit.ckt % 2 === 1);
  const even = circuits.filter((circuit) => circuit.ckt % 2 === 0);
  const usedCount = circuits.filter((circuit) => circuit.load && circuit.load.toLowerCase() !== "spare").length;
  const voltage = typeof piece.meta?.voltage === "string" ? piece.meta.voltage : "";
  const isTransformer = piece.type === "transformer";
  const primaryVoltage = typeof piece.meta?.primaryVoltage === "string" ? piece.meta.primaryVoltage : "";
  const secondaryVoltage = typeof piece.meta?.secondaryVoltage === "string" ? piece.meta.secondaryVoltage : "";
  const transformerKva = typeof piece.meta?.kva === "string" ? piece.meta.kva : "";
  const mainAmpsRaw = typeof piece.meta?.mainAmps === "string" ? piece.meta.mainAmps : "";
  // Some panels' mainAmps already carry an "A Main" suffix from how they were entered in the wizard —
  // strip it before appending our own, instead of risking "100A MainA Main".
  const mainAmps = mainAmpsRaw.replace(/\s*A?\s*Main$/i, "").trim();
  const cancelEdit = () => {
    setDraftName(piece.name);
    setDraftVoltage(voltage);
    setDraftMainAmps(mainAmps);
    setDraftCircuits(circuits.map((circuit) => ({ ...circuit })));
    setEditError("");
    setEditing(false);
  };
  const saveEdit = () => {
    const nextName = draftName.trim();
    if (!nextName) { setEditError("Panel name is required."); return; }
    if (existingNames.some((name) => name !== piece.name && name.toLowerCase() === nextName.toLowerCase())) { setEditError("Another one-line asset already uses this name."); return; }
    const updated: WizardPiece = { ...piece, name: nextName, meta: { ...(piece.meta || {}), voltage: draftVoltage.trim(), mainAmps: draftMainAmps.replace(/\s*A?\s*Main$/i, "").trim(), circuits: draftCircuits.map((circuit) => ({ ...circuit, load: circuit.load.trim() || "SPARE" })) } };
    onSave?.(piece.name, updated);
    setEditError("");
    setEditing(false);
  };

  const generatedDocument = piece.type === "panel" ? <div className="equipment-document generated-panel-document">
    <span className="generated-document-badge">PDF</span>
    <div><b>{piece.name} — Panel Schedule <em>AUTO-GENERATED</em></b><small>Panel Schedule · generated from the current circuit table</small></div>
    <span><button type="button" className="generated-document-view" title="View panel schedule" aria-label="View panel schedule" onClick={() => setShowDocumentPreview(true)}>View</button><button type="button" title="Download PDF" aria-label="Download panel schedule PDF" onClick={() => downloadPanelSchedulePdf(piece, fedFrom, emergency, customerLogo, customerName)}>↓</button></span>
  </div> : undefined;

  return (
    <>
    <Modal title="" onClose={onClose} className="wizard-result-modal wizard-panel-schedule-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close" onClick={onClose}>x</button>
      <div className="wizard-result-modal-body equipment-popup-fixed">
        <div className="wizard-panel-schedule-header">
          <div><h3>{piece.name}</h3>
          <p className="wizard-result-modal-meta">{piece.type === "panel" ? `Panel${voltage ? ` · ${voltage}` : ""}${mainAmps ? ` · ${mainAmps}A Main` : ""}` : isTransformer ? `Transformer${transformerKva ? ` · ${transformerKva} kVA` : ""}` : piece.type === "area" ? "Area served" : String(piece.meta?.equipmentType || "Equipment load")}</p></div>
          {onSave && !editing && !isTransformer && <button type="button" className="header-btn primary" onClick={() => { setActiveTab("details"); setEditing(true); }}>Edit</button>}
          {editing && <div className="panel-inline-edit-actions"><button type="button" onClick={cancelEdit}>Cancel</button><button type="button" className="primary" onClick={saveEdit}>Save</button></div>}
        </div>
        <div className={`wizard-result-banner ${emergency ? "emergency" : "ready"}`}>Energized · {emergency ? "Emergency" : "Normal"}</div>
        <EquipmentRecordTabs recordKey={`wizard-piece:${piece.type}:${piece.name}`} active={activeTab} onChange={setActiveTab} generatedDocument={generatedDocument} />
        {/* Only this region scrolls — the name, status banner and tabs above stay in place. For a panel
            the Fed From / Circuits rows and the schedule heading stay too; only the circuit rows scroll. */}
        {activeTab === "details" && <div className={`equipment-popup-scroll${piece.type === "panel" && !editing && circuits.length ? " panel-schedule-layout" : ""}`}>
        {editing && <div className="panel-inline-editor">
          <div className="panel-inline-fields"><label>Panel Name<input value={draftName} onChange={(event) => setDraftName(event.target.value)} /></label><label>Rated Voltage<input value={draftVoltage} onChange={(event) => setDraftVoltage(event.target.value)} placeholder="208Y/120V" /></label><label>Rated Amperage<input value={draftMainAmps} onChange={(event) => setDraftMainAmps(event.target.value)} inputMode="numeric" placeholder="100" /></label></div>
          <div className="panel-inline-circuit-title">Circuit Load Descriptions</div>
          <div className="panel-inline-circuits">{draftCircuits.map((circuit, index) => <label key={circuit.ckt}><span>CKT {circuit.ckt}</span><input value={circuit.load} onChange={(event) => setDraftCircuits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, load: event.target.value } : item))} /></label>)}</div>
          {editError && <p className="panel-inline-error" role="alert">{editError}</p>}
        </div>}
        {!editing && <>
        {/* Plain label/value rows, not a colored badge — this is reference info, not a status to call
            attention to (the banner above already does that job). */}
        <div className="wizard-panel-schedule-info">
          <div className="wizard-panel-schedule-info-row"><span>Fed From</span><b>{fedFrom}</b></div>
          {piece.type === "panel" ? <div className="wizard-panel-schedule-info-row"><span>Circuits Used</span><b>{usedCount} of {circuits.length}</b></div> : isTransformer ? <>
            <div className="wizard-panel-schedule-info-row"><span>Primary Voltage</span><b>{primaryVoltage || "—"}</b></div>
            <div className="wizard-panel-schedule-info-row"><span>Secondary Voltage</span><b>{secondaryVoltage || "—"}</b></div>
            <div className="wizard-panel-schedule-info-row"><span>Rating</span><b>{transformerKva ? `${transformerKva} kVA` : "—"}</b></div>
          </> : piece.type === "area" ? <div className="wizard-panel-schedule-info-row"><span>Type</span><b>Area Served</b></div>
          : <div className="wizard-panel-schedule-info-row"><span>Equipment Type</span><b>{String(piece.meta?.equipmentType || "General")}</b></div>}
        </div>
        {piece.type === "panel" && <><div className="wizard-connections-section-title wizard-panel-schedule-title">Panel Schedule</div>
        {circuits.length ? (
          <div className="wizard-panel-schedule-wrap">
            <table className="wizard-panel-schedule">
              <thead><tr><th>Ckt</th><th>Load</th><th>Ckt</th><th>Load</th></tr></thead>
              <tbody>
                {Array.from({ length: Math.max(odd.length, even.length) }).map((_, row) => (
                  <tr key={row}>
                    <td className="mono">{odd[row]?.ckt ?? ""}</td><td>{cleanPanelText(odd[row]?.load)}</td>
                    <td className="mono">{even[row]?.ckt ?? ""}</td><td>{cleanPanelText(even[row]?.load)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="operations-empty">No circuits were added for this panel in the Wizard.</p>
        )}</>}
        </>}
        </div>}
      </div>
    </Modal>
    {showDocumentPreview && <Modal title="" onClose={() => setShowDocumentPreview(false)} className="panel-document-preview-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close preview" onClick={() => setShowDocumentPreview(false)}>x</button>
      <div className="panel-document-toolbar"><button type="button" onClick={() => downloadPanelSchedulePdf(piece, fedFrom, emergency, customerLogo, customerName)}>↓ Download PDF</button></div>
      <article className="panel-document-sheet">
        <header className="panel-document-brand"><div className="panel-document-logos"><div className="panel-document-logo cpc-brand-logo"><img src="/images/cpc-logo.png" alt="CPC" /></div>{customerLogo && <div className="panel-document-logo customer-brand-logo"><img src={customerLogo} alt={`${customerName || "Customer"} logo`} /></div>}</div><div><strong>CPC</strong><span>{customerName || "Critical Infrastructure. Managed."}</span></div><small>Equipment Document<br />Generated {new Date().toLocaleDateString()}</small></header>
        <div className="panel-document-title"><div><span>Electrical Distribution</span><h2>{piece.name} — Panel Schedule</h2></div><b className={emergency ? "emergency" : "normal"}>{emergency ? "Emergency" : "Normal"}</b></div>
        <div className="panel-document-meta"><span>Panel Name<b>{piece.name}</b></span><span>Rated Voltage<b>{voltage || "—"}</b></span><span>Rated Amperage<b>{mainAmps ? `${mainAmps}A` : "—"}</b></span></div>
        <table><thead><tr><th>CKT</th><th>Load Description</th><th>CKT</th><th>Load Description</th></tr></thead><tbody>
          {Array.from({ length: Math.max(odd.length, even.length) }).map((_, row) => <tr key={row}><td>{odd[row]?.ckt ?? ""}</td><td className={odd[row]?.load?.toLowerCase() === "spare" ? "spare" : ""}>{cleanPanelText(odd[row]?.load)}</td><td>{even[row]?.ckt ?? ""}</td><td className={even[row]?.load?.toLowerCase() === "spare" ? "spare" : ""}>{cleanPanelText(even[row]?.load)}</td></tr>)}
        </tbody></table>
        <footer><span>Auto-generated from the current CPC One-Line equipment record.</span><b>Critical Power Command · Controlled Document</b></footer>
      </article>
    </Modal>}
    </>
  );
}

function ResultLegendEquipmentSymbol({ kind }: { kind: string }) {
  if (kind === "utility") return <span className="legend-equipment-symbol utility actual"><span className="legend-utility-diagram"><UtilityTowerSymbol size={36} /></span></span>;
  if (kind === "generator") return <span className="legend-equipment-symbol generator actual"><span className="legend-generator-diagram">G</span></span>;
  if (kind === "bus") return <span className="legend-equipment-symbol bus actual"><span className="legend-switchgear-diagram"><i /><b>BUS</b></span></span>;
  if (kind === "breaker") return <span className="legend-equipment-symbol breaker actual"><BreakerSymbol tone="normal" size={38} strokeWidthPx={3} centered /></span>;
  if (kind === "switch") return <span className="legend-equipment-symbol breaker actual"><SwitchSymbol tone="normal" size={38} strokeWidthPx={3} /></span>;
  if (kind === "ats") return <span className="legend-equipment-symbol ats actual"><span className="sld-ats on-normal legend-ats-diagram"><span className="sld-switch"><span className="sld-terminal normal-terminal active">N</span><span className="sld-terminal emergency-terminal">E</span><i className="sld-arm" /><span className="sld-terminal load-terminal" /></span></span></span>;
  if (kind === "transformer") return <span className="legend-equipment-symbol transformer actual"><TransformerSymbol size={32} /></span>;
  return <span className={`legend-equipment-symbol ${kind}`}>{kind === "unmonitored" ? <b>NM</b> : kind === "offpage" ? <><b>LOAD</b><i>→</i></> : kind === "spare" ? <SpareBreakerGlyph size={28} /> : kind === "space" ? <SpaceGlyph size={28} /> : <i />}</span>;
}

function ResultLegendModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"equipment" | "status" | "flow">("equipment");
  const symbols = [
    ["utility", "Utility"], ["generator", "Generator"], ["bus", "Switchgear / Bus"], ["breaker", "Breaker"], ["switch", "Switch (disconnect / isolation)"],
    ["ats", "ATS (N / E)"], ["transformer", "Transformer"], ["panel", "Panel"], ["mcc", "MCC"], ["load", "Load"],
    ["offpage", "Off-page Connector"], ["spare", "Spare"], ["space", "Space"], ["unmonitored", "Not Monitored"],
  ] as const;
  return (
    <Modal title="" onClose={onClose} className="wizard-result-modal result-legend-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close" onClick={onClose}>x</button>
      <div className="wizard-result-modal-body">
        <h3>Legend</h3>
        <p className="wizard-result-modal-meta">Normal and Emergency Power One-Line</p>
        <div className="result-legend-tabs" role="tablist" aria-label="Legend sections">
          <button type="button" className={tab === "equipment" ? "active" : ""} onClick={() => setTab("equipment")}>Equipment</button>
          <button type="button" className={tab === "status" ? "active" : ""} onClick={() => setTab("status")}>Status</button>
          <button type="button" className={tab === "flow" ? "active" : ""} onClick={() => setTab("flow")}>Power Flow</button>
        </div>
        <div className="result-legend-content">
          {tab === "equipment" && <div className="legend-symbol-grid">{symbols.map(([kind, label]) => <div className="legend-symbol-item" key={kind}><ResultLegendEquipmentSymbol kind={kind} /><strong>{label}{kind === "spare" ? " — breaker installed, no load" : kind === "space" ? " — no breaker installed" : ""}</strong></div>)}</div>}
          {tab === "status" && <div className="legend-status-layout">
            <section><h4>Generator Status</h4><div className="wizard-legend-rows"><div className="wizard-legend-row"><span className="wizard-legend-dot ready" />Ready / Standby</div><div className="wizard-legend-row"><span className="wizard-legend-dot running" />Running</div><div className="wizard-legend-row"><span className="wizard-legend-dot alarm" />Alarm</div><div className="wizard-legend-row"><span className="wizard-legend-dot test" />Test</div><div className="wizard-legend-row"><span className="wizard-legend-dot offline" />Offline</div><div className="wizard-legend-row"><span className="wizard-legend-dot nodata" />No Data</div><div className="wizard-legend-row"><span className="wizard-legend-dot not-monitored" />Not Monitored</div></div></section>
            <section><h4>ATS Status</h4><div className="wizard-legend-rows"><div className="wizard-legend-row"><span className="wizard-legend-dot ready" />Normal Source</div><div className="wizard-legend-row"><span className="wizard-legend-dot running" />Emergency Source</div><div className="wizard-legend-row"><span className="wizard-legend-dot alarm" />Alarm / Fault</div><div className="wizard-legend-row"><span className="wizard-legend-dot test" />Test / Transferring</div><div className="wizard-legend-row"><span className="wizard-legend-dot offline" />Offline</div><div className="wizard-legend-row"><span className="wizard-legend-dot nodata" />No Data</div><div className="wizard-legend-row"><span className="wizard-legend-dot not-monitored" />Not Monitored</div></div></section>
            <section className="legend-breaker-section"><h4>Breaker Convention</h4><div className="legend-breaker-row"><span className="legend-breaker-icon"><BreakerSymbol tone="tie" position="Open" size={22} centered /></span>Open</div><div className="legend-breaker-row"><span className="legend-breaker-icon"><BreakerSymbol tone="normal" size={22} centered /></span>Closed — Normal</div><div className="legend-breaker-row"><span className="legend-breaker-icon"><BreakerSymbol tone="emergency" size={22} centered /></span>Closed — Emergency</div></section>
          </div>}
          {tab === "flow" && <div className="legend-flow-layout">
            <section><h4>Conductor Colors</h4><div className="wizard-legend-rows"><div className="wizard-legend-row"><span className="wizard-legend-line normal" />Normal Power</div><div className="wizard-legend-row"><span className="wizard-legend-line running" />Emergency Power</div><div className="wizard-legend-row"><span className="wizard-legend-line standby" />De-energized</div></div></section>
            <section><h4>Spine Display</h4><div className="legend-spine-toggle"><span className="normal active">Normal</span><span className="emergency">Emergency</span></div><p>Use the spine toggle to view either the normal or emergency power path.</p></section>
            <section className="legend-offpage"><h4>Off-page Connector</h4><div className="legend-offpage-example"><span className="line" /><span className="arrow">→</span><b>ICU PANEL</b></div><p>Continues this circuit to the named load or another one-line sheet.</p></section>
          </div>}
        </div>
      </div>
    </Modal>
  );
}

/** The square, arrow-flanked draw-out breaker glyph — used in place of the plain arc BreakerSymbol
 * wherever the wizard has an actual Breaker piece (style: Draw-Out) matching this connection. */
/** A disconnect/isolation switch (wizard Breaker/Switch piece saved with meta.deviceType "switch"):
 * two contacts joined by a blade — vertical when closed, swung open on a diagonal when open. Sized and
 * toned like BreakerSymbol so it drops into the same wire slots. */
function SwitchSymbol({ tone = "normal", position = "Closed", size = 30, strokeWidthPx = 2 }: { tone?: "normal" | "emergency" | "tie"; position?: "Closed" | "Open"; size?: number; strokeWidthPx?: number }) {
  const strokeWidth = (strokeWidthPx * 12) / size;
  return <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ overflow: "visible" }} className={`sld-symbol sld-breaker-symbol sld-switch-symbol ${position === "Open" ? "tie" : tone}`}>
    <path d="M6 0V2.6M6 9.4V12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    <circle cx="6" cy="3.4" r=".8" stroke="currentColor" strokeWidth={strokeWidth * .7} fill="none" />
    <circle cx="6" cy="8.6" r=".8" stroke="currentColor" strokeWidth={strokeWidth * .7} fill="none" />
    {position === "Open"
      ? <path d="M6 7.8L9.4 3.6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      : <path d="M6 7.8L6 4.2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />}
  </svg>;
}

const isSwitchPiece = (piece?: WizardPiece | null) => piece?.meta?.deviceType === "switch";

/** The right one-line symbol for a Breaker/Switch piece: switch, draw-out breaker or fixed breaker. */
function PieceSwitchingSymbol({ piece, tone, position = "Closed", size = 38, strokeWidthPx = 2 }: { piece?: WizardPiece | null; tone: "normal" | "emergency" | "tie"; position?: "Closed" | "Open"; size?: number; strokeWidthPx?: number }) {
  // Feeder conductors are 3px wide; keep a disconnect's external leads and
  // closed blade at that same visual weight so the path reads as continuous.
  if (isSwitchPiece(piece)) return <SwitchSymbol tone={tone} position={position} size={size} strokeWidthPx={Math.max(3, strokeWidthPx)} />;
  if (piece?.meta?.style === "draw-out") return <DrawoutBreakerGlyph tone={tone} position={position} />;
  return <BreakerSymbol tone={tone} position={position} size={size} strokeWidthPx={strokeWidthPx} centered />;
}

function DrawoutBreakerGlyph({ tone, position = "Closed" }: { tone: "emergency" | "normal" | "tie"; position?: "Closed" | "Open" }) {
  const color = position === "Open" ? "#64748b" : tone === "emergency" ? "#ef4444" : tone === "normal" ? "#22c55e" : "#64748b";
  const housingColor = color;
  return (
    <svg className="sld-drawout-breaker" width="24" height="75" viewBox="0 0 16 50" fill="none" aria-hidden="true">
      {/* The external conductor stops at the draw-out cell. Continuity is shown only by the internal
          contact link below, so an open breaker never has a hidden straight line behind its symbol. */}
      <line x1="8" y1="0" x2="8" y2="19" stroke={color} strokeWidth="3" />
      <line x1="8" y1="31" x2="8" y2="50" stroke={color} strokeWidth="3" />
      <path d="M4 8 L8 4 L12 8" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 14 L8 10 L12 14" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="19" width="12" height="12" rx="1.8" stroke={housingColor} strokeWidth="1.7" />
      <circle cx="8" cy="22" r="1.15" fill={housingColor} />
      <circle cx="8" cy="28" r="1.15" fill={housingColor} />
      {position === "Closed"
        ? <line x1="8" y1="22" x2="8" y2="28" stroke={housingColor} strokeWidth="1.8" strokeLinecap="round" />
        : <line x1="8" y1="22" x2="11" y2="25" stroke={housingColor} strokeWidth="1.8" strokeLinecap="round" />}
      <path d="M4 36 L8 40 L12 36" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 42 L8 46 L12 42" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type BreakerDetailData = {
  key: string;
  name: string;
  role?: string;
  style: "Fixed-Mount" | "Draw-Out";
  derived: boolean;
  position: "Closed" | "Open";
  emergency: boolean;
  poweredBy?: string;
  feeds?: string;
  frameSize?: string;
  tripRating?: string;
  switchRating?: string;
  ratedVoltage?: string;
  interruptingRating?: string;
  poles?: string;
  isSwitch?: boolean;
};

/** "800" → "800 AF"; nothing entered → "—". */
function withUnit(value: string | undefined, unit: string) {
  return value ? `${value} ${unit}` : "—";
}

function breakerNameplate(piece?: WizardPiece): Pick<BreakerDetailData, "frameSize" | "tripRating" | "switchRating" | "ratedVoltage" | "interruptingRating" | "poles" | "isSwitch"> {
  const meta = piece?.meta || {};
  const value = (key: string) => typeof meta[key] === "string" && meta[key] ? String(meta[key]) : undefined;
  return {
    frameSize: value("frameSize"),
    tripRating: value("tripRating"),
    switchRating: value("switchRating"),
    ratedVoltage: value("voltage") || value("ratedVoltage"),
    interruptingRating: value("interruptingKa") || value("interruptingRating"),
    poles: value("poles"),
    isSwitch: meta.deviceType === "switch",
  };
}

function configuredBreakerPosition(piece: WizardPiece | undefined, monitored: boolean, fallback: "Closed" | "Open" = "Closed"): "Closed" | "Open" {
  if (monitored) return fallback;
  return piece?.meta?.normalPosition === "Open" ? "Open" : piece?.meta?.normalPosition === "Closed" ? "Closed" : fallback;
}

/** Popup for a single breaker in the generated spine — opened by clicking its glyph, matching the
 * highlighted-circle-then-popup interaction on the paper one-line reference. */
function BreakerDetailModal({ detail, onClose }: { detail: BreakerDetailData; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<DetailTab>("details");
  const subtitle = [detail.derived ? "Auto-derived" : "Configured", detail.style, detail.role].filter(Boolean).join(" · ");
  return (
    <Modal title="" onClose={onClose} className="wizard-result-modal wizard-panel-schedule-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close" onClick={onClose}>x</button>
      <div className="wizard-result-modal-body equipment-popup-fixed">
        <div className="wizard-panel-schedule-header"><h3>{detail.name}</h3>
        <p className="wizard-result-modal-meta">{subtitle}</p></div>
        <div className={`wizard-result-banner ${detail.position === "Open" ? "open" : detail.emergency ? "emergency" : "ready"}`}>{detail.position.toUpperCase()}{detail.position === "Closed" ? (detail.emergency ? " · EMERGENCY" : " · NORMAL") : ""}</div>
        <EquipmentRecordTabs recordKey={`breaker:${detail.key}`} active={activeTab} onChange={setActiveTab} />
        {activeTab === "details" && <div className="equipment-popup-scroll">
        <div className="wizard-panel-schedule-info">
          {detail.role && <div className="wizard-panel-schedule-info-row"><span>Role</span><b>{detail.role}</b></div>}
          <div className="wizard-panel-schedule-info-row"><span>Style</span><b>{detail.style}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>Position</span><b>{detail.position}</b></div>
          {/* Every nameplate field is always listed; anything not entered shows "—" (as the
              transformer popup does) instead of the row disappearing. */}
          {detail.isSwitch
            ? <div className="wizard-panel-schedule-info-row"><span>Switch Rating</span><b>{withUnit(detail.switchRating, "A")}</b></div>
            : <>
              <div className="wizard-panel-schedule-info-row"><span>Frame Rating</span><b>{withUnit(detail.frameSize, "AF")}</b></div>
              <div className="wizard-panel-schedule-info-row"><span>Trip Rating</span><b>{withUnit(detail.tripRating, "AT")}</b></div>
              {detail.switchRating && <div className="wizard-panel-schedule-info-row"><span>Switch Rating</span><b>{withUnit(detail.switchRating, "A")}</b></div>}
            </>}
          <div className="wizard-panel-schedule-info-row"><span>Rated Voltage</span><b>{detail.ratedVoltage || "—"}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>Interrupting Rating</span><b>{withUnit(detail.interruptingRating, "kA")}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>Poles</span><b>{detail.poles || "—"}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>Powered By</span><b>{detail.poweredBy || "—"}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>Feeds</span><b>{detail.feeds || "—"}</b></div>
        </div></div>}
      </div>
    </Modal>
  );
}

type ContainerDetailData = { piece: WizardPiece; feeds: string[]; feedsLabel?: string; poweredBy?: string };

/** Popup for a container box itself (switchgear, distribution gear, etc.) — opened by clicking its
 * label, wherever it appears: the main spine's "GEN SWBD" or any nested box in a downstream branch. */
function ContainerDetailModal({ piece, feeds, feedsLabel = "Feeders", poweredBy, onClose }: { piece: WizardPiece; feeds: string[]; feedsLabel?: string; poweredBy?: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<DetailTab>("details");
  const containerType = typeof piece.meta?.containerType === "string" ? piece.meta.containerType : "";
  const voltage = typeof piece.meta?.voltage === "string" ? piece.meta.voltage : "";
  const voltageWithUnit = voltage ? (/v(?:olts?)?$/i.test(voltage.trim()) ? voltage.trim() : `${voltage.trim()} V`) : "—";
  const busCount = typeof piece.meta?.busCount === "string" ? piece.meta.busCount : "";
  return (
    <Modal title="" onClose={onClose} className="wizard-result-modal wizard-panel-schedule-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close" onClick={onClose}>x</button>
      <div className="wizard-result-modal-body equipment-popup-fixed">
        <div className="wizard-panel-schedule-header"><h3>{piece.name}</h3>
        <p className="wizard-result-modal-meta">{containerType || "Container"}</p></div>
        <div className="wizard-result-banner ready">{busCount ? `${busCount} BUS${busCount === "1" ? "" : "ES"}` : "CONTAINER"} · {feeds.length} {feedsLabel.toUpperCase()}</div>
        <EquipmentRecordTabs recordKey={`container:${piece.name}`} active={activeTab} onChange={setActiveTab} />
        {activeTab === "details" && <div className="equipment-popup-scroll">
        <div className="wizard-panel-schedule-info">
          {poweredBy && <div className="wizard-panel-schedule-info-row"><span>Fed From</span><b>{poweredBy}</b></div>}
          <div className="wizard-panel-schedule-info-row"><span>Container Type</span><b>{containerType || "—"}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>Voltage</span><b>{voltageWithUnit}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>Buses</span><b>{busCount ? `${busCount} (${busCount === "1" ? "single bus" : "multi-bus"})` : "—"}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>{feedsLabel}</span><b>{feeds.length ? feeds.join(", ") : "—"}</b></div>
        </div></div>}
      </div>
    </Modal>
  );
}

type OneLineInspectorApi = {
  selectedBreakerKey: string | null;
  openBreaker: (detail: BreakerDetailData) => void;
  selectedContainerName: string | null;
  openContainer: (detail: ContainerDetailData) => void;
  isMonitored: (name: string) => boolean;
  atsForName: (name: string) => ATS | undefined;
  atsTelemetryFor: (ats: ATS) => Partial<AtsTelemetry> | undefined;
  openAts: (ats: ATS) => void;
};
const OneLineInspectorContext = createContext<OneLineInspectorApi | null>(null);
/** Lets any breaker or container node in the generated one-line — the main spine, or any depth of a
 * downstream branch's container/breaker/distribution-gear tree — open the same detail popup and share
 * the same click-highlight state, without threading the handlers through every level of recursion. */
function useOneLineInspector(): OneLineInspectorApi {
  const ctx = useContext(OneLineInspectorContext);
  if (!ctx) throw new Error("useOneLineInspector must be used inside a generated one-line view");
  return ctx;
}

/** The clickable hit-circle around any breaker glyph, anywhere in the one-line — main spine or a
 * downstream branch tree, any depth. One shared component so every breaker opens its popup and
 * highlights through the exact same useOneLineInspector() path, instead of some call sites reading
 * ResultTab's local state directly and others going through context. */
function BreakerHitButton({ detail, children }: { detail: BreakerDetailData; children: React.ReactNode }) {
  const { selectedBreakerKey, openBreaker } = useOneLineInspector();
  return (
    <button type="button" className={`sld-breaker-hit${selectedBreakerKey === detail.key ? " selected" : ""}`} aria-label={`Open ${detail.name} details`} onClick={() => openBreaker(detail)}>
      {children}
    </button>
  );
}

/** The clickable "GEN SWBD"-style label on the main spine's switchgear box — a dedicated component
 * (rather than an inline button reading state straight off ResultTab) so it opens its popup through
 * the exact same useOneLineInspector() path every other container in the one-line uses, main spine or
 * a downstream branch tree alike. */
function SwitchgearLabelButton({ switchgear, feeds }: { switchgear: WizardPiece; feeds: string[] }) {
  const { selectedContainerName, openContainer } = useOneLineInspector();
  return (
    <button
      type="button"
      className={`result-switchgear-label${selectedContainerName === switchgear.name ? " selected" : ""}`}
      aria-label={`Open ${switchgear.name} details`}
      onClick={() => openContainer({ piece: switchgear, feeds, feedsLabel: "Incomers" })}
    >
      {switchgear.name}
    </button>
  );
}

/** ResultTab is also opened from the Site Systems page (outside SystemOperationsOverview), so it takes
 * its own systemId for the shared equipment notes, falling back to an enclosing one. */
export function ResultTab({ systemId, ...props }: React.ComponentProps<typeof ResultTabBody> & { systemId?: string }) {
  const enclosingSystemId = useContext(EquipmentSystemContext);
  return <EquipmentSystemContext.Provider value={systemId || enclosingSystemId}><ResultTabBody {...props} /></EquipmentSystemContext.Provider>;
}

function ResultTabBody({
  systemName, customerLogo, customerName, ats, generators, monitoredAssets, atsTelemetry, generatorTelemetry, pieces, emergencySourceLinks, normalSourceLinks, atsDownstream, pieceDownstream, normalPieceDownstream, generated, onUpdatePiece,
}: { systemName: string; customerLogo?: string | null; customerName?: string; ats: ATS[]; generators: Generator[]; monitoredAssets: MonitoredAsset[]; atsTelemetry?: AtsTelemetry[]; generatorTelemetry?: GeneratorTelemetry[]; pieces: WizardPiece[]; emergencySourceLinks: Record<string, string>; normalSourceLinks: Record<string, string>; atsDownstream: Record<string, string>; pieceDownstream: Record<string, string[]>; normalPieceDownstream?: Record<string, string[]>; generated: boolean; onUpdatePiece?: (oldName: string, piece: WizardPiece) => void }) {
  const [openAts, setOpenAts] = useState<ATS | null>(null);
  const [openGenerator, setOpenGenerator] = useState<Generator | null>(null);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [branchAts, setBranchAts] = useState<ATS | null>(null);
  const [scheduleView, setScheduleView] = useState<{ piece: WizardPiece; tone: BranchPowerTone; fedFrom: string } | null>(null);
  const [spineZoom, setSpineZoom] = useState(1);
  const [spineSource, setSpineSource] = useState<"emergency" | "normal">("emergency");
  const [showLegend, setShowLegend] = useState(false);
  const [breakerDetail, setBreakerDetail] = useState<BreakerDetailData | null>(null);
  const [containerDetail, setContainerDetail] = useState<ContainerDetailData | null>(null);
  const monitoredNames = useMemo(() => new Set(monitoredAssets.map((asset) => asset.asset_tag.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""))), [monitoredAssets]);
  const isMonitored = (name: string) => monitoredNames.has(name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""));
  const normalTopology = normalPieceDownstream || pieceDownstream;
  const openAtsConnectedLoads = useMemo(
    () => connectedLoadNamesForAts(openAts, atsDownstream, pieceDownstream, monitoredAssets),
    [openAts, atsDownstream, pieceDownstream, monitoredAssets],
  );
  const changeSpineZoom = (change: number) => setSpineZoom((current) => Math.min(2, Math.max(0.5, Number((current + change).toFixed(1)))));
  // Shared across the main spine (below) and, via the Provider wrapping this whole return, every depth
  // of a downstream branch's container/breaker/distribution-gear tree — one popup implementation, one
  // click-highlight state, instead of threading these handlers through every level of recursion.
  const inspectorApi = useMemo<OneLineInspectorApi>(() => ({
    selectedBreakerKey: breakerDetail?.key ?? null,
    openBreaker: setBreakerDetail,
    selectedContainerName: containerDetail?.piece.name ?? null,
    openContainer: setContainerDetail,
    isMonitored,
    atsForName: (name) => ats.find((item) => item.name.toLowerCase() === name.toLowerCase() || item.id.toLowerCase() === name.toLowerCase()),
    atsTelemetryFor: (item) => resolveAtsTelemetry(atsTelemetry, item.id, item.name),
    // A nested ATS is clicked from inside the full-screen branch modal. Close that layer first so the
    // standard ATS faceplate is not mounted underneath it and hidden by the branch overlay.
    openAts: (item) => { setBranchAts(null); setOpenAts(item); },
  }), [breakerDetail, containerDetail, monitoredNames, ats, atsTelemetry]);

  // Wiring up equipment/connections isn't enough on its own — this stays empty until "Finish & Generate"
  // is actually clicked in the wizard (see onGenerate/oneLineGenerated in SystemOperationsOverview), so
  // this tab never shows a diagram the user hasn't explicitly asked to generate yet.
  if (!pieces.length || !generated) {
    return (
      <section className="operations-section">
        <div className="wizard-result-empty">
          <p className="wizard-result-empty-text">Nothing generated yet — build your one-line and connections in the One-Line Wizard tab, then click Finish &amp; Generate.</p>
        </div>
      </section>
    );
  }

  const collectReachable = (links: Record<string, string>, graph: Record<string, string[]>) => {
    const reachable = new Set<string>();
    const stack = Object.values(links);
    while (stack.length) {
      const name = stack.pop();
      if (!name || name === "End" || reachable.has(name)) continue;
      reachable.add(name);
      stack.push(...(graph[name] || []));
    }
    return reachable;
  };
  const emergencyReachable = collectReachable(emergencySourceLinks, pieceDownstream);
  const normalReachable = collectReachable(normalSourceLinks, normalTopology);
  const activeReachable = spineSource === "normal" ? normalReachable : emergencyReachable;
  const containers = pieces.filter((piece) => piece.type === "container");
  const graphForActiveLine = spineSource === "normal" ? normalTopology : pieceDownstream;
  const namesInActiveGraph = new Set([...Object.keys(graphForActiveLine), ...Object.values(graphForActiveLine).flat()]);
  // Older diagrams treated the first container as the visual bus enclosure without putting that
  // container into the connection chain itself. Prefer a container explicitly used by this line,
  // then retain that legacy Emergency fallback so an existing generated bus never disappears.
  // Normal intentionally has no global fallback: a Normal-only enclosure must be connected in the
  // Normal graph and must never cause a shared/legacy Emergency enclosure to be replaced.
  const switchgear = containers.find((piece) => activeReachable.has(piece.name) || namesInActiveGraph.has(piece.name))
    || (spineSource === "emergency" ? containers[0] : undefined);
  // Precomputed once and rendered in two places — the generator lead-in (G icon, wire, output breaker)
  // sits above the switchgear box's dashed boundary, and the entry wire/bus feed sits inside it, so the
  // boundary reads as the actual switchgear enclosure rather than swallowing the generators themselves.
  const generatorViews = generators.map((generator, index) => {
    const data = resolveGeneratorTelemetry(generatorTelemetry, generator.id, generator.name);
    const running = Boolean(data?.running);
    // Structural tone keeps the exact tuned lead/tail connector heights from the real one-line
    // diagram (emergency-source/normal-source). "standby" only overrides the *color* on top of
    // that — the G icon stays green when ready, but the wire/breaker read grey (de-energized)
    // until this generator is actually running and pushing power.
    const structuralTone: "emergency-source" | "normal-source" = running ? "emergency-source" : "normal-source";
    const lineClass = running ? structuralTone : `${structuralTone} standby`;
    const breakerTone: "emergency" | "tie" = running ? "emergency" : "tie";
    // The real breaker(s) this generator is actually wired to (Connections step: Generator → Breaker →
    // Breaker → ...), not a phantom that merely happens to share the generator's own name. A chain like
    // Generator → GEN #1-SKID (Fixed-Mount) → 52-G1 (Draw-Out) → GEN SWBD models a local disconnect at
    // the genset feeding a separate breaker at the switchgear — leadBreaker is the first (rendered above
    // the switchgear's dashed border), entryBreaker the second, if any (rendered inside it, in the slot
    // that otherwise falls back to a plain wire). Walking stops at the first piece that isn't itself a
    // breaker (a container like GEN SWBD, an ATS, "End") — a generator wired straight through with no
    // breaker at all, or only one, leaves the other slot as that existing plain-wire fallback.
    let leadBreaker: WizardPiece | undefined;
    let entryBreaker: WizardPiece | undefined;
    const seen = new Set<string>();
    let current: string | undefined = emergencySourceLinks[generator.id];
    while (current && !seen.has(current)) {
      seen.add(current);
      const piece = pieces.find((item) => item.name === current);
      if (piece?.type !== "breaker") break;
      if (!leadBreaker) leadBreaker = piece;
      else if (!entryBreaker) { entryBreaker = piece; break; }
      current = (pieceDownstream[current] || [])[0];
    }
    return { generator, data, running, structuralTone, lineClass, breakerTone, leadBreaker, entryBreaker, index };
  });
  // Nothing renders here by default just because the equipment exists — a generator only shows once
  // it's actually wired to something (sourceLinks), and an ATS only shows once a wired source's chain
  // actually reaches it (walking sourceLinks → pieceDownstream), so the spine visibly builds up one
  // connection at a time instead of presenting every registered generator/ATS from the start. This is
  // deliberately about the ATS's UPSTREAM feed, not whether the ATS has confirmed its own downstream
  // load yet (atsDownstream) — that's separate, still shown as "Not Wired" inside an otherwise-visible
  // ATS box below.
  const wiredGeneratorViews = generatorViews.filter(({ generator }) => Boolean(emergencySourceLinks[generator.id]));
  // Every breaker wired in series between Utility and the first non-breaker (normally the main
  // switchgear), e.g. Utility -> b1 -> sw. The Normal spine draws each of them on the incomer.
  const utilityIncomers: WizardPiece[] = [];
  if (normalSourceLinks.utility) {
    const seen = new Set<string>();
    let current: string | undefined = normalSourceLinks.utility;
    while (current && !seen.has(current)) {
      seen.add(current);
      const piece = pieces.find((item) => item.name === current);
      if (piece?.type !== "breaker") break;
      utilityIncomers.push(piece);
      current = (normalTopology[current] || [])[0];
    }
  }
  const utilityLeadBreaker: WizardPiece | undefined = utilityIncomers[0];
  const utilityEntryBreaker: WizardPiece | undefined = utilityIncomers[1];
  // Utility belongs exclusively to the Normal diagram. Keeping this active while the Emergency tab
  // is selected was the direct cause of the Normal incomer being drawn across the Emergency one-line.
  const utilityWired = spineSource === "normal" && Boolean(normalSourceLinks.utility);
  const hasWiredSources = utilityWired || wiredGeneratorViews.length > 0;
  const busIsUtilityOnly = utilityWired && wiredGeneratorViews.length === 0;
  const busToneClass = busIsUtilityOnly ? "normal" : "emergency";
  const reachableFromSources = new Set<string>();
  const reachGraph = spineSource === "normal" ? normalTopology : pieceDownstream;
  const reachStack = [...activeReachable];
  // A normal-side branch can be assembled before its Utility incomer is connected (for example,
  // GEN SWBD -> F1 -> ATS).  Keep that configured branch visible in the Normal result so the user
  // can review it; the existing utilityWired styling still renders the bus/wires as disconnected.
  // Once Utility is linked, source-based reachability remains authoritative and detached branches
  // are not presented as if they were energized from that source.
  if (spineSource === "normal" && !normalSourceLinks.utility) {
    const downstreamNames = new Set(Object.values(normalTopology).flat());
    reachStack.push(...Object.keys(normalTopology).filter((name) => !downstreamNames.has(name)));
  }
  while (reachStack.length) {
    const name = reachStack.pop();
    if (!name || name === "End" || reachableFromSources.has(name)) continue;
    reachableFromSources.add(name);
    reachStack.push(...(reachGraph[name] || []));
  }
  const wiredAts = ats.filter((item) => reachableFromSources.has(item.name));
  // Normal bus feeders, built from the switchgear's own connections in their wired order (mirrors the
  // Emergency spine's emergencyFeederColumns). A breaker on the bus is always drawn: as the feeder of
  // the ATS it serves, or as a spare when nothing is wired to it yet — it is never pushed down into
  // the "Normal-only loads" box just because its load hasn't been connected.
  // "load" columns are bus feeders serving non-ATS equipment (e.g. F7 -> DP-N1, F8 -> CH-1, TIE -> MSB-B).
  // They sit on the main bus in wired order beside the ATS feeders, instead of being moved into the
  // detached "Normal-only loads" box (which now only holds loads not wired from this bus).
  type NormalFeederColumn = { kind: "ats"; ats: ATS; feederPiece?: WizardPiece } | { kind: "spare"; feederPiece: WizardPiece } | { kind: "load"; key: string; feederPiece?: WizardPiece; tree: WizardTreeNode[] };
  const normalFeederColumns: NormalFeederColumn[] = [];
  const normalLoadRoots: string[] = [];
  const atsNameSet = new Set(ats.map((item) => item.name));
  if (spineSource === "normal" && switchgear) {
    for (const childName of normalTopology[switchgear.name] || []) {
      if (childName === "End") continue;
      const directAts = wiredAts.find((item) => item.name === childName);
      if (directAts) { normalFeederColumns.push({ kind: "ats", ats: directAts }); continue; }
      if (atsNameSet.has(childName)) continue;
      const breaker = pieces.find((piece) => piece.type === "breaker" && piece.name === childName);
      if (!breaker) {
        const tree = withoutAtsBranches(resolveWizardTree(childName, pieces, normalTopology), ats);
        if (tree.length) normalFeederColumns.push({ kind: "load", key: `load-${childName}`, tree });
        continue;
      }
      const destinations = (normalTopology[breaker.name] || []).filter((name) => name !== "End");
      const fedAts = wiredAts.find((item) => destinations.includes(item.name));
      if (fedAts) {
        normalFeederColumns.push({ kind: "ats", ats: fedAts, feederPiece: breaker });
        normalLoadRoots.push(...destinations.filter((name) => !atsNameSet.has(name)));
      } else if (!destinations.length) {
        normalFeederColumns.push({ kind: "spare", feederPiece: breaker });
      } else {
        const tree = withoutAtsBranches(destinations.flatMap((name) => resolveWizardTree(name, pieces, normalTopology)), ats);
        // A feeder whose only path leads to ATS units already drawn elsewhere has nothing left to show.
        if (tree.length) normalFeederColumns.push({ kind: "load", key: `load-${breaker.name}`, feederPiece: breaker, tree });
      }
    }
  }
  // Older/non-direct paths that still reach an ATS keep their column.
  for (const item of spineSource === "normal" ? wiredAts : []) {
    if (normalFeederColumns.some((column) => column.kind === "ats" && column.ats.id === item.id)) continue;
    const feederPiece = pieces.find((piece) => piece.type === "breaker" && (normalTopology[piece.name] || []).includes(item.name));
    // Only recover a legacy top-level feeder when that breaker is actually mounted on this main bus.
    // An ATS reached through another container belongs to that container's downstream branch instead.
    if (!feederPiece || !switchgear || !(normalTopology[switchgear.name] || []).includes(feederPiece.name)) continue;
    normalFeederColumns.push({ kind: "ats", ats: item, feederPiece });
  }
  // Genuine utility-fed loads that bypass every ATS. Never repeat what the spine already draws
  // (Utility, its incomer breakers, the switchgear) — start below the switchgear, or below the
  // incomer chain when no switchgear is wired.
  const lastIncomer = utilityIncomers[utilityIncomers.length - 1];
  const normalOnlyRoots = switchgear && spineSource === "normal"
    ? normalLoadRoots
    : lastIncomer ? (normalTopology[lastIncomer.name] || []) : normalSourceLinks.utility ? [normalSourceLinks.utility] : [];
  const normalOnlyTree = withoutAtsBranches(normalOnlyRoots.filter((name) => name !== "End").flatMap((name) => resolveWizardTree(name, pieces, normalTopology)), ats);
  // "load" columns are bus feeders that serve non-ATS equipment (e.g. F3 -> XFMR-1). They used to be
  // silently dropped, so a container wired with F1/F2/F3 only showed the feeders that reached an ATS.
  type EmergencyFeederColumn = { kind: "ats"; ats: ATS; feederPiece?: WizardPiece } | { kind: "spare"; feederPiece: WizardPiece } | { kind: "load"; key: string; feederPiece?: WizardPiece; tree: WizardTreeNode[] };
  const emergencyFeederColumns: EmergencyFeederColumn[] = [];
  if (switchgear && spineSource === "emergency") {
    for (const childName of pieceDownstream[switchgear.name] || []) {
      if (childName === "End") continue;
      const directAts = wiredAts.find((item) => item.name === childName);
      if (directAts) { emergencyFeederColumns.push({ kind: "ats", ats: directAts }); continue; }
      if (atsNameSet.has(childName)) continue;
      const breaker = pieces.find((piece) => piece.type === "breaker" && piece.name === childName);
      if (!breaker) {
        const tree = withoutAtsBranches(resolveWizardTree(childName, pieces, pieceDownstream), ats);
        if (tree.length) emergencyFeederColumns.push({ kind: "load", key: `load-${childName}`, tree });
        continue;
      }
      const destinations = (pieceDownstream[breaker.name] || []).filter((name) => name !== "End");
      const fedAts = wiredAts.find((item) => destinations.includes(item.name));
      if (fedAts) { emergencyFeederColumns.push({ kind: "ats", ats: fedAts, feederPiece: breaker }); continue; }
      if (!destinations.length) { emergencyFeederColumns.push({ kind: "spare", feederPiece: breaker }); continue; }
      const tree = withoutAtsBranches(destinations.flatMap((name) => resolveWizardTree(name, pieces, pieceDownstream)), ats);
      emergencyFeederColumns.push({ kind: "load", key: `load-${breaker.name}`, feederPiece: breaker, tree });
    }
  }
  // Preserve older/non-direct saved paths that are reachable but are not listed as direct switchgear
  // children, while keeping explicit bus order for the common F1/F2/... layout.
  for (const item of wiredAts) {
    if (emergencyFeederColumns.some((column) => column.kind === "ats" && column.ats.id === item.id)) continue;
    const feederPiece = pieces.find((piece) => piece.type === "breaker" && (pieceDownstream[piece.name] || []).includes(item.name));
    // Do not promote an ATS from a nested container (for example Switchgear -> ATS6) onto the main
    // C1-DIST bus. Legacy recovery is valid only for a breaker directly connected to the main bus.
    if (!feederPiece || !switchgear || !(pieceDownstream[switchgear.name] || []).includes(feederPiece.name)) continue;
    emergencyFeederColumns.push({ kind: "ats", ats: item, feederPiece });
  }
  // Resolve the label from the saved topology, not the ATS array position. ATS ordering is independent
  // of feeder ordering (for example the third ATS record can be connected to F1), so index-derived
  // labels such as `F${index + 1}` can report the wrong physical source.
  const feederLabelForAts = (item: ATS) => {
    const graph = spineSource === "normal" ? normalTopology : pieceDownstream;
    const upstreamName = Object.entries(graph).find(([, destinations]) => destinations.includes(item.name))?.[0];
    return upstreamName || "Not connected";
  };

  return (
    <OneLineInspectorContext.Provider value={inspectorApi}>
    <section className="operations-section wizard-section wizard-section-result">
      <div className="wizard-header-bar">
        <img className="wizard-brand-logo" src="/images/cpc-logo.png" alt="CPC" />
        <span className="wizard-header-label">Generated One-Line</span>
        <div className="result-source-toggle" role="tablist" aria-label="One-line power source">
          <button type="button" role="tab" aria-selected={spineSource === "emergency"} className={spineSource === "emergency" ? "active emergency" : ""} onClick={() => setSpineSource("emergency")}>Emergency</button>
          <button type="button" role="tab" aria-selected={spineSource === "normal"} className={spineSource === "normal" ? "active normal" : ""} onClick={() => setSpineSource("normal")}>Normal</button>
        </div>
        <button type="button" className="header-btn" onClick={() => setShowLegend(true)}>Legend</button>
      </div>
      <div className="result-spine-wrap">
        <div className="result-spine-header">
          <div>
            <div className="wizard-kicker">{spineSource === "emergency" ? `Emergency sources → ${switchgear ? switchgear.name : "Emergency switchgear"} → ATS emergency side` : "Utility service → Main switchgear / distribution → ATS normal side"}</div>
            <p className="result-spine-sub">{spineSource === "emergency" ? "Emergency spine (default) — click any ATS to view its downstream load." : "Normal-power spine — utility service feeds the normal side of each ATS."}</p>
          </div>
          <div className="wizard-diagram-zoom result-spine-zoom" aria-label="Spine zoom controls">
            <button type="button" aria-label="Zoom in" title="Zoom in" disabled={spineZoom >= 2} onClick={() => changeSpineZoom(0.1)}>+</button>
            <output aria-live="polite">{Math.round(spineZoom * 100)}%</output>
            <button type="button" aria-label="Zoom out" title="Zoom out" disabled={spineZoom <= 0.5} onClick={() => changeSpineZoom(-0.1)}>−</button>
            <button type="button" className="wizard-diagram-zoom-reset" onClick={() => setSpineZoom(1)}>Reset</button>
          </div>
        </div>
        {/* Scroll viewport: the diagram keeps its natural width (every feeder column side by side, never
            wrapped onto a second row), and this box scrolls horizontally/vertically when it is larger
            than the screen — at any browser zoom, any number of ATS, and any diagram zoom level. */}
        <div className="result-spine-viewport">
        <div className="result-spine" style={{ zoom: spineZoom }}>
          {spineSource === "normal" ? (
            <div className="normal-spine" role="tabpanel" aria-label="Normal power one-line">
              <button type="button" className="result-utility-source normal-spine-utility" title="Open Utility" aria-label="Open Utility details" onClick={() => setUtilityOpen(true)}>
                <span>UTILITY SERVICE</span><small>{utilityWired ? "Available" : "Not connected"}</small><UtilityTowerSymbol />
              </button>
              <span className={`normal-spine-line${utilityWired ? " energized" : " disconnected"}`} aria-hidden="true" />
              {/* Breakers wired between Utility and the switchgear (Utility -> b1 -> ... -> switchgear). */}
              {utilityWired && utilityIncomers.map((breaker, index) => {
                const position = configuredBreakerPosition(breaker, isMonitored(breaker.name));
                const detail: BreakerDetailData = {
                  key: `normal-incomer-${breaker.name}`,
                  name: breaker.name,
                  role: index === 0 ? "Utility Main" : "Normal Incomer",
                  style: breaker.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount",
                  derived: false,
                  position,
                  emergency: false,
                  poweredBy: index === 0 ? "Utility Service" : utilityIncomers[index - 1].name,
                  feeds: utilityIncomers[index + 1]?.name || switchgear?.name || "Main normal bus",
                  ...breakerNameplate(breaker),
                };
                return (
                  <Fragment key={breaker.name}>
                    <span className={`sld-breaker-with-tag normal-spine-incomer${isMonitored(breaker.name) ? "" : " one-line-unmonitored-breaker"}`}>
                      <BreakerHitButton detail={detail}>
                        <PieceSwitchingSymbol piece={breaker} tone="normal" position={position} />
                      </BreakerHitButton>
                      <span className="sld-breaker-tag normal-source">{breaker.name}</span>
                    </span>
                    <span className="normal-spine-line energized" aria-hidden="true" />
                  </Fragment>
                );
              })}
              <div className="normal-spine-switchgear">
                <button type="button" className="normal-spine-switchgear-label" onClick={() => switchgear && setContainerDetail({ piece: switchgear, feeds: [utilityIncomers[utilityIncomers.length - 1]?.name || "Utility Service"], feedsLabel: "Normal incomer" })} disabled={!switchgear}>
                  <strong>MAIN SWITCHGEAR / DISTRIBUTION</strong>
                  <small>{switchgear?.name || "Normal distribution"}</small>
                </button>
                {/* Incomer wire continues inside the enclosure, from its border down to the main bus. */}
                <span className={`normal-spine-incomer-drop${utilityWired ? " energized" : " disconnected"}`} aria-hidden="true" />
                <div className={`normal-spine-bus${utilityWired ? " energized" : " disconnected"}`} />
                <div className="normal-spine-feeders">
                  {normalFeederColumns.map((column) => {
                    const item = column.kind === "ats" ? column.ats : null;
                    const feederPiece = column.feederPiece;
                    const loadColumn = column.kind === "load" ? column : null;
                    const columnKey = loadColumn ? loadColumn.key : item?.id || `spare-${feederPiece?.name}`;
                    const columnStyle = loadColumn ? { width: loadColumnWidth(loadColumn.tree, 118, pieces) } : undefined;
                    const feederPosition = configuredBreakerPosition(feederPiece, Boolean(feederPiece && isMonitored(feederPiece.name)), utilityWired ? "Closed" : "Open");
                    const feederDetail: BreakerDetailData | null = feederPiece ? {
                      key: `normal-feeder-${item?.id || feederPiece.name}`,
                      name: feederPiece.name,
                      role: "Normal Feeder",
                      style: feederPiece.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount",
                      derived: false,
                      position: feederPosition,
                      emergency: false,
                      poweredBy: switchgear?.name || "Main normal bus",
                      feeds: item ? `${item.name} normal input` : loadColumn ? loadColumn.tree.map((node) => node.name).join(", ") : "Spare — not wired yet",
                      ...breakerNameplate(feederPiece),
                    } : null;
                    const breakerTone: "normal" | "tie" = utilityWired ? "normal" : "tie";
                    return (
                      <div className={`normal-spine-feeder${feederPiece ? "" : " direct"}`} key={columnKey} style={columnStyle}>
                        <span className="normal-spine-feeder-wire" aria-hidden="true">
                          {feederPiece ? <>
                            <span className={`normal-spine-line top${utilityWired ? " energized" : " disconnected"}`} />
                            <span className={`normal-spine-line bottom${utilityWired ? " energized" : " disconnected"}`} />
                          </> : <span className={`normal-spine-line continuous${utilityWired ? " energized" : " disconnected"}`} />}
                        </span>
                        {feederPiece && feederDetail && (
                          <span className={`sld-breaker-with-tag normal-spine-breaker${isMonitored(feederPiece.name) ? "" : " one-line-unmonitored-breaker"}`}>
                            <BreakerHitButton detail={feederDetail}>
                              <PieceSwitchingSymbol piece={feederPiece} tone={breakerTone} position={feederPosition} />
                            </BreakerHitButton>
                            <span className={`sld-breaker-tag ${utilityWired ? "normal-source" : "standby"}`}>{feederPiece.name}</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="result-ats-row normal-spine-ats-row">
                {normalFeederColumns.map((column) => {
                  if (column.kind === "spare") {
                    return <div className={`result-ats-col normal-spine-spare-col${utilityWired ? " energized" : " disconnected"}`} key={`spare-${column.feederPiece.name}`}><span className="normal-spine-spare-label">Not wired</span></div>;
                  }
                  if (column.kind === "load") {
                    return (
                      <div className="result-ats-col result-load-col normal-spine-load-col" key={column.key} style={{ width: loadColumnWidth(column.tree, 118, pieces) }}>
                        <WizardBranchChildren nodes={column.tree} pieces={pieces} onViewSchedule={(piece, tone, fedFrom) => setScheduleView({ piece, tone, fedFrom })} tone={utilityWired ? "normal" : "deenergized"} parentLabel={column.feederPiece?.name || switchgear?.name || "Bus"} />
                      </div>
                    );
                  }
                  const item = column.ats;
                  const data = resolveAtsTelemetry(atsTelemetry, item.id, item.name);
                  const emergency = data?.connected_source === "GENERATOR";
                  const downstream = atsDownstream[item.id];
                  return (
                    <div className="result-ats-col" key={item.id}>
                      <div className={`sld-ats result-ats-node ${emergency ? "on-emergency" : "on-normal"}`}>
                        <button type="button" className="sld-switch" aria-label={`Open ${item.name}: ${emergency ? "connected to emergency" : "connected to normal"}`} onClick={() => setOpenAts(item)}>
                          <span className={`sld-terminal normal-terminal ${!emergency ? "active" : ""}`}>N</span>
                          <span className={`sld-terminal emergency-terminal ${emergency ? "active" : ""}`}>E</span>
                          <i className="sld-arm" /><span className="sld-terminal load-terminal" aria-hidden="true" />
                        </button>
                        <b>{item.name}</b>
                        {downstream ? <button type="button" className="sld-load-label" onClick={() => setBranchAts(item)}>{downstream === "End" ? "End of line" : downstream}</button> : <span className="sld-load-label">No downstream</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!wiredAts.length && <p className="operations-empty normal-spine-empty">No ATS units wired yet — connect one in the Connections step.</p>}
              {normalOnlyTree.length > 0 && <section className="normal-only-loads" aria-label="Normal-only loads">
                <div><strong>NORMAL-ONLY LOADS</strong><span>Utility-fed equipment not routed through an ATS</span></div>
                <WizardBranchChildren nodes={normalOnlyTree} pieces={pieces} onViewSchedule={(piece, tone, fedFrom) => setScheduleView({ piece, tone, fedFrom })} tone="normal" parentLabel={switchgear?.name || lastIncomer?.name || "Utility Service"} />
              </section>}
            </div>
          ) : <>
          {/* Only the generator itself and its own output breaker sit above the boundary — the
              draw-out switchgear breaker (52-G#) is physically inside "GEN SWBD", so it stays inside
              the dashed box. A real wire segment runs on both sides of the border (here, and again just
              inside the box below) so the border crosses the middle of a plain wire, the same way the
              bottom border crosses the wire between the feeder breaker and the ATS below it. */}
          <div className="sld-generators result-gen-row result-gen-lead-row">
            {utilityWired && (() => {
              const leadPosition = configuredBreakerPosition(utilityLeadBreaker, Boolean(utilityLeadBreaker && isMonitored(utilityLeadBreaker.name)));
              const leadDetail: BreakerDetailData = {
                key: "lead-utility", name: utilityLeadBreaker?.name || "Utility Breaker",
                style: utilityLeadBreaker?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount",
                derived: !utilityLeadBreaker, position: leadPosition, emergency: false,
                poweredBy: "Utility", feeds: utilityEntryBreaker?.name || switchgear?.name || "Bus",
                ...breakerNameplate(utilityLeadBreaker),
              };
              return <div className="sld-generator-column result-utility-column" key="utility">
                <button type="button" className="result-utility-source" title="Open Utility" aria-label="Open Utility details" onClick={() => setUtilityOpen(true)}><span>UTILITY</span><small>Available</small><UtilityTowerSymbol /></button>
                <span className="sld-gear-connector normal-source" aria-hidden="true" />
                {utilityLeadBreaker ? <span className={`sld-breaker-with-tag${isMonitored(utilityLeadBreaker.name) ? "" : " one-line-unmonitored-breaker"}`}>
                  <BreakerHitButton detail={leadDetail}><PieceSwitchingSymbol piece={utilityLeadBreaker} tone="normal" position={leadPosition} /></BreakerHitButton>
                  <div className="sld-breaker-tag normal-source">{utilityLeadBreaker.name}</div>
                </span> : <span className="sld-gear-connector normal-source" aria-hidden="true" />}
                <span className="result-crossing-wire normal-source" aria-hidden="true" />
              </div>;
            })()}
            {wiredGeneratorViews.map(({ generator, data, running, structuralTone, lineClass, breakerTone, leadBreaker, entryBreaker }) => {
              const leadKey = `lead-${generator.id}`;
              const leadName = leadBreaker?.name || `${generator.name} Breaker`;
              const leadPosition = configuredBreakerPosition(leadBreaker, Boolean(leadBreaker && isMonitored(leadBreaker.name)), running ? "Closed" : "Open");
              const leadDetail: BreakerDetailData = {
                key: leadKey, name: leadName, style: leadBreaker?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount",
                derived: !leadBreaker, position: leadPosition, emergency: running,
                poweredBy: generator.name, feeds: entryBreaker?.name || switchgear?.name || "Bus",
                ...breakerNameplate(leadBreaker),
              };
              return (
              <div className="sld-generator-column" key={generator.id}>
                <button type="button" className={`sld-generator ${structuralTone}`} aria-label={`Open ${generator.name}`} title={`Open ${generator.name}`} onClick={() => setOpenGenerator(generator)}>
                  <i>G</i><span>{generator.name}</span><small>{data?.status || "Waiting"}</small>
                </button>
                <span className={`sld-gear-connector ${lineClass}`} aria-hidden="true" />
                {/* Whatever real breaker piece the generator is actually wired to first — styled to match
                    (Draw-Out gets the same square glyph it would anywhere else in this app, Fixed-Mount
                    or nothing wired keeps the plain arc) with its own real name, instead of an unlabeled
                    generic breaker regardless of what was actually created. */}
                {leadBreaker ? (
                  <span className={`sld-breaker-with-tag${isMonitored(leadBreaker.name) ? "" : " one-line-unmonitored-breaker"}`}>
                    <BreakerHitButton detail={leadDetail}>
                      <PieceSwitchingSymbol piece={leadBreaker} tone={breakerTone} position={leadPosition} />
                    </BreakerHitButton>
                    <div className={`sld-breaker-tag ${lineClass}`}>{leadBreaker.name}</div>
                  </span>
                ) : (
                  <span className={`sld-gear-connector ${lineClass}`} aria-hidden="true" />
                )}
                <span className={`result-crossing-wire ${lineClass}`} aria-hidden="true" />
              </div>
              );
            })}
            {!hasWiredSources && <p className="operations-empty">No utility or generators wired yet — connect a source in the Connections step.</p>}
          </div>
          {switchgear && (
            <div className={`result-switchgear-box${isMonitored(switchgear.name) ? "" : " one-line-unmonitored-container"}`}>
              <SwitchgearLabelButton
                switchgear={switchgear}
                feeds={[
                  ...(utilityWired ? [utilityEntryBreaker?.name || utilityLeadBreaker?.name || "Utility"] : []),
                  ...wiredGeneratorViews.map(({ entryBreaker, leadBreaker, index }) => entryBreaker?.name || leadBreaker?.name || `52-G${index + 1}`),
                ]}
              />
              {hasWiredSources && (
                <div className="sld-generators result-gen-row result-gen-entry-row">
                  {utilityWired && (() => {
                    const entryPosition = configuredBreakerPosition(utilityEntryBreaker, Boolean(utilityEntryBreaker && isMonitored(utilityEntryBreaker.name)));
                    const entryDetail: BreakerDetailData = {
                      key: "entry-utility", name: utilityEntryBreaker?.name || "Utility Incomer", role: "Incomer",
                      style: utilityEntryBreaker?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount",
                      derived: !utilityEntryBreaker, position: entryPosition, emergency: false,
                      poweredBy: utilityLeadBreaker?.name || "Utility", feeds: "Bus",
                      ...breakerNameplate(utilityEntryBreaker),
                    };
                    return <div className="sld-generator-column result-utility-column" key="utility-entry">
                      <span className="result-crossing-wire normal-source" aria-hidden="true" />
                      <span className="result-drawout-slot">
                        {utilityEntryBreaker ? <span className={`sld-breaker-with-tag${isMonitored(utilityEntryBreaker.name) ? "" : " one-line-unmonitored-breaker"}`}>
                          <BreakerHitButton detail={entryDetail}><PieceSwitchingSymbol piece={utilityEntryBreaker} tone="normal" position={entryPosition} /></BreakerHitButton>
                          <div className="sld-breaker-tag normal-source">{utilityEntryBreaker.name}</div>
                        </span> : <span className="sld-gear-connector normal-source" aria-hidden="true" />}
                      </span>
                      <span className="sld-gear-connector tail normal-source" aria-hidden="true" />
                    </div>;
                  })()}
                  {wiredGeneratorViews.map(({ generator, lineClass, breakerTone, entryBreaker, leadBreaker, running, index }) => {
                    const entryKey = `entry-${generator.id}`;
                    const entryName = entryBreaker?.name || `52-G${index + 1}`;
                    const entryPosition = configuredBreakerPosition(entryBreaker, Boolean(entryBreaker && isMonitored(entryBreaker.name)), running ? "Closed" : "Open");
                    const entryDetail: BreakerDetailData = {
                      key: entryKey, name: entryName, role: "Incomer", style: entryBreaker?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount",
                      derived: !entryBreaker, position: entryPosition, emergency: running,
                      poweredBy: leadBreaker?.name || generator.name, feeds: "Bus",
                      ...breakerNameplate(entryBreaker),
                    };
                    return (
                    <div className="sld-generator-column" key={generator.id}>
                      {/* This slot always reserves the same height whether or not a second breaker piece
                          exists in this generator's chain — otherwise a column without one renders shorter
                          than its neighbors and falls short of the bus below. */}
                      <span className={`result-crossing-wire ${lineClass}`} aria-hidden="true" />
                      <span className="result-drawout-slot">
                        {entryBreaker ? (
                          <span className={`sld-breaker-with-tag${isMonitored(entryBreaker.name) ? "" : " one-line-unmonitored-breaker"}`}>
                            <BreakerHitButton detail={entryDetail}>
                              <PieceSwitchingSymbol piece={entryBreaker} tone={breakerTone} position={entryPosition} />
                            </BreakerHitButton>
                            <div className={`sld-breaker-tag ${lineClass}`}>{entryBreaker.name}</div>
                          </span>
                        ) : (
                          <span className={`sld-gear-connector ${lineClass}`} aria-hidden="true" />
                        )}
                      </span>
                      <span className={`sld-gear-connector tail ${lineClass}`} aria-hidden="true" />
                    </div>
                    );
                  })}
                </div>
              )}
              {hasWiredSources && <div className={`result-bus ${busToneClass}`} />}
              {Boolean(emergencyFeederColumns.length) && (
                <div className="result-ats-row result-feeder-row">
                  {/* These feeders all drop off the same emergency bus, so — like the bus itself — they
                      stay red regardless of any one ATS's current normal/emergency state. */}
                  {emergencyFeederColumns.map((column) => {
                    if (column.kind === "spare") {
                      const feederPiece = column.feederPiece;
                      const spareDetail: BreakerDetailData = {
                        key: `spare-${feederPiece.name}`, name: feederPiece.name, role: "Spare", style: feederPiece.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount",
                        derived: false, position: "Open", emergency: false, poweredBy: switchgear?.name || "Bus", feeds: "No load connected", ...breakerNameplate(feederPiece),
                      };
                      return <div className="result-ats-col result-spare-feeder" key={`spare-${feederPiece.name}`}>
                        <span className={`result-connector ${busToneClass}`} />
                        <span className={`sld-breaker-with-tag${isMonitored(feederPiece.name) ? "" : " one-line-unmonitored-breaker"}`}>
                          <BreakerHitButton detail={spareDetail}>
                            <SpareBreakerGlyph size={38} />
                          </BreakerHitButton>
                          <div className="sld-breaker-tag standby">{feederPiece.name}</div>
                        </span>
                        <span className="result-spare-tail" aria-hidden="true" />
                        <strong className="result-spare-label">Spare</strong>
                      </div>;
                    }
                    if (column.kind === "load") {
                      const loadFeeder = column.feederPiece;
                      const loadPosition = configuredBreakerPosition(loadFeeder, Boolean(loadFeeder && isMonitored(loadFeeder.name)));
                      const loadDetail: BreakerDetailData | null = loadFeeder ? {
                        key: `feeder-${column.key}`, name: loadFeeder.name, role: "Feeder", style: loadFeeder.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount", derived: false,
                        position: loadPosition, emergency: !busIsUtilityOnly, poweredBy: switchgear?.name || "Bus", feeds: column.tree.map((node) => node.name).join(", ") || "Load",
                        ...breakerNameplate(loadFeeder),
                      } : null;
                      return (
                      <div className="result-ats-col" key={column.key} style={{ width: loadColumnWidth(column.tree, 104, pieces) }}>
                        <span className={`result-connector ${busToneClass}`} />
                        {loadFeeder && loadDetail ? (
                          <span className={`sld-breaker-with-tag${isMonitored(loadFeeder.name) ? "" : " one-line-unmonitored-breaker"}`}>
                            <BreakerHitButton detail={loadDetail}>
                              <PieceSwitchingSymbol piece={loadFeeder} tone={busIsUtilityOnly ? "normal" : "emergency"} position={loadPosition} />
                            </BreakerHitButton>
                            <div className={`sld-breaker-tag ${busIsUtilityOnly ? "normal-source" : "emergency-source"}`}>{loadFeeder.name}</div>
                          </span>
                        ) : (
                          <span className={`result-connector ${busToneClass}`} aria-hidden="true" />
                        )}
                        <span className={`result-connector ${busToneClass}`} />
                      </div>
                      );
                    }
                    const item = column.ats;
                    // A feeder breaker is rendered only when the saved path actually contains a
                    // breaker immediately before this ATS. A direct GEN SWBD -> ATS connection is
                    // a plain wire; the wizard must never invent a 52-F breaker for it.
                    const feederPiece = column.feederPiece;
                    const feederKey = `feeder-${item.id}`;
                    const feederName = feederPiece?.name || "";
                    const feederPosition = configuredBreakerPosition(feederPiece, Boolean(feederPiece && isMonitored(feederPiece.name)));
                    const feederDetail: BreakerDetailData = {
                      key: feederKey, name: feederName, role: "Feeder", style: feederPiece?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount", derived: false,
                      position: feederPosition, emergency: !busIsUtilityOnly, poweredBy: switchgear?.name || "Bus", feeds: item.name,
                      ...breakerNameplate(feederPiece),
                    };
                    return (
                    <div className="result-ats-col" key={item.id}>
                      <span className={`result-connector ${busToneClass}`} />
                      {feederPiece ? (
                        <span className={`sld-breaker-with-tag${isMonitored(feederPiece.name) ? "" : " one-line-unmonitored-breaker"}`}>
                          <BreakerHitButton detail={feederDetail}>
                            <PieceSwitchingSymbol piece={feederPiece} tone={busIsUtilityOnly ? "normal" : "emergency"} position={feederPosition} />
                          </BreakerHitButton>
                          <div className={`sld-breaker-tag ${busIsUtilityOnly ? "normal-source" : "emergency-source"}`}>{feederName}</div>
                        </span>
                      ) : (
                        <span className={`result-connector ${busToneClass}`} aria-hidden="true" />
                      )}
                      <span className={`result-connector ${busToneClass}`} />
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="result-ats-row">
            {emergencyFeederColumns.map((column) => {
              if (column.kind === "spare") return <div className="result-ats-col result-spare-placeholder" aria-hidden="true" key={`spare-placeholder-${column.feederPiece.name}`} />;
              if (column.kind === "load") {
                return (
                  <div className="result-ats-col result-load-col" key={column.key} style={{ width: loadColumnWidth(column.tree, 104, pieces) }}>
                    <span className={`result-connector ${busToneClass}`} aria-hidden="true" />
                    <WizardBranchChildren nodes={column.tree} pieces={pieces} onViewSchedule={(piece, tone, fedFrom) => setScheduleView({ piece, tone, fedFrom })} tone={busIsUtilityOnly ? "normal" : "emergency"} parentLabel={column.feederPiece?.name || switchgear?.name || "Bus"} />
                  </div>
                );
              }
              const item = column.ats;
              const data = resolveAtsTelemetry(atsTelemetry, item.id, item.name);
              const emergency = data?.connected_source === "GENERATOR";
              const downstream = atsDownstream[item.id];
              return (
                <div className="result-ats-col" key={item.id}>
                  <span className={`result-connector ${busToneClass}`} aria-hidden="true" />
                  <div className={`sld-ats result-ats-node ${emergency ? "on-emergency" : "on-normal"}`}>
                    <button type="button" className="sld-switch" aria-label={`Open ${item.name}: ${emergency ? "connected to emergency" : "connected to normal"}`} onClick={() => setOpenAts(item)}>
                      <span className={`sld-terminal normal-terminal ${!emergency ? "active" : ""}`}>N</span>
                      <span className={`sld-terminal emergency-terminal ${emergency ? "active" : ""}`}>E</span>
                      <i className="sld-arm" />
                      <span className="sld-terminal load-terminal" aria-hidden="true" />
                    </button>
                    <b>{item.name}</b>
                    {downstream ? (
                      <button type="button" className="sld-load-label" aria-label={`View ${item.name}'s downstream branch`} onClick={() => setBranchAts(item)}>
                        {downstream === "End" ? "End of line" : downstream}
                      </button>
                    ) : (
                      <span className="sld-load-label">No downstream</span>
                    )}
                  </div>
                </div>
              );
            })}
            {!wiredAts.length && <p className="operations-empty">No ATS units wired yet — connect one in the Connections step.</p>}
          </div>
          </>}
        </div>
        </div>
      </div>
      {openAts && (
        <EquipmentFaceplate
          systemName={systemName}
          ats={openAts}
          nameplate={monitoredAssets.find((asset) => asset.asset_type === "ats" && (asset.id === openAts.id || asset.asset_tag === openAts.name))}
          atsTelemetry={resolveAtsTelemetry(atsTelemetry, openAts.id, openAts.name)}
          connectedLoads={openAtsConnectedLoads}
          onClose={() => setOpenAts(null)}
          alwaysShowSourceAvailability
          fedFromLabel={feederLabelForAts(openAts)}
          extraSection={
            <>
              <div className="faceplate-v2-section-title">Downstream</div>
              {atsDownstream[openAts.id] ? (
                <button type="button" className="wizard-downstream-link" onClick={() => { setBranchAts(openAts); setOpenAts(null); }}>
                  {atsDownstream[openAts.id] === "End" ? "End of line" : atsDownstream[openAts.id]} — View on separate page →
                </button>
              ) : (
                <p className="faceplate-v2-load-box">No downstream configured — set this in the Wizard&apos;s Connections step.</p>
              )}
            </>
          }
        />
      )}
      {utilityOpen && <UtilityFaceplate systemName={systemName} leadBreaker={utilityLeadBreaker} entryBreaker={utilityEntryBreaker} switchgearName={switchgear?.name} onClose={() => setUtilityOpen(false)} />}
      {openGenerator && (
        <EquipmentFaceplate
          systemName={systemName}
          generator={openGenerator}
          nameplate={monitoredAssets.find((asset) => asset.asset_type === "generator" && (asset.id === openGenerator.id || asset.asset_tag === openGenerator.name))}
          generatorTelemetry={resolveGeneratorTelemetry(generatorTelemetry, openGenerator.id, openGenerator.name)}
          onClose={() => setOpenGenerator(null)}
        />
      )}
      {branchAts && (
        <ResultBranchModal
          systemName={systemName}
          ats={branchAts}
          atsTelemetry={resolveAtsTelemetry(atsTelemetry, branchAts.id, branchAts.name)}
          feederLabel={feederLabelForAts(branchAts)}
          pieces={pieces}
          monitoredAssets={monitoredAssets}
          atsDownstream={atsDownstream}
          pieceDownstream={pieceDownstream}
          onClose={() => setBranchAts(null)}
          onViewSchedule={(piece, tone, fedFrom) => setScheduleView({ piece, tone, fedFrom })}
        />
      )}
      {scheduleView && (
        <ResultPanelScheduleModal piece={scheduleView.piece} emergency={scheduleView.tone === "emergency"} fedFrom={scheduleView.fedFrom} customerLogo={customerLogo} customerName={customerName} existingNames={pieces.map((piece) => piece.name)} onClose={() => setScheduleView(null)} onSave={onUpdatePiece ? (oldName, updated) => { onUpdatePiece(oldName, updated); setScheduleView((current) => current ? { ...current, piece: updated } : current); } : undefined} />
      )}
      {showLegend && <ResultLegendModal onClose={() => setShowLegend(false)} />}
      {breakerDetail && <BreakerDetailModal detail={breakerDetail} onClose={() => setBreakerDetail(null)} />}
      {containerDetail && (
        <ContainerDetailModal
          piece={containerDetail.piece}
          feeds={containerDetail.feeds}
          feedsLabel={containerDetail.feedsLabel}
          poweredBy={containerDetail.poweredBy}
          onClose={() => setContainerDetail(null)}
        />
      )}
    </section>
    </OneLineInspectorContext.Provider>
  );
}

export function SystemOperationsOverview(props: React.ComponentProps<typeof SystemOperationsOverviewBody>) {
  return <EquipmentSystemContext.Provider value={props.systemId}><SystemOperationsOverviewBody {...props} /></EquipmentSystemContext.Provider>;
}

function SystemOperationsOverviewBody({ systemId, systemName, customerLogo, customerName, ats, generators, view, onViewChange, canEditOneLine = false }: { systemId: string; systemName: string; customerLogo?: string | null; customerName?: string; ats: ATS[]; generators: Generator[]; view: "details" | "wizard" | "result"; onViewChange: (view: "details" | "wizard" | "result") => void; canEditOneLine?: boolean }) {
  const navigate = useNavigate();
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentSelection | null>(null);
  const [selectedFuelTank, setSelectedFuelTank] = useState<MonitoredAsset | null>(null);
  const [testWizardOpen, setTestWizardOpen] = useState(false);
  const [alarmDisableOpen, setAlarmDisableOpen] = useState(false);
  const [alarmDuration, setAlarmDuration] = useState<"1h" | "4h" | "8h" | "24h" | "indefinite">("1h");
  const [alarmReason, setAlarmReason] = useState("");
  const { data: alarmDisable } = useAlarmDisableStatus(systemId);
  const { data: storedSystemEvents = [] } = useSystemEvents(systemId);
  const disableSystemAlarms = useDisableSystemAlarms(systemId);
  const enableSystemAlarms = useEnableSystemAlarms(systemId);
  // Lifted here (rather than inside OneLineWizardTab) so the built one-line survives switching
  // to the Result tab and back — both tabs are children of this same, always-mounted component.
  // Backed by the server (system_one_lines table) so it also survives a page refresh.
  const { data: savedOneLine, isLoading: oneLineLoading, isError: oneLineError } = useOneLine(systemId);
  const saveOneLine = useSaveOneLine();
  const [wizardPieces, setWizardPieces] = useState<WizardPiece[]>([]);
  const [wizardSourceLinks, setWizardSourceLinks] = useState<Record<string, string>>({});
  const [wizardAtsDownstream, setWizardAtsDownstream] = useState<Record<string, string>>({});
  const [wizardPieceDownstream, setWizardPieceDownstream] = useState<Record<string, string[]>>({});
  const [normalSourceLinks, setNormalSourceLinks] = useState<Record<string, string>>({});
  const [normalPieceDownstream, setNormalPieceDownstream] = useState<Record<string, string[]>>({});
  const [activeWizardLine, setActiveWizardLine] = useState<OneLineKind | null>(null);
  // True only once "Finish & Generate" has actually been clicked — the Result tab stays empty until
  // then, even though the wizard's own pieces/connections exist as soon as they're wired up.
  const [oneLineGenerated, setOneLineGenerated] = useState(false);
  const [normalOneLineGenerated, setNormalOneLineGenerated] = useState(false);
  const [oneLineHydrated, setOneLineHydrated] = useState(false);
  const [wizardEditRequest, setWizardEditRequest] = useState<WizardPiece | null>(null);

  useEffect(() => {
    if (savedOneLine === undefined) return; // still loading
    if (savedOneLine) {
      const data = savedOneLine.data as any;
      setWizardPieces(data.pieces || []);
      setWizardAtsDownstream(data.atsDownstream || {});
      // Older saved diagrams stored one destination per piece as a plain string — normalize those
      // into single-item arrays so a piece can now feed multiple downstream targets.
      const rawPieceDownstream = data.sharedPieceDownstream || data.pieceDownstream || {};
      setWizardPieceDownstream(
        Object.fromEntries(Object.entries(rawPieceDownstream).map(([name, value]) => [name, Array.isArray(value) ? value : [value]]))
      );
      if (data.lines) {
        setWizardSourceLinks(data.lines.emergency?.sourceLinks || {});
        setNormalSourceLinks(data.lines.normal?.sourceLinks || {});
        const rawNormalDownstream = data.lines.normal?.pieceDownstream || {};
        setNormalPieceDownstream(Object.fromEntries(Object.entries(rawNormalDownstream).map(([name, value]) => [name, Array.isArray(value) ? value : [value]])) as Record<string, string[]>);
        setOneLineGenerated(Boolean(data.lines.emergency?.generated));
        setNormalOneLineGenerated(Boolean(data.lines.normal?.generated));
      } else {
        // Legacy records represented both source sides in one map. Migrate Utility to Normal and all
        // generator/emergency sources to Emergency without discarding the existing diagram.
        const legacySources = data.sourceLinks || {};
        setWizardSourceLinks(Object.fromEntries(Object.entries(legacySources).filter(([id]) => id !== "utility")) as Record<string, string>);
        setNormalSourceLinks(legacySources.utility ? { utility: legacySources.utility } : {});
        setNormalPieceDownstream({});
        setOneLineGenerated(Boolean(data.generated));
        setNormalOneLineGenerated(Boolean(data.generated && legacySources.utility));
      }
    } else {
      // No saved one-line for this system: start from a clean slate rather than keeping whatever
      // was in memory before.
      setWizardPieces([]);
      setWizardAtsDownstream({});
      setWizardPieceDownstream({});
      setWizardSourceLinks({});
      setNormalSourceLinks({});
      setNormalPieceDownstream({});
      setOneLineGenerated(false);
      setNormalOneLineGenerated(false);
    }
    setOneLineHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedOneLine, systemId]);

  useEffect(() => {
    if (!oneLineHydrated) return;
    const hasContent = wizardPieces.length > 0 || Object.keys(wizardSourceLinks).length > 0 || Object.keys(normalSourceLinks).length > 0 || Object.keys(wizardAtsDownstream).length > 0 || Object.keys(wizardPieceDownstream).length > 0 || Object.keys(normalPieceDownstream).length > 0;
    // Don't create a row for a system nobody has touched the wizard for yet — but once one exists,
    // still save an emptied-out state (e.g. the user cleared everything back out on purpose).
    if (!hasContent && !savedOneLine) return;
    const timeout = setTimeout(() => {
      saveOneLine.mutate({ systemId, data: { version: 2, pieces: wizardPieces, atsDownstream: wizardAtsDownstream, sharedPieceDownstream: wizardPieceDownstream, lines: { emergency: { sourceLinks: wizardSourceLinks, generated: oneLineGenerated }, normal: { sourceLinks: normalSourceLinks, pieceDownstream: normalPieceDownstream, generated: normalOneLineGenerated } } } });
    }, 800);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneLineHydrated, wizardPieces, wizardSourceLinks, normalSourceLinks, wizardAtsDownstream, wizardPieceDownstream, normalPieceDownstream, oneLineGenerated, normalOneLineGenerated]);

  // ATS load-side wiring is shared by both source views (see atsLoadSideNodes). Keep the two topology
  // maps identical for those pieces: union them whenever either changes. This also repairs diagrams
  // saved before this rule, where e.g. DGg → F3 was wired only on the Normal side and so was missing
  // from the Emergency view and the ATS drill-down. Nothing is dropped — both sides' links are kept.
  const loadSideNodes = useMemo(
    () => atsLoadSideNodes(wizardAtsDownstream, wizardPieceDownstream, normalPieceDownstream),
    [wizardAtsDownstream, wizardPieceDownstream, normalPieceDownstream],
  );
  // What every view renders — merged for all users, including ones who can't edit the one-line.
  const sharedTopology = useMemo(
    () => shareAtsLoadSide(wizardAtsDownstream, wizardPieceDownstream, normalPieceDownstream),
    [wizardAtsDownstream, wizardPieceDownstream, normalPieceDownstream],
  );
  // Persist the merge only for users allowed to edit (the auto-save would otherwise be rejected).
  useEffect(() => {
    if (!oneLineHydrated || !canEditOneLine) return;
    if (sharedTopology.emergency !== wizardPieceDownstream) setWizardPieceDownstream(sharedTopology.emergency);
    if (sharedTopology.normal !== normalPieceDownstream) setNormalPieceDownstream(sharedTopology.normal);
  }, [oneLineHydrated, canEditOneLine, sharedTopology, wizardPieceDownstream, normalPieceDownstream]);
  // Edits to a load-side piece apply to both views; source-side edits stay on the active view only.
  const pieceDownstreamSetters = (name: string) => loadSideNodes.has(name)
    ? [setWizardPieceDownstream, setNormalPieceDownstream]
    : [activeWizardLine === "normal" ? setNormalPieceDownstream : setWizardPieceDownstream];

  const telemetry = useTelemetrySnapshot(systemId);
  const { data: alarms } = useAlarms({ systemId });
  const { data: reports = [] } = useReports({ systemId });
  const { data: monitoredAssets = [] } = useMonitoredAssets(systemId);
  useEffect(() => {
    const monitoredBreakersByName = new Map(monitoredAssets
      .filter((asset) => asset.asset_type === "breaker")
      .map((asset) => [asset.asset_tag.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""), asset.id]));
    if (!monitoredBreakersByName.size) return;
    // Superadmin conversion keeps the topology piece and every existing connection. Once Device
    // Administration contains the same breaker tag, attach its stable asset ID instead of replacing it.
    setWizardPieces((current) => current.map((piece) => {
      if (piece.type !== "breaker" || piece.meta?.monitoredAssetId) return piece;
      const assetId = monitoredBreakersByName.get(piece.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""));
      return assetId ? { ...piece, meta: { ...(piece.meta || {}), monitoredAssetId: assetId } } : piece;
    }));
  }, [monitoredAssets]);
  const activeAlarms = alarmOnly(alarms).filter((alarm) => alarm.status === "active");
  const onEmergency = ats.some((item) => resolveAtsTelemetry(telemetry?.ats, item.id, item.name)?.connected_source === "GENERATOR");
  const systemEvents: ActivityItem[] = [
    ...eventOnly(alarms).map((event) => ({ id: event.id, severity: event.severity, message: event.message, occurred_at: event.occurred_at })),
    ...storedSystemEvents.map((event) => ({ id: event.id, severity: "info", message: event.message, occurred_at: event.occurred_at })),
    ...generators.flatMap((generator) => {
      const data = resolveGeneratorTelemetry(telemetry?.generators, generator.id, generator.name);
      if (!data) return [];
      if (data.running || data.status === "RUNNING") return [{ id: `gen-running-${generator.id}`, severity: "critical", message: `${generator.name} running`, occurred_at: data.timestamp }];
      if (generatorHasAlarm(data)) return [{ id: `gen-alarm-${generator.id}`, severity: "warning", message: `${generator.name} alarm active`, occurred_at: data.timestamp }];
      if (data.auto_mode === false) return [{ id: `gen-auto-${generator.id}`, severity: "warning", message: `${generator.name} not in auto`, occurred_at: data.timestamp }];
      return [];
    }),
    ...ats.flatMap((item) => {
      const data = resolveAtsTelemetry(telemetry?.ats, item.id, item.name);
      if (!data) return [];
      if (data.status === "EMERGENCY" || data.connected_source === "GENERATOR") return [{ id: `ats-emergency-${item.id}`, severity: "critical", message: `${item.name} connected to generator`, occurred_at: data.timestamp }];
      if (data.status === "FAULT" || data.status === "OFFLINE") return [{ id: `ats-fault-${item.id}`, severity: "warning", message: `${item.name} ${data.status.toLowerCase()}`, occurred_at: data.timestamp }];
      if (data.status === "TRANSFERING" || data.transfer_in_progress) return [{ id: `ats-transfer-${item.id}`, severity: "info", message: `${item.name} transfer in progress`, occurred_at: data.timestamp }];
      return [];
    }),
  ];
  const selectedAts = selectedEquipment?.type === "ats" ? ats.find((item) => item.id === selectedEquipment.id) : undefined;
  const selectedGenerator = selectedEquipment?.type === "generator" ? generators.find((generator) => generator.id === selectedEquipment.id) : undefined;
  const selectedAtsTelemetry = selectedAts ? resolveAtsTelemetry(telemetry?.ats, selectedAts.id, selectedAts.name) : undefined;
  const selectedGeneratorTelemetry = selectedGenerator ? resolveGeneratorTelemetry(telemetry?.generators, selectedGenerator.id, selectedGenerator.name) : undefined;
  const fuelTanks = monitoredAssets.filter((asset) => asset.asset_type === "fuel_tank");
  const selectedNameplate = selectedAts
    ? monitoredAssets.find((asset) => asset.asset_type === "ats" && (asset.id === selectedAts.id || asset.asset_tag === selectedAts.name))
    : selectedGenerator
      ? monitoredAssets.find((asset) => asset.asset_type === "generator" && (asset.id === selectedGenerator.id || asset.asset_tag === selectedGenerator.name))
      : undefined;
  const selectedGeneratorTanks = selectedGenerator ? fuelTanks.filter((tank) => tank.served_generator_ids?.includes(selectedGenerator.id)) : [];
  const selectedAtsConnectedLoads = useMemo(
    () => connectedLoadNamesForAts(selectedAts, wizardAtsDownstream, sharedTopology.emergency, monitoredAssets),
    [selectedAts, wizardAtsDownstream, sharedTopology, monitoredAssets],
  );
  const lineReachesAts = (sourceLinks: Record<string, string>, downstream: Record<string, string[]>, item: ATS) => {
    const targets = new Set([item.id.toLowerCase(), item.name.toLowerCase()]);
    const visit = (name: string, seen = new Set<string>()): boolean => {
      if (targets.has(name.toLowerCase())) return true;
      if (seen.has(name)) return false;
      seen.add(name);
      return (downstream[name] || []).some((next) => visit(next, seen));
    };
    return Object.values(sourceLinks).some((destination) => visit(destination));
  };
  const lineStatus: Record<OneLineKind, { hasContent: boolean; generated: boolean }> = {
    emergency: { hasContent: Object.keys(wizardSourceLinks).length > 0 || Object.keys(wizardPieceDownstream).length > 0 || Object.keys(wizardAtsDownstream).length > 0 || oneLineGenerated, generated: oneLineGenerated },
    normal: { hasContent: Object.keys(normalSourceLinks).length > 0 || Object.keys(normalPieceDownstream).length > 0 || normalOneLineGenerated, generated: normalOneLineGenerated },
  };
  const atsFeedWarnings = ats.flatMap((item) => {
    const warnings: string[] = [];
    if (lineStatus.emergency.hasContent && !lineReachesAts(wizardSourceLinks, wizardPieceDownstream, item)) warnings.push(`${item.name} is missing an emergency feed.`);
    if (lineStatus.normal.hasContent && !lineReachesAts(normalSourceLinks, normalPieceDownstream, item)) warnings.push(`${item.name} is missing a normal feed.`);
    return warnings;
  });
  if (!lineStatus.emergency.hasContent) atsFeedWarnings.push("Emergency one-line not built.");
  if (!lineStatus.normal.hasContent) atsFeedWarnings.push("Normal one-line not built.");
  // Keep the overview in two panels while ensuring every ATS is displayed.
  // For five ATS this renders 3 on the left and 2 on the right, without a
  // redundant third table header for the final unit.
  const leftBankSize = Math.ceil(ats.length / 2);
  const atsBanks = ats.length ? [ats.slice(0, leftBankSize), ats.slice(leftBankSize)].filter((bank) => bank.length) : [];

  return <div className="operations-overview">
    <div className="operations-hero">
      <div className="operations-hero-left">
        <span className="operations-hero-kicker">Live system overview</span>
        <h2>{systemName}</h2>
        <p>Utility, generator and transfer-switch status</p>
        <div className="system-status-controls">
          <span className={`status-pill-lg ${onEmergency ? "pill-emergency" : "pill-normal"}`}>
            {onEmergency ? <IconAlert size={14} strokeWidth={2.5} /> : <IconCheckCircle size={14} strokeWidth={2.5} />}
            {onEmergency ? "Emergency" : "Normal operation"}
          </span>
          {alarmDisable?.can_control && (alarmDisable.disabled
            ? <button type="button" className="alarm-disable-control enable" disabled={enableSystemAlarms.isPending} onClick={() => enableSystemAlarms.mutate()}>Re-enable alarms</button>
            : <button type="button" className="alarm-disable-control" onClick={() => setAlarmDisableOpen(true)}>Disable alarms</button>)}
        </div>
        {alarmDisable?.disabled && <div className="alarms-disabled-badge">
          <strong><IconAlert size={13} /> Alarms disabled</strong>
          <span>By {alarmDisable.disabled_by_name || alarmDisable.disabled_by_email || "Unknown"} on {alarmDisable.disabled_at ? new Date(alarmDisable.disabled_at).toLocaleString() : "—"}</span>
          <span>Reason: {alarmDisable.reason}</span>
          <span>{alarmDisable.indefinite ? "Until turned back on · reminder emails every 24 hours" : `Ends ${alarmDisable.disabled_until ? new Date(alarmDisable.disabled_until).toLocaleString() : "—"}`}</span>
        </div>}
        {systemId === "SYS-0006" && (
          <div style={{ marginTop: 10, fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>
            <b style={{ color: telemetry?.storage?.mqtt_connected ? "#22c55e" : "#f59e0b" }}>
              MQTT STATUS: {telemetry?.storage?.mqtt_connected ? "LIVE" : telemetry ? "RECONNECTING · LAST DATA SHOWN" : "CONNECTING"}
            </b>
          </div>
        )}
        <div className="operations-view-tabs">
          <button type="button" className={`view-tab ${view === "details" ? "active" : ""}`} onClick={() => onViewChange("details")}>System Details</button>
          {canEditOneLine && <button type="button" className={`view-tab ${view === "wizard" ? "active" : ""}`} onClick={() => onViewChange("wizard")}>One-Line Wizard</button>}
          <button type="button" className={`view-tab ${view === "result" ? "active" : ""}`} onClick={() => onViewChange("result")}>One-Line</button>
        </div>
      </div>
      <EventsPanel alarms={activeAlarms} events={systemEvents} />
    </div>
    {/* Keep the wizard mounted while viewing the generated one-line so its exact working state
        (step, selected source, search, and pending connection) is restored when the user returns. */}
    {canEditOneLine && <div hidden={view !== "wizard"}>
      <OneLineWizardTab
        systemId={systemId} systemName={systemName} ats={ats} generators={generators} monitoredAssets={monitoredAssets}
        lineType={activeWizardLine} onSelectLine={setActiveWizardLine} lineStatus={lineStatus} atsFeedWarnings={atsFeedWarnings}
        // Rebuild resets every connection belonging to that line (sources, equipment-to-equipment and
        // ATS-to-downstream), so the Connections step starts clean. Created equipment and ATS units are kept.
        onRebuildLine={(line) => { if (line === "emergency") { setWizardSourceLinks({}); setWizardPieceDownstream({}); setWizardAtsDownstream({}); setOneLineGenerated(false); } else { setNormalSourceLinks({}); setNormalPieceDownstream({}); setNormalOneLineGenerated(false); } }}
        pieces={wizardPieces} addPiece={(piece) => setWizardPieces((current) => [...current, piece])}
        removePiece={(name) => {
          setWizardPieces((current) => current.filter((piece) => piece.name !== name));
          setWizardAtsDownstream((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value !== name)));
          setWizardSourceLinks((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value !== name)));
          setNormalSourceLinks((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value !== name)));
          setWizardPieceDownstream((current) => {
            const next: Record<string, string[]> = {};
            for (const [key, values] of Object.entries(current)) {
              if (key === name) continue;
              const filtered = values.filter((value) => value !== name);
              if (filtered.length) next[key] = filtered;
            }
            return next;
          });
          setNormalPieceDownstream((current) => {
            const next: Record<string, string[]> = {};
            for (const [key, values] of Object.entries(current)) { if (key !== name) { const filtered = values.filter((value) => value !== name); if (filtered.length) next[key] = filtered; } }
            return next;
          });
        }}
        updatePiece={(oldName, piece) => {
          setWizardPieces((current) => current.map((existing) => (existing.name === oldName ? piece : existing)));
          // Renamed — every place that referenced the piece by its old name needs to follow, or the
          // wiring quietly breaks (a source/ATS/piece link pointing at a name nothing matches anymore).
          if (piece.name === oldName) return;
          setWizardSourceLinks((current) =>
            Object.fromEntries(Object.entries(current).map(([id, destination]) => [id, destination === oldName ? piece.name : destination]))
          );
          setNormalSourceLinks((current) => Object.fromEntries(Object.entries(current).map(([id, destination]) => [id, destination === oldName ? piece.name : destination])));
          setWizardAtsDownstream((current) =>
            Object.fromEntries(Object.entries(current).map(([id, destination]) => [id, destination === oldName ? piece.name : destination]))
          );
          setWizardPieceDownstream((current) => {
            const next: Record<string, string[]> = {};
            for (const [key, values] of Object.entries(current)) {
              const nextKey = key === oldName ? piece.name : key;
              next[nextKey] = values.map((value) => (value === oldName ? piece.name : value));
            }
            return next;
          });
          setNormalPieceDownstream((current) => {
            const next: Record<string, string[]> = {};
            for (const [key, values] of Object.entries(current)) next[key === oldName ? piece.name : key] = values.map((value) => value === oldName ? piece.name : value);
            return next;
          });
        }}
        sourceLinks={activeWizardLine === "normal" ? normalSourceLinks : wizardSourceLinks} setSourceLink={(id, destination) => (activeWizardLine === "normal" ? setNormalSourceLinks : setWizardSourceLinks)((current) => ({ ...current, [id]: destination }))}
        removeSourceLink={(id) => (activeWizardLine === "normal" ? setNormalSourceLinks : setWizardSourceLinks)((current) => { const next = { ...current }; delete next[id]; return next; })}
        atsDownstream={wizardAtsDownstream} setAtsDownstreamLink={(id, destination) => setWizardAtsDownstream((current) => ({ ...current, [id]: destination }))}
        removeAtsLink={(id) => setWizardAtsDownstream((current) => { const next = { ...current }; delete next[id]; return next; })}
        pieceDownstream={activeWizardLine === "normal" ? sharedTopology.normal : sharedTopology.emergency}
        setPieceDownstreamLink={(name, destination) => pieceDownstreamSetters(name).forEach((setGraph) => setGraph((current) => {
          const existing = current[name] || [];
          if (existing.includes(destination)) return current;
          return { ...current, [name]: [...existing, destination] };
        }))}
        removePieceLink={(name, destination) => pieceDownstreamSetters(name).forEach((setGraph) => setGraph((current) => {
          const filtered = (current[name] || []).filter((value) => value !== destination);
          const next = { ...current };
          if (filtered.length) next[name] = filtered; else delete next[name];
          return next;
        }))}
        reorderPieceLink={(name, fromIndex, toIndex) => pieceDownstreamSetters(name).forEach((setGraph) => setGraph((current) => {
          const destinations = [...(current[name] || [])];
          if (fromIndex < 0 || fromIndex >= destinations.length || toIndex < 0 || toIndex >= destinations.length) return current;
          const [moved] = destinations.splice(fromIndex, 1);
          destinations.splice(toIndex, 0, moved);
          return { ...current, [name]: destinations };
        }))}
        onGenerate={() => activeWizardLine === "normal" ? setNormalOneLineGenerated(true) : setOneLineGenerated(true)}
        editPieceRequest={wizardEditRequest}
        onEditRequestHandled={() => setWizardEditRequest(null)}
      />
    </div>}
    {view === "wizard" ? null : view === "result" && oneLineLoading ? (
      <section className="operations-section"><div className="operations-empty" role="status">Loading saved one-line…</div></section>
    ) : view === "result" && oneLineError && !oneLineHydrated ? (
      <section className="operations-section"><div className="panel-save-error" role="alert">The saved one-line could not be loaded. Check the connection and refresh the page.</div></section>
    ) : view === "result" ? (
      <ResultTab
        systemName={systemName} customerLogo={customerLogo} customerName={customerName} ats={ats} generators={generators} monitoredAssets={monitoredAssets} atsTelemetry={telemetry?.ats} generatorTelemetry={telemetry?.generators}
        pieces={wizardPieces} emergencySourceLinks={wizardSourceLinks} normalSourceLinks={normalSourceLinks} atsDownstream={wizardAtsDownstream} pieceDownstream={sharedTopology.emergency} normalPieceDownstream={sharedTopology.normal}
        generated={oneLineGenerated || normalOneLineGenerated}
        onUpdatePiece={canEditOneLine ? (oldName, piece) => {
          setWizardPieces((current) => current.map((existing) => existing.name === oldName ? piece : existing));
          if (piece.name === oldName) return;
          setWizardSourceLinks((current) => Object.fromEntries(Object.entries(current).map(([id, destination]) => [id, destination === oldName ? piece.name : destination])));
          setNormalSourceLinks((current) => Object.fromEntries(Object.entries(current).map(([id, destination]) => [id, destination === oldName ? piece.name : destination])));
          setWizardAtsDownstream((current) => Object.fromEntries(Object.entries(current).map(([id, destination]) => [id, destination === oldName ? piece.name : destination])));
          setWizardPieceDownstream((current) => {
            const next: Record<string, string[]> = {};
            Object.entries(current).forEach(([key, values]) => { next[key === oldName ? piece.name : key] = values.map((value) => value === oldName ? piece.name : value); });
            return next;
          });
          setNormalPieceDownstream((current) => {
            const next: Record<string, string[]> = {};
            Object.entries(current).forEach(([key, values]) => { next[key === oldName ? piece.name : key] = values.map((value) => value === oldName ? piece.name : value); });
            return next;
          });
        } : undefined}
      />
    ) : (
      <>
        <section className="operations-section generator-section">
          <div className="operations-section-title"><div><span>Emergency power</span><h3>Generators</h3></div><button className="device-test-btn" onClick={() => setTestWizardOpen(true)}>Test</button></div>
          <div className="operations-table-wrap">
            <table className="operations-table generator-overview-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Sl.</th>
                  <th rowSpan={2}>Generator</th>
                  <th rowSpan={2}>Status</th>
                  <th colSpan={5} className="table-group-header engine">Engine data</th>
                  <th colSpan={12} className="table-group-header electrical">Electrical data</th>
                </tr>
                <tr className="table-subhead">
                  <th>Tank level</th><th>Hrs</th><th>Oil psi</th><th>H₂O temp</th><th>Batt V</th>
                  <th>VAB</th><th>VBC</th><th>VCA</th><th>VAN</th><th>VBN</th><th>VCN</th><th>Amps A</th><th>Amps B</th><th>Amps C</th><th>Hz</th><th>kW</th><th>% kW</th>
                </tr>
              </thead>
              <tbody>
                {generators.map((generator, index) => {
                  const data = resolveGeneratorTelemetry(telemetry?.generators, generator.id, generator.name);
                  const displayStatus = deviceDisplayStatus(generator, data);
                  const linkedTank = fuelTanks.find((tank) => tank.served_generator_ids?.includes(generator.id));
                  const linkedTankTelemetry = linkedTank ? telemetry?.fuel_tanks?.find((item) => item.equipment_id === linkedTank.id) : undefined;
                  const values = [
                    reading(linkedTankTelemetry?.level_percent, 0, "%"), reading(data?.engine_hours, 1),
                    reading(data?.oil_pressure_psi, 1), reading(data?.coolant_temperature_c, 1, "°C"),
                    reading(data?.battery_voltage, 1), reading(data?.voltage_ab, 1), reading(data?.voltage_bc, 1),
                    reading(data?.voltage_ca, 1), reading(data?.voltage_an, 1), reading(data?.voltage_bn, 1),
                    reading(data?.voltage_cn, 1), reading(data?.current_a, 1), reading(data?.current_b, 1),
                    reading(data?.current_c, 1), reading(data?.frequency, 1), reading(data?.active_power_kw, 1),
                    reading(data?.load_percentage, 1, "%"),
                  ];
                  return <tr className="equipment-detail-row" title={`View details for ${generator.name}`} key={generator.id} onClick={() => setSelectedEquipment({ type: "generator", id: generator.id })}>
                    <td className="serial-cell">{String(index + 1).padStart(2, "0")}</td><td className="device-name-cell">{generator.name}</td><td className={displayStatus === "NO DATA" || displayStatus === "OFFLINE" ? "device-communication-state" : generatorStatusClass(data)}>{displayStatus}</td>
                    {values.map((value, valueIndex) => <td key={valueIndex}>{value}</td>)}
                  </tr>;
                })}
                {!generators.length && <tr><td colSpan={20} className="operations-empty">No generator registered for this system.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="operations-section ats-section">
          <div className="operations-section-title"><div><span>Power distribution</span><h3>Automatic Transfer Switches</h3></div></div>
          <div className="ats-overview-grid">{atsBanks.map((bank, bankIndex) => <div className="ats-overview-card" key={bankIndex}><table className="operations-table"><thead><tr><th>Sl.</th><th>ATS name</th><th>Status</th><th>Connected to</th><th>Source available</th><th>Time to re-xfer</th><th>Time to bus</th></tr></thead><tbody>{bank.map((item, index) => { const serial = (bankIndex ? leftBankSize : 0) + index + 1; const data = resolveAtsTelemetry(telemetry?.ats, item.id, item.name) || telemetry?.ats.find((entry) => atsNumber(entry.equipment_id) === String(serial) || atsNumber(entry.equipment_name) === String(serial)); const emergency = data?.connected_source === "GENERATOR" || data?.status === "EMERGENCY"; const displayStatus = deviceDisplayStatus(item, data); const statusClass = displayStatus === "EMERGENCY" || displayStatus === "FAULT" ? "emergency-state ats-status-cell" : displayStatus === "NO DATA" || displayStatus === "OFFLINE" ? "device-communication-state" : "ready"; return <tr className={`equipment-detail-row ${emergency ? "ats-emergency-demo" : ""}`} title={`View details for ${item.name}`} key={item.id} onClick={() => setSelectedEquipment({ type: "ats", id: item.id })}><td className="serial-cell">{String(serial).padStart(2, "0")}</td><td className="device-name-cell">{item.name}</td><td className={statusClass}>{displayStatus}</td><td className={emergency ? "ats-connected-emergency" : data?.connected_source ? "ready" : "device-communication-state"}>{data?.connected_source || "—"}</td><td><div className="source-availability"><span className={data?.utility_available ? "available normal" : "unavailable"}><i />Normal</span><span className={data?.generator_available ? "available emergency" : "unavailable"}><i />Emergency</span></div></td><td>{data?.transfer_time_seconds ?? "—"}</td><td>{data?.time_on_emergency_seconds ?? "—"}</td></tr>; })}</tbody></table></div>)}</div>
          {!ats.length && <div className="operations-empty">No ATS units registered for this system.</div>}
        </section>
      </>
    )}
    {(selectedAts || selectedGenerator) && <EquipmentFaceplate systemName={systemName} ats={selectedAts} generator={selectedGenerator} nameplate={selectedNameplate} atsTelemetry={selectedAtsTelemetry} generatorTelemetry={selectedGeneratorTelemetry} connectedLoads={selectedAtsConnectedLoads} alarms={alarms || []} reports={reports} fuelTanks={selectedGeneratorTanks} fuelTankTelemetry={telemetry?.fuel_tanks || []} onTankClick={(tank) => { setSelectedFuelTank(tank); setSelectedEquipment(null); }} onClose={() => setSelectedEquipment(null)} />}
    {selectedFuelTank && <FuelTankFaceplate tank={selectedFuelTank} telemetry={telemetry?.fuel_tanks?.find((item) => item.equipment_id === selectedFuelTank.id)} generators={generators} onClose={() => setSelectedFuelTank(null)} />}
    {testWizardOpen && <TestWizard systemName={systemName} ats={ats} generators={generators} onClose={() => setTestWizardOpen(false)} />}
    {alarmDisableOpen && <Modal title="Disable system alarms" onClose={() => setAlarmDisableOpen(false)}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!alarmReason.trim()) return;
        disableSystemAlarms.mutate({ duration: alarmDuration, reason: alarmReason.trim() }, { onSuccess: () => { setAlarmDisableOpen(false); setAlarmReason(""); } });
      }}>
        <p className="alarm-disable-warning">Alarm notifications for <b>{systemName}</b> will be suppressed. Live telemetry and alarm records will continue to be monitored.</p>
        <div className="form-row"><label>Duration *</label><select value={alarmDuration} onChange={(event) => setAlarmDuration(event.target.value as typeof alarmDuration)}><option value="1h">1 hour</option><option value="4h">4 hours</option><option value="8h">8 hours</option><option value="24h">24 hours</option><option value="indefinite">Until turned back on</option></select></div>
        <div className="form-row"><label>Reason *</label><textarea required minLength={3} maxLength={2000} rows={4} value={alarmReason} onChange={(event) => setAlarmReason(event.target.value)} placeholder="Explain why alarms are being disabled" /></div>
        {disableSystemAlarms.isError && <p className="form-error">Unable to disable alarms. Check your access and try again.</p>}
        <div className="modal-actions"><button type="button" className="header-btn" onClick={() => setAlarmDisableOpen(false)}>Cancel</button><button type="submit" className="header-btn danger" disabled={!alarmReason.trim() || disableSystemAlarms.isPending}>{disableSystemAlarms.isPending ? "Disabling…" : "Disable alarms"}</button></div>
      </form>
    </Modal>}
  </div>;
}
