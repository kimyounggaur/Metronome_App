import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ENGINE_DIAGNOSTICS_ENABLED, MetronomeEngine, settingsForEngine, type EngineSnapshot, type SettingsSource, type TransportState } from "../audio/MetronomeEngine";
import { clampBpm } from "../domain/tempo";
import type { AppSettings, BeatEvent } from "../domain/types";
import { EMERGENCY_STOP_EVENT } from "../components/ErrorBoundary";

interface UseMetronomeOptions {
  settings: AppSettings;
  setSettings: (value: AppSettings | ((current: AppSettings) => AppSettings)) => void;
  onToast: (message: string) => void;
  onBeatSideEffect: (event: BeatEvent) => void;
}
export interface MetronomeControls {
  isPlaying: boolean;
  transportState: TransportState;
  error: string | null;
  pendingSettings: boolean;
  currentEvent: BeatEvent | null;
  pulseId: number;
  timerRemainingSeconds: number | null;
  setBpm: (bpm: number) => void;
  nudgeBpm: (delta: number) => void;
  queuePreset: (settings: AppSettings) => void;
  applySettings: (settings: AppSettings, source?: SettingsSource) => void;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => Promise<void>;
}
const idleSnapshot: EngineSnapshot = { state: "idle", error: null, sessionId: 0, currentEvent: null, pendingSettings: false,
  timerRemainingSeconds: null, timerDeadline: null, mainStartedAt: null };
declare global {
  interface Window {
    __pulseDiagnostics?: { getSnapshot: () => EngineSnapshot; getDiagnostics: () => ReturnType<MetronomeEngine["getDiagnostics"]> };
  }
}
export function useMetronome(options: UseMetronomeOptions): MetronomeControls {
  const latest = useRef(options);
  latest.current = options;
  const engineRef = useRef<MetronomeEngine | null>(null);
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(idleSnapshot);
  const [pulseId, setPulseId] = useState(0);
  useEffect(() => {
    const engine = new MetronomeEngine(settingsForEngine(latest.current.settings), { onBeat: (event) => {
      setPulseId((id) => id + 1);
      latest.current.onBeatSideEffect(event);
    } });
    engineRef.current = engine;
    const diagnostics = { getSnapshot: engine.getSnapshot, getDiagnostics: () => engine.getDiagnostics() };
    if (ENGINE_DIAGNOSTICS_ENABLED) window.__pulseDiagnostics = diagnostics;
    const unsubscribe = engine.subscribe(() => {
      const next = engine.getSnapshot();
      setSnapshot(next);
      if (next.state !== "playing") setPulseId(0);
    });
    const emergencyStop = () => engine.stop();
    window.addEventListener(EMERGENCY_STOP_EVENT, emergencyStop);
    return () => {
      window.removeEventListener(EMERGENCY_STOP_EVENT, emergencyStop);
      unsubscribe();
      engine.dispose();
      if (window.__pulseDiagnostics === diagnostics) delete window.__pulseDiagnostics;
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, []);
  useEffect(() => { engineRef.current?.updateSettings(settingsForEngine(options.settings)); }, [options.settings]);
  const applySettings = useCallback((settings: AppSettings, source: SettingsSource = "settings") => {
    engineRef.current?.updateSettings(settingsForEngine(settings), source);
  }, []);
  const queuePreset = useCallback((settings: AppSettings) => applySettings(settings, "preset"), [applySettings]);
  const setBpm = useCallback((bpm: number) => {
    const current = latest.current.settings;
    const next = { ...current, bpm: clampBpm(bpm), practice: { ...current.practice, speedTrainer: { ...current.practice.speedTrainer, enabled: false } } };
    applySettings(next, "manual");
    latest.current.setSettings(next);
  }, [applySettings]);
  const nudgeBpm = useCallback((delta: number) => {
    const settings = latest.current.settings;
    const speed = settings.practice.speedTrainer;
    const base = speed.enabled ? engineRef.current?.getSnapshot().currentEvent?.bpm ?? speed.startBpm : settings.bpm;
    setBpm(base + delta);
  }, [setBpm]);
  const start = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      await engine.start();
      if (engine.getSnapshot().state === "playing") latest.current.onToast("재생 시작");
    } catch { latest.current.onToast("오디오 시작 실패 · 재생을 눌러 다시 시도하세요"); }
  }, []);
  const stop = useCallback(() => { engineRef.current?.stop(); latest.current.onToast("정지"); }, []);
  const toggle = useCallback(async () => {
    const state = engineRef.current?.getSnapshot().state;
    if (state === "playing" || state === "starting") stop(); else await start();
  }, [start, stop]);
  return useMemo(() => ({ isPlaying: snapshot.state === "playing", transportState: snapshot.state, error: snapshot.error,
    pendingSettings: snapshot.pendingSettings, currentEvent: snapshot.currentEvent, pulseId,
    timerRemainingSeconds: snapshot.timerRemainingSeconds, setBpm, nudgeBpm, queuePreset, applySettings, start, stop, toggle }),
    [snapshot, pulseId, setBpm, nudgeBpm, queuePreset, applySettings, start, stop, toggle]);
}
