import { useCallback, useEffect, useRef, useState } from "react";
import { createDefaultData, PRESETS_KEY, SETTINGS_KEY, SETLISTS_KEY } from "../domain/presets";
import { mergeBackup, parseBackup, serializeBackup } from "../domain/migration";
import { formatIssues, validateAppSettings, validateEnvelope } from "../domain/schema";
import type { AppSettings, PulseData } from "../domain/types";
import { downloadText, loadPulseData, PULSE_DATA_KEY, SAVE_FAILURE } from "../storage/pulseStorage";
import {
  checkLegacy,
  cleanInterruptedImports,
  commitChange,
  currentRevision,
  DB_NAME,
  dismissLegacy,
  initializePulseDb,
  openPulseDb,
  publishImport,
  readSnapshot,
  type Change,
  type Snapshot,
  type StoredOriginal,
} from "../storage/pulseDb";
import { equalValue, StorageConflict } from "../storage/reconcile";

export type DataUpdate<T> = T | ((current: T) => T);
export const SETTINGS_SAVE_DELAY_MS = 180;
type SaveState = "idle" | "saving" | "saved" | "memory" | "conflict" | "invalid";
interface StorageView {
  data: PulseData;
  ready: boolean;
  revision: number;
  storageError: string | null;
  recovery: StoredOriginal | null;
  remoteUpdate: boolean;
  conflict: string | null;
  status: SaveState;
  hasPendingSave: boolean;
}

const sessionDraftKey = "pulse:uncommitted-draft:v1";
const draftNotice = "마지막 저장본을 열었습니다. 이전 미저장 초안을 내려받아 비교하거나 복원할 수 있습니다.";
function readFailedDraft(): StoredOriginal | null {
  try {
    const raw = sessionStorage.getItem(sessionDraftKey);
    return raw ? { raw, message: draftNotice, source: "이전 미저장 초안", date: "", hash: "" } : null;
  } catch {
    return null;
  }
}
function removeFailedDraft() {
  try {
    sessionStorage.removeItem(sessionDraftKey);
  } catch {
    /* restricted storage */
  }
}

export function usePulseStorage(options: { isPlaybackActive?: () => boolean } = {}) {
  const [initial] = useState(createDefaultData);
  const [view, setView] = useState<StorageView>({
    data: initial,
    ready: false,
    revision: 0,
    storageError: null,
    recovery: null,
    remoteUpdate: false,
    conflict: null,
    status: "idle",
    hasPendingSave: false,
  });
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const viewRef = useRef(view);
  const db = useRef<IDBDatabase | null>(null);
  const canonical = useRef<Snapshot>({ data: initial, revision: 0, generation: "" });
  const pending = useRef<Change[]>([]);
  const runner = useRef<Promise<boolean> | null>(null);
  const failedDraftInThisRun = useRef(false);
  const timer = useRef<number | null>(null);
  const importing = useRef(false);
  const mounted = useRef(true);
  const channel = useRef<BroadcastChannel | null>(null);
  const tabId = useRef<string>("");
  if (!tabId.current) tabId.current = crypto.randomUUID();
  const update = useCallback((patch: Partial<StorageView>) => {
    viewRef.current = { ...viewRef.current, ...patch };
    if (mounted.current) setView(viewRef.current);
  }, []);
  const getData = useCallback(() => viewRef.current.data, []);
  const cancelTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const notify = useCallback((snap: Snapshot, changedIds: string[] = []) => {
    try {
      channel.current?.postMessage({ revision: snap.revision, generation: snap.generation, changedIds });
    } catch {
      /* resume refresh remains available */
    }
  }, []);
  const fail = useCallback(
    (error: unknown) => {
      const conflict = error instanceof StorageConflict;
      const message =
        conflict || (error instanceof Error && !(error instanceof DOMException)) ? error.message : SAVE_FAILURE;
      if (pending.current.length && mounted.current) {
        // A tab-scoped recovery copy can survive reload even if IndexedDB refused
        // this write. If the browser rejects both stores, live export still works.
        try {
          sessionStorage.setItem(sessionDraftKey, serializeBackup(viewRef.current.data));
          failedDraftInThisRun.current = true;
        } catch {
          /* Keep the pending in-memory edit available to download. */
        }
      }
      update({
        storageError: message,
        conflict: conflict ? message : null,
        status: conflict ? "conflict" : "memory",
        hasPendingSave: pending.current.length > 0,
      });
      return false;
    },
    [update],
  );
  const flush = useCallback((): Promise<boolean> => {
    cancelTimer();
    if (runner.current) return runner.current;
    if (viewRef.current.recovery?.source === "초기 이관" || !db.current) return Promise.resolve(false);
    if (!pending.current.length) return Promise.resolve(!importing.current);
    const store = db.current;
    const run = async () => {
      try {
        while (pending.current.length) {
          const change = pending.current[0];
          const snap = await commitChange(store, change, canonical.current);
          canonical.current = snap;
          pending.current.shift();
          const edits = pending.current;
          const local = viewRef.current.data;
          const externalMusic =
            optionsRef.current.isPlaybackActive?.() &&
            (!equalValue(change.next.settings, snap.data.settings) ||
              change.next.navigation.activePresetId !== snap.data.navigation.activePresetId);
          // A successful write may have merged another tab's newer tempo. Keep the
          // playing tab's accepted musical settings until it chooses to apply them.
          const display = edits.length || externalMusic ? local : snap.data;
          update({
            data: display,
            revision: snap.revision,
            storageError: null,
            conflict: null,
            status: edits.length ? "saving" : "saved",
            hasPendingSave: !!edits.length,
            remoteUpdate: !!externalMusic || (edits.length > 0 && viewRef.current.remoteUpdate),
          });
          const ids: string[] = [];
          for (const name of ["presets", "setlists"] as const)
            if (change.base[name] !== change.next[name]) {
              const before = new Map<string, unknown>(change.base[name].map((row) => [row.id, row]));
              for (const row of change.next[name]) {
                if (!equalValue(before.get(row.id), row)) ids.push(row.id);
                before.delete(row.id);
              }
              ids.push(...before.keys());
            }
          notify(snap, ids);
        }
        if (failedDraftInThisRun.current) {
          removeFailedDraft();
          failedDraftInThisRun.current = false;
        }
        return true;
      } catch (error) {
        return fail(error);
      }
    };
    runner.current = run().finally(() => {
      runner.current = null;
    });
    return runner.current;
  }, [cancelTimer, fail, notify, update]);
  const acceptLatest = useCallback(async () => {
    if (!db.current || importing.current) return;
    if (runner.current) await runner.current;
    try {
      if (viewRef.current.conflict && pending.current.length) {
        downloadText(serializeBackup(viewRef.current.data), "pulse-conflict-draft.json");
      }
      const snap = await readSnapshot(db.current);
      pending.current = [];
      if (failedDraftInThisRun.current) {
        removeFailedDraft();
        failedDraftInThisRun.current = false;
      }
      canonical.current = snap;
      update({
        data: snap.data,
        revision: snap.revision,
        hasPendingSave: false,
        storageError: null,
        conflict: null,
        status: "saved",
        remoteUpdate: false,
      });
    } catch (error) {
      fail(error);
    }
  }, [fail, update]);
  const applyRemote = useCallback(async () => {
    if (importing.current) return;
    if (pending.current.length && !(await flush())) return;
    await acceptLatest();
  }, [acceptLatest, flush]);
  const refresh = useCallback(
    async (explicit = false) => {
      const store = db.current;
      if (!store || importing.current) return;
      try {
        const revision = await currentRevision(store);
        if (revision <= canonical.current.revision) return;
        if (
          pending.current.length ||
          optionsRef.current.isPlaybackActive?.() ||
          (!explicit && document.querySelector("dialog[open], input:focus, textarea:focus"))
        ) {
          update({ remoteUpdate: true });
          return;
        }
        const snap = await readSnapshot(store);
        if (
          pending.current.length ||
          optionsRef.current.isPlaybackActive?.() ||
          snap.revision < canonical.current.revision
        ) {
          update({ remoteUpdate: true });
          return;
        }
        canonical.current = snap;
        update({ data: snap.data, revision: snap.revision, remoteUpdate: false });
      } catch (error) {
        fail(error);
      }
    },
    [fail, update],
  );
  const reviewLegacy = useCallback(async () => {
    if (!db.current) return;
    const detected = await checkLegacy(db.current);
    if (detected) update({ recovery: detected, storageError: detected.message });
  }, [update]);
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    let conn: IDBDatabase | null = null;
    const open = async () => {
      try {
        conn = await openPulseDb(() => {
          db.current = null;
          update({ storageError: "저장소 버전이 변경되었습니다. 백업한 뒤 다시 열어 주세요.", status: "memory" });
        });
        if (!alive) {
          conn.close();
          return;
        }
        await initializePulseDb(conn);
        const original = (await checkLegacy(conn)) ?? readFailedDraft();
        const snap = await readSnapshot(conn);
        if (!alive) {
          conn.close();
          return;
        }
        db.current = conn;
        canonical.current = snap;
        update({
          data: snap.data,
          ready: true,
          revision: snap.revision,
          recovery: original,
          storageError: original?.message ?? null,
          status: original?.source === "초기 이관" ? "memory" : "idle",
        });
        void cleanInterruptedImports(conn).catch(() => {});
      } catch (error) {
        if (!alive) return;
        let data = initial,
          raw: string | null = null;
        try {
          const source = loadPulseData(window.localStorage);
          data = source.data;
          raw = source.recoveryRaw;
        } catch {
          /* no storage access */
        }
        update({
          data,
          ready: true,
          status: "memory",
          storageError: error instanceof Error && error.message.includes("탭") ? error.message : SAVE_FAILURE,
          recovery:
            raw === null
              ? null
              : { raw, hash: "", source: "초기 이관", date: new Date().toISOString(), message: SAVE_FAILURE },
        });
      }
    };
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(DB_NAME);
      channel.current.onmessage = () => {
        void refresh();
      };
    }
    const onResume = () => {
      void refresh();
      void reviewLegacy().catch(fail);
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || [PULSE_DATA_KEY, SETTINGS_KEY, SETLISTS_KEY, PRESETS_KEY].includes(event.key))
        void reviewLegacy().catch(fail);
    };
    const onHide = () => {
      void flush();
    };
    const visibility = () => {
      if (document.hidden) onHide();
      else onResume();
    };
    const onInput = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("input,select,textarea,button"))
        queueMicrotask(() => {
          if (alive && viewRef.current.status === "saving" && pending.current.length) void flush();
        });
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("focusout", onInput);
    document.addEventListener("pointerup", onInput);
    void open();
    return () => {
      alive = false;
      mounted.current = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("focusout", onInput);
      document.removeEventListener("pointerup", onInput);
      channel.current?.close();
      channel.current = null;
      const close = conn;
      void flush().finally(() => {
        close?.close();
        if (db.current === close) db.current = null;
      });
    };
  }, [initial, update, refresh, reviewLegacy, flush, fail]);

  const enqueue = useCallback(
    (next: PulseData, defer: boolean): Promise<boolean> => {
      if (!viewRef.current.ready || importing.current) return Promise.resolve(false);
      const before = viewRef.current.data;
      if (next === before) return defer ? Promise.resolve(true) : flush();
      const last = pending.current.at(-1);
      // Keep only the initial basis and final value of a burst of unsent settings edits.
      if (
        defer &&
        last &&
        !(runner.current && pending.current.length === 1) &&
        last.base.presets === next.presets &&
        last.base.setlists === next.setlists &&
        last.base.navigation === next.navigation
      )
        last.next = next;
      else
        pending.current.push({
          base: before,
          next,
          generation: canonical.current.generation,
          operationId: crypto.randomUUID(),
        });
      const memory = !db.current || viewRef.current.recovery?.source === "초기 이관";
      update({
        data: next,
        hasPendingSave: true,
        status: memory ? "memory" : "saving",
        storageError: memory ? (viewRef.current.storageError ?? SAVE_FAILURE) : viewRef.current.storageError,
      });
      if (!defer) return flush();
      cancelTimer();
      timer.current = window.setTimeout(() => void flush(), SETTINGS_SAVE_DELAY_MS);
      return Promise.resolve(!memory);
    },
    [cancelTimer, flush, update],
  );
  const setData = useCallback(
    async (value: DataUpdate<PulseData>): Promise<boolean> => {
      try {
        const next = typeof value === "function" ? value(viewRef.current.data) : value;
        const issues = validateEnvelope(next);
        if (issues.length) {
          update({ storageError: formatIssues(issues), status: "invalid" });
          return false;
        }
        return enqueue(next, false);
      } catch (error) {
        return fail(error);
      }
    },
    [enqueue, fail, update],
  );
  const setSettings = useCallback(
    (value: DataUpdate<AppSettings>) => {
      const before = viewRef.current.data;
      const settings = typeof value === "function" ? value(before.settings) : value;
      if (equalValue(settings, before.settings)) return;
      if (!validateAppSettings(settings)) {
        update({ storageError: "입력 거절 · 설정 범위를 확인해 주세요.", status: "invalid" });
        return;
      }
      void enqueue({ ...before, settings }, true);
    },
    [enqueue, update],
  );
  const importData = useCallback(
    async (
      incoming: PulseData,
      mode: "replace" | "merge" = "merge",
      expectedRevision?: number,
      signal?: AbortSignal,
    ): Promise<boolean> => {
      if (!db.current || importing.current) return false;
      const issues = validateEnvelope(incoming);
      if (issues.length) {
        update({ storageError: formatIssues(issues), status: "invalid" });
        return false;
      }
      const recovery = viewRef.current.recovery?.source === "초기 이관";
      if (pending.current.length && !recovery && !(await flush())) return false;
      const store = db.current;
      const base = canonical.current;
      const expected = expectedRevision ?? base.revision;
      if (expected !== base.revision) {
        update({ storageError: "다른 탭과 충돌했습니다. 미리보기를 갱신해 주세요.", status: "conflict" });
        return false;
      }
      const plan = mode === "merge" ? mergeBackup(base.data, incoming, undefined, true) : { ok: true as const, data: incoming };
      if (!plan.ok) {
        update({ storageError: formatIssues(plan.issues), status: "invalid" });
        return false;
      }
      importing.current = true;
      update({ status: "saving" });
      try {
        const snap = await publishImport(store, plan.data, expected, tabId.current, () => !signal?.aborted);
        canonical.current = snap;
        pending.current = [];
        update({
          data: snap.data,
          revision: snap.revision,
          hasPendingSave: false,
          status: "saved",
          storageError: null,
          conflict: null,
          recovery: null,
          remoteUpdate: false,
        });
        removeFailedDraft();
        failedDraftInThisRun.current = false;
        notify(snap);
        return true;
      } catch (error) {
        if (error instanceof StorageConflict && !pending.current.length) {
          const latest = await readSnapshot(store).catch(() => null);
          if (latest) {
            canonical.current = latest;
            const data = optionsRef.current.isPlaybackActive?.()
              ? {
                  ...latest.data,
                  settings: viewRef.current.data.settings,
                  navigation: viewRef.current.data.navigation,
                }
              : latest.data;
            update({ data, revision: latest.revision, remoteUpdate: data !== latest.data });
          }
        }
        return fail(error);
      } finally {
        importing.current = false;
      }
    },
    [flush, update, notify, fail],
  );
  const exportJson = useCallback(() => serializeBackup(viewRef.current.data), []);
  const downloadBackup = useCallback(() => downloadText(exportJson(), "pulse-backup-v2.json"), [exportJson]);
  const downloadRecovery = useCallback(() => {
    const r = viewRef.current.recovery;
    if (r)
      downloadText(
        r.raw,
        r.source === "이전 미저장 초안" ? "pulse-unsaved-draft.json" : "pulse-recovery-original.json",
      );
  }, []);
  const ignoreLegacy = useCallback(async () => {
    const r = viewRef.current.recovery;
    if (!r || !db.current || r.source !== "구버전 탭") return;
    await dismissLegacy(db.current, r.hash);
    update({ recovery: null, storageError: null });
  }, [update]);
  return {
    ...view,
    settings: view.data.settings,
    presets: view.data.presets,
    setlists: view.data.setlists,
    recoveryRaw: view.recovery?.raw ?? null,
    getData,
    setData,
    setSettings,
    flush,
    retrySave: flush,
    acceptLatest,
    applyRemote,
    ignoreLegacy,
    importData,
    exportJson,
    downloadBackup,
    downloadRecovery,
    previewImport: parseBackup,
  };
}
