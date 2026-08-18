import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import { IconATS, IconGenerator, IconMeter } from "../common/Icons";
import type { ATS, Generator } from "../../types/entities";

type Scenario = "normal" | "emergency" | "test";

const BRANCH_TAG: Record<string, string> = { "life-safety": "LS", critical: "CR", equipment: "EQ" };
const SCENARIO_LABEL: Record<Scenario, string> = { normal: "NORMAL", emergency: "EMERGENCY", test: "TEST" };

function Reading({ label, unit = "V" }: { label: string; unit?: string }) {
  return <div className="telemetry-reading"><span>{label}</span><b>000</b><em>{unit}</em></div>;
}

export function OneLineDiagram({ ats, generators, utilityName, systemId }: { ats: ATS[]; generators: Generator[]; utilityName?: string; systemId?: string }) {
  const navigate = useNavigate();
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [viewMode, setViewMode] = useState<"simple" | "detail">("simple");
  const shownAts = ats.length ? ats : [];
  const shownGenerators = generators.length ? generators : [];
  const utilityStatus = scenario === "emergency" ? "LOSS OF POWER" : scenario === "test" ? "AVAILABLE (BYPASSED)" : "AVAILABLE";
  const generatorStatus = scenario === "normal" ? "STANDBY" : "RUNNING";
  const eventName = scenario === "emergency" ? "POWER OUTAGE" : "SCHEDULED TEST";

  return (
    <div className={`sys-diagram telemetry-diagram scenario-${scenario}`}>
      <div className="diagram-controls">
        <div className="scenario-nav">
          {(["normal", "emergency", "test"] as Scenario[]).map((item) => <button key={item} className={`sc-btn${scenario === item ? ` active-${item[0]}` : ""}`} onClick={() => setScenario(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
        </div>
        <div className="view-toggle">
          <button className={`vt-btn${viewMode === "simple" ? " active" : ""}`} onClick={() => setViewMode("simple")}>Simple</button>
          <button className={`vt-btn${viewMode === "detail" ? " active" : ""}`} onClick={() => setViewMode("detail")}>Detail</button>
        </div>
      </div>

      {scenario !== "normal" && <div className={`emergency-event-summary ${scenario}-event-summary`}>
        <div className="event-card current-event"><i>◷</i><p><span>{scenario === "test" ? "Current Test" : "Current Event"}</span><b>{eventName}</b><small>{scenario === "test" ? "Test Mode" : "Active Event"}</small></p></div>
        <div className="event-card"><i>◷</i><p><span>Duration</span><b>00<span className="event-colon">:</span>00</b><small>HH:MM</small></p></div>
        <div className="event-card"><i>⌁</i><p><span>Step</span><b>{shownAts.length} / {shownAts.length}</b><small>In Progress</small></p></div>
        <div className="event-card generator-event"><i>♧</i><p><span>Generator</span><b>{shownGenerators[0]?.name || "GENERATOR"}<span className="generator-status-separator">Running</span></b><small>Running</small></p></div>
      </div>}

      <div className="telemetry-layout">
        <section className={`telemetry-source utility-source${scenario === "normal" ? " normal-active" : ""}`}>
          <h4><IconMeter size={13} /> Utility Power</h4>
          <p>{utilityName || "Utility"} — Normal Source</p>
          <div className="telemetry-readings"><Reading label="V A-B" /><Reading label="V B-C" /><Reading label="V C-A" /><Reading label="Freq" unit="Hz" /></div>
          <strong className={`source-state ${scenario === "emergency" ? "loss" : scenario === "test" ? "bypassed" : ""}`}>{utilityStatus}</strong>
        </section>

        <section className={`telemetry-schematic scenario-${scenario}`} aria-label="Power source schematic">
          <div className="bus-label normal-bus"><span>⚡</span> Normal Bus</div>
          <div className="bus-label emergency-bus"><span>⚡</span> Emergency Bus</div>
          <div className="ats-flow-list">
            {shownAts.map((item, index) => {
              const branch = item.branch || "equipment";
              return <button className="ats-flow detail-link" key={item.id} onClick={() => systemId && navigate(`/systems/${systemId}/ats`)}>
                <i className="flow-node" />
                <div className="flow-line left" />
                <div className="flow-unit"><span className={`branch-tag ${branch}`}>{BRANCH_TAG[branch] || "EQ"}</span><b>{item.name}</b><small>{SCENARIO_LABEL[scenario]}</small></div>
                <div className="flow-line right" />
              </button>;
            })}
            {!shownAts.length && <div className="telemetry-empty">No ATS units registered</div>}
          </div>
        </section>

        <button className={`telemetry-source generator-source detail-link${scenario === "emergency" ? " emergency-active" : scenario === "test" ? " test-active" : ""}`} onClick={() => systemId && shownGenerators[0] && navigate(`/systems/${systemId}/generators`)}>
          <h4><IconGenerator size={14} /> {shownGenerators.length > 1 ? `Generators (${shownGenerators.length})` : "Generator"}</h4>
          <p>{shownGenerators[0]?.make || "Generator set"} — Standby Source</p>
          <div className="telemetry-readings"><Reading label="V A-B" /><Reading label="V B-C" /><Reading label="Eng Temp" unit="°F" /><Reading label="Hours" unit="hr" /></div>
          {scenario !== "normal" && <div className="generator-emergency-metrics">
            <div className="generator-load"><span>Load</span><b>000 kW</b><em>00%</em><i><u /></i></div>
            <div className="fuel-forecast"><span>Fuel Forecast</span><b>000h 00m</b><em>@ 000 kW · 00% tank</em><i><u /></i></div>
          </div>}
          <strong className={`source-state ${scenario === "normal" ? "standby" : "running"}`}>{generatorStatus}</strong>
        </button>
      </div>

      <div className={`telemetry-ats-row ${viewMode}`}>
        {shownAts.map((item) => {
          const branch = item.branch || "equipment";
          return <button className={`telemetry-ats detail-link ${viewMode === "simple" ? "compact" : "detailed"}`} key={item.id} onClick={() => systemId && navigate(`/systems/${systemId}/ats`)} style={{ "--ats-accent": branch === "life-safety" ? "#ef4444" : branch === "critical" ? "#f59e0b" : "#3b82f6" } as CSSProperties}>
            <div><span className={`branch-tag ${branch}`}>{BRANCH_TAG[branch] || "EQ"}</span><b>{item.name}</b></div>
            <em>{SCENARIO_LABEL[scenario]}</em>
            {viewMode === "simple" ? <span className="ats-simple-reading">000 kW · 000 A · 000 V</span> : <><div className="ats-metric-grid"><span><small>Load</small><b>000 kW</b></span><span><small>Current</small><b>000 A</b></span><span><small>Voltage</small><b>000 V</b></span><span><small>Power Factor</small><b>0.00</b></span></div><div className="ats-load-strip"><i><u /></i><span>Load</span><b>000%</b></div></>}
          </button>;
        })}
      </div>

      <div className="telemetry-loads">
        {shownAts.map((item, index) => <div className="telemetry-load" key={item.id}><b>{item.branch === "life-safety" ? "Life Safety" : item.branch === "critical" ? "Critical" : `Equipment ${index + 1}`}</b><span>{item.name}</span><strong>000 kW</strong></div>)}
      </div>
      <div className="telemetry-summary"><span>Total Load <b>000 kW</b></span><span>Capacity <b>000 kW</b></span><span>Headroom <b>000 kW</b></span></div>
    </div>
  );
}
