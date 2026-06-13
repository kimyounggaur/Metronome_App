import { ChevronLeft, ChevronRight, Play, Square } from "lucide-react";
import type { AccentLevel, BeatEvent } from "../domain/types";

interface BigDisplayProps {
  bpm: number;
  accents: AccentLevel[];
  event: BeatEvent | null;
  isPlaying: boolean;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function BigDisplay({ bpm, accents, event, isPlaying, onToggle, onPrevious, onNext }: BigDisplayProps) {
  const activeBeat = event?.beatIndex ?? 0;

  return (
    <main className="app-screen grid grid-cols-[96px_1fr_96px] items-center gap-4">
      <button className="touch-target grid h-28 place-items-center rounded-3xl surface-2" type="button" aria-label="이전 프리셋" onClick={onPrevious}>
        <ChevronLeft size={44} aria-hidden="true" />
      </button>
      <section className="flex min-w-0 flex-col items-center justify-center gap-5 text-center" aria-label="가로 빅 디스플레이">
        <div className="tabular text-[clamp(7rem,30vw,16rem)] font-black leading-none">{bpm}</div>
        <div className="flex max-w-full flex-wrap justify-center gap-4">
          {accents.map((accent, index) => (
            <span
              key={index}
              className={`block rounded-full border border-[color:var(--border)] ${activeBeat === index ? "bg-[color:var(--accent)]" : "bg-[color:var(--panel-2)]"} ${
                accent === "strong" ? "h-10 w-10" : accent === "soft" ? "h-6 w-6" : "h-8 w-8"
              } ${accent === "mute" ? "border-dashed opacity-60" : ""}`}
              aria-label={`${index + 1}박 ${accent}`}
            />
          ))}
        </div>
        <button
          className="grid h-24 w-24 place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] shadow-glow"
          type="button"
          aria-label={isPlaying ? "정지" : "재생"}
          onClick={onToggle}
        >
          {isPlaying ? <Square size={38} fill="currentColor" aria-hidden="true" /> : <Play size={42} fill="currentColor" aria-hidden="true" />}
        </button>
      </section>
      <button className="touch-target grid h-28 place-items-center rounded-3xl surface-2" type="button" aria-label="다음 프리셋" onClick={onNext}>
        <ChevronRight size={44} aria-hidden="true" />
      </button>
    </main>
  );
}
