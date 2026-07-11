import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export function EditableParameter({ label, value, displayValue, unit, minimum, maximum, step, disabled = false, controlId, onCommit }: {
  label: string; value: string | number; displayValue?: string; unit?: string; minimum?: number; maximum?: number; step?: number;
  disabled?: boolean; controlId?: string; onCommit(value: string): void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string>();
  useEffect(() => { if (!details.current?.open) setDraft(String(value)); }, [value]);
  function commit(): void {
    try {
      const numeric = Number(draft.trim());
      if (!Number.isFinite(numeric)) throw new Error(`${label} must be a number`);
      if (minimum !== undefined && numeric < minimum) throw new Error(`${label} must be at least ${minimum}`);
      if (maximum !== undefined && numeric > maximum) throw new Error(`${label} must be at most ${maximum}`);
      onCommit(draft.trim()); setError(undefined);
      if (!details.current) throw new Error(`${label} editor is unavailable`);
      details.current.open = false;
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
  }
  return <details ref={details} className={`parameter-row editable-parameter ${disabled ? 'disabled' : ''}`} data-agent-control={controlId} onToggle={() => {
    if (!details.current?.open) return; setDraft(String(value)); setError(undefined); requestAnimationFrame(() => input.current?.select());
  }}>
    <summary aria-label={`Edit ${label}`} aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }}><span>{label}</span><strong>{displayValue ?? String(value)}</strong><ChevronDown size={15}/></summary>
    <div className="parameter-editor"><div className="parameter-entry"><input ref={input} aria-label={label} type="number" value={draft} min={minimum} max={maximum} step={step} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') commit(); }}/>{unit && <em>{unit}</em>}<button type="button" onClick={commit}><Check size={14}/>Apply</button></div>{error && <span className="parameter-error" role="alert">{error}</span>}</div>
  </details>;
}

export function SelectParameter({ label, value, options, disabled = false, controlId, onValue }: {
  label: string; value: string | number; options: readonly { value: string | number; label: string }[]; disabled?: boolean; controlId?: string; onValue(value: string): void;
}) {
  const current = options.find((option) => String(option.value) === String(value));
  if (!current) throw new Error(`${label} value ${value} has no option`);
  return <label className={`parameter-row select-parameter ${disabled ? 'disabled' : ''}`} data-agent-control={controlId}><span>{label}</span><strong>{current.label}</strong><ChevronDown size={15}/><select aria-label={label} value={value} disabled={disabled} onChange={(event) => onValue(event.target.value)}>{options.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}</select></label>;
}
