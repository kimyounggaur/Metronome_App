import type { AppSettings, PracticeSettings, SpeedTrainerSettings, GapTrainerSettings, RandomMuteSettings } from "../domain/types";
import { memo } from "react";
import { DATA_LIMITS } from "../domain/schema";
import { NumberField } from "./NumberField";

interface PracticeSheetProps {
  settings: AppSettings; setSettings:(value:AppSettings|((current:AppSettings)=>AppSettings))=>void; isPlaying?:boolean;
}
export const PracticeSheet = memo(function PracticeSheet({settings,setSettings,isPlaying=false}:PracticeSheetProps) {
  const p=settings.practice;
  const patch=(change:Partial<PracticeSettings>)=>setSettings(current=>({...current,practice:{...current.practice,...change}}));
  const speed=(change:Partial<SpeedTrainerSettings>)=>setSettings(current=>({...current,practice:{...current.practice,speedTrainer:{...current.practice.speedTrainer,...change}}}));
  const gap=(change:Partial<GapTrainerSettings>)=>setSettings(current=>({...current,practice:{...current.practice,gapTrainer:{...current.practice.gapTrainer,...change}}}));
  const random=(change:Partial<RandomMuteSettings>)=>setSettings(current=>({...current,practice:{...current.practice,randomMute:{...current.practice.randomMute,...change}}}));
  return <div className="space-y-6">
    {isPlaying ? <p className="rounded-xl p-3 text-sm surface-2">카운트인과 타이머 변경은 다음 재생부터, 훈련 구성은 다음 마디부터 적용됩니다.</p> : null}
    <section className="space-y-3">
      <h3 className="font-bold">카운트인</h3>
      <div className="grid grid-cols-3 gap-2">{([0,1,2] as const).map(bars=><button key={bars} type="button" className={chip(p.countInBars===bars)} aria-label={bars+"마디 카운트인"} aria-pressed={p.countInBars===bars} onClick={()=>patch({countInBars:bars})}>{bars===0?"끔":bars+"마디"}</button>)}</div>
    </section>
    <section className="space-y-3">
      <h3 className="font-bold">본 연습 타이머</h3>
      <div className="grid grid-cols-4 gap-2">{[null,60,180,300,600,900,1800,3600].map(seconds=><button key={seconds??"off"} type="button" className={chip(p.timerSeconds===seconds)} aria-label={seconds?seconds/60+"분 타이머":"타이머 끄기"} aria-pressed={p.timerSeconds===seconds} onClick={()=>patch({timerSeconds:seconds})}>{seconds?seconds/60+"분":"끔"}</button>)}</div>
      <NumberField label="연습 시간 (초)" value={p.timerSeconds??60} min={DATA_LIMITS.timerSeconds[0]} max={DATA_LIMITS.timerSeconds[1]} onChange={timerSeconds=>patch({timerSeconds})}/>
      <p className="text-sm text-[color:var(--muted)]">카운트인을 마친 뒤부터 시간을 셉니다.</p>
    </section>
    <section className="space-y-3">
      <h3 className="font-bold">속도 훈련</h3>
      <Toggle label="속도 훈련 켜기" checked={p.speedTrainer.enabled} onChange={enabled=>speed({enabled})}/>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="시작 BPM" value={p.speedTrainer.startBpm} min={DATA_LIMITS.bpm[0]} max={DATA_LIMITS.bpm[1]} onChange={startBpm=>speed({startBpm})}/>
        <NumberField label="목표 BPM" value={p.speedTrainer.targetBpm} min={DATA_LIMITS.bpm[0]} max={DATA_LIMITS.bpm[1]} onChange={targetBpm=>speed({targetBpm})}/>
        <NumberField label="변화 폭 (BPM)" value={p.speedTrainer.step} min={DATA_LIMITS.step[0]} max={DATA_LIMITS.step[1]} onChange={step=>speed({step})}/>
        <NumberField label="변화 간격 (마디)" value={p.speedTrainer.everyBars} min={DATA_LIMITS.bars[0]} max={DATA_LIMITS.bars[1]} onChange={everyBars=>speed({everyBars})}/>
      </div>
      <label className="block space-y-2 text-sm"><span>목표 구간을 연주한 뒤</span>
        <select className="touch-target w-full rounded-xl px-3 surface-2" aria-label="목표 도달 동작" value={p.speedTrainer.onReach} onChange={event=>speed({onReach:event.target.value as SpeedTrainerSettings["onReach"]})}>
          <option value="hold">목표 BPM 유지</option><option value="stop">정지</option><option value="loop">시작 BPM부터 반복</option>
        </select>
      </label>
      <p className="text-sm text-[color:var(--muted)]">{p.speedTrainer.startBpm} → {p.speedTrainer.targetBpm} BPM · {p.speedTrainer.everyBars}마디마다 {p.speedTrainer.step} BPM씩 {p.speedTrainer.startBpm>p.speedTrainer.targetBpm?"감속":"증속"}. 직접 BPM을 바꾸면 속도 훈련을 해제합니다.</p>
    </section>
    <section className="space-y-3">
      <h3 className="font-bold">갭 훈련</h3>
      <Toggle label="갭 훈련 켜기" checked={p.gapTrainer.enabled} onChange={enabled=>gap({enabled})}/>
      <div className="grid grid-cols-3 gap-2">{[[3,1],[2,2],[1,1]].map(([playBars,muteBars])=><button key={playBars+":"+muteBars} type="button" className={chip(p.gapTrainer.playBars===playBars&&p.gapTrainer.muteBars===muteBars)} aria-label={playBars+"마디 재생 "+muteBars+"마디 묵음"} aria-pressed={p.gapTrainer.playBars===playBars&&p.gapTrainer.muteBars===muteBars} onClick={()=>gap({playBars,muteBars,enabled:true})}>{playBars}:{muteBars}</button>)}</div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="소리 (마디)" value={p.gapTrainer.playBars} min={1} max={64} onChange={playBars=>gap({playBars})}/>
        <NumberField label="묵음 (마디)" value={p.gapTrainer.muteBars} min={1} max={64} onChange={muteBars=>gap({muteBars})}/>
      </div>
      <Toggle label="훈련 묵음 중 시각·햅틱 유지" checked={p.gapTrainer.keepVisual} onChange={keepVisual=>gap({keepVisual})}/>
      <p className="text-sm text-[color:var(--muted)]">{p.gapTrainer.playBars}마디 소리 / {p.gapTrainer.muteBars}마디 묵음. 시각·햅틱 유지 설정은 랜덤 묵음에도 적용됩니다.</p>
    </section>
    <section className="space-y-3">
      <h3 className="font-bold">랜덤 묵음</h3>
      <Toggle label="랜덤 묵음 켜기" checked={p.randomMute.enabled} onChange={enabled=>random({enabled})}/>
      <label className="block space-y-2 text-sm"><span>묵음 단위</span>
        <select className="touch-target w-full rounded-xl px-3 surface-2" aria-label="랜덤 묵음 단위" value={p.randomMute.unit} onChange={event=>random({unit:event.target.value as RandomMuteSettings["unit"]})}><option value="beat">박 전체 (모든 분할)</option><option value="bar">마디 전체</option></select>
      </label>
      <label className="block text-sm" htmlFor="random-mute">확률 {Math.round(p.randomMute.probability*100)}%</label>
      <input id="random-mute" className="h-11 w-full accent-[color:var(--accent)]" type="range" min={0} max={100} value={Math.round(p.randomMute.probability*100)} onChange={event=>random({probability:Number(event.target.value)/100})}/>
      <p className="text-sm text-[color:var(--muted)]">{p.randomMute.unit==="beat"?"박":"마디"} 단위 {Math.round(p.randomMute.probability*100)}% 묵음</p>
    </section>
  </div>;
});
const chip=(active:boolean)=>"touch-target rounded-2xl px-2 py-2 font-bold "+(active?"bg-[color:var(--accent)] text-[color:var(--bg)]":"surface-2");
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(checked:boolean)=>void}) {
  return <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-2 surface-2"><span className="font-semibold">{label}</span><input className="h-5 w-5 shrink-0" type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)}/></label>;
}

