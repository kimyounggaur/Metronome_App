import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createDefaultData, createPreset, removePreset, renamePreset } from "../domain/presets";
import {
  checkLegacy,
  commitChange,
  initializePulseDb,
  openPulseDb,
  publishImport,
  readSnapshot,
  type Snapshot,
} from "../storage/pulseDb";
import { PULSE_DATA_KEY } from "../storage/pulseStorage";
import type { PulseData } from "../domain/types";

let db: IDBDatabase;
beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal("indexedDB", new IDBFactory());
  db = await openPulseDb();
});
afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
});
function change(base: Snapshot, next: PulseData, snap: Snapshot = base, operationId = crypto.randomUUID()) {
  return commitChange(db, { base: base.data, next, generation: base.generation, operationId }, snap);
}

describe("atomic IndexedDB transitions", () => {
  it("imports once across simultaneous connections and preserves old-client updates for review", async () => {
    const original = createDefaultData();
    original.settings.bpm = 96;
    localStorage.setItem(PULSE_DATA_KEY, JSON.stringify(original));
    const other = await openPulseDb();
    try {
      await Promise.all([initializePulseDb(db), initializePulseDb(other)]);
      const a = await readSnapshot(db),
        b = await readSnapshot(other);
      expect(a).toEqual(b);
      expect(a.data.settings.bpm).toBe(96);
      original.settings.bpm = 76;
      localStorage.setItem(PULSE_DATA_KEY, JSON.stringify(original));
      const notice = await checkLegacy(other);
      expect(notice?.raw).toBe(localStorage.getItem(PULSE_DATA_KEY));
      expect(notice?.source).toBe("구버전 탭");
      expect((await readSnapshot(db)).data.settings.bpm).toBe(96);
      expect((await checkLegacy(db))?.hash).toBe(notice?.hash);
    } finally {
      other.close();
    }
  });
  it("reuses operation IDs and rejects stale rename against deletion", async () => {
    await initializePulseDb(db);
    const empty = await readSnapshot(db);
    const p = createPreset(empty.data.settings, "곡");
    const id = crypto.randomUUID();
    const first = await change(empty, { ...empty.data, presets: [p] }, empty, id);
    const replay = await change(empty, { ...empty.data, presets: [p] }, empty, id);
    expect(replay).toEqual(first);
    await change(first, removePreset(first.data, p.id));
    await expect(change(first, renamePreset(first.data, p.id, "지운 곡"))).rejects.toThrow(/다른 탭과 충돌/);
    expect((await readSnapshot(db)).data.presets).toHaveLength(0);
  });
  it("merges different fields and two concurrent newly selected songs", async () => {
    await initializePulseDb(db);
    const empty = await readSnapshot(db);
    const a = createPreset(empty.data.settings, "A"),
      b = createPreset(empty.data.settings, "B");
    const add = (p: typeof a) => ({
      ...empty.data,
      presets: [p],
      navigation: { ...empty.data.navigation, activePresetId: p.id },
    });
    await Promise.all([change(empty, add(a)), change(empty, add(b))]);
    const base = await readSnapshot(db);
    expect(base.data.presets).toHaveLength(2);
    await Promise.all([
      change(base, renamePreset(base.data, a.id, "곡 A")),
      change(base, {
        ...base.data,
        presets: base.data.presets.map((p) => (p.id === a.id ? { ...p, bpm: 79 } : p)),
      }),
    ]);
    expect((await readSnapshot(db)).data.presets.find((p) => p.id === a.id)).toMatchObject({
      name: "곡 A",
      bpm: 79,
    });
  });
  it("checks generation and import revision before publishing or editing old snapshots", async () => {
    await initializePulseDb(db);
    const a = await readSnapshot(db);
    const saved = await change(a, { ...a.data, settings: { ...a.data.settings, bpm: 90 } });
    await expect(publishImport(db, a.data, a.revision, "test")).rejects.toThrow(/충돌/);
    expect((await readSnapshot(db)).generation).toBe(a.generation);
    const replaced = await publishImport(db, a.data, saved.revision, "test");
    expect(replaced.generation).not.toBe(a.generation);
    await expect(change(saved, { ...saved.data, settings: { ...saved.data.settings, bpm: 91 } })).rejects.toThrow(
      /백업 교체/,
    );
    expect((await readSnapshot(db)).data.settings.bpm).toBe(120);
  });
});
