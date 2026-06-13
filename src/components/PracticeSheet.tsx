import { Activity, TimerReset } from "lucide-react";
import type { AppSettings, PracticeSettings } from "../domain/types";

interface PracticeSheetProps {
  settings: AppSettings;
  setSettings: (value: AppSettings | ((current: AppSettings) => AppSettings)) => void;
}

function patchPractice(settings: AppSettings, patch: Partial<PracticeSettings>): AppSettings {
  return { ...settings, practice: { ...settings.practice, ...patch } };
}

export function PracticeSheet({ settings, setSettings }: PracticeSheetProps) {
  const practice = settings.practice;
  const timerOptions = [null, 1, 3, 5, 10, 15, 30, 60] as const;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--muted)]">
          <TimerReset size={16} aria-hidden="true" />
          카운트인
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((bars) => (
            <button
              key={bars}
              className={`touch-target rounded-2xl px-3 py-2 font-bold ${practice.countInBars === bars ? "bg-[color:var(--accent)] text-[color:var(--bg)]" : "surface-2"}`}
              type="button"
              aria-label={`${bars}마디 카운트인`}
              aria-pressed={practice.countInBars === bars}
              onClick={() => setSettings((current) => patchPractice(current, { countInBars: bars as 0 | 1 | 2 }))}
            >
              {bars}마디
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[color:var(--muted)]">타이머</h3>
        <div className="grid grid-cols-4 gap-2">
          {timerOptions.map((minutes) => (
            <button
              key={minutes ?? "off"}
              className={`touch-target rounded-2xl px-3 py-2 font-bold ${practice.timerMinutes === minutes ? "bg-[color:var(--accent)] text-[color:var(--bg)]" : "surface-2"}`}
              type="button"
              aria-label={minutes ? `${minutes}분 타이머` : "타이머 끄기"}
              aria-pressed={practice.timerMinutes === minutes}
              onClick={() => setSettings((current) => patchPractice(current, { timerMinutes: minutes }))}
            >
              {minutes ? `${minutes}분` : "끔"}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--muted)]">
          <Activity size={16} aria-hidden="true" />
          스피드 트레이너
        </h3>
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 surface-2">
          <span className="font-semibold">켜기</span>
          <input
            type="checkbox"
            checked={practice.speedTrainer.enabled}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                practice: { ...current.practice, speedTrainer: { ...current.practice.speedTrainer, enabled: event.target.checked } },
              }))
            }
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="시작 BPM" value={practice.speedTrainer.startBpm} onChange={(value) => setSettings((current) => ({ ...current, practice: { ...current.practice, speedTrainer: { ...current.practice.speedTrainer, startBpm: value } } }))} />
          <NumberField label="목표 BPM" value={practice.speedTrainer.targetBpm} onChange={(value) => setSettings((current) => ({ ...current, practice: { ...current.practice, speedTrainer: { ...current.practice.speedTrainer, targetBpm: value } } }))} />
          <NumberField label="증가" value={practice.speedTrainer.step} onChange={(value) => setSettings((current) => ({ ...current, practice: { ...current.practice, speedTrainer: { ...current.practice.speedTrainer, step: value } } }))} />
          <NumberField label="N마디마다" value={practice.speedTrainer.everyBars} onChange={(value) => setSettings((current) => ({ ...current, practice: { ...current.practice, speedTrainer: { ...current.practice.speedTrainer, everyBars: value } } }))} />
        </div>
        <select
          className="touch-target w-full rounded-2xl px-3 surface-2"
          value={practice.speedTrainer.onReach}
          aria-label="목표 도달 동작"
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              practice: {
                ...current.practice,
                speedTrainer: { ...current.practice.speedTrainer, onReach: event.target.value as "stop" | "hold" | "loop" },
              },
            }))
          }
        >
          <option value="hold">목표 BPM 유지</option>
          <option value="stop">목표 도달 시 정지</option>
          <option value="loop">시작 BPM으로 반복</option>
        </select>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[color:var(--muted)]">갭 트레이너</h3>
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 surface-2">
          <span className="font-semibold">켜기</span>
          <input
            type="checkbox"
            checked={practice.gapTrainer.enabled}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                practice: { ...current.practice, gapTrainer: { ...current.practice.gapTrainer, enabled: event.target.checked } },
              }))
            }
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            [3, 1],
            [2, 2],
            [1, 1],
          ].map(([playBars, muteBars]) => (
            <button
              key={`${playBars}:${muteBars}`}
              className="touch-target rounded-2xl surface-2"
              type="button"
              aria-label={`${playBars}마디 재생 ${muteBars}마디 묵음`}
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  practice: { ...current.practice, gapTrainer: { ...current.practice.gapTrainer, playBars, muteBars, enabled: true } },
                }))
              }
            >
              {playBars}:{muteBars}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[color:var(--muted)]">랜덤 뮤트</h3>
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 surface-2">
          <span className="font-semibold">켜기</span>
          <input
            type="checkbox"
            checked={practice.randomMute.enabled}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                practice: { ...current.practice, randomMute: { ...current.practice.randomMute, enabled: event.target.checked } },
              }))
            }
          />
        </label>
        <label className="block text-sm font-semibold text-[color:var(--muted)]" htmlFor="random-mute">
          확률 {Math.round(practice.randomMute.probability * 100)}%
        </label>
        <input
          id="random-mute"
          className="h-10 w-full accent-[color:var(--accent)]"
          type="range"
          min={0}
          max={80}
          value={Math.round(practice.randomMute.probability * 100)}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              practice: { ...current.practice, randomMute: { ...current.practice.randomMute, probability: Number(event.target.value) / 100 } },
            }))
          }
        />
      </section>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block rounded-2xl p-3 surface-2">
      <span className="block text-xs font-semibold text-[color:var(--muted)]">{label}</span>
      <input
        className="mt-1 w-full border-0 bg-transparent text-lg font-bold outline-none"
        type="number"
        value={value}
        min={1}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
