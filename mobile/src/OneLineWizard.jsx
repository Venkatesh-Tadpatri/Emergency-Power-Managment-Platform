import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getOneLine, saveOneLine } from "./api";
import { useTheme } from "./theme";

// Mirrors the web app's One-Line Wizard exactly (frontend/src/components/systems/SystemOperationsOverview.tsx)
// so a one-line built on either platform reads identically on the other — same piece shape, same
// sourceLinks/atsDownstream/pieceDownstream keys, same field names per equipment type.
const WIZARD_EQUIPMENT_TYPES = [
  { key: "container", label: "Container", sub: "Switchgear / Switchboard" },
  { key: "breaker", label: "Breaker" },
  { key: "transformer", label: "Transformer" },
  { key: "panel", label: "Panel", badge: "Load" },
  { key: "equipment", label: "Equipment", badge: "Load" },
  { key: "area", label: "Area Served", badge: "Load" },
];

const CONTAINER_TYPES = ["Switchgear", "Main Switchboard", "Paralleling Gear", "Distribution Gear"];
const BREAKER_STYLES = [
  { value: "fixed-mount", label: "Fixed-Mount", sub: "Bolted in, no withdrawn state" },
  { value: "draw-out", label: "Draw-Out", sub: "Can be racked out" },
];

// Pass-through equipment can't be a dead end — picking one as a downstream target immediately asks
// what it feeds next, so a chain like ATS -> Breaker -> Container -> Transformer -> Panel can go as
// deep as it needs to, same as the web app.
const WIZARD_PASS_THROUGH_TYPES = ["breaker", "container", "transformer"];

function summarizePieceMeta(piece) {
  const meta = piece.meta || {};
  const parts = [];
  if (piece.type === "container") {
    if (meta.containerType) parts.push(meta.containerType);
    if (meta.voltage) parts.push(meta.voltage);
    if (meta.busCount) parts.push(`${meta.busCount} bus${meta.busCount === "1" ? "" : "es"}`);
  } else if (piece.type === "breaker") {
    if (meta.style) parts.push(meta.style === "draw-out" ? "Draw-Out" : "Fixed-Mount");
    if (meta.frameSize) parts.push(`${meta.frameSize} AF`);
    if (meta.tripRating) parts.push(`${meta.tripRating} AT`);
  } else if (piece.type === "transformer") {
    if (meta.primaryVoltage || meta.secondaryVoltage) parts.push(`${meta.primaryVoltage || "?"} / ${meta.secondaryVoltage || "?"}`);
    if (meta.kva) parts.push(`${meta.kva} kVA`);
  } else if (piece.type === "panel") {
    if (meta.voltage) parts.push(meta.voltage);
    if (meta.mainAmps) parts.push(`${meta.mainAmps}A Main`);
    if (meta.circuits?.length) parts.push(`${meta.circuits.length} circuit${meta.circuits.length === 1 ? "" : "s"}`);
  }
  return parts.join(" · ") || "—";
}

export function OneLineWizard({ systemId, systemName, ats, generators, token }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const [pieces, setPieces] = useState([]);
  const [sourceLinks, setSourceLinks] = useState({});
  const [atsDownstream, setAtsDownstream] = useState({});
  const [pieceDownstream, setPieceDownstream] = useState({});
  const [generated, setGenerated] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [step, setStep] = useState("equipment");
  const [activeType, setActiveType] = useState(null);
  const [editingPiece, setEditingPiece] = useState(null);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [selectedDownstream, setSelectedDownstream] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getOneLine(systemId, token)
      .then((row) => {
        if (cancelled) return;
        if (row?.data) {
          const data = row.data;
          setPieces(data.pieces || []);
          setSourceLinks(data.sourceLinks || {});
          setAtsDownstream(data.atsDownstream || {});
          // Older saved diagrams stored one destination per piece as a plain string — normalize into
          // single-item arrays so a piece can feed multiple downstream targets, same as the web app.
          const raw = data.pieceDownstream || {};
          setPieceDownstream(Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, Array.isArray(value) ? value : [value]])));
          setGenerated(Boolean(data.generated));
        }
        setHydrated(true);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); setHydrated(true); } });
    return () => { cancelled = true; };
  }, [systemId, token]);

  // Debounced auto-save, matching the web app's 800ms window — avoids a network round trip on every
  // keystroke while still saving promptly once the user pauses.
  const saveTimeout = useRef(null);
  useEffect(() => {
    if (!hydrated) return;
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveOneLine(systemId, { pieces, sourceLinks, atsDownstream, pieceDownstream, generated }, token).catch(() => {});
    }, 800);
    return () => clearTimeout(saveTimeout.current);
  }, [hydrated, pieces, sourceLinks, atsDownstream, pieceDownstream, generated, systemId, token]);

  const addPiece = (piece) => setPieces((current) => [...current, piece]);
  const updatePiece = (oldName, piece) => {
    setPieces((current) => current.map((existing) => (existing.name === oldName ? piece : existing)));
    if (piece.name === oldName) return;
    // Renamed — every place that referenced the piece by its old name follows, or the wiring quietly
    // breaks (a source/ATS/piece link pointing at a name nothing matches anymore).
    setSourceLinks((current) => Object.fromEntries(Object.entries(current).map(([id, dest]) => [id, dest === oldName ? piece.name : dest])));
    setAtsDownstream((current) => Object.fromEntries(Object.entries(current).map(([id, dest]) => [id, dest === oldName ? piece.name : dest])));
    setPieceDownstream((current) => {
      const next = {};
      for (const [key, values] of Object.entries(current)) {
        const nextKey = key === oldName ? piece.name : key;
        next[nextKey] = values.map((v) => (v === oldName ? piece.name : v));
      }
      return next;
    });
  };
  const removePiece = (name) => {
    setPieces((current) => current.filter((p) => p.name !== name));
    setAtsDownstream((current) => Object.fromEntries(Object.entries(current).filter(([, v]) => v !== name)));
    setSourceLinks((current) => Object.fromEntries(Object.entries(current).filter(([, v]) => v !== name)));
    setPieceDownstream((current) => {
      const next = {};
      for (const [key, values] of Object.entries(current)) {
        if (key === name) continue;
        const filtered = values.filter((v) => v !== name);
        if (filtered.length) next[key] = filtered;
      }
      return next;
    });
  };

  const startConnecting = (target) => { setSelectedDownstream(null); setConnectingFrom(target); };

  const confirmDownstream = () => {
    if (!connectingFrom || !selectedDownstream) return;
    if (connectingFrom.kind === "generator" || connectingFrom.kind === "utility") {
      setSourceLinks((current) => ({ ...current, [connectingFrom.id]: selectedDownstream }));
    } else if (connectingFrom.kind === "ats") {
      setAtsDownstream((current) => ({ ...current, [connectingFrom.id]: selectedDownstream }));
    } else {
      setPieceDownstream((current) => {
        const existing = current[connectingFrom.name] || [];
        if (existing.includes(selectedDownstream)) return current;
        return { ...current, [connectingFrom.name]: [...existing, selectedDownstream] };
      });
    }
    if (selectedDownstream !== "End") {
      const picked = pieces.find((p) => p.name === selectedDownstream);
      if (picked && WIZARD_PASS_THROUGH_TYPES.includes(picked.type)) {
        setConnectingFrom({ id: `piece:${picked.name}`, name: picked.name, kind: "piece" });
        setSelectedDownstream(null);
        return;
      }
    }
    setConnectingFrom(null);
    setSelectedDownstream(null);
  };

  const removeSourceLink = (id) => setSourceLinks((current) => { const next = { ...current }; delete next[id]; return next; });
  const removeAtsLink = (id) => setAtsDownstream((current) => { const next = { ...current }; delete next[id]; return next; });
  const removePieceLink = (name, destination) => setPieceDownstream((current) => {
    const filtered = (current[name] || []).filter((v) => v !== destination);
    const next = { ...current };
    if (filtered.length) next[name] = filtered; else delete next[name];
    return next;
  });

  // A generator/utility can feed an ATS directly, or a breaker/container/transformer first; a
  // piece/ATS can also terminate straight at an ATS (e.g. a switchgear's own feeders) — not just
  // another piece — grouped by category so a long equipment list stays easy to scan.
  const downstreamGroups = (() => {
    if (!connectingFrom) return [];
    const usedByThis = pieceDownstream[connectingFrom.name] || [];
    const atsOptions = ats
      .filter((item) => !usedByThis.includes(item.name))
      .map((item) => ({ key: item.id, name: item.name, sub: "ATS" }));
    const pieceOptions = pieces
      .filter((piece) => piece.name !== connectingFrom.name && !usedByThis.includes(piece.name))
      .map((piece) => ({ key: piece.name, name: piece.name, sub: piece.type }));
    const groups = [{ key: "ATS", label: "ATS", options: atsOptions }];
    for (const typeInfo of WIZARD_EQUIPMENT_TYPES) {
      groups.push({ key: typeInfo.key, label: typeInfo.label, options: pieceOptions.filter((o) => o.sub === typeInfo.key) });
    }
    return groups.filter((g) => g.options.length > 0);
  })();

  const hasAnyConnection = Object.keys(sourceLinks).length > 0 || Object.keys(atsDownstream).length > 0 || Object.keys(pieceDownstream).length > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerBar}>
        <Text style={styles.brand}>CPC</Text>
        <Text style={styles.headerLabel}>One-Line Wizard</Text>
        <Pressable
          style={[styles.generateBtn, !hasAnyConnection && styles.disabled]}
          disabled={!hasAnyConnection}
          onPress={() => { setGenerated(true); Alert.alert("Generated", "The one-line has been generated. View it from the Result tab (coming soon on mobile)."); }}
        >
          <Text style={styles.generateBtnText}>Finish & Generate</Text>
        </Pressable>
      </View>

      <View style={styles.breadcrumbRow}>
        <Pressable onPress={() => { setActiveType(null); setEditingPiece(null); setStep("equipment"); }}>
          <Text style={[styles.breadcrumb, step === "equipment" && styles.breadcrumbActive]}>1 · Create Equipment</Text>
        </Pressable>
        <Text style={styles.breadcrumbSep}>→</Text>
        <Pressable onPress={() => setStep("connections")}>
          <Text style={[styles.breadcrumb, step === "connections" && styles.breadcrumbActive]}>2 · Connections</Text>
        </Pressable>
      </View>

      {loadError && <Text style={styles.errorText}>Could not load the saved one-line — changes here won't be saved until this succeeds. Pull to refresh the system to retry.</Text>}

      {step === "equipment" ? (
        activeType ? (
          <EquipmentForm
            typeKey={activeType}
            editingPiece={editingPiece}
            existingNames={pieces.filter((p) => p.name !== editingPiece?.name).map((p) => p.name)}
            onCancel={() => { setActiveType(null); setEditingPiece(null); }}
            onSubmit={(piece) => {
              if (editingPiece) updatePiece(editingPiece.name, piece);
              else addPiece(piece);
              setActiveType(null);
              setEditingPiece(null);
            }}
          />
        ) : (
          <EquipmentStep
            pieces={pieces}
            onPickType={(key) => { setEditingPiece(null); setActiveType(key); }}
            onEdit={(piece) => { setEditingPiece(piece); setActiveType(piece.type); }}
            onRemove={(name) => Alert.alert("Remove piece?", name, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => removePiece(name) }])}
            onSwitchToConnections={() => setStep("connections")}
          />
        )
      ) : connectingFrom ? (
        <DownstreamPicker
          connectingFrom={connectingFrom}
          groups={downstreamGroups}
          selected={selectedDownstream}
          onSelect={setSelectedDownstream}
          onSelectEnd={() => setSelectedDownstream("End")}
          onBack={() => { setConnectingFrom(null); setSelectedDownstream(null); }}
          onConfirm={confirmDownstream}
        />
      ) : (
        <ConnectionsStep
          generators={generators}
          ats={ats}
          pieces={pieces}
          sourceLinks={sourceLinks}
          atsDownstream={atsDownstream}
          pieceDownstream={pieceDownstream}
          onStartConnecting={startConnecting}
          onRemoveSource={(id, label) => Alert.alert("Remove connection?", label, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => removeSourceLink(id) }])}
          onRemoveAts={(id, label) => Alert.alert("Remove connection?", label, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => removeAtsLink(id) }])}
          onRemovePieceLink={(name, destination, label) => Alert.alert("Remove connection?", label, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => removePieceLink(name, destination) }])}
          onSwitchToEquipment={() => setStep("equipment")}
        />
      )}
    </View>
  );
}

function EquipmentStep({ pieces, onPickType, onEdit, onRemove, onSwitchToConnections }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return (
    <ScrollView contentContainerStyle={styles.stepBody}>
      <Text style={styles.kicker}>Create Equipment</Text>
      <Text style={styles.h2}>Add every piece of equipment on the paper one-line</Text>
      <Text style={styles.caption}>Tap a type to add one — nothing here is wired together yet, that's Phase 2.</Text>
      <View style={styles.typeGrid}>
        {WIZARD_EQUIPMENT_TYPES.map((t) => (
          <Pressable key={t.key} style={styles.typeCard} onPress={() => onPickType(t.key)}>
            <Text style={styles.typeCardLabel}>{t.label}</Text>
            {t.sub && <Text style={styles.typeCardSub}>{t.sub}</Text>}
            {t.badge && <View style={styles.typeCardBadge}><Text style={styles.typeCardBadgeText}>{t.badge}</Text></View>}
          </Pressable>
        ))}
      </View>

      {pieces.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Created Equipment ({pieces.length})</Text>
          {WIZARD_EQUIPMENT_TYPES.map((typeInfo) => {
            const group = pieces.filter((p) => p.type === typeInfo.key);
            if (!group.length) return null;
            return (
              <View key={typeInfo.key} style={styles.reviewGroup}>
                <Text style={styles.reviewGroupTitle}>{typeInfo.label} ({group.length})</Text>
                {group.map((piece) => (
                  <View key={piece.name} style={styles.reviewRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewRowName}>{piece.name}</Text>
                      <Text style={styles.reviewRowMeta}>{summarizePieceMeta(piece)}</Text>
                    </View>
                    <Pressable onPress={() => onEdit(piece)}><Text style={styles.linkText}>Edit</Text></Pressable>
                    <Pressable onPress={() => onRemove(piece.name)}><Text style={styles.dangerLinkText}>Remove</Text></Pressable>
                  </View>
                ))}
              </View>
            );
          })}
        </>
      )}

      <Pressable style={styles.primaryBtnBlock} onPress={onSwitchToConnections}><Text style={styles.primaryBtnBlockText}>Switch to Connections</Text></Pressable>
    </ScrollView>
  );
}

function EquipmentForm({ typeKey, editingPiece, existingNames, onCancel, onSubmit }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const meta = editingPiece?.meta || {};
  const [name, setName] = useState(editingPiece?.name || "");
  const [containerType, setContainerType] = useState(meta.containerType || CONTAINER_TYPES[0]);
  const [voltage, setVoltage] = useState(meta.voltage || "");
  const [busCount, setBusCount] = useState(meta.busCount || "1");
  const [style, setStyle] = useState(meta.style || "fixed-mount");
  const [frameSize, setFrameSize] = useState(meta.frameSize || "");
  const [tripRating, setTripRating] = useState(meta.tripRating || "");
  const [primaryVoltage, setPrimaryVoltage] = useState(meta.primaryVoltage || "");
  const [secondaryVoltage, setSecondaryVoltage] = useState(meta.secondaryVoltage || "");
  const [kva, setKva] = useState(meta.kva || "");
  const [mainAmps, setMainAmps] = useState(meta.mainAmps || "");
  const [circuits, setCircuits] = useState(meta.circuits || []);
  const [circuitDraft, setCircuitDraft] = useState("");

  const typeInfo = WIZARD_EQUIPMENT_TYPES.find((t) => t.key === typeKey);
  const nameTaken = name.trim() && existingNames.includes(name.trim());
  const canSubmit = name.trim() && !nameTaken;

  const addCircuit = () => {
    if (!circuitDraft.trim()) return;
    setCircuits((current) => [...current, { ckt: current.length + 1, load: circuitDraft.trim() }]);
    setCircuitDraft("");
  };
  const removeCircuit = (ckt) => setCircuits((current) => current.filter((c) => c.ckt !== ckt).map((c, i) => ({ ...c, ckt: i + 1 })));

  const submit = () => {
    if (!canSubmit) return;
    let pieceMeta = {};
    if (typeKey === "container") pieceMeta = { containerType, voltage, busCount: busCount || "1" };
    else if (typeKey === "breaker") pieceMeta = { style, frameSize, tripRating };
    else if (typeKey === "transformer") pieceMeta = { primaryVoltage, secondaryVoltage, kva };
    else if (typeKey === "panel") pieceMeta = { voltage, mainAmps, circuits };
    onSubmit({ type: typeKey, name: name.trim(), meta: pieceMeta });
  };

  return (
    <ScrollView contentContainerStyle={styles.stepBody}>
      <Text style={styles.kicker}>{typeInfo?.label}</Text>
      <Text style={styles.h2}>{editingPiece ? `Edit ${typeInfo?.label.toLowerCase()}` : `Define the ${typeInfo?.label.toLowerCase()}`}</Text>

      {typeKey === "breaker" && (
        <>
          <Text style={styles.fieldLabel}>Style</Text>
          <View style={styles.cardOptionRow}>
            {BREAKER_STYLES.map((option) => (
              <Pressable key={option.value} style={[styles.cardOption, style === option.value && styles.cardOptionActive]} onPress={() => setStyle(option.value)}>
                <Text style={styles.cardOptionLabel}>{option.label}</Text>
                <Text style={styles.cardOptionSub}>{option.sub}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Text style={styles.fieldLabel}>Name *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={theme.textMuted} />
      {nameTaken && <Text style={styles.errorText}>A piece with this name already exists.</Text>}

      {typeKey === "container" && (
        <>
          <Text style={styles.fieldLabel}>Container Type</Text>
          <View style={styles.chipRow}>
            {CONTAINER_TYPES.map((option) => (
              <Pressable key={option} style={[styles.chip, containerType === option && styles.chipActive]} onPress={() => setContainerType(option)}>
                <Text style={[styles.chipText, containerType === option && styles.chipTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Voltage</Text>
          <TextInput style={styles.input} value={voltage} onChangeText={setVoltage} placeholder="480V" placeholderTextColor={theme.textMuted} />
          <Text style={styles.fieldLabel}>Bus Count</Text>
          <TextInput style={styles.input} value={busCount} onChangeText={setBusCount} keyboardType="numeric" placeholder="1" placeholderTextColor={theme.textMuted} />
        </>
      )}

      {typeKey === "breaker" && (
        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Text style={styles.fieldLabel}>Frame Size (AF)</Text>
            <TextInput style={styles.input} value={frameSize} onChangeText={setFrameSize} placeholder="800" placeholderTextColor={theme.textMuted} keyboardType="numeric" />
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.fieldLabel}>Trip Rating (AT)</Text>
            <TextInput style={styles.input} value={tripRating} onChangeText={setTripRating} placeholder="700" placeholderTextColor={theme.textMuted} keyboardType="numeric" />
          </View>
        </View>
      )}

      {typeKey === "transformer" && (
        <>
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Primary Voltage</Text>
              <TextInput style={styles.input} value={primaryVoltage} onChangeText={setPrimaryVoltage} placeholder="480V" placeholderTextColor={theme.textMuted} />
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Secondary Voltage</Text>
              <TextInput style={styles.input} value={secondaryVoltage} onChangeText={setSecondaryVoltage} placeholder="208Y/120V" placeholderTextColor={theme.textMuted} />
            </View>
          </View>
          <Text style={styles.fieldLabel}>kVA Rating</Text>
          <TextInput style={styles.input} value={kva} onChangeText={setKva} placeholder="300" placeholderTextColor={theme.textMuted} keyboardType="numeric" />
        </>
      )}

      {typeKey === "panel" && (
        <>
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Voltage</Text>
              <TextInput style={styles.input} value={voltage} onChangeText={setVoltage} placeholder="208Y/120V" placeholderTextColor={theme.textMuted} />
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Main Amps</Text>
              <TextInput style={styles.input} value={mainAmps} onChangeText={setMainAmps} placeholder="100" placeholderTextColor={theme.textMuted} keyboardType="numeric" />
            </View>
          </View>
          <Text style={styles.fieldLabel}>Panel Schedule</Text>
          <View style={styles.circuitAddRow}>
            <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={circuitDraft} onChangeText={setCircuitDraft} placeholder="e.g. Recept - Rm 204" placeholderTextColor={theme.textMuted} onSubmitEditing={addCircuit} />
            <Pressable style={styles.circuitAddBtn} onPress={addCircuit}><Text style={styles.circuitAddBtnText}>Add</Text></Pressable>
          </View>
          {circuits.map((c) => (
            <View key={c.ckt} style={styles.circuitRow}>
              <Text style={styles.circuitCkt}>CKT {c.ckt}</Text>
              <Text style={styles.circuitLoad}>{c.load}</Text>
              <Pressable onPress={() => removeCircuit(c.ckt)}><Text style={styles.dangerLinkText}>Remove</Text></Pressable>
            </View>
          ))}
          {!circuits.length && <Text style={styles.emptyText}>No circuits added yet.</Text>}
        </>
      )}

      <View style={styles.formActions}>
        <Pressable style={styles.secondaryBtn} onPress={onCancel}><Text style={styles.secondaryBtnText}>Cancel</Text></Pressable>
        <Pressable style={[styles.primaryBtn, !canSubmit && styles.disabled]} disabled={!canSubmit} onPress={submit}><Text style={styles.primaryBtnText}>{editingPiece ? "Save changes" : "Add piece"}</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function DownstreamPicker({ connectingFrom, groups, selected, onSelect, onSelectEnd, onBack, onConfirm }) {
  const styles = makeStyles(useTheme().theme);
  const total = groups.reduce((sum, g) => sum + g.options.length, 0);
  return (
    <ScrollView contentContainerStyle={styles.stepBody}>
      <Text style={styles.kicker}>Downstream Connection</Text>
      <Text style={styles.h2}>Where does {connectingFrom.name} feed to?</Text>
      <Text style={styles.caption}>Picking marks the connection — everything here already exists from Phase 1.</Text>
      <Text style={styles.sectionTitle}>Available Equipment ({total})</Text>
      {groups.map((group) => (
        <View key={group.key} style={styles.reviewGroup}>
          <Text style={styles.reviewGroupTitle}>{group.label} ({group.options.length})</Text>
          {group.options.map((option) => (
            <Pressable key={option.key} style={[styles.optionRow, selected === option.name && styles.optionRowActive]} onPress={() => onSelect(option.name)}>
              <Text style={styles.optionRowName}>{option.name}</Text>
              <Text style={styles.optionRowSub}>{option.sub}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      {!total && <Text style={styles.emptyText}>No ATS units or equipment pieces created yet — add one in Create Equipment first.</Text>}
      <Pressable style={[styles.endHereBtn, selected === "End" && styles.endHereBtnActive]} onPress={onSelectEnd}>
        <Text style={[styles.endHereText, selected === "End" && styles.endHereTextActive]}>End — stop here</Text>
      </Pressable>
      <View style={styles.formActions}>
        <Pressable style={styles.secondaryBtn} onPress={onBack}><Text style={styles.secondaryBtnText}>Back</Text></Pressable>
        <Pressable style={[styles.primaryBtn, !selected && styles.disabled]} disabled={!selected} onPress={onConfirm}><Text style={styles.primaryBtnText}>Confirm Connection</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function ConnectionsStep({ generators, ats, pieces, sourceLinks, atsDownstream, pieceDownstream, onStartConnecting, onRemoveSource, onRemoveAts, onRemovePieceLink, onSwitchToEquipment }) {
  const styles = makeStyles(useTheme().theme);
  const anyConnections = Object.keys(sourceLinks).length > 0 || Object.keys(atsDownstream).length > 0 || Object.keys(pieceDownstream).length > 0;

  return (
    <ScrollView contentContainerStyle={styles.stepBody}>
      <Text style={styles.kicker}>Connections</Text>
      <Text style={styles.h2}>Pick something to connect or review</Text>
      <Text style={styles.caption}>Items with a ✓ are already wired — tap to review or change them.</Text>

      <Text style={styles.sectionTitle}>Sources ({generators.length + 1})</Text>
      {generators.map((g) => (
        <Pressable key={g.id} style={styles.connectionCard} onPress={() => onStartConnecting({ id: g.id, name: g.name, kind: "generator" })}>
          <Text style={styles.connectionCardName}>{g.name}</Text>
          <Text style={styles.connectionCardMeta}>{sourceLinks[g.id] ? `✓ Connected to ${sourceLinks[g.id]}` : "Needs connection"}</Text>
        </Pressable>
      ))}
      <Pressable style={styles.connectionCard} onPress={() => onStartConnecting({ id: "utility", name: "Utility", kind: "utility" })}>
        <Text style={styles.connectionCardName}>Utility</Text>
        <Text style={styles.connectionCardMeta}>{sourceLinks.utility ? `✓ Connected to ${sourceLinks.utility}` : "Needs connection"}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>ATS ({ats.length})</Text>
      {ats.map((item) => (
        <Pressable key={item.id} style={styles.connectionCard} onPress={() => onStartConnecting({ id: item.id, name: item.name, kind: "ats" })}>
          <Text style={styles.connectionCardName}>{item.name}</Text>
          <Text style={styles.connectionCardMeta}>{atsDownstream[item.id] ? `✓ Connected to ${atsDownstream[item.id]}` : "Needs connection"}</Text>
        </Pressable>
      ))}
      {!ats.length && <Text style={styles.emptyText}>No ATS units registered for this system.</Text>}

      <Text style={styles.sectionTitle}>Equipment ({pieces.length})</Text>
      <Text style={styles.caption}>Tap a piece to add a downstream feed — tap it again to add another (e.g. wire 7 feeders off one switchgear box).</Text>
      {WIZARD_EQUIPMENT_TYPES.map((typeInfo) => {
        const group = pieces.filter((p) => p.type === typeInfo.key);
        if (!group.length) return null;
        return (
          <View key={typeInfo.key} style={styles.reviewGroup}>
            <Text style={styles.reviewGroupTitle}>{typeInfo.label} ({group.length})</Text>
            {group.map((piece) => {
              const linked = pieceDownstream[piece.name] || [];
              return (
                <Pressable key={piece.name} style={styles.connectionCard} onPress={() => onStartConnecting({ id: `piece:${piece.name}`, name: piece.name, kind: "piece" })}>
                  <Text style={styles.connectionCardName}>{piece.name}</Text>
                  <Text style={styles.connectionCardMeta}>{linked.length ? `✓ Feeds ${linked.length} target${linked.length === 1 ? "" : "s"}` : "Add a downstream feed"}</Text>
                </Pressable>
              );
            })}
          </View>
        );
      })}
      {!pieces.length && <Text style={styles.emptyText}>No equipment created yet — add pieces in Create Equipment first.</Text>}

      {anyConnections && (
        <>
          <Text style={styles.sectionTitle}>Connections Made</Text>
          {Object.keys(sourceLinks).filter((id) => id !== "utility").length > 0 && (
            <View style={styles.reviewGroup}>
              <Text style={styles.reviewGroupTitle}>Generator Connections</Text>
              {Object.entries(sourceLinks).filter(([id]) => id !== "utility").map(([id, destination]) => {
                const fromLabel = generators.find((g) => g.id === id)?.name || id;
                const dest = destination === "End" ? "End of line" : destination;
                return (
                  <View key={`source-${id}`} style={styles.reviewRow}>
                    <Text style={styles.reviewRowName}>{fromLabel} → {dest}</Text>
                    <Pressable onPress={() => onRemoveSource(id, `${fromLabel} → ${dest}`)}><Text style={styles.dangerLinkText}>Remove</Text></Pressable>
                  </View>
                );
              })}
            </View>
          )}
          {sourceLinks.utility && (
            <View style={styles.reviewGroup}>
              <Text style={styles.reviewGroupTitle}>Utility Connections</Text>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewRowName}>Utility → {sourceLinks.utility === "End" ? "End of line" : sourceLinks.utility}</Text>
                <Pressable onPress={() => onRemoveSource("utility", `Utility → ${sourceLinks.utility}`)}><Text style={styles.dangerLinkText}>Remove</Text></Pressable>
              </View>
            </View>
          )}
          {Object.keys(atsDownstream).length > 0 && (
            <View style={styles.reviewGroup}>
              <Text style={styles.reviewGroupTitle}>ATS Connections</Text>
              {Object.entries(atsDownstream).map(([id, destination]) => {
                const fromLabel = ats.find((a) => a.id === id)?.name || id;
                const dest = destination === "End" ? "End of line" : destination;
                return (
                  <View key={`ats-${id}`} style={styles.reviewRow}>
                    <Text style={styles.reviewRowName}>{fromLabel} → {dest}</Text>
                    <Pressable onPress={() => onRemoveAts(id, `${fromLabel} → ${dest}`)}><Text style={styles.dangerLinkText}>Remove</Text></Pressable>
                  </View>
                );
              })}
            </View>
          )}
          {WIZARD_EQUIPMENT_TYPES.map((typeInfo) => {
            const rows = Object.entries(pieceDownstream).flatMap(([name, destinations]) =>
              pieces.find((p) => p.name === name)?.type === typeInfo.key ? destinations.map((destination) => ({ name, destination })) : []
            );
            if (!rows.length) return null;
            return (
              <View key={`piece-group-${typeInfo.key}`} style={styles.reviewGroup}>
                <Text style={styles.reviewGroupTitle}>{typeInfo.label} Connections</Text>
                {rows.map(({ name, destination }) => {
                  const dest = destination === "End" ? "End of line" : destination;
                  return (
                    <View key={`${name}-${destination}`} style={styles.reviewRow}>
                      <Text style={styles.reviewRowName}>{name} → {dest}</Text>
                      <Pressable onPress={() => onRemovePieceLink(name, destination, `${name} → ${dest}`)}><Text style={styles.dangerLinkText}>Remove</Text></Pressable>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </>
      )}

      <Pressable style={styles.secondaryBtnBlock} onPress={onSwitchToEquipment}><Text style={styles.secondaryBtnBlockText}>Switch to Create Equipment</Text></Pressable>
    </ScrollView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    headerBar: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
    brand: { fontSize: 11, fontWeight: "800", color: theme.blue, borderWidth: 1, borderColor: theme.blue, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    headerLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: theme.text },
    generateBtn: { backgroundColor: theme.blue, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
    generateBtnText: { color: "#fff", fontWeight: "800", fontSize: 11.5 },
    breadcrumbRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
    breadcrumb: { fontSize: 11.5, fontWeight: "700", color: theme.textMuted },
    breadcrumbActive: { color: theme.blue },
    breadcrumbSep: { fontSize: 11.5, color: theme.textMuted },
    stepBody: { paddingBottom: 40 },
    kicker: { fontSize: 10.5, fontWeight: "800", color: theme.blue, textTransform: "uppercase", letterSpacing: 0.5 },
    h2: { fontSize: 18, fontWeight: "800", color: theme.text, marginTop: 4, marginBottom: 4 },
    caption: { fontSize: 12, color: theme.textDim, marginBottom: 14, lineHeight: 17 },
    sectionTitle: { fontSize: 13, fontWeight: "800", color: theme.text, marginTop: 18, marginBottom: 10 },
    typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    typeCard: { width: "47%", borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, backgroundColor: theme.surface },
    typeCardLabel: { fontSize: 13.5, fontWeight: "800", color: theme.text },
    typeCardSub: { fontSize: 10.5, color: theme.textDim, marginTop: 3 },
    typeCardBadge: { alignSelf: "flex-start", backgroundColor: theme.greenSoft, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginTop: 6 },
    typeCardBadgeText: { fontSize: 9, fontWeight: "800", color: theme.green },
    reviewGroup: { marginTop: 6, marginBottom: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 10, overflow: "hidden" },
    reviewGroupTitle: { fontSize: 10.5, fontWeight: "800", color: theme.blue, textTransform: "uppercase", letterSpacing: 0.4, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.surface2 },
    reviewRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
    reviewRowName: { flex: 1, fontSize: 12.5, fontWeight: "700", color: theme.text },
    reviewRowMeta: { fontSize: 10.5, color: theme.textMuted, marginTop: 2 },
    linkText: { fontSize: 11.5, fontWeight: "700", color: theme.blue },
    dangerLinkText: { fontSize: 11.5, fontWeight: "700", color: theme.red },
    primaryBtnBlock: { backgroundColor: theme.blue, borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 20 },
    primaryBtnBlockText: { color: "#fff", fontWeight: "800", fontSize: 13.5 },
    secondaryBtnBlock: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 20 },
    secondaryBtnBlockText: { color: theme.text, fontWeight: "700", fontSize: 13.5 },
    fieldLabel: { fontSize: 10.5, fontWeight: "700", color: theme.textDim, marginBottom: 5, marginTop: 10, textTransform: "uppercase" },
    input: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5, color: theme.text, backgroundColor: theme.surface, marginBottom: 4 },
    fieldRow: { flexDirection: "row", gap: 10 },
    fieldHalf: { flex: 1 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { borderWidth: 1, borderColor: theme.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: theme.surface },
    chipActive: { backgroundColor: theme.blueSoft, borderColor: theme.blue },
    chipText: { fontSize: 11.5, color: theme.textDim, fontWeight: "600" },
    chipTextActive: { color: theme.blue, fontWeight: "800" },
    cardOptionRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
    cardOption: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, backgroundColor: theme.surface },
    cardOptionActive: { borderColor: theme.blue, backgroundColor: theme.blueSoft },
    cardOptionLabel: { fontSize: 12.5, fontWeight: "800", color: theme.text },
    cardOptionSub: { fontSize: 10, color: theme.textDim, marginTop: 3 },
    circuitAddRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    circuitAddBtn: { borderWidth: 1, borderColor: theme.blue, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
    circuitAddBtnText: { color: theme.blue, fontWeight: "800", fontSize: 12 },
    circuitRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.surface2 },
    circuitCkt: { fontSize: 10.5, fontWeight: "800", color: theme.textMuted, width: 50 },
    circuitLoad: { flex: 1, fontSize: 12.5, color: theme.text },
    emptyText: { fontSize: 11.5, color: theme.textMuted, fontStyle: "italic", marginTop: 4, marginBottom: 4 },
    errorText: { fontSize: 11.5, color: theme.red, marginTop: 4, marginBottom: 8 },
    formActions: { flexDirection: "row", gap: 10, marginTop: 20 },
    primaryBtn: { flex: 1, backgroundColor: theme.blue, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13.5 },
    secondaryBtn: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    secondaryBtnText: { color: theme.text, fontWeight: "700", fontSize: 13.5 },
    disabled: { opacity: 0.5 },
    connectionCard: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, marginBottom: 8, backgroundColor: theme.surface },
    connectionCardName: { fontSize: 13, fontWeight: "800", color: theme.text },
    connectionCardMeta: { fontSize: 10.5, color: theme.textDim, marginTop: 3 },
    optionRow: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
    optionRowActive: { backgroundColor: theme.blueSoft },
    optionRowName: { fontSize: 12.5, fontWeight: "700", color: theme.text },
    optionRowSub: { fontSize: 10, color: theme.textMuted, marginTop: 2, textTransform: "capitalize" },
    endHereBtn: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 16 },
    endHereBtnActive: { borderColor: theme.blue, backgroundColor: theme.blueSoft },
    endHereText: { fontSize: 12.5, fontWeight: "700", color: theme.textDim },
    endHereTextActive: { color: theme.blue },
  });
}
