import { ArrowDown, ArrowUp, Copy, ListMusic, Pencil, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { addSetlistItem, createPreset, duplicatePreset, moveSetlistItem, navigateSetlist, presetMatchesSettings, removePreset, removeSetlist, removeSetlistItem, renamePreset, renameSetlist, selectPreset, selectSetlist, selectSetlistItem, uniquePresetName, updatePresetFromSettings } from "../domain/presets";
import { BackupPanel } from "./BackupPanel";
import { serializeBackup } from "../domain/migration";
import { DATA_LIMITS } from "../domain/schema";
import type { MetronomePreset, PulseData } from "../domain/types";
import type { DataUpdate } from "../hooks/usePulseStorage";
import { downloadText } from "../storage/pulseStorage";

type SaveResponse = boolean | void | Promise<boolean | void>;

interface PresetSheetProps {
  data: PulseData;
  setData: (value: DataUpdate<PulseData>) => SaveResponse;
  importData: (data: PulseData, mode?: "merge" | "replace", expectedRevision?: number, signal?: AbortSignal) => boolean | Promise<boolean>;
  storageError?: string | null;
  revision?: number;
  hasPendingSave?: boolean;
  retrySave?: () => Promise<boolean>;
  downloadBackup?: () => void;
  onToast: (message: string) => void;
  onApplyPreset?: (preset: MetronomePreset) => void;
  onNavigate?: (direction: -1 | 1) => void;
  onSelectionChange?: (nextData: PulseData) => SaveResponse;
}

export function PresetSheet({ data, setData, importData, onToast, onApplyPreset, onNavigate, onSelectionChange, revision, storageError, hasPendingSave, retrySave, downloadBackup }: PresetSheetProps) {
  const { settings, presets, setlists, navigation } = data;
  const [name, setName] = useState(`연습 ${settings.bpm}`);
  const [status, setStatus] = useState("");
  const [writing, setWriting] = useState(false);
  const submitting = useRef(false);
  const renameBase = useRef("");
  const [search, setSearch] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingSetlist, setEditingSetlist] = useState(false);
  const [listNameDraft, setListNameDraft] = useState("");
  const [addPresetId, setAddPresetId] = useState("");
  const activeSetlist = setlists.find((s) => s.id === navigation.activeSetlistId);
  const activePreset = presets.find((p) => p.id === navigation.activePresetId);
  const isDirty = activePreset ? !presetMatchesSettings(activePreset, settings) : false;
  const filteredPresets = presets.filter((p) => p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  async function persist(action: () => SaveResponse, message?: string): Promise<boolean> {
    if (submitting.current) return false;
    submitting.current = true;
    setWriting(true);
    setStatus("");
    try {
      if (await action() === false) {
        setStatus("저장 결과를 확인해 주세요.");
        return false;
      }
      setStatus("이 기기에 저장됨");
      if (message) onToast(message);
      return true;
    } catch {
      setStatus("저장에 실패했습니다. 현재 작업을 백업하거나 다시 시도해 주세요.");
      return false;
    } finally {
      submitting.current = false;
      setWriting(false);
    }
  }
  async function savePreset() {
    const safeName = uniquePresetName(presets, name);
    const preset = createPreset(settings, safeName);
    const saved = await persist(() => setData(current => ({
      ...current, presets: [preset, ...current.presets], navigation: { ...current.navigation, activePresetId: preset.id }
    })), `프리셋 '${safeName}' 추가됨`);
    if (saved) setName(`연습 ${settings.bpm}`);
  }
  function deletePreset(id: string) {
    void commit(removePreset(data, id), false, "프리셋과 연결된 목록 항목을 삭제했습니다");
  }
  function commit(next: PulseData, selection = false, message?: string) {
    const changed = next.navigation.activePresetId !== navigation.activePresetId || JSON.stringify(next.settings) !== JSON.stringify(data.settings);
    return persist(() => onSelectionChange && (selection || changed) ? onSelectionChange(next) : setData(next), message);
  }
  function loadPreset(preset: MetronomePreset) {
    if (onSelectionChange) void commit(selectPreset(data, preset.id), true);
    else if (onApplyPreset) onApplyPreset(preset);
    else void persist(() => setData(current => selectPreset(current, preset.id)));
  }
  function move(direction: -1 | 1) {
    if (onSelectionChange) void commit(navigateSetlist(data, direction), true);
    else if (onNavigate) onNavigate(direction);
    else void persist(() => setData(current => navigateSetlist(current, direction)));
  }
  function createSetlist() {
    if (!presets.length) return;
    const setlist = { id: crypto.randomUUID(), name: `셋리스트 ${setlists.length + 1}`, items: [...presets].reverse().map((preset) => ({ id: crypto.randomUUID(), presetId: preset.id })) };
    void commit(selectSetlist({ ...data, setlists: [...data.setlists, setlist] }, setlist.id), true, "셋리스트를 만들었습니다");
  }
  async function applyName(currentName: string, save: () => SaveResponse, close: () => void) {
    if (currentName !== renameBase.current) {
      renameBase.current = currentName;
      setStatus(`다른 탭에서 이름을 ‘${currentName}’(으)로 변경했습니다. 내 초안을 적용하려면 이름 적용을 다시 눌러 주세요.`);
      return;
    }
    if (await persist(save)) close();
  }
  return <div className="space-y-6">
    {(storageError || writing || hasPendingSave || status) && <div className="rounded-xl p-3 text-sm surface-2">
      <p role="status">{storageError || (writing || hasPendingSave ? "저장 중" : status)}</p>
      {storageError && <div className="flex flex-wrap gap-2">
        {retrySave && <button className="touch-target rounded-xl px-3 surface" type="button" disabled={writing} onClick={() => void persist(retrySave)}>저장 다시 시도</button>}
        <button className="touch-target rounded-xl px-3 surface" type="button" onClick={downloadBackup ?? (() => downloadText(serializeBackup(data), "pulse-backup-v2.json"))}>현재 작업 백업</button>
      </div>}
    </div>}
    <fieldset className="min-w-0 space-y-6" disabled={writing}>
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold"><Save size={16} aria-hidden="true" />프리셋 저장</h3>
      {activePreset && <div className="space-y-2 rounded-2xl p-3 surface-2"><p className="break-words text-sm">현재: <strong>{activePreset.name}</strong>{isDirty ? " · 저장본과 다름" : " · 저장본과 같음"}</p><button className="touch-target w-full rounded-xl px-3 surface" type="button" disabled={!isDirty} onClick={() => { void persist(() => setData(current => updatePresetFromSettings(current, activePreset.id)), "현재 프리셋을 업데이트했습니다"); }}>현재 항목 업데이트</button></div>}
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
        <div className="flex flex-wrap gap-2"><button className="touch-target flex items-center gap-1 rounded-xl px-3 text-sm surface" type="button" aria-label={`${preset.name} 이름 변경`} onClick={() => { renameBase.current = preset.name; setEditingPresetId(preset.id); setRenameDraft(preset.name); }}><Pencil size={15} aria-hidden="true" />이름</button><button className="touch-target flex items-center gap-1 rounded-xl px-3 text-sm surface" type="button" aria-label={`${preset.name} 복제`} disabled={presets.length >= DATA_LIMITS.presets} onClick={() => { void persist(() => setData(current => duplicatePreset(current, preset.id)), "프리셋을 복제했습니다"); }}><Copy size={15} aria-hidden="true" />복제</button></div>
        {editingPresetId === preset.id && <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (!renameDraft.trim()) return; void applyName(preset.name, () => setData(current => renamePreset(current, preset.id, renameDraft)), () => setEditingPresetId(null)); }}><input className="min-h-12 min-w-0 flex-1 rounded-xl px-2 surface" maxLength={80} aria-label="변경할 프리셋 이름" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} autoFocus /><button className="touch-target rounded-xl px-3 surface" type="submit" disabled={!renameDraft.trim()}>이름 적용</button><button className="touch-target rounded-xl px-3 surface" type="button" onClick={() => setEditingPresetId(null)}>취소</button></form>}
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
        <div className="flex flex-wrap gap-2"><button className="touch-target rounded-xl px-3 text-sm surface-2" type="button" onClick={() => { renameBase.current = activeSetlist.name; setEditingSetlist(true); setListNameDraft(activeSetlist.name); }}>셋리스트 이름 변경</button><button className="touch-target rounded-xl px-3 text-sm text-[color:var(--danger)] surface-2" type="button" onClick={() => { void commit(removeSetlist(data, activeSetlist.id), false, "셋리스트를 삭제했습니다. 프리셋은 유지됩니다."); setEditingSetlist(false); }}>현재 셋리스트 삭제</button></div>
        {editingSetlist && <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (!listNameDraft.trim()) return; void applyName(activeSetlist.name, () => setData(current => renameSetlist(current, activeSetlist.id, listNameDraft)), () => setEditingSetlist(false)); }}><input className="min-h-12 min-w-0 flex-1 rounded-xl px-2 surface-2" aria-label="변경할 셋리스트 이름" maxLength={80} value={listNameDraft} onChange={(event) => setListNameDraft(event.target.value)} autoFocus /><button className="touch-target rounded-xl px-3 surface-2" type="submit" disabled={!listNameDraft.trim()}>이름 적용</button><button className="touch-target rounded-xl px-3 surface-2" type="button" onClick={() => setEditingSetlist(false)}>취소</button></form>}
        <ol className="space-y-2" aria-label="셋리스트 곡 순서">{activeSetlist.items.map((item, index) => {
          const preset = presets.find((p) => p.id === item.presetId);
          return <li className="rounded-2xl p-2 surface-2" key={item.id}><button className="min-h-12 w-full break-words text-left font-semibold" aria-label={`${index + 1}번 ${preset?.name ?? "알 수 없는 곡"} 선택`} aria-pressed={navigation.activeItemIndex === index && navigation.activePresetId === item.presetId} type="button" onClick={() => commit(selectSetlistItem(data, index), true)}>{index + 1}. {preset?.name ?? "알 수 없는 곡"}</button><div className="flex gap-2"><button className="touch-target grid place-items-center rounded-xl px-3 surface" type="button" aria-label={`${index + 1}번 곡 위로`} disabled={index === 0} onClick={() => commit(moveSetlistItem(data, activeSetlist.id, item.id, -1))}><ArrowUp size={17} aria-hidden="true" /></button><button className="touch-target grid place-items-center rounded-xl px-3 surface" type="button" aria-label={`${index + 1}번 곡 아래로`} disabled={index === activeSetlist.items.length - 1} onClick={() => commit(moveSetlistItem(data, activeSetlist.id, item.id, 1))}><ArrowDown size={17} aria-hidden="true" /></button><button className="touch-target rounded-xl px-3 text-sm text-[color:var(--danger)] surface" type="button" aria-label={`${index + 1}번 곡 제거`} onClick={() => commit(removeSetlistItem(data, activeSetlist.id, item.id))}>목록에서 제거</button></div></li>;
        })}</ol>
        {!activeSetlist.items.length && <p className="text-sm">셋리스트가 비었습니다. 아래에서 곡을 추가해 주세요.</p>}
        <div className="flex gap-2"><select className="touch-target min-w-0 flex-1 rounded-xl px-2 surface-2" aria-label="셋리스트에 추가할 프리셋" value={presets.some((p) => p.id === addPresetId) ? addPresetId : ""} onChange={(event) => setAddPresetId(event.target.value)}><option value="">추가할 곡 선택</option>{presets.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select><button className="touch-target rounded-xl px-3 surface-2" type="button" disabled={!presets.some((p) => p.id === addPresetId) || activeSetlist.items.length >= DATA_LIMITS.setlistItems} onClick={() => commit(addSetlistItem(data, activeSetlist.id, addPresetId))}>곡 추가</button></div>
        <p className="text-xs text-[color:var(--muted)]">같은 곡을 여러 번 추가할 수 있습니다. 항목을 제거해도 저장된 프리셋은 유지됩니다.</p>
      </div>}
    </section>
    </fieldset>
    <BackupPanel data={data} revision={revision} importData={importData} onToast={onToast} />
  </div>;
}
