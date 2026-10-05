import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { IconAlert, IconATS, IconBell, IconBolt, IconCheckCircle, IconGenerator } from "../common/Icons";
import { Modal } from "../common/Modal";
import { TestWizard } from "./TestWizard";
import type { ATS, Generator } from "../../types/entities";
import { telemetryFor, useTelemetrySnapshot, type AtsTelemetry, type GeneratorTelemetry } from "../../hooks/useTelemetry";
import { demoAtsTelemetry, demoGeneratorTelemetry } from "../../data/mepstraTelemetry";
import { useAlarms } from "../../queries/alarms";
import { useOneLine, useSaveOneLine } from "../../queries/systems";
import boilerIcon from "../../assets/equipment/boiler.png";
import chillerIcon from "../../assets/equipment/chiller.png";
import coolingTowerIcon from "../../assets/equipment/cooling-tower.png";
import elevatorIcon from "../../assets/equipment/elevator.png";
import fanIcon from "../../assets/equipment/fan.png";
import pumpIcon from "../../assets/equipment/pump.png";
import generalIcon from "../../assets/equipment/general.png";
import airCompressorIcon from "../../assets/equipment/air-compressor.png";

type EquipmentSelection = { type: "ats"; id: string } | { type: "generator"; id: string };
const atsNumber = (value: string | undefined) => value?.match(/ats[-\s]*(\d+)/i)?.[1]?.replace(/^0+/, "");

/** Live telemetry first; falls back to the Mepstra demo register snapshot for the specific devices it covers. */
export function resolveGeneratorTelemetry(generatorTelemetry: GeneratorTelemetry[] | undefined, id: string, name: string) {
  return telemetryFor(generatorTelemetry, id, name) || demoGeneratorTelemetry(id) || undefined;
}
export function resolveAtsTelemetry(atsTelemetry: AtsTelemetry[] | undefined, id: string, name: string) {
  const exact = telemetryFor(atsTelemetry, id, name);
  if (exact) return exact;

  const targetNumber = atsNumber(id) || atsNumber(name);
  const numbered = targetNumber
    ? atsTelemetry?.find((item) => atsNumber(item.equipment_id) === targetNumber || atsNumber(item.equipment_name) === targetNumber)
    : undefined;
  return numbered || demoAtsTelemetry(id) || undefined;
}

const unavailableReading = "00";
const reading = (value: number | undefined, digits = 0) => value === undefined ? unavailableReading : value.toFixed(digits);

type DetailTab = "details" | "notes" | "documents";
type StoredDocument = { name: string; size: number; type: string; addedAt: string; dataUrl: string };

function readStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

function EquipmentRecordTabs({ recordKey, active, onChange, generatedDocument }: { recordKey: string; active: DetailTab; onChange: (tab: DetailTab) => void; generatedDocument?: React.ReactNode }) {
  const notesKey = `cpc:equipment-notes:${recordKey}`;
  const documentsKey = `cpc:equipment-documents:${recordKey}`;
  const [notes, setNotes] = useState<string[]>(() => readStored(notesKey, []));
  const [documents, setDocuments] = useState<StoredDocument[]>(() => readStored(documentsKey, []));
  const [draft, setDraft] = useState("");
  const saveNotes = (next: string[]) => { setNotes(next); localStorage.setItem(notesKey, JSON.stringify(next)); };
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
      {(["details", "notes", "documents"] as DetailTab[]).map((tab) => <button type="button" role="tab" aria-selected={active === tab} className={active === tab ? "active" : ""} onClick={() => onChange(tab)} key={tab}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
    </div>
    {active === "notes" && <div className="equipment-record-pane">
      <div className="equipment-note-compose"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a note about this equipment..." /><button type="button" disabled={!draft.trim()} onClick={() => { saveNotes([...notes, draft.trim()]); setDraft(""); }}>Add Note</button></div>
      {notes.length ? <div className="equipment-note-list">{notes.map((note, index) => <div className="equipment-note" key={`${note}-${index}`}><span>{note}</span><button type="button" aria-label="Remove note" onClick={() => saveNotes(notes.filter((_, i) => i !== index))}>×</button></div>)}</div> : <p className="equipment-record-empty">No notes yet for this equipment.</p>}
    </div>}
    {active === "documents" && <div className="equipment-record-pane">
      <label className="equipment-document-drop">⇧<strong>Choose files to upload</strong><small>Manuals, drawings, photos, and reports</small><input type="file" multiple onChange={(event) => addFiles(event.target.files)} /></label>
      {generatedDocument}
      {documents.length ? <div className="equipment-document-list">{documents.map((document, index) => <div className="equipment-document" key={`${document.name}-${index}`}><div><b>{document.name}</b><small>{Math.max(1, Math.round(document.size / 1024))} KB · added {new Date(document.addedAt).toLocaleDateString()}</small></div><span><a href={document.dataUrl} download={document.name}>↓</a><button type="button" aria-label="Remove document" onClick={() => saveDocuments(documents.filter((_, i) => i !== index))}>×</button></span></div>)}</div> : <p className="equipment-record-empty">No documents uploaded for this equipment.</p>}
    </div>}
  </>;
}

const cleanPanelText = (value: unknown) => String(value ?? "")
  .replace(/(?:â€”|â€“|ï¿½|�)+/g, "—")
  .replace(/\s*—+\s*/g, " — ")
  .trim();

function downloadPanelSchedulePdf(piece: WizardPiece, fedFrom: string, emergency = false) {
  const circuits = (piece.meta?.circuits as WizardCircuit[] | undefined) || [];
  const voltage = String(piece.meta?.voltage || "-");
  const amps = String(piece.meta?.mainAmps || "-").replace(/\s*A?\s*Main$/i, "");
  const used = circuits.filter((circuit) => circuit.load && circuit.load.toLowerCase() !== "spare").length;
  const safe = (value: unknown) => cleanPanelText(value).replace(/[^\x20-\x7E]/g, "-").replace(/([\\()])/g, "\\$1");
  const rows = Array.from({ length: Math.ceil(circuits.length / 2) }, (_, index) => [circuits[index * 2], circuits[index * 2 + 1]]);
  const escapeHtml = (value: unknown) => cleanPanelText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const htmlRows = rows.map(([left, right]) => `<tr><td>${escapeHtml(left?.ckt || "")}</td><td class="${left?.load?.toLowerCase() === "spare" ? "spare" : ""}">${escapeHtml(left?.load || "")}</td><td>${escapeHtml(right?.ckt || "")}</td><td class="${right?.load?.toLowerCase() === "spare" ? "spare" : ""}">${escapeHtml(right?.load || "")}</td></tr>`).join("");
  const htmlDocument = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(piece.name)} — Panel Schedule</title><style>
    *{box-sizing:border-box}body{margin:0;padding:28px;background:#eaf1f7;color:#0b1d31;font-family:Arial,sans-serif}.actions{max-width:1120px;margin:0 auto 14px}.actions button{padding:11px 16px;border:0;border-radius:7px;background:#0b1d31;color:#fff;font-weight:800;cursor:pointer}.sheet{max-width:1120px;margin:auto;overflow:hidden;border-radius:12px;background:#fff;box-shadow:0 12px 35px rgba(14,42,70,.16)}.brand{display:flex;align-items:center;gap:14px;padding:20px 24px;background:linear-gradient(120deg,#071a2d,#0d3557);color:#fff}.logo{display:grid;place-items:center;width:54px;height:43px;border-radius:9px;background:linear-gradient(135deg,#2196f3,#15c777);font-weight:900}.brand-main{display:flex;flex:1;flex-direction:column;gap:3px}.brand-main strong{font-size:18px}.brand-main span{color:#9fc2df;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.brand small{color:#b8d0e5;line-height:1.5;text-align:right;text-transform:uppercase}.title{display:flex;align-items:center;justify-content:space-between;padding:22px 24px 17px;border-bottom:1px solid #d7e3ef;background:linear-gradient(90deg,#f3f9ff,#fff)}.title span{color:#1680ca;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}h1{margin:5px 0 0;font-size:27px}.status{padding:8px 15px;border-radius:999px;background:${emergency ? "#e7373f" : "#16a760"};color:#fff;font-size:10px;letter-spacing:.06em;text-transform:uppercase}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;padding:15px 24px;background:#eef6fd}.meta div{display:flex;flex-direction:column;gap:5px;padding:11px 13px;border:1px solid #d3e3f1;border-radius:8px;background:#fff;color:#607b93;font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.meta b{color:#0b1d31;font-size:14px;text-transform:none}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:11px;border:1px solid #237bb5;background:#1680ca;color:#fff;font-size:10px;letter-spacing:.04em;text-align:left;text-transform:uppercase}td{padding:9px 11px;border:1px solid #d5e0ea}tbody tr:nth-child(even){background:#f4f8fc}th:nth-child(1),th:nth-child(3),td:nth-child(1),td:nth-child(3){width:54px;text-align:center}.spare{color:#77889a;font-style:italic}footer{display:flex;justify-content:space-between;padding:13px 24px;background:#0b1d31;color:#9eb8d5;font-size:10px}footer b{color:#fff}@media print{body{padding:0;background:#fff}.actions{display:none}.sheet{max-width:none;border-radius:0;box-shadow:none}@page{size:landscape;margin:10mm}}@media(max-width:700px){.meta{grid-template-columns:repeat(2,1fr)}.brand>small{display:none}h1{font-size:20px}}
  </style></head><body><div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div><main class="sheet"><header class="brand"><div class="logo">CPC</div><div class="brand-main"><strong>Critical Power Command</strong><span>Emergency Power Management Platform</span></div><small>Equipment Document<br>Generated ${escapeHtml(new Date().toLocaleDateString())}</small></header><section class="title"><div><span>Electrical Distribution</span><h1>${escapeHtml(piece.name)} — Panel Schedule</h1></div><b class="status">${emergency ? "Emergency" : "Normal"}</b></section><section class="meta"><div>Rated Voltage<b>${escapeHtml(voltage)}</b></div><div>Rated Amperage<b>${escapeHtml(amps)}A</b></div><div>Fed From<b>${escapeHtml(fedFrom)}</b></div><div>Circuits Used<b>${used} of ${circuits.length}</b></div></section><table><thead><tr><th>CKT</th><th>Load Description</th><th>CKT</th><th>Load Description</th></tr></thead><tbody>${htmlRows}</tbody></table><footer><span>Auto-generated from the current CPC One-Line equipment record.</span><b>Critical Power Command · Controlled Document</b></footer></main></body></html>`;
  const htmlUrl = URL.createObjectURL(new Blob([htmlDocument], { type: "text/html;charset=utf-8" }));
  const htmlLink = document.createElement("a"); htmlLink.href = htmlUrl; htmlLink.download = `${piece.name}-panel-schedule.html`; htmlLink.click();
  setTimeout(() => URL.revokeObjectURL(htmlUrl), 1000);
  return;
  const commands = [
    "0.8 w", "0.035 0.11 0.2 rg 30 520 782 45 re f", "1 1 1 rg BT /F1 11 Tf 44 548 Td (CPC  |  CRITICAL POWER COMMAND) Tj ET", "0.55 0.75 0.95 rg BT /F1 7 Tf 44 532 Td (EMERGENCY POWER MANAGEMENT PLATFORM) Tj ET",
    "0.05 0.23 0.4 rg 30 467 782 53 re f", "1 1 1 rg BT /F1 20 Tf 44 493 Td", `(${safe(piece.name)} - PANEL SCHEDULE) Tj`, "ET", "0.75 0.88 1 rg BT /F1 8 Tf 44 477 Td", `(Auto-generated equipment record  |  ${safe(new Date().toLocaleDateString())}) Tj ET`,
    emergency ? "0.9 0.15 0.17 rg 680 481 112 22 re f" : "0.08 0.65 0.32 rg 680 481 112 22 re f", "1 1 1 rg BT /F1 8 Tf 702 489 Td", `(${emergency ? "EMERGENCY" : "NORMAL"}) Tj ET`,
    "0.92 0.96 1 rg 30 420 782 39 re f", "0.05 0.12 0.2 rg BT /F1 8 Tf 44 442 Td", `(VOLTAGE  ${safe(voltage)}     AMPERAGE  ${safe(amps)}A     FED FROM  ${safe(fedFrom)}     CIRCUITS USED  ${used} OF ${circuits.length}) Tj ET`,
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
  if (data?.running || data?.status === "RUNNING") return "generator-running-state";
  if (generatorHasAlarm(data) || data?.auto_mode === false) return "generator-warning-state";
  return "ready";
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

function EquipmentFaceplate({ systemName, ats, generator, atsTelemetry, generatorTelemetry, onClose, extraSection, alwaysShowSourceAvailability, fedFromLabel }: { systemName: string; ats?: ATS; generator?: Generator; atsTelemetry?: Partial<AtsTelemetry>; generatorTelemetry?: Partial<GeneratorTelemetry>; onClose: () => void; extraSection?: React.ReactNode; alwaysShowSourceAvailability?: boolean; fedFromLabel?: string }) {
  const [activeTab, setActiveTab] = useState<DetailTab>("details");
  const isAts = Boolean(ats);
  const telemetry = isAts ? atsTelemetry : generatorTelemetry;
  const name = ats?.name || generator?.name || "Equipment";
  const ratedVolts = ats?.rated_volts ?? generator?.rated_volts ?? 415;
  const ratedAmps = ats?.rated_amps ?? generator?.rated_amps ?? undefined;
  const branch = ats?.branch;
  const branchText = branch === "life-safety" ? "Life Safety" : branch === "critical" ? "Critical" : "Equipment";
  const branchTone = branch === "life-safety" ? "amber" : branch === "critical" ? "purple" : "blue";
  const onNormal = atsTelemetry?.connected_source !== "GENERATOR";
  const emergencyConnected = isAts && atsTelemetry?.connected_source === "GENERATOR";

  const bannerText = isAts
    ? (atsTelemetry?.status === "EMERGENCY" ? "EMERGENCY" : atsTelemetry?.status === "FAULT" ? "FAULT" : atsTelemetry?.status === "TRANSFERING" ? "TRANSFERRING" : atsTelemetry?.status === "OFFLINE" ? "OFFLINE" : "READY")
    : (generatorTelemetry?.status === "RUNNING" ? "RUNNING" : generatorTelemetry?.status === "FAULT" ? "FAULT" : generatorTelemetry?.status === "TEST" ? "TEST MODE" : generatorTelemetry?.status === "OFFLINE" ? "OFFLINE" : "READY");
  const bannerTone = bannerText === "EMERGENCY" || bannerText === "FAULT" || bannerText === "RUNNING" ? "emergency" : bannerText === "TRANSFERRING" || bannerText === "TEST MODE" ? "warning" : bannerText === "OFFLINE" ? "offline" : "ready";

  const voltAn = telemetry?.voltage_ab !== undefined ? telemetry.voltage_ab / Math.sqrt(3) : undefined;
  const voltBn = telemetry?.voltage_bc !== undefined ? telemetry.voltage_bc / Math.sqrt(3) : undefined;
  const voltCn = telemetry?.voltage_ca !== undefined ? telemetry.voltage_ca / Math.sqrt(3) : undefined;
  const kva = generatorTelemetry?.apparent_power_kva;
  const kw = generatorTelemetry?.active_power_kw;
  const kvar = kva !== undefined && kw !== undefined ? Math.sqrt(Math.max(0, kva * kva - kw * kw)) : undefined;

  const manufacturer = isAts ? ats?.manufacturer : generator?.make;
  const model = isAts ? ats?.model : generator?.model;
  const serial = ats?.serial_number || generator?.serial_number;
  const metaLine2 = [systemName, "Floor —", "Room —"].join(" | ");

  return <Modal title="" onClose={onClose} className="equipment-detail-modal">
    <button type="button" className="equipment-popup-close" aria-label="Close equipment details" onClick={onClose}>x</button>
    <div className="faceplate-v2" role="dialog" aria-label={`${name} details`}>
      <header className="faceplate-v2-header">
        <div>
          <h3>{name}</h3>
          <p className="faceplate-v2-line2">{metaLine2}</p>
        </div>
        {isAts && <span className={`faceplate-v2-branch-pill ${branchTone}`}>{branchText}</span>}
      </header>

      <div className="faceplate-v2-tag-row">
        {manufacturer && <div className="faceplate-v2-tag">{manufacturer}</div>}
        {model && <div className="faceplate-v2-tag">{model}</div>}
        {serial && <div className="faceplate-v2-tag">{serial}</div>}
        <div className="faceplate-v2-tag">Equipment: {ratedAmps ? `${ratedAmps} A` : "—"} / {ratedVolts} V</div>
      </div>

      <div className={`faceplate-v2-banner ${bannerTone}`}>{bannerText}</div>

      <EquipmentRecordTabs recordKey={`${systemName}:${isAts ? "ats" : "generator"}:${ats?.id || generator?.id || name}`} active={activeTab} onChange={setActiveTab} />

      {activeTab === "details" && <>{isAts ? (
        <>
          <div className="faceplate-v2-section-title">Source Status</div>
          <div className="faceplate-v2-source-grid">
            <div className="faceplate-v2-source-col">
              {alwaysShowSourceAvailability ? (
                <>
                  {/* Both boxes always read "Available" here — the switchgear always has both a utility
                      feed and a generator feed present; only "Connected To" says which one is in use. */}
                  <div className="faceplate-v2-source-box on normal">
                    <span>Normal Source</span>
                    <b>Available</b>
                  </div>
                  <div className="faceplate-v2-source-box on emergency">
                    <span>Emergency Source</span>
                    <b>Available</b>
                  </div>
                </>
              ) : (
                <>
                  <div className={`faceplate-v2-source-box ${onNormal ? "on normal" : "off"}`}>
                    <span>Normal Source</span>
                    <b>{!atsTelemetry?.utility_available ? "Unavailable" : onNormal ? "Available" : "Ready"}</b>
                  </div>
                  <div className={`faceplate-v2-source-box ${!onNormal ? "on emergency" : "off"}`}>
                    <span>Emergency Source</span>
                    <b>{!atsTelemetry?.generator_available ? "Unavailable" : !onNormal ? "Available" : "Ready"}</b>
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
        </>
      ) : (
        <>
          <div className="faceplate-v2-section-title">Engine Data</div>
          <div className="faceplate-v2-engine-grid">
            <div className="faceplate-v2-engine-box"><span>Fuel</span><b>{reading(generatorTelemetry?.fuel_level_percent, 0)}%</b></div>
            <div className="faceplate-v2-engine-box"><span>Hours</span><b>{reading(generatorTelemetry?.engine_hours, 1)}</b></div>
            <div className="faceplate-v2-engine-box"><span>Oil PSI</span><b>{reading(generatorTelemetry?.oil_pressure_psi, 0)}</b></div>
            <div className="faceplate-v2-engine-box"><span>H₂O Temp</span><b>{reading(generatorTelemetry?.coolant_temperature_c, 0)}°</b></div>
            <div className="faceplate-v2-engine-box"><span>Battery</span><b>{reading(generatorTelemetry?.battery_voltage, 1)}</b></div>
          </div>
          <div className="faceplate-v2-progress-track">
            <div className="faceplate-v2-progress-fill fuel" style={{ width: `${Math.max(0, Math.min(100, generatorTelemetry?.fuel_level_percent ?? 0))}%` }}>
              <span>Fuel Level {reading(generatorTelemetry?.fuel_level_percent, 0)}%</span>
            </div>
          </div>
        </>
      )}

      <div className="faceplate-v2-section-title">Electrical Data</div>
      <div className="faceplate-v2-electrical-grid">
        <div className="faceplate-v2-electrical-col">
          <div className="faceplate-v2-col-title">Voltage</div>
          <div className="faceplate-v2-row"><span>VAB</span><b>{reading(telemetry?.voltage_ab, 0)} V</b></div>
          <div className="faceplate-v2-row"><span>VBC</span><b>{reading(telemetry?.voltage_bc, 0)} V</b></div>
          <div className="faceplate-v2-row"><span>VCA</span><b>{reading(telemetry?.voltage_ca, 0)} V</b></div>
          <div className="faceplate-v2-row"><span>VAN</span><b>{reading(voltAn, 0)} V</b></div>
          <div className="faceplate-v2-row"><span>VBN</span><b>{reading(voltBn, 0)} V</b></div>
          <div className="faceplate-v2-row"><span>VCN</span><b>{reading(voltCn, 0)} V</b></div>
        </div>
        <div className="faceplate-v2-electrical-col">
          <div className="faceplate-v2-col-title">Current</div>
          <div className="faceplate-v2-row"><span>Amps A</span><b>{reading(telemetry?.current_a, 0)}</b></div>
          <div className="faceplate-v2-row"><span>Amps B</span><b>{reading(telemetry?.current_b, 0)}</b></div>
          <div className="faceplate-v2-row"><span>Amps C</span><b>{reading(telemetry?.current_c, 0)}</b></div>
          <div className="faceplate-v2-col-title">Frequency</div>
          <div className="faceplate-v2-row"><span>Hz</span><b>{reading(telemetry?.frequency, 0)}</b></div>
        </div>
        <div className="faceplate-v2-electrical-col">
          <div className="faceplate-v2-col-title">Power</div>
          <div className="faceplate-v2-row"><span>kW</span><b>{reading(telemetry?.active_power_kw, 0)}</b></div>
          {!isAts && <>
            <div className="faceplate-v2-row"><span>kVA</span><b>{reading(generatorTelemetry?.apparent_power_kva, 0)}</b></div>
            <div className="faceplate-v2-row"><span>kVAR</span><b>{reading(kvar, 0)}</b></div>
            <div className="faceplate-v2-row"><span>PF</span><b>{reading(generatorTelemetry?.power_factor, 2)}</b></div>
            <div className="faceplate-v2-row"><span>%kW</span><b>{reading(generatorTelemetry?.load_percentage, 0)}%</b></div>
          </>}
        </div>
      </div>

      {!isAts && (
        <div className="faceplate-v2-progress-track">
          <div className="faceplate-v2-progress-fill load" style={{ width: `${Math.max(0, Math.min(100, generatorTelemetry?.load_percentage ?? 0))}%` }}>
            <span>{reading(generatorTelemetry?.active_power_kw, 0)} kW ({reading(generatorTelemetry?.load_percentage, 0)}%)</span>
          </div>
        </div>
      )}

      {isAts && <>
        <div className="faceplate-v2-section-title">Connected Load</div>
        <div className="faceplate-v2-load-box">{branchText}</div>
      </>}

      {extraSection}</>}
    </div>
  </Modal>;
}

function TransformerSymbol({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size * 1.1} viewBox="0 0 22 24" fill="none" aria-hidden="true" className="sld-symbol sld-transformer-symbol">
    <path d="M2 9 a3.2 3.2 0 0 1 6.4 0 a3.2 3.2 0 0 1 6.4 0 a3.2 3.2 0 0 1 6.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M2 15 a3.2 3.2 0 0 0 6.4 0 a3.2 3.2 0 0 0 6.4 0 a3.2 3.2 0 0 0 6.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="11" y1="0" x2="11" y2="6" stroke="currentColor" strokeWidth="1.6" />
    <line x1="11" y1="17.5" x2="11" y2="24" stroke="currentColor" strokeWidth="1.6" />
  </svg>;
}

function BreakerSymbol({ tone = "normal", size = 30, strokeWidthPx = 2, centered = false }: { tone?: "normal" | "emergency" | "tie"; size?: number; strokeWidthPx?: number; centered?: boolean }) {
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
  return <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ overflow: "visible" }} className={`sld-symbol sld-breaker-symbol ${tone}`}>
    <path d={`M${cx} 0.5 A5.5 5.5 0 0 1 ${cx} 11.5`} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
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
              <span className="sld-breaker-with-tag"><BreakerSymbol tone={running ? "emergency" : "normal"} /><div className={`sld-breaker-tag ${tone}`}>52-G{index + 1}</div></span>
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
  { key: "breaker", label: "Breaker", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2 L4 11 H9 L8 18 L16 8 H11 Z" fill="#ef4444" /></svg> },
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
  { key: "fan", label: "Fan", icon: <svg viewBox="0 0 64 64" fill="none"><rect x="10" y="9" width="44" height="44" rx="2" stroke="currentColor" /><circle cx="32" cy="31" r="17" stroke="currentColor" /><circle cx="32" cy="31" r="3" stroke="currentColor" /><path d="M32 28c-5-12 8-13 9-5 .5 5-4 7-9 8m3 0c12-5 13 8 5 9-5 .5-7-4-8-9m0 3c5 12-8 13-9 5-.5-5 4-7 9-8m-3 0c-12 5-13-8-5-9 5-.5 7 4 8 9M14 56h36" stroke="currentColor" strokeLinejoin="round" /><circle cx="15" cy="14" r="1" fill="currentColor" /><circle cx="49" cy="14" r="1" fill="currentColor" /><circle cx="15" cy="48" r="1" fill="currentColor" /><circle cx="49" cy="48" r="1" fill="currentColor" /></svg> },
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

const WIZARD_EQUIPMENT_FORMS: Record<string, WizardFormConfig> = {
  container: {
    kicker: "Container", heading: "Define the container", subtitle: "Switchgear, Main Switchboard, Paralleling Gear, or Distribution Gear.",
    rows: [
      [{ kind: "text", key: "name", label: "Name", placeholder: "e.g. Emergency Switchgear" }],
      [{ kind: "select", key: "containerType", label: "Container Type", options: ["Switchgear", "Main Switchboard", "Paralleling Gear", "Distribution Gear"] }, { kind: "text", key: "voltage", label: "Voltage", placeholder: "480V" }],
      [{ kind: "text", key: "description", label: "Description", placeholder: "Optional" }],
    ],
  },
  breaker: {
    kicker: "Breaker", heading: "Define the breaker", subtitle: "Style is picked visually — match it to the symbol on the paper one-line.",
    rows: [
      [{ kind: "cards", key: "style", label: "Style", options: [
        { value: "fixed-mount", label: "Fixed-Mount", sub: "Bolted in, no withdrawn state", icon: BREAKER_STYLE_ICONS.fixedMount },
        { value: "draw-out", label: "Draw-Out", sub: "Can be racked out", icon: BREAKER_STYLE_ICONS.drawOut },
      ] }],
      [{ kind: "text", key: "name", label: "Name", placeholder: "e.g. GEN-1 Breaker" }],
      [{ kind: "text", key: "frameSize", label: "Frame Size (AF)", placeholder: "800" }, { kind: "text", key: "tripRating", label: "Trip Rating (AT)", placeholder: "700" }],
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
    if (meta.busCount) parts.push(`${meta.busCount} bus${meta.busCount === "1" ? "" : "es"}`);
  } else if (piece.type === "breaker") {
    if (meta.style) parts.push(meta.style === "draw-out" ? "Draw-Out" : "Fixed-Mount");
    if (meta.frameSize) parts.push(`${meta.frameSize} AF`);
    if (meta.tripRating) parts.push(`${meta.tripRating} AT`);
  } else if (piece.type === "transformer") {
    if (meta.primaryVoltage || meta.secondaryVoltage) parts.push(`${meta.primaryVoltage || "?"} / ${meta.secondaryVoltage || "?"}`);
    if (meta.kva) parts.push(`${meta.kva} kVA`);
  } else if (piece.type === "panel") {
    if (meta.voltage) parts.push(String(meta.voltage));
    if (meta.mainAmps) parts.push(`${meta.mainAmps}A Main`);
    const circuits = meta.circuits as WizardCircuit[] | undefined;
    if (circuits?.length) parts.push(`${circuits.length} circuit${circuits.length === 1 ? "" : "s"}`);
  } else if (piece.type === "equipment" && meta.equipmentType) {
    parts.push(String(meta.equipmentType));
  }
  return parts.join(" · ") || "—";
}

type WizardConnectKind = "generator" | "utility" | "ats" | "piece";
// Pass-through equipment must feed something further (a breaker or sub-switchgear can't be a dead end);
// picking one of these auto-continues the chain instead of ending the connection right there.
const WIZARD_PASS_THROUGH_TYPES = ["breaker", "container", "transformer"];

function OneLineWizardTab({
  systemName, ats, generators, pieces, addPiece, removePiece, updatePiece,
  sourceLinks, setSourceLink, removeSourceLink, atsDownstream, setAtsDownstreamLink, removeAtsLink, pieceDownstream, setPieceDownstreamLink, removePieceLink,
  onGenerate, editPieceRequest, onEditRequestHandled,
}: {
  systemName: string; ats: ATS[]; generators: Generator[];
  pieces: WizardPiece[]; addPiece: (piece: WizardPiece) => void; removePiece: (name: string) => void; updatePiece: (oldName: string, piece: WizardPiece) => void;
  sourceLinks: Record<string, string>; setSourceLink: (id: string, destination: string) => void; removeSourceLink: (id: string) => void;
  atsDownstream: Record<string, string>; setAtsDownstreamLink: (id: string, destination: string) => void; removeAtsLink: (id: string) => void;
  pieceDownstream: Record<string, string[]>; setPieceDownstreamLink: (name: string, destination: string) => void; removePieceLink: (name: string, destination: string) => void;
  onGenerate: () => void;
  editPieceRequest?: WizardPiece | null; onEditRequestHandled?: () => void;
}) {
  const [step, setStep] = useState<"start" | "equipment" | "connections">("start");
  const [activeType, setActiveType] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [selectedLoadType, setSelectedLoadType] = useState<string | null>(null);
  const [formCircuits, setFormCircuits] = useState<string[]>([]);
  const [circuitDraft, setCircuitDraft] = useState("");
  const [pendingContainer, setPendingContainer] = useState<{ name: string; meta: Record<string, string> } | null>(null);
  // The piece being edited, if any — set by clicking "Edit" on an existing piece in the review table.
  // Kept separate from activeType/formValues (which the form itself reads/writes either way) purely to
  // know, on submit, whether to update this piece in place or add a new one.
  const [editingPiece, setEditingPiece] = useState<WizardPiece | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ id: string; name: string; kind: WizardConnectKind } | null>(null);
  const [selectedDownstream, setSelectedDownstream] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<
    | { kind: "piece" | "source" | "ats" | "piece-link"; key: string; destination?: string; label: string }
    | { kind: "bulk"; items: { kind: "source" | "ats" | "piece-link"; key: string; destination?: string }[]; label: string }
    | null
  >(null);
  // Checkbox selection across every "Connections Made" table below — a composite string key per row
  // (matching a connKey(...) call at that row) so one Set can track rows from four differently-shaped
  // tables (generator/utility, ATS, and one per piece type) at once.
  const [selectedConnections, setSelectedConnections] = useState<Set<string>>(new Set());
  const connKey = (kind: "source" | "ats" | "piece-link", key: string, destination?: string) => `${kind}:${key}:${destination ?? ""}`;
  const toggleConnection = (key: string) => setSelectedConnections((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Every row currently rendered across the "Connections Made" tables below, in the same shape
  // confirmRemove's "bulk" branch expects — the single source of truth for both "Select All"/"Remove
  // All" (which need the full list) and resolving a checked-off selection back into real remove calls.
  const allConnectionItems: { kind: "source" | "ats" | "piece-link"; key: string; destination?: string; label: string }[] = [
    ...Object.entries(sourceLinks).map(([id, destination]) => {
      const fromLabel = id === "utility" ? "Utility" : generators.find((generator) => generator.id === id)?.name || id;
      return { kind: "source" as const, key: id, label: `${fromLabel} → ${destination === "End" ? "End of line" : destination}` };
    }),
    ...Object.entries(atsDownstream).map(([id, destination]) => {
      const fromLabel = ats.find((item) => item.id === id)?.name || id;
      return { kind: "ats" as const, key: id, label: `${fromLabel} → ${destination === "End" ? "End of line" : destination}` };
    }),
    ...Object.entries(pieceDownstream).flatMap(([name, destinations]) =>
      destinations.map((destination) => ({ kind: "piece-link" as const, key: name, destination, label: `${name} → ${destination === "End" ? "End of line" : destination}` }))
    ),
  ];
  const selectedConnectionItems = allConnectionItems.filter((item) => selectedConnections.has(connKey(item.kind, item.key, item.destination)));
  const allConnectionsSelected = allConnectionItems.length > 0 && selectedConnections.size === allConnectionItems.length;
  const toggleSelectAllConnections = () => setSelectedConnections(allConnectionsSelected ? new Set() : new Set(allConnectionItems.map((item) => connKey(item.kind, item.key, item.destination))));

  const confirmRemove = () => {
    if (!removeConfirm) return;
    if (removeConfirm.kind === "bulk") {
      removeConfirm.items.forEach((item) => {
        if (item.kind === "source") removeSourceLink(item.key);
        else if (item.kind === "ats") removeAtsLink(item.key);
        else if (item.destination) removePieceLink(item.key, item.destination);
      });
      setSelectedConnections(new Set());
      setRemoveConfirm(null);
      return;
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
    setConnectingFrom(target);
  };

  const confirmDownstream = () => {
    if (!connectingFrom || !selectedDownstream) return;
    if (connectingFrom.kind === "generator" || connectingFrom.kind === "utility") {
      setSourceLink(connectingFrom.id, selectedDownstream);
    } else if (connectingFrom.kind === "ats") {
      setAtsDownstreamLink(connectingFrom.id, selectedDownstream);
    } else {
      setPieceDownstreamLink(connectingFrom.name, selectedDownstream);
    }
    if (selectedDownstream !== "End") {
      const picked = pieces.find((piece) => piece.name === selectedDownstream);
      if (picked && WIZARD_PASS_THROUGH_TYPES.includes(picked.type)) {
        // Breakers, sub-switchgear and transformers are pass-through — immediately ask what they feed next,
        // so a chain like Generator/ATS → Breaker → Container → Transformer → Panel can go as deep as it
        // needs to, same as picking a breaker for an ATS or another piece already does.
        setConnectingFrom({ id: `piece:${picked.name}`, name: picked.name, kind: "piece" });
        setSelectedDownstream(null);
        return;
      }
    }
    setConnectingFrom(null);
    setSelectedDownstream(null);
  };

  const downstreamOptions = !connectingFrom ? [] :
    connectingFrom.kind === "generator" || connectingFrom.kind === "utility"
      // A generator/utility can feed an ATS directly, or a breaker/container/transformer first (see the
      // pass-through chain above) — same equipment list a piece or ATS gets, plus the ATS units.
      ? [
          ...ats.map((item) => ({ key: item.id, name: item.name, sub: "ATS" })),
          ...pieces.filter((piece) => piece.name !== connectingFrom.name).map((piece) => ({ key: piece.name, name: piece.name, sub: piece.type })),
        ]
      // A container/breaker/transformer piece can terminate straight at an ATS too (e.g. GEN SWBD's own
      // feeders reaching ATS-1) — not just another piece — so it isn't stuck only ever chaining to more
      // equipment with no way to actually reach a real transfer switch.
      : [
          ...ats.filter((item) => !(pieceDownstream[connectingFrom.name] || []).includes(item.name)).map((item) => ({ key: item.id, name: item.name, sub: "ATS" })),
          ...pieces
              .filter((piece) => piece.name !== connectingFrom.name && !(pieceDownstream[connectingFrom.name] || []).includes(piece.name))
              .map((piece) => ({ key: piece.name, name: piece.name, sub: piece.type })),
        ];

  const openEquipmentForm = (key: string) => {
    setEditingPiece(null);
    setFormValues({});
    setFormCircuits([]);
    setCircuitDraft("");
    setSelectedLoadType(null);
    setActiveType(key);
  };

  // Pre-fills the form from an existing piece's own fields (meta values are already the same strings
  // the form itself writes) and opens it in edit mode — submitting updates this piece in place instead
  // of adding a new one.
  const openEditForm = (piece: WizardPiece) => {
    setEditingPiece(piece);
    const stringFields = Object.fromEntries(
      Object.entries(piece.meta || {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
    setFormValues({ name: piece.name, ...stringFields });
    setFormCircuits(piece.type === "panel" ? ((piece.meta?.circuits as WizardCircuit[] | undefined) || []).map((circuit) => cleanPanelText(circuit.load)) : []);
    setCircuitDraft("");
    setPendingContainer(null);
    setSelectedLoadType(piece.type === "equipment" ? String(piece.meta?.equipmentTypeKey || "general") : null);
    setActiveType(piece.type);
    setStep("equipment");
  };

  useEffect(() => {
    if (!editPieceRequest) return;
    openEditForm(editPieceRequest);
    onEditRequestHandled?.();
    // The request object is consumed once when the wizard opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPieceRequest]);

  const setField = (key: string, value: string) => setFormValues((current) => ({ ...current, [key]: value }));
  const addCircuit = () => {
    if (!circuitDraft.trim()) return;
    setFormCircuits((current) => [...current, circuitDraft.trim()]);
    setCircuitDraft("");
  };
  const removeCircuit = (index: number) => setFormCircuits((current) => current.filter((_, i) => i !== index));
  const updateCircuit = (index: number, load: string) => setFormCircuits((current) => current.map((existing, i) => (i === index ? load : existing)));

  // Two pieces sharing a name silently corrupts the whole wizard downstream — every pieceDownstream/
  // sourceLinks/atsDownstream lookup finds only the FIRST match by name, so the second one becomes an
  // unreachable duplicate that still renders (the Equipment grid just lists every piece, not deduplicated
  // by name), showing up twice with no way to individually pick either. Nothing previously stopped the
  // form from creating one.
  const nameTaken = (name: string) => pieces.some((piece) => piece.name === name && piece.name !== editingPiece?.name);

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
    if (!activeType || !formValues.name?.trim()) return;
    if (nameTaken(formValues.name.trim())) return;
    if (activeType === "container") {
      setPendingContainer({ name: formValues.name.trim(), meta: { containerType: formValues.containerType || "", voltage: formValues.voltage || "" } });
      return;
    }
    const meta: Record<string, string | WizardCircuit[]> = {};
    if (activeType === "breaker") { meta.style = formValues.style || ""; meta.frameSize = formValues.frameSize || ""; meta.tripRating = formValues.tripRating || ""; }
    if (activeType === "transformer") { meta.primaryVoltage = formValues.primaryVoltage || ""; meta.secondaryVoltage = formValues.secondaryVoltage || ""; meta.kva = formValues.kva || ""; }
    if (activeType === "panel") { meta.voltage = formValues.voltage || ""; meta.mainAmps = formValues.mainAmps || ""; meta.circuits = formCircuits.map((load, i) => ({ ckt: i + 1, load: cleanPanelText(load) })); }
    if (editingPiece) updatePiece(editingPiece.name, { type: activeType, name: formValues.name.trim(), meta });
    else addPiece({ type: activeType, name: formValues.name.trim(), meta });
    setEditingPiece(null);
    setActiveType(null);
  };

  const chooseBusCount = (busCount: string) => {
    if (!pendingContainer) return;
    const piece: WizardPiece = { type: "container", name: pendingContainer.name, meta: { ...pendingContainer.meta, busCount } };
    if (editingPiece) updatePiece(editingPiece.name, piece);
    else addPiece(piece);
    setEditingPiece(null);
    setPendingContainer(null);
    setActiveType(null);
  };

  // At least one real connection made (a source, an ATS's feed, or a piece's feed) before the Result
  // tab is allowed to generate anything — otherwise clicking this straight from Phase 1 would "finish"
  // a diagram that's really still just a pile of unconnected equipment.
  const hasAnyConnection = Object.keys(sourceLinks).length > 0 || Object.keys(atsDownstream).length > 0 || Object.keys(pieceDownstream).length > 0;
  const headerBar = (
    <div className="wizard-header-bar">
      <span className="wizard-brand">CPC</span>
      <span className="wizard-header-label">One-Line Wizard</span>
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
            <div className="wizard-breadcrumb">
              <span className={step === "equipment" ? "active" : "done"} onClick={() => { setActiveType(null); setEditingPiece(null); setStep("equipment"); }} role="button" tabIndex={0}>1 · Create Equipment</span>
              <span className="wizard-breadcrumb-sep">→</span>
              <span className={step === "connections" ? "active" : ""}>2 · Connections</span>
            </div>
            {step === "equipment" && pendingContainer ? (
              <>
                <div className="wizard-kicker">{pendingContainer.name}</div>
                <h2>How many buses?</h2>
                <p>Most containers have one common bus. Multiples (rare) get a tie breaker between them.</p>
                <div className="wizard-equipment-grid wizard-bus-grid">
                  <button type="button" className="wizard-equipment-card wizard-bus-card" onClick={() => chooseBusCount("1")}><b>1</b><small>Most common</small></button>
                  <button type="button" className="wizard-equipment-card wizard-bus-card" onClick={() => chooseBusCount("2")}><b>2</b><small>Bus A / Bus B</small></button>
                  <button type="button" className="wizard-equipment-card wizard-bus-card" onClick={() => chooseBusCount("3")}><b>3</b><small>Rare</small></button>
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
            ) : step === "equipment" && activeForm ? (
              <form onSubmit={submitEquipmentForm}>
                <div className="wizard-kicker">{editingPiece ? `Editing ${editingPiece.name}` : activeForm.kicker}</div>
                <h2>{editingPiece ? `Edit ${activeForm.kicker.toLowerCase()}` : activeForm.heading}</h2>
                {activeForm.subtitle && <p>{activeForm.subtitle}</p>}
                {activeForm.rows.map((row, rowIndex) => (
                  <div className={row.length > 1 ? "wizard-form-grid-2" : undefined} key={rowIndex}>
                    {row.map((field) => (
                      <div className="wizard-form-row" key={field.key}>
                        <label>{field.label}</label>
                        {field.kind === "text" && (
                          <input required={field.key === "name"} value={formValues[field.key] || ""} onChange={(event) => setField(field.key, event.target.value)} placeholder={field.placeholder} autoFocus={field.key === "name"} />
                        )}
                        {field.key === "name" && nameTaken(formValues.name?.trim() || "") && (
                          <p className="wizard-form-error">A piece named "{formValues.name?.trim()}" already exists — pick a different name.</p>
                        )}
                        {field.kind === "select" && (
                          <select value={formValues[field.key] || field.options[0]} onChange={(event) => setField(field.key, event.target.value)}>
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
                            <div className="wizard-circuit-list">
                              {formCircuits.map((load, index) => (
                                <div className="wizard-circuit-row" key={index}>
                                  <span className="wizard-circuit-ckt">{index + 1}</span>
                                  {/* Editable in place — updating a "Spare" circuit to its real load
                                      shouldn't mean removing and re-adding it. */}
                                  <input className="wizard-circuit-load-input" value={load} onChange={(event) => updateCircuit(index, event.target.value)} aria-label={`Circuit ${index + 1} load`} />
                                  <button type="button" className="wizard-circuit-remove" onClick={() => removeCircuit(index)} aria-label={`Remove circuit ${index + 1}`}>×</button>
                                </div>
                              ))}
                              {!formCircuits.length && <p className="wizard-circuit-empty">No circuits added yet.</p>}
                            </div>
                            <div className="wizard-circuit-add">
                              <input value={circuitDraft} onChange={(event) => setCircuitDraft(event.target.value)} placeholder="e.g. Exit/Egress Lighting — Zone 1" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCircuit(); } }} />
                              <button type="button" className="header-btn" onClick={addCircuit}>Add Circuit</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="wizard-form-actions">
                  <button type="button" className="header-btn" onClick={() => { setActiveType(null); setEditingPiece(null); }}>Back</button>
                  <button type="submit" className="header-btn primary" disabled={nameTaken(formValues.name?.trim() || "")}>{editingPiece ? "Save Changes" : "Continue"}</button>
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
                {pieces.length > 0 && (
                  <div className="wizard-review-table-wrap">
                    <div className="wizard-connections-section-title">Created Equipment ({pieces.length})</div>
                    {/* Grouped by type (Container, Breaker, Transformer, Panel, Equipment, Area Served),
                        in the same order as the Create Equipment cards above, instead of one long table
                        mixing every type together — each group gets its own heading and stays that
                        piece's own table, so the Type column (now redundant with the heading) is gone. */}
                    {WIZARD_EQUIPMENT_TYPES.map((typeInfo) => {
                      const group = pieces.filter((piece) => piece.type === typeInfo.key);
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
                <div className="wizard-connections-section-title">Available Equipment ({downstreamOptions.length})</div>
                {/* Same by-category grouping as the Equipment grid on the main Connections screen — ATS
                    first, then each piece type — instead of one flat grid mixing everything, which got
                    hard to scan once a container/breaker had this many valid targets to pick from. */}
                {[{ key: "ATS", label: "ATS" }, ...WIZARD_EQUIPMENT_TYPES].map((group) => {
                  const groupOptions = downstreamOptions.filter((option) => option.sub === group.key);
                  if (!groupOptions.length) return null;
                  return (
                    <div className="wizard-connections-piece-group" key={group.key}>
                      <div className="wizard-connections-piece-group-title">{group.label} ({groupOptions.length})</div>
                      <div className="wizard-equipment-grid wizard-connections-grid">
                        {groupOptions.map((option) => (
                          <button type="button" key={option.key} className={`wizard-connection-card${selectedDownstream === option.name ? " selected" : ""}`} onClick={() => setSelectedDownstream(option.name)}>
                            <span className="wizard-connection-badge ats"><IconATS size={13} /></span>
                            <span className="wizard-connection-text"><b>{option.name}</b><small>{option.sub}</small></span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!downstreamOptions.length && <p className="operations-empty">No ATS units or equipment pieces created yet — add one in Create Equipment first.</p>}
                <button type="button" className={`wizard-end-here${selectedDownstream === "End" ? " selected" : ""}`} onClick={() => setSelectedDownstream("End")}>End — stop here</button>
                <div className="wizard-form-actions">
                  <button type="button" className="header-btn" onClick={() => { setConnectingFrom(null); setSelectedDownstream(null); }}>Back</button>
                  <button type="button" className="header-btn primary" disabled={!selectedDownstream} onClick={confirmDownstream}>Confirm Connection</button>
                </div>
              </>
            ) : (
              <>
                <div className="wizard-kicker">Connections</div>
                <h2>Pick something to connect or review</h2>
                <p>Items with a ✓ are already wired — click to review or change them.</p>
                <div className="wizard-connections-section-title">Sources ({generators.length + 1})</div>
                <div className="wizard-equipment-grid wizard-connections-grid">
                  {generators.map((generator) => (
                    <button type="button" key={generator.id} className="wizard-connection-card" onClick={() => startConnecting({ id: generator.id, name: generator.name, kind: "generator" })}>
                      <span className="wizard-connection-badge generator"><IconGenerator size={13} /></span>
                      <span className="wizard-connection-text"><b>{generator.name}</b><small>{sourceLinks[generator.id] ? `✓ Connected to ${sourceLinks[generator.id]}` : "Needs connection"}</small></span>
                    </button>
                  ))}
                  <button type="button" className="wizard-connection-card" onClick={() => startConnecting({ id: "utility", name: "Utility", kind: "utility" })}>
                    <span className="wizard-connection-badge utility"><IconBolt size={13} /></span>
                    <span className="wizard-connection-text"><b>Utility</b><small>{sourceLinks.utility ? `✓ Connected to ${sourceLinks.utility}` : "Needs connection"}</small></span>
                  </button>
                </div>
                <div className="wizard-connections-section-title">ATS ({ats.length})</div>
                <div className="wizard-equipment-grid wizard-connections-grid">
                  {ats.map((item) => (
                    <button type="button" key={item.id} className="wizard-connection-card" onClick={() => startConnecting({ id: item.id, name: item.name, kind: "ats" })}>
                      <span className="wizard-connection-badge ats"><IconATS size={13} /></span>
                      <span className="wizard-connection-text"><b>{item.name}</b><small>{atsDownstream[item.id] ? `✓ Connected to ${atsDownstream[item.id]}` : "Needs connection"}</small></span>
                    </button>
                  ))}
                  {!ats.length && <p className="operations-empty">No ATS units registered for this system.</p>}
                </div>
                <div className="wizard-connections-section-title">Equipment ({pieces.length})</div>
                <p className="wizard-connections-hint">Click a piece to add a downstream feed — click it again to add another (e.g. wire 7 feeders off one switchgear box).</p>
                {/* Grouped by type (Container, Breaker, Transformer, Panel, Equipment, Area Served), same
                    order and headings as Create Equipment's own review table — a flat list mixing every
                    piece together got hard to scan once there were more than a handful. */}
                {WIZARD_EQUIPMENT_TYPES.map((typeInfo) => {
                  const group = pieces.filter((piece) => piece.type === typeInfo.key);
                  if (!group.length) return null;
                  return (
                    <div className="wizard-connections-piece-group" key={typeInfo.key}>
                      <div className="wizard-connections-piece-group-title">{typeInfo.label} ({group.length})</div>
                      <div className="wizard-equipment-grid wizard-connections-grid">
                        {group.map((piece) => {
                          const linked = pieceDownstream[piece.name] || [];
                          return (
                            <button type="button" key={piece.name} className="wizard-connection-card" onClick={() => startConnecting({ id: `piece:${piece.name}`, name: piece.name, kind: "piece" })}>
                              <span className="wizard-connection-badge ats"><IconATS size={13} /></span>
                              <span className="wizard-connection-text"><b>{piece.name}</b><small>{linked.length ? `✓ Feeds ${linked.length} target${linked.length === 1 ? "" : "s"}` : "Add a downstream feed"}</small></span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {!pieces.length && <p className="operations-empty">No equipment created yet — add pieces in Create Equipment first.</p>}
                {(Object.keys(sourceLinks).length > 0 || Object.keys(atsDownstream).length > 0 || Object.keys(pieceDownstream).length > 0) && (
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
                <div className="wizard-equipment-footer">
                  <button type="button" className="header-btn" onClick={() => setStep("equipment")}>Switch to Create Equipment</button>
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
                <div className="wizard-chain-arrow">↓</div>
                {selectedDownstream ? (
                  <div className="wizard-chain-node">
                    <span className={`wizard-connection-badge ${selectedDownstream === "End" ? "utility" : "ats"}`}>{selectedDownstream === "End" ? <IconCheckCircle size={13} /> : <IconATS size={13} />}</span>
                    <b>{selectedDownstream === "End" ? "End of line" : selectedDownstream}</b>
                    <small>{selectedDownstream === "End" ? "Stops here" : pieces.find((piece) => piece.name === selectedDownstream)?.type || "ATS"}</small>
                  </div>
                ) : (
                  <div className="wizard-chain-node placeholder">
                    <span>?</span>
                    <small>Not set yet</small>
                  </div>
                )}
              </div>
            ) : (
              <p>{step === "equipment" ? "Phase 1 has no connections yet — this fills in once you start wiring things in Phase 2." : "Pick something to connect — its upstream and downstream will show here as you build the connection."}</p>
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
          <p>Building the emergency distribution one-line for {systemName}.</p>
          <div className="wizard-options">
            <button type="button" className="wizard-option" onClick={beginNew}>
              <b>New One-Line</b>
              <span>Start from a blank canvas</span>
            </button>
            <button type="button" className={`wizard-option${pieces.length ? "" : " disabled"}`} disabled={!pieces.length} onClick={beginNew} title={pieces.length ? undefined : "No one-line exists yet"}>
              <b>Edit Existing</b>
              <span>{pieces.length ? `${pieces.length} piece${pieces.length === 1 ? "" : "s"} already built` : "No one-line exists yet"}</span>
            </button>
          </div>
          <button type="button" className="wizard-test-link">Start with test equipment already created →</button>
        </div>
        <div className="wizard-side-card">
          <div className="wizard-kicker">Where you are</div>
          <p>{pieces.length ? `${pieces.length} piece${pieces.length === 1 ? "" : "s"} built so far.` : "Nothing built yet."}</p>
        </div>
      </div>
    </section>
  );
}

function ResultAtsModal({ ats, data, downstream, feederLabel, onClose, onViewBranch }: { ats: ATS; data?: Partial<AtsTelemetry>; downstream?: string; feederLabel: string; onClose: () => void; onViewBranch: () => void }) {
  const emergency = data?.connected_source === "GENERATOR";
  const meta = [ats.manufacturer, ats.model, ats.rated_amps ? `${ats.rated_amps}A` : null, ats.rated_volts ? `${ats.rated_volts} VAC` : null].filter(Boolean).join(" | ");
  return (
    <Modal title="" onClose={onClose} className="wizard-result-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close" onClick={onClose}>x</button>
      <div className="wizard-result-modal-body">
        <h3>{ats.name}</h3>
        {meta && <p className="wizard-result-modal-meta">{meta}</p>}
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
          <p className="operations-empty">Not wired yet — set this in the Wizard&apos;s Connections step.</p>
        )}
      </div>
    </Modal>
  );
}

type WizardTreeNode = { name: string; type: string; children: WizardTreeNode[] };

/** Walks the piece-to-piece downstream links starting from `startName` as a tree — a piece can now
 * feed multiple downstream targets (e.g. one switchgear box feeding 7 feeders), so this recurses
 * into every branch rather than following a single chain. A `seen` set guards against cycles. */
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

/** The wire between an ATS/piece and one thing it feeds — a breaker at each end of a length of feeder
 * cable by default, matching the wire+breaker language the main Result diagram uses for generators.
 * A shared bus (see WizardBranchChildren) only needs one breaker per leg instead of two. Tone follows
 * the ATS's real normal/emergency state for the whole branch. */
function WizardBranchConnector({ tone, breakers = 1, fromName, toName }: { tone: "emergency" | "normal"; breakers?: 0 | 1 | 2; fromName: string; toName: string }) {
  const lineClass = tone === "emergency" ? "emergency-source" : "";
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
        <BreakerSymbol tone={tone} size={32} strokeWidthPx={3} centered />
      </BreakerHitButton>
      <span className={`sld-gear-connector ${lineClass}`} aria-hidden="true" />
      {breakers === 2 && (
        <>
          <BreakerHitButton detail={makeDetail("2")}>
            <BreakerSymbol tone={tone} size={32} strokeWidthPx={3} centered />
          </BreakerHitButton>
          <span className={`sld-gear-connector ${lineClass}`} aria-hidden="true" />
        </>
      )}
    </div>
  );
}

/** Renders what a node feeds. A decorative breaker (not tied to any real piece) only ever appears on
 * the ATS's own root connection (isRoot — matching the original "ATS has its own output breaker even
 * if you didn't model one" request) — every deeper hop is a plain wire by default, since a breaker
 * belongs here only if the user actually created one as a piece (it then draws its own glyph instead,
 * see WizardTreeNodeView, and this connector steps aside for it below). Multiple targets share a
 * horizontal bus instead of separate wires — matching how a real switchgear box feeds many breakers
 * off one bar. */
function WizardBranchChildren({ nodes, pieces, onViewSchedule, tone, parentLabel, isRoot = false }: { nodes: WizardTreeNode[]; pieces: WizardPiece[]; onViewSchedule: (piece: WizardPiece, tone: "emergency" | "normal", fedFrom: string) => void; tone: "emergency" | "normal"; parentLabel: string; isRoot?: boolean }) {
  if (!nodes.length) return null;
  const defaultBreakers = isRoot ? 1 : 0;
  if (nodes.length === 1) {
    return (
      <div className="wizard-branch-tree-branch">
        <WizardBranchConnector tone={tone} breakers={nodes[0].type === "breaker" ? 0 : defaultBreakers} fromName={parentLabel} toName={nodes[0].name} />
        <WizardTreeNodeView node={nodes[0]} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={parentLabel} />
      </div>
    );
  }
  const lineClass = tone === "emergency" ? "emergency-source" : "";
  return (
    <div className="wizard-branch-bus-group">
      <WizardBranchConnector tone={tone} breakers={defaultBreakers} fromName={parentLabel} toName="Bus" />
      <div className={`wizard-branch-bus ${lineClass}`} aria-hidden="true" />
      <div className="wizard-branch-tree-children">
        {nodes.map((node, index) => (
          <div className="wizard-branch-tree-branch" key={index}>
            <WizardBranchConnector tone={tone} breakers={node.type === "breaker" ? 0 : defaultBreakers} fromName="Bus" toName={node.name} />
            <WizardTreeNodeView node={node} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={parentLabel} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A feeder's own downstream, rendered below the distribution-gear box — a plain wire straight to the
 * load with no breaker, since the feeder breaker itself already sits inside the box above it. */
function WizardDistGearLoad({ nodes, pieces, onViewSchedule, tone, parentLabel }: { nodes: WizardTreeNode[]; pieces: WizardPiece[]; onViewSchedule: (piece: WizardPiece, tone: "emergency" | "normal", fedFrom: string) => void; tone: "emergency" | "normal"; parentLabel: string }) {
  if (!nodes.length) return <p className="wizard-dist-gear-empty">Not wired</p>;
  const lineClass = tone === "emergency" ? "emergency-source" : "";
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

/** An unused feeder position — a crossed-out red box instead of a breaker glyph, matching the standard
 * "spare, not populated" convention on a real panel schedule/switchgear elevation. */
function SpareBreakerGlyph({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="16" height="16" rx="2" stroke="#ef4444" strokeWidth="2" />
      <line x1="5" y1="5" x2="15" y2="15" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="5" x2="5" y2="15" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Finds a Distribution Gear container (see WizardDistGearNode) nested anywhere below this node — a
 * feeder that fans back out into another full gear box (e.g. F3 -> 52 CHILL-2 -> CHILLER DIST 2) needs
 * its column widened to fit that box (see colWidthForFeeder below) instead of the fixed 200px every
 * ordinary feeder gets. */
function findNestedDistGear(node: WizardTreeNode, pieces: WizardPiece[]): WizardTreeNode | null {
  const piece = pieces.find((item) => item.name === node.name);
  if (node.type === "container" && piece?.meta?.containerType === "Distribution Gear" && node.children.length > 0) return node;
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
function WizardDistGearNode({ node, pieces, onViewSchedule, tone, parentLabel }: { node: WizardTreeNode; pieces: WizardPiece[]; onViewSchedule: (piece: WizardPiece, tone: "emergency" | "normal", fedFrom: string) => void; tone: "emergency" | "normal"; parentLabel: string }) {
  const { selectedContainerName, openContainer } = useOneLineInspector();
  const lineClass = tone === "emergency" ? "emergency-source" : "";
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
      <div className="wizard-dist-gear-box">
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
            const feederKey = `distfeeder-${node.name}-${feeder.name}`;
            const feederPiece = isBreaker ? pieces.find((item) => item.name === feeder.name) : undefined;
            const feederDetail: BreakerDetailData = {
              key: feederKey, name: feeder.name, role: "Feeder",
              style: feederPiece?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount", derived: !feederPiece,
              position: "Closed", emergency: tone === "emergency", poweredBy: node.name,
              feeds: feeder.children.length ? feeder.children.map((child) => child.name).join(", ") : "Not wired",
            };
            return (
              <div className="wizard-dist-gear-col" style={colWidth[index] ? { width: colWidth[index] } : undefined} key={index}>
                {isBreaker ? (
                  <>
                    <span className={`sld-gear-connector ${lineClass}`} aria-hidden="true" />
                    <span className="sld-breaker-with-tag">
                      {isSpare ? (
                        <SpareBreakerGlyph size={32} />
                      ) : (
                        <BreakerHitButton detail={feederDetail}>
                          <BreakerSymbol tone={tone} size={38} strokeWidthPx={3} centered />
                        </BreakerHitButton>
                      )}
                      <div className={`sld-breaker-tag ${lineClass}`}>{feeder.name}</div>
                    </span>
                    {/* Real wire on both sides of the box's bottom border (see .wizard-dist-gear-tail-out
                        below, just outside the box) — the border needs to cross the middle of a
                        continuous wire, not sit right at the breaker's own bottom edge. */}
                    <span className={`wizard-dist-gear-tail-in ${lineClass}`} aria-hidden="true" />
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
            {feeder.type === "breaker" ? (
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
function WizardTreeNodeView({ node, pieces, onViewSchedule, tone, parentLabel }: { node: WizardTreeNode; pieces: WizardPiece[]; onViewSchedule: (piece: WizardPiece, tone: "emergency" | "normal", fedFrom: string) => void; tone: "emergency" | "normal"; parentLabel: string }) {
  const { selectedContainerName, openContainer } = useOneLineInspector();
  const piece = pieces.find((item) => item.name === node.name);
  const circuits = piece?.type === "panel" ? (piece.meta?.circuits as WizardCircuit[] | undefined) : undefined;
  const clickable = Boolean(piece);
  const equipmentImage = equipmentImageIcon(piece, node.name);
  const loadIcon = equipmentImage
    ? <img className="wizard-load-box-equipment-image" src={equipmentImage} alt="" />
    : WIZARD_LOAD_BOX_ICONS[node.type];

  // A container explicitly built as a "Distribution Gear" (as opposed to a Motor Control Center,
  // Switchgear, etc.) always gets the full dashed-box-plus-bus treatment (see WizardDistGearNode),
  // regardless of how many feeders it currently has wired — a distribution gear is a bus with feeders
  // by definition, not something that only looks like one once it happens to have more than one. This
  // is a different, narrower rule than the one this component used to use (any container with more
  // than one child), which mis-fired on wide multi-output devices like an MCC that aren't actually
  // switchgear and don't need the full box.
  if (node.type === "container" && piece?.meta?.containerType === "Distribution Gear" && node.children.length > 0) {
    return <WizardDistGearNode node={node} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={parentLabel} />;
  }

  // Any other container (Switchgear, Main Switchboard, Paralleling Gear, or a Distribution Gear with
  // nothing wired yet) — clickable like every other container in the one-line, opening the same details
  // popup as "GEN SWBD" or a nested distribution-gear box, just without the wide dashed-bus treatment.
  if (node.type === "container") {
    return (
      <div className="wizard-branch-tree-node">
        <button
          type="button"
          className={`wizard-chain-node wizard-chain-node-clickable${selectedContainerName === node.name ? " selected" : ""}`}
          onClick={() => piece && openContainer({ piece, feeds: node.children.map((child) => child.name), feedsLabel: "Feeders", poweredBy: parentLabel })}
        >
          <b>{node.name}</b>
          <small>{node.type}</small>
        </button>
        {node.children.length > 0 && <WizardBranchChildren nodes={node.children} pieces={pieces} onViewSchedule={onViewSchedule} tone={tone} parentLabel={node.name} />}
      </div>
    );
  }

  // A transformer draws as the bare two-circle symbol itself — no bordered box around it, matching
  // the reference — with the name below it, same as every other node here.
  if (node.type === "transformer") {
    return (
      <div className="wizard-branch-tree-node">
        <div className="wizard-symbol-node">
          <svg width="75" height="75" viewBox="0 0 20 20" fill="none" className="wizard-symbol-icon" aria-hidden="true">
            <circle cx="7.5" cy="10" r="5" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12.5" cy="10" r="5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <b className="wizard-symbol-label">{node.name}</b>
        </div>
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
    const breakerLineClass = tone === "emergency" ? "emergency-source" : "";
    const breakerKey = `piece-breaker-${node.name}`;
    const breakerDetail: BreakerDetailData = {
      key: breakerKey, name: node.name, style: piece?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount", derived: !piece,
      position: "Closed", emergency: tone === "emergency", poweredBy: parentLabel,
      feeds: node.children.length ? node.children.map((child) => child.name).join(", ") : undefined,
    };
    return (
      <div className="wizard-branch-tree-node">
        {/* Name to the side, not below — matching FDR-1 and every other breaker tag in this view,
            via the same .sld-breaker-with-tag/.sld-breaker-tag pairing they use. */}
        <span className="sld-breaker-with-tag">
          <BreakerHitButton detail={breakerDetail}>
            {piece?.meta?.style === "draw-out" ? (
              <DrawoutBreakerGlyph tone={tone} />
            ) : (
              <BreakerSymbol tone={tone} size={40} strokeWidthPx={3} centered />
            )}
          </BreakerHitButton>
          <div className={`sld-breaker-tag ${breakerLineClass}`}>{node.name}</div>
        </span>
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
  area: "area load",
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
  systemName, ats, atsTelemetry, feederLabel, pieces, atsDownstream, pieceDownstream, onClose, onViewSchedule,
}: { systemName: string; ats: ATS; atsTelemetry?: Partial<AtsTelemetry>; feederLabel: string; pieces: WizardPiece[]; atsDownstream: Record<string, string>; pieceDownstream: Record<string, string[]>; onClose: () => void; onViewSchedule: (piece: WizardPiece, tone: "emergency" | "normal", fedFrom: string) => void }) {
  const tree = resolveWizardTree(atsDownstream[ats.id], pieces, pieceDownstream);
  const emergency = atsTelemetry?.connected_source === "GENERATOR";
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
    ? "Not wired yet"
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
          <h3>{title}</h3>
          <p className="wizard-result-modal-meta">Fed from {feederLabel} on GEN SWBD · {branchSummary}</p>
        </div>
        <div className="wizard-branch-diagram" ref={containerRef}>
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
              <div className={`sld-ats ${emergency ? "on-emergency" : "on-normal"}`}>
                <b>{ats.name}</b>
                <button
                  type="button"
                  className="sld-switch"
                  aria-label={`Open ${ats.name}: ${emergency ? "connected to emergency" : "connected to normal"}`}
                  onClick={() => setShowFaceplate(true)}
                >
                  <span className={`sld-terminal normal-terminal ${!emergency ? "active" : ""}`}>N</span>
                  <span className={`sld-terminal emergency-terminal ${emergency ? "active" : ""}`}>E</span>
                  <i className="sld-arm" />
                  <span className="sld-terminal load-terminal" aria-hidden="true" />
                </button>
              </div>
            </div>
            {tree.length > 0 && (
              <div className="wizard-branch-tree-root">
                {tree.length === 1 && tree[0].type === "container" && tree[0].children.length > 1 ? (
                  // Feeding straight into a distribution-gear box: just the plain feed cable, no breaker —
                  // protection lives on the individual feeders inside the box, not on this lead-in.
                  <div className="wizard-branch-tree-branch">
                    <span className={`sld-gear-connector ${emergency ? "emergency-source" : ""}`} aria-hidden="true" />
                    <WizardDistGearNode node={tree[0]} pieces={pieces} onViewSchedule={onViewSchedule} tone={emergency ? "emergency" : "normal"} parentLabel={ats.name} />
                  </div>
                ) : (
                  <WizardBranchChildren nodes={tree} pieces={pieces} onViewSchedule={onViewSchedule} tone={emergency ? "emergency" : "normal"} parentLabel={ats.name} isRoot />
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
        fedFromLabel={feederLabel}
        alwaysShowSourceAvailability
        onClose={() => setShowFaceplate(false)}
      />
    )}
    </>
  );
}

function ResultPanelScheduleModal({ piece, emergency, fedFrom, onClose, onEdit }: { piece: WizardPiece; emergency: boolean; fedFrom: string; onClose: () => void; onEdit?: () => void }) {
  const [activeTab, setActiveTab] = useState<DetailTab>("details");
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const circuits = (piece.meta?.circuits as WizardCircuit[] | undefined) || [];
  const odd = circuits.filter((circuit) => circuit.ckt % 2 === 1);
  const even = circuits.filter((circuit) => circuit.ckt % 2 === 0);
  const usedCount = circuits.filter((circuit) => circuit.load && circuit.load.toLowerCase() !== "spare").length;
  const voltage = typeof piece.meta?.voltage === "string" ? piece.meta.voltage : "";
  const mainAmpsRaw = typeof piece.meta?.mainAmps === "string" ? piece.meta.mainAmps : "";
  // Some panels' mainAmps already carry an "A Main" suffix from how they were entered in the wizard —
  // strip it before appending our own, instead of risking "100A MainA Main".
  const mainAmps = mainAmpsRaw.replace(/\s*A?\s*Main$/i, "").trim();

  const generatedDocument = piece.type === "panel" ? <div className="equipment-document generated-panel-document">
    <span className="generated-document-badge">PDF</span>
    <div><b>{piece.name} — Panel Schedule <em>AUTO-GENERATED</em></b><small>Panel Schedule · generated from the current circuit table</small></div>
    <span><button type="button" className="generated-document-view" title="View panel schedule" aria-label="View panel schedule" onClick={() => setShowDocumentPreview(true)}>View</button><button type="button" title="Download PDF" aria-label="Download panel schedule PDF" onClick={() => downloadPanelSchedulePdf(piece, fedFrom, emergency)}>↓</button></span>
  </div> : undefined;

  return (
    <>
    <Modal title="" onClose={onClose} className="wizard-result-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close" onClick={onClose}>x</button>
      <div className="wizard-result-modal-body">
        <div className="wizard-panel-schedule-header">
          <div><h3>{piece.name}</h3>
          <p className="wizard-result-modal-meta">{piece.type === "panel" ? `Panel${voltage ? ` · ${voltage}` : ""}${mainAmps ? ` · ${mainAmps}A Main` : ""}` : String(piece.meta?.equipmentType || "Equipment load")}</p></div>
          {onEdit && <button type="button" className="header-btn primary" onClick={onEdit}>Edit</button>}
        </div>
        <div className={`wizard-result-banner ${emergency ? "emergency" : "ready"}`}>Energized · {emergency ? "Emergency" : "Normal"}</div>
        <EquipmentRecordTabs recordKey={`wizard-piece:${piece.type}:${piece.name}`} active={activeTab} onChange={setActiveTab} generatedDocument={generatedDocument} />
        {activeTab === "details" && <>
        {/* Plain label/value rows, not a colored badge — this is reference info, not a status to call
            attention to (the banner above already does that job). */}
        <div className="wizard-panel-schedule-info">
          <div className="wizard-panel-schedule-info-row"><span>Fed From</span><b>{fedFrom}</b></div>
          {piece.type === "panel" ? <div className="wizard-panel-schedule-info-row"><span>Circuits Used</span><b>{usedCount} of {circuits.length}</b></div> : <div className="wizard-panel-schedule-info-row"><span>Equipment Type</span><b>{String(piece.meta?.equipmentType || "General")}</b></div>}
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
      </div>
    </Modal>
    {showDocumentPreview && <Modal title="" onClose={() => setShowDocumentPreview(false)} className="panel-document-preview-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close preview" onClick={() => setShowDocumentPreview(false)}>x</button>
      <div className="panel-document-toolbar"><button type="button" onClick={() => downloadPanelSchedulePdf(piece, fedFrom, emergency)}>↓ Download PDF</button></div>
      <article className="panel-document-sheet">
        <header className="panel-document-brand"><div className="panel-document-logo">CPC</div><div><strong>Critical Power Command</strong><span>Emergency Power Management Platform</span></div><small>Equipment Document<br />Generated {new Date().toLocaleDateString()}</small></header>
        <div className="panel-document-title"><div><span>Electrical Distribution</span><h2>{piece.name} — Panel Schedule</h2></div><b className={emergency ? "emergency" : "normal"}>{emergency ? "Emergency" : "Normal"}</b></div>
        <div className="panel-document-meta"><span>Rated Voltage<b>{voltage || "—"}</b></span><span>Rated Amperage<b>{mainAmps ? `${mainAmps}A` : "—"}</b></span><span>Fed From<b>{fedFrom}</b></span><span>Circuits Used<b>{usedCount} of {circuits.length}</b></span></div>
        <table><thead><tr><th>CKT</th><th>Load Description</th><th>CKT</th><th>Load Description</th></tr></thead><tbody>
          {Array.from({ length: Math.max(odd.length, even.length) }).map((_, row) => <tr key={row}><td>{odd[row]?.ckt ?? ""}</td><td className={odd[row]?.load?.toLowerCase() === "spare" ? "spare" : ""}>{cleanPanelText(odd[row]?.load)}</td><td>{even[row]?.ckt ?? ""}</td><td className={even[row]?.load?.toLowerCase() === "spare" ? "spare" : ""}>{cleanPanelText(even[row]?.load)}</td></tr>)}
        </tbody></table>
        <footer><span>Auto-generated from the current CPC One-Line equipment record.</span><b>Critical Power Command · Controlled Document</b></footer>
      </article>
    </Modal>}
    </>
  );
}

function buildOneLineJson({
  systemName, ats, generators, pieces, sourceLinks, atsDownstream, pieceDownstream,
}: { systemName: string; ats: ATS[]; generators: Generator[]; pieces: WizardPiece[]; sourceLinks: Record<string, string>; atsDownstream: Record<string, string>; pieceDownstream: Record<string, string[]> }) {
  const resolveChain = (atsId: string) => resolveWizardTree(atsDownstream[atsId], pieces, pieceDownstream);
  return {
    system: systemName,
    sources: [
      ...generators.map((generator) => ({ id: generator.id, kind: "generator", name: generator.name, feeds: sourceLinks[generator.id] || null })),
      { id: "utility", kind: "utility", name: "Utility", feeds: sourceLinks.utility || null },
    ],
    equipment: pieces.map((piece) => ({ type: piece.type, name: piece.name, ...(piece.meta || {}) })),
    ats: ats.map((item) => ({ id: item.id, name: item.name, feeds: resolveChain(item.id) })),
  };
}

function ResultLegendModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="" onClose={onClose} className="wizard-result-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close" onClick={onClose}>x</button>
      <div className="wizard-result-modal-body">
        <h3>Legend</h3>
        <p className="wizard-result-modal-meta">Emergency Generation Spine</p>
        <div className="wizard-connections-section-title">Equipment State</div>
        <div className="wizard-legend-rows">
          <div className="wizard-legend-row"><span className="wizard-legend-dot ready" />Ready / On Normal</div>
          <div className="wizard-legend-row"><span className="wizard-legend-dot running" />Running / On Emergency</div>
          <div className="wizard-legend-row"><span className="wizard-legend-dot standby" />De-energized / Standby</div>
        </div>
        <div className="wizard-connections-section-title">Power Flow</div>
        <div className="wizard-legend-rows">
          <div className="wizard-legend-row"><span className="wizard-legend-line running" />Emergency Power</div>
          <div className="wizard-legend-row"><span className="wizard-legend-line standby" />De-energized</div>
        </div>
        <div className="wizard-connections-section-title">Off-Page Connectors</div>
        <p className="wizard-legend-note">The label under each ATS, named for the actual load (e.g. &quot;ICU&quot;), is an off-page connector — the same convention used on paper one-lines to point to another sheet. Clicking an ATS jumps to that load&apos;s own popup.</p>
      </div>
    </Modal>
  );
}

/** The square, arrow-flanked draw-out breaker glyph — used in place of the plain arc BreakerSymbol
 * wherever the wizard has an actual Breaker piece (style: Draw-Out) matching this connection. */
function DrawoutBreakerGlyph({ tone }: { tone: "emergency" | "normal" | "tie" }) {
  const color = tone === "emergency" ? "#ef4444" : tone === "normal" ? "#22c55e" : "#64748b";
  return (
    <svg width="24" height="75" viewBox="0 0 16 50" fill="none" aria-hidden="true">
      <line x1="8" y1="0" x2="8" y2="50" stroke={color} strokeWidth="3" />
      <path d="M4 8 L8 4 L12 8" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 14 L8 10 L12 14" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="19" width="12" height="12" rx="1.5" fill={color} />
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
};

/** Popup for a single breaker in the generated spine — opened by clicking its glyph, matching the
 * highlighted-circle-then-popup interaction on the paper one-line reference. */
function BreakerDetailModal({ detail, onClose }: { detail: BreakerDetailData; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<DetailTab>("details");
  const subtitle = [detail.derived ? "Auto-derived" : "Configured", detail.style, detail.role].filter(Boolean).join(" · ");
  return (
    <Modal title="" onClose={onClose} className="wizard-result-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close" onClick={onClose}>x</button>
      <div className="wizard-result-modal-body">
        <h3>{detail.name}</h3>
        <p className="wizard-result-modal-meta">{subtitle}</p>
        <div className={`wizard-result-banner ${detail.emergency ? "emergency" : "ready"}`}>{detail.position.toUpperCase()}{detail.emergency ? " · EMERGENCY" : ""}</div>
        <EquipmentRecordTabs recordKey={`breaker:${detail.key}`} active={activeTab} onChange={setActiveTab} />
        {activeTab === "details" &&
        <div className="wizard-panel-schedule-info">
          {detail.role && <div className="wizard-panel-schedule-info-row"><span>Role</span><b>{detail.role}</b></div>}
          <div className="wizard-panel-schedule-info-row"><span>Style</span><b>{detail.style}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>Position</span><b>{detail.position}</b></div>
          {detail.poweredBy && <div className="wizard-panel-schedule-info-row"><span>Powered By</span><b>{detail.poweredBy}</b></div>}
          {detail.feeds && <div className="wizard-panel-schedule-info-row"><span>Feeds</span><b>{detail.feeds}</b></div>}
        </div>}
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
  const busCount = typeof piece.meta?.busCount === "string" ? piece.meta.busCount : "";
  return (
    <Modal title="" onClose={onClose} className="wizard-result-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close" onClick={onClose}>x</button>
      <div className="wizard-result-modal-body">
        <h3>{piece.name}</h3>
        <p className="wizard-result-modal-meta">{containerType || "Container"}</p>
        <div className="wizard-result-banner ready">{busCount ? `${busCount} BUS${busCount === "1" ? "" : "ES"}` : "CONTAINER"} · {feeds.length} {feedsLabel.toUpperCase()}</div>
        <EquipmentRecordTabs recordKey={`container:${piece.name}`} active={activeTab} onChange={setActiveTab} />
        {activeTab === "details" &&
        <div className="wizard-panel-schedule-info">
          {poweredBy && <div className="wizard-panel-schedule-info-row"><span>Fed From</span><b>{poweredBy}</b></div>}
          <div className="wizard-panel-schedule-info-row"><span>Container Type</span><b>{containerType || "—"}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>Voltage</span><b>{voltage || "—"}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>Buses</span><b>{busCount ? `${busCount} (${busCount === "1" ? "single bus" : "multi-bus"})` : "—"}</b></div>
          <div className="wizard-panel-schedule-info-row"><span>{feedsLabel}</span><b>{feeds.length ? feeds.join(", ") : "—"}</b></div>
        </div>}
      </div>
    </Modal>
  );
}

type OneLineInspectorApi = {
  selectedBreakerKey: string | null;
  openBreaker: (detail: BreakerDetailData) => void;
  selectedContainerName: string | null;
  openContainer: (detail: ContainerDetailData) => void;
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

export function ResultTab({
  systemName, ats, generators, atsTelemetry, generatorTelemetry, pieces, sourceLinks, atsDownstream, pieceDownstream, generated, onEditPiece,
}: { systemName: string; ats: ATS[]; generators: Generator[]; atsTelemetry?: AtsTelemetry[]; generatorTelemetry?: GeneratorTelemetry[]; pieces: WizardPiece[]; sourceLinks: Record<string, string>; atsDownstream: Record<string, string>; pieceDownstream: Record<string, string[]>; generated: boolean; onEditPiece?: (piece: WizardPiece) => void }) {
  const [openAts, setOpenAts] = useState<ATS | null>(null);
  const [openGenerator, setOpenGenerator] = useState<Generator | null>(null);
  const [branchAts, setBranchAts] = useState<ATS | null>(null);
  const [scheduleView, setScheduleView] = useState<{ piece: WizardPiece; tone: "emergency" | "normal"; fedFrom: string } | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [breakerDetail, setBreakerDetail] = useState<BreakerDetailData | null>(null);
  const [containerDetail, setContainerDetail] = useState<ContainerDetailData | null>(null);
  // Shared across the main spine (below) and, via the Provider wrapping this whole return, every depth
  // of a downstream branch's container/breaker/distribution-gear tree — one popup implementation, one
  // click-highlight state, instead of threading these handlers through every level of recursion.
  const inspectorApi = useMemo<OneLineInspectorApi>(() => ({
    selectedBreakerKey: breakerDetail?.key ?? null,
    openBreaker: setBreakerDetail,
    selectedContainerName: containerDetail?.piece.name ?? null,
    openContainer: setContainerDetail,
  }), [breakerDetail, containerDetail]);

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

  const switchgear = pieces.find((piece) => piece.type === "container");
  const json = buildOneLineJson({ systemName, ats, generators, pieces, sourceLinks, atsDownstream, pieceDownstream });
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
    let current: string | undefined = sourceLinks[generator.id];
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
  const wiredGeneratorViews = generatorViews.filter(({ generator }) => Boolean(sourceLinks[generator.id]));
  const reachableFromSources = new Set<string>();
  const reachStack = Object.values(sourceLinks);
  while (reachStack.length) {
    const name = reachStack.pop();
    if (!name || name === "End" || reachableFromSources.has(name)) continue;
    reachableFromSources.add(name);
    reachStack.push(...(pieceDownstream[name] || []));
  }
  const wiredAts = ats.filter((item) => reachableFromSources.has(item.name));

  return (
    <OneLineInspectorContext.Provider value={inspectorApi}>
    <section className="operations-section wizard-section wizard-section-result">
      <div className="wizard-header-bar">
        <span className="wizard-brand">CPC</span>
        <span className="wizard-header-label">Generated One-Line</span>
        <button type="button" className="header-btn" onClick={() => setShowLegend(true)}>Legend</button>
        <button type="button" className="header-btn" onClick={() => setShowJson((current) => !current)}>{showJson ? "Hide JSON" : "View JSON"}</button>
      </div>
      {showJson && <pre className="wizard-json-view">{JSON.stringify(json, null, 2)}</pre>}
      <div className="result-spine-wrap">
        <div className="result-spine-header">
          <div>
            <div className="wizard-kicker">Generators → {switchgear ? switchgear.name : "Switchgear"} → ATS</div>
            <p className="result-spine-sub">The spine — click any ATS to view its downstream load.</p>
          </div>
        </div>
        <div className="result-spine">
          {/* Only the generator itself and its own output breaker sit above the boundary — the
              draw-out switchgear breaker (52-G#) is physically inside "GEN SWBD", so it stays inside
              the dashed box. A real wire segment runs on both sides of the border (here, and again just
              inside the box below) so the border crosses the middle of a plain wire, the same way the
              bottom border crosses the wire between the feeder breaker and the ATS below it. */}
          <div className="sld-generators result-gen-row result-gen-lead-row">
            {wiredGeneratorViews.map(({ generator, data, running, structuralTone, lineClass, breakerTone, leadBreaker, entryBreaker }) => {
              const leadKey = `lead-${generator.id}`;
              const leadName = leadBreaker?.name || `${generator.name} Breaker`;
              const leadDetail: BreakerDetailData = {
                key: leadKey, name: leadName, style: leadBreaker?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount",
                derived: !leadBreaker, position: running ? "Closed" : "Open", emergency: running,
                poweredBy: generator.name, feeds: entryBreaker?.name || switchgear?.name || "Bus",
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
                  <span className="sld-breaker-with-tag">
                    <BreakerHitButton detail={leadDetail}>
                      {leadBreaker.meta?.style === "draw-out" ? <DrawoutBreakerGlyph tone={breakerTone} /> : <BreakerSymbol tone={breakerTone} size={38} centered />}
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
            {!wiredGeneratorViews.length && <p className="operations-empty">No generators wired yet — connect one in the Connections step.</p>}
          </div>
          {switchgear && (
            <div className="result-switchgear-box">
              <SwitchgearLabelButton
                switchgear={switchgear}
                feeds={wiredGeneratorViews.map(({ entryBreaker, leadBreaker, index }) => entryBreaker?.name || leadBreaker?.name || `52-G${index + 1}`)}
              />
              {Boolean(wiredGeneratorViews.length) && (
                <div className="sld-generators result-gen-row result-gen-entry-row">
                  {wiredGeneratorViews.map(({ generator, lineClass, breakerTone, entryBreaker, leadBreaker, running, index }) => {
                    const entryKey = `entry-${generator.id}`;
                    const entryName = entryBreaker?.name || `52-G${index + 1}`;
                    const entryDetail: BreakerDetailData = {
                      key: entryKey, name: entryName, role: "Incomer", style: entryBreaker?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount",
                      derived: !entryBreaker, position: running ? "Closed" : "Open", emergency: running,
                      poweredBy: leadBreaker?.name || generator.name, feeds: "Bus",
                    };
                    return (
                    <div className="sld-generator-column" key={generator.id}>
                      {/* This slot always reserves the same height whether or not a second breaker piece
                          exists in this generator's chain — otherwise a column without one renders shorter
                          than its neighbors and falls short of the bus below. */}
                      <span className={`result-crossing-wire ${lineClass}`} aria-hidden="true" />
                      <span className="result-drawout-slot">
                        {entryBreaker ? (
                          <span className="sld-breaker-with-tag">
                            <BreakerHitButton detail={entryDetail}>
                              {entryBreaker.meta?.style === "draw-out" ? <DrawoutBreakerGlyph tone={breakerTone} /> : <BreakerSymbol tone={breakerTone} size={38} centered />}
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
              {Boolean(wiredGeneratorViews.length) && <div className="result-bus" />}
              {Boolean(wiredAts.length) && (
                <div className="result-ats-row result-feeder-row">
                  {/* These feeders all drop off the same emergency bus, so — like the bus itself — they
                      stay red regardless of any one ATS's current normal/emergency state. */}
                  {wiredAts.map((item) => {
                    // A feeder breaker is rendered only when the saved path actually contains a
                    // breaker immediately before this ATS. A direct GEN SWBD -> ATS connection is
                    // a plain wire; the wizard must never invent a 52-F breaker for it.
                    const feederPiece = pieces.find((piece) => piece.type === "breaker" &&
                      (pieceDownstream[piece.name] || []).includes(item.name));
                    const feederKey = `feeder-${item.id}`;
                    const feederName = feederPiece?.name || "";
                    const feederDetail: BreakerDetailData = {
                      key: feederKey, name: feederName, role: "Feeder", style: feederPiece?.meta?.style === "draw-out" ? "Draw-Out" : "Fixed-Mount", derived: false,
                      position: "Closed", emergency: true, poweredBy: switchgear?.name || "Bus", feeds: item.name,
                    };
                    return (
                    <div className="result-ats-col" key={item.id}>
                      <span className="result-connector emergency" />
                      {feederPiece ? (
                        <span className="sld-breaker-with-tag">
                          <BreakerHitButton detail={feederDetail}>
                            {feederPiece.meta?.style === "draw-out" ? <DrawoutBreakerGlyph tone="emergency" /> : <BreakerSymbol tone="emergency" size={38} centered />}
                          </BreakerHitButton>
                          <div className="sld-breaker-tag emergency-source">{feederName}</div>
                        </span>
                      ) : (
                        <span className="result-connector emergency" aria-hidden="true" />
                      )}
                      <span className="result-connector emergency" />
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="result-ats-row">
            {wiredAts.map((item) => {
              const data = resolveAtsTelemetry(atsTelemetry, item.id, item.name);
              const emergency = data?.connected_source === "GENERATOR";
              const downstream = atsDownstream[item.id];
              return (
                <div className="result-ats-col" key={item.id}>
                  <span className="result-connector emergency" aria-hidden="true" />
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
                      <span className="sld-load-label">Not wired</span>
                    )}
                  </div>
                </div>
              );
            })}
            {!wiredAts.length && <p className="operations-empty">No ATS units wired yet — connect one in the Connections step.</p>}
          </div>
        </div>
      </div>
      {openAts && (
        <EquipmentFaceplate
          systemName={systemName}
          ats={openAts}
          atsTelemetry={resolveAtsTelemetry(atsTelemetry, openAts.id, openAts.name)}
          onClose={() => setOpenAts(null)}
          alwaysShowSourceAvailability
          fedFromLabel={`F${ats.findIndex((item) => item.id === openAts.id) + 1}`}
          extraSection={
            <>
              <div className="faceplate-v2-section-title">Downstream</div>
              {atsDownstream[openAts.id] ? (
                <button type="button" className="wizard-downstream-link" onClick={() => { setBranchAts(openAts); setOpenAts(null); }}>
                  {atsDownstream[openAts.id] === "End" ? "End of line" : atsDownstream[openAts.id]} — View on separate page →
                </button>
              ) : (
                <p className="faceplate-v2-load-box">Not wired yet — set this in the Wizard&apos;s Connections step.</p>
              )}
            </>
          }
        />
      )}
      {openGenerator && (
        <EquipmentFaceplate
          systemName={systemName}
          generator={openGenerator}
          generatorTelemetry={resolveGeneratorTelemetry(generatorTelemetry, openGenerator.id, openGenerator.name)}
          onClose={() => setOpenGenerator(null)}
        />
      )}
      {branchAts && (
        <ResultBranchModal
          systemName={systemName}
          ats={branchAts}
          atsTelemetry={resolveAtsTelemetry(atsTelemetry, branchAts.id, branchAts.name)}
          feederLabel={`F${ats.findIndex((item) => item.id === branchAts.id) + 1}`}
          pieces={pieces}
          atsDownstream={atsDownstream}
          pieceDownstream={pieceDownstream}
          onClose={() => setBranchAts(null)}
          onViewSchedule={(piece, tone, fedFrom) => setScheduleView({ piece, tone, fedFrom })}
        />
      )}
      {scheduleView && (
        <ResultPanelScheduleModal piece={scheduleView.piece} emergency={scheduleView.tone === "emergency"} fedFrom={scheduleView.fedFrom} onClose={() => setScheduleView(null)} onEdit={onEditPiece ? () => { onEditPiece(scheduleView.piece); setScheduleView(null); } : undefined} />
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

export function SystemOperationsOverview({ systemId, systemName, ats, generators, view, onViewChange, canEditOneLine = false }: { systemId: string; systemName: string; ats: ATS[]; generators: Generator[]; view: "details" | "wizard" | "result"; onViewChange: (view: "details" | "wizard" | "result") => void; canEditOneLine?: boolean }) {
  const navigate = useNavigate();
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentSelection | null>(null);
  const [testWizardOpen, setTestWizardOpen] = useState(false);
  // Lifted here (rather than inside OneLineWizardTab) so the built one-line survives switching
  // to the Result tab and back — both tabs are children of this same, always-mounted component.
  // Backed by the server (system_one_lines table) so it also survives a page refresh.
  const { data: savedOneLine } = useOneLine(systemId);
  const saveOneLine = useSaveOneLine();
  const [wizardPieces, setWizardPieces] = useState<WizardPiece[]>([]);
  const [wizardSourceLinks, setWizardSourceLinks] = useState<Record<string, string>>({});
  const [wizardAtsDownstream, setWizardAtsDownstream] = useState<Record<string, string>>({});
  const [wizardPieceDownstream, setWizardPieceDownstream] = useState<Record<string, string[]>>({});
  // True only once "Finish & Generate" has actually been clicked — the Result tab stays empty until
  // then, even though the wizard's own pieces/connections exist as soon as they're wired up.
  const [oneLineGenerated, setOneLineGenerated] = useState(false);
  const [oneLineHydrated, setOneLineHydrated] = useState(false);
  const [wizardEditRequest, setWizardEditRequest] = useState<WizardPiece | null>(null);

  useEffect(() => {
    if (savedOneLine === undefined) return; // still loading
    if (savedOneLine) {
      const data = savedOneLine.data as { pieces?: WizardPiece[]; sourceLinks?: Record<string, string>; atsDownstream?: Record<string, string>; pieceDownstream?: Record<string, string | string[]>; generated?: boolean };
      setWizardPieces(data.pieces || []);
      setWizardSourceLinks(data.sourceLinks || {});
      setWizardAtsDownstream(data.atsDownstream || {});
      // Older saved diagrams stored one destination per piece as a plain string — normalize those
      // into single-item arrays so a piece can now feed multiple downstream targets.
      const rawPieceDownstream = data.pieceDownstream || {};
      setWizardPieceDownstream(
        Object.fromEntries(Object.entries(rawPieceDownstream).map(([name, value]) => [name, Array.isArray(value) ? value : [value]]))
      );
      setOneLineGenerated(Boolean(data.generated));
    }
    setOneLineHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedOneLine, systemId]);

  useEffect(() => {
    if (!oneLineHydrated) return;
    const hasContent = wizardPieces.length > 0 || Object.keys(wizardSourceLinks).length > 0 || Object.keys(wizardAtsDownstream).length > 0 || Object.keys(wizardPieceDownstream).length > 0;
    // Don't create a row for a system nobody has touched the wizard for yet — but once one exists,
    // still save an emptied-out state (e.g. the user cleared everything back out on purpose).
    if (!hasContent && !savedOneLine) return;
    const timeout = setTimeout(() => {
      saveOneLine.mutate({ systemId, data: { pieces: wizardPieces, sourceLinks: wizardSourceLinks, atsDownstream: wizardAtsDownstream, pieceDownstream: wizardPieceDownstream, generated: oneLineGenerated } });
    }, 800);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneLineHydrated, wizardPieces, wizardSourceLinks, wizardAtsDownstream, wizardPieceDownstream, oneLineGenerated]);

  const telemetry = useTelemetrySnapshot(systemId);
  const { data: alarms } = useAlarms({ systemId });
  const activeAlarms = (alarms || []).filter((alarm) => alarm.status === "active");
  const onEmergency = ats.some((item) => resolveAtsTelemetry(telemetry?.ats, item.id, item.name)?.connected_source === "GENERATOR");
  const systemEvents: ActivityItem[] = [
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
  const openGeneratorDetail = () => {
    setSelectedEquipment(null);
    navigate(`/systems/${systemId}/generators`);
  };
  const openAtsDetail = () => {
    setSelectedEquipment(null);
    navigate(`/systems/${systemId}/ats`);
  };
  const selectedAts = selectedEquipment?.type === "ats" ? ats.find((item) => item.id === selectedEquipment.id) : undefined;
  const selectedGenerator = selectedEquipment?.type === "generator" ? generators.find((generator) => generator.id === selectedEquipment.id) : undefined;
  const selectedAtsTelemetry = selectedAts ? resolveAtsTelemetry(telemetry?.ats, selectedAts.id, selectedAts.name) : undefined;
  const selectedGeneratorTelemetry = selectedGenerator ? resolveGeneratorTelemetry(telemetry?.generators, selectedGenerator.id, selectedGenerator.name) : undefined;
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
        <span className={`status-pill-lg ${onEmergency ? "pill-emergency" : "pill-normal"}`}>
          {onEmergency ? <IconAlert size={14} strokeWidth={2.5} /> : <IconCheckCircle size={14} strokeWidth={2.5} />}
          {onEmergency ? "Emergency" : "Normal operation"}
        </span>
        {systemId === "SYS-0006" && telemetry?.storage && (
          <div style={{ marginTop: 10, fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>
            <b style={{ color: telemetry.storage.has_data ? "#22c55e" : "#f59e0b" }}>{telemetry.storage.has_data ? "LIVE MQTT" : "MQTT WAITING"}</b> · Stored in {telemetry.storage.engine}<br />
            {telemetry.storage.org} / {telemetry.storage.bucket} / {telemetry.storage.measurement}
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
    {view === "wizard" && canEditOneLine ? (
      <OneLineWizardTab
        systemName={systemName} ats={ats} generators={generators}
        pieces={wizardPieces} addPiece={(piece) => setWizardPieces((current) => [...current, piece])}
        removePiece={(name) => {
          setWizardPieces((current) => current.filter((piece) => piece.name !== name));
          setWizardAtsDownstream((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value !== name)));
          setWizardPieceDownstream((current) => {
            const next: Record<string, string[]> = {};
            for (const [key, values] of Object.entries(current)) {
              if (key === name) continue;
              const filtered = values.filter((value) => value !== name);
              if (filtered.length) next[key] = filtered;
            }
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
        }}
        sourceLinks={wizardSourceLinks} setSourceLink={(id, destination) => setWizardSourceLinks((current) => ({ ...current, [id]: destination }))}
        removeSourceLink={(id) => setWizardSourceLinks((current) => { const next = { ...current }; delete next[id]; return next; })}
        atsDownstream={wizardAtsDownstream} setAtsDownstreamLink={(id, destination) => setWizardAtsDownstream((current) => ({ ...current, [id]: destination }))}
        removeAtsLink={(id) => setWizardAtsDownstream((current) => { const next = { ...current }; delete next[id]; return next; })}
        pieceDownstream={wizardPieceDownstream}
        setPieceDownstreamLink={(name, destination) => setWizardPieceDownstream((current) => {
          const existing = current[name] || [];
          if (existing.includes(destination)) return current;
          return { ...current, [name]: [...existing, destination] };
        })}
        removePieceLink={(name, destination) => setWizardPieceDownstream((current) => {
          const filtered = (current[name] || []).filter((value) => value !== destination);
          const next = { ...current };
          if (filtered.length) next[name] = filtered; else delete next[name];
          return next;
        })}
        onGenerate={() => setOneLineGenerated(true)}
        editPieceRequest={wizardEditRequest}
        onEditRequestHandled={() => setWizardEditRequest(null)}
      />
    ) : view === "result" ? (
      <ResultTab
        systemName={systemName} ats={ats} generators={generators} atsTelemetry={telemetry?.ats} generatorTelemetry={telemetry?.generators}
        pieces={wizardPieces} sourceLinks={wizardSourceLinks} atsDownstream={wizardAtsDownstream} pieceDownstream={wizardPieceDownstream}
        generated={oneLineGenerated}
        onEditPiece={canEditOneLine ? (piece) => { setWizardEditRequest(piece); onViewChange("wizard"); } : undefined}
      />
    ) : (
      <>
        <section className="operations-section generator-section">
          <div className="operations-section-title"><div><span>Emergency power</span><h3>Generators</h3></div><div style={{ display: "flex", gap: 8 }}><button className="device-test-btn" onClick={() => setTestWizardOpen(true)}>Test</button><button onClick={openGeneratorDetail}>View details</button></div></div>
          <div className="operations-table-wrap">
            <table className="operations-table generator-overview-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Sl.</th>
                  <th rowSpan={2}>Generator</th>
                  <th rowSpan={2}>Status</th>
                  <th colSpan={5} className="table-group-header engine">Engine data</th>
                  <th colSpan={9} className="table-group-header electrical">Electrical data</th>
                </tr>
                <tr className="table-subhead">
                  <th>Fuel</th><th>Hrs</th><th>Oil psi</th><th>H₂O temp</th><th>Batt V</th>
                  <th>VAB</th><th>VBC</th><th>VCA</th><th>Amps A</th><th>Amps B</th><th>Amps C</th><th>Hz</th><th>kW</th><th>% kW</th>
                </tr>
              </thead>
              <tbody>
                {generators.map((generator, index) => { const data = resolveGeneratorTelemetry(telemetry?.generators, generator.id, generator.name); return <tr className="equipment-detail-row" title={`View details for ${generator.name}`} key={generator.id} onClick={() => setSelectedEquipment({ type: "generator", id: generator.id })}><td className="serial-cell">{String(index + 1).padStart(2, "0")}</td><td className="device-name-cell">{generator.name}</td><td className={generatorStatusClass(data)}>{data?.status || "WAITING"}</td><td>{reading(data?.fuel_level_percent, 0)}%</td><td>{reading(data?.engine_hours, 1)}</td><td>{reading(data?.oil_pressure_psi, 1)}</td><td>{data ? `${reading(data.coolant_temperature_c, 1)}°C` : "—"}</td><td>{reading(data?.battery_voltage, 1)}</td><td>{reading(data?.voltage_ab, 1)}</td><td>{reading(data?.voltage_bc, 1)}</td><td>{reading(data?.voltage_ca, 1)}</td><td>{reading(data?.current_a, 1)}</td><td>{reading(data?.current_b, 1)}</td><td>{reading(data?.current_c, 1)}</td><td>{reading(data?.frequency, 1)}</td><td>{reading(data?.active_power_kw, 1)}</td><td>{reading(data?.load_percentage, 1)}</td></tr>; })}
                {!generators.length && <tr><td colSpan={17} className="operations-empty">No generator registered for this system.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="operations-section ats-section">
          <div className="operations-section-title"><div><span>Power distribution</span><h3>Automatic Transfer Switches</h3></div><button onClick={openAtsDetail}>View details</button></div>
          <div className="ats-overview-grid">{atsBanks.map((bank, bankIndex) => <div className="ats-overview-card" key={bankIndex}><table className="operations-table"><thead><tr><th>Sl.</th><th>ATS name</th><th>Status</th><th>Connected to</th><th>Source available</th><th>Time to re-xfer</th><th>Time to bus</th></tr></thead><tbody>{bank.map((item, index) => { const serial = (bankIndex ? leftBankSize : 0) + index + 1; const data = resolveAtsTelemetry(telemetry?.ats, item.id, item.name) || telemetry?.ats.find((entry) => atsNumber(entry.equipment_id) === String(serial) || atsNumber(entry.equipment_name) === String(serial)); const emergency = data?.connected_source === "GENERATOR" || data?.status === "EMERGENCY"; const sourceClass = emergency ? "live emergency-source" : data?.utility_available ? "live utility-source" : ""; return <tr className={`equipment-detail-row ${emergency ? "ats-emergency-demo" : ""}`} title={`View details for ${item.name}`} key={item.id} onClick={() => setSelectedEquipment({ type: "ats", id: item.id })}><td className="serial-cell">{String(serial).padStart(2, "0")}</td><td className="device-name-cell">{item.name}</td><td className={data?.status === "EMERGENCY" || data?.status === "FAULT" ? "emergency-state ats-status-cell" : "ready"}>{data?.status || "WAITING"}</td><td className={emergency ? "ats-connected-emergency" : "ready"}>{data?.connected_source || "—"}</td><td><span className={`source-light ${sourceClass}`} /></td><td>{data?.transfer_time_seconds ?? "—"}</td><td>{data?.time_on_emergency_seconds ?? "—"}</td></tr>; })}</tbody></table></div>)}</div>
          {!ats.length && <div className="operations-empty">No ATS units registered for this system.</div>}
        </section>
      </>
    )}
    {(selectedAts || selectedGenerator) && <EquipmentFaceplate systemName={systemName} ats={selectedAts} generator={selectedGenerator} atsTelemetry={selectedAtsTelemetry} generatorTelemetry={selectedGeneratorTelemetry} onClose={() => setSelectedEquipment(null)} />}
    {testWizardOpen && <TestWizard systemName={systemName} ats={ats} generators={generators} onClose={() => setTestWizardOpen(false)} />}
  </div>;
}
