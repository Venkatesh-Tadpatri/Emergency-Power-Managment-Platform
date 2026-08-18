import { useState } from "react";
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

const emptyAtsForm = { name: "", manufacturer: "", model: "", serial_number: "", branch: "equipment", rated_amps: "", rated_volts: "" };
const emptyGenForm = { name: "", make: "", model: "", serial_number: "", rated_volts: "", rated_amps: "", rated_kw: "" };

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
      rated_amps: a.rated_amps?.toString() || "",
      rated_volts: a.rated_volts?.toString() || "",
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
      rated_amps: atsForm.rated_amps ? Number(atsForm.rated_amps) : undefined,
      rated_volts: atsForm.rated_volts ? Number(atsForm.rated_volts) : undefined,
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
              <tr><th>Name</th><th>Branch</th><th>Meter</th><th></th></tr>
            </thead>
            <tbody>
              {(ats || []).map((a) => (
                <AtsRow key={a.id} ats={a} canManage={canManage} onDetail={() => navigate(`/systems/${systemId}/ats`)} onEdit={() => openEditAts(a)} onDelete={() => deleteAts.mutate(a.id)} onMeter={() => setMeterFor(a)} />
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
              <tr><th>Name</th><th>Make / Model</th><th>Rated kW</th><th></th></tr>
            </thead>
            <tbody>
              {(generators || []).map((g) => (
                <tr key={g.id}>
                  <td style={{ fontWeight: 600 }}>{g.name}</td>
                  <td>{[g.make, g.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className="mono">{g.rated_kw ?? "—"}</td>
                  <td className="device-row-actions" style={{ display: "flex", gap: 6 }}>
                    <button className="header-btn detail-action" onClick={() => navigate(`/systems/${systemId}/generators`)}>Detailed view</button>
                    {canManage && <>
                      <button className="header-btn edit-action" onClick={() => openEditGen(g)}>Edit</button>
                      <button className="header-btn delete-action" onClick={() => deleteGenerator.mutate(g.id)}>Delete</button>
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
            <div className="form-grid-2">
              <div className="form-row">
                <label>Rated Amps</label>
                <input type="number" min={0} step={1} value={atsForm.rated_amps} onChange={(e) => setAtsForm({ ...atsForm, rated_amps: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Rated Volts</label>
                <input type="number" min={0} step={1} value={atsForm.rated_volts} onChange={(e) => setAtsForm({ ...atsForm, rated_volts: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <label>Manufacturer</label>
              <input value={atsForm.manufacturer} onChange={(e) => setAtsForm({ ...atsForm, manufacturer: e.target.value })} />
            </div>
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
              <div className="form-row">
                <label>Make</label>
                <input value={genForm.make} onChange={(e) => setGenForm({ ...genForm, make: e.target.value })} />
              </div>
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
              <div className="form-row">
                <label>Rated kW</label>
                <input type="number" min={0} step={1} value={genForm.rated_kw} onChange={(e) => setGenForm({ ...genForm, rated_kw: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Rated Volts</label>
                <input type="number" min={0} step={1} value={genForm.rated_volts} onChange={(e) => setGenForm({ ...genForm, rated_volts: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Rated Amps</label>
                <input type="number" min={0} step={1} value={genForm.rated_amps} onChange={(e) => setGenForm({ ...genForm, rated_amps: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="header-btn" onClick={() => setGenEditing(null)}>Cancel</button>
              <button type="submit" className="header-btn primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {meterFor && <MeterModal ats={meterFor} onClose={() => setMeterFor(null)} />}
    </div>
  );
}

function AtsRow({ ats, canManage, onDetail, onEdit, onDelete, onMeter }: { ats: ATS; canManage: boolean; onDetail: () => void; onEdit: () => void; onDelete: () => void; onMeter: () => void }) {
  const { data: meter } = useMeter(ats.id);
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{ats.name}</td>
      <td><span className={`branch-tag ${ats.branch}`}>{ats.branch}</span></td>
      <td>
        {meter ? (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{[meter.make, meter.model].filter(Boolean).join(" ") || "Configured"}</span>
        ) : canManage ? (
          <button className="header-btn" style={{ padding: "3px 8px", fontSize: 10 }} onClick={onMeter}><IconMeter size={10} /> Add</button>
        ) : "â€”"}
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
