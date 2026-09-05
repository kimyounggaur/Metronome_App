import {act,renderHook,render,screen,cleanup} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useBeatFlash} from '../hooks/useBeatFlash';
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
  it('shows no current beat in stopped or training-hidden segments',()=>{
    const {rerender}=render(<BeatVisualizer event={null} pulseId={0} accents={defaultSettings.accents} timeSignature={defaultSettings.timeSignature} onCycleAccent={()=>{}}/>);
    expect(screen.getByText('—')).toBeInTheDocument();
    rerender(<BeatVisualizer event={{...event(),showVisual:false}} pulseId={1} accents={defaultSettings.accents} timeSignature={defaultSettings.timeSignature} onCycleAccent={()=>{}}/>);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByLabelText('1박 악센트 강 변경').className).not.toContain('bg-[color:var(--accent)]');
  });
});
