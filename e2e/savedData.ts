import type { Page } from "@playwright/test";

export function readSavedData(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/src/storage/pulseDb.ts";
    const { openPulseDb, readSnapshot } = await import(modulePath);
    const db = await openPulseDb();
    try {
      return (await readSnapshot(db)).data;
    } finally {
      db.close();
    }
  });
}

export async function failStorageWrites(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.addEventListener("restore-test-idb", () => { IDBObjectStore.prototype.put = put; }, { once: true });
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === "pulse-metronome") {
        throw new DOMException("Storage is full", "QuotaExceededError");
      }
      return Reflect.apply(put, this, args);
    };
  });
  return () => page.evaluate(() => window.dispatchEvent(new Event("restore-test-idb")));
}
