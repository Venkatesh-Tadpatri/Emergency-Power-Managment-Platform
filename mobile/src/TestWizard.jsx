import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "./theme";

const STEPS = ["setup", "confirm", "monitor", "result"];
const STEP_LABELS = ["Setup", "Confirm", "Monitor", "Result"];
const pad = (value) => String(value).padStart(2, "0");
const formatDuration = (seconds) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

export function TestWizard({ systemName, ats, generators, initialTarget, onClose }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [step, setStep] = useState("setup");
  const [testType, setTestType] = useState(initialTarget?.type === "ats" ? "load" : "no-load");
  const [duration, setDuration] = useState("35");
  const [startDelay, setStartDelay] = useState("2");
  const [blockSize, setBlockSize] = useState("2");
  const [blockDelay, setBlockDelay] = useState("10");
  const [selectedAtsIds, setSelectedAtsIds] = useState(initialTarget?.type === "ats" ? [initialTarget.id] : ats.map((item) => item.id));
  const [selectedGeneratorIds, setSelectedGeneratorIds] = useState(initialTarget?.type === "generator" ? [initialTarget.id] : generators.map((item) => item.id));
  const [initiatingAtsId, setInitiatingAtsId] = useState(initialTarget?.type === "ats" ? initialTarget.id : ats[0]?.id || "");
  const [elapsed, setElapsed] = useState(0);

  const durationMin = Math.max(1, Number(duration) || 1);
  const startDelayMin = Math.max(0, Number(startDelay) || 0);
  const blockSizeNum = Math.max(1, Number(blockSize) || 1);
  const blockDelayNum = Math.max(0, Number(blockDelay) || 0);

  const selectedAts = useMemo(() => ats.filter((item) => selectedAtsIds.includes(item.id)), [ats, selectedAtsIds]);
  const selectedGenerators = useMemo(() => generators.filter((item) => selectedGeneratorIds.includes(item.id)), [generators, selectedGeneratorIds]);
  const initiatingAts = ats.find((item) => item.id === initiatingAtsId);
  const canContinue = testType === "no-load" ? selectedGenerators.length > 0 : selectedAts.length > 0 && Boolean(initiatingAtsId);
  const remainingSeconds = Math.max(0, durationMin * 60 - elapsed);
  const stepIndex = STEPS.indexOf(step);

  const toggleAts = (id) => {
    setSelectedAtsIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    if (initiatingAtsId === id) setInitiatingAtsId("");
  };
  const toggleGenerator = (id) => {
    setSelectedGeneratorIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };
  const beginTest = () => { setElapsed(0); setStep("monitor"); };
  const advanceMinute = () => setElapsed((current) => Math.min(durationMin * 60, current + 60));

  const stepTitle = { setup: "Test Wizard", confirm: "Confirm Test", monitor: "Test Monitoring", result: "Test Completed" }[step];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>System test control</Text>
            <Text style={styles.title}>{stepTitle}</Text>
            <Text style={styles.subtitle}>{systemName}</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose}><Text style={styles.closeBtnText}>×</Text></Pressable>
        </View>

        <View style={styles.stepper}>
          {STEP_LABELS.map((label, index) => (
            <View key={label} style={styles.stepperItem}>
              <View style={[styles.stepperDot, index <= stepIndex && styles.stepperDotActive]}><Text style={[styles.stepperDotText, index <= stepIndex && styles.stepperDotTextActive]}>{index + 1}</Text></View>
              <Text style={[styles.stepperLabel, index <= stepIndex && styles.stepperLabelActive]}>{label}</Text>
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {step === "setup" && (
            <>
              <SectionHeading n="01" title="Test type" caption="Choose the test sequence to run." theme={theme} />
              <View style={styles.typeRow}>
                <Pressable style={[styles.typeCard, testType === "no-load" && styles.typeCardActive]} onPress={() => setTestType("no-load")}>
                  <View style={[styles.radio, testType === "no-load" && styles.radioActive]} />
                  <Text style={styles.typeTitle}>No-load test</Text>
                  <Text style={styles.typeCaption}>Verify generator start and engine-running feedback without ATS transfer.</Text>
                </Pressable>
                <Pressable style={[styles.typeCard, testType === "load" && styles.typeCardActive]} onPress={() => setTestType("load")}>
                  <View style={[styles.radio, testType === "load" && styles.radioActive]} />
                  <Text style={styles.typeTitle}>Load test</Text>
                  <Text style={styles.typeCaption}>Transfer the selected ATS group to emergency power and record the test window.</Text>
                </Pressable>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Test duration (min)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={duration} onChangeText={setDuration} placeholderTextColor={theme.textMuted} />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Start test delay (min)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={startDelay} onChangeText={setStartDelay} placeholderTextColor={theme.textMuted} />
                </View>
              </View>
              {testType === "load" && (
                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Block size (ATS)</Text>
                    <TextInput style={styles.input} keyboardType="numeric" value={blockSize} onChangeText={setBlockSize} placeholderTextColor={theme.textMuted} />
                  </View>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Block delay (sec)</Text>
                    <TextInput style={styles.input} keyboardType="numeric" value={blockDelay} onChangeText={setBlockDelay} placeholderTextColor={theme.textMuted} />
                  </View>
                </View>
              )}

              {testType === "no-load" && (
                <View style={styles.panel}>
                  <SectionHeading n="02" title="Generator test group" caption="Select the generators that will receive start commands." theme={theme} />
                  <View style={styles.panelActions}>
                    <Pressable onPress={() => setSelectedGeneratorIds(generators.map((item) => item.id))}><Text style={styles.panelActionText}>Select all</Text></Pressable>
                    <Pressable onPress={() => setSelectedGeneratorIds([])}><Text style={styles.panelActionText}>Clear all</Text></Pressable>
                  </View>
                  {generators.map((item) => (
                    <Pressable key={item.id} style={[styles.checkRow, selectedGeneratorIds.includes(item.id) && styles.checkRowActive]} onPress={() => toggleGenerator(item.id)}>
                      <View style={[styles.checkbox, selectedGeneratorIds.includes(item.id) && styles.checkboxActive]}>{selectedGeneratorIds.includes(item.id) && <Text style={styles.checkboxMark}>✓</Text>}</View>
                      <Text style={styles.checkRowText}>{item.name}</Text>
                      <Text style={styles.checkRowMeta}>{item.make || "generator"}</Text>
                    </Pressable>
                  ))}
                  {!generators.length && <Text style={styles.emptyText}>No generators are available for this system.</Text>}
                </View>
              )}

              {testType === "load" && (
                <View style={styles.panel}>
                  <SectionHeading n="02" title="ATS test group" caption="Select every ATS included in the transfer sequence." theme={theme} />
                  <View style={styles.panelActions}>
                    <Pressable onPress={() => setSelectedAtsIds(ats.map((item) => item.id))}><Text style={styles.panelActionText}>Select all</Text></Pressable>
                    <Pressable onPress={() => { setSelectedAtsIds([]); setInitiatingAtsId(""); }}><Text style={styles.panelActionText}>Clear all</Text></Pressable>
                  </View>
                  {ats.map((item) => (
                    <Pressable key={item.id} style={[styles.checkRow, selectedAtsIds.includes(item.id) && styles.checkRowActive]} onPress={() => toggleAts(item.id)}>
                      <View style={[styles.checkbox, selectedAtsIds.includes(item.id) && styles.checkboxActive]}>{selectedAtsIds.includes(item.id) && <Text style={styles.checkboxMark}>✓</Text>}</View>
                      <Text style={styles.checkRowText}>{item.name}</Text>
                      <Text style={styles.checkRowMeta}>{item.branch || "equipment"}</Text>
                    </Pressable>
                  ))}
                  {!ats.length && <Text style={styles.emptyText}>No ATS units are available for this system.</Text>}

                  <SectionHeading n="03" title="Initiating ATS" caption="This ATS receives the first test signal." theme={theme} />
                  {selectedAts.map((item) => (
                    <Pressable key={item.id} style={styles.checkRow} onPress={() => setInitiatingAtsId(item.id)}>
                      <View style={[styles.radio, initiatingAtsId === item.id && styles.radioActive]} />
                      <Text style={styles.checkRowText}>{item.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {step === "confirm" && (
            <>
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>Review before starting</Text>
                <Text style={styles.warningText}>This will begin the configured {testType === "load" ? "ATS transfer" : "generator no-load"} test sequence.</Text>
              </View>
              <SummaryRow label="Test type" value={testType === "load" ? "Load test" : "No-load test"} theme={theme} />
              <SummaryRow label="Duration" value={`${durationMin} minutes`} theme={theme} />
              <SummaryRow label="Start delay" value={`${startDelayMin} minutes`} theme={theme} />
              {testType === "load" ? (
                <>
                  <SummaryRow label="Initiating ATS" value={initiatingAts?.name || "Not selected"} theme={theme} />
                  <SummaryRow label="Block sequence" value={`${blockSizeNum} ATS every ${blockDelayNum} sec`} theme={theme} />
                  <SummaryRow label="Included ATS" value={selectedAts.map((item) => item.name).join(", ") || "—"} theme={theme} />
                </>
              ) : (
                <SummaryRow label="Selected generators" value={selectedGenerators.map((item) => item.name).join(", ") || "—"} theme={theme} />
              )}
            </>
          )}

          {step === "monitor" && (
            <>
              <View style={styles.runSummary}>
                <RunStat label="Test ID" value={`TEST-${new Date().getFullYear()}-001`} theme={theme} />
                <RunStat label="Mode" value={testType === "load" ? "Load test" : "No-load test"} theme={theme} />
                <RunStat label="Duration" value={formatDuration(durationMin * 60)} theme={theme} />
                <RunStat label="Remaining" value={formatDuration(remainingSeconds)} theme={theme} />
              </View>
              <Pressable style={styles.advanceBtn} onPress={advanceMinute}><Text style={styles.advanceBtnText}>Advance 1 min</Text></Pressable>

              <View style={styles.panelTitleRow}>
                <Text style={styles.panelTitle}>{testType === "load" ? "ATS status" : "Generator status"}</Text>
                <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>Running</Text></View>
              </View>
              {testType === "load"
                ? selectedAts.map((item) => (
                  <View key={item.id} style={styles.statusRow}>
                    <Text style={styles.statusRowName}>{item.name}</Text>
                    <Text style={styles.statusRowTag}>Active</Text>
                    <Text style={[styles.statusRowTag, { color: theme.red }]}>Emergency</Text>
                    <Text style={[styles.statusRowTag, { color: theme.green }]}>Passed</Text>
                  </View>
                ))
                : selectedGenerators.map((item) => (
                  <View key={item.id} style={styles.statusRow}>
                    <Text style={styles.statusRowName}>{item.name}</Text>
                    <Text style={styles.statusRowTag}>Engine running</Text>
                    <Text style={[styles.statusRowTag, { color: theme.green }]}>Running</Text>
                  </View>
                ))}
              {testType === "no-load" && !selectedGenerators.length && <Text style={styles.emptyText}>No generators are available for this test.</Text>}

              <Text style={styles.panelTitle}>Event log</Text>
              <View style={styles.eventLog}>
                <EventRow time="00:00" text="Test started" theme={theme} />
                <EventRow time="00:05" text="Generator start command issued" theme={theme} />
                {testType === "load" && (
                  <>
                    <EventRow time="00:15" text={`${initiatingAts?.name || "Initiating ATS"} test signal active`} theme={theme} />
                    <EventRow time="00:42" text="ATS group transferred to emergency" theme={theme} />
                  </>
                )}
                <EventRow time="01:00" text="Test window recording" theme={theme} />
              </View>
            </>
          )}

          {step === "result" && (
            <>
              <View style={styles.resultBanner}>
                <View style={styles.resultBadge}><Text style={styles.resultBadgeText}>OK</Text></View>
                <Text style={styles.resultTitle}>Test sequence completed</Text>
                <Text style={styles.resultText}>Test data has been recorded and the equipment has returned to its normal position.</Text>
              </View>
              <SummaryRow label="Test type" value={testType === "load" ? "Load test" : "No-load test"} theme={theme} />
              <SummaryRow label="Duration" value={`${durationMin} minutes`} theme={theme} />
              <SummaryRow label="ATS passed" value={testType === "load" ? `${selectedAts.length} / ${selectedAts.length}` : "Not applicable"} theme={theme} />
              <SummaryRow label="Generator status" value={generators.length ? "Running signals received" : "Not available"} theme={theme} />
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step === "setup" && (
            <>
              <Pressable style={styles.secondaryBtn} onPress={onClose}><Text style={styles.secondaryBtnText}>Cancel</Text></Pressable>
              <Pressable style={[styles.primaryBtn, !canContinue && styles.disabled]} disabled={!canContinue} onPress={() => setStep("confirm")}><Text style={styles.primaryBtnText}>Continue</Text></Pressable>
            </>
          )}
          {step === "confirm" && (
            <>
              <Pressable style={styles.secondaryBtn} onPress={() => setStep("setup")}><Text style={styles.secondaryBtnText}>Back to setup</Text></Pressable>
              <Pressable style={styles.primaryBtn} onPress={beginTest}><Text style={styles.primaryBtnText}>Start test</Text></Pressable>
            </>
          )}
          {step === "monitor" && (
            <>
              <Pressable style={styles.dangerBtn} onPress={() => setStep("result")}><Text style={styles.dangerBtnText}>Abort test</Text></Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => setStep("result")}><Text style={styles.primaryBtnText}>Complete test</Text></Pressable>
            </>
          )}
          {step === "result" && (
            <>
              <Pressable style={styles.secondaryBtn} onPress={onClose}><Text style={styles.secondaryBtnText}>Close</Text></Pressable>
              <Pressable style={styles.primaryBtn} onPress={onClose}><Text style={styles.primaryBtnText}>Done</Text></Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SectionHeading({ n, title, caption, theme }) {
  const styles = makeStyles(theme);
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingBadge}><Text style={styles.sectionHeadingBadgeText}>{n}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionHeadingTitle}>{title}</Text>
        <Text style={styles.sectionHeadingCaption}>{caption}</Text>
      </View>
    </View>
  );
}

function SummaryRow({ label, value, theme }) {
  const styles = makeStyles(theme);
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function RunStat({ label, value, theme }) {
  const styles = makeStyles(theme);
  return (
    <View style={styles.runStat}>
      <Text style={styles.runStatLabel}>{label}</Text>
      <Text style={styles.runStatValue}>{value}</Text>
    </View>
  );
}

function EventRow({ time, text, theme }) {
  const styles = makeStyles(theme);
  return (
    <View style={styles.eventRow}>
      <Text style={styles.eventTime}>{time}</Text>
      <Text style={styles.eventText}>{text}</Text>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" },
    sheet: { position: "absolute", top: "8%", left: 0, right: 0, bottom: 0, backgroundColor: theme.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: "hidden" },
    header: { flexDirection: "row", alignItems: "flex-start", padding: 18, paddingBottom: 14, backgroundColor: theme.blueSoft, borderBottomWidth: 1, borderColor: theme.border },
    kicker: { fontSize: 9.5, fontWeight: "800", color: theme.blue, textTransform: "uppercase", letterSpacing: 0.5 },
    title: { fontSize: 19, fontWeight: "800", color: theme.text, marginTop: 4 },
    subtitle: { fontSize: 11.5, color: theme.textDim, marginTop: 2 },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border },
    closeBtnText: { fontSize: 16, fontWeight: "800", color: theme.text },
    stepper: { flexDirection: "row", paddingHorizontal: 18, paddingVertical: 12, gap: 4, borderBottomWidth: 1, borderColor: theme.border },
    stepperItem: { flex: 1, alignItems: "center" },
    stepperDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
    stepperDotActive: { backgroundColor: theme.blue, borderColor: theme.blue },
    stepperDotText: { fontSize: 10, fontWeight: "800", color: theme.textMuted },
    stepperDotTextActive: { color: "#fff" },
    stepperLabel: { fontSize: 8.5, color: theme.textMuted, marginTop: 4, fontWeight: "700", textTransform: "uppercase" },
    stepperLabelActive: { color: theme.blue },
    content: { padding: 18, paddingBottom: 30 },
    sectionHeading: { flexDirection: "row", gap: 10, marginBottom: 12, marginTop: 6 },
    sectionHeadingBadge: { width: 22, height: 22, borderRadius: 6, backgroundColor: theme.blueSoft, alignItems: "center", justifyContent: "center" },
    sectionHeadingBadgeText: { fontSize: 10, fontWeight: "800", color: theme.blue },
    sectionHeadingTitle: { fontSize: 14, fontWeight: "800", color: theme.text },
    sectionHeadingCaption: { fontSize: 11, color: theme.textDim, marginTop: 2 },
    typeRow: { gap: 10, marginBottom: 16 },
    typeCard: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, backgroundColor: theme.surface2 },
    typeCardActive: { borderColor: theme.blue, backgroundColor: theme.blueSoft },
    radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: theme.border, marginBottom: 8 },
    radioActive: { borderColor: theme.blue, backgroundColor: theme.blue },
    typeTitle: { fontSize: 13.5, fontWeight: "800", color: theme.text, marginBottom: 3 },
    typeCaption: { fontSize: 11, color: theme.textDim, lineHeight: 16 },
    fieldRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    fieldHalf: { flex: 1 },
    fieldLabel: { fontSize: 10.5, fontWeight: "700", color: theme.textDim, marginBottom: 5, textTransform: "uppercase" },
    input: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: theme.text, backgroundColor: theme.surface },
    panel: { marginTop: 6, marginBottom: 8 },
    panelActions: { flexDirection: "row", gap: 16, marginBottom: 8 },
    panelActionText: { fontSize: 11.5, fontWeight: "700", color: theme.blue },
    checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: theme.border, marginBottom: 6, backgroundColor: theme.surface },
    checkRowActive: { borderColor: theme.blue, backgroundColor: theme.blueSoft },
    checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
    checkboxActive: { backgroundColor: theme.blue, borderColor: theme.blue },
    checkboxMark: { color: "#fff", fontSize: 11, fontWeight: "800" },
    checkRowText: { flex: 1, fontSize: 12.5, fontWeight: "700", color: theme.text },
    checkRowMeta: { fontSize: 10.5, color: theme.textMuted },
    emptyText: { fontSize: 11.5, color: theme.textMuted, fontStyle: "italic", marginTop: 4 },
    warningBox: { backgroundColor: theme.blueSoft, borderWidth: 1, borderColor: theme.blue, borderRadius: 10, padding: 12, marginBottom: 14 },
    warningTitle: { fontSize: 12.5, fontWeight: "800", color: theme.text, marginBottom: 3 },
    warningText: { fontSize: 11.5, color: theme.textDim, lineHeight: 16 },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderColor: theme.surface2 },
    summaryLabel: { fontSize: 11.5, color: theme.textDim, flex: 1 },
    summaryValue: { fontSize: 12, fontWeight: "700", color: theme.text, flex: 1.4, textAlign: "right" },
    runSummary: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    runStat: { flexGrow: 1, minWidth: "45%", backgroundColor: theme.surface2, borderRadius: 8, padding: 10 },
    runStatLabel: { fontSize: 9.5, color: theme.textMuted, textTransform: "uppercase" },
    runStatValue: { fontSize: 14, fontWeight: "800", color: theme.text, marginTop: 3 },
    advanceBtn: { alignSelf: "flex-start", borderWidth: 1, borderColor: theme.blue, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 16 },
    advanceBtnText: { fontSize: 11, fontWeight: "700", color: theme.blue },
    panelTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, marginTop: 4 },
    panelTitle: { fontSize: 13, fontWeight: "800", color: theme.text, marginTop: 14, marginBottom: 8 },
    liveBadge: { backgroundColor: theme.greenSoft, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
    liveBadgeText: { fontSize: 9.5, fontWeight: "800", color: theme.green },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.surface2 },
    statusRowName: { flex: 1, fontSize: 12, fontWeight: "700", color: theme.text },
    statusRowTag: { fontSize: 10, fontWeight: "700", color: theme.textDim },
    eventLog: { marginTop: 4 },
    eventRow: { flexDirection: "row", gap: 8, paddingVertical: 5 },
    eventTime: { fontSize: 10.5, fontWeight: "800", color: theme.textMuted, width: 42 },
    eventText: { fontSize: 11.5, color: theme.textDim, flex: 1 },
    resultBanner: { alignItems: "center", backgroundColor: theme.greenSoft, borderRadius: 12, padding: 18, marginBottom: 16 },
    resultBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.green, alignItems: "center", justifyContent: "center", marginBottom: 10 },
    resultBadgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },
    resultTitle: { fontSize: 15, fontWeight: "800", color: theme.text, textAlign: "center" },
    resultText: { fontSize: 11.5, color: theme.textDim, textAlign: "center", marginTop: 6, lineHeight: 16 },
    footer: { flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
    primaryBtn: { flex: 1, backgroundColor: theme.blue, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13.5 },
    secondaryBtn: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    secondaryBtnText: { color: theme.text, fontWeight: "700", fontSize: 13.5 },
    dangerBtn: { flex: 1, borderWidth: 1, borderColor: theme.red, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    dangerBtnText: { color: theme.red, fontWeight: "800", fontSize: 13.5 },
    disabled: { opacity: 0.5 },
  });
}
