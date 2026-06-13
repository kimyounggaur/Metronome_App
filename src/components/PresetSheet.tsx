import { Download, ListMusic, Save, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { applyPreset, createPreset, isPresetArray, isSetlistArray, uniquePresetName } from "../domain/presets";
import type { AppSettings, MetronomePreset, Setlist } from "../domain/types";

interface PresetSheetProps {
  settings: AppSettings;
  setSettings: (value: AppSettings | ((current: AppSettings) => AppSettings)) => void;
  presets: MetronomePreset[];
  setPresets: (value: MetronomePreset[] | ((current: MetronomePreset[]) => MetronomePreset[])) => void;
  setlists: Setlist[];
  setSetlists: (value: Setlist[] | ((current: Setlist[]) => Setlist[])) => void;
  onToast: (message: string) => void;
}

export function PresetSheet({ settings, setSettings, presets, setPresets, setlists, setSetlists, onToast }: PresetSheetProps) {
  const [name, setName] = useState(`Warmup ${settings.bpm}`);
  const [importText, setImportText] = useState("");
  const exportText = useMemo(() => JSON.stringify({ settings, presets, setlists }, null, 2), [presets, settings, setlists]);
  const primarySetlist = setlists[0];

  function savePreset() {
    const safeName = uniquePresetName(presets, name);
    const preset = createPreset(settings, safeName);
    setPresets((current) => [preset, ...current]);
    setName(`Warmup ${settings.bpm}`);
    onToast(`프리셋 '${safeName}' 저장됨`);
  }

  function deletePreset(id: string) {
    if (!window.confirm("이 프리셋을 삭제할까요?")) return;
    setPresets((current) => current.filter((preset) => preset.id !== id));
    setSetlists((current) => current.map((setlist) => ({ ...setlist, presetIds: setlist.presetIds.filter((presetId) => presetId !== id) })));
    onToast("프리셋 삭제됨");
  }

  function loadPreset(preset: MetronomePreset) {
    setSettings((current) => applyPreset(current, preset));
    onToast(`${preset.name} 불러옴`);
  }

  function createSetlistFromPresets() {
    if (presets.length === 0) return;
    const setlist: Setlist = {
      id: crypto.randomUUID(),
      name: `Set ${setlists.length + 1}`,
      presetIds: presets.map((preset) => preset.id).reverse(),
    };
    setSetlists((current) => [setlist, ...current]);
    onToast("셋리스트 생성됨");
  }

  function moveInSetlist(direction: -1 | 1) {
    if (!primarySetlist || primarySetlist.presetIds.length === 0) return;
    const currentIndex = primarySetlist.presetIds.findIndex((id) => {
      const preset = presets.find((item) => item.id === id);
      return preset?.bpm === settings.bpm && preset.name;
    });
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + direction + primarySetlist.presetIds.length) % primarySetlist.presetIds.length;
    const nextPreset = presets.find((preset) => preset.id === primarySetlist.presetIds[nextIndex]);
    if (nextPreset) loadPreset(nextPreset);
  }

  function importJson() {
    try {
      const parsed: unknown = JSON.parse(importText);
      if (typeof parsed !== "object" || parsed === null) throw new Error("Invalid root");
      const payload = parsed as { presets?: unknown; setlists?: unknown; settings?: unknown };
      if (payload.presets !== undefined && !isPresetArray(payload.presets)) throw new Error("Invalid presets");
      if (payload.setlists !== undefined && !isSetlistArray(payload.setlists)) throw new Error("Invalid setlists");
      if (payload.presets) setPresets(payload.presets);
      if (payload.setlists) setSetlists(payload.setlists);
      onToast("JSON 가져오기 완료");
    } catch {
      onToast("가져오기 실패: 기존 데이터 유지");
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--muted)]">
          <Save size={16} aria-hidden="true" />
          프리셋 저장
        </h3>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="preset-name">
            프리셋 이름
          </label>
          <input
            id="preset-name"
            className="min-h-12 min-w-0 flex-1 rounded-2xl px-3 surface-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="프리셋 이름"
          />
          <button className="touch-target rounded-2xl px-4 bg-[color:var(--accent)] text-[color:var(--bg)]" type="button" aria-label="현재 설정 저장" onClick={savePreset}>
            저장
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[color:var(--muted)]">프리셋 목록</h3>
        {presets.length === 0 ? (
          <p className="rounded-2xl p-3 text-sm text-[color:var(--muted)] surface-2">저장된 프리셋이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {presets.map((preset) => (
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-2xl p-2 surface-2" key={preset.id}>
                <button className="min-h-12 min-w-0 text-left" type="button" aria-label={`${preset.name} 불러오기`} onClick={() => loadPreset(preset)}>
                  <span className="block truncate font-bold">{preset.name}</span>
                  <span className="text-sm text-[color:var(--muted)]">
                    {preset.bpm} BPM · {preset.timeSignature.beats}/{preset.timeSignature.noteValue}
                  </span>
                </button>
                <button className="touch-target rounded-full px-3 surface" type="button" aria-label={`${preset.name} 불러오기`} onClick={() => loadPreset(preset)}>
                  로드
                </button>
                <button className="touch-target rounded-full px-3 text-[color:var(--danger)] surface" type="button" aria-label={`${preset.name} 삭제`} onClick={() => deletePreset(preset.id)}>
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--muted)]">
          <ListMusic size={16} aria-hidden="true" />
          셋리스트
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <button className="touch-target rounded-2xl surface-2" type="button" aria-label="이전 프리셋" onClick={() => moveInSetlist(-1)}>
            이전
          </button>
          <button className="touch-target rounded-2xl surface-2" type="button" aria-label="현재 프리셋 목록으로 셋리스트 만들기" onClick={createSetlistFromPresets}>
            생성
          </button>
          <button className="touch-target rounded-2xl surface-2" type="button" aria-label="다음 프리셋" onClick={() => moveInSetlist(1)}>
            다음
          </button>
        </div>
        <p className="text-sm text-[color:var(--muted)]">{primarySetlist ? `${primarySetlist.name}: ${primarySetlist.presetIds.length}곡` : "셋리스트를 만들면 가로 모드에서 이전/다음으로 넘길 수 있습니다."}</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[color:var(--muted)]">내보내기 / 가져오기</h3>
        <textarea className="h-28 w-full resize-none rounded-2xl p-3 text-xs surface-2" readOnly value={exportText} aria-label="설정 JSON 내보내기" />
        <textarea
          className="h-24 w-full resize-none rounded-2xl p-3 text-xs surface-2"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          aria-label="설정 JSON 가져오기"
          placeholder="가져올 JSON 붙여넣기"
        />
        <div className="grid grid-cols-2 gap-2">
          <button className="touch-target rounded-2xl surface-2" type="button" aria-label="JSON 내보내기 복사" onClick={() => navigator.clipboard?.writeText(exportText).then(() => onToast("JSON 복사됨"))}>
            <span className="inline-flex items-center gap-2">
              <Download size={16} aria-hidden="true" />
              복사
            </span>
          </button>
          <button className="touch-target rounded-2xl surface-2" type="button" aria-label="JSON 가져오기" onClick={importJson}>
            <span className="inline-flex items-center gap-2">
              <Upload size={16} aria-hidden="true" />
              가져오기
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
