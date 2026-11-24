import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(project, process.argv[2] ?? 'dist');
const evidence = path.join(project, 'output', 'playwright', `pwa-${Date.now()}`);
const legacyRef = '2f97e9a302274fca30d461e9eedeb287ecafc4be';
await mkdir(evidence, { recursive: true });
const buildA = path.join(evidence, 'build-A');
await cp(source, buildA, { recursive: true });
const compileInputs = ['src', 'public', 'index.html', 'package.json', 'tsconfig.json', 'tsconfig.node.json', 'vite.config.ts', 'tailwind.config.ts', 'postcss.config.cjs', 'scripts/build-sw.mjs'];
async function fixtureBuild(label, legacy = false) {
  const work = path.join(evidence, 'source-' + label);
  await mkdir(work, { recursive: true });
  if (legacy) {
    if (process.env.PULSE_LEGACY_DIST) return path.resolve(process.env.PULSE_LEGACY_DIST);
    const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', legacyRef, '--', ...compileInputs], { cwd: project, encoding: 'utf8' }).trim().split('\n');
    for (const file of tracked) {
      await mkdir(path.dirname(path.join(work, file)), { recursive: true });
      await writeFile(path.join(work, file), execFileSync('git', ['show', legacyRef + ':' + file], { cwd: project }));
    }
  } else {
    for (const file of compileInputs) await cp(path.join(project, file), path.join(work, file), { recursive: true });
    const worker = path.join(work, 'src/audio/schedulerWorker.ts');
    await writeFile(worker, await readFile(worker, 'utf8') + `\nself.addEventListener('message', event => { if (event.data?.type === 'verification-build') self.postMessage('${label}'); });\n`);
  }
  execFileSync(process.execPath, [path.join(project, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: work, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(work, 'scripts/build-sw.mjs')], { cwd: work, stdio: 'pipe' });
  return path.join(work, 'dist');
}
const [buildB, buildC, buildLegacy] = await Promise.all([fixtureBuild('B'), fixtureBuild('C'), fixtureBuild('legacy', true)]);
const manifest = async directory => JSON.parse(await readFile(path.join(directory, 'pwa-precache.json'), 'utf8'));
const [a, b, c] = await Promise.all([buildA, buildB, buildC].map(manifest));
const asset = (metadata, pattern) => metadata.assets.find(entry => pattern.test(entry.path)).path;
assert.notEqual(asset(a, /schedulerWorker/), asset(b, /schedulerWorker/));
assert.notEqual(asset(a, /assets\/index.*\.js$/), asset(b, /assets\/index.*\.js$/));
const originalManifest = await readFile(path.join(buildA, 'pwa-precache.json'), 'utf8');
execFileSync(process.execPath, [path.join(project, 'scripts/build-sw.mjs'), buildA]);
assert.equal(await readFile(path.join(buildA, 'pwa-precache.json'), 'utf8'), originalManifest, 'Non-idempotent release identity');

let served = buildA;
let online = true;
let fault;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  if (!online) { request.socket.destroy(); return; }
  const pathname = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (pathname === '/other/sw.js') { response.setHeader('Content-Type', 'text/javascript'); response.end('self.onfetch=()=>{};'); return; }
  if (fault && pathname === '/' + fault.path) { response.setHeader('Content-Type', fault.mime); response.end(fault.bytes); return; }
  let file = path.resolve(served, '.' + decodeURIComponent(pathname));
  if (file !== served && !file.startsWith(served + path.sep)) { response.writeHead(403); response.end(); return; }
  if (!await stat(file).then(s => s.isFile(), () => false)) file = path.join(served, 'index.html');
  response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
  response.end(await readFile(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
const report = { browser: browser.version(), origin, versions: [a.version, b.version, c.version], checks: [], errors: [], limitations: ['Physical device output and installed iOS/Android cold start were not measured.'] };
const checked = label => { report.checks.push(label); process.stdout.write('PASS ' + label + '\n'); };
const context = () => browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
async function open(ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  const session = await ctx.newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.goto(origin);
  return page;
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
const ready = page => expect(page.getByText('오프라인 사용 준비 완료', { exact: true })).toBeVisible({ timeout: 20000 });
const update = page => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update().then(() => true));
async function offline(ctx, value) {
  online = !value;
  await ctx.setOffline(value);
  if (value) await assert.rejects(fetch(origin + '/network-probe'));
}
async function play(page) {
  await button(page, '재생').click();
  await expect(button(page, '정지')).toBeVisible();
  const visual = page.getByRole('region', { name: '박 시각화' });
  const display = await visual.innerText();
  await expect.poll(() => visual.innerText()).not.toBe(display);
}
const prefix = 'pulse-metronome-v3:%2F:';
async function status(page) {
  return page.evaluate(async () => {
    const version = document.querySelector('meta[name="pulse-build"]').content;
    const channel = new MessageChannel();
    const result = new Promise(resolve => channel.port1.onmessage = event => resolve(event.data));
    navigator.serviceWorker.controller.postMessage({ type: 'PULSE_GET_STATUS', requestId: crypto.randomUUID(), version }, [channel.port2]);
    return result;
  });
}
async function changeBuild(page, build) {
  served = build;
  await update(page);
  await expect(page.getByText(/업데이트 준비됨/)).toBeVisible({ timeout: 20000 });
}
try {
  const workerA = asset(a, /schedulerWorker/);
  for (const type of ['text/html', 'text/javascript']) {
    const ctx = await context();
    fault = { path: workerA, mime: type, bytes: '<html>fallback</html>' };
    const page = await open(ctx);
    await expect(page.getByText('오프라인 준비를 완료하지 못했습니다.')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('오프라인 사용 준비 완료')).toHaveCount(0);
    fault = null;
    await button(page, '다시 확인').click();
    await ready(page);
    await ctx.close();
    checked('Reject candidate with incorrect Worker ' + type + ' and recover via retry');
  }
  const ctx = await context();
  const first = await open(ctx);
  await ready(first);
  assert.equal(await first.evaluate(() => typeof window.__pulseDiagnostics), 'undefined', 'Production diagnostics must stay private');
  const present = await first.evaluate(async name => (await (await caches.open(name)).keys()).map(key => new URL(key.url).pathname), prefix + a.version);
  for (const entry of a.assets) assert(present.includes('/' + entry.path));
  await first.evaluate(async () => {
    for (const name of ['unrelated-app-cache', 'pulse-metronome-v3:%2Fother%2F:keep']) await caches.open(name);
    await navigator.serviceWorker.register('/other/sw.js', { scope: '/other/' });
  });
  checked('Every declared asset precached before first play');
  await offline(ctx, true);
  await first.reload();
  await ready(first);
  await play(first);
  await button(first, '정지').click();
  assert.equal(await first.evaluate(async () => (await fetch('/assets/missing.js')).status), 503);
  await offline(ctx, false);
  for (const url of ['/assets/missing.js', '/assets/missing.css', '/api', '/api/missing']) {
    assert.deepEqual(await first.evaluate(async url => { const r = await fetch(url); return [r.status, r.headers.get('content-type').includes('text/html')]; }, url), [404, false]);
  }
  checked('Offline cold reload, first play, advancing beat and stop; unavailable resources never return HTML');

  await first.evaluate(async ({ name, worker }) => {
    const cache = await caches.open(name);
    await cache.put(worker, new Response('<html>broken</html>', { headers: { 'Content-Type': 'text/html' } }));
  }, { name: prefix + a.version, worker: workerA });
  fault = { path: workerA, mime: 'text/javascript', bytes: '// wrong bytes' };
  assert.equal(await first.evaluate(async path => (await fetch(path)).status, workerA), 503);
  await expect(first.getByText('오프라인 준비를 완료하지 못했습니다.')).toBeVisible();
  assert.equal((await status(first)).ready, false);
  fault = null;
  await button(first, '다시 확인').click();
  await ready(first);
  assert.equal((await status(first)).ready, true);
  await first.evaluate(async name => (await caches.open(name)).delete('/index.html'), prefix + a.version);
  served = buildB;
  assert.equal((await status(first)).ready, false);
  served = buildA;
  assert.equal((await status(first)).ready, true);
  checked('Corrupt cached JS and missing index reject wrong digests, restore only correct release');

  const other = await open(ctx); await ready(other);
  await first.getByLabel('BPM 직접 입력').fill('93');
  await first.getByLabel('BPM 직접 입력').press('Enter');
  await play(other);
  fault = { path: asset(b, /schedulerWorker/), mime: 'text/html', bytes: '<html>missing</html>' };
  served = buildB; await update(first);
  await expect(first.getByText(/새 버전을 준비하지 못했습니다/)).toBeVisible({ timeout: 20000 });
  assert.equal((await status(other)).ready, true);
  fault = null; await changeBuild(first, buildB);
  const firstBuild = await first.locator('meta[name=pulse-build]').getAttribute('content');
  assert.equal(firstBuild, a.version);
  // Keep a real edit transaction open, then abort it after UPDATE was clicked.
  // Intermediate put successes cannot release the reload gate.
  await first.evaluate(() => {
    window.pulseTestCommit = 'hold';
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, ...rest) {
      const transaction = original.call(this, stores, mode, ...rest);
      if (mode === 'readwrite' && transaction.objectStoreNames.contains('operations') && window.pulseTestCommit === 'hold') {
        const store = transaction.objectStore('operations');
        function keepOpen() {
          const request = store.get('__pwa_test_delay__');
          request.onsuccess = () => {
            if (window.pulseTestCommit === 'abort') transaction.abort();
            else if (window.pulseTestCommit === 'hold') keepOpen();
          };
        }
        keepOpen();
      }
      return transaction;
    };
  });
  await first.getByLabel('BPM 직접 입력').fill('94'); await first.getByLabel('BPM 직접 입력').press('Enter');
  await button(first, '업데이트 적용').click();
  await expect(button(first, '적용 중…')).toBeDisabled();
  assert(await first.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting));
  await first.evaluate(() => { window.pulseTestCommit = 'abort'; });
  await expect(first.getByText(/저장을 완료하지 못했습니다. 현재 자료를 백업/)).toBeVisible();
  assert.equal(await first.locator('meta[name=pulse-build]').getAttribute('content'), a.version);
  await expect(first.getByLabel('BPM 직접 입력')).toHaveValue('94');
  await first.evaluate(() => { window.pulseTestCommit = 'release'; });
  checked('Pending IndexedDB transaction holds update; an actual abort keeps old shell and edited draft');
  await button(first, '업데이트 적용').click();
  await first.waitForFunction(v => document.querySelector('meta[name="pulse-build"]')?.content === v, b.version);
  await ready(first); await expect(first.getByLabel('BPM 직접 입력')).toHaveValue('94');
  await expect(button(other, '정지')).toBeVisible();
  await expect(button(other, '연습을 마치고 새 버전 열기')).toBeEnabled();
  await offline(ctx, true);
  await button(other, '정지').click();
  await play(other); await button(other, '정지').click();
  await play(first); await button(first, '정지').click();
  assert.equal((await status(other)).version, a.version);
  checked('Different Vite Worker and main hashes, old playing tab and new tab both start offline; no stuck update button');
  await offline(ctx, false);

  const devtools = await ctx.newCDPSession(first);
  await devtools.send('ServiceWorker.enable');
  await devtools.send('ServiceWorker.stopAllWorkers');
  assert.equal((await status(other)).ready, true);
  await changeBuild(first, buildC);
  await button(first, '업데이트 적용').click();
  await expect(first.getByText(/열린 메트로놈 탭에서/)).toBeVisible();
  assert.equal(await first.locator('meta[name=pulse-build]').getAttribute('content'), b.version);
  assert(await first.evaluate(async key => (await caches.keys()).includes(key), prefix + a.version));
  await other.close();
  const secondB = await open(ctx); await ready(secondB);
  await expect(button(secondB, '업데이트 적용')).toBeVisible();
  const clickTime = Date.now() + 350;
  await Promise.all([first, secondB].map(tab => button(tab, '업데이트 적용').evaluate((target, time) => {
    window.setTimeout(() => target.click(), Math.max(0, time - Date.now()));
  }, clickTime)));
  // Exactly one request needs to win. The other tab may stay on B until its user finishes.
  await expect.poll(async () => {
    return (await Promise.all([first, secondB].map(tab => tab.locator('meta[name=pulse-build]').getAttribute('content').catch(() => null)))).includes(c.version);
  }, { timeout: 20000 }).toBe(true);
  await expect(button(first, '적용 중…')).toHaveCount(0, { timeout: 18000 });
  await expect(button(secondB, '적용 중…')).toHaveCount(0, { timeout: 18000 });
  if (await first.locator('meta[name=pulse-build]').getAttribute('content') !== c.version) {
    await button(first, '연습을 마치고 새 버전 열기').click();
    await first.waitForFunction(v => document.querySelector('meta[name="pulse-build"]')?.content === v, c.version);
  }
  await secondB.close();
  await ready(first);
  await expect.poll(() => first.evaluate(async () => caches.keys())).not.toContain(prefix + a.version);
  const keys = await first.evaluate(async () => caches.keys());
  assert(keys.includes('unrelated-app-cache') && keys.includes('pulse-metronome-v3:%2Fother%2F:keep'));
  assert(await first.evaluate(async () => !!await navigator.serviceWorker.getRegistration('/other/')));
  checked('SW restart restores pinned A; third release waits, closes old cache only after tab exit, preserves unrelated scope');
  await ctx.close();

  served = buildLegacy;
  const legacy = await context();
  const oldFirst = await open(legacy); await ready(oldFirst);
  const oldSecond = await open(legacy); await ready(oldSecond);
  const [upgradeWorker] = await Promise.all([legacy.waitForEvent('serviceworker'), changeBuild(oldFirst, buildA)]);
  const blocked = await oldFirst.evaluate(async () => {
    const waiting = (await navigator.serviceWorker.getRegistration()).waiting;
    const channel = new MessageChannel();
    const response = new Promise(resolve => channel.port1.onmessage = event => resolve(event.data.outcome));
    waiting.postMessage({ type: 'PULSE_APPLY_UPDATE', requestId: 'legacy-check' }, [channel.port2]);
    return response;
  });
  assert.equal(blocked, 'blocked');
  await button(oldFirst, '업데이트 적용').click();
  await expect(button(oldFirst, '적용 중…')).toBeDisabled();
  assert.equal(await oldSecond.locator('meta[name=pulse-build]').count(), 0);
  await oldFirst.close(); await oldSecond.close();
  // Observe natural activation from the SW target, without opening a third legacy client during the transition.
  await expect.poll(() => upgradeWorker.evaluate(() => self.registration.active?.state === 'activated' && !self.registration.waiting), { timeout: 20000 }).toBe(true);
  const fresh = await open(legacy);
  await expect(fresh.locator('meta[name=pulse-build]')).toHaveAttribute('content', a.version);
  await ready(fresh); await offline(legacy, true); await fresh.reload(); await ready(fresh);
  await play(fresh); await button(fresh, '정지').click(); await offline(legacy, false);
  await legacy.close();
  checked('Unmodified legacy release cannot force activation with old windows; closing both permits verified offline cold start');
  assert.deepEqual(report.errors, []);
  report.result = 'PASS';
} catch (error) { report.result = 'FAIL'; report.failure = String(error.stack); throw error; }
finally {
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  console.log(`PWA verification ${report.result}: ${evidence}/report.json`);
}
