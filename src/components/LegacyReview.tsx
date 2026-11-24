import { useMemo, useState } from "react";
import type { usePulseStorage } from "../hooks/usePulseStorage";
import { parseBackupValue } from "../domain/migration";
import { loadPulseData } from "../storage/pulseStorage";
import { equalValue } from "../storage/reconcile";
import type { PulseData } from "../domain/types";

function reviewSource(raw: string): PulseData | null {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === "object" && ("pulse:settings:v1" in value || "pulse:presets:v1" in value)) {
      const migrated = loadPulseData({ getItem: (key) => value[key] ?? null, setItem: () => {} });
      return migrated.storageError ? null : migrated.data;
    }
    const parsed = parseBackupValue(value);
    return parsed.ok ? parsed.data : null;
  } catch {
    return null;
  }
}
type Storage = Pick<
  ReturnType<typeof usePulseStorage>,
  "data" | "revision" | "recovery" | "setData" | "downloadRecovery" | "ignoreLegacy"
>;
export function LegacyReview({ storage }: { storage: Storage }) {
  const [review, setReview] = useState(false);
  const [settings, setSettings] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [rev, setRev] = useState(0);
  const source = useMemo(
    () => (review && storage.recovery ? reviewSource(storage.recovery.raw) : null),
    [review, storage.recovery],
  );
  if (storage.recovery?.source !== "구버전 탭") return null;
  const present = new Map(storage.data.presets.map((p) => [p.id, p]));
  const changed = source?.presets.filter((p) => !equalValue(p, present.get(p.id))) ?? [];
  const settingsChanged = source && !equalValue(source.settings, storage.data.settings);
  const start = () => {
    setReview(true);
    setSettings(false);
    setSelected([]);
    setNotice("");
    setRev(storage.revision);
  };
  async function apply() {
    if (!source) return;
    if (rev !== storage.revision) {
      start();
      setNotice("저장본이 바뀌었습니다. 최신 차이를 다시 확인하세요.");
      return;
    }
    const picked = new Map(source.presets.filter((p) => selected.includes(p.id)).map((p) => [p.id, p]));
    if (
      await storage.setData((current) => ({
        ...current,
        settings: settings ? source.settings : current.settings,
        presets: [
          ...current.presets.map((p) => picked.get(p.id) ?? p),
          ...source.presets.filter((p) => picked.has(p.id) && !present.has(p.id)),
        ],
      }))
    )
      await storage.ignoreLegacy();
  }
  return (
    <section className="space-y-2" aria-label="이전 버전 변경 검토">
      {!review ? (
        <button className="touch-target underline" onClick={start}>
          이전 버전에서 변경한 내용 검토
        </button>
      ) : (
        <>
          {source ? (
            <>
              {settingsChanged && (
                <label className="block">
                  <input type="checkbox" checked={settings} onChange={(e) => setSettings(e.target.checked)} /> 이전
                  설정 적용 · 현재 {storage.data.settings.bpm} BPM / 이전 {source.settings.bpm} BPM
                </label>
              )}
              {changed.map((p) => (
                <label className="block" key={p.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id)))
                    }
                  />{" "}
                  {present.get(p.id)?.name ?? "새 곡"} → {p.name} ({p.bpm} BPM)
                </label>
              ))}
              {!settingsChanged && !changed.length && <p>가져올 설정 또는 프리셋 변경이 없습니다.</p>}
              <button
                className="touch-target underline"
                disabled={!settings && !selected.length}
                onClick={() => void apply()}
              >
                선택한 변경 적용
              </button>
            </>
          ) : (
            <p>이전 원본을 해석할 수 없습니다. 내려받아 보관하세요.</p>
          )}
          <button className="touch-target underline" onClick={storage.downloadRecovery}>
            이전 버전 원본 내려받기
          </button>
          <button className="touch-target underline" onClick={() => void storage.ignoreLegacy()}>
            현재 자료 유지
          </button>
          {notice && <p role="status">{notice}</p>}
        </>
      )}
    </section>
  );
}
