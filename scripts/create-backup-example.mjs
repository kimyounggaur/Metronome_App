import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch();const page=await browser.newPage();await page.goto('http://127.0.0.1:5173');
const data=await page.evaluate(async()=>{const path='/src/domain/presets.ts';return(await import(path)).createDefaultData();});
await writeFile('docs/backup-example.json',JSON.stringify(data,null,2));await browser.close();
