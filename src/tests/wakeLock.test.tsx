import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "../hooks/useWakeLock";

class Sentinel extends EventTarget {
  released = false;
  release = vi.fn(async () => { this.released = true; this.dispatchEvent(new Event("release")); });
}
function setup() {
  let hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  const sentinels: Sentinel[] = [];
  const request = vi.fn(async () => { const item = new Sentinel(); sentinels.push(item); return item; });
  vi.stubGlobal("navigator", { wakeLock: { request } });
  return { request, sentinels, visibility(value: boolean) { hidden = value; fireEvent(document, new Event("visibilitychange")); } };
}
async function settle() { await act(async () => { await Promise.resolve(); }); }
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("screen wake lock lifecycle", () => {
  it("acquires only while active and visible and releases on stop/unmount", async () => {
    const mock = setup();
    const view = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: false } });
    await settle();
    expect(mock.request).not.toHaveBeenCalled();
    view.rerender({ active: true });
    await settle();
    expect(mock.request).toHaveBeenCalledTimes(1);
    act(() => mock.visibility(false));
    await settle();
    expect(mock.request).toHaveBeenCalledTimes(1);
    view.rerender({ active: false });
    await settle();
    expect(mock.sentinels[0].release).toHaveBeenCalledTimes(1);
    view.rerender({ active: true });
    await settle();
    view.unmount();
    expect(mock.sentinels[1].release).toHaveBeenCalledTimes(1);
  });

  it("reacquires after hidden/visible and one unexpected release without duplicate requests", async () => {
    vi.useFakeTimers();
    const mock = setup();
    renderHook(() => useWakeLock(true));
    await settle();
    act(() => mock.visibility(true));
    await settle();
    expect(mock.sentinels[0].released).toBe(true);
    act(() => { mock.visibility(false); mock.visibility(false); });
    await settle();
    expect(mock.request).toHaveBeenCalledTimes(2);
    await act(async () => { await mock.sentinels[1].release(); });
    await act(async () => { vi.advanceTimersByTime(750); await Promise.resolve(); });
    expect(mock.request).toHaveBeenCalledTimes(3);
    await act(async () => { await mock.sentinels[2].release(); });
    await act(async () => { vi.advanceTimersByTime(5000); await Promise.resolve(); });
    expect(mock.request).toHaveBeenCalledTimes(3);
  });

  it("discards late request results and reconciles a rapid stop/start", async () => {
    const mock = setup();
    let resolve!: (sentinel: Sentinel) => void;
    mock.request.mockImplementationOnce(() => new Promise<Sentinel>(done => { resolve = done; }));
    const view = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } });
    view.rerender({ active: false });
    view.rerender({ active: true });
    expect(mock.request).toHaveBeenCalledTimes(1);
    const late = new Sentinel();
    await act(async () => { resolve(late); await Promise.resolve(); });
    await settle();
    expect(late.released).toBe(true);
    expect(mock.request).toHaveBeenCalledTimes(2);
  });

  it("keeps failures optional and retries only after a visibility opportunity", async () => {
    const mock = setup();
    mock.request.mockRejectedValueOnce(new Error("Power policy"));
    renderHook(() => useWakeLock(true));
    await settle();
    expect(mock.request).toHaveBeenCalledTimes(1);
    act(() => mock.visibility(false));
    await settle();
    expect(mock.request).toHaveBeenCalledTimes(2);
  });
});
