import { Gauge } from "lucide-react";
import { memo, useRef, useState, type PointerEvent } from "react";
import { clampBpm, formatTimeSignature, tempoMarking } from "../domain/tempo";
import type { TempoUnit, TimeSignature } from "../domain/types";

interface BpmDisplayProps {
  bpm: number;
  timeSignature: TimeSignature;
  tempoUnit?: TempoUnit;
  onSetBpm: (bpm: number) => void;
}

export const tempoUnitLabels: Record<TempoUnit, string> = {
  quarter: "4분음표", eighth: "8분음표", "dotted-quarter": "점4분음표",
};

export const BpmDisplay = memo(function BpmDisplay({ bpm, timeSignature, tempoUnit = "quarter", onSetBpm }: BpmDisplayProps) {
  const [draft, setDraft] = useState(String(bpm));
  const [isEditing, setIsEditing] = useState(false);
  const editingRef = useRef(false);
  const editStartRef = useRef(bpm);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ pointerId: number; y: number; bpm: number; active: boolean } | null>(null);

  function finishEditing(cancel = false) {
    if (!editingRef.current) return;
    editingRef.current = false;
    setIsEditing(false);
    const trimmed = draft.trim();
    const valid = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed) && Number.isFinite(Number(trimmed));
    const next = cancel ? editStartRef.current : valid ? clampBpm(Number(trimmed)) : bpm;
    setDraft(String(next));
    if ((valid && !cancel) || (cancel && next !== bpm)) onSetBpm(next);
  }

  function finishDrag(event: PointerEvent<HTMLInputElement>, cancel: boolean) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.active && cancel) {
      onSetBpm(drag.bpm);
      setDraft(String(drag.bpm));
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section className="bpm-display flex flex-col items-center gap-2 text-center" aria-label="템포 표시">
      <div className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm surface-2">
        <Gauge size={16} aria-hidden="true" />
        <span>{tempoMarking(bpm)}</span><span aria-hidden="true">·</span>
        <span>{formatTimeSignature(timeSignature.beats, timeSignature.noteValue)}</span>
      </div>
      <label className="sr-only" htmlFor="bpm-input">BPM 직접 입력</label>
      <input
        ref={inputRef}
        id="bpm-input"
        className="bpm-number tabular w-full max-w-[330px] border-0 bg-transparent text-center font-black leading-none text-[color:var(--text)]"
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        value={isEditing ? draft : String(bpm)}
        aria-label="BPM 직접 입력"
        aria-describedby={isEditing ? "bpm-edit-help" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => {
          if (dragRef.current?.active) return;
          editStartRef.current = bpm;
          editingRef.current = true;
          setDraft(String(bpm));
          setIsEditing(true);
        }}
        onBlur={() => finishEditing()}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          finishEditing(event.key === "Escape");
          event.currentTarget.blur();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || event.isPrimary === false) return;
          dragRef.current = { pointerId: event.pointerId, y: event.clientY, bpm, active: false };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const movement = drag.y - event.clientY;
          if (!drag.active && Math.abs(movement) < 8) return;
          if (!drag.active) {
            drag.active = true;
            editingRef.current = false;
            setIsEditing(false);
            event.currentTarget.setPointerCapture?.(event.pointerId);
            event.currentTarget.blur();
          }
          event.preventDefault();
          const next = clampBpm(drag.bpm + Math.round(movement / 8));
          setDraft(String(next));
          onSetBpm(next);
        }}
        onPointerUp={(event) => finishDrag(event, false)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onLostPointerCapture={(event) => finishDrag(event, true)}
      />
      <div className="text-sm font-semibold text-[color:var(--muted)]">{tempoUnitLabels[tempoUnit]} = BPM</div>
      {isEditing ? (
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[color:var(--muted)]">
          <span id="bpm-edit-help">30–300 · 확정 시 수동값 적용</span>
          <button type="button" className="touch-target rounded-xl px-3 surface-2" onClick={() => inputRef.current?.blur()}>완료</button>
        </div>
      ) : null}
    </section>
  );
});
