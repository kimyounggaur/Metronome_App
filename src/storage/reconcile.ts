import type { PulseData } from "../domain/types";

export class StorageConflict extends Error {
  constructor(path: string, latest?: unknown, draft?: unknown) {
    const display = (value: unknown) => (JSON.stringify(value) ?? "삭제됨").slice(0, 220);
    super(`다른 탭과 충돌했습니다. ${path}\n기기에 저장된 값: ${display(latest)}\n내 초안: ${display(draft)}`);
    this.name = "StorageConflict";
  }
}

export const equalValue = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeValue(base: unknown, draft: unknown, latest: unknown, path: string): unknown {
  if (equalValue(base, draft)) return latest;
  if (equalValue(latest, base) || equalValue(draft, latest)) return draft;
  if (record(base) && record(draft) && record(latest)) {
    const result = { ...latest };
    for (const key of new Set([...Object.keys(base), ...Object.keys(draft)])) {
      if (key === "updatedAt" && typeof latest[key] === "string" && typeof draft[key] === "string") {
        result[key] = latest[key] > draft[key] ? latest[key] : draft[key];
      } else {
        const value = mergeValue(base[key], draft[key], latest[key], path + "." + key);
        if (value === undefined) delete result[key];
        else result[key] = value;
      }
    }
    return result;
  }
  throw new StorageConflict(path, latest, draft);
}

function mergeEntities<T extends { id: string }>(base: T[], draft: T[], latest: T[], path: string): T[] {
  if (base === draft) return latest;
  const before = new Map(base.map((item) => [item.id, item]));
  const edits = new Map(draft.map((item) => [item.id, item]));
  const result = new Map(latest.map((item) => [item.id, item]));
  for (const id of new Set([...before.keys(), ...edits.keys()])) {
    const merged = mergeValue(before.get(id), edits.get(id), result.get(id), path + "." + id) as T | undefined;
    if (merged) result.set(id, merged);
    else result.delete(id);
  }
  const retained = (source: T[]) =>
    source.map((item) => item.id).filter((id) => before.has(id) && edits.has(id) && result.has(id));
  const changedOrder = !equalValue(retained(base), retained(draft));
  if (
    changedOrder &&
    !equalValue(retained(base), retained(latest)) &&
    !equalValue(retained(draft), retained(latest))
  ) {
    throw new StorageConflict(path + ".순서", retained(latest), retained(draft));
  }
  const order = (changedOrder ? draft : latest).map((item) => item.id).filter((id) => result.has(id));
  const ordered = new Set(order);
  const extras = changedOrder ? latest : draft;
  for (let i = 0; i < extras.length; i++) {
    const id = extras[i].id;
    if (!result.has(id) || ordered.has(id)) continue;
    let next = i + 1;
    while (next < extras.length && !ordered.has(extras[next].id)) next++;
    const anchor = next < extras.length ? order.indexOf(extras[next].id) : order.length;
    order.splice(anchor, 0, id);
    ordered.add(id);
  }
  return order.map((id) => result.get(id)!);
}

export function reconcileChanges(base: PulseData, draft: PulseData, latest: PulseData): PulseData {
  const presets = mergeEntities(base.presets, draft.presets, latest.presets, "프리셋");
  const setlists = mergeEntities(base.setlists, draft.setlists, latest.setlists, "셋리스트");
  const settings = mergeValue(base.settings, draft.settings, latest.settings, "설정") as PulseData["settings"];
  const anchor = (data: PulseData) => {
    const nav = data.navigation;
    const list = data.setlists.find((item) => item.id === nav.activeSetlistId);
    return {
      activePresetId: nav.activePresetId,
      activeSetlistId: nav.activeSetlistId,
      itemId: list?.items[nav.activeItemIndex]?.id ?? null,
    };
  };
  let navigation = latest.navigation;
  if (base.navigation !== draft.navigation || setlists !== latest.setlists) {
    const previousNav = anchor(base);
    const requestedNav = anchor(draft);
    // Selection is UI position. Saving two distinct new songs must retain both
    // records even though each tab also selected its own newly added song.
    const justCreated =
      draft.navigation.activePresetId !== null &&
      !base.presets.some((preset) => preset.id === draft.navigation.activePresetId) &&
      draft.presets.some((preset) => preset.id === draft.navigation.activePresetId);
    const nav = justCreated
      ? requestedNav
      : (mergeValue(previousNav, requestedNav, anchor(latest), "현재 곡") as ReturnType<typeof anchor>);
    const list = setlists.find((item) => item.id === nav.activeSetlistId);
    navigation = {
      activePresetId: nav.activePresetId,
      activeSetlistId: nav.activeSetlistId,
      activeItemIndex: Math.max(0, list?.items.findIndex((item) => item.id === nav.itemId) ?? 0),
    };
  }
  return { schemaVersion: 2, settings, presets, setlists, navigation };
}
