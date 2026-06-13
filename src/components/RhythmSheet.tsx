import { Music2 } from "lucide-react";
import { ACCENT_LABELS, SUBDIVISION_LABELS, TIME_SIGNATURES, cycleAccent, normalizeAccents } from "../domain/rhythm";
import type { AccentLevel, AppSettings, Subdivision, TimeSignature } from "../domain/types";

interface RhythmSheetProps {
  settings: AppSettings;
  setSettings: (value: AppSettings | ((current: AppSettings) => AppSettings)) => void;
}

function sameSignature(a: TimeSignature, b: TimeSignature): boolean {
  return a.beats === b.beats && a.noteValue === b.noteValue;
}

export function RhythmSheet({ settings, setSettings }: RhythmSheetProps) {
  const subdivisions: Subdivision[] = ["none", "eighth", "triplet", "sixteenth"];

  function setSignature(signature: TimeSignature) {
    setSettings((current) => ({
      ...current,
      timeSignature: signature,
      accents: normalizeAccents(current.accents, signature.beats),
    }));
  }

  function setSubdivision(subdivision: Subdivision) {
    setSettings((current) => ({ ...current, subdivision }));
  }

  function cycle(index: number) {
    setSettings((current) => {
      const accents = normalizeAccents(current.accents, current.timeSignature.beats);
      accents[index] = cycleAccent(accents[index]);
      return { ...current, accents };
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--muted)]">
          <Music2 size={16} aria-hidden="true" />
          박자표
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {TIME_SIGNATURES.map((signature) => {
            const active = sameSignature(settings.timeSignature, signature);
            return (
              <button
                key={`${signature.beats}/${signature.noteValue}`}
                className={`touch-target rounded-2xl px-3 py-2 font-bold ${active ? "bg-[color:var(--accent)] text-[color:var(--bg)]" : "surface-2"}`}
                type="button"
                aria-label={`${signature.beats}/${signature.noteValue} 박자 선택`}
                aria-pressed={active}
                onClick={() => setSignature(signature)}
              >
                {signature.beats}/{signature.noteValue}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[color:var(--muted)]">세분박</h3>
        <div className="grid grid-cols-2 gap-2">
          {subdivisions.map((subdivision) => {
            const active = settings.subdivision === subdivision;
            return (
              <button
                key={subdivision}
                className={`touch-target rounded-2xl px-3 py-2 font-bold ${active ? "bg-[color:var(--accent)] text-[color:var(--bg)]" : "surface-2"}`}
                type="button"
                aria-label={`${SUBDIVISION_LABELS[subdivision]} 세분박`}
                aria-pressed={active}
                onClick={() => setSubdivision(subdivision)}
              >
                {SUBDIVISION_LABELS[subdivision]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[color:var(--muted)]">비트별 악센트</h3>
        <div className="grid grid-cols-4 gap-2">
          {normalizeAccents(settings.accents, settings.timeSignature.beats).map((accent: AccentLevel, index) => (
            <button
              key={index}
              className="touch-target rounded-2xl px-2 py-3 text-center surface-2"
              type="button"
              aria-label={`${index + 1}박 ${ACCENT_LABELS[accent]} 악센트 변경`}
              onClick={() => cycle(index)}
            >
              <span className="block text-xs text-[color:var(--muted)]">{index + 1}박</span>
              <span className="block font-bold">{ACCENT_LABELS[accent]}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-[color:var(--muted)]">7/8 커스텀 그룹(2+2+3 등)은 다음 버전에서 세부 편집으로 확장됩니다.</p>
      </section>
    </div>
  );
}
