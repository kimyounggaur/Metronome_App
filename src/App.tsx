import { Bookmark, Menu, Music, Pause, Play, Settings, SkipBack, SkipForward, SlidersHorizontal, Timer, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BottomSheet } from "./components/BottomSheet";
import { MechanicalMetronome } from "./components/MechanicalMetronome";
import { PracticeSheet } from "./components/PracticeSheet";
import { PresetSheet } from "./components/PresetSheet";
import { RhythmSheet } from "./components/RhythmSheet";
import { SettingsSheet } from "./components/SettingsSheet";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { TransportBar } from "./components/TransportBar";
import { normalizeAccents, cycleAccent } from "./domain/rhythm";
import { applyPreset, defaultSettings, isAppSettings, isPresetArray, isSetlistArray, PRESETS_KEY, SETLISTS_KEY, SETTINGS_KEY } from "./domain/presets";
import { formatTimeSignature } from "./domain/tempo";
import type { AppSettings, MetronomePreset, Setlist, TimeSignature } from "./domain/types";
import { useHaptics } from "./hooks/useHaptics";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useMetronome } from "./hooks/useMetronome";
import { useOrientation } from "./hooks/useOrientation";
import { useTapTempo } from "./hooks/useTapTempo";
import { useWakeLock } from "./hooks/useWakeLock";

type SheetType = "rhythm" | "practice" | "presets" | "settings";

export default function App() {
  const [settings, setSettings] = useLocalStorage<AppSettings>(SETTINGS_KEY, defaultSettings, isAppSettings);
  const [presets, setPresets] = useLocalStorage<MetronomePreset[]>(PRESETS_KEY, [], isPresetArray);
  const [setlists, setSetlists] = useLocalStorage<Setlist[]>(SETLISTS_KEY, [], isSetlistArray);
  const [activeSheet, setActiveSheet] = useState<SheetType | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [setlistCursor, setSetlistCursor] = useState(0);
  const toastTimerRef = useRef<number | null>(null);
  const { isLandscape } = useOrientation();
  const haptics = useHaptics(settings.haptics);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const controls = useMetronome({
    settings,
    setSettings,
    onToast: showToast,
    onBeatSideEffect: haptics,
  });

  const tapTempo = useTapTempo((bpm) => {
    controls.setBpm(bpm);
    showToast(`${bpm} BPM`);
  });

  useWakeLock(controls.isPlaying && settings.wakeLock);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = settings.theme === "system" ? (media.matches ? "dark" : "light") : settings.theme;
      root.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#101113" : "#f6f5ef");
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [settings.theme]);

  useEffect(() => {
    if (!settings.flash || controls.pulseId === 0) return;
    setFlashOn(true);
    const timerId = window.setTimeout(() => setFlashOn(false), 180);
    return () => window.clearTimeout(timerId);
  }, [controls.pulseId, settings.flash]);

  const onCycleAccent = useCallback(
    (index: number) => {
      setSettings((current) => {
        const accents = normalizeAccents(current.accents, current.timeSignature.beats);
        accents[index] = cycleAccent(accents[index]);
        return { ...current, accents };
      });
    },
    [setSettings],
  );

  const setSignature = useCallback(
    (signature: TimeSignature) => {
      setSettings((current) => ({
        ...current,
        timeSignature: signature,
        accents: normalizeAccents(current.accents, signature.beats),
      }));
    },
    [setSettings],
  );

  const moveSetlist = useCallback(
    (direction: -1 | 1) => {
      const primarySetlist = setlists[0];
      if (!primarySetlist || primarySetlist.presetIds.length === 0) {
        showToast("셋리스트 없음");
        return;
      }

      const nextCursor = (setlistCursor + direction + primarySetlist.presetIds.length) % primarySetlist.presetIds.length;
      const preset = presets.find((item) => item.id === primarySetlist.presetIds[nextCursor]);
      setSetlistCursor(nextCursor);
      if (preset) {
        setSettings((current) => applyPreset(current, preset));
        showToast(preset.name);
      }
    },
    [presets, setSettings, setlistCursor, setlists, showToast],
  );

  const shortcutHandlers = useMemo(
    () => ({
      onToggle: () => {
        void controls.toggle();
      },
      onTap: () => {
        tapTempo();
      },
      onNudge: controls.nudgeBpm,
      onCloseSheet: () => setActiveSheet(null),
      onHelp: () => setShowHelp(true),
    }),
    [controls, tapTempo],
  );

  useKeyboardShortcuts(shortcutHandlers);

  const activeBadges = useMemo(() => {
    const badges: string[] = [];
    if (controls.currentEvent?.phase === "count-in") badges.push(`카운트 ${controls.currentEvent.countInRemainingBeats}`);
    if (controls.currentEvent?.isGapMuted) badges.push("묵음 훈련");
    if (settings.practice.speedTrainer.enabled) badges.push("Speed");
    if (settings.practice.randomMute.enabled) badges.push("Random");
    if (controls.timerRemainingSeconds !== null && controls.timerRemainingSeconds <= 5) badges.push(`${controls.timerRemainingSeconds}s`);
    return badges;
  }, [controls.currentEvent, controls.timerRemainingSeconds, settings.practice.randomMute.enabled, settings.practice.speedTrainer.enabled]);

  if (isLandscape) {
    return (
      <div className={`min-h-full ${settings.flash ? "full-flash" : ""} ${flashOn ? "flash-on" : ""}`}>
        <main className="app-screen grid grid-cols-[96px_1fr_96px] items-center gap-4">
          <button className="touch-target grid h-28 place-items-center rounded-3xl surface-2" type="button" aria-label="이전 프리셋" onClick={() => moveSetlist(-1)}>
            <SkipBack size={44} aria-hidden="true" />
          </button>
          <section className="landscape-metronome flex min-w-0 flex-col items-center justify-center gap-3" aria-label="가로 기계식 메트로놈">
            <MechanicalMetronome
              bpm={settings.bpm}
              timeSignature={settings.timeSignature}
              event={controls.currentEvent}
              pulseId={controls.pulseId}
              accents={normalizeAccents(settings.accents, settings.timeSignature.beats)}
              onSetBpm={controls.setBpm}
              onCycleAccent={onCycleAccent}
            />
            <button
              className="grid h-20 w-20 place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] shadow-glow"
              type="button"
              aria-label={controls.isPlaying ? "정지" : "재생"}
              onClick={() => void controls.toggle()}
            >
              {controls.isPlaying ? <Pause size={32} fill="currentColor" aria-hidden="true" /> : <Play size={36} fill="currentColor" aria-hidden="true" />}
            </button>
          </section>
          <button className="touch-target grid h-28 place-items-center rounded-3xl surface-2" type="button" aria-label="다음 프리셋" onClick={() => moveSetlist(1)}>
            <SkipForward size={44} aria-hidden="true" />
          </button>
        </main>
        <LiveRegion isPlaying={controls.isPlaying} bpm={settings.bpm} toast={toast} />
      </div>
    );
  }

  return (
    <div className={`min-h-full ${settings.flash ? "full-flash" : ""} ${flashOn ? "flash-on" : ""}`}>
      <main className="app-screen mx-auto grid w-full max-w-[1180px] grid-rows-[auto_1fr_auto] gap-3 lg:grid-cols-[1fr_390px] lg:grid-rows-[auto_1fr]">
        <header className="flex items-center justify-between lg:col-span-2">
          <button className="touch-target rounded-full surface-2 p-2" type="button" aria-label="메뉴" onClick={() => setShowHelp(true)}>
            <Menu size={21} aria-hidden="true" />
          </button>
          <button className="touch-target rounded-full px-4 text-sm font-bold surface-2" type="button" aria-label="프리셋 열기" onClick={() => setActiveSheet("presets")}>
            기본 · {formatTimeSignature(settings.timeSignature.beats, settings.timeSignature.noteValue)}
          </button>
          <button className="touch-target rounded-full surface-2 p-2" type="button" aria-label="설정 열기" onClick={() => setActiveSheet("settings")}>
            <Settings size={21} aria-hidden="true" />
          </button>
        </header>

        <section className="flex min-h-0 flex-col justify-center gap-4 lg:rounded-[28px] lg:p-6 lg:surface">
          <MechanicalMetronome
            bpm={settings.bpm}
            timeSignature={settings.timeSignature}
            event={controls.currentEvent}
            pulseId={controls.pulseId}
            accents={normalizeAccents(settings.accents, settings.timeSignature.beats)}
            onSetBpm={controls.setBpm}
            onCycleAccent={onCycleAccent}
          />
          <div className="flex flex-wrap justify-center gap-2">
            {activeBadges.map((badge) => (
              <span className="rounded-full px-3 py-1 text-xs font-bold bg-[color:var(--accent-2)] text-black" key={badge}>
                {badge}
              </span>
            ))}
          </div>
        </section>

        <aside className="hidden min-h-0 lg:block">
          <div className="h-full overflow-y-auto rounded-[28px] p-4 surface">
            <RhythmSheet settings={settings} setSettings={setSettings} />
          </div>
        </aside>

        <section className="space-y-3 lg:col-span-1">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "4/4", value: { beats: 4, noteValue: 4 } as TimeSignature },
              { label: "3/4", value: { beats: 3, noteValue: 4 } as TimeSignature },
              { label: "6/8", value: { beats: 6, noteValue: 8 } as TimeSignature },
            ].map((chip) => (
              <button
                key={chip.label}
                className={`touch-target rounded-2xl px-3 text-sm font-bold ${settings.timeSignature.beats === chip.value.beats && settings.timeSignature.noteValue === chip.value.noteValue ? "bg-[color:var(--accent)] text-[color:var(--bg)]" : "surface-2"}`}
                type="button"
                aria-label={`${chip.label} 박자 빠른 선택`}
                onClick={() => setSignature(chip.value)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <TransportBar
            bpm={settings.bpm}
            isPlaying={controls.isPlaying}
            onToggle={() => void controls.toggle()}
            onTap={() => tapTempo()}
            onNudge={controls.nudgeBpm}
            onSetBpm={controls.setBpm}
          />

          <nav className="grid grid-cols-4 gap-2" aria-label="고급 패널">
            <SheetButton label="리듬" icon={<Music size={17} aria-hidden="true" />} onClick={() => setActiveSheet("rhythm")} />
            <SheetButton label="연습" icon={<Timer size={17} aria-hidden="true" />} onClick={() => setActiveSheet("practice")} />
            <SheetButton label="저장" icon={<Bookmark size={17} aria-hidden="true" />} onClick={() => setActiveSheet("presets")} />
            <SheetButton label="설정" icon={<SlidersHorizontal size={17} aria-hidden="true" />} onClick={() => setActiveSheet("settings")} />
          </nav>
        </section>
      </main>

      {settings.showInstallHint ? (
        <div className="fixed left-3 right-3 top-[max(10px,env(safe-area-inset-top))] z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm surface">
          <span>Pulse</span>
          <button className="touch-target rounded-full p-2 surface-2" type="button" aria-label="설치 힌트 닫기" onClick={() => setSettings((current) => ({ ...current, showInstallHint: false }))}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <BottomSheet title="리듬" isOpen={activeSheet === "rhythm"} onClose={() => setActiveSheet(null)}>
        <RhythmSheet settings={settings} setSettings={setSettings} />
      </BottomSheet>
      <BottomSheet title="연습" isOpen={activeSheet === "practice"} onClose={() => setActiveSheet(null)}>
        <PracticeSheet settings={settings} setSettings={setSettings} />
      </BottomSheet>
      <BottomSheet title="저장" isOpen={activeSheet === "presets"} onClose={() => setActiveSheet(null)}>
        <PresetSheet settings={settings} setSettings={setSettings} presets={presets} setPresets={setPresets} setlists={setlists} setSetlists={setSetlists} onToast={showToast} />
      </BottomSheet>
      <BottomSheet title="설정" isOpen={activeSheet === "settings"} onClose={() => setActiveSheet(null)}>
        <SettingsSheet settings={settings} setSettings={setSettings} />
      </BottomSheet>

      <ShortcutHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />
      <LiveRegion isPlaying={controls.isPlaying} bpm={settings.bpm} toast={toast} />

      {toast ? <div className="fixed bottom-[max(18px,env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-bold shadow-glow bg-[color:var(--text)] text-[color:var(--bg)]">{toast}</div> : null}
    </div>
  );
}

function SheetButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button className="touch-target rounded-2xl px-2 py-2 text-sm font-bold surface-2" type="button" aria-label={`${label} 시트 열기`} onClick={onClick}>
      <span className="flex flex-col items-center gap-1">
        {icon}
        {label}
      </span>
    </button>
  );
}

function LiveRegion({ isPlaying, bpm, toast }: { isPlaying: boolean; bpm: number; toast: string | null }) {
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {toast ?? `${isPlaying ? "재생 중" : "정지"} ${bpm} BPM`}
    </div>
  );
}
