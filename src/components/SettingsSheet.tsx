import { Bell, Moon, Sun, Volume2, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { AppSettings, SoundType, ThemeMode } from "../domain/types";

interface SettingsSheetProps {
  settings: AppSettings;
  setSettings: (value: AppSettings | ((current: AppSettings) => AppSettings)) => void;
}

export function SettingsSheet({ settings, setSettings }: SettingsSheetProps) {
  const sounds: SoundType[] = ["classic", "wood", "digital"];
  const themes: ThemeMode[] = ["dark", "light", "system"];

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--muted)]">
          <Volume2 size={16} aria-hidden="true" />
          사운드
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {sounds.map((sound) => (
            <button
              key={sound}
              className={`touch-target rounded-2xl px-2 py-2 font-bold ${settings.sound === sound ? "bg-[color:var(--accent)] text-[color:var(--bg)]" : "surface-2"}`}
              type="button"
              aria-pressed={settings.sound === sound}
              aria-label={`${sound} 사운드 선택`}
              onClick={() => setSettings((current) => ({ ...current, sound }))}
            >
              {sound}
            </button>
          ))}
        </div>
        <label className="block text-sm font-semibold text-[color:var(--muted)]" htmlFor="volume">
          볼륨 {Math.round(settings.volume * 100)}%
        </label>
        <input
          id="volume"
          className="h-10 w-full accent-[color:var(--accent)]"
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.volume * 100)}
          onChange={(event) => setSettings((current) => ({ ...current, volume: Number(event.target.value) / 100 }))}
        />
      </section>

      <section className="space-y-2">
        <Toggle label="뮤트 / 시각 메트로놈" checked={settings.muted} onChange={(checked) => setSettings((current) => ({ ...current, muted: checked }))} />
        <Toggle label="전체화면 플래시" checked={settings.flash} onChange={(checked) => setSettings((current) => ({ ...current, flash: checked }))} icon={<Zap size={17} aria-hidden="true" />} />
        <Toggle label="햅틱" checked={settings.haptics} onChange={(checked) => setSettings((current) => ({ ...current, haptics: checked }))} icon={<Bell size={17} aria-hidden="true" />} />
        <Toggle label="재생 중 화면 항상 켜기" checked={settings.wakeLock} onChange={(checked) => setSettings((current) => ({ ...current, wakeLock: checked }))} />
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--muted)]">
          {settings.theme === "light" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          테마
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {themes.map((theme) => (
            <button
              key={theme}
              className={`touch-target rounded-2xl px-2 py-2 font-bold ${settings.theme === theme ? "bg-[color:var(--accent)] text-[color:var(--bg)]" : "surface-2"}`}
              type="button"
              aria-pressed={settings.theme === theme}
              aria-label={`${theme} 테마`}
              onClick={() => setSettings((current) => ({ ...current, theme }))}
            >
              {theme === "system" ? "시스템" : theme === "dark" ? "다크" : "라이트"}
            </button>
          ))}
        </div>
      </section>

      <p className="rounded-2xl p-3 text-sm text-[color:var(--muted)] surface-2">
        iOS 무음 스위치나 브라우저 절전 정책은 웹앱이 완전히 제어할 수 없습니다. 첫 재생은 사용자 탭에서 오디오를 깨운 뒤 시작합니다.
      </p>
    </div>
  );
}

function Toggle({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange: (checked: boolean) => void; icon?: ReactNode }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 surface-2">
      <span className="flex items-center gap-2 font-semibold">
        {icon}
        {label}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
