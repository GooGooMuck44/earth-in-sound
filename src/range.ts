import type { ClimatePoint, ClimateTrack, TrackKind } from "./data";

export interface YearRange {
  from: number;
  to: number;
}

export const rangeKinds: TrackKind[] = ["global", "zones", "place", "compare"];

export const yearOf = (point: ClimatePoint) => Math.floor(point.position);

export function yearsIn(points: ClimatePoint[]): number[] {
  return [...new Set(points.map(yearOf))];
}

export function clampRange(points: ClimatePoint[], wanted: Partial<YearRange> | null): YearRange | null {
  const years = yearsIn(points);
  if (!years.length) return null;
  const first = years[0];
  const last = years.at(-1)!;
  let from = Number.isInteger(wanted?.from) ? Math.max(first, Math.min(last, wanted!.from!)) : first;
  let to = Number.isInteger(wanted?.to) ? Math.max(first, Math.min(last, wanted!.to!)) : last;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export function isFull(points: ClimatePoint[], range: YearRange | null) {
  const years = yearsIn(points);
  return !range || (range.from === years[0] && range.to === years.at(-1));
}

export function span(points: ClimatePoint[], range: YearRange | null): [number, number] {
  if (!range) return [0, points.length];
  const start = points.findIndex((point) => yearOf(point) >= range.from);
  if (start < 0) return [0, 0];
  let end = start;
  while (end < points.length && yearOf(points[end]) <= range.to) end++;
  return [start, end];
}

export function slice(track: ClimateTrack, range: YearRange | null): ClimateTrack {
  if (!rangeKinds.includes(track.kind) || !range) return track;
  const [start, end] = span(track.points, range);
  return { ...track, points: track.points.slice(start, end) };
}

export const rangeLabel = (range: YearRange) => (range.from === range.to ? String(range.from) : `${range.from}–${range.to}`);
