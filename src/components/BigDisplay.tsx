import { ChevronLeft, ChevronRight, Play, Square, ArrowLeft, Minus, Plus } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { ACCENT_LABELS } from "../domain/rhythm";
import { CellPulse } from "./CellPulse";
import { MeterSummary } from "./MeterSummary";
import type { AccentLevel, BeatEvent, TempoUnit, TimeSignature } from "../domain/types";

interface BigDisplayProps {
  bpm: number;
  accents: AccentLevel[];
  event: BeatEvent | null;
  pulseId: number;
  beatGroups?: number[];
  status: ReactNode;
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

export function BigDisplay({ bpm, accents, event, pulseId, beatGroups, status, isPlaying, onToggle, onPrevious, onNext, onExit, onNudge, presetName = "기본", timeSignature, tempoUnit = "quarter" }: BigDisplayProps) {
  const playButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { playButton.current?.focus({ preventScroll: true }); }, []);
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
        <button className="touch-target grid h-24 place-items-center rounded-3xl surface-2" type="button" aria-label="이전 셋리스트 항목" onClick={onPrevious}><ChevronLeft size={32} aria-hidden="true" /></button>
        <section className="performance-controls flex min-w-0 flex-col items-center justify-center gap-4 text-center" aria-label="공연 화면">
          <div className="performance-bpm tabular font-black leading-none">{bpm}</div>
          {timeSignature && <MeterSummary bpm={bpm} timeSignature={timeSignature} tempoUnit={tempoUnit} beatGroups={beatGroups} />}
          <div className="flex max-w-full flex-wrap items-center justify-center gap-3" role="group" aria-label="현재 박">
            {accents.map((accent, index) => (
              <span key={index} role="img" className={`block rounded-full border border-[color:var(--border)] ${activeBeat === index ? "bg-[color:var(--accent)]" : "bg-[color:var(--panel-2)]"} ${accent === "strong" ? "h-8 w-8" : accent === "soft" ? "h-5 w-5" : "h-6 w-6"} ${accent === "mute" ? "border-dashed opacity-60" : ""}`} aria-label={`${index + 1}박 ${ACCENT_LABELS[accent]}`} />
            ))}
          </div>
          <CellPulse pulseId={pulseId} visible={activeBeat !== undefined} />
          <div className="performance-transport flex flex-wrap items-center justify-center gap-4">
            <button className="touch-target grid h-14 w-14 place-items-center rounded-2xl surface-2" type="button" aria-label="BPM 1 감소" onClick={() => onNudge?.(-1)}><Minus aria-hidden="true" /></button>
            <button ref={playButton} className="grid h-20 w-20 place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] shadow-glow" type="button" aria-label={isPlaying ? "정지" : "재생"} onClick={onToggle}>
              {isPlaying ? <Square size={34} fill="currentColor" aria-hidden="true" /> : <Play size={38} fill="currentColor" aria-hidden="true" />}
            </button>
            <button className="touch-target grid h-14 w-14 place-items-center rounded-2xl surface-2" type="button" aria-label="BPM 1 증가" onClick={() => onNudge?.(1)}><Plus aria-hidden="true" /></button>
          </div>
        </section>
        <button className="touch-target grid h-24 place-items-center rounded-3xl surface-2" type="button" aria-label="다음 셋리스트 항목" onClick={onNext}><ChevronRight size={32} aria-hidden="true" /></button>
      </div>
      <div className="performance-status">{status}</div>
    </main>
  );
}
