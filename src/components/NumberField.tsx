import { useRef, useState } from "react";

interface NumberFieldProps {
  label: string;
  value: number | null;
  placeholder?: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function NumberField({ label, value, placeholder, min, max, onChange }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const initial = useRef<number | null>(value);
  const active = useRef(false);

  function finish(cancel: boolean) {
    if (!active.current) return;
    active.current = false;
    setDraft(null);
    if (cancel || draft === null || !draft.trim()) return;
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) return;
    const next = Math.max(min, Math.min(max, Math.round(parsed)));
    if (next !== initial.current && next !== value) onChange(next);
  }

  return <label className="block min-w-0 rounded-2xl p-3 surface-2">
    <span className="block text-sm font-semibold text-[color:var(--muted)]">{label}</span>
    <input className="mt-1 min-h-11 w-full min-w-0 border-0 bg-transparent text-lg font-bold"
      type="number" inputMode="numeric" min={min} max={max} step={1} placeholder={placeholder} value={draft ?? value ?? ""}
      onFocus={() => { initial.current = value; active.current = true; setDraft(value === null ? "" : String(value)); }}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => finish(false)}
      onKeyDown={event => {
        if (event.key !== "Escape" && event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        finish(event.key === "Escape");
        event.currentTarget.blur();
      }} />
  </label>;
}
