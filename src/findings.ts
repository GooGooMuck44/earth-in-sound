import { placeName, trendPerYear, type ClimatePoint, type ClimateTrack } from "./data";
import { spotLabel } from "./scan";

export interface Finding {
  label: string;
  value: string;
}

export const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const signed = (value: number, digits = 2) =>
  (value > 0 ? "+" : value < 0 ? "−" : "±") + Math.abs(value).toFixed(digits);

const finite = (values: (number | undefined)[]) => values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const joinTies = (names: string[]) => (names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(" & "));

export function topBy<T>(items: T[], read: (item: T) => number, digits = 2): T[] {
  const usable = items.filter((item) => Number.isFinite(read(item)));
  if (!usable.length) return [];
  const best = Math.max(...usable.map((item) => Number(read(item).toFixed(digits))));
  return usable.filter((item) => Number(read(item).toFixed(digits)) === best);
}

export function monthlyMeans(points: ClimatePoint[], read: (point: ClimatePoint) => number | undefined) {
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (const point of points) {
    const month = Number(point.key?.slice(5, 7)) - 1;
    const value = read(point);
    if (month >= 0 && month < 12 && typeof value === "number" && Number.isFinite(value)) buckets[month].push(value);
  }
  return buckets.map((values, month) => ({ month, value: values.length ? mean(values) : NaN, count: values.length }));
}

function decadeTrend(points: ClimatePoint[], read: (point: ClimatePoint) => number | undefined) {
  const usable = points.filter((point) => Number.isFinite(read(point)));
  if (usable.length < 10) return NaN;
  return trendPerYear(usable.map((point) => point.position), usable.map((point) => read(point)!)) * 10;
}

function calendarPeak(points: ClimatePoint[], read: (point: ClimatePoint) => number | undefined, digits: number) {
  const months = monthlyMeans(points, read);
  if (months.some((month) => month.count === 0)) return null;
  const top = topBy(months, (month) => month.value, digits);
  return top.length ? joinTies(top.map((month) => monthNames[month.month])) : null;
}

export function findingsFor(track: ClimateTrack): Finding[] {
  const points = track.points;
  const out: Finding[] = [];
  if (!points.length) return out;
  if (track.kind === "global") {
    const warmest = topBy(points, (point) => point.temperature);
    if (warmest.length) out.push({ label: "Warmest year", value: joinTies(warmest.map((point) => point.label)) });
    const trend = decadeTrend(points, (point) => point.temperature);
    if (Number.isFinite(trend)) out.push({ label: "Trend", value: `${signed(trend)} °C per decade` });
  } else if (track.kind === "zones") {
    const zones = [
      { name: "Arctic", trend: decadeTrend(points, (point) => point.arctic) },
      { name: "Tropics", trend: decadeTrend(points, (point) => point.tropics) },
      { name: "Antarctic", trend: decadeTrend(points, (point) => point.antarctic) },
    ];
    const fastest = topBy(zones, (zone) => zone.trend);
    if (fastest.length) out.push({ label: "Fastest warming", value: `${joinTies(fastest.map((zone) => zone.name))} · ${signed(fastest[0].trend)} °C per decade` });
    const warmestArctic = topBy(points, (point) => point.arctic ?? NaN);
    if (warmestArctic.length) out.push({ label: "Warmest Arctic year", value: joinTies(warmestArctic.map((point) => point.label)) });
  } else if (track.kind === "place") {
    const rain = calendarPeak(points, (point) => point.rainfall, 1);
    if (rain) out.push({ label: "Rain peaks", value: rain });
    const warm = calendarPeak(points, (point) => point.temperature, 1);
    if (warm) out.push({ label: "Warmest month", value: warm });
    if (!out.length) {
      const hottest = topBy(points, (point) => point.temperature, 1);
      if (hottest.length) out.push({ label: "Warmest", value: joinTies(hottest.map((point) => point.label)) });
    }
  } else if (track.kind === "compare" && track.places) {
    const pairs = points.filter((point) => Number.isFinite(point.temperature) && Number.isFinite(point.other));
    if (pairs.length) {
      const gap = mean(pairs.map((point) => point.temperature - point.other!));
      const [first, second] = track.places;
      const warmer = gap >= 0 ? first : second;
      out.push({
        label: "Warmer on average",
        value: Math.abs(gap) < 0.05 ? "About the same" : `${warmer.name} · ${Math.abs(gap).toFixed(1)} °C`,
      });
      const months = monthlyMeans(pairs, (point) => Math.abs(point.temperature - point.other!));
      if (months.every((month) => month.count > 0)) {
        const top = topBy(months, (month) => month.value, 1);
        out.push({ label: "Biggest gap", value: `${joinTies(top.map((month) => monthNames[month.month]))} · ${top[0].value.toFixed(1)} °C` });
      }
    }
  } else if (track.kind === "events") {
    const busiest = topBy(points, (point) => point.temperature, 0);
    if (busiest.length && busiest[0].temperature > 0) out.push({ label: "Busiest day", value: `${joinTies(busiest.map((point) => point.label))} · ${busiest[0].temperature} events` });
    const totals = Object.entries(track.eventTotals ?? {});
    const common = topBy(totals, ([, count]) => count, 0);
    if (common.length) out.push({ label: "Most tracked", value: `${joinTies(common.map(([name]) => categoryName(name)))} · ${common[0][1].toLocaleString("en")}` });
  } else if (track.scan) {
    const scan = track.scan;
    if (scan.layer === "image") return out;
    const shown = (value: number) => `${value.toFixed(scan.digits)} ${scan.units}`;
    const [high, low] = scan.layer === "plants" ? ["Greenest", "Barest"] : ["Warmest", "Coolest"];
    if (scan.difference != null) out.push({ label: "Average change", value: `${signed(scan.difference)} ${scan.units}` });
    out.push({ label: high, value: `${shown(scan.warmest.value)} · ${spotLabel(scan.warmest)}` });
    if (scan.difference == null) out.push({ label: low, value: `${shown(scan.coolest.value)} · ${spotLabel(scan.coolest)}` });
  }
  return out.slice(0, 2);
}

const categoryNames: Record<string, string> = {
  wildfires: "Wildfires",
  severeStorms: "Storms",
  volcanoes: "Volcanoes",
  seaLakeIce: "Sea and lake ice",
  snow: "Snow",
  floods: "Floods",
  earthquakes: "Earthquakes",
  drought: "Drought",
  dustHaze: "Dust and haze",
  landslides: "Landslides",
  manmade: "Manmade",
  tempExtremes: "Temperature extremes",
  waterColor: "Water colour",
};

export const categoryName = (id: string) => categoryNames[id] ?? id;

export const sideNames = (track: ClimateTrack) => (track.places ? track.places.map(placeName) : []);
