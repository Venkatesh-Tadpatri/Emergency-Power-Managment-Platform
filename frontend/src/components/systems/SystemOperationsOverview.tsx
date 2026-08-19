import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Modal } from "../common/Modal";
import { TestWizard } from "./TestWizard";
import type { ATS, Generator } from "../../types/entities";

type EquipmentSelection = { type: "ats"; id: string } | { type: "generator"; id: string };
type TestTarget = EquipmentSelection;

const branchLabel = (branch?: string | null) => branch === "life-safety" ? "Life Safety" : branch === "critical" ? "Critical" : "Equipment";
const unavailableReading = "00";

function Indicator({ active, label, tone = "normal", blinking = false }: { active: boolean; label: string; tone?: "normal" | "emergency" | "test"; blinking?: boolean }) {
  return <span className={`equipment-popup-indicator ${active ? "active" : ""} ${tone} ${blinking && active ? "blinking" : ""}`}><i />{label}</span>;
}

function EquipmentFaceplate({ systemName, ats, generator, emergencyActive = false, onClose }: { systemName: string; ats?: ATS; generator?: Generator; emergencyActive?: boolean; onClose: () => void }) {
  const isAts = Boolean(ats);
  const name = ats?.name || generator?.name || "Equipment";
  const ratedVolts = ats?.rated_volts ?? generator?.rated_volts ?? 415;
  const ratedAmps = ats?.rated_amps ?? generator?.rated_amps ?? "—";
  const branch = branchLabel(ats?.branch);
  const emergencyConnected = isAts && emergencyActive;

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
          <Indicator active={isAts ? !emergencyActive : true} label={isAts ? "Normal Power Available" : "Generator Ready"} />
          <Indicator active={isAts ? !emergencyActive : false} label={isAts ? "Connected to Normal" : "Running"} />
        </div>
        <div className="equipment-power-table">
          <div className="equipment-power-title">{isAts ? "Load Power Data" : "Generator Power Data"}</div>
          <span>Voltage A-B: <b>{unavailableReading}</b></span><span>AMPS A: <b>{unavailableReading}</b></span>
          <span>Voltage B-C: <b>{unavailableReading}</b></span><span>AMPS B: <b>{unavailableReading}</b></span>
          <span>Voltage C-A: <b>{unavailableReading}</b></span><span>AMPS C: <b>{unavailableReading}</b></span>
          <span>Frequency: <b>{unavailableReading} Hz</b></span><span>kW: <b>{unavailableReading}</b></span>
        </div>
        <div className="equipment-popup-side right">
          <Indicator active={isAts} tone="emergency" label={isAts ? "Emergency Power Available" : "Alarm Active"} />
          <Indicator active={isAts ? emergencyActive : false} tone="emergency" blinking={isAts && emergencyActive} label={isAts ? "Connected to Emergency" : "Emergency Mode"} />
        </div>
      </div>
      <div className="equipment-popup-test">
        <Indicator active={false} tone="test" label="Test Mode Active" />
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

function SingleLineDiagram({ ats, generators, onAtsClick, onGeneratorClick }: { ats: ATS[]; generators: Generator[]; onAtsClick: (id: string) => void; onGeneratorClick: (id: string) => void }) {
  return <section className="system-sld" aria-label="Single line diagram">
    <header className="system-sld-header"><div><span>Power topology</span><h3>Single Line Diagram</h3></div><div className="system-sld-legend"><i className="normal" /> Normal source <i className="emergency" /> Emergency source</div></header>
    <div className="system-sld-canvas">
      <div className="sld-sources">
        <div className="sld-source utility"><i>⚡</i><div><b>UTILITY</b><small>Normal source available</small></div></div>
        <div className="sld-generators">{generators.map((generator, index) => <button type="button" className={`sld-generator ${index < 2 ? "emergency-source" : "normal-source"}`} key={generator.id} aria-label={`Open ${generator.name}`} title={`Open ${generator.name}`} onClick={() => onGeneratorClick(generator.id)}><i>G</i><em aria-hidden="true" /><span>{generator.name}</span><small>{index === 0 ? "Standby" : "Ready"}</small></button>)}</div>
      </div>
      <div className="sld-buses"><div className="sld-bus normal"><span>Normal bus</span></div><div className="sld-bus emergency"><span>Emergency bus</span></div></div>
      <div className="sld-ats-grid">{ats.map((item, index) => {
        const onEmergency = index >= 2;
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
  const selectedAtsIndex = selectedAts ? ats.findIndex((item) => item.id === selectedAts.id) : -1;
  const selectedAtsEmergency = selectedAtsIndex >= 2;
  // Keep the overview in two panels while ensuring every ATS is displayed.
  // For five ATS this renders 3 on the left and 2 on the right, without a
  // redundant third table header for the final unit.
  const leftBankSize = Math.ceil(ats.length / 2);
  const atsBanks = ats.length ? [ats.slice(0, leftBankSize), ats.slice(leftBankSize)].filter((bank) => bank.length) : [];

  return <div className="operations-overview">
    <div className="operations-titlebar"><div><span>Live system overview</span><h2>{systemName}</h2><p>Utility, generator and transfer-switch status</p></div><button className="legacy-alert-btn">Alarms</button></div>
    <SingleLineDiagram ats={ats} generators={generators} onAtsClick={(id) => setSelectedEquipment({ type: "ats", id })} onGeneratorClick={(id) => setSelectedEquipment({ type: "generator", id })} />
    <section className="operations-section generator-section">
      <div className="operations-section-title"><div><span>Emergency power</span><h3>Generators</h3></div><button onClick={openGeneratorDetail}>View details</button></div>
      <div className="operations-table-wrap">
        <table className="operations-table generator-overview-table"><thead><tr><th>Sl.</th><th>Generator</th><th>Status</th><th>Test</th><th>Oil psi</th><th>H₂O temp</th><th>Batt volts</th><th>Eng hours</th><th>VAB</th><th>VBC</th><th>VCA</th><th>Amps A</th><th>Amps B</th><th>Amps C</th><th>Hz</th><th>kW</th><th>% kW</th></tr></thead><tbody>
          {generators.map((generator, index) => <tr key={generator.id}><td className="serial-cell">{String(index + 1).padStart(2, "0")}</td><td className="device-name-cell">{generator.name}</td><td className="ready">READY</td><td><button className="device-test-btn" onClick={() => setTestWizardTarget({ type: "generator", id: generator.id })}>Test Gen</button></td><td>0</td><td>—</td><td>0</td><td>000.0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>00.0</td></tr>)}
          {!generators.length && <tr><td colSpan={17} className="operations-empty">No generator registered for this system.</td></tr>}
        </tbody></table>
      </div>
    </section>
    <section className="operations-section ats-section">
      <div className="operations-section-title"><div><span>Power distribution</span><h3>Automatic Transfer Switches</h3></div><button onClick={openAtsDetail}>View details</button></div>
      <div className="ats-overview-grid">{atsBanks.map((bank, bankIndex) => <div className="ats-overview-card" key={bankIndex}><table className="operations-table"><thead><tr><th>Sl.</th><th>ATS name</th><th>Status</th><th>Test</th><th>Connected to</th><th>Source available</th><th>Time to xfer</th><th>Time to bus</th></tr></thead><tbody>{bank.map((item, index) => { const serial = (bankIndex ? leftBankSize : 0) + index + 1; const emergencyDemo = serial >= 3; return <tr className={emergencyDemo ? "ats-emergency-demo" : ""} key={item.id}><td className="serial-cell">{String(serial).padStart(2, "0")}</td><td className="device-name-cell">{item.name}</td><td className="ready">READY</td><td><button className="device-test-btn" onClick={() => setTestWizardTarget({ type: "ats", id: item.id })}>Test ATS</button></td><td className={emergencyDemo ? "emergency-state" : "ready"}>{emergencyDemo ? "EMERGENCY" : "NORMAL"}</td><td><span className={`source-light ${emergencyDemo ? "" : "live"}`} /> <span className={`source-light ${emergencyDemo ? "live emergency-source" : ""}`} /></td><td>{emergencyDemo ? "10" : "300"}</td><td>{emergencyDemo ? "3" : "0"}</td></tr>; })}</tbody></table></div>)}</div>
      {!ats.length && <div className="operations-empty">No ATS units registered for this system.</div>}
    </section>
    {(selectedAts || selectedGenerator) && <EquipmentFaceplate systemName={systemName} ats={selectedAts} generator={selectedGenerator} emergencyActive={selectedAtsEmergency} onClose={() => setSelectedEquipment(null)} />}
    {testWizardTarget && <TestWizard systemName={systemName} ats={ats} generators={generators} initialTarget={testWizardTarget} onClose={() => setTestWizardTarget(null)} />}
  </div>;
}
