import { test,expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('OfflineAudioContext renders linear volume, exact mute and canceled sessions',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const enginePath='/src/audio/MetronomeEngine.ts', presetsPath='/src/domain/presets.ts';
    const {MetronomeEngine,settingsForEngine}=await import(enginePath);
    const {defaultSettings}=await import(presetsPath);
    async function render(volume:number,muted=false,stopAt:number|null=null){
      const offline=new OfflineAudioContext(1,44100*.25,44100);
      let time=0;
      // The injected context reports running; all synthesis/automation uses the real offline renderer.
      const context=new Proxy(offline,{get(target,key){if(key==='state')return 'running';if(key==='close')return ()=>Promise.resolve();const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
      const worker={onmessage:null as ((event:{data:unknown})=>void)|null,onerror:null,terminate(){},postMessage(message:{sessionId:number}){queueMicrotask(()=>this.onmessage?.({data:{type:'ready',sessionId:message.sessionId}}));}};
      const engine=new MetronomeEngine(settingsForEngine({...defaultSettings,volume,muted}),undefined,{createAudioContext:()=>context,createWorker:()=>worker,requestFrame:()=>1,cancelFrame:()=>{},audioTime:()=>time,diagnostics:true});
      await engine.start();
      if(stopAt!==null){time=stopAt;engine.stop();}
      const buffer=await offline.startRendering();const samples=buffer.getChannelData(0);
      const peak=Math.max(...samples.map(v=>Math.abs(v)));
      const tail=Math.max(...samples.slice(Math.ceil((stopAt===null?.15:stopAt+.009)*44100)).map(v=>Math.abs(v)));
      engine.dispose();return{peak,tail};
    }
    return {full:await render(1),half:await render(.5),zero:await render(0),mute:await render(1,true),future:await render(1,false,.01),fade:await render(1,false,.07)};
  });
  await mkdir('output/playwright', { recursive: true });
  await writeFile('output/playwright/offline-audio.json', JSON.stringify(result, null, 2));
  expect(result.full.peak).toBeGreaterThan(.05);
  expect(result.half.peak/result.full.peak).toBeCloseTo(.5,5);
  expect(result.zero.peak).toBe(0);expect(result.mute.peak).toBe(0);expect(result.future.peak).toBe(0);
  expect(result.fade.peak).toBeGreaterThan(0);expect(result.fade.tail).toBe(0);
  await test.info().attach('offline-audio.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
});

test('rapid transport requests stay stopped and clear the visible beat',async({page})=>{
  await page.goto('/');
  const play=page.getByRole('button',{name:'재생',exact:true});
  await play.click();
  await page.getByRole('button',{name:'정지',exact:true}).click();
  await expect(play).toBeVisible();
  await play.click();await expect(page.getByRole('button',{name:'정지',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'정지',exact:true}).click();
  await expect(page.locator('[aria-label="박 시각화"]')).toContainText('—');
});

test("R08 audible waveform at mute release and atomic preset gain", async ({page}) => {
  await page.goto("/");
  const rendered = await page.evaluate(async () => {
    const enginePath = "/src/audio/MetronomeEngine.ts";
    const presetsPath = "/src/domain/presets.ts";
    const {MetronomeEngine, settingsForEngine} = await import(enginePath);
    const {defaultSettings} = await import(presetsPath);
    async function render(mode: "control" | "unmute" | "preset" | "edit") {
      const sampleRate = 44100;
      const offline = new OfflineAudioContext(1, Math.ceil(sampleRate * 2.36), sampleRate);
      const context = new Proxy(offline, {get(target, key) {
        if (key === "state") return "running";
        if (key === "close") return () => Promise.resolve();
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      }});
      let now = 0;
      let sessionId = 0;
      const worker = {
        onmessage: null as null | ((event: {data: {type: string; sessionId: number}}) => void),
        onerror: null, terminate() {},
        postMessage(message: {sessionId: number}) {
          sessionId = message.sessionId;
          queueMicrotask(() => this.onmessage?.({data: {type: "ready", sessionId}}));
        },
      };
      const initial = settingsForEngine({...defaultSettings, muted: mode === "unmute"});
      const engine = new MetronomeEngine(initial, undefined, {
        createAudioContext: () => context, createWorker: () => worker,
        requestFrame: () => 1, cancelFrame() {}, audioTime: () => now, diagnostics: true,
      });
      const preset = {...initial, volume: mode === "preset" ? 0 : 0.2};
      await engine.start();
      for (let ms = 5; ms <= 2350; ms += 5) {
        now = ms / 1000;
        if (ms % 25 === 0) worker.onmessage?.({data: {type: "tick", sessionId}});
        if (mode === "unmute" && ms === 510) engine.updateSettings({...initial, muted: false});
        if (mode === "preset" || mode === "edit") {
          if (ms === 200) engine.updateSettings(preset, "preset");
          if (mode === "preset" && ms === 300) engine.updateSettings({...preset, subdivision: "eighth"});
          if (mode === "edit" && ms === 2010) engine.updateSettings({...preset, muted: true});
          if (mode === "edit" && ms === 2030) engine.updateSettings(preset);
        }
      }
      const channel = (await offline.startRendering()).getChannelData(0);
      const peaks = [0.06, 0.56, 1.06, 1.56, 2.06, 2.31].map(time => {
        const window = channel.subarray(Math.round(time * sampleRate), Math.round((time + 0.04) * sampleRate));
        return Math.max(...window.map(sample => Math.abs(sample)));
      });
      engine.dispose();
      return peaks;
    }
    return {control: await render("control"), unmute: await render("unmute"), preset: await render("preset"), edit: await render("edit")};
  });
  expect(rendered.unmute[0]).toBe(0);
  expect(rendered.unmute[1]).toBeCloseTo(rendered.control[1], 5);
  expect(rendered.unmute[1]).toBeGreaterThan(0.05);
  for (const index of [1, 2, 3]) {
    expect(rendered.preset[index]).toBeCloseTo(rendered.control[index], 5);
    expect(rendered.preset[index]).toBeGreaterThan(0.05);
  }
  expect(rendered.preset.slice(4)).toEqual([0, 0]);
  expect(rendered.edit[4]/rendered.control[4]).toBeCloseTo(0.20/0.82, 5);
  await test.info().attach("R08-peak-by-audio-time", {contentType: "application/json", body: JSON.stringify(rendered)});
});
