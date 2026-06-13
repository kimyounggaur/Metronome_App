import { ACCENT_LABELS, groupedBeatIndexes } from "../domain/rhythm";
import type { AccentLevel, BeatEvent, TimeSignature } from "../domain/types";

interface BeatVisualizerProps {
  event: BeatEvent | null;
  pulseId: number;
  accents: AccentLevel[];
  timeSignature: TimeSignature;
  onCycleAccent: (index: number) => void;
}

export function BeatVisualizer({ event, pulseId, accents, timeSignature, onCycleAccent }: BeatVisualizerProps) {
  const currentBeat = event?.beatIndex ?? 0;
  const groups = groupedBeatIndexes(timeSignature);
  const isStrong = event?.accent === "strong" || event?.phase === "count-in";

  return (
    <section className="flex flex-col items-center gap-5" aria-label="박 시각화">
      <div
        key={pulseId}
        className="grid h-32 w-32 place-items-center rounded-full border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_85%,transparent)]"
      >
        <div
          className={`grid place-items-center rounded-full border text-sm font-bold transition ${
            isStrong ? "h-24 w-24 border-[color:var(--accent)] text-[color:var(--accent)]" : "h-20 w-20 border-[color:var(--subtle)] text-[color:var(--muted)]"
          } animate-[pulse_180ms_ease-out]`}
        >
          {event?.phase === "count-in" ? event.countInRemainingBeats : currentBeat + 1}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3" role="group" aria-label="비트 도트와 악센트">
        {groups.map((group, groupIndex) => (
          <div className="flex items-center gap-2" key={`group-${groupIndex}`}>
            {group.map((beatIndex) => {
              const accent = accents[beatIndex] ?? "normal";
              const active = currentBeat === beatIndex;
              const size = accent === "strong" ? "h-8 w-8" : accent === "soft" ? "h-5 w-5" : "h-6 w-6";
              const tone =
                accent === "mute"
                  ? "border-dashed bg-transparent text-[color:var(--subtle)]"
                  : active
                    ? "bg-[color:var(--accent)] text-[color:var(--bg)]"
                    : "bg-[color:var(--panel-2)] text-[color:var(--muted)]";
              return (
                <button
                  key={beatIndex}
                  type="button"
                  className={`touch-target grid place-items-center rounded-full border border-[color:var(--border)] text-[10px] font-bold ${size} ${tone}`}
                  aria-label={`${beatIndex + 1}박 악센트 ${ACCENT_LABELS[accent]} 변경`}
                  title={`${beatIndex + 1}: ${ACCENT_LABELS[accent]}`}
                  onClick={() => onCycleAccent(beatIndex)}
                >
                  {ACCENT_LABELS[accent]}
                </button>
              );
            })}
            {groupIndex < groups.length - 1 ? <span className="text-[color:var(--subtle)]" aria-hidden="true">|</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
