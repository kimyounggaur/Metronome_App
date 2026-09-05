import { Music2 } from "lucide-react";
import { memo, useState } from "react";
import { ACCENT_LABELS, SUBDIVISION_LABELS, TIME_SIGNATURES, cycleAccent, normalizeAccents, secondsPerBar } from "../domain/rhythm";
import type { AccentLevel, AppSettings, Subdivision, TimeSignature, TempoUnit } from "../domain/types";
import { defaultBeatGroups } from "../domain/migration";

interface RhythmSheetProps {
  settings: AppSettings;
  setSettings: (value: AppSettings | ((current: AppSettings) => AppSettings)) => void;
}

function sameSignature(a: TimeSignature, b: TimeSignature): boolean {
  return a.beats === b.beats && a.noteValue === b.noteValue;
}

export const RhythmSheet = memo(function RhythmSheet({ settings, setSettings }: RhythmSheetProps) {
  const subdivisions: Subdivision[] = ["none", "eighth", "triplet", "sixteenth"];
  const [groupDraft,setGroupDraft] = useState<string|null>(null);
  const [groupError,setGroupError] = useState<string|null>(null);

  function setSignature(signature: TimeSignature) {
    setGroupDraft(null);setGroupError(null);
    setSettings((current) => ({
      ...current,
      timeSignature: signature,
      beatGroups: defaultBeatGroups(signature.beats, signature.noteValue),
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
        <h3 className="font-bold">BPM 기준 음표</h3>
        <select className="touch-target w-full rounded-2xl px-3 surface-2" aria-label="BPM 기준 음표" value={settings.tempoUnit} onChange={event=>setSettings(current=>({...current,tempoUnit:event.target.value as TempoUnit}))}>
          <option value="quarter">♩ 4분음표</option><option value="eighth">♪ 8분음표</option><option value="dotted-quarter">♩. 점4분음표</option>
        </select>
        <p className="text-sm text-[color:var(--muted)]">한 마디 {Number(secondsPerBar(settings.bpm,settings.timeSignature,settings.tempoUnit).toFixed(3))}초 · {settings.timeSignature.noteValue}분음표 셀 {settings.timeSignature.beats}개</p>
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
        <p className="text-sm text-[color:var(--muted)]">{settings.timeSignature.noteValue}분음표 셀 하나를 같은 길이로 나눕니다.</p>
      </section>

      <section className="space-y-3">
        <h3 className="font-bold">박 그룹</h3>
        {settings.timeSignature.beats===7&&settings.timeSignature.noteValue===8 ? <div className="grid grid-cols-3 gap-2">{[[2,2,3],[2,3,2],[3,2,2]].map(groups=><button key={groups.join('+')} type="button" className="touch-target rounded-xl surface-2" aria-pressed={settings.beatGroups.join()===groups.join()} onClick={()=>{setGroupDraft(null);setGroupError(null);setSettings(current=>({...current,beatGroups:groups}));}}>{groups.join('+')}</button>)}</div>:null}
        <div className="flex gap-2">
          <input className="min-h-11 min-w-0 flex-1 rounded-xl px-3 surface-2" aria-label="박 그룹 직접 입력" value={groupDraft??settings.beatGroups.join('+')} onChange={event=>setGroupDraft(event.target.value)} />
          <button className="touch-target rounded-xl px-3 surface-2" onClick={()=>{
            const raw=groupDraft??settings.beatGroups.join('+');const groups=raw.split('+').map(part=>Number(part.trim()));
            if(!/^\s*\d+(\s*\+\s*\d+)*\s*$/.test(raw)||groups.some(n=>!Number.isInteger(n)||n<1)||groups.reduce((a,b)=>a+b,0)!==settings.timeSignature.beats){setGroupError('양의 정수 그룹 합이 '+settings.timeSignature.beats+'이어야 합니다.');return;}
            setGroupError(null);setGroupDraft(null);setSettings(current=>({...current,beatGroups:groups}));
          }}>그룹 적용</button>
        </div>
        {groupError?<p role="alert" className="text-sm text-[color:var(--danger)]">{groupError}</p>:null}
        <p className="text-sm text-[color:var(--muted)]">{settings.beatGroups.join(' + ')} · {settings.beatGroups.length}개 그룹. 그룹 변경은 악센트를 유지합니다.</p>
        <button className="touch-target rounded-xl px-3 surface-2" onClick={()=>setSettings(current=>{
          let index=0;const accents:AccentLevel[]=Array.from({length:current.timeSignature.beats},()=>"normal");
          current.beatGroups.forEach(size=>{accents[index]="strong";index+=size;});return {...current,accents};
        })}>그룹 첫박에 강세 적용</button>
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
        <p className="text-sm text-[color:var(--muted)]">‘쉼’은 그 박의 모든 분할 소리를 끕니다. 재생 중 리듬 변경은 다음 마디부터 적용됩니다.</p>
      </section>
    </div>
  );
});
