import { convertLegacyPreset, convertLegacySetlist, parseBackupValue } from "../domain/migration";
import { validateBackupRow, validateNavigation, type ParseResult } from "../domain/schema";
import type { MetronomePreset, PulseData, Setlist } from "../domain/types";
import { openPulseDb, DB_NAME, request, transaction } from "./pulseDb";
import { readStreamDocument, type RowKind, type StagedPreview } from "./readBackupFile";

const kinds = ["presets", "setlists"] as const;
const emptyNavigation = { activePresetId: null, activeSetlistId: null, activeItemIndex: 0 };
const invalid = (path: string, message: string) => ({ ok: false as const, issues: [{ path, message }] });

/** The callback keeps the staging lock for the complete lifetime of the preview, including retries. */
export async function withBackupStage(
  file: Blob,
  owner: string,
  signal: AbortSignal,
  progress: (read: number) => void,
  preview: (summary: StagedPreview, materialize: () => Promise<PulseData>) => Promise<void>,
): Promise<Extract<ParseResult<PulseData>, {ok: false}> | void> {
  const generation = "backup-" + crypto.randomUUID();
  const work = async () => {
    const db = await openPulseDb();
    try {
      await transaction(db, ["stages"], "readwrite", async tx => {
        tx.objectStore("stages").add({ generation, owner, operationId: generation }, generation);
      });
      const root = await readStreamDocument(file.stream(), progress, async rows => {
        signal.throwIfAborted();
        await transaction(db, kinds, "readwrite", async tx => {
          for (const { kind, index, value } of rows) tx.objectStore(kind).add(value, [generation, index]);
        });
      });
      signal.throwIfAborted();
      if (root === null || typeof root !== "object" || Array.isArray(root)) return invalid("$", "백업 객체가 필요합니다.");
      const doc = root as Record<string, unknown>;
      if (!Array.isArray(doc.presets) || !Array.isArray(doc.setlists)) return invalid("$", "프리셋·셋리스트 배열이 필요합니다.");
      const counts = { presets: doc.presets.length, setlists: doc.setlists.length };
      const header = parseBackupValue({ ...doc, presets: [], setlists: [], navigation: emptyNavigation }, true);
      if (!header.ok) return header;
      const legacy = doc.schemaVersion !== 2;
      const presetIds = new Set<string>();
      const listSizes = new Map<string, number>();
      // Validate the preset pass first, irrespective of insertion order in the source JSON.
      for (const kind of kinds) {
        for (let start = 0; start < counts[kind]; start += 8) {
          signal.throwIfAborted();
          const count = Math.min(8, counts[kind] - start);
          const rows = await transaction(db, [kind], "readonly", tx => request<unknown[]>(tx.objectStore(kind).getAll(
            IDBKeyRange.bound([generation, start], [generation, start + count - 1]),
          )));
          if (rows.length !== count) return invalid(kind, "일부 항목을 읽지 못했습니다.");
          const normalized: (MetronomePreset | Setlist)[] = [];
          for (const [offset, row] of rows.entries()) {
            const issues = validateBackupRow(kind, row, start + offset, legacy, presetIds);
            if (issues.length) return { ok: false as const, issues };
            if (kind === "presets") {
              const item = legacy ? convertLegacyPreset(row as Record<string, unknown>) : row as MetronomePreset;
              if (presetIds.has(item.id)) return invalid(`presets[${start + offset}].id`, "중복 프리셋 ID입니다.");
              presetIds.add(item.id);
              normalized.push(item);
            } else {
              const item = legacy ? convertLegacySetlist(row) : row as Setlist;
              if (listSizes.has(item.id)) return invalid(`setlists[${start + offset}].id`, "중복 셋리스트 ID입니다.");
              listSizes.set(item.id, item.items.length);
              normalized.push(item);
            }
          }
          if (legacy) {
            await transaction(db, [kind], "readwrite", async tx => {
              normalized.forEach((row, offset) => tx.objectStore(kind).put(row, [generation, start + offset]));
            });
          }
        }
      }
      const navigation = legacy ? emptyNavigation : doc.navigation as PulseData["navigation"];
      const issues = validateNavigation(navigation, presetIds, listSizes);
      if (issues.length) return { ok: false as const, issues };
      const summary: StagedPreview = { ok: true, staged: true, warnings: header.warnings, data: {
        ...header.data, navigation, presets: [...presetIds].map(id => ({id})), setlists: [...listSizes.keys()].map(id => ({id})),
      } };
      await preview(summary, async () => {
        signal.throwIfAborted();
        const range = IDBKeyRange.bound([generation], [generation, []]);
        const [presets, setlists] = await transaction(db, kinds, "readonly", tx => Promise.all([
          request<MetronomePreset[]>(tx.objectStore("presets").getAll(range)),
          request<Setlist[]>(tx.objectStore("setlists").getAll(range)),
        ]));
        return { ...header.data, navigation, presets, setlists };
      });
    } finally {
      try {
        await transaction(db, ["stages", ...kinds], "readwrite", async tx => {
          const range = IDBKeyRange.bound([generation], [generation, []]);
          for (const kind of kinds) tx.objectStore(kind).delete(range);
          tx.objectStore("stages").delete(generation);
        });
      } finally { db.close(); }
    }
  };
  return navigator.locks ? navigator.locks.request(DB_NAME + ":stage:" + generation, work) : work();
}
