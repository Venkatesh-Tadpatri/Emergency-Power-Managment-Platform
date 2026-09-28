import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { usePageHeader } from "../../components/layout/HeaderContext";
import { StatusPill } from "../../components/common/StatusPill";
import { useCompany } from "../../queries/companies";
import { useCompanyAtsRoster } from "../../queries/compliance";
import { useReports } from "../../queries/reports";
import { useSystems } from "../../queries/systems";

const TYPE_STATUS = { "gen-run": "alarm", "ats-emergency": "emergency", test: "test" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TABS = [
  { key: "calendar", label: "Calendar" },
  { key: "list", label: "All Reports" },
  { key: "initiating", label: "Initiating ATS Report" },
  { key: "time-to-buss", label: "Time to Re-Xfer Report" },
  { key: "compliance", label: "ATS Compliance" },
];
// No dedicated "load served" field exists on an ATS today — approximated from its branch, same
// categories the demo seed data itself groups ATS units into (see BRANCHES in demo_fixtures.py).
const BRANCH_LOAD_LABEL = { "life-safety": "Exit Lighting", critical: "ICU / OR Suites", equipment: "Mechanical / Elevator" };
const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const displayDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const eventTypeLabel = (r) => (r.type === "gen-run" ? "Generator Run" : r.event_type || (r.type === "test" ? "Test" : "Emergency"));

export function CompanyReports() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { data: company } = useCompany(companyId);
  const { data: reports } = useReports({ companyId });
  const { data: systems } = useSystems(companyId);
  const [tab, setTab] = useState("calendar");
  usePageHeader("Reports", [{ label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) }]);
  const systemName = (id) => systems?.find((s) => s.id === id)?.name || id;

  return (
    <>
      <div className="report-tab-bar">
        {TABS.map((t) => (
          <button key={t.key} className={`report-tab-btn${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === "calendar" && <CalendarTab reports={reports || []} systemName={systemName} companyId={companyId} navigate={navigate} />}
      {tab === "list" && (
        <table className="data-table">
          <thead><tr><th>Date</th><th>Type</th><th>System</th><th>Initiating ATS</th><th>Duration</th><th>Peak kW</th><th>Avg kW</th><th /></tr></thead>
          <tbody>
            {(reports || []).map((r) => (
              <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/companies/${companyId}/reports/${r.id}`)}>
                <td className="mono">{r.report_date} {r.time_label}</td>
                <td><StatusPill status={TYPE_STATUS[r.type] || "normal"} label={r.type} /></td>
                <td style={{ fontWeight: 600 }}>{systemName(r.system_id)}</td>
                <td className="mono">{r.initiating_ats || "—"}</td>
                <td className="mono">{r.duration_label}</td>
                <td className="mono">{r.peak_kw ?? "—"} kW</td>
                <td className="mono">{r.avg_kw ?? "—"} kW</td>
                <td style={{ color: "var(--blue)" }}>View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === "initiating" && <InitiatingAtsReportTab reports={reports || []} systemName={systemName} />}
      {tab === "time-to-buss" && <TimeToBussReportTab reports={reports || []} systemName={systemName} />}
      {tab === "compliance" && <ComplianceTab companyId={companyId} reports={reports || []} />}
    </>
  );
}

/** ─── Calendar: month grid with a colored dot per report, a type filter row, and a click-through
 * side panel for the selected day's reports — matches the "Reporting Calendar" reference design. ─── */
function CalendarTab({ reports, systemName, companyId, navigate }) {
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [filterType, setFilterType] = useState("all");
  const todayIso = fmtDate(now);
  const [selectedDate, setSelectedDate] = useState(todayIso);

  const calendarDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    const last = new Date(calYear, calMonth + 1, 0);
    let dow = first.getDay();
    dow = dow === 0 ? 6 : dow - 1;
    const days = [];
    for (let p = dow - 1; p >= 0; p--) days.push({ date: new Date(calYear, calMonth, -p), outside: true });
    for (let d = 1; d <= last.getDate(); d++) days.push({ date: new Date(calYear, calMonth, d), outside: false });
    while (days.length % 7 !== 0) {
      const nextIdx = days.length - last.getDate() - dow + 1;
      days.push({ date: new Date(calYear, calMonth + 1, nextIdx), outside: true });
    }
    return days;
  }, [calMonth, calYear]);

  const filtered = useMemo(() => (filterType === "all" ? reports : reports.filter((r) => r.type === filterType)), [reports, filterType]);
  const reportsByDate = useMemo(() => {
    const map = {};
    filtered.forEach((r) => { (map[r.report_date] || (map[r.report_date] = [])).push(r); });
    return map;
  }, [filtered]);
  const selectedReports = reportsByDate[selectedDate] || [];

  return (
    <div className="cal-layout">
      <div className="cal-main">
        <div className="cal-toolbar">
          <div className="cal-nav">
            <button className="cal-nav-btn" onClick={() => (calMonth === 0 ? (setCalMonth(11), setCalYear((y) => y - 1)) : setCalMonth((m) => m - 1))}>‹</button>
            <span className="cal-nav-title">{MONTHS[calMonth]} {calYear}</span>
            <button className="cal-nav-btn" onClick={() => (calMonth === 11 ? (setCalMonth(0), setCalYear((y) => y + 1)) : setCalMonth((m) => m + 1))}>›</button>
            <button className="cal-today-btn" onClick={() => { setCalMonth(now.getMonth()); setCalYear(now.getFullYear()); setSelectedDate(todayIso); }}>Today</button>
          </div>
          <div className="cal-filter-row">
            {[{ key: "all", label: "All Reports" }, { key: "gen-run", label: "Generator Runs" }, { key: "test", label: "ATS Test" }, { key: "ats-emergency", label: "ATS Emergency" }].map((f) => (
              <button key={f.key} className={`cal-filter-chip ${f.key}${filterType === f.key ? " active" : ""}`} onClick={() => setFilterType(f.key)}>
                <span className="cal-filter-dot" />{f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="cal-grid">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div className="cal-dow" key={d}>{d}</div>)}
          {calendarDays.map(({ date, outside }, i) => {
            const key = fmtDate(date);
            const dayReports = reportsByDate[key] || [];
            const visible = dayReports.slice(0, 3);
            const extra = dayReports.length - visible.length;
            return (
              <div
                key={i}
                className={`cal-cell ${outside ? "outside " : ""}${key === todayIso ? "today " : ""}${key === selectedDate ? "selected " : ""}${dayReports.length ? "has-events" : ""}`}
                onClick={() => setSelectedDate(key)}
              >
                <span className="cal-day-num">{date.getDate()}</span>
                {visible.map((r) => (
                  <div className={`cal-event-dot ${r.type}`} key={r.id}>
                    <span className="dot" /><span className="cal-event-sys">{systemName(r.system_id)}</span>
                  </div>
                ))}
                {extra > 0 && <div className="cal-event-more">+{extra} more</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="cal-side">
        <div className="cal-side-card">
          <div className="cal-side-date">{displayDate(selectedDate)}</div>
          <div className="cal-side-count">{selectedReports.length} report{selectedReports.length === 1 ? "" : "s"}</div>
          {selectedReports.map((r) => (
            <div className={`cal-side-report ${r.type}`} key={r.id} onClick={() => navigate(`/companies/${companyId}/reports/${r.id}`)}>
              <span className={`cal-side-report-badge ${r.type}`}>{r.type === "gen-run" ? "GENERATOR" : eventTypeLabel(r).toUpperCase()}</span>
              <span className="cal-side-report-time">{r.time_label}</span>
              <div className="cal-side-report-title">{r.type === "gen-run" ? `${systemName(r.system_id)} — Generator Run` : `${eventTypeLabel(r)} — ${systemName(r.system_id)}`}</div>
              <div className="cal-side-report-meta">{systemName(r.system_id)} · {r.type === "gen-run" ? `${r.duration_label} run time` : `Max ${r.duration_label} on emergency`}</div>
            </div>
          ))}
          {!selectedReports.length && <p className="cal-side-empty">No reports on this date.</p>}
        </div>
        <div className="cal-legend-card">
          <div className="cal-legend-title">Legend</div>
          <div className="cal-legend-row"><span className="cal-event-dot gen-run"><span className="dot" /></span>Generator Run Report</div>
          <div className="cal-legend-row"><span className="cal-event-dot test"><span className="dot" /></span>ATS Report — Test</div>
          <div className="cal-legend-row"><span className="cal-event-dot ats-emergency"><span className="dot" /></span>ATS Report — Emergency</div>
        </div>
      </div>
    </div>
  );
}

/** ─── Shared date-range filter bar for the two analytical reports below — "Generate Report" applies
 * the pending range rather than recomputing on every keystroke, matching the reference's explicit CTA. ─── */
function DateRangeFilter({ range, onGenerate }) {
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);
  const preset = (days) => {
    const endD = new Date();
    const startD = days ? new Date(Date.now() - days * 86400000) : null;
    const s = startD ? fmtDate(startD) : "2000-01-01";
    const e = fmtDate(endD);
    setStart(s); setEnd(e); onGenerate(s, e);
  };
  return (
    <div className="report-filter-bar">
      <div className="report-filter-field"><label>Start Date</label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
      <div className="report-filter-field"><label>End Date</label><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      <button className="report-filter-preset" onClick={() => preset(30)}>Last 30 Days</button>
      <button className="report-filter-preset" onClick={() => preset(90)}>Last 90 Days</button>
      <button className="report-filter-preset" onClick={() => preset(0)}>All Data</button>
      <button className="report-generate-btn" onClick={() => onGenerate(start, end)}>Generate Report</button>
    </div>
  );
}

function inRange(isoDate, range) {
  return isoDate >= range.start && isoDate <= range.end;
}

/** ─── Initiating ATS Report: every report in range, grouped by which ATS/generator initiated it. ─── */
function InitiatingAtsReportTab({ reports, systemName }) {
  const [range, setRange] = useState({ start: "2000-01-01", end: fmtDate(new Date()) });
  const rows = useMemo(() => reports.filter((r) => r.initiating_ats && inRange(r.report_date, range)).sort((a, b) => a.report_date.localeCompare(b.report_date)), [reports, range]);
  const stats = useMemo(() => {
    const counts = {};
    rows.forEach((r) => { counts[r.initiating_ats] = (counts[r.initiating_ats] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return {
      total: rows.length,
      top: top ? `${top[0]} (${top[1]}×)` : "—",
      test: rows.filter((r) => r.type === "test").length,
      emergency: rows.filter((r) => r.type === "ats-emergency").length,
    };
  }, [rows]);

  return (
    <div className="report-doc analytical">
      <DateRangeFilter range={range} onGenerate={(start, end) => setRange({ start, end })} />
      <div className="report-doc-tiles">
        <div className="report-doc-tile dark"><div className="report-doc-tile-value">{stats.total}</div><div className="report-doc-tile-label">TOTAL EVENTS</div></div>
        <div className="report-doc-tile light"><div className="report-doc-tile-value dark-text" style={{ fontSize: 15 }}>{stats.top}</div><div className="report-doc-tile-label light-label">MOST FREQUENT INITIATOR</div></div>
        <div className="report-doc-tile light"><div className="report-doc-tile-value blue-text">{stats.test}</div><div className="report-doc-tile-label light-label">TEST EVENTS</div></div>
        <div className="report-doc-tile red"><div className="report-doc-tile-value">{stats.emergency}</div><div className="report-doc-tile-label">EMERGENCY EVENTS</div></div>
      </div>
      <div className="report-doc-section-title report-doc-section-row">
        <span>EVENTS — INITIATING ATS BY DATE</span>
        <span className="report-doc-section-range">{displayDate(range.start)} - {displayDate(range.end)}</span>
      </div>
      <div className="report-doc-table-wrap">
        <table className="report-doc-table left">
          <thead><tr><th>Date</th><th>Time</th><th>Initiating ATS</th><th>Load Served</th><th>Branch</th><th>Event Type</th><th>ATS Affected</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const detail = r.ats_details?.find((d) => d.ats_name === r.initiating_ats);
              const branch = detail?.branch;
              return (
                <tr key={r.id}>
                  <td className="mono">{displayDate(r.report_date)}</td>
                  <td className="mono">{r.time_label}</td>
                  <td><b>{r.initiating_ats}</b></td>
                  <td>{(branch && BRANCH_LOAD_LABEL[branch]) || systemName(r.system_id)}</td>
                  <td>{branch ? <span className={`report-doc-branch-badge ${branch}`}>{branch === "life-safety" ? "LIFE SAFETY" : branch.toUpperCase()}</span> : "—"}</td>
                  <td><span className={`report-doc-event-chip ${r.type}`}>{eventTypeLabel(r).toUpperCase()}</span></td>
                  <td className="mono">{r.ats_details?.length ?? 1}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="report-doc-empty">No initiating-ATS events in this date range.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="report-doc-footer"><span>Generated by CPC</span><span>Page 1 of 1</span></div>
    </div>
  );
}

/** ─── Time to Re-Xfer Report: every ATS transfer reading (one row per ATS per event) in range, flagged
 * against the NFPA 110 Type 10 10-second transfer requirement. ─── */
function TimeToBussReportTab({ reports }) {
  const [range, setRange] = useState({ start: "2000-01-01", end: fmtDate(new Date()) });
  const rows = useMemo(() => {
    const out = [];
    reports.filter((r) => inRange(r.report_date, range)).forEach((r) => {
      (r.ats_details || []).forEach((d) => {
        out.push({ report: r, detail: d });
      });
    });
    return out.sort((a, b) => a.report.report_date.localeCompare(b.report.report_date));
  }, [reports, range]);
  const stats = useMemo(() => {
    const times = rows.map((r) => r.detail.time_to_bus_sec).filter((v) => v != null);
    return {
      total: rows.length,
      avg: times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : "—",
      fastest: times.length ? Math.min(...times).toFixed(1) : "—",
      exceeded: times.filter((v) => v > 10).length,
    };
  }, [rows]);

  return (
    <div className="report-doc analytical">
      <DateRangeFilter range={range} onGenerate={(start, end) => setRange({ start, end })} />
      <div className="report-doc-tiles">
        <div className="report-doc-tile dark"><div className="report-doc-tile-value">{stats.total}</div><div className="report-doc-tile-label">TOTAL READINGS</div></div>
        <div className="report-doc-tile light"><div className="report-doc-tile-value dark-text">{stats.avg} sec</div><div className="report-doc-tile-label light-label">AVERAGE TIME TO RE-XFER</div></div>
        <div className="report-doc-tile light"><div className="report-doc-tile-value blue-text">{stats.fastest} sec</div><div className="report-doc-tile-label light-label">FASTEST READING</div></div>
        <div className="report-doc-tile red"><div className="report-doc-tile-value">{stats.exceeded}</div><div className="report-doc-tile-label">READINGS ABOVE 10.0 SEC</div></div>
      </div>
      <p className="report-doc-caption">Readings above 10.0 sec are flagged for review against NFPA 110 Type 10 transfer requirements.</p>
      <div className="report-doc-section-title report-doc-section-row">
        <span>ATS TRANSFER READINGS — TIME TO RE-XFER</span>
        <span className="report-doc-section-range">{displayDate(range.start)} - {displayDate(range.end)}</span>
      </div>
      <div className="report-doc-table-wrap">
        <table className="report-doc-table left">
          <thead><tr><th>Date</th><th>Time</th><th>ATS</th><th>Load Served</th><th>Branch</th><th>Event Type</th><th>Time to Re-Xfer</th><th>Time to Available</th></tr></thead>
          <tbody>
            {rows.map(({ report: r, detail: d }, i) => {
              const exceeded = (d.time_to_bus_sec ?? 0) > 10;
              return (
                <tr key={`${r.id}-${d.ats_name}-${i}`}>
                  <td className="mono">{displayDate(r.report_date)}</td>
                  <td className="mono">{d.switched_to_emergency || r.time_label}</td>
                  <td><b>{d.ats_name}</b></td>
                  <td>{(d.branch && BRANCH_LOAD_LABEL[d.branch]) || "—"}</td>
                  <td>{d.branch ? <span className={`report-doc-branch-badge ${d.branch}`}>{d.branch === "life-safety" ? "LIFE SAFETY" : d.branch.toUpperCase()}</span> : "—"}</td>
                  <td><span className={`report-doc-event-chip ${r.type}`}>{eventTypeLabel(r).toUpperCase()}</span></td>
                  <td className={exceeded ? "report-doc-cell-danger" : "mono"}>{d.time_to_bus_sec ?? "—"} sec{exceeded && <span className="report-doc-exceeded"> EXCEEDED</span>}</td>
                  <td className="mono">{d.time_to_available_sec ?? "—"} sec</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8} className="report-doc-empty">No ATS transfer readings in this date range.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="report-doc-footer"><span>Generated by CPC</span><span>Page 1 of 1</span></div>
    </div>
  );
}

function ComplianceTab({ companyId, reports }) {
  const { data: roster } = useCompanyAtsRoster(companyId);
  const rows = useMemo(() => {
    const out = [];
    (roster || []).forEach(({ system, ats }) => {
      const systemReports = reports.filter((r) => r.system_id === system.id);
      ats.forEach((a) => {
        const count = systemReports.filter((r) => r.initiating_ats === a.name).length;
        out.push({ systemName: system.name, atsName: a.name, branch: a.branch, count, ok: count > 0 });
      });
    });
    return out;
  }, [roster, reports]);
  const total = rows.length;
  const ok = rows.filter((r) => r.ok).length;
  const pct = total ? Math.round((ok / total) * 100) : 0;
  return (
    <>
      <div className="section-header">
        <div>
          <div className="section-title">Annual ATS Initiating Compliance</div>
          <div className="section-sub">Every ATS should be the initiating ATS at least once per year</div>
        </div>
      </div>
      <div className="compliance-summary">
        <div className="compliance-stats">
          <div className="compliance-stat"><span className="v" style={{ color: "var(--cyan)" }}>{pct}%</span><span className="l">Compliant</span></div>
          <div className="compliance-stat"><span className="v" style={{ color: "var(--green)" }}>{ok}</span><span className="l">Compliant</span></div>
          <div className="compliance-stat"><span className="v" style={{ color: "var(--red)" }}>{total - ok}</span><span className="l">Outstanding</span></div>
          <div className="compliance-stat"><span className="v" style={{ color: "var(--cyan)" }}>{total}</span><span className="l">Total ATS</span></div>
        </div>
      </div>
      <table className="data-table">
        <thead><tr><th>System</th><th>ATS</th><th>Branch</th><th>Initiations</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{r.systemName}</td>
              <td className="mono">{r.atsName}</td>
              <td><span className={`branch-tag ${r.branch}`}>{r.branch}</span></td>
              <td className="mono">{r.count}</td>
              <td>{r.ok ? <span className="ack-badge acked">Compliant</span> : <span className="ack-badge unacked">Outstanding</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
