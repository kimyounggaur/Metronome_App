import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('output/playwright', { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];
for (const [name, width, height] of [['desktop',1440,900],['mobile',390,844],['small',320,568]]) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173');
  await page.screenshot({ path:`output/playwright/baseline-${name}.png`, fullPage:true });
  if (name === 'mobile') {
    await page.getByRole('button',{name:'설치 힌트 닫기'}).click();
    await page.getByRole('button',{name:'BPM 1 증가',exact:true}).click();
    report.push({case:'BPM external sync',input:await page.getByLabel('BPM 직접 입력').inputValue(),slider:await page.getByLabel('BPM 슬라이더').inputValue()});
    await page.getByRole('button',{name:'메뉴',exact:true}).click();
    await page.keyboard.press('Escape');
    report.push({case:'Help escape',text:(await page.locator('body').innerText()).slice(-700)});
  }
  await context.close();
}
await writeFile('output/playwright/baseline.json',JSON.stringify(report,null,2));
await browser.close();
