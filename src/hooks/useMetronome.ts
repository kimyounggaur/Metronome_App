import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ENGINE_DIAGNOSTICS_ENABLED, MetronomeEngine, settingsForEngine, type EngineSnapshot, type SettingsSource, type TransportState } from "../audio/MetronomeEngine";
import { clampBpm } from "../domain/tempo";
import type { AppSettings, BeatEvent } from "../domain/types";
import { EMERGENCY_STOP_EVENT } from "../components/ErrorBoundary";

interface UseMetronomeOptions {
  activePresetId?: string | null;
  settings: AppSettings;
  setSettings: (value: AppSettings | ((current: AppSettings) => AppSettings)) => void;
  onBeatSideEffect: (event: BeatEvent) => void;
}
export interface MetronomeControls {
  isPlaying: boolean;
  transportState: TransportState;
  error: string | null;
  pendingSettings: boolean;
  currentEvent: BeatEvent | null;
  pulseId: number;
  currentCellStart: BeatEvent | null;
  displayBpm: number;
  beginBpmDrag: () => void;
  cancelBpmDrag: () => void;
  timerRemainingSeconds: number | null;
  setBpm: (bpm: number) => void;
  nudgeBpm: (delta: number) => void;
  queuePreset: (settings: AppSettings, presetId?: string | null) => void;
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
function tempoForDisplay(settings: AppSettings, snapshot: EngineSnapshot, target: number | null): number {
  if (snapshot.state !== "playing" && snapshot.state !== "starting") return settings.bpm;
  const firstBpm = settings.practice.speedTrainer.enabled ? settings.practice.speedTrainer.startBpm : settings.bpm;
  return target ?? snapshot.currentEvent?.bpm ?? firstBpm;
}
export function useMetronome(options: UseMetronomeOptions): MetronomeControls {
  const latest = useRef(options);
  latest.current = options;
  const requestedSettings = useRef(options.settings);
  const engineRef = useRef<MetronomeEngine | null>(null);
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(idleSnapshot);
  const [pulseId, setPulseId] = useState(0);
  const [currentCellStart, setCurrentCellStart] = useState<BeatEvent | null>(null);
  const manualTarget = useRef<number | null>(null);
  const displayBpm = tempoForDisplay(options.settings, snapshot, manualTarget.current);
  const displayed = useRef(displayBpm);
  displayed.current = displayBpm;
  const dragOrigin = useRef<{ bpm: number; speedEnabled: boolean; restoreTransport?: () => number | undefined } | null>(null);
  useEffect(() => {
    const engine = new MetronomeEngine(settingsForEngine(latest.current.settings), { onBeat: (event, cellStart) => {
      if (event.bpm === manualTarget.current) manualTarget.current = null;
      if (!event.showVisual) setCurrentCellStart(null);
      else if (cellStart) {
        setCurrentCellStart(cellStart);
        setPulseId(id => id + 1);
        latest.current.onBeatSideEffect(cellStart);
      }
    } });
    engineRef.current = engine;
    const diagnostics = { getSnapshot: engine.getSnapshot, getDiagnostics: () => engine.getDiagnostics() };
    if (ENGINE_DIAGNOSTICS_ENABLED) window.__pulseDiagnostics = diagnostics;
    const unsubscribe = engine.subscribe(() => {
      const next = engine.getSnapshot();
      setSnapshot(next);
      if (next.state !== "playing") {
        manualTarget.current = null;
        setPulseId(0);
        setCurrentCellStart(null);
      }
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
  const selectedPreset = useRef(options.activePresetId);
  useEffect(() => {
    requestedSettings.current = options.settings;
    if (manualTarget.current !== options.settings.bpm) manualTarget.current = null;
    const settings = settingsForEngine(options.settings);
    if (selectedPreset.current !== options.activePresetId) {
      selectedPreset.current = options.activePresetId;
      manualTarget.current = null;
      dragOrigin.current = null;
      engineRef.current?.updateSettings(settings, "preset", options.activePresetId ?? null);
    } else {
      engineRef.current?.updateSettings(settings);
    }
  }, [options.settings, options.activePresetId]);
  const applySettings = useCallback((settings: AppSettings, source: SettingsSource = "settings") => {
    requestedSettings.current = settings;
    engineRef.current?.updateSettings(settingsForEngine(settings), source);
  }, []);
  const queuePreset = useCallback((settings: AppSettings, presetId?: string | null) => {
    dragOrigin.current = null;
    manualTarget.current = null;
    requestedSettings.current = settings;
    engineRef.current?.updateSettings(settingsForEngine(settings), "preset", presetId);
  }, []);
  const setBpm = useCallback((value: number) => {
    const bpm = clampBpm(value);
    if (bpm === displayed.current) return;
    const change = (current: AppSettings): AppSettings => ({
      ...current, bpm, practice: { ...current.practice, speedTrainer: { ...current.practice.speedTrainer, enabled: false } },
    });
    displayed.current = bpm;
    manualTarget.current = engineRef.current?.isActive ? bpm : null;
    applySettings(change(requestedSettings.current), "manual");
    latest.current.setSettings(change);
  }, [applySettings]);
  const nudgeBpm = useCallback((delta: number) => setBpm(displayed.current + delta), [setBpm]);
  const beginBpmDrag = useCallback(() => {
    const current = requestedSettings.current;
    dragOrigin.current = { bpm: current.bpm, speedEnabled: current.practice.speedTrainer.enabled, restoreTransport: engineRef.current?.captureTempoRollback() };
  }, []);
  const cancelBpmDrag = useCallback(() => {
    const origin = dragOrigin.current;
    if (!origin) return;
    dragOrigin.current = null;
    manualTarget.current = null;
    const restore = (current: AppSettings): AppSettings => ({
      ...current, bpm: origin.bpm, practice: { ...current.practice, speedTrainer: { ...current.practice.speedTrainer, enabled: origin.speedEnabled } },
    });
    applySettings(restore(requestedSettings.current));
    origin.restoreTransport?.();
    latest.current.setSettings(restore);
  }, [applySettings]);
  const start = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.start(latest.current.activePresetId).catch(() => {
      // The engine publishes its transport error through the snapshot subscription.
    });
  }, []);
  const stop = useCallback(() => { engineRef.current?.stop(); }, []);
  const toggle = useCallback(async () => {
    const state = engineRef.current?.getSnapshot().state;
    if (state === "playing" || state === "starting") stop(); else await start();
  }, [start, stop]);
  return useMemo(() => ({ isPlaying: snapshot.state === "playing", transportState: snapshot.state, error: snapshot.error,
    pendingSettings: snapshot.pendingSettings, currentEvent: snapshot.currentEvent, pulseId,
    displayBpm, currentCellStart, beginBpmDrag, cancelBpmDrag,
    timerRemainingSeconds: snapshot.timerRemainingSeconds, setBpm, nudgeBpm, queuePreset, applySettings, start, stop, toggle }),
    [snapshot, pulseId, displayBpm, currentCellStart, beginBpmDrag, cancelBpmDrag, setBpm, nudgeBpm, queuePreset, applySettings, start, stop, toggle]);
}
