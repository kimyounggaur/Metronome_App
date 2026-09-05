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
