import { StrictMode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultData, createPreset } from "../domain/presets";
import { SETTINGS_SAVE_DELAY_MS, usePulseStorage } from "../hooks/usePulseStorage";
import { openPulseDb, readSnapshot } from "../storage/pulseDb";
import { PULSE_DATA_KEY } from "../storage/pulseStorage";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function saved() {
  const db = await openPulseDb();
  try { return await readSnapshot(db); } finally { db.close(); }
}

async function mount() {
  const hook = renderHook(() => usePulseStorage(), { wrapper: StrictMode });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
}

describe("settings persistence batching", () => {
  it("coalesces a 60-step drag into one revision without delaying memory or backup", async () => {
    const { result } = await mount();
    const before = await saved();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => {
      for (let bpm = 181; bpm <= 240; bpm++) result.current.setSettings((current) => ({ ...current, bpm }));
    });
    expect(result.current.settings.bpm).toBe(240);
    expect(JSON.parse(result.current.exportJson()).settings.bpm).toBe(240);
    expect(result.current.hasPendingSave).toBe(true);
    act(() => vi.advanceTimersByTime(SETTINGS_SAVE_DELAY_MS - 1));
    expect((await saved()).revision).toBe(before.revision);
    await act(async () => {
      vi.advanceTimersByTime(1);
      expect(await result.current.flush()).toBe(true);
    });
    expect((await saved()).data.settings.bpm).toBe(240);
    expect((await saved()).revision).toBe(before.revision + 1);
    expect(result.current.hasPendingSave).toBe(false);
  });

  it.each(["pointerup", "focusout"])("commits final input after %s", async (eventName) => {
    const { result } = await mount();
    const input = document.createElement("input");
    document.body.append(input);
    try {
      await act(async () => {
        result.current.setSettings((current) => ({ ...current, bpm: 145 }));
        input.dispatchEvent(new Event(eventName, { bubbles: true }));
        result.current.setSettings((current) => ({ ...current, bpm: 146 }));
      });
      await waitFor(() => expect(result.current.hasPendingSave).toBe(false));
      expect((await saved()).data.settings.bpm).toBe(146);
    } finally { input.remove(); }
  });

  it("includes pending settings with a preset save", async () => {
    const { result } = await mount();
    await act(async () => {
      result.current.setSettings((current) => ({ ...current, bpm: 99 }));
      expect(await result.current.setData((current) => ({
        ...current, presets: [createPreset(current.settings, "저장")],
      }))).toBe(true);
    });
    const data = (await saved()).data;
    expect(data.settings.bpm).toBe(99);
    expect(data.presets[0].bpm).toBe(99);
  });

  it("prevents a pending settings edit from overwriting a completed import", async () => {
    const { result } = await mount();
    const incoming = createDefaultData();
    incoming.settings.bpm = 78;
    await act(async () => {
      result.current.setSettings((current) => ({ ...current, bpm: 144 }));
      expect(await result.current.importData(incoming, "replace")).toBe(true);
      expect(await result.current.flush()).toBe(true);
    });
    expect((await saved()).data.settings.bpm).toBe(78);
  });

  it("preserves recovery originals while allowing memory practice", async () => {
    localStorage.setItem(PULSE_DATA_KEY, "corrupt-original");
    const { result } = await mount();
    await act(async () => {
      result.current.setSettings((current) => ({ ...current, bpm: 89 }));
      expect(await result.current.flush()).toBe(false);
    });
    expect(result.current.settings.bpm).toBe(89);
    expect(localStorage.getItem(PULSE_DATA_KEY)).toBe("corrupt-original");
  });

  it("starts the pending commit on pagehide", async () => {
    const { result } = await mount();
    act(() => {
      result.current.setSettings((current) => ({ ...current, bpm: 123 }));
      window.dispatchEvent(new Event("pagehide"));
    });
    await waitFor(() => expect(result.current.hasPendingSave).toBe(false));
    expect((await saved()).data.settings.bpm).toBe(123);
  });
});
