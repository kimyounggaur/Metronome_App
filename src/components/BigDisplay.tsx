import { ChevronLeft, ChevronRight, Play, Square, ArrowLeft, Minus, Plus } from "lucide-react";
import type { AccentLevel, BeatEvent, TempoUnit, TimeSignature } from "../domain/types";
import { tempoUnitLabels } from "./BpmDisplay";

interface BigDisplayProps {
  bpm: number;
  accents: AccentLevel[];
  event: BeatEvent | null;
  isPlaying: boolean;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onExit?: () => void;
  onNudge?: (delta: number) => void;
  presetName?: string;
  timeSignature?: TimeSignature;
  tempoUnit?: TempoUnit;
}

export function BigDisplay({ bpm, accents, event, isPlaying, onToggle, onPrevious, onNext, onExit, onNudge, presetName = "기본", timeSignature, tempoUnit = "quarter" }: BigDisplayProps) {
  const activeBeat = isPlaying && event?.showVisual ? event.beatIndex : undefined;

  return (
    <main className="app-screen performance-screen mx-auto max-w-[1440px]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <button className="touch-target inline-flex items-center gap-2 rounded-2xl px-4 surface-2" type="button" onClick={onExit} aria-label="일반 화면으로">
          <ArrowLeft size={18} aria-hidden="true" />일반 화면으로
        </button>
        <h1 className="min-w-0 break-words text-lg font-bold">{presetName}{timeSignature ? ` · ${timeSignature.beats}/${timeSignature.noteValue}` : ""}</h1>
      </header>
      <div className="performance-content grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 sm:grid-cols-[72px_minmax(0,1fr)_72px] sm:gap-4">
        <button className="touch-target grid h-24 place-items-center rounded-3xl surface-2" type="button" aria-label="이전 프리셋" onClick={onPrevious}><ChevronLeft size={32} aria-hidden="true" /></button>
        <section className="flex min-w-0 flex-col items-center justify-center gap-4 text-center" aria-label="공연 화면">
          <div className="performance-bpm tabular font-black leading-none">{bpm}</div>
          <p className="text-sm text-[color:var(--muted)]">{tempoUnitLabels[tempoUnit]} = BPM</p>
          <div className="flex max-w-full flex-wrap items-center justify-center gap-3" aria-label="현재 박">
            {accents.map((accent, index) => (
              <span key={index} className={`block rounded-full border border-[color:var(--border)] ${activeBeat === index ? "bg-[color:var(--accent)]" : "bg-[color:var(--panel-2)]"} ${accent === "strong" ? "h-8 w-8" : accent === "soft" ? "h-5 w-5" : "h-6 w-6"} ${accent === "mute" ? "border-dashed opacity-60" : ""}`} aria-label={`${index + 1}박 ${accent}`} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button className="touch-target grid h-14 w-14 place-items-center rounded-2xl surface-2" type="button" aria-label="BPM 1 감소" onClick={() => onNudge?.(-1)}><Minus aria-hidden="true" /></button>
            <button className="grid h-20 w-20 place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] shadow-glow" type="button" aria-label={isPlaying ? "정지" : "재생"} onClick={onToggle}>
              {isPlaying ? <Square size={34} fill="currentColor" aria-hidden="true" /> : <Play size={38} fill="currentColor" aria-hidden="true" />}
            </button>
            <button className="touch-target grid h-14 w-14 place-items-center rounded-2xl surface-2" type="button" aria-label="BPM 1 증가" onClick={() => onNudge?.(1)}><Plus aria-hidden="true" /></button>
          </div>
        </section>
        <button className="touch-target grid h-24 place-items-center rounded-3xl surface-2" type="button" aria-label="다음 프리셋" onClick={onNext}><ChevronRight size={32} aria-hidden="true" /></button>
      </div>
    </main>
  );
}
