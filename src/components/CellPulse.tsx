import { memo } from "react";

/** A small stationary cue alternates even when the next cell has the same number. */
export const CellPulse = memo(function CellPulse({ pulseId, visible }: { pulseId: number; visible: boolean }) {
  return (
    <span className="cell-pulse" aria-hidden="true">
      {[0, 1].map(side => (
        <span key={side} className={visible && pulseId > 0 && pulseId % 2 === side ? "cell-pulse-on" : ""} />
      ))}
    </span>
  );
});
