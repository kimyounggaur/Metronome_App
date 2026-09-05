import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({page}) => { await page.goto('/'); });

test('corrupt storage stays intact while basic metronome remains usable',async({page})=>{
  await page.evaluate(()=>localStorage.setItem('pulse:data:v2','{"broken":true}'));
  await page.reload();
  await expect(page.getByText(/원본을 보존했습니다/)).toBeVisible();
  await page.getByRole('button',{name:'BPM 1 증가',exact:true}).click();
  await expect(page.getByLabel('BPM 직접 입력')).toHaveValue('121');
  expect(await page.evaluate(()=>localStorage.getItem('pulse:data:v2'))).toBe('{"broken":true}');
  await expect(page.getByRole('button',{name:'원본 데이터 내려받기'})).toBeVisible();
});

test('storage write denial keeps memory state and exposes a backup',async({page})=>{
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError')};});
  await page.getByRole('button',{name:'BPM 1 증가',exact:true}).click();
  await expect(page.getByLabel('BPM 직접 입력')).toHaveValue('121');
  await expect(page.getByText(/이번 변경은 이 기기에 저장되지 않았습니다/)).toBeVisible();
  await expect(page.getByRole('button',{name:'현재 데이터 백업'})).toBeVisible();
});

test('BPM pointer, keyboard and direct input stay synchronized', async ({page}) => {
  const input=page.getByLabel('BPM 직접 입력');
  const plus=page.getByRole('button',{name:'BPM 1 증가',exact:true});
  await plus.click();
  await expect(input).toHaveValue('121');
  await expect(page.getByLabel('BPM 슬라이더')).toHaveValue('121');
  await plus.press('Enter');
  await expect(input).toHaveValue('122');
  await input.fill('999'); await input.press('Enter');
  await expect(input).toHaveValue('300');
  await input.fill(''); await input.press('Enter');
  await expect(input).toHaveValue('300');
  await input.fill('20'); await input.press('Enter');
  await expect(input).toHaveValue('30');
  await input.fill('90'); await input.press('Escape');
  await expect(input).toHaveValue('30');
});

test('desktop exposes full controls and performance mode has an exit',async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await expect(page.getByLabel('BPM 직접 입력')).toBeVisible();
  await page.getByRole('button',{name:'공연 모드 열기'}).click();
  await page.getByRole('button',{name:'일반 화면으로'}).click();
  await expect(page.getByLabel('BPM 직접 입력')).toBeVisible();
});

test('help traps focus, closes on Escape and restores its trigger',async ({page})=>{
  const menu=page.getByRole('button',{name:'메뉴',exact:true});
  await menu.click();
  const dialog=page.getByRole('dialog',{name:'키보드 단축키'});
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(menu).toBeFocused();
});

test('all specified viewports retain controls without horizontal overflow',async({page})=>{
  for(const [width,height] of [[320,568],[360,740],[390,844],[768,1024],[844,390],[1440,900]]){
    await page.setViewportSize({width,height});
    await expect(page.getByLabel('BPM 직접 입력')).toBeVisible();
    await expect(page.getByRole('button',{name:'재생',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:`output/playwright/final-${width}x${height}.png`,fullPage:true});
  }
});

test('main screen and modal pass automated accessibility checks',async({page})=>{
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'연습 시트 열기'}).click();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});
