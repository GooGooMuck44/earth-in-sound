import type { ClimatePoint, ClimateTrack } from "./data";
import { categoryName } from "./findings";
import { bandSets } from "./bands";

const cell = (value: unknown) => {
  if (value == null || (typeof value === "number" && !Number.isFinite(value))) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const slug = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function bandHeader(names?: string[]) {
  const set = Object.values(bandSets).find((item) => item.names.join() === (names ?? bandSets.poles.names).join()) ?? bandSets.poles;
  return set.names.map((name, index) => (set === bandSets.poles ? `${slug(name)}_${slug(set.columns[index])}_c` : `band_${slug(set.columns[index])}_c`));
}

export function table(track: ClimateTrack): { header: string[]; rows: unknown[][] } {
  const points = track.points;
  const pick = (read: (point: ClimatePoint) => unknown[]) => points.map(read);
  switch (track.kind) {
    case "global":
      return { header: ["year", "anomaly_c_vs_1951_1980"], rows: pick((point) => [point.key, point.temperature]) };
    case "zones":
      return {
        header: ["year", "global_c_vs_1951_1980", ...bandHeader(track.bands)],
        rows: pick((point) => [point.key, point.temperature, point.arctic, point.tropics, point.antarctic]),
      };
    case "place":
      return {
        header: ["month", "t2m_c", "prectotcorr_mm_per_day", "allsky_sfc_sw_dwn_mj_per_m2_per_day"],
        rows: pick((point) => [point.key, point.temperature, point.rainfall, point.sunshine]),
      };
    case "compare": {
      const [first, second] = track.places!.map((place) => slug(place.name));
      return { header: ["month", `${first}_t2m_c`, `${second}_t2m_c`], rows: pick((point) => [point.key, point.temperature, point.other]) };
    }
    case "events": {
      const categories = Object.keys(track.eventTotals ?? {}).sort();
      return {
        header: ["date", "tracked_events", ...categories.map((name) => `${slug(categoryName(name))}_events`)],
        rows: pick((point) => [
          point.key,
          point.temperature,
          ...categories.map((name) => point.happenings?.find((group) => group.category === name)?.count ?? 0),
        ]),
      };
    }
    case "scan": {
      const scan = track.scan!;
      const unit = scan.layer === "image" ? "colour_index_0_100" : slug(scan.units);
      const bands = (points[0]?.bands ?? []).map((_, band) => `band_${band + 1}_${unit}`);
      return {
        header: ["column", scan.layer === "image" ? "position" : "longitude_centre", `column_mean_${unit}`, ...bands],
        rows: pick((point) => [
          point.label,
          scan.layer === "image" ? point.label : point.longitude?.toFixed(1),
          point.temperature,
          ...(point.bands ?? []).map((value) => (Number.isFinite(value) ? Number(value.toFixed(3)) : NaN)),
        ]),
      };
    }
  }
}

export function toCsv(track: ClimateTrack): string {
  const { header, rows } = table(track);
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\n") + "\n";
}

export function notes(track: ClimateTrack, rangeText: string): string {
  const meta = track.meta;
  const lines = [
    `Earth in Sound export: ${track.title}`,
    `Dataset: ${meta.dataset}`,
    `Source: ${meta.link}`,
    meta.request ? `Request: ${meta.request}` : "",
    `Units: ${meta.units}`,
    meta.baseline ? `Baseline: ${meta.baseline}` : "",
    `Coverage: ${meta.coverage}`,
    rangeText ? `Selected range: ${rangeText}` : "",
    `Retrieved: ${meta.retrieved ?? "unknown"}`,
    `Status: ${meta.status === "live" ? "live" : "saved copy"}`,
    `Limits: ${meta.limit}`,
    "Empty cells are missing values, not zero.",
    track.kind === "scan" && track.scan?.layer !== "image" ? "Scan values are reconstructed from rendered GIBS map colours using the layer colormap, so they are approximate." : "",
    track.scan?.layer === "image" ? "Image values are colour and brightness, not Earth measurements." : "",
  ];
  return lines.filter(Boolean).join("\n") + "\n";
}

export const fileStem = (track: ClimateTrack) => `earth-in-sound-${slug(track.title) || track.kind}`;
