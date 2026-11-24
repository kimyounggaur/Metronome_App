import { JSONParser } from "@streamparser/json";
import { parseBackup, parseBackupValue } from "../domain/migration";
import { DATA_LIMITS, type ParseResult } from "../domain/schema";
import type { PulseData } from "../domain/types";

export type RowKind = "presets" | "setlists";
export type BackupSummary = Omit<PulseData, RowKind> & { presets: {id: string}[]; setlists: {id: string}[] };
export type StagedPreview = { ok: true; staged: true; data: BackupSummary; warnings: string[] };
export type BackupReadMessage =
  | { type: "progress"; read: number; total: number }
  | { type: "staged"; result: StagedPreview }
  | { type: "complete"; result: ParseResult<PulseData> };
export type BackupReadCommand = { type: "open"; file: File; owner: string } | {type: "materialize" | "discard"};
export interface StreamRow { kind: RowKind; index: number; value: unknown; }

const MiB = 1024 * 1024;
export function bulkReadBudget(deviceMemory?: number): number {
  return (deviceMemory !== undefined && deviceMemory <= 4 ? 3 : 4) * MiB;
}
class BackupLimitError extends Error {}

export async function readStreamDocument(
  stream: ReadableStream<Uint8Array>,
  onProgress: (read: number) => void,
  stageRows?: (batch: StreamRow[]) => Promise<void>,
): Promise<unknown> {
  let root: unknown;
  let read = 0;
  let batch: StreamRow[] = [];
  const parser = new JSONParser({ stringBufferSize: 16 * 1024, keepStack: true });
  parser.onValue = ({ key, stack, value, parent }) => {
    if (!stack.length) { root = value; return; }
    if (typeof key === "string" && typeof value === "string") {
      const max = key === "name" ? DATA_LIMITS.nameLength : key === "id" || key === "presetId" ? 128 : null;
      if (max !== null && value.length > max) throw new BackupLimitError(`${key}는 최대 ${max}자입니다`);
    }
    if (typeof key !== "number") return;
    const collection = stack.at(-1)?.key;
    if ((collection === "items" || collection === "presetIds") && key >= DATA_LIMITS.setlistItems) throw new BackupLimitError("목록당 곡은 최대 1000개입니다");
    if (stack.length !== 2 || (collection !== "presets" && collection !== "setlists")) return;
    if (key >= DATA_LIMITS[collection]) throw new BackupLimitError(`${collection} 수가 허용 범위를 넘습니다`);
    if (stageRows && Array.isArray(parent)) {
      batch.push({ kind: collection, index: key, value });
      // Retain length for framing checks, but release the completed row after staging.
      delete parent[key];
    }
  };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const reader = stream.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      for (let offset = 0; offset < chunk.value.byteLength; offset += 64 * 1024) {
        const bytes = chunk.value.subarray(offset, offset + 64 * 1024);
        const text = decoder.decode(bytes, { stream: true });
        if (text) parser.write(text);
        if (stageRows && batch.length) { await stageRows(batch); batch = []; }
        read += bytes.byteLength;
        onProgress(read);
      }
    }
    const tail = decoder.decode();
    if (tail) parser.write(tail);
    if (!parser.isEnded) parser.end();
    if (stageRows && batch.length) await stageRows(batch);
    return root;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function readFailure(error: unknown): {ok: false; issues: {path: string; message: string}[]} {
  const message = error instanceof BackupLimitError ? error.message :
    error instanceof DOMException && error.name === "QuotaExceededError" ? "임시 저장 공간이 부족합니다. 현재 자료를 백업한 뒤 공간을 확보해 주세요." :
    error instanceof DOMException && error.name === "AbortError" ? "백업 읽기가 취소되었습니다." :
    "JSON 문법과 UTF-8 인코딩 또는 임시 저장소 접근을 확인해 주세요.";
  return { ok: false, issues: [{ path: "$", message }] };
}
export async function parseBackupStream(stream: ReadableStream<Uint8Array>, onProgress: (read: number) => void): Promise<ParseResult<PulseData>> {
  try { return parseBackupValue(await readStreamDocument(stream, onProgress), true); }
  catch (error) { return readFailure(error); }
}

export async function readBackupFile(file: Blob, onProgress: (read: number) => void, byteBudget: number): Promise<ParseResult<PulseData>> {
  if (file.size <= byteBudget) {
    const result = parseBackup(await file.text(), "file");
    onProgress(file.size);
    return result;
  }
  return parseBackupStream(file.stream(), onProgress);
}
