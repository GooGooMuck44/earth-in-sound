import type { Place, TrackKind } from "./data";
import type { LeadSound } from "./sonify";

export interface Setup {
  view: TrackKind;
  city?: Place;
  city2?: Place;
  from?: number;
  to?: number;
  sound?: LeadSound;
  speed?: number;
  layer?: "air" | "sea" | "plants";
  month?: string;
  then?: boolean;
}

export const views: TrackKind[] = ["global", "zones", "place", "compare", "events", "scan"];
export const viewNames: Record<TrackKind, string> = { global: "planet", zones: "poles", place: "place", compare: "compare", events: "events", scan: "scan" };
const viewByName = Object.fromEntries(Object.entries(viewNames).map(([kind, name]) => [name, kind as TrackKind]));
export const speeds = [0.5, 1, 2, 4];
export const sounds: LeadSound[] = ["glass", "piano", "pad", "pluck"];
const layers = ["air", "sea", "plants"] as const;

export function placeToken(place: Place): string {
  if (place.slug) return place.slug;
  return `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)},${place.name}`;
}

export function readPlace(token: string | null, presets: Place[]): Place | undefined {
  if (!token) return undefined;
  const preset = presets.find((place) => place.slug === token);
  if (preset) return preset;
  const [lat, lon, ...rest] = token.split(",");
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!lat?.trim() || !lon?.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  const name = rest.join(",").replace(/[<>]/g, "").trim().slice(0, 60) || "Selected place";
  return { name, latitude, longitude };
}

const year = (text: string | null) => {
  if (!text || !/^\d{4}$/.test(text)) return undefined;
  const value = Number(text);
  return value >= 1800 && value <= 2100 ? value : undefined;
};

export function parseSetup(hash: string, presets: Place[]): Setup | null {
  const query = new URLSearchParams(hash.replace(/^#/, ""));
  if (![...query.keys()].length) return null;
  let view = viewByName[query.get("view") ?? ""] as TrackKind | undefined;
  const legacy = query.get("track");
  if (!view && legacy && views.includes(legacy as TrackKind)) view = legacy as TrackKind;
  let city = readPlace(query.get("city"), presets);
  if (!view && query.has("lat")) {
    city = readPlace(`${query.get("lat")},${query.get("lon")},${query.get("name") ?? ""}`, presets);
    const slug = query.get("slug");
    city = presets.find((place) => place.slug === slug) ?? city;
    view = city ? "place" : undefined;
  }
  if (!view) return null;
  const setup: Setup = { view };
  if (city) setup.city = city;
  const city2 = readPlace(query.get("city2"), presets);
  if (city2) setup.city2 = city2;
  const from = year(query.get("from"));
  const to = year(query.get("to"));
  if (from != null && to != null) {
    setup.from = Math.min(from, to);
    setup.to = Math.max(from, to);
  }
  const sound = query.get("sound") as LeadSound;
  if (sounds.includes(sound)) setup.sound = sound;
  const speed = Number(query.get("speed"));
  if (speeds.includes(speed)) setup.speed = speed;
  const layer = query.get("layer");
  if ((layers as readonly string[]).includes(layer ?? "")) setup.layer = layer as Setup["layer"];
  const month = query.get("month");
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) setup.month = month;
  if (query.get("then") === "1") setup.then = true;
  return setup;
}

export function buildSetup(setup: Setup): string {
  const query = new URLSearchParams({ view: viewNames[setup.view] });
  if ((setup.view === "place" || setup.view === "compare") && setup.city) query.set("city", placeToken(setup.city));
  if (setup.view === "compare" && setup.city2) query.set("city2", placeToken(setup.city2));
  if (setup.from != null && setup.to != null) {
    query.set("from", String(setup.from));
    query.set("to", String(setup.to));
  }
  if (setup.view === "scan" && setup.layer) {
    query.set("layer", setup.layer);
    if (setup.month) query.set("month", setup.month);
    if (setup.then && setup.layer === "air") query.set("then", "1");
  }
  if (setup.sound && setup.sound !== "glass") query.set("sound", setup.sound);
  if (setup.speed && setup.speed !== 1) query.set("speed", String(setup.speed));
  return `#${query}`;
}

export const sharesLocation = (setup: Setup) =>
  [setup.city, setup.city2].some((place) => place && !place.slug && place.name === "My location");
