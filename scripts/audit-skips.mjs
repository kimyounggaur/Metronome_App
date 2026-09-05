import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const port=Number(process.argv[2]??5185), pace=Number(process.argv[3]??0);
const browser=await chromium.launch({headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
await page.addInitScript(()=>{
  window.__skipAudit={ticks:[],marks:[],longTasks:[],frames:[],contextStates:[]};
  const OriginalContext=window.AudioContext;
  window.AudioContext=class extends OriginalContext {
    constructor(...args){super(...args);window.__skipAudio=this;this.addEventListener('statechange',()=>window.__skipAudit.contextStates.push({p:performance.now(),a:this.currentTime,state:this.state}));}
  };
  const OriginalWorker=window.Worker;
  window.Worker=class extends OriginalWorker {
    constructor(...args){super(...args);this.addEventListener('message',event=>{window.__skipAudit.ticks.push({p:performance.now(),a:window.__skipAudio?.currentTime,type:event.data.type});});}
  };
  new PerformanceObserver(list=>window.__skipAudit.longTasks.push(...list.getEntries().map(e=>({duration:e.duration,p:e.startTime})))).observe({type:'longtask',buffered:true});
  try{new PerformanceObserver(list=>window.__skipAudit.frames.push(...list.getEntries().map(e=>({duration:e.duration,p:e.startTime,blocking:e.blockingDuration,scripts:e.scripts.map(s=>({duration:s.duration,source:s.sourceURL,invoker:s.invoker}))})))).observe({type:'long-animation-frame',buffered:true});}catch{}
});
await page.goto('http://127.0.0.1:'+port);
const seed=JSON.parse(await readFile('docs/backup-example.json','utf8'));
seed.settings.bpm=300;seed.settings.subdivision='sixteenth';seed.settings.practice.timerSeconds=650;seed.settings.practice.speedTrainer={enabled:true,startBpm:300,targetBpm:300,step:2,everyBars:2,onReach:'hold'};
await page.evaluate(data=>localStorage.setItem('pulse:data:v2',JSON.stringify(data)),seed);await page.reload();
const mark=async label=>page.evaluate(label=>window.__skipAudit.marks.push({label,p:performance.now(),a:window.__skipAudio?.currentTime,diag:window.__pulseDiagnostics?.getDiagnostics()}),label);
await page.getByRole('button',{name:'재생',exact:true}).click();await mark('playing');
await page.waitForTimeout(2500);
await mark('before-open');await page.getByRole('button',{name:'연습 시트 열기'}).click();await mark('after-open');
await page.getByLabel('갭 훈련 켜기',{exact:true}).check();await mark('after-gap');
await page.getByLabel('랜덤 묵음 켜기',{exact:true}).check();await mark('after-random');
await page.locator('#random-mute').focus();await page.keyboard.press('Home');await mark('after-home');
for(let i=0;i<30;i++){await page.keyboard.press('ArrowRight');if(pace)await page.waitForTimeout(pace);}await mark('after-30-keys');
await page.getByRole('button',{name:'연습 닫기',exact:true}).click();await mark('after-close');
await page.getByRole('button',{name:'BPM 1 감소',exact:true}).click();await mark('after-minus');
await page.getByRole('button',{name:'BPM 1 증가',exact:true}).click();await mark('after-plus');
await page.waitForTimeout(Math.max(1000,6000-pace*30));await mark('end');
const audit=await page.evaluate(()=>window.__skipAudit);
await writeFile('output/playwright/skip-audit-'+port+'-pace'+pace+'.json',JSON.stringify(audit,null,2));
const gaps=audit.ticks.flatMap((tick,i)=>i&&tick.p-audit.ticks[i-1].p>60?[{from:audit.ticks[i-1],to:tick,wallGap:tick.p-audit.ticks[i-1].p,audioGap:tick.a-audit.ticks[i-1].a}]:[]);
console.log(JSON.stringify({marks:audit.marks.map(({label,p,a,diag})=>({label,p,a,skipped:diag?.skippedEventCount,skips:diag?.records.filter(r=>r.skipped)})),gaps,longTasks:audit.longTasks,frames:audit.frames,states:audit.contextStates}));
await browser.close();

