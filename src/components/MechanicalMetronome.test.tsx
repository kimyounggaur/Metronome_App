import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MechanicalMetronome } from "./MechanicalMetronome";
import type { AccentLevel, BeatEvent } from "../domain/types";

function beatEvent(overrides: Partial<BeatEvent> = {}): BeatEvent {
  return {
    beatIndex: 1,
    subIndex: 0,
    barIndex: 0,
    time: 0,
    phase: "main",
    isAudible: true,
    isGapMuted: false,
    accent: "normal",
    countInRemainingBeats: 0,
    ...overrides,
  };
}

describe("MechanicalMetronome", () => {
  it("renders a mechanical metronome with tempo scale, pendulum state, and beat controls", () => {
    const onSetBpm = vi.fn();
    const onCycleAccent = vi.fn();
    const accents: AccentLevel[] = ["strong", "normal", "soft", "mute"];

    render(
      <MechanicalMetronome
        bpm={120}
        timeSignature={{ beats: 4, noteValue: 4 }}
        event={beatEvent()}
        pulseId={3}
        accents={accents}
        onSetBpm={onSetBpm}
        onCycleAccent={onCycleAccent}
      />,
    );

    expect(screen.getByRole("region", { name: "기계식 메트로놈" })).toBeInTheDocument();
    expect(screen.getByText("Allegro")).toBeInTheDocument();
    expect(screen.getByText("4/4")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("208")).toBeInTheDocument();
    expect(screen.getByLabelText("현재 BPM 120")).toHaveAttribute("aria-current", "true");
    expect(screen.getByLabelText("진자")).toHaveAttribute("data-swing-side", "right");

    fireEvent.click(screen.getByRole("button", { name: "3박 악센트 약하게 변경" }));
    expect(onCycleAccent).toHaveBeenCalledWith(2);

    fireEvent.change(screen.getByLabelText("BPM 직접 입력"), { target: { value: "132" } });
    fireEvent.blur(screen.getByLabelText("BPM 직접 입력"));
    expect(onSetBpm).toHaveBeenCalledWith(132);
  });
});
