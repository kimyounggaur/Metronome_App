import { Bookmark, Menu, Music, Settings, SlidersHorizontal, Timer, Maximize2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BigDisplay } from "./components/BigDisplay";
import { BottomSheet } from "./components/BottomSheet";
import { BeatVisualizer } from "./components/BeatVisualizer";
import { BpmDisplay } from "./components/BpmDisplay";
import { PracticeSheet } from "./components/PracticeSheet";
import { PresetSheet } from "./components/PresetSheet";
import { RhythmSheet } from "./components/RhythmSheet";
import { SettingsSheet } from "./components/SettingsSheet";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { TransportBar } from "./components/TransportBar";
import { normalizeAccents, cycleAccent } from "./domain/rhythm";
import { navigateSetlist, presetMatchesSettings } from "./domain/presets";
import { defaultBeatGroups } from "./domain/migration";
import { formatTimeSignature } from "./domain/tempo";
import type { TimeSignature, PulseData } from "./domain/types";
import { useHaptics } from "./hooks/useHaptics";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePulseStorage } from "./hooks/usePulseStorage";
import { useMetronome } from "./hooks/useMetronome";
import { useOrientation } from "./hooks/useOrientation";
import { useTapTempo } from "./hooks/useTapTempo";
import { useWakeLock } from "./hooks/useWakeLock";
import { useBeatFlash } from "./hooks/useBeatFlash";
import { PwaStatus } from "./components/PwaStatus";

type SheetType = "rhythm" | "practice" | "presets" | "settings";

export default function App() {
  const storage = usePulseStorage();
  const { settings, setSettings, presets, data, setData } = storage;
  const [activeSheet, setActiveSheet] = useState<SheetType | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [performanceMode, setPerformanceMode] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const { isLandscape } = useOrientation();
  const wasLandscape = useRef(isLandscape);
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
  const flashOn = useBeatFlash(settings.flash,controls.currentEvent,controls.isPlaying);
  const displayBpm = controls.isPlaying && settings.practice.speedTrainer.enabled ? controls.currentEvent?.bpm ?? settings.practice.speedTrainer.startBpm : settings.bpm;
  const activePreset = useMemo(() => presets.find(preset=>preset.id===data.navigation.activePresetId), [presets, data.navigation.activePresetId]);
  const presetName = activePreset?.name ?? "기본";
  const presetDirty = useMemo(() => activePreset ? !presetMatchesSettings(activePreset,settings) : false, [activePreset, settings]);
  const onSelectionChange = useCallback((next:PulseData) => {
    if(setData(next)) controls.queuePreset(next.settings);
  },[controls.queuePreset,setData]);
  const transportLabel = { idle:"정지", starting:"오디오 준비 중", playing:"재생 중", stopping:"정지 중", interrupted:"오디오가 중단되었습니다. 재개를 눌러 새 연습을 시작하세요.", error:"재생을 시작하지 못했습니다" }[controls.transportState];

  const tapTempo = useTapTempo((bpm) => {
    controls.setBpm(bpm);
    showToast(`${bpm} BPM`);
  });

  useWakeLock(controls.isPlaying && settings.wakeLock);

  useEffect(() => {
    if (isLandscape && !wasLandscape.current && settings.autoLandscape && matchMedia('(pointer: coarse)').matches) setPerformanceMode(true);
    wasLandscape.current = isLandscape;
  }, [isLandscape, settings.autoLandscape]);

  useEffect(() => () => { if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current); }, []);

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

  useEffect(() => { if(!controls.isPlaying)storage.flush(); },[controls.isPlaying,storage.flush]);

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
        beatGroups: defaultBeatGroups(signature.beats, signature.noteValue),
        accents: normalizeAccents(current.accents, signature.beats),
      }));
    },
    [setSettings],
  );

  const moveSetlist = useCallback(
    (direction: -1 | 1) => {
      const next=navigateSetlist(data,direction);
      onSelectionChange(next);
    },
    [data,onSelectionChange],
  );

  const shortcutHandlers = useMemo(
    () => ({
      onToggle: controls.toggle,
      onTap: tapTempo,
      onNudge: controls.nudgeBpm,
      onCloseSheet: () => setActiveSheet(null),
      onHelp: () => setShowHelp(true),
    }),
    [controls.toggle, controls.nudgeBpm, tapTempo],
  );

  useKeyboardShortcuts(shortcutHandlers);

  const activeBadges = useMemo(() => {
    const badges: string[] = [];
    if (controls.currentEvent?.phase === "count-in" && controls.currentEvent.showVisual) badges.push(`카운트 ${controls.currentEvent.countInRemainingBeats}`);
    if (controls.currentEvent?.isGapMuted) badges.push("묵음 훈련");
    if (controls.currentEvent?.randomMute) badges.push("랜덤 묵음");
    if (settings.practice.speedTrainer.enabled) badges.push(`속도 훈련 · 목표 ${settings.practice.speedTrainer.targetBpm}`);
    if (controls.timerRemainingSeconds !== null) badges.push(`남은 시간 ${Math.floor(controls.timerRemainingSeconds/60)}:${String(controls.timerRemainingSeconds%60).padStart(2,'0')}`);
    return badges;
  }, [controls.currentEvent, controls.timerRemainingSeconds, settings.practice.speedTrainer]);

  if (performanceMode) {
    return (
      <div className={`min-h-full ${settings.flash ? "full-flash" : ""} ${flashOn ? "flash-on" : ""}`}>
        <BigDisplay
          bpm={controls.currentEvent?.bpm ?? settings.bpm}
          accents={controls.currentEvent?.accents ?? normalizeAccents(settings.accents, settings.timeSignature.beats)}
          event={controls.currentEvent}
          isPlaying={controls.isPlaying || controls.transportState === 'starting'}
          onToggle={controls.toggle}
          onPrevious={() => moveSetlist(-1)}
          onNext={() => moveSetlist(1)}
          onExit={() => setPerformanceMode(false)}
          onNudge={controls.nudgeBpm}
          presetName={presetName+(presetDirty ? " · 변경됨" : "")}
          timeSignature={controls.currentEvent?.timeSignature ?? settings.timeSignature}
          tempoUnit={controls.currentEvent?.tempoUnit ?? settings.tempoUnit}
        />
        <div className="flex flex-wrap justify-center gap-3 p-3 text-sm"><span role="status">{transportLabel}</span>{controls.pendingSettings ? <span>다음 마디에 적용</span> : null}{activeBadges.map(badge=><span key={badge}>{badge}</span>)}{controls.error ? <span role="alert">{controls.error}</span> : null}{settings.flash ? <button className="touch-target px-3 surface-2 rounded-xl" onClick={()=>setSettings(current=>({...current,flash:false}))}>플래시 끄기</button> : null}</div>
        <LiveRegion isPlaying={controls.isPlaying} bpm={settings.bpm} toast={toast} />
        <PwaStatus isPlaying={controls.isPlaying || controls.transportState==='starting'} onStop={controls.stop} onBeforeUpdate={()=>{if(!storage.flush())throw new Error('저장 실패');}} showInstallHint={settings.showInstallHint} onDismissInstall={()=>setSettings(current=>({...current,showInstallHint:false}))}/>
      </div>
    );
  }

  return (
    <div className={`min-h-full ${settings.flash ? "full-flash" : ""} ${flashOn ? "flash-on" : ""}`}>
      <main className="app-screen mx-auto grid w-full max-w-[1180px] content-start gap-3 lg:grid-cols-[1fr_390px]">
        {storage.storageError ? <div role="status" className="rounded-2xl p-3 surface lg:col-span-2">
          <p>{storage.storageError}</p>
          <div className="flex flex-wrap gap-2">
            <button className="touch-target px-3 underline" onClick={storage.downloadBackup}>현재 데이터 백업</button>
            {storage.recoveryRaw ? <button className="touch-target px-3 underline" onClick={storage.downloadRecovery}>원본 데이터 내려받기</button> : null}
            <button className="touch-target px-3 underline" onClick={() => setActiveSheet("presets")}>정상 백업 가져오기</button>
          </div>
        </div> : null}
        <header className="flex flex-wrap items-center justify-between gap-2 lg:col-span-2">
          <h1 className="sr-only">Pulse 메트로놈</h1>
          <button className="touch-target rounded-full surface-2 p-2" type="button" aria-label="메뉴" onClick={() => setShowHelp(true)}>
            <Menu size={21} aria-hidden="true" />
          </button>
          <button className="touch-target rounded-full px-4 text-sm font-bold surface-2" type="button" aria-label="프리셋 열기" onClick={() => setActiveSheet("presets")}>
            <span className="block max-w-[35vw] truncate">{presetName}{presetDirty ? " · 변경됨" : ""} · {formatTimeSignature(settings.timeSignature.beats, settings.timeSignature.noteValue)}</span>
          </button>
          <button className="touch-target rounded-full surface-2 p-2" type="button" aria-label="공연 모드 열기" onClick={() => setPerformanceMode(true)}><Maximize2 size={20} aria-hidden="true" /></button>
          <button className="touch-target rounded-full surface-2 p-2" type="button" aria-label="설정 열기" onClick={() => setActiveSheet("settings")}>
            <Settings size={21} aria-hidden="true" />
          </button>
        </header>

        <div className="flex flex-wrap items-center justify-center gap-3 text-sm lg:col-span-2">
          <span role="status">{transportLabel}</span>
          {controls.pendingSettings ? <span>변경 적용 대기 · 리듬은 다음 마디부터</span> : null}
          {controls.error ? <span role="alert" className="text-[color:var(--danger)]">{controls.error}</span> : null}
          {controls.transportState==='interrupted' ? <button className="touch-target rounded-xl px-3 surface-2" onClick={()=>void controls.start()}>재개</button> : null}
          {settings.flash ? <button className="touch-target rounded-xl px-3 surface-2" onClick={()=>setSettings(current=>({...current,flash:false}))}>플래시 끄기</button> : null}
        </div>

        <section className="tempo-section flex min-w-0 flex-col justify-center gap-5 lg:rounded-[28px] lg:p-6 lg:surface">
          <BpmDisplay bpm={displayBpm} timeSignature={settings.timeSignature} tempoUnit={settings.tempoUnit} onSetBpm={controls.setBpm} />
          {controls.isPlaying && controls.currentEvent && controls.currentEvent.bpm!==displayBpm ? <p className="text-center text-sm">현재 재생 {controls.currentEvent.bpm} BPM · 설정 {settings.bpm} BPM</p> : null}
          <BeatVisualizer
            event={controls.currentEvent}
            pulseId={controls.pulseId}
            accents={controls.currentEvent?.accents ?? normalizeAccents(settings.accents, settings.timeSignature.beats)}
            timeSignature={controls.currentEvent?.timeSignature ?? settings.timeSignature}
            beatGroups={controls.currentEvent?.beatGroups ?? settings.beatGroups}
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

        <aside className="hidden min-h-0 lg:row-span-2 lg:block">
          <div className="max-h-[780px] overflow-y-auto rounded-[28px] p-4 surface">
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
            bpm={displayBpm}
            isPlaying={controls.isPlaying || controls.transportState === 'starting'}
            onToggle={controls.toggle}
            onTap={tapTempo}
            onNudge={controls.nudgeBpm}
            onSetBpm={controls.setBpm}
            tapCount={tapTempo.tapCount}
          />

          <nav className="grid grid-cols-4 gap-2" aria-label="고급 패널">
            <SheetButton label="리듬" icon={<Music size={17} aria-hidden="true" />} onClick={() => setActiveSheet("rhythm")} />
            <SheetButton label="연습" icon={<Timer size={17} aria-hidden="true" />} onClick={() => setActiveSheet("practice")} />
            <SheetButton label="저장" icon={<Bookmark size={17} aria-hidden="true" />} onClick={() => setActiveSheet("presets")} />
            <SheetButton label="설정" icon={<SlidersHorizontal size={17} aria-hidden="true" />} onClick={() => setActiveSheet("settings")} />
          </nav>
        </section>
      </main>

      <PwaStatus isPlaying={controls.isPlaying || controls.transportState==='starting'} onStop={controls.stop} onBeforeUpdate={()=>{if(!storage.flush())throw new Error('저장 실패');}} showInstallHint={settings.showInstallHint} onDismissInstall={()=>setSettings(current=>({...current,showInstallHint:false}))}/>

      <BottomSheet title="리듬" isOpen={activeSheet === "rhythm"} onClose={() => setActiveSheet(null)} onStop={controls.isPlaying ? controls.stop : undefined}>
        <RhythmSheet settings={settings} setSettings={setSettings} />
      </BottomSheet>
      <BottomSheet title="연습" isOpen={activeSheet === "practice"} onClose={() => setActiveSheet(null)} onStop={controls.isPlaying ? controls.stop : undefined}>
        <PracticeSheet settings={settings} setSettings={setSettings} isPlaying={controls.isPlaying} />
      </BottomSheet>
      <BottomSheet title="저장" isOpen={activeSheet === "presets"} onClose={() => setActiveSheet(null)} onStop={controls.isPlaying ? controls.stop : undefined}>
        <PresetSheet data={data} setData={setData} importData={(incoming,mode)=>{const applied=storage.importData(incoming,mode);if(applied)controls.queuePreset(incoming.settings);return applied;}} onSelectionChange={onSelectionChange} onToast={showToast} />
      </BottomSheet>
      <BottomSheet title="설정" isOpen={activeSheet === "settings"} onClose={() => setActiveSheet(null)} onStop={controls.isPlaying ? controls.stop : undefined}>
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
