import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { IconAlert, IconBell, IconCheckCircle } from "../common/Icons";
import { Modal } from "../common/Modal";
import { TestWizard } from "./TestWizard";
import type { ATS, Generator } from "../../types/entities";
import { telemetryFor, useTelemetrySnapshot, type AtsTelemetry, type GeneratorTelemetry } from "../../hooks/useTelemetry";
import { demoAtsTelemetry, demoGeneratorTelemetry } from "../../data/mepstraTelemetry";
import { useAlarms } from "../../queries/alarms";

type EquipmentSelection = { type: "ats"; id: string } | { type: "generator"; id: string };
type TestTarget = EquipmentSelection;

/** Live telemetry first; falls back to the Mepstra demo register snapshot for the specific devices it covers. */
export function resolveGeneratorTelemetry(generatorTelemetry: GeneratorTelemetry[] | undefined, id: string, name: string) {
  return telemetryFor(generatorTelemetry, id, name) || demoGeneratorTelemetry(id) || undefined;
}
export function resolveAtsTelemetry(atsTelemetry: AtsTelemetry[] | undefined, id: string, name: string) {
  return telemetryFor(atsTelemetry, id, name) || demoAtsTelemetry(id) || undefined;
}

const unavailableReading = "00";
const reading = (value: number | undefined, digits = 0) => value === undefined ? unavailableReading : value.toFixed(digits);

const formatDuration = (seconds?: number) => {
  if (seconds === undefined || seconds === null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

type Alarm = { id: string; message: string; severity: string; occurred_at: string; ack_by?: string | null };

function eventTone(alarm: Alarm) {
  if (alarm.ack_by) return "resolved";
  if (alarm.severity === "critical" || alarm.severity === "alarm" || alarm.severity === "emergency") return "critical";
  if (alarm.severity === "warning") return "warning";
  return "info";
}

function EventsPanel({ alarms }: { alarms: Alarm[] }) {
  const navigate = useNavigate();
  const sorted = [...alarms].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  const visible = sorted.slice(0, 4);
  const remaining = sorted.length - visible.length;
  return <div className="operations-events-panel">
    <div className="operations-events-title">Active Events</div>
    <ul className="operations-events-list">
      {visible.map((alarm) => {
        const tone = eventTone(alarm);
        const Icon = tone === "resolved" ? IconCheckCircle : tone === "info" ? IconBell : IconAlert;
        return <li className={`event-${tone}`} key={alarm.id}>
          <time>{new Date(alarm.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
          <Icon size={12} strokeWidth={2.5} />
          <span>{alarm.message}</span>
        </li>;
      })}
      {!visible.length && <li className="operations-events-empty">No active events for this system.</li>}
    </ul>
    {remaining > 0 && <button type="button" className="operations-events-more" onClick={() => navigate("/alarms")}>+{remaining} Additional Events…</button>}
  </div>;
}

function EquipmentFaceplate({ systemName, ats, generator, atsTelemetry, generatorTelemetry, onClose }: { systemName: string; ats?: ATS; generator?: Generator; atsTelemetry?: Partial<AtsTelemetry>; generatorTelemetry?: Partial<GeneratorTelemetry>; onClose: () => void }) {
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
  const bannerTone = bannerText === "EMERGENCY" || bannerText === "FAULT" ? "emergency" : bannerText === "TRANSFERRING" || bannerText === "TEST MODE" ? "warning" : bannerText === "OFFLINE" ? "offline" : "ready";

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

      {isAts ? (
        <>
          <div className="faceplate-v2-section-title">Source Status</div>
          <div className="faceplate-v2-source-grid">
            <div className="faceplate-v2-source-col">
              <div className={`faceplate-v2-source-box ${onNormal ? "on normal" : "off"}`}>
                <span>Normal Source</span>
                <b>{!atsTelemetry?.utility_available ? "Unavailable" : onNormal ? "Available" : "Ready"}</b>
              </div>
              <div className={`faceplate-v2-source-box ${!onNormal ? "on emergency" : "off"}`}>
                <span>Emergency Source</span>
                <b>{!atsTelemetry?.generator_available ? "Unavailable" : !onNormal ? "Available" : "Ready"}</b>
              </div>
            </div>
            <div className="faceplate-v2-source-col">
              <div className="faceplate-v2-info-box">
                <span>Connected to</span>
                <b className={onNormal ? "normal" : "emergency"}>{onNormal ? "Normal" : "Emergency"}</b>
              </div>
              <div className="faceplate-v2-info-box">
                <span>{emergencyConnected ? "Time on Emergency" : "Last Transfer"}</span>
                <b>{emergencyConnected ? formatDuration(atsTelemetry?.time_on_emergency_seconds) : "—"}</b>
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

function BreakerSymbol({ tone = "normal", size = 30 }: { tone?: "normal" | "emergency" | "tie"; size?: number }) {
  return <svg width={size} height={size * 1.1} viewBox="0 0 16 18" fill="none" aria-hidden="true" className={`sld-symbol sld-breaker-symbol ${tone}`}>
    <circle cx="8" cy="1.8" r="1.7" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="8" cy="16.2" r="1.7" stroke="currentColor" strokeWidth="1.3" />
    <path d="M8 3.5 Q13.5 9 8 14.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
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

export function SystemOperationsOverview({ systemId, systemName, ats, generators, view, onViewChange }: { systemId: string; systemName: string; ats: ATS[]; generators: Generator[]; view: "details" | "one-line"; onViewChange: (view: "details" | "one-line") => void }) {
  const navigate = useNavigate();
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentSelection | null>(null);
  const [testWizardTarget, setTestWizardTarget] = useState<TestTarget | null>(null);
  const telemetry = useTelemetrySnapshot();
  const { data: alarms } = useAlarms({ systemId });
  const activeAlarms = (alarms || []).filter((alarm) => alarm.status === "active");
  const onEmergency = ats.some((item) => resolveAtsTelemetry(telemetry?.ats, item.id, item.name)?.connected_source === "GENERATOR");
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
        <div className="operations-view-tabs">
          <button type="button" className={`view-tab ${view === "details" ? "active" : ""}`} onClick={() => onViewChange("details")}>System Details</button>
          <button type="button" className={`view-tab ${view === "one-line" ? "active" : ""}`} onClick={() => onViewChange("one-line")}>One-Line</button>
        </div>
      </div>
      <EventsPanel alarms={activeAlarms} />
    </div>
    {view === "one-line" ? (
      <SingleLineDiagram
        ats={ats}
        generators={generators}
        atsTelemetry={telemetry?.ats}
        generatorTelemetry={telemetry?.generators}
        onAtsClick={(id) => setSelectedEquipment({ type: "ats", id })}
        onGeneratorClick={(id) => setSelectedEquipment({ type: "generator", id })}
      />
    ) : (
      <>
        <section className="operations-section generator-section">
          <div className="operations-section-title"><div><span>Emergency power</span><h3>Generators</h3></div><button onClick={openGeneratorDetail}>View details</button></div>
          <div className="operations-table-wrap">
            <table className="operations-table generator-overview-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Sl.</th>
                  <th rowSpan={2}>Generator</th>
                  <th rowSpan={2}>Status</th>
                  <th rowSpan={2}>Test</th>
                  <th colSpan={5} className="table-group-header engine">Engine data</th>
                  <th colSpan={9} className="table-group-header electrical">Electrical data</th>
                </tr>
                <tr className="table-subhead">
                  <th>Fuel</th><th>Hrs</th><th>Oil psi</th><th>H₂O temp</th><th>Batt V</th>
                  <th>VAB</th><th>VBC</th><th>VCA</th><th>Amps A</th><th>Amps B</th><th>Amps C</th><th>Hz</th><th>kW</th><th>% kW</th>
                </tr>
              </thead>
              <tbody>
                {generators.map((generator, index) => { const data = resolveGeneratorTelemetry(telemetry?.generators, generator.id, generator.name); return <tr key={generator.id}><td className="serial-cell">{String(index + 1).padStart(2, "0")}</td><td className="device-name-cell">{generator.name}</td><td className={data?.status === "FAULT" ? "emergency-state" : "ready"}>{data?.status || "WAITING"}</td><td><button className="device-test-btn" onClick={() => setTestWizardTarget({ type: "generator", id: generator.id })}>Test Gen</button></td><td>{reading(data?.fuel_level_percent, 0)}%</td><td>{reading(data?.engine_hours, 1)}</td><td>{reading(data?.oil_pressure_psi, 1)}</td><td>{data ? `${reading(data.coolant_temperature_c, 1)}°C` : "—"}</td><td>{reading(data?.battery_voltage, 1)}</td><td>{reading(data?.voltage_ab, 1)}</td><td>{reading(data?.voltage_bc, 1)}</td><td>{reading(data?.voltage_ca, 1)}</td><td>{reading(data?.current_a, 1)}</td><td>{reading(data?.current_b, 1)}</td><td>{reading(data?.current_c, 1)}</td><td>{reading(data?.frequency, 1)}</td><td>{reading(data?.active_power_kw, 1)}</td><td>{reading(data?.load_percentage, 1)}</td></tr>; })}
                {!generators.length && <tr><td colSpan={18} className="operations-empty">No generator registered for this system.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="operations-section ats-section">
          <div className="operations-section-title"><div><span>Power distribution</span><h3>Automatic Transfer Switches</h3></div><button onClick={openAtsDetail}>View details</button></div>
          <div className="ats-overview-grid">{atsBanks.map((bank, bankIndex) => <div className="ats-overview-card" key={bankIndex}><table className="operations-table"><thead><tr><th>Sl.</th><th>ATS name</th><th>Status</th><th>Test</th><th>Connected to</th><th>Source available</th><th>Time to xfer</th><th>Time to bus</th></tr></thead><tbody>{bank.map((item, index) => { const serial = (bankIndex ? leftBankSize : 0) + index + 1; const data = resolveAtsTelemetry(telemetry?.ats, item.id, item.name); const emergency = data?.connected_source === "GENERATOR"; return <tr className={emergency ? "ats-emergency-demo" : ""} key={item.id}><td className="serial-cell">{String(serial).padStart(2, "0")}</td><td className="device-name-cell">{item.name}</td><td className={data?.status === "EMERGENCY" || data?.status === "FAULT" ? "emergency-state" : "ready"}>{data?.status || "WAITING"}</td><td><button className="device-test-btn" onClick={() => setTestWizardTarget({ type: "ats", id: item.id })}>Test ATS</button></td><td className={emergency ? "emergency-state" : "ready"}>{data?.connected_source || "—"}</td><td><span className={`source-light ${data?.utility_available ? "live" : ""}`} /> <span className={`source-light ${data?.generator_available ? "live emergency-source" : ""}`} /></td><td>{data?.transfer_time_seconds ?? "—"}</td><td>{data?.time_on_emergency_seconds ?? "—"}</td></tr>; })}</tbody></table></div>)}</div>
          {!ats.length && <div className="operations-empty">No ATS units registered for this system.</div>}
        </section>
      </>
    )}
    {(selectedAts || selectedGenerator) && <EquipmentFaceplate systemName={systemName} ats={selectedAts} generator={selectedGenerator} atsTelemetry={selectedAtsTelemetry} generatorTelemetry={selectedGeneratorTelemetry} onClose={() => setSelectedEquipment(null)} />}
    {testWizardTarget && <TestWizard systemName={systemName} ats={ats} generators={generators} initialTarget={testWizardTarget} onClose={() => setTestWizardTarget(null)} />}
  </div>;
}
