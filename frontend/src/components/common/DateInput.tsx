import { useRef } from "react";

/**
 * Date field with an explicit calendar button. Clicking anywhere on the field (or the button)
 * opens the browser's calendar picker; typing a date still works. The native picker follows the
 * app theme through `color-scheme` (see .date-input in global.css), so it stays readable in dark mode.
 */
export function DateInput({ value, onChange, min, max, ariaLabel, className = "", required }: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  ariaLabel?: string;
  className?: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    try { input.showPicker?.(); } catch { /* showPicker needs a user gesture; focus is enough as a fallback */ }
  };

  return (
    <span className={`date-input ${className}`.trim()}>
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        aria-label={ariaLabel}
        onClick={openPicker}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" className="date-input-button" aria-label={`Open calendar${ariaLabel ? ` for ${ariaLabel}` : ""}`} title="Open calendar" onClick={openPicker}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
          <path d="M16 2.5v4M8 2.5v4M3 10h18" />
        </svg>
      </button>
    </span>
  );
}
