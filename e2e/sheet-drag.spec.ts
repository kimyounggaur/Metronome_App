import { test, expect, type Locator, type Page } from '@playwright/test';

async function drag(page: Page, target: Locator, distance: number) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + distance, { steps: 10 });
  await page.mouse.up();
}

test.use({ viewport: { width: 390, height: 844 } });

test('sheet drag is restricted to the handle and a real downward handle drag closes it', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '연습 시트 열기', exact: true });
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '연습', exact: true });
  await expect(sheet).toBeVisible();
  // Start in the content heading: ordinary content selection/scrolling must not dismiss the dialog.
  await drag(page, sheet.getByRole('heading', { name: '카운트인', exact: true }), 120);
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: '연습 닫기', exact: true })).toBeVisible();
  await drag(page, sheet.locator('div.touch-none[aria-hidden="true"]'), 120);
  await expect(sheet).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
  await info.attach('sheet-drag-result', { body: JSON.stringify({ contentDragPixels: 120, contentStayedOpen: true, handleDragPixels: 120, handleClosed: true, focusRestored: true, pageErrors: errors }), contentType: 'application/json' });
});

test('pointer cancellation and lost capture clear handle drag before a later pointerup', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const results: Array<{ cancellation: string; stayedOpen: boolean }> = [];
  for (const cancellation of ['pointercancel', 'lostpointercapture']) {
    await page.getByRole('button', { name: '연습 시트 열기', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: '연습', exact: true });
    const handle = sheet.locator('div.touch-none[aria-hidden="true"]');
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await handle.evaluate(element => {
      element.addEventListener('pointerdown', event => { element.setAttribute('data-audit-pointer-id', String((event as PointerEvent).pointerId)); }, { once: true });
    });
    await page.mouse.move(x, y);
    await page.mouse.down();
    const pointerId = Number(await handle.getAttribute('data-audit-pointer-id'));
    expect(await handle.evaluate((element, id) => element.hasPointerCapture(id), pointerId)).toBe(true);
    await page.mouse.move(x, y + 100, { steps: 8 });
    await handle.dispatchEvent(cancellation, { pointerId, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y + 100, bubbles: true });
    await page.mouse.move(x, y + 140, { steps: 4 });
    await page.mouse.up();
    await expect(sheet).toBeVisible();
    results.push({ cancellation, stayedOpen: true });
    await sheet.getByRole('button', { name: '연습 닫기', exact: true }).click();
    await expect(sheet).not.toBeVisible();
  }
  expect(errors).toEqual([]);
  await info.attach('sheet-cancellation-result', { body: JSON.stringify({ results, pointerCaptureWasNative: true, cancellationEventWasInjected: true, pageErrors: errors }), contentType: 'application/json' });
});
