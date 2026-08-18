import { useNavigate } from "react-router-dom";

import type { ATS, Generator } from "../../types/entities";

function SingleLineDiagram({ ats, generators, systemStatus = "normal" }: { ats: ATS[]; generators: Generator[]; systemStatus?: "normal" | "emergency" | "alarm" | "test" | "offline" }) {
  return <section className="system-sld" aria-label="Single line diagram">
    <header className="system-sld-header"><div><span>Power topology</span><h3>Single Line Diagram</h3></div><div className="system-sld-legend"><i className="normal" /> Normal source <i className="emergency" /> Emergency source</div></header>
    <svg className="system-sld-canvas" viewBox="0 0 1200 500" preserveAspectRatio="xMidYMid meet">
      {/* Utility source on left */}
      <g className="sld-utility-group">
        <circle cx="80" cy="100" r="28" fill="#4CAF50" stroke="#2E7D32" strokeWidth="2"/>
        <text x="80" y="108" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">⚡</text>
        <text x="80" y="150" textAnchor="middle" fill="#333" fontSize="11" fontWeight="bold">UTILITY</text>
        <text x="80" y="165" textAnchor="middle" fill="#666" fontSize="9">Normal source available</text>
      </g>
      
      {/* Generators */}
      <g className="sld-generators-group">
        {generators.map((generator, index) => {
          const xPos = 200 + index * 70;
          const bgColor = index === 0 ? "#FF6B6B" : "#4CAF50";
          const strokeColor = index === 0 ? "#C92A2A" : "#2E7D32";
          return (
            <g key={generator.id}>
              <circle cx={xPos} cy="100" r="24" fill={bgColor} stroke={strokeColor} strokeWidth="2"/>
              <text x={xPos} y="112" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">G</text>
              <text x={xPos} y="150" textAnchor="middle" fill="#333" fontSize="9" fontWeight="bold">{generator.name}</text>
              <text x={xPos} y="163" textAnchor="middle" fill="#666" fontSize="8">{index === 0 ? "Standby" : "Ready"}</text>
            </g>
          );
        })}
      </g>
      
      {/* Connection line from utility to normal bus */}
      <line x1="80" y1="130" x2="80" y2="200" stroke="#2E7D32" strokeWidth="3"/>
      <line x1="80" y1="200" x2="600" y2="200" stroke="#2E7D32" strokeWidth="3"/>
      
      {/* Connection line from generators to normal bus */}
      {generators.map((generator, index) => {
        const xPos = 200 + index * 70;
        return (
          <line key={`gen-line-${generator.id}`} x1={xPos} y1="130" x2={xPos} y2="200" stroke={index === 0 ? "#D32F2F" : "#2E7D32"} strokeWidth="2"/>
        );
      })}
      
      {/* Normal bus (green horizontal line) */}
      <line x1="50" y1="200" x2="750" y2="200" stroke="#2E7D32" strokeWidth="4"/>
      <text x="620" y="190" fill="#2E7D32" fontSize="10" fontWeight="bold">NORMAL BUS</text>
      
      {/* Emergency bus (red horizontal line) */}
      <line x1="50" y1="320" x2="750" y2="320" stroke="#D32F2F" strokeWidth="4"/>
      <text x="620" y="310" fill="#D32F2F" fontSize="10" fontWeight="bold">EMERGENCY BUS</text>
      
      {/* ATS Switches with connections */}
      {ats.map((item, index) => {
        const xPos = 100 + index * 120;
        const onEmergency = index >= 2;
        const busY = onEmergency ? 320 : 200;
        const boxSize = 50;
        
        return (
          <g key={item.id}>
            {/* Connection lines from bus to ATS */}
            <line x1={xPos} y1="200" x2={xPos} y2={onEmergency ? 240 : 230} stroke={onEmergency ? "#999" : "#2E7D32"} strokeWidth="1" strokeDasharray={onEmergency ? "4,4" : "0"}/>
            <line x1={xPos} y1={onEmergency ? 240 : 230} x2={xPos} y2={busY - 40} stroke={onEmergency ? "#D32F2F" : "#2E7D32"} strokeWidth="2"/>
            
            {/* Connection line from ATS back to bus */}
            <line x1={xPos} y1={busY + 40} x2={xPos} y2={busY} stroke={onEmergency ? "#D32F2F" : "#2E7D32"} strokeWidth="2"/>
            
            {/* ATS Switch Box */}
            <rect x={xPos - boxSize/2} y={busY - boxSize/2} width={boxSize} height={boxSize} fill="white" stroke={onEmergency ? "#D32F2F" : "#2E7D32"} strokeWidth="2" rx="4"/>
            
            {/* N and E terminals in corners */}
            <circle cx={xPos - boxSize/2 + 10} cy={busY - boxSize/2 + 10} r="8" fill="#4CAF50" stroke="#2E7D32" strokeWidth="1"/>
            <text x={xPos - boxSize/2 + 10} y={busY - boxSize/2 + 15} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">N</text>
            
            <circle cx={xPos + boxSize/2 - 10} cy={busY - boxSize/2 + 10} r="8" fill="#D32F2F" stroke="#C92A2A" strokeWidth="1"/>
            <text x={xPos + boxSize/2 - 10} y={busY - boxSize/2 + 15} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">E</text>
            
            {/* Switch arm */}
            <circle cx={xPos} cy={busY} r="6" fill="#666"/>
            
            {/* Label */}
            <text x={xPos} y={busY + 50} textAnchor="middle" fill="#333" fontSize="9" fontWeight="bold">{item.name}</text>
            <text x={xPos} y={busY + 65} textAnchor="middle" fill={onEmergency ? "#D32F2F" : "#2E7D32"} fontSize="8">
              {onEmergency ? "Connected to emergency" : "Connected to normal"}
            </text>
          </g>
        );
      })}
    </svg>
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
