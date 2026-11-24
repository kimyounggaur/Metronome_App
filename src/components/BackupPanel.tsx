import { Download, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseBackup, serializeBackup } from "../domain/migration";
import { DATA_LIMITS, formatIssues, type ParseResult } from "../domain/schema";
import type { PulseData } from "../domain/types";
import type { BackupReadCommand, BackupReadMessage, StagedPreview } from "../storage/readBackupFile";
import { downloadText } from "../storage/pulseStorage";

interface BackupPanelProps {
  data: PulseData;
  revision?: number;
  importData: (data: PulseData, mode: "merge" | "replace", expectedRevision?: number, signal?: AbortSignal) => boolean | Promise<boolean>;
  onToast: (message: string) => void;
}
const fileError = (message: string): ParseResult<PulseData> => ({ ok: false, issues: [{ path: "$", message }] });

export function BackupPanel({ data, revision, importData, onToast }: BackupPanelProps) {
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<ParseResult<PulseData> | StagedPreview | null>(null);
  const [previewRevision, setPreviewRevision] = useState(revision);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmed, setConfirmed] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const publication = useRef<AbortController | null>(null);
  const worker = useRef<Worker | null>(null);
  const materialized = useRef<((result: ParseResult<PulseData>) => void) | null>(null);
  const owner = useRef("");
  if (!owner.current) owner.current = crypto.randomUUID();
  function discardWorker() {
    const reader = worker.current;
    if (reader) {
      reader.onmessage = null;
      reader.onerror = null;
      reader.postMessage({type: "discard"} satisfies BackupReadCommand);
    }
    worker.current = null;
    materialized.current?.(fileError("백업 읽기가 취소되었습니다."));
    materialized.current = null;
  }
  useEffect(() => () => { publication.current?.abort(); discardWorker(); }, []);

  function stopReader() {
    discardWorker();
    setProgress(null);
  }
  function resetPreview() {
    stopReader();
    setPreview(null);
    setApplyError(null);
    setConfirmed(false);
  }
  function inspectPaste() {
    resetPreview();
    setSelected(null);
    setPreviewRevision(revision);
    setPreview(parseBackup(input));
  }
  function readFile(file: File) {
    resetPreview();
    setPreviewRevision(revision);
    setProgress(0);
    try {
      const reader = new Worker(new URL("../storage/backupWorker.ts", import.meta.url), { type: "module" });
      worker.current = reader;
      reader.onmessage = (event: MessageEvent<BackupReadMessage>) => {
        if (worker.current !== reader) return;
        if (event.data.type === "progress") {
          setProgress(Math.floor(100 * event.data.read / Math.max(1, event.data.total)));
        } else if (event.data.type === "staged") {
          setPreview(event.data.result);
          setProgress(null);
        } else if (materialized.current) {
          materialized.current(event.data.result);
          materialized.current = null;
        } else {
          setPreview(event.data.result);
          stopReader();
        }
      };
      reader.onerror = () => {
        if (worker.current !== reader) return;
        setPreview(fileError("파일 처리를 시작할 수 없습니다. 다시 열어 주세요."));
        stopReader();
      };
      reader.postMessage({type: "open", file, owner: owner.current} satisfies BackupReadCommand);
    } catch {
      stopReader();
      setPreview(fileError("파일 읽기를 시작할 수 없습니다. 다시 선택해 주세요."));
    }
  }
  function selectFile(file?: File) {
    resetPreview();
    setInput("");
    setSelected(file ?? null);
    if (file && file.size <= DATA_LIMITS.importBytes) readFile(file);
  }
  async function copyBackup() {
    const raw = serializeBackup(data);
    try {
      await navigator.clipboard.writeText(raw);
      setCopyFallback(null);
      onToast("백업 JSON을 복사했습니다");
    } catch {
      setCopyFallback(raw);
      onToast("복사할 수 없습니다. 백업 다운로드 또는 수동 복사를 이용해 주세요.");
    }
  }
  async function applyPreview() {
    if (!preview?.ok || publication.current || stale) return;
    const controller = new AbortController();
    publication.current = controller;
    setApplying(true);
    setApplyError(null);
    try {
      let ready: ParseResult<PulseData>;
      if ("staged" in preview) {
        const reader = worker.current;
        if (!reader) throw new Error("백업 파일을 다시 선택해 주세요.");
        ready = await new Promise(resolve => {
          materialized.current = resolve;
          reader.postMessage({type: "materialize"} satisfies BackupReadCommand);
        });
      } else ready = preview;
      if (!ready.ok) throw new Error(formatIssues(ready.issues));
      if (controller.signal.aborted) { setApplyError("가져오기가 취소되었습니다."); return; }
      if (await importData(ready.data, mode, previewRevision, controller.signal)) {
        discardWorker();
        onToast("백업 가져오기와 저장이 완료되었습니다");
        setSelected(null);
        setInput("");
        setPreview(null);
      } else {
        setApplyError(controller.signal.aborted ? "가져오기가 취소되었습니다." : "가져오기를 완료하지 못했습니다. 저장 상태를 확인하고 다시 검토해 주세요.");
        setConfirmed(false);
      }
    } catch {
      setApplyError("가져오기를 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      publication.current = null;
      setApplying(false);
    }
  }
  const incoming = preview?.ok ? preview.data : null;
  const stale = previewRevision !== revision;
  const tooMany = mode === "merge" && incoming && (data.presets.length + incoming.presets.length > DATA_LIMITS.presets
    || data.setlists.length + incoming.setlists.length > DATA_LIMITS.setlists);
  return <section className="space-y-3">
    <h3 className="font-semibold">백업 내보내기 / 가져오기</h3>
    <div className="grid grid-cols-2 gap-2">
      <button className="touch-target rounded-2xl px-2 surface-2" type="button" onClick={() => downloadText(serializeBackup(data), "pulse-backup-v2.json")}><span className="inline-flex items-center gap-2"><Download size={16} aria-hidden="true" />백업 다운로드</span></button>
      <button className="touch-target rounded-2xl px-2 surface-2" type="button" aria-label="JSON 내보내기 복사" onClick={() => void copyBackup()}>JSON 복사</button>
    </div>
    {copyFallback !== null && <textarea className="h-28 w-full rounded-2xl p-3 text-xs surface-2" readOnly value={copyFallback} aria-label="설정 JSON 내보내기" onFocus={event => event.target.select()} />}
    <label className="block text-sm">백업 JSON 파일<input className="mt-2 block w-full text-sm" type="file" accept=".json,application/json" disabled={applying} onChange={event => { selectFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {selected && <p className="break-all text-sm">{selected.name} · {selected.size.toLocaleString("ko-KR")}바이트</p>}
    {selected && !preview && progress === null && selected.size > DATA_LIMITS.importBytes && <button type="button" className="touch-target rounded-xl px-3 surface-2" onClick={() => readFile(selected)}>대용량 백업 열기</button>}
    {progress !== null && <div className="flex items-center gap-2"><span role="status">백업 검증 중 · {progress}%</span><button className="touch-target rounded-xl px-3 surface-2" type="button" onClick={() => selectFile()}>읽기 취소</button></div>}
    <textarea className="h-24 w-full rounded-2xl p-3 text-sm surface-2" value={input} disabled={applying} onChange={event => { setInput(event.target.value); setSelected(null); resetPreview(); }} aria-label="설정 JSON 가져오기" placeholder="또는 백업 JSON을 붙여넣으세요" />
    <button className="touch-target w-full rounded-2xl surface-2" type="button" aria-label="JSON 가져오기" disabled={applying || progress !== null || !input.trim()} onClick={inspectPaste}><span className="inline-flex items-center gap-2"><Upload size={16} aria-hidden="true" />검증하고 미리보기</span></button>
    {preview && !preview.ok && <pre className="whitespace-pre-wrap break-words rounded-2xl p-3 text-sm text-[color:var(--danger)] surface-2" role="alert">가져오기 거절 · 기존 데이터는 유지됩니다.{"\n"}{formatIssues(preview.issues)}</pre>}
    {preview?.ok && incoming && <div className="space-y-3 rounded-2xl p-3 surface-2" aria-busy={applying}>
      <p>검증 완료 · 프리셋 {incoming.presets.length}개 / 셋리스트 {incoming.setlists.length}개 / 거절 0개</p>
      <p className="text-sm">동일 ID 충돌: 프리셋 {incoming.presets.filter(p => data.presets.some(old => old.id === p.id)).length}개, 셋리스트 {incoming.setlists.filter(s => data.setlists.some(old => old.id === s.id)).length}개</p>
      <p className="text-sm">적용할 설정 · {incoming.settings.bpm} BPM · {incoming.settings.timeSignature.beats}/{incoming.settings.timeSignature.noteValue} · {incoming.settings.practice.timerSeconds ?? 0}초 타이머</p>
      {preview.warnings.map(warning => <p className="text-sm" key={warning}>{warning}</p>)}
      <label className="block">가져오기 방식<select className="touch-target mt-1 w-full rounded-xl px-2 surface" disabled={applying} value={mode} onChange={event => { setMode(event.target.value as "merge" | "replace"); setConfirmed(false); }}><option value="merge">병합 (기존 목록 유지, 가져온 설정 적용)</option><option value="replace">교체 (현재 설정과 모든 목록 대체)</option></select></label>
      {mode === "replace" && <label className="flex min-h-12 items-center gap-2"><input type="checkbox" checked={confirmed} disabled={applying} onChange={event => setConfirmed(event.target.checked)} />현재 설정·프리셋·셋리스트를 백업 내용으로 교체합니다.</label>}
      {tooMany && <p role="alert">병합 후 프리셋 1000개 또는 셋리스트 100개를 초과합니다.</p>}
      {stale && !applying && <p role="status">미리보기 이후 저장 내용이 바뀌었습니다. <button className="touch-target underline" type="button" onClick={() => { setPreviewRevision(revision); setConfirmed(false); setApplyError(null); }}>현재 자료로 미리보기 갱신</button></p>}
      {applyError && <p role="status">{applyError}</p>}
      {applying && <button className="touch-target rounded-xl px-3 surface" type="button" onClick={() => publication.current?.abort()}>가져오기 취소</button>}
      <button className="touch-target w-full rounded-xl bg-[color:var(--accent)] text-[color:var(--bg)]" type="button" disabled={applying || !!tooMany || stale || (mode === "replace" && !confirmed)} onClick={() => void applyPreview()}>{applying ? "가져오는 중…" : "가져오기 적용"}</button>
    </div>}
  </section>;
}
