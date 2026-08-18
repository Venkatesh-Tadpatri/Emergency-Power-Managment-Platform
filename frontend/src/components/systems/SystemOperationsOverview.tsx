import { useNavigate } from "react-router-dom";

import type { ATS, Generator } from "../../types/entities";

function SingleLineDiagram({ ats, generators, systemStatus = "normal" }: { ats: ATS[]; generators: Generator[]; systemStatus?: "normal" | "emergency" | "alarm" | "test" | "offline" }) {
  return <section className="system-sld" aria-label="Single line diagram">
    <header className="system-sld-header"><div><span>Power topology</span><h3>Single Line Diagram</h3></div><div className="system-sld-legend"><i className="normal" /> Normal source <i className="emergency" /> Emergency source</div></header>
    <div className="system-sld-canvas">
      <div className="sld-sources">
        <div className="sld-source utility"><i>⚡</i><div><b>UTILITY</b><small>Normal source available</small></div></div>
        <div className="sld-generators">{generators.map((generator, index) => <div className="sld-generator" key={generator.id}><i>G</i><span>{generator.name}</span><small>{index === 0 ? "Standby" : "Ready"}</small></div>)}</div>
      </div>
      <div className="sld-buses"><div className="sld-bus normal"><span>Normal bus</span></div><div className="sld-bus emergency"><span>Emergency bus</span></div></div>
      <div className="sld-ats-grid">{ats.map((item, index) => {
        const onEmergency = index >= 2;
        return <div className={`sld-ats ${onEmergency ? "on-emergency" : "on-normal"}`} key={item.id}>
          <div className="sld-switch"><span className="sld-terminal normal-terminal">N</span><span className="sld-terminal emergency-terminal">E</span><i className="sld-arm" /></div><b>{item.name}</b><small>{onEmergency ? "Connected to emergency" : "Connected to normal"}</small>
        </div>;
      })}</div>
      {!ats.length && <p className="operations-empty">No ATS units registered for this system.</p>}
    </div>
  </section>;
}

export function SystemOperationsOverview({ systemId, systemName, ats, generators }: { systemId: string; systemName: string; ats: ATS[]; generators: Generator[] }) {
  const navigate = useNavigate();
  const openGeneratorDetail = () => navigate(`/systems/${systemId}/generators`);
  // Keep the overview in two panels while ensuring every ATS is displayed.
  // For five ATS this renders 3 on the left and 2 on the right, without a
  // redundant third table header for the final unit.
  const leftBankSize = Math.ceil(ats.length / 2);
  const atsBanks = ats.length ? [ats.slice(0, leftBankSize), ats.slice(leftBankSize)].filter((bank) => bank.length) : [];

  return <div className="operations-overview">
    <div className="operations-titlebar"><div><span>Live system overview</span><h2>{systemName}</h2><p>Utility, generator and transfer-switch status</p></div><button className="legacy-alert-btn">Alarms</button></div>
    <SingleLineDiagram ats={ats} generators={generators} />
    <section className="operations-section generator-section">
      <div className="operations-section-title"><div><span>Emergency power</span><h3>Generators</h3></div><button onClick={openGeneratorDetail}>View details</button></div>
      <div className="operations-table-wrap">
        <table className="operations-table generator-overview-table"><thead><tr><th>Sl.</th><th>Generator</th><th>Status</th><th>Test</th><th>Oil psi</th><th>H₂O temp</th><th>Batt volts</th><th>Eng hours</th><th>VAB</th><th>VBC</th><th>VCA</th><th>Amps A</th><th>Amps B</th><th>Amps C</th><th>Hz</th><th>kW</th><th>% kW</th></tr></thead><tbody>
          {generators.map((generator, index) => <tr key={generator.id}><td className="serial-cell">{String(index + 1).padStart(2, "0")}</td><td className="device-name-cell">{generator.name}</td><td className="ready">READY</td><td><button className="device-test-btn" onClick={openGeneratorDetail}>Test Gen</button></td><td>0</td><td>—</td><td>0</td><td>000.0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>00.0</td></tr>)}
          {!generators.length && <tr><td colSpan={17} className="operations-empty">No generator registered for this system.</td></tr>}
        </tbody></table>
      </div>
    </section>
    <section className="operations-section ats-section">
      <div className="operations-section-title"><div><span>Power distribution</span><h3>Automatic Transfer Switches</h3></div><button onClick={() => navigate(`/systems/${systemId}/ats`)}>View details</button></div>
      <div className="ats-overview-grid">{atsBanks.map((bank, bankIndex) => <div className="ats-overview-card" key={bankIndex}><table className="operations-table"><thead><tr><th>Sl.</th><th>ATS name</th><th>Status</th><th>Test</th><th>Connected to</th><th>Source available</th><th>Time to xfer</th><th>Time to bus</th></tr></thead><tbody>{bank.map((item, index) => { const serial = (bankIndex ? leftBankSize : 0) + index + 1; const emergencyDemo = serial >= 3; return <tr className={emergencyDemo ? "ats-emergency-demo" : ""} key={item.id}><td className="serial-cell">{String(serial).padStart(2, "0")}</td><td className="device-name-cell">{item.name}</td><td className="ready">READY</td><td><button className="device-test-btn" onClick={() => navigate(`/systems/${systemId}/ats`)}>Test ATS</button></td><td className={emergencyDemo ? "emergency-state" : "ready"}>{emergencyDemo ? "EMERGENCY" : "NORMAL"}</td><td><span className={`source-light ${emergencyDemo ? "" : "live"}`} /> <span className={`source-light ${emergencyDemo ? "live emergency-source" : ""}`} /></td><td>{emergencyDemo ? "10" : "300"}</td><td>{emergencyDemo ? "3" : "0"}</td></tr>; })}</tbody></table></div>)}</div>
      {!ats.length && <div className="operations-empty">No ATS units registered for this system.</div>}
    </section>
  </div>;
}
