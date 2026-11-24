import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const base = JSON.parse(readFileSync(new URL("../docs/backup-example.json", import.meta.url), "utf8"));
const fixedDate = "2026-11-24T00:00:00.000Z";

function fixtureId(kind, index) {
  return `00000000-0000-4000-800${kind}-${index.toString(16).padStart(12, "0")}`;
}

// The dates and UUID widths match the historic fixture, making its UTF-8 byte sizes reproducible.
function preset(settings, index, name) {
  const { bpm, tempoUnit, beatGroups, timeSignature, subdivision, accents, sound, volume, practice } = settings;
  return {
    id: fixtureId(1, index), name, bpm, tempoUnit, beatGroups, timeSignature, subdivision,
    accents, sound, volume, practice, createdAt: fixedDate, updatedAt: fixedDate,
  };
}

export function smallBackupFixture() {
  const data = structuredClone(base);
  const first = preset(data.settings, 0, "봄 노래");
  const second = preset(data.settings, 1, "가을 노래");
  data.presets = [first, second];
  const list = {
    id: fixtureId(2, 0), name: "합주 순서",
    items: [first, second, first].map((song, index) => ({ id: fixtureId(3, index), presetId: song.id })),
  };
  data.setlists = [list];
  data.navigation = { activePresetId: first.id, activeSetlistId: list.id, activeItemIndex: 2 };
  return data;
}

export function largeBackupFixture(listCount = 25) {
  if (![25, 37, 38].includes(listCount)) throw new RangeError("Use 25, 37 or 38 setlists");
  const data = structuredClone(base);
  data.presets = Array.from({ length: 500 }, (_, index) => preset(data.settings, index, `연습 ${index}`));
  const reversed = data.presets.toReversed();
  data.setlists = Array.from({ length: listCount }, (_, listIndex) => ({
    id: fixtureId(2, listIndex), name: `셋리스트 ${listIndex}`,
    items: reversed.map((song, index) => ({ id: fixtureId(3, listIndex * 500 + index), presetId: song.id })),
  }));
  if (listCount === 38) {
    // The baseline app created and selected the 38th setlist with its own UI.
    const last = data.setlists.at(-1);
    last.name = "셋리스트 38";
    data.navigation = { activePresetId: last.items[0].presetId, activeSetlistId: last.id, activeItemIndex: 0 };
  }
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const data of [smallBackupFixture(), ...[25, 37, 38].map(largeBackupFixture)]) {
    console.log(JSON.stringify({
      presets: data.presets.length, setlists: data.setlists.length,
      compactBytes: Buffer.byteLength(JSON.stringify(data)),
      prettyBytes: Buffer.byteLength(JSON.stringify(data, null, 2)),
    }));
  }
}
