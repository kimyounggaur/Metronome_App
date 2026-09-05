import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BpmDisplay } from "../components/BpmDisplay";
import { TransportBar } from "../components/TransportBar";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useTapTempo } from "../hooks/useTapTempo";

beforeAll(() => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(type: string, options: PointerEventInit = {}) {
      super(type, options);
      this.pointerId = options.pointerId ?? 1;
      this.isPrimary = options.isPrimary ?? true;
    }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const signature = { beats: 4, noteValue: 4 } as const;

function BpmHarness() {
  const [bpm, setBpm] = useState(120);
  return <><BpmDisplay bpm={bpm} timeSignature={signature} onSetBpm={setBpm} /><output>{bpm}</output></>;
}

describe("BPM editing and dragging", () => {
  it("tracks every external BPM change outside editing and preserves drafts while editing", () => {
    const onSetBpm = vi.fn();
    const view = render(<BpmDisplay bpm={120} timeSignature={signature} onSetBpm={onSetBpm} />);
    const input = screen.getByLabelText("BPM 직접 입력");
    for (const bpm of [121, 116, 90, 180, 60, 300]) {
      view.rerender(<BpmDisplay bpm={bpm} timeSignature={signature} onSetBpm={onSetBpm} />);
      expect(input).toHaveValue(String(bpm));
    }
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "93" } });
    view.rerender(<BpmDisplay bpm={200} timeSignature={signature} onSetBpm={onSetBpm} />);
    expect(input).toHaveValue("93");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSetBpm).toHaveBeenCalledExactlyOnceWith(93);
  });

  it.each([["999", 300], ["20", 30], ["132.7", 133], [" 90 ", 90]])("commits %s as %s on Enter", (draft, expected) => {
    render(<BpmHarness />);
    const input = screen.getByLabelText("BPM 직접 입력");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: draft } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue(String(expected));
    expect(screen.getByRole("status")).toHaveTextContent(String(expected));
  });

  it.each(["", "  ", "abc", "12bpm", "Infinity"])("restores the last valid value for invalid draft %j", (draft) => {
    render(<BpmHarness />);
    const input = screen.getByLabelText("BPM 직접 입력");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: draft } });
    fireEvent.blur(input);
    expect(input).toHaveValue("120");
    expect(screen.getByRole("status")).toHaveTextContent("120");
  });

  it("Escape cancels without a following blur recommitting the draft", () => {
    render(<BpmHarness />);
    const input = screen.getByLabelText("BPM 직접 입력");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(input).toHaveValue("120");
  });

  it("Escape restores the edit-start value after an external change", () => {
    const onSetBpm = vi.fn();
    const view = render(<BpmDisplay bpm={120} timeSignature={signature} onSetBpm={onSetBpm} />);
    const input = screen.getByLabelText("BPM 직접 입력");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "99" } });
    view.rerender(<BpmDisplay bpm={140} timeSignature={signature} onSetBpm={onSetBpm} />);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSetBpm).toHaveBeenCalledExactlyOnceWith(120);
  });

  it.each(["pointerCancel", "lostPointerCapture"] as const)("distinguishes taps, clamps a drag, and rolls back on %s", (cancel) => {
    render(<BpmHarness />);
    const input = screen.getByLabelText("BPM 직접 입력");
    fireEvent.pointerDown(input, { clientY: 200, pointerId: 2 });
    fireEvent.pointerMove(input, { clientY: 195, pointerId: 2 });
    expect(input).toHaveValue("120");
    fireEvent.pointerMove(input, { clientY: -3000, pointerId: 2 });
    expect(input).toHaveValue("300");
    fireEvent[cancel](input, { pointerId: 2 });
    expect(input).toHaveValue("120");
    fireEvent.pointerMove(input, { clientY: 250, pointerId: 2 });
    expect(input).toHaveValue("120");
  });

  it("keeps a completed drag at its clamped value", () => {
    render(<BpmHarness />);
    const input = screen.getByLabelText("BPM 직접 입력");
    fireEvent.pointerDown(input, { clientY: 100 });
    fireEvent.pointerMove(input, { clientY: 3000 });
    fireEvent.pointerUp(input);
    fireEvent.lostPointerCapture(input);
    expect(input).toHaveValue("30");
  });
});

function transport(onNudge: (delta: number) => void) {
  return <TransportBar bpm={120} isPlaying={false} onNudge={onNudge} onSetBpm={vi.fn()} onTap={vi.fn()} onToggle={vi.fn()} />;
}

describe("native and repeated button activation", () => {
  it("runs a pointer activation once and supports click-only keyboard/assistive activation", () => {
    const onNudge = vi.fn();
    render(transport(onNudge));
    const button = screen.getByRole("button", { name: "BPM 1 증가" });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    fireEvent.click(button, { detail: 1 });
    expect(onNudge).toHaveBeenCalledExactlyOnceWith(1);
    fireEvent.click(button, { detail: 0 });
    expect(onNudge).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "BPM 5 감소" }), { detail: 0 });
    expect(onNudge).toHaveBeenLastCalledWith(-5);
  });

  it("repeats starting at 360ms and reads the latest callback", () => {
    vi.useFakeTimers();
    const initial = vi.fn();
    const latest = vi.fn();
    const view = render(transport(initial));
    fireEvent.pointerDown(screen.getByRole("button", { name: "BPM 1 증가" }));
    act(() => vi.advanceTimersByTime(359));
    expect(initial).toHaveBeenCalledTimes(1);
    view.rerender(transport(latest));
    act(() => vi.advanceTimersByTime(1));
    expect(latest).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(160));
    expect(latest).toHaveBeenCalledTimes(3);
    fireEvent.blur(window);
    act(() => vi.advanceTimersByTime(1000));
    expect(latest).toHaveBeenCalledTimes(3);
  });

  it.each(["pointerUp", "pointerCancel", "pointerLeave", "lostPointerCapture", "blur"] as const)("stops repeated changes after %s", (stopEvent) => {
    vi.useFakeTimers();
    const onNudge = vi.fn();
    render(transport(onNudge));
    const button = screen.getByRole("button", { name: "BPM 1 증가" });
    fireEvent.pointerDown(button);
    fireEvent[stopEvent](button);
    act(() => vi.advanceTimersByTime(1000));
    expect(onNudge).toHaveBeenCalledTimes(1);
  });

  it("stops on hidden documents and removes timers on unmount", () => {
    vi.useFakeTimers();
    const onNudge = vi.fn();
    const view = render(transport(onNudge));
    const button = screen.getByRole("button", { name: "BPM 1 증가" });
    fireEvent.pointerDown(button);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(1000));
    expect(onNudge).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(button);
    view.unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(onNudge).toHaveBeenCalledTimes(2);
  });
});

describe("keyboard shortcuts and tap collection", () => {
  it("lets an open native dialog own keyboard behavior, including Escape", () => {
    const handlers = { onToggle: vi.fn(), onTap: vi.fn(), onNudge: vi.fn(), onCloseSheet: vi.fn(), onHelp: vi.fn() };
    function NativeDialog() {
      useKeyboardShortcuts(handlers);
      return <dialog open><h2 tabIndex={-1}>대화상자</h2></dialog>;
    }
    render(<NativeDialog />);
    const title = screen.getByRole("heading");
    for (const key of ["Escape", "t", "ArrowUp"]) expect(fireEvent.keyDown(title, { key })).toBe(true);
    expect(fireEvent.keyDown(title, { key: " ", code: "Space" })).toBe(true);
    expect(handlers.onToggle).not.toHaveBeenCalled();
    expect(handlers.onTap).not.toHaveBeenCalled();
    expect(handlers.onNudge).not.toHaveBeenCalled();
    expect(handlers.onCloseSheet).not.toHaveBeenCalled();
  });

  it("preserves interactive key behavior and ignores repeats/modifier chords", () => {
    const handlers = { onToggle: vi.fn(), onTap: vi.fn(), onNudge: vi.fn(), onCloseSheet: vi.fn(), onHelp: vi.fn() };
    function Shortcuts() {
      useKeyboardShortcuts(handlers);
      return <><button>기본 버튼</button><a href="#test">링크</a><input aria-label="편집" /><div contentEditable suppressContentEditableWarning>내용</div><div role="slider" tabIndex={0}>슬라이더</div></>;
    }
    render(<Shortcuts />);
    for (const element of [screen.getByRole("button"), screen.getByRole("link"), screen.getByLabelText("편집"), screen.getByText("내용"), screen.getByRole("slider")]) {
      expect(fireEvent.keyDown(element, { key: " ", code: "Space" })).toBe(true);
      fireEvent.keyDown(element, { key: "t" });
    }
    for (const options of [{ repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) fireEvent.keyDown(document.body, { key: " ", code: "Space", ...options });
    expect(handlers.onToggle).not.toHaveBeenCalled();
    expect(handlers.onTap).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(document.body, { key: " ", code: "Space" })).toBe(false);
    expect(handlers.onToggle).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "ArrowUp", shiftKey: true });
    expect(handlers.onNudge).toHaveBeenCalledWith(5);
  });

  it("shows accepted tap count, rejects duplicates, and clears stale collection", () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const onBpm = vi.fn();
    const hook = renderHook(() => useTapTempo(onBpm));
    act(() => { hook.result.current(); });
    expect(hook.result.current.tapCount).toBe(1);
    act(() => { now = 40; hook.result.current(); });
    expect(hook.result.current.tapCount).toBe(1);
    for (const timestamp of [500, 1000, 1500]) act(() => { now = timestamp; hook.result.current(); });
    expect(hook.result.current.tapCount).toBe(4);
    expect(onBpm).toHaveBeenCalledExactlyOnceWith(120);
    act(() => vi.advanceTimersByTime(2300));
    expect(hook.result.current.tapCount).toBe(0);
  });
});
