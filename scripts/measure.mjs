import { chromium } from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const duration=Number(process.argv[2]??10), port=Number(process.argv[3]??5173), name=process.argv[4]??'measurement';
const inputBurst=process.argv.includes('--input-burst');
const inputIntervalMs=inputBurst?0:33;
const inputConditions={mode:inputBurst?'burst':'paced',minimumIntervalMs:inputIntervalMs,keyCount:30};
await mkdir('output/playwright',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)));
await page.goto('http://127.0.0.1:'+port);
const seed=JSON.parse(await readFile('docs/backup-example.json','utf8'));
await page.evaluate(({duration,data})=>{data.settings.bpm=300;data.settings.subdivision='sixteenth';if(duration>=600){data.settings.practice.timerSeconds=650;data.settings.practice.speedTrainer={enabled:true,startBpm:300,targetBpm:300,step:2,everyBars:2,onReach:'hold'};}localStorage.setItem('pulse:data:v2',JSON.stringify(data));},{duration,data:seed});
await page.reload();
await page.evaluate(()=>{
  window.__measure={nodesAdded:0,storageWrites:0,storageMs:0,longTasks:[],started:performance.now()};
  const set=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){const t=performance.now();window.__measure.storageWrites++;try{return set.apply(this,args);}finally{window.__measure.storageMs+=performance.now()-t;}};
  const visual=document.querySelector('[aria-label="박 시각화"]');new MutationObserver(records=>{window.__measure.nodesAdded+=records.reduce((n,r)=>n+r.addedNodes.length,0);}).observe(visual,{subtree:true,childList:true});
  try{new PerformanceObserver(list=>{window.__measure.longTasks.push(...list.getEntries().map(e=>({duration:e.duration,startTime:e.startTime})));}).observe({type:'longtask',buffered:true});}catch{}
});
await page.getByRole('button',{name:'재생',exact:true}).click();
const samples=[],actions=[];const started=Date.now();let edited=false;
const actionMark=async(action,phase)=>actions.push(await page.evaluate(({action,phase})=>{
  const diagnostics=window.__pulseDiagnostics?.getDiagnostics();
  return {action,phase,performanceMs:performance.now(),epochMs:Date.now(),lastVisualAudioTime:diagnostics?.visualDeliveredTime,lastScheduledAudioTime:diagnostics?.lastScheduledTime,skippedEventCount:diagnostics?.skippedEventCount};
},{action,phase}));
const action=async(name,callback)=>{await actionMark(name,'start');await callback();await actionMark(name,'end');};
while(Date.now()-started<duration*1000){
  await page.waitForTimeout(Math.min(1000,duration*1000-(Date.now()-started)));
  const result=await page.evaluate(()=>({time:performance.now(),snapshot:window.__pulseDiagnostics?.getSnapshot(),diagnostics:window.__pulseDiagnostics?.getDiagnostics()}));
  if(samples.length%30===0)console.log(JSON.stringify({elapsed:Math.round((Date.now()-started)/1000),state:result.snapshot?.state,scheduled:result.diagnostics?.totalScheduledCount,skipped:result.diagnostics?.skippedEventCount,queue:result.diagnostics?.queueLength}));
  samples.push({...result,diagnostics:{...result.diagnostics,records:undefined}});
  if(!edited&&Date.now()-started>Math.min(5000,duration*250)){
    edited=true;await action('open-practice',()=>page.getByRole('button',{name:'연습 시트 열기'}).click());
    await action('enable-gap',()=>page.getByLabel('갭 훈련 켜기',{exact:true}).check());
    await action('enable-random',()=>page.getByLabel('랜덤 묵음 켜기',{exact:true}).check());
    await action('random-slider-home',async()=>{await page.locator('#random-mute').focus();await page.keyboard.press('Home');});
    await action('random-slider-30-increments',async()=>{for(let i=0;i<30;i++){await page.keyboard.press('ArrowRight');if(inputIntervalMs>0&&i<29)await page.waitForTimeout(inputIntervalMs);}});
    await action('close-practice',()=>page.getByRole('button',{name:'연습 닫기',exact:true}).click());
    if(duration>=600){await action('manual-bpm-minus',()=>page.getByRole('button',{name:'BPM 1 감소',exact:true}).click());await action('manual-bpm-plus',()=>page.getByRole('button',{name:'BPM 1 증가',exact:true}).click());}
  }
}
const beforeStop=await page.evaluate(()=>({metrics:window.__measure,reactProfiler:window.__pulseReactProfile,diagnostics:window.__pulseDiagnostics?.getDiagnostics(),snapshot:window.__pulseDiagnostics?.getSnapshot(),visible:document.visibilityState}));
await page.getByRole('button',{name:'정지',exact:true}).click();
const afterStop=await page.evaluate(()=>window.__pulseDiagnostics?.getDiagnostics());
await writeFile('output/playwright/'+name+'.json',JSON.stringify({environment:{browser:browser.version(),node:process.version,headless:true,foreground:true,durationSeconds:duration,url:page.url(),inputConditions},errors,actions,samples,beforeStop,afterStop},null,2));
await page.screenshot({path:'output/playwright/'+name+'.png',fullPage:true});
console.log(JSON.stringify({result:name,scheduled:beforeStop.diagnostics?.totalScheduledCount,skipped:beforeStop.diagnostics?.skippedEventCount,duplicate:beforeStop.diagnostics?.duplicateEventCount,nodesAdded:beforeStop.metrics.nodesAdded,storageWrites:beforeStop.metrics.storageWrites,maxQueue:beforeStop.diagnostics?.maxQueueLength,afterStop:{queue:afterStop?.queueLength,activeSources:afterStop?.activeSources}}));
await browser.close();
