import { Minus, Plus, Square, Play, Hand } from "lucide-react";
import { memo, useEffect, useRef, type MouseEvent, type PointerEvent, type KeyboardEvent } from "react";

interface TransportBarProps {
  bpm: number;
  isPlaying: boolean;
  onToggle: () => void;
  onTap: () => void;
  tapCount?: number;
  onNudge: (delta: number) => void;
  onSetBpm: (bpm: number) => void;
}

function useRepeatPress(callback: () => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const suppressPointerClick = useRef(false);

  function stop() {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }

  useEffect(() => {
    const onHidden = () => { if (document.hidden) stop(); };
    window.addEventListener("blur", stop);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      stop();
      window.removeEventListener("blur", stop);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      stop();
      suppressPointerClick.current = true;
      callbackRef.current();
      timeoutRef.current = window.setTimeout(() => {
        callbackRef.current();
        intervalRef.current = window.setInterval(() => callbackRef.current(), 80);
      }, 360);
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    onLostPointerCapture: stop,
    onBlur: stop,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.repeat && (event.key === "Enter" || event.code === "Space")) event.preventDefault();
    },
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      if (event.detail > 0 && suppressPointerClick.current) {
        suppressPointerClick.current = false;
        return;
      }
      suppressPointerClick.current = false;
      callbackRef.current();
    },
  };
}

export const TransportBar = memo(function TransportBar({ bpm, isPlaying, onToggle, onTap, tapCount = 0, onNudge, onSetBpm }: TransportBarProps) {
  const minusFive = useRepeatPress(() => onNudge(-5));
  const minusOne = useRepeatPress(() => onNudge(-1));
  const plusOne = useRepeatPress(() => onNudge(1));
  const plusFive = useRepeatPress(() => onNudge(5));

  return (
    <section className="transport-bar flex flex-col gap-3" aria-label="하단 재생 컨트롤">
      <label className="sr-only" htmlFor="bpm-slider">BPM 슬라이더</label>
      <input id="bpm-slider" className="h-10 w-full accent-[color:var(--accent)]" type="range" min={30} max={300} value={bpm} aria-label="BPM 슬라이더" onChange={(event) => onSetBpm(Number(event.target.value))} />
      <div className="grid grid-cols-4 gap-3">
        <button className="touch-target grid place-items-center rounded-2xl surface-2 font-bold" type="button" aria-label="BPM 5 감소" {...minusFive}>-5</button>
        <button className="touch-target grid place-items-center rounded-2xl surface-2 font-bold" type="button" aria-label="BPM 1 감소" {...minusOne}><Minus size={20} aria-hidden="true" /></button>
        <button className="touch-target grid place-items-center rounded-2xl surface-2 font-bold" type="button" aria-label="BPM 1 증가" {...plusOne}><Plus size={20} aria-hidden="true" /></button>
        <button className="touch-target grid place-items-center rounded-2xl surface-2 font-bold" type="button" aria-label="BPM 5 증가" {...plusFive}>+5</button>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <button className="touch-target h-14 rounded-2xl surface-2 font-bold" type="button" aria-label="탭 템포" aria-describedby="tap-help" onClick={onTap}>
          <span className="inline-flex items-center justify-center gap-2"><Hand size={18} aria-hidden="true" />TAP</span>
        </button>
        <button className="transport-play grid h-[88px] w-[88px] place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] shadow-glow" type="button" aria-label={isPlaying ? "정지" : "재생"} onClick={onToggle}>
          {isPlaying ? <Square size={34} fill="currentColor" aria-hidden="true" /> : <Play size={38} fill="currentColor" aria-hidden="true" />}
        </button>
        <p id="tap-help" className="min-w-0 text-center text-xs leading-relaxed text-[color:var(--muted)]">
          4번 탭해<br />템포 맞추기<br /><span aria-live="polite">{Math.min(tapCount, 4)}/4</span>
        </p>
      </div>
    </section>
  );
});
