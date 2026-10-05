import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

import { Modal } from "../common/Modal";
import { IconATS, IconGenerator, IconMeter } from "../common/Icons";
import { useMe } from "../../queries/me";
import { useCreateMeter, useMeter, useUpdateMeter } from "../../queries/meters";
import {
  useAts,
  useCreateAts,
  useCreateGenerator,
  useCreatePanel,
  useDeleteAts,
  useDeleteGenerator,
  useGenerators,
  usePanels,
  useUpdateAts,
  useUpdateGenerator,
} from "../../queries/systems";
import type { ATS, Generator } from "../../types/entities";
const BRANCHES = [
  { value: "life-safety", label: "Life Safety" },
  { value: "critical", label: "Critical" },
  { value: "equipment", label: "Equipment" },
];

const SOURCE_TYPES = [
  { value: "utility", label: "Utility" },
  { value: "generator", label: "Generator" },
];

const ATS_RATED_AMPS = ["40", "63", "80", "100", "125", "160", "200", "250", "315", "400", "500", "630", "800", "1000", "1250", "1600", "2000", "2500", "3200", "4000", "5000"];
const ATS_RATED_VOLTS = ["120", "208", "220", "230", "240", "380", "400", "415", "440", "480", "600"];
const ATS_MANUFACTURERS = ["ABB", "ASCO", "Caterpillar", "Cummins", "Eaton", "Generac", "Kohler", "Schneider Electric", "Siemens", "Socomec", "Vertiv"];

const GEN_MAKES = ["Caterpillar", "Cummins", "Kirloskar", "Mahindra Powerol", "Perkins", "Volvo Penta", "MTU", "Kohler", "Mitsubishi", "Doosan", "Yanmar", "JCB", "Generac"];
const GEN_RATED_KW = ["5", "10", "15", "20", "25", "30", "40", "50", "60", "75", "80", "100", "125", "150", "175", "200", "250", "300", "350", "400", "450", "500", "625", "750", "800", "1000", "1250", "1500", "1750", "2000", "2500", "3000", "4500", "5000"];
const GEN_RATED_VOLTS = ["120", "208", "220", "230", "240", "380", "400", "415", "440", "480", "600", "690", "3300", "11000", "13200", "15000", "22000", "33000"];
const GEN_RATED_AMPS = ["10", "16", "20", "25", "32", "40", "50", "63", "80", "100", "125", "160", "200", "400", "500", "630", "800", "1000", "1250", "1600", "2000", "2500", "3200", "4000", "5000", "6300"];

/** Editable combobox: type a value directly, or click a preset from the height-limited, scrollable
 * suggestion list. Used by the Add/Edit ATS form's Rated Amps, Rated Volts and Manufacturer fields.
 * Built as a plain input + custom popup (not a native <select>) so the field stays directly typeable
 * — no separate "Other" step — and the open list can be scroll-limited, unlike an OS-rendered listbox. */
function SelectOrCustom({ label, unit, options, value, onChange, placeholder, required }: { label: string; unit?: string; options: string[]; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);

  const positionPanel = () => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const openAbove = spaceBelow < 140 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(100, Math.min(220, openAbove ? spaceAbove : spaceBelow));
    const style: React.CSSProperties = {
      position: "fixed",
      left: rect.left,
      width: rect.width,
      maxHeight,
    };
    if (openAbove) style.bottom = window.innerHeight - rect.top + gap;
    else style.top = rect.bottom + gap;
    setPanelStyle(style);
  };

  useEffect(() => {
    if (!open) return;
    positionPanel();
    const onDocPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onReposition = () => positionPanel();
    document.addEventListener("mousedown", onDocPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="form-row" ref={rootRef} style={{ position: "relative" }}>
      <label>{label}{required ? " *" : ""}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type={unit ? "number" : "text"}
          min={unit ? 0 : undefined}
          step={unit ? 1 : undefined}
          required={required}
          placeholder={placeholder || `Select or type ${label.toLowerCase()}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          style={{ flex: 1 }}
        />
        {unit && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)" }}>{unit}</span>}
      </div>
      {open && (
        <div className="dropdown-panel" role="listbox" style={panelStyle}>
          {options.map((o) => (
            <div
              key={o}
              role="option"
              aria-selected={o === value}
              className={`dropdown-item${o === value ? " selected" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }}
            >
              {o}{unit ? ` ${unit}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyAtsForm = { name: "", manufacturer: "", model: "", serial_number: "", branch: "equipment", source_type: "utility", rated_amps: "", rated_volts: "", mqtt_topic: "" };
const emptyGenForm = { name: "", make: "", model: "", serial_number: "", rated_volts: "", rated_amps: "", rated_kw: "", mqtt_topic: "" };

function MqttMappingHelp() {
  return (
    <details style={{ marginTop: 6, fontSize: 11, color: "var(--text-dim)" }}>
      <summary style={{ cursor: "pointer" }}>View incoming metric mapping</summary>
      <div style={{ marginTop: 8, lineHeight: 1.7 }}>
        <b>POWER / metrics:</b> [0] L1-L2 V, [1] L2-L3 V, [2] L3-L1 V, [3] L1-N V,
        [4] L2-N V, [5] L3-N V, [6] L1 A, [7] L2 A, [8] L3 A, [9] power factor %.<br />
        <b>STATUS / metrics:</b> [0] operating-state code, [1] utility available,
        [2] generator available, [3] alarm active.
      </div>
    </details>
  );
}

export function DeviceManager({ systemId }: { systemId: string }) {
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: me } = useMe(auth.isAuthenticated);
  const canManage = me?.role === "superadmin";

  const { data: panels } = usePanels(systemId);
  const panelId = panels?.[0]?.id;
  const { data: ats } = useAts(panelId);
  const { data: generators } = useGenerators(panelId);

  const createPanel = useCreatePanel();
  const createAts = useCreateAts();
  const updateAts = useUpdateAts();
  const deleteAts = useDeleteAts();
  const createGenerator = useCreateGenerator();
  const updateGenerator = useUpdateGenerator();
  const deleteGenerator = useDeleteGenerator();

  const [atsEditing, setAtsEditing] = useState<ATS | "new" | null>(null);
  const [atsForm, setAtsForm] = useState(emptyAtsForm);
  const [genEditing, setGenEditing] = useState<Generator | "new" | null>(null);
  const [genForm, setGenForm] = useState(emptyGenForm);
  const [meterFor, setMeterFor] = useState<ATS | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: "ats" | "generator"; id: string; name: string } | null>(null);

  function confirmDelete() {
    if (!deleteConfirm) return;
    if (deleteConfirm.kind === "ats") deleteAts.mutate(deleteConfirm.id);
    else deleteGenerator.mutate(deleteConfirm.id);
    setDeleteConfirm(null);
  }

  async function ensurePanelId(): Promise<string> {
    if (panelId) return panelId;
    const panel = await createPanel.mutateAsync({ name: "Main Panel", system_id: systemId, connection_status: "online" });
    return panel.id;
  }

  const openNewAts = () => {
    setAtsForm(emptyAtsForm);
    setAtsEditing("new");
  };
  const openEditAts = (a: ATS) => {
    setAtsForm({
      name: a.name,
      manufacturer: a.manufacturer || "",
      model: a.model || "",
      serial_number: a.serial_number || "",
      branch: a.branch,
      source_type: a.source_type || "utility",
      rated_amps: a.rated_amps?.toString() || "",
      rated_volts: a.rated_volts?.toString() || "",
      mqtt_topic: a.mqtt_topic || "",
    });
    setAtsEditing(a);
  };
  const submitAts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!atsForm.name.trim()) return;
    const data = {
      name: atsForm.name,
      manufacturer: atsForm.manufacturer || undefined,
      model: atsForm.model || undefined,
      serial_number: atsForm.serial_number || undefined,
      branch: atsForm.branch,
      source_type: atsForm.source_type,
      rated_amps: atsForm.rated_amps ? Number(atsForm.rated_amps) : undefined,
      rated_volts: atsForm.rated_volts ? Number(atsForm.rated_volts) : undefined,
      mqtt_topic: atsForm.mqtt_topic.trim() || undefined,
    };
    if (atsEditing === "new") {
      const pid = await ensurePanelId();
      createAts.mutate({ ...data, panel_id: pid });
    } else if (atsEditing) {
      updateAts.mutate({ id: atsEditing.id, data });
    }
    setAtsEditing(null);
  };

  const openNewGen = () => {
    setGenForm(emptyGenForm);
    setGenEditing("new");
  };
  const openEditGen = (g: Generator) => {
    setGenForm({
      name: g.name,
      make: g.make || "",
      model: g.model || "",
      serial_number: g.serial_number || "",
      rated_volts: g.rated_volts?.toString() || "",
      rated_amps: g.rated_amps?.toString() || "",
      rated_kw: g.rated_kw?.toString() || "",
      mqtt_topic: g.mqtt_topic || "",
    });
    setGenEditing(g);
  };
  const submitGen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genForm.name.trim()) return;
    const data = {
      name: genForm.name,
      make: genForm.make || undefined,
      model: genForm.model || undefined,
      serial_number: genForm.serial_number || undefined,
      rated_volts: genForm.rated_volts ? Number(genForm.rated_volts) : undefined,
      rated_amps: genForm.rated_amps ? Number(genForm.rated_amps) : undefined,
      rated_kw: genForm.rated_kw ? Number(genForm.rated_kw) : undefined,
      mqtt_topic: genForm.mqtt_topic.trim() || undefined,
    };
    if (genEditing === "new") {
      const pid = await ensurePanelId();
      createGenerator.mutate({ ...data, panel_id: pid });
    } else if (genEditing) {
      updateGenerator.mutate({ id: genEditing.id, data });
    }
    setGenEditing(null);
  };

  return (
    <div className="device-manager" style={{ marginTop: 24 }}>
      <div className="section-header">
        <div>
          <div className="section-title">Devices</div>
          <div className="section-sub">Register the ATS units and generators for this system</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card device-manager-panel" style={{ marginTop: 0 }}>
          <div className="section-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <IconATS size={15} />
              <span className="section-title">ATS Units ({ats?.length ?? 0})</span>
            </div>
            {canManage && <button className="header-btn primary" onClick={openNewAts}>+ Add ATS</button>}
          </div>
          <table className="data-table device-manager-table">
            <thead>
              <tr><th>Sl.</th><th>Name</th><th>Branch</th><th>Meter</th><th></th></tr>
            </thead>
            <tbody>
              {(ats || []).map((a, index) => (
                <AtsRow key={a.id} serial={index + 1} ats={a} canManage={canManage} onDetail={() => navigate(`/systems/${systemId}/ats`)} onEdit={() => openEditAts(a)} onDelete={() => setDeleteConfirm({ kind: "ats", id: a.id, name: a.name })} onMeter={() => setMeterFor(a)} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="card device-manager-panel" style={{ marginTop: 0 }}>
          <div className="section-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <IconGenerator size={15} />
              <span className="section-title">Generators ({generators?.length ?? 0})</span>
            </div>
            {canManage && <button className="header-btn primary" onClick={openNewGen}>+ Add Generator</button>}
          </div>
          <table className="data-table device-manager-table">
            <thead>
              <tr><th>Sl.</th><th>Name</th><th>Make / Model</th><th>Rated kW</th><th></th></tr>
            </thead>
            <tbody>
              {(generators || []).map((g, index) => (
                <tr key={g.id}>
                  <td className="mono">{String(index + 1).padStart(2, "0")}</td><td style={{ fontWeight: 600 }}>{g.name}</td>
                  <td>{[g.make, g.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className="mono">{g.rated_kw ?? "—"}</td>
                  <td className="device-row-actions" style={{ display: "flex", gap: 6 }}>
                    <button className="header-btn detail-action" onClick={() => navigate(`/systems/${systemId}/generators`)}>Detailed view</button>
                    {canManage && <>
                      <button className="header-btn edit-action" onClick={() => openEditGen(g)}>Edit</button>
                      <button className="header-btn delete-action" onClick={() => setDeleteConfirm({ kind: "generator", id: g.id, name: g.name })}>Delete</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {atsEditing && (
        <Modal title={atsEditing === "new" ? "Add ATS" : "Edit ATS"} onClose={() => setAtsEditing(null)} className="modal-ats">
          <form onSubmit={submitAts}>
            <div className="form-row">
              <label>Name *</label>
              <input required minLength={2} maxLength={80} value={atsForm.name} onChange={(e) => setAtsForm({ ...atsForm, name: e.target.value })} placeholder="e.g. ATS-LS" autoFocus />
            </div>
            <div className="form-row">
              <label>Branch *</label>
              <select required value={atsForm.branch} onChange={(e) => setAtsForm({ ...atsForm, branch: e.target.value })}>
                {BRANCHES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Source Type</label>
              <select value={atsForm.source_type} onChange={(e) => setAtsForm({ ...atsForm, source_type: e.target.value })}>
                {SOURCE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="form-grid-2">
              <SelectOrCustom label="Rated Amps" unit="A" options={ATS_RATED_AMPS} value={atsForm.rated_amps} onChange={(v) => setAtsForm({ ...atsForm, rated_amps: v })} />
              <SelectOrCustom label="Rated Volts" unit="V" options={ATS_RATED_VOLTS} value={atsForm.rated_volts} onChange={(v) => setAtsForm({ ...atsForm, rated_volts: v })} />
            </div>
            <SelectOrCustom label="Manufacturer" options={ATS_MANUFACTURERS} value={atsForm.manufacturer} onChange={(v) => setAtsForm({ ...atsForm, manufacturer: v })} placeholder="Enter manufacturer name" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-row">
                <label>Model</label>
                <input value={atsForm.model} onChange={(e) => setAtsForm({ ...atsForm, model: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Serial Number</label>
                <input value={atsForm.serial_number} onChange={(e) => setAtsForm({ ...atsForm, serial_number: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <label>MQTT Topic Address</label>
              <input
                value={atsForm.mqtt_topic}
                onChange={(e) => setAtsForm({ ...atsForm, mqtt_topic: e.target.value })}
                placeholder="00:E0:62:30:D3:5A/DEMO/P01/A1"
              />
              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>Enter the base address; /POWER and /STATUS are mapped automatically.</span>
              <MqttMappingHelp />
            </div>
            <div className="modal-actions">
              <button type="button" className="header-btn" onClick={() => setAtsEditing(null)}>Cancel</button>
              <button type="submit" className="header-btn primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {genEditing && (
        <Modal title={genEditing === "new" ? "Add Generator" : "Edit Generator"} onClose={() => setGenEditing(null)} className="modal-gen">
          <form onSubmit={submitGen}>
            <div className="form-row">
              <label>Name *</label>
              <input required minLength={2} maxLength={80} value={genForm.name} onChange={(e) => setGenForm({ ...genForm, name: e.target.value })} placeholder="e.g. GEN-1" autoFocus />
            </div>
            <div className="form-grid-2">
              <SelectOrCustom label="Make" options={GEN_MAKES} value={genForm.make} onChange={(v) => setGenForm({ ...genForm, make: v })} placeholder="Select or type make" />
              <div className="form-row">
                <label>Model</label>
                <input value={genForm.model} onChange={(e) => setGenForm({ ...genForm, model: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <label>Serial Number</label>
              <input value={genForm.serial_number} onChange={(e) => setGenForm({ ...genForm, serial_number: e.target.value })} />
            </div>
            <div className="form-grid-3">
              <SelectOrCustom label="Rated kW" unit="kW" options={GEN_RATED_KW} value={genForm.rated_kw} onChange={(v) => setGenForm({ ...genForm, rated_kw: v })} />
              <SelectOrCustom label="Rated Volts" unit="V" options={GEN_RATED_VOLTS} value={genForm.rated_volts} onChange={(v) => setGenForm({ ...genForm, rated_volts: v })} />
              <SelectOrCustom label="Rated Amps" unit="A" options={GEN_RATED_AMPS} value={genForm.rated_amps} onChange={(v) => setGenForm({ ...genForm, rated_amps: v })} />
            </div>
            <div className="form-row">
              <label>MQTT Topic Address</label>
              <input
                value={genForm.mqtt_topic}
                onChange={(e) => setGenForm({ ...genForm, mqtt_topic: e.target.value })}
                placeholder="00:E0:62:30:D3:5A/DEMO/P01/G1"
              />
              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>Enter the base address; /POWER and /STATUS are mapped automatically.</span>
              <MqttMappingHelp />
            </div>
            <div className="modal-actions">
              <button type="button" className="header-btn" onClick={() => setGenEditing(null)}>Cancel</button>
              <button type="submit" className="header-btn primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {meterFor && <MeterModal ats={meterFor} onClose={() => setMeterFor(null)} />}

      {deleteConfirm && (
        <Modal title={`Delete ${deleteConfirm.kind === "ats" ? "ATS" : "Generator"}`} onClose={() => setDeleteConfirm(null)}>
          <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--text-dim)" }}>
            Delete <b style={{ color: "var(--text)" }}>{deleteConfirm.name}</b>? This permanently removes this {deleteConfirm.kind === "ats" ? "ATS" : "generator"} from the system.
          </p>
          <div className="modal-actions">
            <button type="button" className="header-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button type="button" className="header-btn danger" onClick={confirmDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AtsRow({ serial, ats, canManage, onDetail, onEdit, onDelete, onMeter }: { serial: number; ats: ATS; canManage: boolean; onDetail: () => void; onEdit: () => void; onDelete: () => void; onMeter: () => void }) {
  const { data: meter } = useMeter(ats.id);
  return (
    <tr>
      <td className="mono">{String(serial).padStart(2, "0")}</td><td style={{ fontWeight: 600 }}>{ats.name}</td>
      <td><span className={`branch-tag ${ats.branch}`}>{ats.branch}</span></td>
      <td>
        {meter ? (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{[meter.make, meter.model].filter(Boolean).join(" ") || "Configured"}</span>
        ) : canManage ? (
          <button className="header-btn" style={{ padding: "3px 8px", fontSize: 10 }} onClick={onMeter}><IconMeter size={10} /> Add</button>
        ) : "—"}
        {meter && canManage && <button className="header-btn" style={{ padding: "3px 8px", fontSize: 10, marginLeft: 6 }} onClick={onMeter}>Edit</button>}
      </td>
      <td className="device-row-actions" style={{ display: "flex", gap: 6 }}>
        <button className="header-btn detail-action" onClick={onDetail}>Detailed view</button>
        {canManage && <>
          <button className="header-btn edit-action" onClick={onEdit}>Edit</button>
          <button className="header-btn delete-action" onClick={onDelete}>Delete</button>
        </>}
      </td>
    </tr>
  );
}

function MeterModal({ ats, onClose }: { ats: ATS; onClose: () => void }) {
  const { data: meter } = useMeter(ats.id);
  const createMeter = useCreateMeter();
  const updateMeter = useUpdateMeter();
  const [make, setMake] = useState(meter?.make || "");
  const [model, setModel] = useState(meter?.model || "");

  const submit = () => {
    if (meter) {
      updateMeter.mutate({ id: meter.id, data: { make, model } });
    } else {
      createMeter.mutate({ ats_id: ats.id, make, model });
    }
    onClose();
  };

  return (
    <Modal title={`Power Meter — ${ats.name}`} onClose={onClose}>
      <div className="form-row">
        <label>Make</label>
        <input value={make} onChange={(e) => setMake(e.target.value)} autoFocus />
      </div>
      <div className="form-row">
        <label>Model</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button className="header-btn" onClick={onClose}>Cancel</button>
        <button className="header-btn primary" onClick={submit}>Save</button>
      </div>
    </Modal>
  );
}
