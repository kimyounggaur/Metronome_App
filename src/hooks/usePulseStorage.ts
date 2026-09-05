import { useCallback, useEffect, useRef, useState } from "react";
import { createDefaultData } from "../domain/presets";
import { mergeBackup, parseBackup } from "../domain/migration";
import { formatIssues, validatePulseData } from "../domain/schema";
import type { AppSettings, MetronomePreset, PulseData, Setlist } from "../domain/types";
import { downloadText, loadPulseData, RECOVERY_KEY, SAVE_FAILURE, savePulseData, type LoadedPulse } from "../storage/pulseStorage";

export type DataUpdate<T> = T | ((current: T) => T);
export const SETTINGS_SAVE_DELAY_MS = 180;
export function usePulseStorage() {
  const [initial] = useState<LoadedPulse>(() => { try { return loadPulseData(window.localStorage); } catch { return { data: createDefaultData(), storageError: SAVE_FAILURE, recoveryRaw: null }; } });
  const [data, updateData] = useState(initial.data);
  const dataRef = useRef(data);
  const [storageError, setStorageError] = useState(initial.storageError);
  const [recoveryRaw, setRecoveryRaw] = useState(initial.recoveryRaw);
  const recoveryRef = useRef(recoveryRaw);
  const dirtyRef = useRef(false);
  const [hasPendingSave, setHasPendingSave] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const flush = useCallback((): boolean => {
    if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (recoveryRef.current !== null) return false;
    if (!dirtyRef.current) return true;
    let error: string | null;
    try { error = savePulseData(window.localStorage, dataRef.current); } catch { error = SAVE_FAILURE; }
    if (mountedRef.current) setStorageError(error);
    if (!error) { dirtyRef.current = false; if (mountedRef.current) setHasPendingSave(false); }
    return error === null;
  }, []);
  const commit = useCallback((update: DataUpdate<PulseData>, deferSave: boolean): boolean => {
    let next: PulseData;
    try { next = typeof update === "function" ? update(structuredClone(dataRef.current)) : update; }
    catch { setStorageError("변경을 적용하지 못했습니다. 기존 데이터를 유지합니다."); return false; }
    const parsed = validatePulseData(next);
    if (!parsed.ok) { setStorageError(formatIssues(parsed.issues)); return false; }
    dataRef.current = parsed.data; updateData(parsed.data); dirtyRef.current = true; setHasPendingSave(true);
    if (recoveryRef.current !== null) setStorageError("손상된 원본을 보존하고 있습니다. 현재 변경은 메모리에만 유지됩니다. 백업 복원 후 저장할 수 있습니다.");
    else if (deferSave) {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => { saveTimerRef.current = null; flush(); }, SETTINGS_SAVE_DELAY_MS);
    }
    else flush();
    return true;
  }, [flush]);
  const setData = useCallback((update: DataUpdate<PulseData>): boolean => commit(update, false), [commit]);
  const setSettings = useCallback((value: DataUpdate<AppSettings>) => { commit((current) => ({ ...current, settings: typeof value === "function" ? value(current.settings) : value }), true); }, [commit]);
  const setPresets = useCallback((value: DataUpdate<MetronomePreset[]>) => { setData((current) => ({ ...current, presets: typeof value === "function" ? value(current.presets) : value })); }, [setData]);
  const setSetlists = useCallback((value: DataUpdate<Setlist[]>) => { setData((current) => ({ ...current, setlists: typeof value === "function" ? value(current.setlists) : value })); }, [setData]);

  const importData = useCallback((incoming: PulseData, mode: "merge" | "replace" = "merge"): boolean => {
    const validated = validatePulseData(incoming);
    if (!validated.ok) { setStorageError(formatIssues(validated.issues)); return false; }
    const plan = mode === "replace" ? validated : mergeBackup(dataRef.current, validated.data);
    if (!plan.ok) { setStorageError(formatIssues(plan.issues)); return false; }
    try {
      if (recoveryRef.current !== null) window.localStorage.setItem(RECOVERY_KEY, recoveryRef.current);
      const error = savePulseData(window.localStorage, plan.data);
      if (error) { setStorageError(error); return false; }
    } catch { setStorageError(SAVE_FAILURE); return false; }
    if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    dataRef.current = plan.data; updateData(plan.data); dirtyRef.current = false; setHasPendingSave(false);
    recoveryRef.current = null; setRecoveryRaw(null); setStorageError(null);
    return true;
  }, []);
  const exportJson = useCallback(() => JSON.stringify(dataRef.current, null, 2), []);
  const downloadBackup = useCallback(() => downloadText(exportJson(), "pulse-backup-v2.json"), [exportJson]);
  const downloadRecovery = useCallback(() => { if (recoveryRef.current !== null) downloadText(recoveryRef.current, "pulse-recovery-original.json"); }, []);
  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const pagehide = () => { flush(); };
    // React input/change handlers finish before the final value is persisted.
    const confirmedInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("input, select, textarea, button")) return;
      queueMicrotask(() => { if (active) flush(); });
    };
    window.addEventListener("pagehide", pagehide);
    document.addEventListener("focusout", confirmedInput);
    document.addEventListener("pointerup", confirmedInput);
    return () => {
      active = false; mountedRef.current = false;
      window.removeEventListener("pagehide", pagehide);
      document.removeEventListener("focusout", confirmedInput);
      document.removeEventListener("pointerup", confirmedInput);
      flush();
    };
  }, [flush]);
  return { data, setData, settings: data.settings, setSettings, presets: data.presets, setPresets, setlists: data.setlists, setSetlists, storageError, recoveryRaw, hasPendingSave, importData, previewImport: parseBackup, exportJson, downloadBackup, downloadRecovery, flush };
}
