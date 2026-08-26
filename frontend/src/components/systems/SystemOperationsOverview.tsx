import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Modal } from "../common/Modal";
import { TestWizard } from "./TestWizard";
import type { ATS, Generator } from "../../types/entities";
import { telemetryFor, useTelemetrySnapshot, type AtsTelemetry, type GeneratorTelemetry } from "../../hooks/useTelemetry";
import { demoAtsTelemetry, demoGeneratorTelemetry } from "../../data/mepstraTelemetry";

type EquipmentSelection = { type: "ats"; id: string } | { type: "generator"; id: string };
type TestTarget = EquipmentSelection;

/** Live telemetry first; falls back to the Mepstra demo register snapshot for the specific devices it covers. */
function resolveGeneratorTelemetry(generatorTelemetry: GeneratorTelemetry[] | undefined, id: string, name: string) {
  return telemetryFor(generatorTelemetry, id, name) || demoGeneratorTelemetry(id) || undefined;
}
function resolveAtsTelemetry(atsTelemetry: AtsTelemetry[] | undefined, id: string, name: string) {
  return telemetryFor(atsTelemetry, id, name) || demoAtsTelemetry(id) || undefined;
}

const branchLabel = (branch?: string | null) => branch === "life-safety" ? "Life Safety" : branch === "critical" ? "Critical" : "Equipment";
const unavailableReading = "00";
const reading = (value: number | undefined, digits = 0) => value === undefined ? unavailableReading : value.toFixed(digits);

function Indicator({ active, label, tone = "normal", blinking = false }: { active: boolean; label: string; tone?: "normal" | "emergency" | "test"; blinking?: boolean }) {
  return <span className={`equipment-popup-indicator ${active ? "active" : ""} ${tone} ${blinking && active ? "blinking" : ""}`}><i />{label}</span>;
}

function EquipmentFaceplate({ systemName, ats, generator, atsTelemetry, generatorTelemetry, onClose }: { systemName: string; ats?: ATS; generator?: Generator; atsTelemetry?: Partial<AtsTelemetry>; generatorTelemetry?: Partial<GeneratorTelemetry>; onClose: () => void }) {
  const isAts = Boolean(ats);
  const telemetry = isAts ? atsTelemetry : generatorTelemetry;
  const name = ats?.name || generator?.name || "Equipment";
  const ratedVolts = ats?.rated_volts ?? generator?.rated_volts ?? 415;
  const ratedAmps = ats?.rated_amps ?? generator?.rated_amps ?? "—";
  const branch = branchLabel(ats?.branch);
  const emergencyConnected = isAts && atsTelemetry?.connected_source === "GENERATOR";

  return <Modal title="" onClose={onClose} className="equipment-detail-modal">
    <button type="button" className="equipment-popup-close" aria-label="Close equipment details" onClick={onClose}>x</button>
    <div className={`equipment-faceplate ${emergencyConnected ? "emergency-connected" : ""}`} role="dialog" aria-label={`${name} details`}>
      <header className="equipment-faceplate-header">
        <div>
          <span>{isAts ? "Automatic Transfer Switch" : "Generator"}</span>
          <h3 className={emergencyConnected ? "emergency-equipment-name" : ""}>{isAts ? name.replace("ATS", "ATS") : name}</h3>
        </div>
      </header>
      <div className="equipment-popup-meta">
        <span>Building: {systemName}</span>
        <span>Room: Not available</span>
        <span>Floor: Not available</span>
        <span>Branch of Service: {isAts ? branch : "Emergency Power"}</span>
      </div>
      <div className="equipment-popup-body">
        <div className="equipment-popup-side left">
          <Indicator active={isAts ? Boolean(atsTelemetry?.utility_available) : generatorTelemetry?.status === "READY"} label={isAts ? "Normal Power Available" : "Generator Ready"} />
          <Indicator active={isAts ? atsTelemetry?.connected_source === "UTILITY" : Boolean(generatorTelemetry?.running)} label={isAts ? "Connected to Normal" : "Running"} />
        </div>
        <div className="equipment-power-table">
          <div className="equipment-power-title">{isAts ? "Load Power Data" : "Generator Power Data"}</div>
          <span>Voltage A-B: <b>{reading(telemetry?.voltage_ab, 1)}</b></span><span>AMPS A: <b>{reading(telemetry?.current_a, 1)}</b></span>
          <span>Voltage B-C: <b>{reading(telemetry?.voltage_bc, 1)}</b></span><span>AMPS B: <b>{reading(telemetry?.current_b, 1)}</b></span>
          <span>Voltage C-A: <b>{reading(telemetry?.voltage_ca, 1)}</b></span><span>AMPS C: <b>{reading(telemetry?.current_c, 1)}</b></span>
          <span>Frequency: <b>{reading(telemetry?.frequency, 1)} Hz</b></span><span>kW: <b>{reading(telemetry?.active_power_kw, 1)}</b></span>
        </div>
        <div className="equipment-popup-side right">
          <Indicator active={isAts ? Boolean(atsTelemetry?.generator_available) : Boolean(generatorTelemetry?.fault_active)} tone="emergency" label={isAts ? "Emergency Power Available" : "Alarm Active"} />
          <Indicator active={isAts ? atsTelemetry?.connected_source === "GENERATOR" : false} tone="emergency" blinking={isAts && emergencyConnected} label={isAts ? "Connected to Emergency" : "Emergency Mode"} />
        </div>
      </div>
      <div className="equipment-popup-test">
        <Indicator active={Boolean(generatorTelemetry?.test_mode || atsTelemetry?.transfer_in_progress)} tone="test" label="Test Mode Active" />
      </div>
      <footer className="equipment-popup-equipment">
        <span>{isAts ? ats?.manufacturer || "ATS" : generator?.make || "Generator"}</span>
        <span>{isAts ? ats?.model || "Model pending" : generator?.model || "Model pending"}</span>
        <span>{isAts ? ats?.serial_number || "Serial pending" : generator?.serial_number || "Serial pending"}</span>
        <b>Equipment: {ratedAmps} A / {ratedVolts} V</b>
      </footer>
    </div>
  </Modal>;
}

function SingleLineDiagram({ ats, generators, atsTelemetry, generatorTelemetry, onAtsClick, onGeneratorClick }: { ats: ATS[]; generators: Generator[]; atsTelemetry?: AtsTelemetry[]; generatorTelemetry?: GeneratorTelemetry[]; onAtsClick: (id: string) => void; onGeneratorClick: (id: string) => void }) {
  return <section className="system-sld" aria-label="Single line diagram">
    <header className="system-sld-header"><div><span>Power topology</span><h3>Single Line Diagram</h3></div><div className="system-sld-legend"><i className="normal" /> Normal source <i className="emergency" /> Emergency source</div></header>
    <div className="system-sld-canvas">
      <div className="sld-sources">
        <div className="sld-source utility"><i>⚡</i><div><b>UTILITY</b><small>Normal source available</small></div></div>
        <div className="sld-generators">{generators.map((generator) => { const data = resolveGeneratorTelemetry(generatorTelemetry, generator.id, generator.name); return <button type="button" className={`sld-generator ${data?.running ? "emergency-source" : "normal-source"}`} key={generator.id} aria-label={`Open ${generator.name}`} title={`Open ${generator.name}`} onClick={() => onGeneratorClick(generator.id)}><i>G</i><em aria-hidden="true" /><span>{generator.name}</span><small>{data?.status || "Waiting"}</small></button>; })}</div>
      </div>
      <div className="sld-buses"><div className="sld-bus normal"><span>Normal bus</span></div><div className="sld-bus emergency"><span>Emergency bus</span></div></div>
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
  </section>;
}

export function SystemOperationsOverview({ systemId, systemName, ats, generators }: { systemId: string; systemName: string; ats: ATS[]; generators: Generator[] }) {
  const navigate = useNavigate();
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentSelection | null>(null);
  const [testWizardTarget, setTestWizardTarget] = useState<TestTarget | null>(null);
  const telemetry = useTelemetrySnapshot();
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
    <div className="operations-titlebar"><div><span>Live system overview</span><h2>{systemName}</h2><p>Utility, generator and transfer-switch status</p></div><button className="legacy-alert-btn">Alarms</button></div>
    <SingleLineDiagram ats={ats} generators={generators} atsTelemetry={telemetry?.ats} generatorTelemetry={telemetry?.generators} onAtsClick={(id) => setSelectedEquipment({ type: "ats", id })} onGeneratorClick={(id) => setSelectedEquipment({ type: "generator", id })} />
    <section className="operations-section generator-section">
      <div className="operations-section-title"><div><span>Emergency power</span><h3>Generators</h3></div><button onClick={openGeneratorDetail}>View details</button></div>
      <div className="operations-table-wrap">
        <table className="operations-table generator-overview-table"><thead><tr><th>Sl.</th><th>Generator</th><th>Status</th><th>Test</th><th>Oil psi</th><th>H₂O temp</th><th>Batt volts</th><th>Eng hours</th><th>VAB</th><th>VBC</th><th>VCA</th><th>Amps A</th><th>Amps B</th><th>Amps C</th><th>Hz</th><th>kW</th><th>% kW</th></tr></thead><tbody>
          {generators.map((generator, index) => { const data = resolveGeneratorTelemetry(telemetry?.generators, generator.id, generator.name); return <tr key={generator.id}><td className="serial-cell">{String(index + 1).padStart(2, "0")}</td><td className="device-name-cell">{generator.name}</td><td className={data?.status === "FAULT" ? "emergency-state" : "ready"}>{data?.status || "WAITING"}</td><td><button className="device-test-btn" onClick={() => setTestWizardTarget({ type: "generator", id: generator.id })}>Test Gen</button></td><td>{reading(data?.oil_pressure_psi, 1)}</td><td>{data ? `${reading(data.coolant_temperature_c, 1)}°C` : "—"}</td><td>{reading(data?.battery_voltage, 1)}</td><td>{reading(data?.engine_hours, 1)}</td><td>{reading(data?.voltage_ab, 1)}</td><td>{reading(data?.voltage_bc, 1)}</td><td>{reading(data?.voltage_ca, 1)}</td><td>{reading(data?.current_a, 1)}</td><td>{reading(data?.current_b, 1)}</td><td>{reading(data?.current_c, 1)}</td><td>{reading(data?.frequency, 1)}</td><td>{reading(data?.active_power_kw, 1)}</td><td>{reading(data?.load_percentage, 1)}</td></tr>; })}
          {!generators.length && <tr><td colSpan={17} className="operations-empty">No generator registered for this system.</td></tr>}
        </tbody></table>
      </div>
    </section>
    <section className="operations-section ats-section">
      <div className="operations-section-title"><div><span>Power distribution</span><h3>Automatic Transfer Switches</h3></div><button onClick={openAtsDetail}>View details</button></div>
      <div className="ats-overview-grid">{atsBanks.map((bank, bankIndex) => <div className="ats-overview-card" key={bankIndex}><table className="operations-table"><thead><tr><th>Sl.</th><th>ATS name</th><th>Status</th><th>Test</th><th>Connected to</th><th>Source available</th><th>Time to xfer</th><th>Time to bus</th></tr></thead><tbody>{bank.map((item, index) => { const serial = (bankIndex ? leftBankSize : 0) + index + 1; const data = resolveAtsTelemetry(telemetry?.ats, item.id, item.name); const emergency = data?.connected_source === "GENERATOR"; return <tr className={emergency ? "ats-emergency-demo" : ""} key={item.id}><td className="serial-cell">{String(serial).padStart(2, "0")}</td><td className="device-name-cell">{item.name}</td><td className={data?.status === "EMERGENCY" || data?.status === "FAULT" ? "emergency-state" : "ready"}>{data?.status || "WAITING"}</td><td><button className="device-test-btn" onClick={() => setTestWizardTarget({ type: "ats", id: item.id })}>Test ATS</button></td><td className={emergency ? "emergency-state" : "ready"}>{data?.connected_source || "—"}</td><td><span className={`source-light ${data?.utility_available ? "live" : ""}`} /> <span className={`source-light ${data?.generator_available ? "live emergency-source" : ""}`} /></td><td>{data?.transfer_time_seconds ?? "—"}</td><td>{data?.time_on_emergency_seconds ?? "—"}</td></tr>; })}</tbody></table></div>)}</div>
      {!ats.length && <div className="operations-empty">No ATS units registered for this system.</div>}
    </section>
    {(selectedAts || selectedGenerator) && <EquipmentFaceplate systemName={systemName} ats={selectedAts} generator={selectedGenerator} atsTelemetry={selectedAtsTelemetry} generatorTelemetry={selectedGeneratorTelemetry} onClose={() => setSelectedEquipment(null)} />}
    {testWizardTarget && <TestWizard systemName={systemName} ats={ats} generators={generators} initialTarget={testWizardTarget} onClose={() => setTestWizardTarget(null)} />}
  </div>;
}
