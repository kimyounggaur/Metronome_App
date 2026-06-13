import { Minus, Plus, Square, Play, Hand } from "lucide-react";
import { useEffect, useRef } from "react";

interface TransportBarProps {
  bpm: number;
  isPlaying: boolean;
  onToggle: () => void;
  onTap: () => void;
  onNudge: (delta: number) => void;
  onSetBpm: (bpm: number) => void;
}

function useRepeatPress(callback: () => void) {
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, []);

  return {
    onPointerDown: () => {
      callback();
      timeoutRef.current = window.setTimeout(() => {
        intervalRef.current = window.setInterval(callback, 80);
      }, 360);
    },
    onPointerUp: () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      timeoutRef.current = null;
      intervalRef.current = null;
    },
    onPointerLeave: () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      timeoutRef.current = null;
      intervalRef.current = null;
    },
  };
}

export function TransportBar({ bpm, isPlaying, onToggle, onTap, onNudge, onSetBpm }: TransportBarProps) {
  const minusFive = useRepeatPress(() => onNudge(-5));
  const minusOne = useRepeatPress(() => onNudge(-1));
  const plusOne = useRepeatPress(() => onNudge(1));
  const plusFive = useRepeatPress(() => onNudge(5));

  return (
    <section className="flex flex-col gap-4" aria-label="하단 재생 컨트롤">
      <label className="sr-only" htmlFor="bpm-slider">
        BPM 슬라이더
      </label>
      <input
        id="bpm-slider"
        className="h-10 w-full accent-[color:var(--accent)]"
        type="range"
        min={30}
        max={300}
        value={bpm}
        aria-label="BPM 슬라이더"
        onChange={(event) => onSetBpm(Number(event.target.value))}
      />

      <div className="grid grid-cols-4 gap-3">
        <button className="touch-target rounded-2xl surface-2 font-bold" type="button" aria-label="BPM 5 감소" {...minusFive}>
          -5
        </button>
        <button className="touch-target rounded-2xl surface-2 font-bold" type="button" aria-label="BPM 1 감소" {...minusOne}>
          <Minus size={20} aria-hidden="true" />
        </button>
        <button className="touch-target rounded-2xl surface-2 font-bold" type="button" aria-label="BPM 1 증가" {...plusOne}>
          <Plus size={20} aria-hidden="true" />
        </button>
        <button className="touch-target rounded-2xl surface-2 font-bold" type="button" aria-label="BPM 5 증가" {...plusFive}>
          +5
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <button className="touch-target h-14 rounded-2xl surface-2 font-bold" type="button" aria-label="탭 템포" onClick={onTap}>
          <span className="inline-flex items-center justify-center gap-2">
            <Hand size={18} aria-hidden="true" />
            TAP
          </span>
        </button>
        <button
          className="grid h-[88px] w-[88px] place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] shadow-glow"
          type="button"
          aria-label={isPlaying ? "정지" : "재생"}
          onClick={onToggle}
        >
          {isPlaying ? <Square size={34} fill="currentColor" aria-hidden="true" /> : <Play size={38} fill="currentColor" aria-hidden="true" />}
        </button>
        <div className="flex min-w-0 justify-end">
          <div className="grid h-14 w-14 place-items-center rounded-2xl surface-2" aria-hidden="true">
            <span className="h-2 w-8 rounded-full bg-[color:var(--accent)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
