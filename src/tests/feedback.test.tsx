import {act,renderHook,render,screen,cleanup} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useBeatFlash} from '../hooks/useBeatFlash';
import {BigDisplay} from "../components/BigDisplay";
import {MeterSummary} from "../components/MeterSummary";
import {BeatVisualizer} from '../components/BeatVisualizer';
import {defaultSettings} from '../domain/presets';
import {createPracticeSession,planNextEvent} from '../domain/planner';
function event(time=0){return planNextEvent(createPracticeSession(defaultSettings,time),defaultSettings,()=>.5).event!;}
function media(reduced=false){vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener:vi.fn(),removeEventListener:vi.fn()}));}
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
describe('visual feedback policy',()=>{
  it('limits flash to twice per second and clears stop/hidden feedback',()=>{
    vi.useFakeTimers();media();
    const {result,rerender}=renderHook(({beat,playing})=>useBeatFlash(true,beat,playing),{initialProps:{beat:event(),playing:true}});
    expect(result.current).toBe(true);
    act(()=>vi.advanceTimersByTime(100));expect(result.current).toBe(false);
    for(let i=1;i<5;i++){rerender({beat:event(i*.1),playing:true});expect(result.current).toBe(false);act(()=>vi.advanceTimersByTime(100));}
    rerender({beat:event(.5),playing:true});expect(result.current).toBe(true);
    rerender({beat:{...event(.51),showVisual:false},playing:true});expect(result.current).toBe(false);
    act(()=>vi.advanceTimersByTime(500));rerender({beat:event(1),playing:true});expect(result.current).toBe(true);
    rerender({beat:event(1),playing:false});expect(result.current).toBe(false);
  });
  it('never flashes with reduced motion or subdivisions',()=>{
    media(true);const reduced=renderHook(()=>useBeatFlash(true,event(),true));expect(reduced.result.current).toBe(false);reduced.unmount();
    media(false);const sub=renderHook(()=>useBeatFlash(true,{...event(),subIndex:1},true));expect(sub.result.current).toBe(false);
  });
  it("checks the current reduced-motion preference even before the media change event", () => {
    let reduced = false;
    vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { result, rerender } = renderHook(({ beat }) => useBeatFlash(true, beat, true), { initialProps: { beat: event() } });
    expect(result.current).toBe(true);
    reduced = true;
    rerender({ beat: event(0.5) });
    expect(result.current).toBe(false);
  });
  it('shows no current beat in stopped or training-hidden segments',()=>{
    const {rerender}=render(<BeatVisualizer event={null} pulseId={0} accents={defaultSettings.accents} timeSignature={defaultSettings.timeSignature} onCycleAccent={()=>{}}/>);
    expect(screen.getByText('—')).toBeInTheDocument();
    rerender(<BeatVisualizer event={{...event(),showVisual:false}} pulseId={1} accents={defaultSettings.accents} timeSignature={defaultSettings.timeSignature} onCycleAccent={()=>{}}/>);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByLabelText('1박 악센트 강 변경').className).not.toContain('bg-[color:var(--accent)]');
  });
});

describe("R09 stationary pulse in each view", () => {
  for (const mode of ["normal", "performance"]) {
    it(`marks four consecutive muted main cells in ${mode} and masks training silences`, () => {
      const beat = { ...event(), timeSignature: { beats: 1, noteValue: 4 as const }, globalMute: true, isAudible: false };
      function view(pulseId: number, showVisual: boolean, subIndex = 0) {
        const current = { ...beat, time: 0.06 + (pulseId - 1) * 0.5 + subIndex * 0.125, showVisual, subIndex };
        const props = { event: current, pulseId, accents: beat.accents.slice(0, 1), timeSignature: beat.timeSignature };
        return mode === "normal"
          ? <BeatVisualizer {...props} onCycleAccent={() => {}} />
          : <BigDisplay {...props} bpm={120} isPlaying status={null} onToggle={() => {}} onPrevious={() => {}} onNext={() => {}} />;
      }
      const result = render(view(0, false));
      const cue = () => Array.from(result.container.querySelectorAll(".cell-pulse > span"))
        .findIndex(marker => marker.classList.contains("cell-pulse-on"));
      for (let pulse = 1; pulse <= 4; pulse++) {
        result.rerender(view(pulse, true));
        expect(cue()).toBe(pulse % 2);
        result.rerender(view(pulse, true, 1));
        expect(cue()).toBe(pulse % 2);
      }
      result.rerender(view(4, false));
      expect(cue()).toBe(-1);
    });
  }

  it("R10 distinguishes compound beats from unequal group lengths", () => {
    const { rerender } = render(<MeterSummary bpm={60} timeSignature={{beats: 6, noteValue: 8}} tempoUnit="dotted-quarter" />);
    expect(screen.getByText("점4분음표 = 60 · 큰박 2개 · 8분음표 6칸")).toBeInTheDocument();
    rerender(<MeterSummary bpm={120} timeSignature={{beats: 7, noteValue: 8}} tempoUnit="eighth" beatGroups={[2,3,2]} />);
    expect(screen.getByText("8분음표 = 120 · 그룹 2+3+2칸 · 8분음표 7칸")).toBeInTheDocument();
  });
});
