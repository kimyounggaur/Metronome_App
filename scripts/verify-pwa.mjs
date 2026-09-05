import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(project, process.argv[2] ?? 'dist');
const evidence = path.join(project, 'output', 'playwright', `pwa-${Date.now()}`);
await mkdir(evidence, { recursive: true });
const buildA = path.join(evidence, 'build-a'), buildB = path.join(evidence, 'build-b');
await cp(source, buildA, { recursive: true });
await cp(source, buildB, { recursive: true });
const originalHtml = await readFile(path.join(buildB, 'index.html'), 'utf8');
await writeFile(path.join(buildB, 'index.html'), originalHtml.replace('</head>', '<meta name="pulse-verification-version" content="B"></head>'));
execFileSync(process.execPath, [path.join(project, 'scripts/build-sw.mjs'), buildB], { cwd: project, stdio: 'pipe' });
const manifests = await Promise.all([buildA, buildB].map(async directory => JSON.parse(await readFile(path.join(directory, 'pwa-precache.json'), 'utf8'))));
assert.notEqual(manifests[0].version, manifests[1].version);
let currentBuild = buildA;
let online = true;
const requests = [];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4173');
  requests.push({ path: url.pathname, online, build: currentBuild === buildA ? 'A' : 'B' });
  if (!online) { request.socket.destroy(); return; }
  response.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/other/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end('self.addEventListener("fetch",()=>{});'); return;
  }
  if (url.pathname.startsWith('/network-probe')) { response.setHeader('Content-Type', 'text/plain'); response.end('online'); return; }
  let file = path.resolve(currentBuild, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(currentBuild + path.sep) && file !== path.join(currentBuild, 'index.html')) { response.writeHead(403); response.end(); return; }
  try { if (!(await stat(file)).isFile()) throw new Error('not file'); }
  catch { file = path.join(currentBuild, 'index.html'); }
  response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
  response.end(await readFile(file));
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4173, '127.0.0.1', resolve); });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let report = { origin: 'http://127.0.0.1:4173', browser: browser.version(), httpCacheDisabled: true, versions: manifests.map(item => item.version), checks: {}, limitations: ['Physical internet disconnection, installed iPhone/Android launches and device audio output were not measured.'], evidence };
try {
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByText('오프라인 사용 준비 완료', { exact: true })).toBeVisible({ timeout: 20000 });
  const firstCache = await page.evaluate(async () => {
    const names = await caches.keys();
    const owned = names.find(name => name.startsWith('pulse-metronome-v2:%2F:'));
    return { name: owned, assets: (await (await caches.open(owned)).keys()).map(request => new URL(request.url).pathname) };
  });
  for (const asset of manifests[0].assets) assert(firstCache.assets.includes('/' + asset), `Precache missing ${asset}`);
  assert(firstCache.assets.some(asset => /schedulerWorker.*\.js$/.test(asset)));
  report.checks.fullPrecacheBeforeFirstPlay = firstCache;
  await page.screenshot({ path: path.join(evidence, 'online-ready.png'), fullPage: true });

  // The HTTP server itself drops every connection: service-worker fetch cannot bypass this control.
  online = false;
  await assert.rejects(fetch('http://127.0.0.1:4173/network-probe-node'));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('오프라인 사용 준비 완료', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect(page.getByRole('button', { name: '정지', exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '정지', exact: true }).click();
  const offlineMissing = await page.evaluate(async () => {
    const response = await fetch('/assets/missing-worker.js');
    return { status: response.status, type: response.headers.get('content-type'), body: await response.text() };
  });
  assert.equal(offlineMissing.status, 503);
  assert(!offlineMissing.type.includes('text/html'));
  report.checks.offlineReloadAndFirstPlay = true;
  report.checks.offlineAssetFailureNotHtml = offlineMissing;
  await page.screenshot({ path: path.join(evidence, 'offline-ready.png'), fullPage: true });

  online = true;
  await context.setOffline(false);
  const onlineMissing = await page.evaluate(async () => {
    const response = await fetch('/assets/missing.js');
    return { status: response.status, type: response.headers.get('content-type') };
  });
  assert.equal(onlineMissing.status, 404);
  assert(!onlineMissing.type.includes('text/html'));
  report.checks.hostHtmlFallbackRejectedForScript = onlineMissing;
  const missingResources = await page.evaluate(async () => Promise.all(['/assets/missing.css', '/assets/missing-worker.js', '/api', '/api/missing'].map(async url => {
    const response = await fetch(url);
    return { url, status: response.status, type: response.headers.get('content-type') };
  })));
  for (const resource of missingResources) { assert.equal(resource.status, 404); assert(!resource.type.includes('text/html')); }
  report.checks.missingStyleWorkerApiNotHtml = missingResources;
  await page.evaluate(async () => {
    for (const name of ['unrelated-app-cache', 'pulse-metronome-v2:%2Fother%2F:keep', 'pulse-metronome-v2:%2F:old-test-build']) await caches.open(name);
    await navigator.serviceWorker.register('/other/sw.js', { scope: '/other/' });
  });
  await page.getByLabel('BPM 직접 입력').fill('93');
  await page.getByLabel('BPM 직접 입력').press('Enter');
  const storageBefore = await page.evaluate(() => localStorage.getItem('pulse:data:v2'));
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect(page.getByRole('button', { name: '정지', exact: true })).toBeVisible();
  const oldController = await page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller;
    return new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = event => resolve(event.data.version); controller.postMessage({ type: 'PULSE_GET_STATUS' }, [channel.port2]); });
  });
  currentBuild = buildB;
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration('/'); await registration.update(); });
  await expect(page.getByText(/업데이트 준비됨/)).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(750);
  await expect(page.getByRole('button', { name: '정지', exact: true })).toBeVisible();
  assert.equal(await page.locator('meta[name="pulse-verification-version"]').count(), 0);
  const waitingBeforeApply = await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration('/')).waiting));
  assert(waitingBeforeApply);
  report.checks.updateWaitsDuringPlayback = { oldController, waitingBeforeApply };
  await page.screenshot({ path: path.join(evidence, 'update-waiting.png'), fullPage: true });
  await page.getByRole('button', { name: '정지 후 업데이트 적용', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('meta[name="pulse-verification-version"]')?.getAttribute('content') === 'B');
  await expect(page.getByText('오프라인 사용 준비 완료', { exact: true })).toBeVisible();
  await expect(page.getByLabel('BPM 직접 입력')).toHaveValue('93');
  const after = await page.evaluate(async () => ({ caches: await caches.keys(), scopes: (await navigator.serviceWorker.getRegistrations()).map(registration => new URL(registration.scope).pathname), storage: localStorage.getItem('pulse:data:v2') }));
  assert(after.caches.includes('unrelated-app-cache'));
  assert(after.caches.includes('pulse-metronome-v2:%2Fother%2F:keep'));
  assert(!after.caches.includes('pulse-metronome-v2:%2F:old-test-build'));
  assert(!after.caches.includes(firstCache.name));
  assert(after.caches.includes('pulse-metronome-v2:%2F:' + manifests[1].version));
  assert(after.scopes.includes('/other/'));
  assert.equal(after.storage, storageBefore);
  report.checks.userUpdateAndDataPreservation = true;
  report.checks.ownedCacheCleanup = after.caches;
  report.checks.unrelatedRegistrationPreserved = after.scopes;
  report.checks.pageErrors = errors;
  assert.deepEqual(errors, []);
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL'; report.failure = error.stack ?? String(error);
  await page.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  report.requests = requests;
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  process.stdout.write(`PWA verification ${report.result}: ${path.join(evidence, 'report.json')}\n`);
}
