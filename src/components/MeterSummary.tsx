import { groupedBeatIndexes } from "../domain/rhythm";
import type { TempoUnit, TimeSignature } from "../domain/types";
import { tempoUnitLabels } from "./BpmDisplay";

export function MeterSummary({ bpm, timeSignature, tempoUnit, beatGroups }: {
  bpm: number; timeSignature: TimeSignature; tempoUnit: TempoUnit; beatGroups?: number[];
}) {
  const groups = groupedBeatIndexes(timeSignature, beatGroups);
  const parts = [`${tempoUnitLabels[tempoUnit]} = ${bpm}`];
  if (timeSignature.noteValue === 8 && groups.length > 1) {
    parts.push(groups.every(group => group.length === 3)
      ? `큰박 ${groups.length}개`
      : `그룹 ${groups.map(group => group.length).join("+")}칸`);
  }
  parts.push(`${timeSignature.noteValue}분음표 ${timeSignature.beats}칸`);
  return <p className="text-sm text-[color:var(--muted)]">{parts.join(" · ")}</p>;
}
