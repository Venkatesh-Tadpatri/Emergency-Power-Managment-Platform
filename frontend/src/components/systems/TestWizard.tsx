import { useMemo, useState } from "react";

import { Modal } from "../common/Modal";
import type { ATS, Generator } from "../../types/entities";

type TestType = "load" | "no-load";
type WizardStep = "setup" | "confirm" | "monitor" | "result";

const pad = (value: number) => String(value).padStart(2, "0");

export function TestWizard({ systemName, ats, generators, initialTarget, onClose }: { systemName: string; ats: ATS[]; generators: Generator[]; initialTarget?: { type: "ats" | "generator"; id: string }; onClose: () => void }) {
  const [step, setStep] = useState<WizardStep>("setup");
  const [testType, setTestType] = useState<TestType>(initialTarget?.type === "ats" ? "load" : "no-load");
  const [duration, setDuration] = useState(35);
  const [startDelay, setStartDelay] = useState(2);
  const [blockSize, setBlockSize] = useState(2);
  const [blockDelay, setBlockDelay] = useState(10);
  const [selectedAtsIds, setSelectedAtsIds] = useState<string[]>(initialTarget?.type === "ats" ? [initialTarget.id] : ats.map((item) => item.id));
  const [selectedGeneratorIds, setSelectedGeneratorIds] = useState<string[]>(initialTarget?.type === "generator" ? [initialTarget.id] : generators.map((item) => item.id));
  const [initiatingAtsId, setInitiatingAtsId] = useState(initialTarget?.type === "ats" ? initialTarget.id : ats[0]?.id || "");
  const [elapsed, setElapsed] = useState(0);

  const selectedAts = useMemo(() => ats.filter((item) => selectedAtsIds.includes(item.id)), [ats, selectedAtsIds]);
  const selectedGenerators = useMemo(() => generators.filter((item) => selectedGeneratorIds.includes(item.id)), [generators, selectedGeneratorIds]);
  const initiatingAts = ats.find((item) => item.id === initiatingAtsId);
  const canContinue = testType === "no-load" ? selectedGenerators.length > 0 : selectedAts.length > 0 && Boolean(initiatingAtsId);
  const remainingSeconds = Math.max(0, duration * 60 - elapsed);
  const formatDuration = (seconds: number) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

  function toggleAts(id: string) {
    setSelectedAtsIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    if (initiatingAtsId === id) setInitiatingAtsId("");
  }

  function toggleGenerator(id: string) {
    setSelectedGeneratorIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function beginTest() {
    setElapsed(0);
    setStep("monitor");
  }

  return <Modal title="" onClose={onClose} className="test-wizard-modal">
    <div className="test-wizard">
      <header className="test-wizard-header">
        <div><span>System test control</span><h2>{step === "setup" ? "Test Wizard" : step === "confirm" ? "Confirm Test" : step === "monitor" ? "Test Monitoring" : "Test Completed"}</h2><p>{systemName}</p></div>
        <button type="button" className="test-wizard-close" aria-label="Close test wizard" onClick={onClose}>x</button>
      </header>
      <div className="test-stepper" aria-label="Test workflow progress">
        {["Setup", "Confirm", "Monitor", "Result"].map((label, index) => <span className={index <= ["setup", "confirm", "monitor", "result"].indexOf(step) ? "active" : ""} key={label}><i>{index + 1}</i>{label}</span>)}
      </div>

      {step === "setup" && <section className="test-setup-content">
        <div className="test-section-heading"><span>01</span><div><h3>Test type</h3><p>Choose the test sequence to run.</p></div></div>
        <div className="test-type-options">
          <label className={testType === "no-load" ? "selected no-load" : "no-load"}><input type="radio" name="testType" checked={testType === "no-load"} onChange={() => setTestType("no-load")} /><b>No-load test</b><small>Verify generator start and engine-running feedback without ATS transfer.</small></label>
          <label className={testType === "load" ? "selected load" : "load"}><input type="radio" name="testType" checked={testType === "load"} onChange={() => setTestType("load")} /><b>Load test</b><small>Transfer the selected ATS group to emergency power and record the test window.</small></label>
        </div>
        <div className="test-settings-grid">
          <label><span>Test duration</span><div className="test-number-input"><input type="number" min="1" value={duration} onChange={(event) => setDuration(Math.max(1, Number(event.target.value)))} /><b>min</b></div></label>
          <label><span>Start test delay</span><div className="test-number-input"><input type="number" min="0" value={startDelay} onChange={(event) => setStartDelay(Math.max(0, Number(event.target.value)))} /><b>min</b></div></label>
          {testType === "load" && <><label><span>Block size</span><div className="test-number-input"><input type="number" min="1" max={Math.max(1, ats.length)} value={blockSize} onChange={(event) => setBlockSize(Math.max(1, Number(event.target.value)))} /><b>ATS</b></div></label><label><span>Block delay</span><div className="test-number-input"><input type="number" min="0" value={blockDelay} onChange={(event) => setBlockDelay(Math.max(0, Number(event.target.value)))} /><b>sec</b></div></label></>}
        </div>
        {testType === "no-load" && <div className="test-selection-panel">
          <div className="test-section-heading"><span>02</span><div><h3>Generator test group</h3><p>Select the generators that will receive start commands and return engine-running feedback.</p></div></div>
          <div className="test-selection-actions"><button type="button" onClick={() => setSelectedGeneratorIds(generators.map((item) => item.id))}>Select all</button><button type="button" onClick={() => setSelectedGeneratorIds([])}>Clear all</button></div>
          <div className="test-ats-list">{generators.map((item) => <label className={selectedGeneratorIds.includes(item.id) ? "checked" : ""} key={item.id}><input type="checkbox" checked={selectedGeneratorIds.includes(item.id)} onChange={() => toggleGenerator(item.id)} /><span>{item.name}</span><small>{item.make || "generator"}</small></label>)}</div>
          {!generators.length && <p className="test-empty">No generators are available for this system.</p>}
        </div>}
        {testType === "load" && <div className="test-selection-panel">
          <div className="test-section-heading"><span>02</span><div><h3>ATS test group</h3><p>Select every ATS included in the transfer sequence. One selected ATS must initiate the test.</p></div></div>
          <div className="test-selection-actions"><button type="button" onClick={() => setSelectedAtsIds(ats.map((item) => item.id))}>Select all</button><button type="button" onClick={() => { setSelectedAtsIds([]); setInitiatingAtsId(""); }}>Clear all</button></div>
          <div className="test-ats-list">{ats.map((item) => <label className={selectedAtsIds.includes(item.id) ? "checked" : ""} key={item.id}><input type="checkbox" checked={selectedAtsIds.includes(item.id)} onChange={() => toggleAts(item.id)} /><span>{item.name}</span><small>{item.branch || "equipment"}</small></label>)}</div>
          {!ats.length && <p className="test-empty">No ATS units are available for this system.</p>}
          <div className="test-initiating"><div className="test-section-heading"><span>03</span><div><h3>Initiating ATS</h3><p>This ATS receives the first test signal.</p></div></div><div className="test-radio-list">{selectedAts.map((item) => <label key={item.id}><input type="radio" name="initiatingAts" checked={initiatingAtsId === item.id} onChange={() => setInitiatingAtsId(item.id)} /><span>{item.name}</span></label>)}</div></div>
        </div>}
        <footer className="test-wizard-actions"><button type="button" className="test-secondary" onClick={onClose}>Cancel</button><button type="button" className="test-primary" disabled={!canContinue} onClick={() => setStep("confirm")}>Continue</button></footer>
      </section>}

      {step === "confirm" && <section className="test-confirm-content">
        <div className="test-confirm-warning"><b>Review before starting</b><span>This will begin the configured {testType === "load" ? "ATS transfer" : "generator no-load"} test sequence.</span></div>
        <dl className="test-summary"><div><dt>Test type</dt><dd>{testType === "load" ? "Load test" : "No-load test"}</dd></div><div><dt>Duration</dt><dd>{duration} minutes</dd></div><div><dt>Start delay</dt><dd>{startDelay} minutes</dd></div>{testType === "load" ? <><div><dt>Initiating ATS</dt><dd>{initiatingAts?.name || "Not selected"}</dd></div><div><dt>Block sequence</dt><dd>{blockSize} ATS every {blockDelay} seconds</dd></div><div><dt>Included ATS</dt><dd>{selectedAts.map((item) => item.name).join(", ")}</dd></div></> : <div><dt>Selected generators</dt><dd>{selectedGenerators.map((item) => item.name).join(", ")}</dd></div>}</dl>
        <footer className="test-wizard-actions"><button type="button" className="test-secondary" onClick={() => setStep("setup")}>Back to setup</button><button type="button" className="test-primary test-start" onClick={beginTest}>Start test</button></footer>
      </section>}

      {step === "monitor" && <section className="test-monitor-content">
        <div className="test-run-summary"><div><span>Test ID</span><b>TEST-{new Date().getFullYear()}-001</b></div><div><span>Mode</span><b>{testType === "load" ? "Load test" : "No-load test"}</b></div><div><span>Duration</span><b>{formatDuration(duration * 60)}</b></div><div><span>Remaining</span><b>{formatDuration(remainingSeconds)}</b></div><button type="button" className="test-timer-control" onClick={() => setElapsed((current) => Math.min(duration * 60, current + 60))}>Advance 1 min</button></div>
        <div className="test-live-layout"><section><div className="test-panel-title"><h3>{testType === "load" ? "ATS status" : "Generator status"}</h3><span className="test-live-badge">Running</span></div>{testType === "load" ? <table className="test-status-table"><thead><tr><th>ATS</th><th>Test signal</th><th>Position</th><th>Result</th></tr></thead><tbody>{selectedAts.map((item) => <tr key={item.id}><td>{item.name}</td><td><span className="test-signal active">Active</span></td><td><span className="test-position emergency">Emergency</span></td><td><span className="test-pass">Passed</span></td></tr>)}</tbody></table> : <div className="test-generator-status">{selectedGenerators.map((generator) => <div key={generator.id}><b>{generator.name}</b><span>Engine running</span><em>Running</em></div>)}{!selectedGenerators.length && <p className="test-empty">No generators are available for this test.</p>}</div>}</section><section className="test-event-panel"><div className="test-panel-title"><h3>Event log</h3><span>Live</span></div><ol><li><time>00:00</time> Test started</li><li><time>00:05</time> Generator start command issued</li>{testType === "load" && <><li><time>00:15</time> {initiatingAts?.name || "Initiating ATS"} test signal active</li><li><time>00:42</time> ATS group transferred to emergency</li></>}<li><time>01:00</time> Test window recording</li></ol></section></div>
        <footer className="test-wizard-actions"><button type="button" className="test-danger" onClick={() => setStep("result")}>Abort test</button><button type="button" className="test-primary" onClick={() => setStep("result")}>Complete test</button></footer>
      </section>}

      {step === "result" && <section className="test-result-content"><div className="test-result-banner"><i>OK</i><div><h3>Test sequence completed</h3><p>Test data has been recorded and the equipment has returned to its normal position.</p></div></div><div className="test-result-grid"><div><span>Test type</span><b>{testType === "load" ? "Load test" : "No-load test"}</b></div><div><span>Duration</span><b>{duration} minutes</b></div><div><span>ATS passed</span><b>{testType === "load" ? `${selectedAts.length} / ${selectedAts.length}` : "Not applicable"}</b></div><div><span>Generator status</span><b>{generators.length ? "Running signals received" : "Not available"}</b></div></div><footer className="test-wizard-actions"><button type="button" className="test-secondary" onClick={onClose}>Close</button><button type="button" className="test-primary">Generate report</button></footer></section>}
    </div>
  </Modal>;
}
