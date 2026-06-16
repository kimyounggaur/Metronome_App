import { useRef, useState, type CSSProperties } from "react";
import { ACCENT_LABELS, groupedBeatIndexes } from "../domain/rhythm";
import { formatTimeSignature, tempoMarking } from "../domain/tempo";
import type { AccentLevel, BeatEvent, TimeSignature } from "../domain/types";

interface MechanicalMetronomeProps {
  bpm: number;
  timeSignature: TimeSignature;
  event: BeatEvent | null;
  pulseId: number;
  accents: AccentLevel[];
  onSetBpm: (bpm: number) => void;
  onCycleAccent: (index: number) => void;
}

const TEMPO_MARKS = [
  40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 126,
  132, 138, 144, 152, 160, 168, 176, 184, 192, 200, 208,
];

const ACCENT_ARIA_LABELS: Record<AccentLevel, string> = {
  strong: "강하게",
  normal: "보통으로",
  soft: "약하게",
  mute: "쉬게",
};

type CssVars = CSSProperties & Record<string, string>;

function tempoToY(bpm: number): number {
  const min = TEMPO_MARKS[0];
  const max = TEMPO_MARKS[TEMPO_MARKS.length - 1];
  const clamped = Math.min(max, Math.max(min, bpm));
  return (Math.log(clamped / min) / Math.log(max / min)) * 100;
}

function styleVar(name: string, value: string): CssVars {
  return { [name]: value } as CssVars;
}

export function MechanicalMetronome({
  bpm,
  timeSignature,
  event,
  pulseId,
  accents,
  onSetBpm,
  onCycleAccent,
}: MechanicalMetronomeProps) {
  const [draft, setDraft] = useState(String(bpm));
  const dragStartRef = useRef<{ y: number; bpm: number } | null>(null);
  const currentBeat = event?.beatIndex ?? 0;
  const groups = groupedBeatIndexes(timeSignature);
  const swingSide = event ? (currentBeat % 2 === 0 ? "left" : "right") : "center";
  const swingAngle = swingSide === "left" ? "-24deg" : swingSide === "right" ? "24deg" : "0deg";
  const counterSwingAngle = swingSide === "left" ? "24deg" : swingSide === "right" ? "-24deg" : "0deg";
  const bpmY = `${tempoToY(bpm).toFixed(2)}%`;

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
    <section className="mechanical-metronome" aria-label="기계식 메트로놈">
      <div className="mechanical-metronome__cabinet">
        <div className="mechanical-metronome__top" aria-hidden="true" />
        <div className="mechanical-metronome__case" aria-hidden="true" />
        <div className="mechanical-metronome__inner-face" aria-hidden="true" />

        <div className="mechanical-metronome__tempo-card" aria-label="BPM 눈금판">
          <div className="mechanical-metronome__tempo-spine" aria-hidden="true" />
          <div className="mechanical-metronome__tempo-guide" style={styleVar("--bpm-y", bpmY)} aria-hidden="true" />
          {TEMPO_MARKS.map((mark, index) => (
            <button
              className={`mechanical-metronome__tempo-mark mechanical-metronome__tempo-mark--${index % 2 === 0 ? "left" : "right"}`}
              key={mark}
              type="button"
              aria-label={`${mark} BPM으로 설정`}
              onClick={() => onSetBpm(mark)}
              style={styleVar("--mark-y", `${tempoToY(mark).toFixed(2)}%`)}
            >
              {mark}
            </button>
          ))}
        </div>

        <div
          className="mechanical-metronome__pendulum"
          key={pulseId}
          aria-label="진자"
          data-swing-side={swingSide}
          data-accent={event?.accent ?? "normal"}
          style={{ "--swing-angle": swingAngle, "--counter-swing-angle": counterSwingAngle } as CssVars}
        >
          <span className="mechanical-metronome__rod" aria-hidden="true" />
          <label
            className="mechanical-metronome__weight"
            aria-label={`현재 BPM ${bpm}`}
            aria-current="true"
            style={styleVar("--bpm-y", bpmY)}
          >
            <input
              className="mechanical-metronome__bpm-input tabular"
              inputMode="numeric"
              min={30}
              max={300}
              value={draft}
              aria-label="BPM 직접 입력"
              onChange={(changeEvent) => setDraft(changeEvent.target.value)}
              onFocus={() => setDraft(String(bpm))}
              onBlur={() => commit(draft)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter") keyEvent.currentTarget.blur();
              }}
              onPointerDown={(pointerEvent) => {
                dragStartRef.current = { y: pointerEvent.clientY, bpm };
                pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
              }}
              onPointerMove={(pointerEvent) => {
                const start = dragStartRef.current;
                if (!start) return;
                const delta = Math.round((start.y - pointerEvent.clientY) / 8);
                const next = start.bpm + delta;
                setDraft(String(next));
                onSetBpm(next);
              }}
              onPointerUp={(pointerEvent) => {
                dragStartRef.current = null;
                pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
                setDraft(String(bpm));
              }}
            />
            <span>BPM</span>
          </label>
        </div>

        <div className="mechanical-metronome__base">
          <div className="mechanical-metronome__tempo-meta">
            <span>{tempoMarking(bpm)}</span>
            <span>{formatTimeSignature(timeSignature.beats, timeSignature.noteValue)}</span>
          </div>
          <div className="mechanical-metronome__beat-row" role="group" aria-label="비트 도트와 악센트">
            {groups.map((group, groupIndex) => (
              <div className="mechanical-metronome__beat-group" key={`group-${groupIndex}`}>
                {group.map((beatIndex) => {
                  const accent = accents[beatIndex] ?? "normal";
                  const active = currentBeat === beatIndex;
                  return (
                    <button
                      className="mechanical-metronome__beat-button"
                      data-accent={accent}
                      data-active={active}
                      key={beatIndex}
                      type="button"
                      aria-label={`${beatIndex + 1}박 악센트 ${ACCENT_ARIA_LABELS[accent]} 변경`}
                      title={`${beatIndex + 1}: ${ACCENT_LABELS[accent]}`}
                      onClick={() => onCycleAccent(beatIndex)}
                    >
                      {ACCENT_LABELS[accent]}
                    </button>
                  );
                })}
                {groupIndex < groups.length - 1 ? (
                  <span className="mechanical-metronome__beat-divider" aria-hidden="true">
                    |
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mechanical-metronome__winder" aria-hidden="true">
          <span />
        </div>
        <div className="mechanical-metronome__feet" aria-hidden="true">
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}
