import { Gauge } from "lucide-react";
import { useRef, useState } from "react";
import { formatTimeSignature, tempoMarking } from "../domain/tempo";
import type { TimeSignature } from "../domain/types";

interface BpmDisplayProps {
  bpm: number;
  timeSignature: TimeSignature;
  onSetBpm: (bpm: number) => void;
}

export function BpmDisplay({ bpm, timeSignature, onSetBpm }: BpmDisplayProps) {
  const [draft, setDraft] = useState(String(bpm));
  const dragStartRef = useRef<{ y: number; bpm: number } | null>(null);

  function commit(value: string) {
    const next = Number(value);
    if (Number.isFinite(next)) {
      onSetBpm(next);
      setDraft(String(Math.round(next)));
    } else {
      setDraft(String(bpm));
    }
  }

  return (
    <section className="flex flex-col items-center gap-2 text-center" aria-label="템포 표시">
      <div className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm surface-2">
        <Gauge size={16} aria-hidden="true" />
        <span>{tempoMarking(bpm)}</span>
        <span aria-hidden="true">·</span>
        <span>{formatTimeSignature(timeSignature.beats, timeSignature.noteValue)}</span>
      </div>

      <label className="sr-only" htmlFor="bpm-input">
        BPM 직접 입력
      </label>
      <input
        id="bpm-input"
        className="tabular w-full max-w-[330px] touch-none border-0 bg-transparent text-center text-[clamp(5rem,30vw,9rem)] font-black leading-none text-[color:var(--text)]"
        inputMode="numeric"
        min={30}
        max={300}
        value={draft}
        aria-label="BPM 직접 입력"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setDraft(String(bpm))}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onPointerDown={(event) => {
          dragStartRef.current = { y: event.clientY, bpm };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = dragStartRef.current;
          if (!start) return;
          const delta = Math.round((start.y - event.clientY) / 8);
          const next = start.bpm + delta;
          setDraft(String(next));
          onSetBpm(next);
        }}
        onPointerUp={(event) => {
          dragStartRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          setDraft(String(bpm));
        }}
      />
      <div className="-mt-2 text-sm font-semibold uppercase tracking-normal text-[color:var(--muted)]">BPM</div>
    </section>
  );
}
