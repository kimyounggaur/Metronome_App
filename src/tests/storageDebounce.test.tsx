import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultData, createPreset } from "../domain/presets";
import { SETTINGS_SAVE_DELAY_MS, usePulseStorage } from "../hooks/usePulseStorage";
import { PULSE_DATA_KEY, SAVE_FAILURE } from "../storage/pulseStorage";

beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("settings persistence batching", () => {
  it("coalesces a 60-step drag into one write without delaying memory or backup", () => {
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => usePulseStorage());
    act(() => { for (let bpm = 181; bpm <= 240; bpm++) result.current.setSettings((current) => ({ ...current, bpm })); });
    expect(result.current.settings.bpm).toBe(240); expect(JSON.parse(result.current.exportJson()).settings.bpm).toBe(240); expect(result.current.hasPendingSave).toBe(true); expect(writes).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SETTINGS_SAVE_DELAY_MS - 1)); expect(writes).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1)); expect(writes).toHaveBeenCalledTimes(1); expect(JSON.parse(localStorage.getItem(PULSE_DATA_KEY)!).settings.bpm).toBe(240); expect(result.current.hasPendingSave).toBe(false);
  });
  it("restarts the short delay while a user continues editing", () => {
    const writes = vi.spyOn(Storage.prototype, "setItem"); const { result } = renderHook(() => usePulseStorage());
    act(() => result.current.setSettings((current) => ({ ...current, bpm: 100 })));
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.setSettings((current) => ({ ...current, bpm: 101 })));
    act(() => vi.advanceTimersByTime(100)); expect(writes).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(80)); expect(writes).toHaveBeenCalledTimes(1); expect(JSON.parse(localStorage.getItem(PULSE_DATA_KEY)!).settings.bpm).toBe(101);
  });
  it.each(["pointerup", "focusout"])("flushes the final committed input value after %s", async (eventName) => {
    const writes = vi.spyOn(Storage.prototype, "setItem"); const { result } = renderHook(() => usePulseStorage()); const input = document.createElement("input"); document.body.append(input);
    try {
      await act(async () => {
        result.current.setSettings((current) => ({ ...current, bpm: 145 }));
        input.dispatchEvent(new Event(eventName, { bubbles: true }));
        result.current.setSettings((current) => ({ ...current, bpm: 146 }));
        await Promise.resolve();
      });
      expect(writes).toHaveBeenCalledTimes(1); expect(JSON.parse(localStorage.getItem(PULSE_DATA_KEY)!).settings.bpm).toBe(146); expect(result.current.hasPendingSave).toBe(false);
      act(() => vi.runAllTimers()); expect(writes).toHaveBeenCalledTimes(1);
    } finally { input.remove(); }
  });
  it("persists generic preset/list transactions immediately with pending settings included", () => {
    const writes = vi.spyOn(Storage.prototype, "setItem"); const { result } = renderHook(() => usePulseStorage());
    act(() => result.current.setSettings((current) => ({ ...current, bpm: 99 })));
    act(() => result.current.setData((current) => ({ ...current, presets: [createPreset(current.settings, "저장")] })));
    expect(writes).toHaveBeenCalledTimes(1); const saved = JSON.parse(localStorage.getItem(PULSE_DATA_KEY)!); expect(saved.settings.bpm).toBe(99); expect(saved.presets[0].bpm).toBe(99); expect(result.current.hasPendingSave).toBe(false);
    act(() => vi.runAllTimers()); expect(writes).toHaveBeenCalledTimes(1);
  });
  it("cancels stale settings saves after a successful atomic import", () => {
    const writes = vi.spyOn(Storage.prototype, "setItem"); const { result } = renderHook(() => usePulseStorage()); const incoming = createDefaultData(); incoming.settings.bpm = 78;
    act(() => result.current.setSettings((current) => ({ ...current, bpm: 144 })));
    act(() => { expect(result.current.importData(incoming, "replace")).toBe(true); });
    act(() => vi.runAllTimers()); expect(writes).toHaveBeenCalledTimes(1); expect(JSON.parse(localStorage.getItem(PULSE_DATA_KEY)!).settings.bpm).toBe(78); expect(result.current.hasPendingSave).toBe(false);
  });
  it("keeps pending data and reports false on failed flush, then allows retry", () => {
    const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); }); const { result } = renderHook(() => usePulseStorage());
    act(() => result.current.setSettings((current) => ({ ...current, bpm: 88 })));
    act(() => vi.advanceTimersByTime(SETTINGS_SAVE_DELAY_MS)); expect(result.current.storageError).toBe(SAVE_FAILURE); expect(result.current.hasPendingSave).toBe(true);
    act(() => { expect(result.current.flush()).toBe(false); }); expect(result.current.settings.bpm).toBe(88);
    writes.mockRestore(); act(() => { expect(result.current.flush()).toBe(true); }); expect(result.current.storageError).toBeNull(); expect(result.current.hasPendingSave).toBe(false); expect(JSON.parse(localStorage.getItem(PULSE_DATA_KEY)!).settings.bpm).toBe(88);
  });
  it("preserves recovery originals and blocks reload flush while edits are memory-only", () => {
    localStorage.setItem(PULSE_DATA_KEY, "corrupt-original"); const writes = vi.spyOn(Storage.prototype, "setItem"); const { result } = renderHook(() => usePulseStorage());
    act(() => result.current.setSettings((current) => ({ ...current, bpm: 89 })));
    act(() => { expect(result.current.flush()).toBe(false); }); act(() => vi.runAllTimers()); expect(writes).not.toHaveBeenCalled(); expect(localStorage.getItem(PULSE_DATA_KEY)).toBe("corrupt-original"); expect(result.current.hasPendingSave).toBe(true);
  });
  it("flushes latest settings on pagehide and cleanup without leaving timers", () => {
    const writes = vi.spyOn(Storage.prototype, "setItem"); const { result, unmount } = renderHook(() => usePulseStorage(), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });
    act(() => result.current.setSettings((current) => ({ ...current, bpm: 123 })));
    act(() => window.dispatchEvent(new Event("pagehide"))); expect(writes).toHaveBeenCalledTimes(1); expect(result.current.hasPendingSave).toBe(false);
    act(() => result.current.setSettings((current) => ({ ...current, bpm: 124 })));
    unmount(); expect(writes).toHaveBeenCalledTimes(2); expect(JSON.parse(localStorage.getItem(PULSE_DATA_KEY)!).settings.bpm).toBe(124);
    act(() => vi.runAllTimers()); expect(writes).toHaveBeenCalledTimes(2);
  });
});
