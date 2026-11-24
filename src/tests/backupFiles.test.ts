// @vitest-environment node
import { describe, expect, it } from "vitest";
import { withBackupStage } from "../storage/backupStage";
import { cleanInterruptedImports, openPulseDb, request, transaction } from "../storage/pulseDb";
import { createDefaultData, createPreset } from "../domain/presets";
import { parseBackup, serializeBackup } from "../domain/migration";
import { DATA_LIMITS } from "../domain/schema";
import { parseBackupStream, readBackupFile } from "../storage/readBackupFile";

function chunks(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({ pull(controller) {
    if (offset === bytes.length) { controller.close(); return; }
    const part = bytes.subarray(offset, Math.min(offset + size, bytes.length));
    offset += part.length;
    controller.enqueue(part);
  } });
}

describe("R02 portable backup files", () => {
  const data = createDefaultData();
  const song = createPreset(data.settings, '눈길 🎵 "합주"');
  data.presets = [song];
  data.setlists = [{ id: "list", name: "수업", items: [{ id: "1", presetId: song.id }, { id: "2", presetId: song.id }] }];
  data.navigation = { activePresetId: song.id, activeSetlistId: "list", activeItemIndex: 1 };

  it("accepts the exact paste boundary and imports a larger valid file through both readers", async () => {
    const raw = serializeBackup(data);
    const boundary = DATA_LIMITS.importBytes;
    for (const delta of [-1, 0, 1]) {
      const text = " ".repeat(boundary + delta - Buffer.byteLength(raw)) + raw;
      expect(new Blob([text]).size).toBe(boundary + delta);
      expect(parseBackup(text).ok).toBe(delta <= 0);
      expect(parseBackup(text, "storage")).toMatchObject({ ok: true, data });
      if (delta === 1) {
        for (const budget of [0, 3 * 1024 ** 2]) {
          const result = await readBackupFile(new Blob([text]), () => {}, budget);
          expect(result).toMatchObject({ ok: true, data });
        }
      }
    }
  });
  it("handles forward references, escaped strings, Korean and emoji split at every byte", async () => {
    const ordered = JSON.stringify({ setlists: data.setlists, navigation: data.navigation, settings: data.settings, presets: data.presets, schemaVersion: 2 });
    const result = await parseBackupStream(chunks(ordered, 1), () => {});
    expect(result).toMatchObject({ ok: true, data });
  });
  it("rejects truncated JSON, trailing junk, invalid references and too many list items", async () => {
    const raw = serializeBackup(data);
    const broken = structuredClone(data);
    broken.setlists[0].items[0].presetId = "missing";
    const oversized = structuredClone(data);
    oversized.setlists[0].items = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), presetId: song.id }));
    for (const text of [raw.slice(0, -1), raw + "!!!", serializeBackup(broken), serializeBackup(oversized)]) {
      expect((await parseBackupStream(chunks(text, 1024), () => {})).ok).toBe(false);
    }
  });
  it("stages rows before publishing a compact summary, resolves forward references and cleans up after release", async () => {
    const ordered = JSON.stringify({ setlists: data.setlists, navigation: data.navigation, presets: data.presets, settings: data.settings, schemaVersion: 2 });
    const db = await openPulseDb();
    const count = (name: string) => transaction(db, [name], "readonly", tx => request(tx.objectStore(name).count()));
    try {
      const result = await withBackupStage(new Blob([ordered]), "test", new AbortController().signal, () => {}, async (summary, load) => {
        expect(summary.data.setlists).toEqual([{ id:"list" }]);
        expect(summary.data.presets).toEqual([{ id:song.id }]);
        expect(await count("meta")).toBe(0);
        expect(await count("stages")).toBe(1);
        // Another window reopens after an interrupted import while this preview is alive.
        await transaction(db, ["presets", "stages"], "readwrite", async tx => {
          tx.objectStore("stages").put({generation:"orphan-test", owner:"closed", operationId:"test"}, "orphan-test");
          tx.objectStore("presets").put(song, ["orphan-test", 0]);
        });
        await cleanInterruptedImports(db);
        expect(await count("stages")).toBe(1);
        expect(await count("presets")).toBe(1);
        expect(await load()).toEqual(data);
      });
      expect(result).toBeUndefined();
      for (const store of ["presets", "setlists", "stages"]) expect(await count(store)).toBe(0);
    } finally { db.close(); }
  });

  it("rolls back its stage after a cancellation or late missing reference", async () => {
    const controller = new AbortController();
    const file = new Blob([serializeBackup(data)]);
    await expect(withBackupStage(file, "cancel", controller.signal, () => controller.abort(), async () => {
      throw new Error("Unfinished backup reached preview");
    })).rejects.toMatchObject({name:"AbortError"});
    const broken = structuredClone(data);
    broken.setlists[0].items[1].presetId = "missing";
    const failed = await withBackupStage(new Blob([serializeBackup(broken)]), "invalid", new AbortController().signal, () => {}, async () => {
      throw new Error("Invalid backup reached preview");
    });
    expect(failed).toMatchObject({ ok:false, issues:[{path:"setlists[0].items[1].presetId"}] });
    const db = await openPulseDb();
    try {
      for (const name of ["stages","presets","setlists"]) {
        expect(await transaction(db, [name], "readonly", tx => request(tx.objectStore(name).count()))).toBe(0);
      }
    } finally { db.close(); }
  });

  it("converts v1 files in both bulk and streamed reads", async () => {
    const { timerSeconds: _seconds, ...restPractice } = data.settings.practice;
    const settings = { ...data.settings, practice: { ...restPractice, timerMinutes: 2 } };
    const json = new Blob([JSON.stringify({ settings, presets: [], setlists: [] })]);
    for (const budget of [0, 1024 * 1024]) {
      const result = await readBackupFile(json, () => {}, budget);
      expect(result).toMatchObject({ ok: true, data: { schemaVersion: 2, settings: { practice: { timerSeconds: 120 } } } });
    }
  });
});
