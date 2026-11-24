import { memo } from "react";
import { CellPulse } from "./CellPulse";
import { ACCENT_LABELS, groupedBeatIndexes } from "../domain/rhythm";
import type { AccentLevel, BeatEvent, TimeSignature } from "../domain/types";

interface BeatVisualizerProps {
  event: BeatEvent | null;
  pulseId: number;
  accents: AccentLevel[];
  timeSignature: TimeSignature;
  beatGroups?: number[];
  disabledFromBeat?: number;
  onCycleAccent: (index: number) => void;
}

export const BeatVisualizer = memo(function BeatVisualizer({ event, pulseId, accents, timeSignature, beatGroups, disabledFromBeat, onCycleAccent }: BeatVisualizerProps) {
  const currentBeat = event?.showVisual ? event.beatIndex : null;
  const groups = groupedBeatIndexes(timeSignature,beatGroups);
  const isStrong = event?.showVisual && (accents[event.beatIndex] === "strong" || event.phase === "count-in");

  return (
    <section className="flex flex-col items-center gap-5" aria-label="박 시각화">
      <div
        className="grid h-32 w-32 place-items-center rounded-full border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_85%,transparent)]"
      >
        <div
          className={`beat-readout flex flex-col items-center justify-center gap-1 rounded-full border text-sm font-bold ${
            isStrong ? "h-24 w-24 border-[color:var(--accent)] text-[color:var(--accent)]" : "h-20 w-20 border-[color:var(--subtle)] text-[color:var(--muted)]"
          }`}
        >
          {currentBeat === null ? "—" : event?.phase === "count-in" ? event.countInRemainingBeats : currentBeat + 1}
          <CellPulse pulseId={pulseId} visible={currentBeat !== null} />
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-3" role="group" aria-label="비트 도트와 악센트">
        {groups.map((group, groupIndex) => (
          <div className={"beat-group" + (groups.length > 1 ? " beat-group-marked" : "")} role="group" aria-label={`${groupIndex + 1}그룹 · ${group.length}칸`} key={`group-${groupIndex}`}>
            {group.map((beatIndex) => {
              const accent = accents[beatIndex] ?? "normal";
              const active = currentBeat === beatIndex;
              const size = accent === "strong" ? "h-8 w-8" : accent === "soft" ? "h-5 w-5" : "h-6 w-6";
              const tone =
                accent === "mute"
                  ? "border-dashed bg-transparent text-[color:var(--muted)]"
                  : active
                    ? "bg-[color:var(--accent)] text-[color:var(--bg)]"
                    : "bg-[color:var(--panel-2)] text-[color:var(--muted)]";
              return (
                <button
                  key={beatIndex}
                  type="button"
                  disabled={disabledFromBeat !== undefined && beatIndex >= disabledFromBeat}
                  className={`touch-target grid place-items-center rounded-full border border-[color:var(--border)] text-xs font-bold ${size} ${tone}`}
                  aria-label={`${beatIndex + 1}박 악센트 ${ACCENT_LABELS[accent]} 변경`}
                  title={disabledFromBeat !== undefined && beatIndex >= disabledFromBeat ? "박자표 전환 후 편집할 수 있습니다" : `${beatIndex + 1}: ${ACCENT_LABELS[accent]}`}
                  onClick={() => onCycleAccent(beatIndex)}
                >
                  {ACCENT_LABELS[accent]}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
});
