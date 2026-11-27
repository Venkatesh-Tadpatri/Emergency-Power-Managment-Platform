import { HISTORY_RANGES, type HistoryRange } from "../../hooks/useTelemetry";

/** Segmented time-range control shared by the analytics page and the device popup. */
export function RangePicker({ value, onChange }: { value: HistoryRange; onChange: (range: HistoryRange) => void }) {
  return (
    <div className="analytics-range" role="group" aria-label="Time range">
      {HISTORY_RANGES.map((item) => (
        <button key={item.key} type="button" className={item.key === value ? "active" : ""} aria-pressed={item.key === value} onClick={() => onChange(item.key)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
