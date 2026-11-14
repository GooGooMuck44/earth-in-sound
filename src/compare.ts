import { loadPlace, placeName, type ClimatePoint, type ClimateTrack, type Place } from "./data";

export function pairPoints(left: ClimatePoint[], right: ClimatePoint[]): ClimatePoint[] {
  const rightByKey = new Map(right.filter((point) => point.key).map((point) => [point.key!, point]));
  const leftKeys = left.map((point) => point.key).filter(Boolean) as string[];
  const rightKeys = [...rightByKey.keys()];
  if (!leftKeys.length || !rightKeys.length) return [];
  const start = [leftKeys[0], rightKeys.sort()[0]].sort()[1];
  const end = [leftKeys.at(-1)!, rightKeys.at(-1)!].sort()[0];
  return left
    .filter((point) => point.key! >= start && point.key! <= end)
    .map((point) => ({
      position: point.position,
      label: point.label,
      key: point.key,
      temperature: point.temperature,
      other: rightByKey.get(point.key!)?.temperature ?? NaN,
    }));
}

export function sharedRange(points: ClimatePoint[]): [number, number] {
  const values = points.flatMap((point) => [point.temperature, point.other ?? NaN]).filter(Number.isFinite);
  return [Math.min(...values), Math.max(...values)];
}

export async function loadComparison(first: Place, second: Place, examples: Place[]): Promise<ClimateTrack> {
  const [left, right] = await Promise.all([loadPlace(first, examples), loadPlace(second, examples)]);
  const points = pairPoints(left.points, right.points);
  if (points.length < 12) throw new Error("These places do not share enough months");
  const places: [Place, Place] = [left.place ?? first, right.place ?? second];
  const notices = [left.notice, right.notice].filter(Boolean);
  if (placeName(places[0]) === placeName(places[1])) notices.push("Both sides are the same place.");
  const status = left.meta.status === "live" && right.meta.status === "live" ? "live" : left.meta.status === "browser" || right.meta.status === "browser" ? "browser" : "saved";
  const retrieved = [left.meta.retrieved, right.meta.retrieved].filter(Boolean).sort()[0];
  return {
    kind: "compare",
    title: `${places[0].name} · ${places[1].name}`,
    source: "NASA POWER · T2M",
    points,
    places,
    notice: notices.join(" "),
    fromBackup: status !== "live",
    meta: {
      dataset: "NASA POWER monthly point data (AG community): T2M air temperature at 2 m",
      link: "https://power.larc.nasa.gov/",
      request: [left.meta.request, right.meta.request].filter(Boolean).join(" "),
      units: "°C",
      coverage: `${points[0].key} to ${points.at(-1)!.key}, months both places share`,
      retrieved,
      status,
      limit: "Both places use one shared pitch scale in °C, so higher always means warmer in either ear. Grid-cell estimates, not station readings.",
    },
  };
}
