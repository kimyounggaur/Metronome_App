export type AccentLevel = "strong" | "normal" | "soft" | "mute";
export type Subdivision = "none" | "eighth" | "triplet" | "sixteenth";
export type SoundType = "classic" | "wood" | "digital";
export type ThemeMode = "dark" | "light" | "system";

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
  timerMinutes: number | null;
  speedTrainer: SpeedTrainerSettings;
  gapTrainer: GapTrainerSettings;
  randomMute: RandomMuteSettings;
}

export interface MetronomePreset {
  id: string;
  name: string;
  bpm: number;
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
  presetIds: string[];
}

export interface AppSettings {
  bpm: number;
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
