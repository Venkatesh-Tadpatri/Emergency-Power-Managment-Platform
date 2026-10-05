import { useNavigate, useParams } from "react-router-dom";

import { IconATS, IconGenerator } from "../../components/common/Icons";
import { StatusPill } from "../../components/common/StatusPill";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAts, useGenerators, usePanels, useSystem } from "../../queries/systems";
import { telemetryFor, useTelemetrySnapshot } from "../../hooks/useTelemetry";

const LiveReading = ({ label, value = "000", unit }: { label: string; value?: string | number; unit?: string }) => (
  <div className="device-reading"><span>{label}</span><b>{value}</b>{unit && <em>{unit}</em>}</div>
);

function DetailShell({ title, type, children }: { title: string; type: "ats" | "generator"; children: React.ReactNode }) {
  const navigate = useNavigate();
  const { systemId } = useParams();
  const { data: system } = useSystem(systemId);
  usePageHeader(system?.name || "System");

  return <div className="legacy-detail-page">
    <div className="legacy-crumb"><button onClick={() => navigate(`/systems/${systemId}`)}>Overview</button><span>›</span><b>{type === "ats" ? "ATS detail" : "Generator detail"}</b></div>
    <header className="legacy-detail-heading"><h1>{system?.name || "System"} · {title}</h1></header>
    <div className="legacy-rule" />
    <nav className="legacy-detail-nav" aria-label="System detail navigation"><button onClick={() => navigate(`/systems/${systemId}`)}>Overview</button><button className="active" onClick={() => navigate(`/systems/${systemId}/${type === "generator" ? "ats" : "generators"}`)}>{type === "generator" ? "ATS" : "Generator"}</button><button className="alarm" onClick={() => navigate("/alarms")}>Alarms</button></nav>
    {children}
  </div>;
}

export function GeneratorDetail() {
  const { systemId, generatorId } = useParams();
  const { data: panels } = usePanels(systemId);
  const { data: generators } = useGenerators(panels?.[0]?.id);
  const telemetry = useTelemetrySnapshot(systemId);
  return <DetailShell title="Generator Detail View" type="generator">
    <h2 className="legacy-device-section-heading">Generator Detail</h2>
    <section className="generator-detail-grid">{(generators || []).filter((generator) => !generatorId || generator.id === generatorId).map((generator) => { const capacity = generator.rated_kw ?? 0; const data = telemetryFor(telemetry?.generators, generator.id, generator.name); return <article className="generator-monitor-card" key={generator.id}>
      <h3 className="generator-card-name">{generator.name}</h3>
      <div className="device-card-title"><span>Generator control panel</span><b>{[generator.make, generator.model].filter(Boolean).join(" · ") || "Generator set"}</b></div>
      <div className="generator-status-row"><strong>{data?.status || "WAITING"}</strong><span>{generator.serial_number ? `S/N ${generator.serial_number}` : "Telemetry pending"}</span></div>
      <div className="generator-reading-grid">
        <LiveReading label="VAB" value={data?.voltage_ab?.toFixed(1)} unit="V" /><LiveReading label="VBC" value={data?.voltage_bc?.toFixed(1)} unit="V" /><LiveReading label="VCA" value={data?.voltage_ca?.toFixed(1)} unit="V" />
        <LiveReading label="AMPS A" value={data?.current_a?.toFixed(1)} unit="A" /><LiveReading label="AMPS B" value={data?.current_b?.toFixed(1)} unit="A" /><LiveReading label="AMPS C" value={data?.current_c?.toFixed(1)} unit="A" />
        <LiveReading label="Oil pressure" value={data?.oil_pressure_psi?.toFixed(1)} unit="psi" /><LiveReading label="Engine temp" value={data?.coolant_temperature_c?.toFixed(1)} unit="°C" /><LiveReading label="Engine hours" value={data?.engine_hours?.toFixed(1)} unit="hr" />
      </div>
      <div className="generator-load-panel"><div><span>Power factor</span><b>{data?.power_factor?.toFixed(2) || "0.00"}</b></div><div><span>Current load</span><b>{data ? `${data.active_power_kw.toFixed(1)} kW · ${data.load_percentage.toFixed(1)}%` : "000 kW · 00%"}</b></div><div className="device-load-track"><i style={{ width: `${data?.load_percentage || 0}%` }} /></div></div>
      <footer><span>Rated capacity <b>{capacity} kW</b></span><span>Rated current <b>{generator.rated_amps ?? "—"} A</b></span><span>Rated voltage <b>{generator.rated_volts ?? "—"} V</b></span></footer>
    </article>; })}</section>
    {!generators?.length && <p className="operations-empty">No generators are registered for this system.</p>}
  </DetailShell>;
}

export function AtsDetail() {
  const { systemId, atsId } = useParams();
  const { data: system } = useSystem(systemId);
  const { data: panels } = usePanels(systemId);
  const { data: atsData } = useAts(panels?.[0]?.id);
  const telemetry = useTelemetrySnapshot(systemId);
  const ats = atsId ? (atsData || []).filter((item) => item.id === atsId) : atsData;
  const emergency = telemetry?.ats.some((item) => item.connected_source === "GENERATOR") || system?.status === "emergency" || system?.status === "alarm";
  const stateLabel = emergency ? "Utility power failed — on emergency" : "Utility power normal — on utility";
  return <DetailShell title="Detailed ATS View" type="ats">
    <h2 className="legacy-device-section-heading">ATS Detail</h2>
    <div className={`ats-operating-banner ${emergency ? "emergency" : "utility"}`}><i />{stateLabel}</div>
    <section className="legacy-ats-grid">{(ats || []).map((item) => { const data = telemetryFor(telemetry?.ats, item.id, item.name); const onEmergency = data?.connected_source === "GENERATOR"; const readings = [["VAB", data?.voltage_ab], ["VBC", data?.voltage_bc], ["VCA", data?.voltage_ca], ["Hz", data?.frequency], ["Amps A", data?.current_a], ["Amps B", data?.current_b], ["Amps C", data?.current_c], ["kW", data?.active_power_kw]] as const; return <div className={`legacy-ats-card ${onEmergency ? "on-emergency emergency-demo" : "on-utility"}`} key={item.id}><h3>{item.name}</h3><div className="ats-position"><div className="ats-switch"><span className="ats-normal">N</span><span className="ats-emergency">E</span><i /></div><div className="ats-position-labels"><span className={!onEmergency ? "active" : ""}><b>N</b> Utility</span><span className={onEmergency ? "active" : ""}><b>E</b> Emergency</span></div><div className="ats-device-meta"><b>{item.manufacturer || "ATS"}</b><span>{item.model || "Model pending"}</span><span>{item.serial_number || "Serial pending"}</span></div></div><div className="legacy-ats-readings">{readings.map(([label, value]) => <LiveReading key={label} label={label} value={value?.toFixed(1)} />)}</div><footer><b>{item.branch === "life-safety" ? "Life safety" : item.branch === "critical" ? "Critical" : "Equipment"}</b><span>{item.rated_amps ?? "—"} A · {item.rated_volts ?? "—"} V</span></footer></div>; })}</section>
  </DetailShell>;
}
