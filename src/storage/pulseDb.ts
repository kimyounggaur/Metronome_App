import { PRESETS_KEY, SETLISTS_KEY, SETTINGS_KEY } from "../domain/presets";
import { formatIssues, validateAppSettings, validateEnvelope } from "../domain/schema";
import type { PulseData, MetronomePreset, Setlist } from "../domain/types";
import { loadPulseData, PULSE_DATA_KEY } from "./pulseStorage";
import { equalValue, reconcileChanges, StorageConflict } from "./reconcile";

export const DB_NAME = "pulse-metronome";
const libraryStores = ["meta", "settings", "navigation", "presets", "setlists"] as const;
const contentStores = ["settings", "navigation", "presets", "setlists"] as const;
const legacyKeys = [PULSE_DATA_KEY, SETTINGS_KEY, PRESETS_KEY, SETLISTS_KEY];
interface State {
  generation: string;
  revision: number;
  presetIds: string[];
  setlistIds: string[];
  legacyHash: string;
  legacyV2Hash: string;
  recoveryHash: string | null;
}
export interface Snapshot {
  data: PulseData;
  revision: number;
  generation: string;
}
export interface StoredOriginal {
  raw: string;
  hash: string;
  source: string;
  date: string;
  message: string;
}
interface Versioned<T> {
  value: T;
  revision: number;
}
export interface Change {
  base: PulseData;
  next: PulseData;
  generation: string;
  operationId: string;
}

export function request<T>(input: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    input.onsuccess = () => resolve(input.result);
    input.onerror = () => reject(input.error);
  });
}
export async function transaction<T>(
  db: IDBDatabase,
  stores: readonly string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const tx = db.transaction([...stores], mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException("저장 트랜잭션이 중단되었습니다", "AbortError"));
  });
  // Attach immediately: a synchronous put error and transaction abort can coincide.
  void done.catch(() => {});
  try {
    const result = await run(tx);
    await done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* already complete */
    }
    await done.catch(() => {});
    throw error;
  }
}
export function openPulseDb(onVersionChange?: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, 1);
    let blocked = false;
    opening.onupgradeneeded = () => {
      for (const name of [...libraryStores, "operations", "recovery", "stages"])
        opening.result.createObjectStore(name);
    };
    opening.onblocked = () => {
      blocked = true;
      reject(new Error("다른 메트로놈 탭을 닫고 다시 열어 주세요."));
    };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        onVersionChange?.();
      };
      resolve(db);
    };
  });
}
function stateIn(tx: IDBTransaction): Promise<State | undefined> {
  return request(tx.objectStore("meta").get("state"));
}
const range = (generation: string) => IDBKeyRange.bound([generation], [generation, []]);
type StoredNavigation = PulseData["navigation"] & { activeItemId?: string | null };
function storeNavigation(data: PulseData): StoredNavigation {
  const nav = data.navigation;
  const list = data.setlists.find((row) => row.id === nav.activeSetlistId);
  return { ...nav, activeItemId: list?.items[nav.activeItemIndex]?.id ?? null };
}
async function readData(tx: IDBTransaction, state: State): Promise<PulseData> {
  const gen = state.generation;
  const [settings, navigation, presets, setlists] = await Promise.all([
    request<PulseData["settings"]>(tx.objectStore("settings").get(gen)),
    request<StoredNavigation>(tx.objectStore("navigation").get(gen)),
    request<Versioned<MetronomePreset>[]>(tx.objectStore("presets").getAll(range(gen))),
    request<Versioned<Setlist>[]>(tx.objectStore("setlists").getAll(range(gen))),
  ]);
  const ordered = <T extends { id: string }>(records: Versioned<T>[], ids: string[]) => {
    const byId = new Map(records.map(({ value }) => [value.id, value]));
    return ids.map((id) => {
      const value = byId.get(id);
      if (!value) throw new Error("저장된 항목을 읽지 못했습니다: " + id);
      return value;
    });
  };
  if (!settings || !navigation) throw new Error("저장된 설정을 읽지 못했습니다.");
  const lists = ordered(setlists, state.setlistIds);
  const { activeItemId, ...portableNav } = navigation;
  if (activeItemId) {
    const index = lists
      .find((list) => list.id === portableNav.activeSetlistId)
      ?.items.findIndex((item) => item.id === activeItemId);
    if (index !== undefined && index >= 0) portableNav.activeItemIndex = index;
  }
  return {
    schemaVersion: 2,
    settings,
    navigation: portableNav,
    presets: ordered(presets, state.presetIds),
    setlists: lists,
  };
}
export async function readSnapshot(db: IDBDatabase): Promise<Snapshot> {
  return transaction(db, libraryStores, "readonly", async (tx) => {
    const state = await stateIn(tx);
    if (!state) throw new Error("저장소를 준비하고 있습니다.");
    return { revision: state.revision, generation: state.generation, data: await readData(tx, state) };
  });
}
function writeRows<T extends { id: string }>(
  store: IDBObjectStore,
  gen: string,
  revision: number,
  before: T[],
  after: T[],
): void {
  if (before === after) return;
  const old = new Map(before.map((item) => [item.id, item]));
  for (const item of after) {
    if (!equalValue(old.get(item.id), item)) store.put({ revision, value: item }, [gen, item.id]);
    old.delete(item.id);
  }
  for (const id of old.keys()) store.delete([gen, id]);
}
function writeData(tx: IDBTransaction, state: State, before: PulseData | null, next: PulseData): void {
  const gen = state.generation;
  if (!before || !equalValue(before.settings, next.settings)) tx.objectStore("settings").put(next.settings, gen);
  if (!before || before.setlists !== next.setlists || !equalValue(before.navigation, next.navigation))
    tx.objectStore("navigation").put(storeNavigation(next), gen);
  writeRows(tx.objectStore("presets"), gen, state.revision, before?.presets ?? [], next.presets);
  writeRows(tx.objectStore("setlists"), gen, state.revision, before?.setlists ?? [], next.setlists);
  if (before?.presets !== next.presets) state.presetIds = next.presets.map((p) => p.id);
  if (before?.setlists !== next.setlists) state.setlistIds = next.setlists.map((s) => s.id);
  tx.objectStore("meta").put(state, "state");
}
function captureLegacy() {
  const raw = Object.fromEntries(legacyKeys.map((key) => [key, localStorage.getItem(key)]));
  return {
    raw,
    getItem: (key: string) => raw[key] ?? null,
    setItem: () => {
      throw new Error("이관 원본은 읽기 전용입니다.");
    },
  };
}
interface Fingerprint {
  raw: Record<string, string | null>;
  hash: string;
  v2: string;
}
const lastFingerprint = new WeakMap<IDBDatabase, Fingerprint>();
async function fingerprint(db: IDBDatabase, raw: Record<string, string | null>): Promise<Fingerprint> {
  const previous = lastFingerprint.get(db);
  if (previous && legacyKeys.every((key) => raw[key] === previous.raw[key])) return previous;
  const digest = async (value: string) => {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  };
  const [hash, v2] = await Promise.all([digest(JSON.stringify(raw)), digest(raw[PULSE_DATA_KEY] ?? "")]);
  const result = { raw, hash, v2 };
  lastFingerprint.set(db, result);
  return result;
}
function original(raw: string, hash: string, source: string, message: string): StoredOriginal {
  return { raw, hash, source, message, date: new Date().toISOString() };
}
export async function initializePulseDb(db: IDBDatabase): Promise<void> {
  const exists = await transaction(db, ["meta"], "readonly", stateIn);
  if (exists) return;
  const captured = captureLegacy();
  const { hash, v2 } = await fingerprint(db, captured.raw);
  const loaded = loadPulseData(captured);
  await transaction(db, [...libraryStores, "recovery"], "readwrite", async (tx) => {
    if (await stateIn(tx)) return;
    const state: State = {
      generation: crypto.randomUUID(),
      revision: 0,
      presetIds: [],
      setlistIds: [],
      legacyHash: hash,
      legacyV2Hash: v2,
      recoveryHash: null,
    };
    if (loaded.recoveryRaw !== null) {
      state.recoveryHash = hash;
      tx.objectStore("recovery").put(
        original(loaded.recoveryRaw, hash, "초기 이관", loaded.storageError ?? "원본을 보존했습니다."),
        hash,
      );
    }
    writeData(tx, state, null, loaded.data);
  });
}
export async function checkLegacy(db: IDBDatabase): Promise<StoredOriginal | null> {
  const captured = captureLegacy();
  const { hash, v2 } = await fingerprint(db, captured.raw);
  return transaction(db, ["meta", "recovery"], "readwrite", async (tx) => {
    const state = await stateIn(tx);
    if (!state) return null;
    const store = tx.objectStore("recovery");
    if (state.legacyHash !== hash) {
      // Preserve exactly what the prior client wrote; it never wrote to this DB.
      const v1 = Object.fromEntries(legacyKeys.slice(1).map((key) => [key, captured.raw[key]]));
      const raw =
        state.legacyV2Hash !== v2 && captured.raw[PULSE_DATA_KEY] !== null
          ? captured.raw[PULSE_DATA_KEY]!
          : JSON.stringify(v1);
      const entry = original(
        raw,
        hash,
        "구버전 탭",
        "이전 버전에서 변경한 내용이 있습니다. 원본을 내려받거나 변경을 검토하세요.",
      );
      store.put(entry, hash);
      state.legacyHash = hash;
      state.legacyV2Hash = v2;
      tx.objectStore("meta").put(hash, "legacyReview");
      tx.objectStore("meta").put(state, "state");
    }
    const id =
      state.recoveryHash ?? (await request<string | undefined>(tx.objectStore("meta").get("legacyReview")));
    return id ? await request<StoredOriginal>(store.get(id)) : null;
  });
}
export async function dismissLegacy(db: IDBDatabase, hash: string): Promise<void> {
  await transaction(db, ["meta"], "readwrite", async (tx) => {
    const store = tx.objectStore("meta");
    if ((await request(store.get("legacyReview"))) === hash) store.delete("legacyReview");
  });
}
export async function currentRevision(db: IDBDatabase): Promise<number> {
  return transaction(db, ["meta"], "readonly", async (tx) => (await stateIn(tx))?.revision ?? 0);
}

export async function commitChange(db: IDBDatabase, change: Change, known: Snapshot): Promise<Snapshot> {
  return transaction(db, [...libraryStores, "operations"], "readwrite", async (tx) => {
    const state = (await stateIn(tx))!;
    if (state.recoveryHash) throw new Error("원본을 보존하고 있습니다. 정상 백업을 복원한 뒤 저장할 수 있습니다.");
    const ops = tx.objectStore("operations");
    const latest =
      known.revision === state.revision && known.generation === state.generation
        ? known.data
        : await readData(tx, state);
    if (await request(ops.get(change.operationId)))
      return { data: latest, revision: state.revision, generation: state.generation };
    if (state.generation !== change.generation)
      throw new StorageConflict("백업 교체", state.generation, change.generation);
    const next = reconcileChanges(change.base, change.next, latest);
    if (
      latest.presets === next.presets &&
      latest.setlists === next.setlists &&
      latest.navigation === next.navigation
    ) {
      if (!validateAppSettings(next.settings)) throw new Error("입력 거절 · 설정 범위를 확인해 주세요.");
    } else {
      const issues = validateEnvelope(next);
      if (issues.length) throw new StorageConflict(formatIssues(issues), latest.navigation, next.navigation);
    }
    state.revision++;
    writeData(tx, state, latest, next);
    ops.put({ revision: state.revision }, change.operationId);
    return { data: next, revision: state.revision, generation: state.generation };
  });
}

interface Stage {
  generation: string;
  owner: string;
  operationId: string;
}
function removeGeneration(tx: IDBTransaction, generation: string) {
  tx.objectStore("settings").delete(generation);
  tx.objectStore("navigation").delete(generation);
  tx.objectStore("presets").delete(range(generation));
  tx.objectStore("setlists").delete(range(generation));
  tx.objectStore("stages").delete(generation);
}

export async function publishImport(
  db: IDBDatabase,
  data: PulseData,
  expected: number,
  owner: string,
  guard: () => boolean = () => true,
): Promise<Snapshot> {
  const generation = crypto.randomUUID();
  const stage: Stage = { generation, owner, operationId: crypto.randomUUID() };
  const prepareAndPublish = async () => {
    try {
      await transaction(db, ["stages", "settings", "navigation"], "readwrite", async (tx) => {
        tx.objectStore("stages").put(stage, generation);
        tx.objectStore("settings").put(data.settings, generation);
        tx.objectStore("navigation").put(storeNavigation(data), generation);
      });
      for (const name of ["presets", "setlists"] as const) {
        for (let i = 0; i < data[name].length; i += 40) {
          if (!guard()) throw new Error("가져오기를 취소했습니다.");
          await transaction(db, [name], "readwrite", async (tx) => {
            for (const record of data[name].slice(i, i + 40))
              tx.objectStore(name).put({ revision: expected + 1, value: record }, [generation, record.id]);
          });
        }
      }
      return await transaction(db, [...libraryStores, "stages"], "readwrite", async (tx) => {
        const state = (await stateIn(tx))!;
        if (!guard()) throw new Error("가져오기를 취소했습니다.");
        if (state.revision !== expected) throw new StorageConflict("가져오기 미리보기", state.revision, expected);
        const previous = state.generation;
        state.generation = generation;
        state.revision++;
        state.presetIds = data.presets.map((p) => p.id);
        state.setlistIds = data.setlists.map((s) => s.id);
        state.recoveryHash = null;
        tx.objectStore("meta").put(state, "state");
        tx.objectStore("stages").delete(generation);
        // All readers load their complete generation in a single readonly transaction.
        removeGeneration(tx, previous);
        return { data, revision: state.revision, generation };
      });
    } catch (error) {
      await transaction(db, [...contentStores, "stages"], "readwrite", async (tx) =>
        removeGeneration(tx, generation),
      ).catch(() => {});
      throw error;
    }
  };
  if (!navigator.locks) return prepareAndPublish();
  return navigator.locks.request(DB_NAME + ":stage:" + generation, prepareAndPublish);
}
export async function cleanInterruptedImports(db: IDBDatabase) {
  // A missing Web Locks API gives no reliable proof that another owner's tab is closed.
  if (!navigator.locks) return;
  const stages: Stage[] = await transaction(db, ["stages"], "readonly", (tx) =>
    request(tx.objectStore("stages").getAll()),
  );
  for (const stage of stages) {
    await navigator.locks.request(DB_NAME + ":stage:" + stage.generation, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      await transaction(db, [...libraryStores, "stages"], "readwrite", async (tx) => {
        const state = await stateIn(tx);
        if (state?.generation !== stage.generation) removeGeneration(tx, stage.generation);
      });
    });
  }
}
