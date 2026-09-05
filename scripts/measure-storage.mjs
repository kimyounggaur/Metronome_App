import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const name=process.argv[2]??'storage-before';const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844}});
await page.goto('http://127.0.0.1:5173');
await page.evaluate(()=>{window.__storageMeasure={writes:0,milliseconds:0,bytes:0};const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const now=performance.now();window.__storageMeasure.writes++;window.__storageMeasure.bytes+=v.length;try{return set.call(this,k,v);}finally{window.__storageMeasure.milliseconds+=performance.now()-now;}};});
const slider=page.getByLabel('BPM 슬라이더');await slider.scrollIntoViewIfNeeded();const r=await slider.boundingBox();await page.mouse.move(r.x+2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width-2,r.y+r.height/2,{steps:60});await page.mouse.up();await page.waitForTimeout(500);
const result=await page.evaluate(()=>({...window.__storageMeasure,input:document.querySelector('#bpm-input').value,stored:JSON.parse(localStorage.getItem('pulse:data:v2')).settings.bpm}));
await mkdir('output/playwright',{recursive:true});await writeFile('output/playwright/'+name+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
