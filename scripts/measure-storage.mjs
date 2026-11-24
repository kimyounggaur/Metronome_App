import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { largeBackupFixture } from "./refactor-fixtures.mjs";

const name = process.argv[2] ?? "storage";
const url = process.argv[3] ?? "http://127.0.0.1:4173/";
const sampleCount = Math.max(2, Number(process.env.PULSE_MEASURE_COUNT ?? 100));
const repeats = Math.max(1, Number(process.env.PULSE_MEASURE_REPEATS ?? 3));
const interval = 300;

function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
}

const browser = await chromium.launch();
const runs = [];
try {
  for (let repetition = 1; repetition <= repeats; repetition++) {
    for (const size of ["empty", "large"]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      try {
        const page = await context.newPage();
        if (size === "large") {
          await page.addInitScript((seed) => {
            if (!localStorage.getItem("pulse:data:v2")) localStorage.setItem("pulse:data:v2", JSON.stringify(seed));
          }, largeBackupFixture());
        }
        await page.goto(url);
        const bpm = page.getByLabel("BPM 직접 입력");
        await bpm.waitFor();
        await page.evaluate(() => {
          const measurements = { keys: [], commits: [] };
          window.pulseStorageMeasurement = measurements;
          window.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            const startedAt = performance.now();
            // Register during capture so the bubble listener follows even a re-mounted app handler.
            window.addEventListener("keydown", () => {
              measurements.keys.push(performance.now() - startedAt);
            }, { once: true });
          }, true);
          const beginTransaction = IDBDatabase.prototype.transaction;
          IDBDatabase.prototype.transaction = function (...args) {
            const tx = Reflect.apply(beginTransaction, this, args);
            if (this.name === "pulse-metronome" && tx.mode === "readwrite") {
              const start = performance.now();
              tx.addEventListener("complete", () => measurements.commits.push(performance.now() - start), { once: true });
            }
            return tx;
          };
        });

        for (let i = 0; i <= sampleCount; i++) {
          await page.keyboard.press(i % 2 === 0 ? "ArrowUp" : "ArrowDown");
          await page.waitForTimeout(interval);
        }
        const keyboardBpm = await bpm.inputValue();
        if (Number(keyboardBpm) !== 120 + (sampleCount + 1) % 2) throw new Error(`Unexpected final keyboard BPM: ${keyboardBpm}`);
        const slider = page.getByLabel("BPM 슬라이더");
        await slider.scrollIntoViewIfNeeded();
        const bounds = await slider.boundingBox();
        const y = bounds.y + bounds.height / 2;
        await page.mouse.move(bounds.x + 2, y);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width - 2, y, { steps: 60 });
        await page.mouse.up();
        await page.waitForTimeout(interval);
        const finalBpm = await bpm.inputValue();
        const { keys, commits } = await page.evaluate(() => window.pulseStorageMeasurement);
        if (keys.length !== sampleCount + 1) throw new Error(`Expected ${sampleCount + 1} keys, received ${keys.length}`);
        await page.reload();
        await bpm.waitFor();
        const savedBpm = await bpm.inputValue();
        if (finalBpm !== savedBpm) throw new Error(`BPM was ${finalBpm} before reload and ${savedBpm} after`);
        if (!commits.length) throw new Error("No IndexedDB writes completed during measurement");
        const samples = keys.slice(1);
        const result = {
          repetition, size, samples: samples.length, inputMedianMs: percentile(samples, 0.5),
          inputP95Ms: percentile(samples, 0.95), commits: commits.length,
          commitMedianMs: commits.length ? percentile(commits, 0.5) : null, keyboardBpm, finalBpm, savedBpm,
        };
        runs.push(result);
        console.log(JSON.stringify(result));
      } finally { await context.close(); }
    }
  }
  const targetMet = runs.filter((run) => run.size === "large")
    .every((run) => run.inputMedianMs <= 8 && run.inputP95Ms <= 16);
  await mkdir("output/playwright", { recursive: true });
  await writeFile(`output/playwright/${name}.json`, JSON.stringify({
    browser: browser.version(), node: process.version, url, interval, transport: "idle", targetMet, runs,
  }, null, 2));
} finally { await browser.close(); }
