export type AccentLevel = "strong" | "normal" | "soft" | "mute";
export type Subdivision = "none" | "eighth" | "triplet" | "sixteenth";
export type SoundType = "classic" | "wood" | "digital";
export type ThemeMode = "dark" | "light" | "system";
export type TempoUnit = "quarter" | "eighth" | "dotted-quarter";

export interface TimeSignature {
  beats: number;
  noteValue: 4 | 8 | 16;
}

export interface SpeedTrainerSettings {
  enabled: boolean;
  startBpm: number;
  targetBpm: number;
  step: number;
  everyBars: number;
  onReach: "stop" | "hold" | "loop";
}

export interface GapTrainerSettings {
  enabled: boolean;
  playBars: number;
  muteBars: number;
  keepVisual: boolean;
}

export interface RandomMuteSettings {
  enabled: boolean;
  probability: number;
  unit: "beat" | "bar";
}

export interface PracticeSettings {
  countInBars: 0 | 1 | 2;
  timerSeconds: number | null;
  speedTrainer: SpeedTrainerSettings;
  gapTrainer: GapTrainerSettings;
  randomMute: RandomMuteSettings;
}

export interface MetronomePreset {
  id: string;
  name: string;
  bpm: number;
  tempoUnit: TempoUnit;
  beatGroups: number[];
  timeSignature: TimeSignature;
  subdivision: Subdivision;
  accents: AccentLevel[];
  sound: SoundType;
  volume: number;
  practice: PracticeSettings;
  createdAt: string;
  updatedAt: string;
}

export interface Setlist {
  id: string;
  name: string;
  items: SetlistItem[];
}

export interface SetlistItem { id: string; presetId: string; }

export interface PresetNavigation {
  activePresetId: string | null;
  activeSetlistId: string | null;
  activeItemIndex: number;
}

export interface PulseData {
  schemaVersion: 2;
  settings: AppSettings;
  presets: MetronomePreset[];
  setlists: Setlist[];
  navigation: PresetNavigation;
}

export interface AppSettings {
  bpm: number;
  tempoUnit: TempoUnit;
  beatGroups: number[];
  timeSignature: TimeSignature;
  subdivision: Subdivision;
  accents: AccentLevel[];
  sound: SoundType;
  volume: number;
  muted: boolean;
  haptics: boolean;
  flash: boolean;
  theme: ThemeMode;
  wakeLock: boolean;
  showInstallHint: boolean;
  autoLandscape: boolean;
  practice: PracticeSettings;
}

export interface BeatEvent {
  beatIndex: number;
  subIndex: number;
  barIndex: number;
  time: number;
  phase: "count-in" | "main";
  isAudible: boolean;
  isGapMuted: boolean;
  accent: AccentLevel | "subdivision";
  countInRemainingBeats: number;
}

// Snapshot of the musical settings that actually produced this event.
export interface BeatEvent {
  sessionId: number;
  bpm: number;
  tempoUnit: TempoUnit;
  timeSignature: TimeSignature;
  subdivision: Subdivision;
  beatGroups: number[];
  accents: AccentLevel[];
  globalMute: boolean;
  accentRest: boolean;
  randomMute: boolean;
  gapMute: boolean;
  showVisual: boolean;
  mainStartedAt: number | null;
  timerDeadline: number | null;
}
