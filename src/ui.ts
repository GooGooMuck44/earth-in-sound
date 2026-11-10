import type { TrackKind } from "./data";

export const trackOrder: TrackKind[] = ["global", "zones", "place", "events"];

export function tabAfterKey(current: TrackKind, key: string): TrackKind | null {
  const index = trackOrder.indexOf(current);
  if (key === "Home") return trackOrder[0];
  if (key === "End") return trackOrder.at(-1)!;
  if (key === "ArrowRight") return trackOrder[(index + 1) % trackOrder.length];
  if (key === "ArrowLeft") return trackOrder[(index - 1 + trackOrder.length) % trackOrder.length];
  return null;
}
