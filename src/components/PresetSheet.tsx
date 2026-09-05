import { ArrowDown, ArrowUp, Copy, Download, ListMusic, Pencil, Save, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { addSetlistItem, createPreset, duplicatePreset, moveSetlistItem, navigateSetlist, presetMatchesSettings, removePreset, removeSetlist, removeSetlistItem, renamePreset, renameSetlist, selectPreset, selectSetlist, selectSetlistItem, uniquePresetName, updatePresetFromSettings } from "../domain/presets";
import { mergeBackup, parseBackup } from "../domain/migration";
import { DATA_LIMITS, formatIssues, type ParseResult } from "../domain/schema";
import type { MetronomePreset, PulseData } from "../domain/types";
import type { DataUpdate } from "../hooks/usePulseStorage";
import { downloadText } from "../storage/pulseStorage";

interface PresetSheetProps {
  data: PulseData;
  setData: (value: DataUpdate<PulseData>) => boolean | void;
  importData: (data: PulseData, mode?: "merge" | "replace") => boolean;
  onToast: (message: string) => void;
  onApplyPreset?: (preset: MetronomePreset) => void;
  onNavigate?: (direction: -1 | 1) => void;
  onSelectionChange?: (nextData: PulseData) => void;
}

export function PresetSheet({ data, setData, importData, onToast, onApplyPreset, onNavigate, onSelectionChange }: PresetSheetProps) {
  const { settings, presets, setlists, navigation } = data;
  const [name, setName] = useState(`연습 ${settings.bpm}`);
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<ParseResult<PulseData> | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingSetlist, setEditingSetlist] = useState(false);
  const [listNameDraft, setListNameDraft] = useState("");
  const [addPresetId, setAddPresetId] = useState("");
  const exportText = useMemo(() => JSON.stringify(data, null, 2), [data]);
  const activeSetlist = setlists.find((s) => s.id === navigation.activeSetlistId);
  const activePreset = presets.find((p) => p.id === navigation.activePresetId);
  const isDirty = activePreset ? !presetMatchesSettings(activePreset, settings) : false;
  const filteredPresets = presets.filter((p) => p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const importPlan = preview?.ok ? (mode === "merge" ? mergeBackup(data, preview.data) : preview) : null;

  function savePreset() {
    const safeName = uniquePresetName(presets, name);
    const preset = createPreset(settings, safeName);
    const result = setData((current) => ({ ...current, presets: [preset, ...current.presets], navigation: { ...current.navigation, activePresetId: preset.id } }));
    if (result !== false) { setName(`연습 ${settings.bpm}`); onToast(`프리셋 '${safeName}' 추가됨`); }
  }
  function deletePreset(id: string) {
    commit(removePreset(data, id));
    onToast("프리셋과 연결된 목록 항목을 삭제했습니다");
  }
  function commit(next: PulseData, selection = false) {
    if (onSelectionChange && (selection || JSON.stringify(next.settings) !== JSON.stringify(data.settings) || next.navigation.activePresetId !== navigation.activePresetId)) onSelectionChange(next);
    else setData(next);
  }
  function loadPreset(preset: MetronomePreset) {
    if (onSelectionChange) onSelectionChange(selectPreset(data, preset.id));
    else if (onApplyPreset) onApplyPreset(preset);
    else setData((current) => selectPreset(current, preset.id));
  }
  function move(direction: -1 | 1) {
    if (onSelectionChange) onSelectionChange(navigateSetlist(data, direction));
    else if (onNavigate) onNavigate(direction);
    else setData((current) => navigateSetlist(current, direction));
  }
  function createSetlist() {
    if (!presets.length) return;
    const setlist = { id: crypto.randomUUID(), name: `셋리스트 ${setlists.length + 1}`, items: [...presets].reverse().map((preset) => ({ id: crypto.randomUUID(), presetId: preset.id })) };
    commit(selectSetlist({ ...data, setlists: [...data.setlists, setlist] }, setlist.id), true);
    onToast("셋리스트를 만들었습니다");
  }
  function inspectImport(raw = importText) { setPreview(parseBackup(raw)); setReplaceConfirmed(false); }
  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > DATA_LIMITS.importBytes) { setPreview({ ok: false, issues: [{ path: "$", message: "백업 파일은 2 MiB 이하여야 합니다" }] }); return; }
    try { const raw = await file.text(); setImportText(raw); inspectImport(raw); }
    catch { setPreview({ ok: false, issues: [{ path: "$", message: "파일을 읽지 못했습니다" }] }); }
  }
  async function copyBackup() {
    try { if (!navigator.clipboard) throw new Error("unavailable"); await navigator.clipboard.writeText(exportText); setCopyFailed(false); onToast("백업 JSON을 복사했습니다"); }
    catch { setCopyFailed(true); onToast("복사할 수 없습니다. 백업 다운로드 또는 수동 복사를 이용해 주세요."); }
  }

  return <div className="space-y-6">
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold"><Save size={16} aria-hidden="true" />프리셋 저장</h3>
      {activePreset && <div className="space-y-2 rounded-2xl p-3 surface-2"><p className="break-words text-sm">현재: <strong>{activePreset.name}</strong>{isDirty ? " · 저장본과 다름" : " · 저장본과 같음"}</p><button className="touch-target w-full rounded-xl px-3 surface" type="button" disabled={!isDirty} onClick={() => { setData((current) => updatePresetFromSettings(current, activePreset.id)); onToast("현재 프리셋을 업데이트했습니다"); }}>현재 항목 업데이트</button></div>}
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="preset-name">프리셋 이름</label>
        <input id="preset-name" className="min-h-12 min-w-0 flex-1 rounded-2xl px-3 surface-2" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="프리셋 이름" />
        <button className="touch-target rounded-2xl px-4 bg-[color:var(--accent)] text-[color:var(--bg)]" type="button" aria-label="현재 설정 저장" onClick={savePreset} disabled={presets.length >= DATA_LIMITS.presets}>새로 저장</button>
      </div>
    </section>
    <section className="space-y-3">
      <h3 className="font-semibold">프리셋 목록</h3>
      {presets.length > 0 && <input className="min-h-12 w-full rounded-2xl px-3 surface-2" type="search" aria-label="프리셋 검색" placeholder="이름으로 검색" value={search} onChange={(event) => setSearch(event.target.value)} />}
      {presets.length === 0 ? <p className="rounded-2xl p-3 text-sm surface-2">저장된 프리셋이 없습니다.</p> : <div className="space-y-2">{filteredPresets.map((preset) => <div className="space-y-2 rounded-2xl p-2 surface-2" key={preset.id}>
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <button className="min-h-12 min-w-0 text-left" type="button" aria-label={`${preset.name} 불러오기`} aria-pressed={navigation.activePresetId === preset.id} onClick={() => loadPreset(preset)}>
          <span className="block truncate font-bold">{preset.name}</span><span className="text-sm text-[color:var(--muted)]">{preset.bpm} BPM · {preset.timeSignature.beats}/{preset.timeSignature.noteValue}</span>
        </button>
        <button className="touch-target rounded-full px-3 text-[color:var(--danger)] surface" type="button" aria-label={`${preset.name} 삭제`} onClick={() => deletePreset(preset.id)}><Trash2 size={18} aria-hidden="true" /></button>
        </div>
        <div className="flex flex-wrap gap-2"><button className="touch-target flex items-center gap-1 rounded-xl px-3 text-sm surface" type="button" aria-label={`${preset.name} 이름 변경`} onClick={() => { setEditingPresetId(preset.id); setRenameDraft(preset.name); }}><Pencil size={15} aria-hidden="true" />이름</button><button className="touch-target flex items-center gap-1 rounded-xl px-3 text-sm surface" type="button" aria-label={`${preset.name} 복제`} disabled={presets.length >= DATA_LIMITS.presets} onClick={() => { setData((current) => duplicatePreset(current, preset.id)); onToast("프리셋을 복제했습니다"); }}><Copy size={15} aria-hidden="true" />복제</button></div>
        {editingPresetId === preset.id && <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (!renameDraft.trim()) return; setData((current) => renamePreset(current, preset.id, renameDraft)); setEditingPresetId(null); }}><input className="min-h-12 min-w-0 flex-1 rounded-xl px-2 surface" maxLength={80} aria-label="변경할 프리셋 이름" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} autoFocus /><button className="touch-target rounded-xl px-3 surface" type="submit" disabled={!renameDraft.trim()}>이름 적용</button><button className="touch-target rounded-xl px-3 surface" type="button" onClick={() => setEditingPresetId(null)}>취소</button></form>}
      </div>)}</div>}
      {presets.length > 0 && filteredPresets.length === 0 && <p className="text-sm">검색 결과가 없습니다.</p>}
    </section>
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold"><ListMusic size={16} aria-hidden="true" />셋리스트</h3>
      {setlists.length > 0 && <select className="touch-target w-full rounded-2xl px-3 surface-2" aria-label="활성 셋리스트" value={navigation.activeSetlistId ?? ""} onChange={(event) => { commit(selectSetlist(data, event.target.value || null), true); setEditingSetlist(false); }}><option value="">셋리스트 선택</option>{setlists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <div className="grid grid-cols-3 gap-2">
        <button className="touch-target rounded-2xl surface-2" type="button" aria-label="이전 프리셋" disabled={!activeSetlist?.items.length} onClick={() => move(-1)}>이전</button>
        <button className="touch-target rounded-2xl surface-2" type="button" aria-label="현재 프리셋 목록으로 셋리스트 만들기" disabled={!presets.length || setlists.length >= DATA_LIMITS.setlists} onClick={createSetlist}>생성</button>
        <button className="touch-target rounded-2xl surface-2" type="button" aria-label="다음 프리셋" disabled={!activeSetlist?.items.length} onClick={() => move(1)}>다음</button>
      </div>
      <p className="text-sm text-[color:var(--muted)]">{activeSetlist ? `${activeSetlist.name}: ${activeSetlist.items.length}곡 · 마지막 곡 다음에는 처음으로 돌아갑니다.` : "셋리스트를 선택하면 이전·다음으로 이동할 수 있습니다."}</p>
      {activeSetlist && <div className="space-y-3">
        <div className="flex flex-wrap gap-2"><button className="touch-target rounded-xl px-3 text-sm surface-2" type="button" onClick={() => { setEditingSetlist(true); setListNameDraft(activeSetlist.name); }}>셋리스트 이름 변경</button><button className="touch-target rounded-xl px-3 text-sm text-[color:var(--danger)] surface-2" type="button" onClick={() => { commit(removeSetlist(data, activeSetlist.id)); setEditingSetlist(false); onToast("셋리스트를 삭제했습니다. 프리셋은 유지됩니다."); }}>현재 셋리스트 삭제</button></div>
        {editingSetlist && <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (!listNameDraft.trim()) return; setData((current) => renameSetlist(current, activeSetlist.id, listNameDraft)); setEditingSetlist(false); }}><input className="min-h-12 min-w-0 flex-1 rounded-xl px-2 surface-2" aria-label="변경할 셋리스트 이름" maxLength={80} value={listNameDraft} onChange={(event) => setListNameDraft(event.target.value)} autoFocus /><button className="touch-target rounded-xl px-3 surface-2" type="submit" disabled={!listNameDraft.trim()}>이름 적용</button><button className="touch-target rounded-xl px-3 surface-2" type="button" onClick={() => setEditingSetlist(false)}>취소</button></form>}
        <ol className="space-y-2" aria-label="셋리스트 곡 순서">{activeSetlist.items.map((item, index) => {
          const preset = presets.find((p) => p.id === item.presetId);
          return <li className="rounded-2xl p-2 surface-2" key={item.id}><button className="min-h-12 w-full break-words text-left font-semibold" aria-label={`${index + 1}번 ${preset?.name ?? "알 수 없는 곡"} 선택`} aria-pressed={navigation.activeItemIndex === index && navigation.activePresetId === item.presetId} type="button" onClick={() => commit(selectSetlistItem(data, index), true)}>{index + 1}. {preset?.name ?? "알 수 없는 곡"}</button><div className="flex gap-2"><button className="touch-target grid place-items-center rounded-xl px-3 surface" type="button" aria-label={`${index + 1}번 곡 위로`} disabled={index === 0} onClick={() => commit(moveSetlistItem(data, activeSetlist.id, item.id, -1))}><ArrowUp size={17} aria-hidden="true" /></button><button className="touch-target grid place-items-center rounded-xl px-3 surface" type="button" aria-label={`${index + 1}번 곡 아래로`} disabled={index === activeSetlist.items.length - 1} onClick={() => commit(moveSetlistItem(data, activeSetlist.id, item.id, 1))}><ArrowDown size={17} aria-hidden="true" /></button><button className="touch-target rounded-xl px-3 text-sm text-[color:var(--danger)] surface" type="button" aria-label={`${index + 1}번 곡 제거`} onClick={() => commit(removeSetlistItem(data, activeSetlist.id, item.id))}>목록에서 제거</button></div></li>;
        })}</ol>
        {!activeSetlist.items.length && <p className="text-sm">셋리스트가 비었습니다. 아래에서 곡을 추가해 주세요.</p>}
        <div className="flex gap-2"><select className="touch-target min-w-0 flex-1 rounded-xl px-2 surface-2" aria-label="셋리스트에 추가할 프리셋" value={presets.some((p) => p.id === addPresetId) ? addPresetId : ""} onChange={(event) => setAddPresetId(event.target.value)}><option value="">추가할 곡 선택</option>{presets.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select><button className="touch-target rounded-xl px-3 surface-2" type="button" disabled={!presets.some((p) => p.id === addPresetId) || activeSetlist.items.length >= DATA_LIMITS.setlistItems} onClick={() => commit(addSetlistItem(data, activeSetlist.id, addPresetId))}>곡 추가</button></div>
        <p className="text-xs text-[color:var(--muted)]">같은 곡을 여러 번 추가할 수 있습니다. 항목을 제거해도 저장된 프리셋은 유지됩니다.</p>
      </div>}
    </section>
    <section className="space-y-3">
      <h3 className="font-semibold">백업 내보내기 / 가져오기</h3>
      <div className="grid grid-cols-2 gap-2">
        <button className="touch-target rounded-2xl px-2 surface-2" type="button" onClick={() => downloadText(exportText, "pulse-backup-v2.json")}><span className="inline-flex items-center gap-2"><Download size={16} aria-hidden="true" />백업 다운로드</span></button>
        <button className="touch-target rounded-2xl px-2 surface-2" type="button" aria-label="JSON 내보내기 복사" onClick={() => void copyBackup()}>JSON 복사</button>
      </div>
      {copyFailed && <textarea className="h-28 w-full rounded-2xl p-3 text-xs surface-2" readOnly value={exportText} aria-label="설정 JSON 내보내기" onFocus={(event) => event.target.select()} />}
      <label className="block text-sm">백업 JSON 파일 (최대 2 MiB)<input className="mt-2 block w-full text-sm" type="file" accept=".json,application/json" onChange={(event) => void readFile(event.target.files?.[0])} /></label>
      <textarea className="h-24 w-full rounded-2xl p-3 text-sm surface-2" value={importText} onChange={(event) => { setImportText(event.target.value); setPreview(null); }} aria-label="설정 JSON 가져오기" placeholder="또는 백업 JSON을 붙여넣으세요" />
      <button className="touch-target w-full rounded-2xl surface-2" type="button" aria-label="JSON 가져오기" onClick={() => inspectImport()}><span className="inline-flex items-center gap-2"><Upload size={16} aria-hidden="true" />검증하고 미리보기</span></button>
      {preview && !preview.ok && <pre className="whitespace-pre-wrap break-words rounded-2xl p-3 text-sm text-[color:var(--danger)] surface-2" role="alert">가져오기 거절 · 기존 데이터는 유지됩니다.{"\n"}{formatIssues(preview.issues)}</pre>}
      {preview?.ok && <div className="space-y-3 rounded-2xl p-3 surface-2">
        <p>검증 완료 · 프리셋 {preview.data.presets.length}개 / 셋리스트 {preview.data.setlists.length}개 / 거절 0개</p>
        <p className="text-sm">동일 ID 충돌: 프리셋 {preview.data.presets.filter((p) => presets.some((old) => old.id === p.id)).length}개, 셋리스트 {preview.data.setlists.filter((s) => setlists.some((old) => old.id === s.id)).length}개</p>
        {preview.warnings.map((warning) => <p className="text-sm" key={warning}>{warning}</p>)}
        <label className="block">가져오기 방식<select className="touch-target mt-1 w-full rounded-xl px-2 surface" value={mode} onChange={(event) => { setMode(event.target.value as "merge" | "replace"); setReplaceConfirmed(false); }}><option value="merge">병합 (기존 목록 유지, 가져온 설정 적용)</option><option value="replace">교체 (현재 설정과 모든 목록 대체)</option></select></label>
        {mode === "replace" && <label className="flex min-h-12 items-center gap-2"><input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} />현재 설정·프리셋·셋리스트를 백업 내용으로 교체합니다.</label>}
        {importPlan && !importPlan.ok && <p role="alert" className="whitespace-pre-wrap text-sm text-[color:var(--danger)]">{formatIssues(importPlan.issues)}</p>}
        <button className="touch-target w-full rounded-xl bg-[color:var(--accent)] text-[color:var(--bg)]" type="button" disabled={!importPlan?.ok || (mode === "replace" && !replaceConfirmed)} onClick={() => { if (importData(preview.data, mode)) { onToast("백업 가져오기와 저장이 완료되었습니다"); setPreview(null); setImportText(""); } }}>가져오기 적용</button>
      </div>}
    </section>
  </div>;
}
