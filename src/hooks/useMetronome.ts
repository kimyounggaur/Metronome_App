import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MetronomeEngine, settingsForEngine } from "../audio/MetronomeEngine";
import { nextSpeedTrainerBpm } from "../domain/practiceModes";
import { clampBpm } from "../domain/tempo";
import type { AppSettings, BeatEvent } from "../domain/types";

interface UseMetronomeOptions {
  settings: AppSettings;
  setSettings: (value: AppSettings | ((current: AppSettings) => AppSettings)) => void;
  onToast: (message: string) => void;
  onBeatSideEffect: (event: BeatEvent) => void;
}

export interface MetronomeControls {
  isPlaying: boolean;
  currentEvent: BeatEvent | null;
  pulseId: number;
  timerRemainingSeconds: number | null;
  setBpm: (bpm: number) => void;
  nudgeBpm: (delta: number) => void;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => Promise<void>;
}

export function useMetronome({ settings, setSettings, onToast, onBeatSideEffect }: UseMetronomeOptions): MetronomeControls {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<BeatEvent | null>(null);
  const [pulseId, setPulseId] = useState(0);
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number | null>(null);
  const settingsRef = useRef(settings);
  const isPlayingRef = useRef(false);
  const lastSpeedBarRef = useRef(-1);

  const handleBeat = useCallback(
    (event: BeatEvent) => {
      setCurrentEvent(event);
      setPulseId((id) => id + 1);
      onBeatSideEffect(event);

      const liveSettings = settingsRef.current;
      const speed = liveSettings.practice.speedTrainer;
      const isNewMainBar = event.phase === "main" && event.subIndex === 0 && event.beatIndex === 0 && event.barIndex > 0;

      if (!speed.enabled || !isNewMainBar || lastSpeedBarRef.current === event.barIndex) return;
      lastSpeedBarRef.current = event.barIndex;

      if (event.barIndex % Math.max(1, speed.everyBars) === 0) {
        const next = nextSpeedTrainerBpm(liveSettings.bpm, speed.targetBpm, speed.step, speed.onReach, speed.startBpm);
        setSettings((current) => ({ ...current, bpm: next.bpm }));
        onToast(`${next.bpm} BPM`);
        if (next.shouldStop) {
          stopInternal();
        }
      }
    },
    [onBeatSideEffect, onToast, setSettings],
  );

  const engineRef = useRef<MetronomeEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new MetronomeEngine(settingsForEngine(settings), { onBeat: handleBeat });
  }

  useEffect(() => {
    settingsRef.current = settings;
    engineRef.current?.updateSettings(settingsForEngine(settings));
  }, [settings]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!timerEndsAt || !isPlaying) {
      setTimerRemainingSeconds(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
      setTimerRemainingSeconds(remaining);
      if (remaining <= 0) {
        stopInternal();
        onToast("타이머 종료");
      }
    };

    tick();
    const timerId = window.setInterval(tick, 250);
    return () => window.clearInterval(timerId);
  }, [isPlaying, onToast, timerEndsAt]);

  function stopInternal(): void {
    engineRef.current?.stop();
    setIsPlaying(false);
    setTimerEndsAt(null);
  }

  const setBpm = useCallback(
    (bpm: number) => {
      setSettings((current) => ({ ...current, bpm: clampBpm(bpm) }));
    },
    [setSettings],
  );

  const nudgeBpm = useCallback(
    (delta: number) => {
      setSettings((current) => ({ ...current, bpm: clampBpm(current.bpm + delta) }));
    },
    [setSettings],
  );

  const start = useCallback(async () => {
    const liveSettings = settingsRef.current;
    const speed = liveSettings.practice.speedTrainer;
    const startSettings = speed.enabled ? { ...liveSettings, bpm: speed.startBpm } : liveSettings;

    if (speed.enabled) {
      setSettings(startSettings);
      settingsRef.current = startSettings;
      engineRef.current?.updateSettings(settingsForEngine(startSettings));
    }

    lastSpeedBarRef.current = -1;
    setIsPlaying(true);
    onToast("재생 시작");

    if (startSettings.practice.timerMinutes) {
      setTimerEndsAt(Date.now() + startSettings.practice.timerMinutes * 60 * 1000);
    }

    engineRef.current?.start().catch(() => {
      stopInternal();
      onToast("오디오 시작 실패");
    });
  }, [onToast, setSettings]);

  const stop = useCallback(() => {
    stopInternal();
    onToast("정지");
  }, [onToast]);

  const toggle = useCallback(async () => {
    if (isPlayingRef.current) {
      stop();
      return;
    }

    await start();
  }, [start, stop]);

  return useMemo(
    () => ({
      isPlaying,
      currentEvent,
      pulseId,
      timerRemainingSeconds,
      setBpm,
      nudgeBpm,
      start,
      stop,
      toggle,
    }),
    [currentEvent, isPlaying, nudgeBpm, pulseId, setBpm, start, stop, timerRemainingSeconds, toggle],
  );
}
